import { randomUUID } from 'crypto';
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../common/database/prisma.service';
import { BILLING_PROVIDER } from './billing-provider.token';
import type {
  BillingProvider,
  NormalizedBillingEvent,
} from './billing-provider.interface';

/**
 * Phase 7 — D7 SaaS Billing Webhooks wave (docs/saas/DECISIONS.md P7-D3
 * Part B). Phase 1 (ingestion) ONLY: verify signature, parse via the
 * injected `BillingProvider`, persist the normalized event, done. Actual
 * subscription-state processing is Phase 2, run only by
 * `BillingWebhookProcessor`'s poller — never inline here, mirroring
 * `PaymentsService.receiveWebhook()`'s own "Phase 1 (controller calls
 * this) / Phase 2 (poller only)" split exactly.
 *
 * Deliberately provider-independent: this class calls
 * `BillingProvider.verifyWebhook`/`parseWebhook` polymorphically —
 * `FakeBillingProvider` today, a real vendor adapter later (production
 * billing provider selection, P7-D1 Part G, remains OPEN) — without this
 * file ever needing to change.
 *
 * `billing_webhook_events` carries no `tenantId` column (P7-D3 Part B —
 * platform-scoped storage) — this service never resolves, accepts, or
 * writes one; tenant resolution happens only later, in
 * `BillingWebhookProcessor`, via `Subscription.providerSubscriptionId`/
 * `providerCustomerId`.
 */
@Injectable()
export class BillingWebhookIngestionService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(BILLING_PROVIDER) private readonly billingProvider: BillingProvider,
  ) {}

  /**
   * `headerEventId` (docs/saas/DECISIONS.md P7-D5 Part E) — optional,
   * passed straight through to `BillingProvider.parseWebhook()`; this
   * service never reads or interprets it itself. Mirrors
   * `PaymentsService.receiveWebhook()`'s own header-then-body split for
   * the merchant commerce webhook exactly.
   */
  async receiveWebhook(
    rawBody: Buffer,
    signature: string,
    headerEventId?: string,
  ): Promise<void> {
    if (!this.billingProvider.verifyWebhook(rawBody, signature)) {
      // Invalid signature -> no DB write at all (same discipline as
      // payments.service.ts's own receiveWebhook()).
      throw new BadRequestException('Invalid billing webhook signature');
    }

    let event: NormalizedBillingEvent;
    try {
      event = this.billingProvider.parseWebhook(rawBody, headerEventId);
    } catch {
      throw new BadRequestException('Malformed billing webhook payload');
    }

    if (
      !event ||
      typeof event.providerEventId !== 'string' ||
      !event.providerEventId
    ) {
      throw new BadRequestException(
        'Billing webhook event missing providerEventId',
      );
    }

    // Database-level dedup via ON CONFLICT DO NOTHING — race-safe at
    // insert time, never a read-then-insert check. Timestamps use
    // `now() AT TIME ZONE 'UTC'`, the same reasoning as
    // payments.service.ts's own webhook_events insert: keeps the stored
    // wall clock consistent with every Prisma `@default(now())` write, so
    // BillingWebhookProcessor's `availableAt <= new Date()` comparison
    // never skews against the DB session timezone.
    await this.prisma.$queryRaw`
      INSERT INTO billing_webhook_events (id, "providerEventId", payload, status, attempts, "availableAt", "createdAt", "updatedAt")
      VALUES (
        ${randomUUID()},
        ${event.providerEventId},
        ${JSON.stringify(event)}::jsonb,
        'RECEIVED',
        0,
        (now() AT TIME ZONE 'UTC'),
        (now() AT TIME ZONE 'UTC'),
        (now() AT TIME ZONE 'UTC')
      )
      ON CONFLICT ("providerEventId") DO NOTHING
    `;
  }
}
