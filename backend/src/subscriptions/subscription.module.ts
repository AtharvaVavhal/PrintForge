import { Module } from '@nestjs/common';
import { SubscriptionService } from './subscription.service';

/**
 * Phase 7 Stage 1 (docs/saas/DECISIONS.md P7-D1) — the subscription
 * state-machine module. Exports `SubscriptionService` for a later,
 * separately-authorized wave to consume (a tenant-facing controller, a
 * platform-facing controller, and eventually a billing-webhook processor)
 * — same "deliberately NOT imported anywhere yet" precedent
 * `entitlement.module.ts`/`usage.module.ts` already established for their
 * own foundational waves. Not imported into `app.module.ts` in this
 * stage: no HTTP route, no controller exists yet, so nothing in the
 * running application needs this module wired in today. Real-Postgres
 * e2e coverage for this stage instantiates `SubscriptionService` directly
 * against a bare `PrismaClient` (same convention
 * `entitlement-engine.e2e-spec.ts`/`usage-engine.e2e-spec.ts` already
 * use for their own foundational services), so this module's absence
 * from `app.module.ts` does not limit what Stage 1 can prove. No
 * providers beyond the service itself — depends only on the
 * globally-provided `PrismaService`.
 */
@Module({
  providers: [SubscriptionService],
  exports: [SubscriptionService],
})
export class SubscriptionModule {}
