import { Module } from '@nestjs/common';
import { IdempotencyModule } from '../checkout/idempotency/idempotency.module';
import { SubscriptionService } from './subscription.service';
import { SubscriptionOrchestrationService } from './subscription-orchestration.service';
import { BILLING_PROVIDER } from './billing-provider.token';
import { FakeBillingProvider } from './fake-billing-provider';

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
 *     is the ONLY line in the entire codebase that names a concrete
 *     `BillingProvider` implementation. This is NOT a production
 *     billing-provider selection — the production provider remains
 *     UNDECIDED (P7-D1 Part G, still OPEN). Once one is chosen and a real
 *     adapter is built (a separate, later, explicitly-authorized change),
 *     replacing this fake means changing exactly this one `useClass`
 *     value — nothing that injects `BILLING_PROVIDER` needs to change.
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
 */
@Module({
  imports: [IdempotencyModule],
  providers: [
    SubscriptionService,
    SubscriptionOrchestrationService,
    { provide: BILLING_PROVIDER, useClass: FakeBillingProvider },
  ],
  exports: [SubscriptionService, SubscriptionOrchestrationService],
})
export class SubscriptionModule {}
