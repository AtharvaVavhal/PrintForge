import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OutboxEventType } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { EmailService } from '../email/email.service';
import { buildEmailContent } from '../templates/outbox-email.templates';

const BATCH_SIZE = 20;
const MAX_ATTEMPTS = 5;
/** §12.2: "~1min/5min/30min/2h, capped." Indexed by (attempts - 1), clamped to the last entry. */
const BACKOFF_MS = [60_000, 300_000, 1_800_000, 7_200_000];

interface ClaimedOutboxRow {
  id: string;
  eventType: OutboxEventType;
  payload: unknown;
  attempts: number;
}

/**
 * Independent @nestjs/schedule poller — the ONLY writer that processes
 * outbox_events. Its only writes are to outbox_events itself; email
 * failure is architecturally incapable of reverting order/payment state
 * (§17). The event row is always written inside the same transaction as
 * the state change it announces (auth/, checkout/, orders/) — this poller
 * only ever reads PENDING rows and dispatches, never decides business
 * state.
 */
@Injectable()
export class OutboxPoller {
  private readonly logger = new Logger(OutboxPoller.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
  ) {}

  @Cron(CronExpression.EVERY_30_SECONDS)
  async processPendingEvents(): Promise<void> {
    const due = await this.prisma.outboxEvent.findMany({
      where: { status: 'PENDING', availableAt: { lte: new Date() } },
      orderBy: { availableAt: 'asc' },
      take: BATCH_SIZE,
      select: { id: true },
    });
    for (const row of due) {
      await this.processOne(row.id);
    }
  }

  private async processOne(id: string): Promise<void> {
    const claimed = await this.claim(id);
    if (!claimed) {
      return; // already claimed by an overlapping tick, or no longer PENDING
    }

    try {
      const emailContent = buildEmailContent(
        claimed.eventType,
        claimed.payload as Record<string, unknown>,
      );
      if (!emailContent) {
        // Unknown/unsupported event type — nothing to send; not an error.
        await this.markSent(claimed.id);
        return;
      }

      const recipient = await this.resolveRecipientEmail(
        claimed.payload as Record<string, unknown>,
      );
      if (!recipient) {
        this.logger.warn(
          `Outbox event ${claimed.id} (${claimed.eventType}): could not resolve a recipient email — marking FAILED, not retrying`,
        );
        await this.prisma.outboxEvent.update({
          where: { id: claimed.id },
          data: {
            status: 'FAILED',
            lastError: 'No recipient email in payload and no matching user',
            processedAt: new Date(),
          },
        });
        return;
      }

      await this.emailService.send({
        to: recipient,
        subject: emailContent.subject,
        html: emailContent.html,
      });
      await this.markSent(claimed.id);
    } catch (err) {
      await this.markFailedOrRetry(claimed, err);
    }
  }

  /** FOR UPDATE SKIP LOCKED claim, mirroring WebhookProcessor's pattern (§12.3). */
  private async claim(id: string): Promise<ClaimedOutboxRow | null> {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<ClaimedOutboxRow[]>`
        SELECT id, "eventType", payload, attempts FROM outbox_events
        WHERE id = ${id} AND status = 'PENDING'
        FOR UPDATE SKIP LOCKED
      `;
      const row = rows[0];
      if (!row) {
        return null;
      }
      await tx.outboxEvent.update({
        where: { id: row.id },
        data: { status: 'PROCESSING' },
      });
      return row;
    });
  }

  private async markSent(id: string): Promise<void> {
    await this.prisma.outboxEvent.update({
      where: { id },
      data: { status: 'SENT', processedAt: new Date() },
    });
  }

  private async markFailedOrRetry(
    claimed: ClaimedOutboxRow,
    err: unknown,
  ): Promise<void> {
    const attempts = claimed.attempts + 1;
    const lastError = err instanceof Error ? err.message : String(err);

    if (attempts >= MAX_ATTEMPTS) {
      // Terminal — never retried indefinitely; surfaced via logs for
      // manual follow-up (§12.2: "surfaced via Sentry/admin").
      this.logger.error(
        `Outbox event ${claimed.id} (${claimed.eventType}) failed permanently after ${attempts} attempts: ${lastError}`,
      );
      await this.prisma.outboxEvent.update({
        where: { id: claimed.id },
        data: {
          status: 'FAILED',
          attempts,
          lastError,
          processedAt: new Date(),
        },
      });
      return;
    }

    const delay = BACKOFF_MS[Math.min(attempts - 1, BACKOFF_MS.length - 1)];
    await this.prisma.outboxEvent.update({
      where: { id: claimed.id },
      data: {
        status: 'PENDING',
        attempts,
        lastError,
        availableAt: new Date(Date.now() + delay),
      },
    });
  }

  /**
   * Prefers `payload.email` (denormalized at insert time, §12.2 — "the
   * processor never re-queries business tables"). Falls back to a
   * `userId` lookup for the Phase 6 events that predate this convention
   * (ORDER_PAID/ORDER_STATUS_CHANGED payloads inserted before Phase 7
   * only carried `userId`) — every event this phase inserts carries
   * `email` directly and never hits the fallback.
   */
  private async resolveRecipientEmail(
    payload: Record<string, unknown>,
  ): Promise<string | null> {
    if (typeof payload.email === 'string' && payload.email.length > 0) {
      return payload.email;
    }
    if (typeof payload.userId === 'string' && payload.userId.length > 0) {
      const user = await this.prisma.user.findUnique({
        where: { id: payload.userId },
        select: { email: true },
      });
      return user?.email ?? null;
    }
    return null;
  }
}
