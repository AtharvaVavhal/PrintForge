import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../common/database/prisma.service';
import { PaymentsService, RazorpayWebhookPayload } from '../payments.service';

const BATCH_SIZE = 20;

interface LockedWebhookRow {
  id: string;
  payload: unknown;
}

/**
 * Two-phase webhook processing (§12): Phase 1 (controller) verifies the
 * signature and persists the raw event to webhook_events for a fast ack.
 * This poller runs Phase 2 — transactional processing with poller-driven
 * retry on failure. webhook_events.status: RECEIVED / PROCESSED /
 * PROCESSING_FAILED / IGNORED. Unique event ID enforces idempotency.
 *
 * Never processes inline in the request handler (§12.3) — the 4-value
 * status enum (vs. just RECEIVED/PROCESSED) only makes sense for async,
 * poller-scanned processing.
 */
@Injectable()
export class WebhookProcessor {
  private readonly logger = new Logger(WebhookProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentsService: PaymentsService,
  ) {}

  @Cron(CronExpression.EVERY_30_SECONDS)
  async processReceivedWebhooks(): Promise<void> {
    const due = await this.prisma.webhookEvent.findMany({
      where: { status: { in: ['RECEIVED', 'PROCESSING_FAILED'] } },
      orderBy: { createdAt: 'asc' },
      take: BATCH_SIZE,
      select: { id: true },
    });
    for (const row of due) {
      await this.processOne(row.id);
    }
  }

  private async processOne(id: string): Promise<void> {
    try {
      await this.prisma.$transaction(async (tx) => {
        // Re-select FOR UPDATE inside the transaction (§12.3) — guards
        // against double-processing if a slow tick overlaps the next one.
        const rows = await tx.$queryRaw<LockedWebhookRow[]>`
          SELECT id, payload FROM webhook_events
          WHERE id = ${id} AND status IN ('RECEIVED', 'PROCESSING_FAILED')
          FOR UPDATE
        `;
        const locked = rows[0];
        if (!locked) {
          return; // already processed by an overlapping tick — no-op
        }

        const outcome = await this.paymentsService.applyWebhookEvent(
          tx,
          locked.payload as RazorpayWebhookPayload,
        );

        await tx.webhookEvent.update({
          where: { id: locked.id },
          data: { status: outcome },
        });
      });
    } catch (err) {
      if (this.paymentsService.isUniqueConstraintViolation(err)) {
        // The partial unique index (≤1 CAPTURED attempt per order) rolled
        // this transaction back — a concurrent verify/webhook already
        // captured a different attempt for the same order. Prisma
        // guarantees the rollback, so this outside-the-transaction update
        // is safe. This is the event correctly accounted for, not a
        // failure — mark PROCESSED, not PROCESSING_FAILED.
        this.logger.log(
          `Webhook event ${id}: race with a concurrent capture — marking PROCESSED as a no-op`,
        );
        await this.prisma.webhookEvent
          .update({ where: { id }, data: { status: 'PROCESSED' } })
          .catch((updateErr: unknown) => {
            this.logger.error(
              `Failed to mark webhook event ${id} as PROCESSED`,
              updateErr,
            );
          });
        return;
      }

      this.logger.error(
        `Webhook event ${id} processing failed`,
        err instanceof Error ? err.stack : err,
      );
      await this.prisma.webhookEvent
        .update({ where: { id }, data: { status: 'PROCESSING_FAILED' } })
        .catch((updateErr: unknown) => {
          this.logger.error(
            `Failed to mark webhook event ${id} as PROCESSING_FAILED`,
            updateErr,
          );
        });
    }
  }
}
