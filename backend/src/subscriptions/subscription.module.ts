import { Module } from '@nestjs/common';
import { IdempotencyModule } from '../checkout/idempotency/idempotency.module';
import { SubscriptionService } from './subscription.service';
import { SubscriptionOrchestrationService } from './subscription-orchestration.service';
import { SubscriptionSchedulerService } from './subscription-scheduler.service';
import { BillingWebhookIngestionService } from './billing-webhook-ingestion.service';
import { BillingWebhookProcessor } from './billing-webhook-processor.service';
import { BillingWebhooksController } from './billing-webhooks.controller';
import { BILLING_PROVIDER } from './billing-provider.token';
import { RazorpayBillingProvider } from './razorpay-billing-provider';

/**
 * Phase 7 Stage 1 (docs/saas/DECISIONS.md P7-D1) — the subscription
 * state-machine module, exporting `SubscriptionService`.
 *
 * Phase 7 Stage 2 (P7-D2 Parts F/G) additions:
 *
 *   - `SubscriptionOrchestrationService`, coordinating tenant requests ->
 *     `BillingProvider` -> confirmed provider result -> `SubscriptionService`
 *     (see that class's own header comment) — exported for `AdminModule`
 *     to consume, the same "export for a later wave to import" precedent
 *     this module already established for `SubscriptionService` itself.
 *
 *   - **The `BILLING_PROVIDER` DI binding — THE single, obvious
 *     replacement point (P7-D2 Part G).** `useClass: FakeBillingProvider`
 *     was the ONLY line in the entire codebase that named a concrete
 *     `BillingProvider` implementation, until docs/saas/DECISIONS.md
 *     P7-D4 ratified Razorpay Subscriptions as the production SaaS
 *     billing provider and P7-D5 ratified its cancellation/webhook
 *     adapter behavior — `RazorpayBillingProvider` is that real adapter.
 *     Exactly as this comment always anticipated: nothing that injects
 *     `BILLING_PROVIDER` (`SubscriptionOrchestrationService`,
 *     `BillingWebhookIngestionService`, `BillingWebhookProcessor`) needed
 *     to change at all — only this one `useClass` value did. Every
 *     existing e2e suite continues running against `FakeBillingProvider`
 *     regardless, via `test/e2e/support/test-app.ts`'s own
 *     `.overrideProvider(BILLING_PROVIDER)` (the same mechanism already
 *     established there for `CloudinaryService`) — see that file's own
 *     comment for why.
 *
 *   - `IdempotencyModule` import — `SubscriptionOrchestrationService`'s
 *     HTTP-level idempotency-key handling reuses the exact same
 *     `IdempotencyService`/`idempotency_keys` table `checkout.module.ts`
 *     already established (see `idempotency.module.ts`'s own comment for
 *     why it was extracted into its own shared module for this).
 *
 * Now imported into `app.module.ts` via `AdminModule` (Stage 2 adds the
 * first real HTTP routes that need this module wired in — Stage 1 never
 * needed to, per this file's own prior comment, still accurate for
 * `SubscriptionService` considered alone).
 *
 * Phase 7 Scheduler Implementation Wave / Cancellation Retention wave —
 * `SubscriptionSchedulerService` added as a provider only (not exported —
 * nothing calls it directly, `@nestjs/schedule`'s `ScheduleModule.forRoot()`,
 * already registered in `app.module.ts`, discovers its `@Cron` methods
 * automatically once it is instantiated as part of this module's provider
 * graph). See that class's own header comment for exactly which THREE jobs
 * it owns (grace exhaustion, period reconciliation, cancellation
 * expiration).
 *
 * Phase 7 — D7 SaaS Billing Webhooks wave (docs/saas/DECISIONS.md P7-D3)
 * additions:
 *
 *   - `BillingWebhooksController` (`POST /webhooks/billing`, `@Public()`)
 *     — this is the FIRST controller `SubscriptionModule` itself owns
 *     (Stage 2's admin routes live on `AdminController`, in `AdminModule`,
 *     which imports this module — a billing webhook is provider-initiated,
 *     not tenant-console-initiated, so it does not belong there).
 *     Registering it here, rather than a new dedicated module, is
 *     deliberate ("avoid unnecessary new modules" — the webhook wave's own
 *     authorization): a Nest controller registered inside ANY module that
 *     is part of the running `AppModule` graph is reachable regardless of
 *     which parent imports that module, and this module is already
 *     reachable via `AdminModule` -> `AppModule` — no new import into
 *     `app.module.ts` is needed for this route to exist.
 *
 *   - `BillingWebhookIngestionService` (Phase 1 — verify/parse/persist,
 *     called by the controller above) and `BillingWebhookProcessor`
 *     (Phase 2 — the `@Cron` poller, discovered the same way
 *     `SubscriptionSchedulerService`'s jobs already are) — both provided
 *     but not exported; nothing outside this module calls either
 *     directly.
 */
@Module({
  imports: [IdempotencyModule],
  controllers: [BillingWebhooksController],
  providers: [
    SubscriptionService,
    SubscriptionOrchestrationService,
    SubscriptionSchedulerService,
    BillingWebhookIngestionService,
    BillingWebhookProcessor,
    { provide: BILLING_PROVIDER, useClass: RazorpayBillingProvider },
  ],
  exports: [SubscriptionService, SubscriptionOrchestrationService],
})
export class SubscriptionModule {}
