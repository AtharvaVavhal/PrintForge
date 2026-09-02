import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as Sentry from '@sentry/node';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { PaymentsService, RazorpayWebhookPayload } from '../payments.service';
import { PaymentMismatchError } from '../payment-mismatch.error';

const BATCH_SIZE = 20;

/**
 * Bounded retry budget for a webhook event that keeps failing to process
 * (Phase 13.3 §3). Mirrors OutboxPoller's policy: a small number of
 * attempts with an increasing delay, then a terminal FAILED (dead-letter)
 * state + a Sentry error for a human. Razorpay itself keeps re-delivering
 * an unacked event for ~24h, so a transient outage still has other
 * chances; this budget only stops US from re-processing a stored event
 * forever every 30s.
 */
const MAX_ATTEMPTS = 6;
/** Indexed by (attempts - 1), clamped to the last entry: 30s, 2m, 10m, 30m, 1h, 2h. */
const BACKOFF_MS = [30_000, 120_000, 600_000, 1_800_000, 3_600_000, 7_200_000];

interface LockedWebhookRow {
  id: string;
  payload: unknown;
  attempts: number;
}

/**
 * Two-phase webhook processing (§12): Phase 1 (controller) verifies the
 * signature and persists the raw event to webhook_events for a fast ack.
 * This poller runs Phase 2 — transactional processing with a bounded,
 * backed-off retry (Phase 13.3). webhook_events.status: RECEIVED /
 * PROCESSED / IGNORED (both terminal-success), PROCESSING_FAILED
 * (retry-eligible, `availableAt` gates the next attempt), FAILED
 * (terminal dead-letter). Unique event id enforces idempotency.
 *
 * Never processes inline in the request handler (§12.3).
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
      where: {
        status: { in: ['RECEIVED', 'PROCESSING_FAILED'] },
        availableAt: { lte: new Date() },
      },
      orderBy: { availableAt: 'asc' },
      take: BATCH_SIZE,
      select: { id: true },
    });
    for (const row of due) {
      await this.processOne(row.id);
    }
  }

  private async processOne(id: string): Promise<void> {
    let attempts = 0;
    let payloadForContext: RazorpayWebhookPayload | undefined;
    try {
      await this.prisma.$transaction(async (tx) => {
        // Re-select FOR UPDATE inside the transaction (§12.3) — guards
        // against double-processing if a slow tick overlaps the next one.
        const rows = await tx.$queryRaw<LockedWebhookRow[]>`
          SELECT id, payload, attempts FROM webhook_events
          WHERE id = ${id} AND status IN ('RECEIVED', 'PROCESSING_FAILED')
          FOR UPDATE
        `;
        const locked = rows[0];
        if (!locked) {
          return; // already processed by an overlapping tick — no-op
        }
        attempts = locked.attempts;
        payloadForContext = locked.payload as RazorpayWebhookPayload;

        const outcome = await this.paymentsService.applyWebhookEvent(
          tx,
          locked.payload as RazorpayWebhookPayload,
        );

        await tx.webhookEvent.update({
          where: { id: locked.id },
          data: { status: outcome, processedAt: new Date() },
        });
      });
    } catch (err) {
      if (this.paymentsService.isUniqueConstraintViolation(err)) {
        // The partial unique index (≤1 CAPTURED attempt per order) rolled
        // this transaction back — a concurrent verify/webhook/
        // reconciliation already captured a different attempt for the
        // same order. This is the event correctly accounted for, not a
        // failure — mark PROCESSED.
        this.logger.log(
          `Webhook event ${id}: race with a concurrent capture — marking PROCESSED as a no-op`,
        );
        await this.safeUpdate(id, {
          status: 'PROCESSED',
          processedAt: new Date(),
        });
        return;
      }

      if (err instanceof PaymentMismatchError) {
        // Non-retryable: the stored payload will never match this order,
        // so re-processing it is pointless. Dead-letter immediately and
        // raise a Sentry error — the order was NOT marked PAID.
        this.logger.error(
          `Webhook event ${id}: ${err.message} — non-retryable, dead-lettering`,
        );
        Sentry.captureException(err, {
          level: 'error',
          tags: { area: 'webhook_payment_mismatch', reason: err.reason },
          extra: this.safeContext(id, payloadForContext, attempts + 1),
        });
        await this.safeUpdate(id, {
          status: 'FAILED',
          attempts: attempts + 1,
          lastError: err.message,
          processedAt: new Date(),
        });
        return;
      }

      const nextAttempts = attempts + 1;
      const reason = err instanceof Error ? err.message : String(err);

      if (nextAttempts >= MAX_ATTEMPTS) {
        this.logger.error(
          `Webhook event ${id} permanently failed after ${nextAttempts} attempts: ${reason}`,
          err instanceof Error ? err.stack : undefined,
        );
        Sentry.captureException(
          err instanceof Error ? err : new Error(reason),
          {
            level: 'error',
            tags: { area: 'webhook_processing_permanent_failure' },
            extra: this.safeContext(id, payloadForContext, nextAttempts),
          },
        );
        await this.safeUpdate(id, {
          status: 'FAILED',
          attempts: nextAttempts,
          lastError: reason,
          processedAt: new Date(),
        });
        return;
      }

      const delay =
        BACKOFF_MS[Math.min(nextAttempts - 1, BACKOFF_MS.length - 1)];
      this.logger.warn(
        `Webhook event ${id} processing failed (attempt ${nextAttempts}/${MAX_ATTEMPTS}), retrying in ${delay / 1000}s: ${reason}`,
      );
      await this.safeUpdate(id, {
        status: 'PROCESSING_FAILED',
        attempts: nextAttempts,
        lastError: reason,
        availableAt: new Date(Date.now() + delay),
      });
    }
  }

  private async safeUpdate(
    id: string,
    data: Prisma.WebhookEventUpdateInput,
  ): Promise<void> {
    await this.prisma.webhookEvent
      .update({ where: { id }, data })
      .catch((updateErr: unknown) => {
        this.logger.error(
          `Failed to update webhook event ${id} status`,
          updateErr instanceof Error ? updateErr.stack : updateErr,
        );
      });
  }

  /** Non-secret context for logs/Sentry — ids and counts only, never the
   * raw signed body, secrets, or headers. */
  private safeContext(
    webhookEventId: string,
    payload: RazorpayWebhookPayload | undefined,
    attempt: number,
  ): Record<string, string | number> {
    const entity = payload?.payload?.payment?.entity;
    return {
      webhookEventId,
      event: payload?.event ?? 'unknown',
      razorpayOrderId: entity?.order_id ?? '',
      razorpayPaymentId: entity?.id ?? '',
      attempt,
    };
  }
}
