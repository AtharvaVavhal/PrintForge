import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as Sentry from '@sentry/node';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/database/prisma.service';
import { NormalizedBillingEvent } from './billing-provider.interface';
import { SubscriptionService } from './subscription.service';

const BATCH_SIZE = 20;

/**
 * Bounded retry budget for a billing webhook event that keeps failing to
 * process — the exact structural precedent as
 * `payments/webhooks/webhook-processor.service.ts`'s own `MAX_ATTEMPTS`/
 * `BACKOFF_MS` (see that file's own comment): a small number of attempts
 * with an increasing delay, then a terminal FAILED (dead-letter) state
 * plus a Sentry error for a human.
 */
const MAX_ATTEMPTS = 6;
/** Indexed by (attempts - 1), clamped to the last entry: 30s, 2m, 10m, 30m, 1h, 2h. */
const BACKOFF_MS = [30_000, 120_000, 600_000, 1_800_000, 3_600_000, 7_200_000];

interface LockedBillingWebhookRow {
  id: string;
  payload: unknown;
  attempts: number;
  createdAt: Date;
}

/**
 * Minimal, vendor-neutral fields this processor expects
 * `NormalizedBillingEvent.payload` to carry — NOT a vendor payload schema
 * (production billing provider selection, P7-D1 Part G, remains OPEN).
 * This is this processor's OWN required normalized envelope, exactly like
 * `BillingProviderSubscription` is a normalized shape independent of any
 * vendor's actual field names. A real `BillingProvider` adapter's
 * `parseWebhook()` is responsible for translating whatever vendor-specific
 * fields carry this information into this shape;
 * `FakeBillingProvider.buildWebhookEventBody()` does the same for
 * synthetic tests. All fields are optional and read defensively —
 * `extractEnvelope` below never throws on a missing/malformed field.
 */
interface BillingWebhookEnvelope {
  providerSubscriptionId?: string;
  providerCustomerId?: string;
  /** ISO-8601. Falls back to `BillingWebhookEvent.createdAt` (ingestion
   * time) when absent — P7-D3 Part F: "compare provider event timestamp,
   * falling back to receivedAt, against Subscription.updatedAt". */
  occurredAt?: string;
}

function extractEnvelope(payload: unknown): BillingWebhookEnvelope {
  if (!payload || typeof payload !== 'object') {
    return {};
  }
  const obj = payload as Record<string, unknown>;
  return {
    providerSubscriptionId:
      typeof obj.providerSubscriptionId === 'string'
        ? obj.providerSubscriptionId
        : undefined,
    providerCustomerId:
      typeof obj.providerCustomerId === 'string'
        ? obj.providerCustomerId
        : undefined,
    occurredAt: typeof obj.occurredAt === 'string' ? obj.occurredAt : undefined,
  };
}

/**
 * Phase 7 — D7 SaaS Billing Webhooks wave (docs/saas/DECISIONS.md P7-D3).
 * Phase 2 (processing) of the two-phase design —
 * `BillingWebhookIngestionService` (Phase 1, called from
 * `BillingWebhooksController`) verifies the signature and persists the raw
 * normalized event to `billing_webhook_events` for a fast ack; this poller
 * runs Phase 2, transactionally, with a bounded backed-off retry. Mirrors
 * `payments/webhooks/webhook-processor.service.ts`'s structural pattern
 * exactly (bounded batches, due-row selection, `FOR UPDATE` row locking,
 * per-row failure isolation, retry backoff, dead-letter, Sentry + Logger)
 * WITHOUT coupling to `PaymentsService`/Razorpay types — this class
 * imports nothing from `payments/`.
 *
 * Never calls `SubscriptionOrchestrationService` (that class exists for
 * TENANT-initiated requests only) and never writes `SubscriptionEvent`
 * directly (only `SubscriptionService` may) — the sole entry point into
 * subscription state is `SubscriptionService.applyBillingWebhookEvent()`,
 * called only after this processor's own tenant-resolution (P7-D3 Part B)
 * and stale/out-of-order (P7-D3 Part F) checks have both passed.
 *
 * `billing_webhook_events.status`: RECEIVED / PROCESSED (both a
 * successfully-considered event, whether or not it actually changed
 * state) / PROCESSING_FAILED (retry-eligible) / IGNORED (correctly does
 * not apply — no matching local subscription, or stale) / FAILED
 * (terminal dead-letter). Unique `providerEventId` (enforced by the
 * ingestion insert's `ON CONFLICT DO NOTHING`) enforces idempotency at the
 * row level; re-locking `FOR UPDATE` inside this poller's own transaction
 * additionally guards against double-processing the SAME already-inserted
 * row if two ticks overlap.
 */
@Injectable()
export class BillingWebhookProcessor {
  private readonly logger = new Logger(BillingWebhookProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptionService: SubscriptionService,
  ) {}

  @Cron(CronExpression.EVERY_30_SECONDS)
  async processReceivedBillingWebhooks(): Promise<void> {
    try {
      const due = await this.prisma.billingWebhookEvent.findMany({
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
    } catch (err) {
      this.logger.error(
        `BillingWebhookProcessor batch query failed: ${err instanceof Error ? err.message : String(err)}`,
        err instanceof Error ? err.stack : undefined,
      );
      Sentry.captureException(err, {
        level: 'error',
        tags: { area: 'billing_webhook_processor_batch' },
      });
    }
  }

  private async processOne(id: string): Promise<void> {
    let attempts = 0;
    try {
      await this.prisma.$transaction(async (tx) => {
        // Re-select FOR UPDATE inside the transaction — guards against
        // double-processing if a slow tick overlaps the next one (same
        // precedent as WebhookProcessor.processOne).
        const rows = await tx.$queryRaw<LockedBillingWebhookRow[]>`
          SELECT id, payload, attempts, "createdAt" FROM billing_webhook_events
          WHERE id = ${id} AND status IN ('RECEIVED', 'PROCESSING_FAILED')
          FOR UPDATE
        `;
        const locked = rows[0];
        if (!locked) {
          return; // already handled by an overlapping tick — no-op
        }
        attempts = locked.attempts;

        const normalized = locked.payload as NormalizedBillingEvent;
        const envelope = extractEnvelope(normalized.payload);

        // ─── Tenant/subscription resolution (P7-D3 Part B) ─────────────
        // Never accepts or trusts a tenantId from the payload — resolved
        // exclusively via Subscription's own unique provider-id columns.
        let subscription = envelope.providerSubscriptionId
          ? await this.subscriptionService.findSubscriptionByProviderSubscriptionId(
              tx,
              envelope.providerSubscriptionId,
            )
          : null;
        if (!subscription && envelope.providerCustomerId) {
          subscription =
            await this.subscriptionService.findSubscriptionByProviderCustomerId(
              tx,
              envelope.providerCustomerId,
            );
        }

        if (!subscription) {
          await tx.billingWebhookEvent.update({
            where: { id: locked.id },
            data: {
              status: 'IGNORED',
              lastError:
                'no matching local subscription for providerSubscriptionId/providerCustomerId',
              processedAt: new Date(),
            },
          });
          return;
        }

        // ─── Stale/out-of-order guard (P7-D3 Part F) ────────────────────
        // Compare the event's own timestamp — falling back to this row's
        // ingestion time (`createdAt`, i.e. "receivedAt") when the event
        // carries none — against Subscription.updatedAt. An event no
        // newer than the subscription's own last-known state is discarded
        // as stale; state is never regressed.
        const eventTimestamp = envelope.occurredAt
          ? new Date(envelope.occurredAt)
          : locked.createdAt;
        const subscriptionUpdatedAt = subscription.updatedAt ?? new Date(0);
        if (eventTimestamp.getTime() <= subscriptionUpdatedAt.getTime()) {
          await tx.billingWebhookEvent.update({
            where: { id: locked.id },
            data: {
              status: 'IGNORED',
              lastError:
                'stale: event timestamp not newer than current subscription state',
              processedAt: new Date(),
            },
          });
          return;
        }

        // ─── Apply (P7-D3: webhooks are authoritative once implemented) ─
        await this.subscriptionService.applyBillingWebhookEvent(
          tx,
          subscription,
          normalized,
        );

        await tx.billingWebhookEvent.update({
          where: { id: locked.id },
          data: { status: 'PROCESSED', processedAt: new Date() },
        });
      });
    } catch (err) {
      if (err instanceof ConflictException) {
        // The state machine says this transition is fundamentally not
        // allowed from the subscription's CURRENT state (same treatment
        // WebhookProcessor gives a PaymentMismatchError) — reprocessing
        // will never succeed. Dead-letter immediately, do not retry.
        const reason = err.message;
        this.logger.error(
          `BillingWebhookEvent ${id}: ${reason} — non-retryable, dead-lettering`,
        );
        Sentry.captureException(err, {
          level: 'error',
          tags: { area: 'billing_webhook_non_retryable' },
          extra: { billingWebhookEventId: id, attempt: attempts + 1 },
        });
        await this.safeUpdate(id, {
          status: 'FAILED',
          attempts: attempts + 1,
          lastError: reason,
          processedAt: new Date(),
        });
        return;
      }

      const nextAttempts = attempts + 1;
      const reason = err instanceof Error ? err.message : String(err);

      if (nextAttempts >= MAX_ATTEMPTS) {
        this.logger.error(
          `BillingWebhookEvent ${id} permanently failed after ${nextAttempts} attempts: ${reason}`,
          err instanceof Error ? err.stack : undefined,
        );
        Sentry.captureException(
          err instanceof Error ? err : new Error(reason),
          {
            level: 'error',
            tags: { area: 'billing_webhook_permanent_failure' },
            extra: { billingWebhookEventId: id, attempt: nextAttempts },
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
        `BillingWebhookEvent ${id} processing failed (attempt ${nextAttempts}/${MAX_ATTEMPTS}), retrying in ${delay / 1000}s: ${reason}`,
      );
      Sentry.captureException(err instanceof Error ? err : new Error(reason), {
        level: 'warning',
        tags: { area: 'billing_webhook_retry' },
        extra: { billingWebhookEventId: id, attempt: nextAttempts },
      });
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
    data: Prisma.BillingWebhookEventUpdateInput,
  ): Promise<void> {
    await this.prisma.billingWebhookEvent
      .update({ where: { id }, data })
      .catch((updateErr: unknown) => {
        this.logger.error(
          `Failed to update billing webhook event ${id} status`,
          updateErr instanceof Error ? updateErr.stack : updateErr,
        );
      });
  }
}
