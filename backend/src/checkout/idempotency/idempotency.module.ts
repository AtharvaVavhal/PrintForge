import { Module } from '@nestjs/common';
import { IdempotencyService } from './idempotency.service';

/**
 * Phase 7 Stage 2 (docs/saas/DECISIONS.md P7-D2, Step 12) extraction —
 * `IdempotencyService` previously lived only as a provider declared
 * directly inside `checkout.module.ts`'s own `providers` array, with no
 * way for another module to reuse it. It has no checkout-specific
 * dependency (only `PrismaService`, already global) and backs the
 * generic `idempotency_keys` table (`endpoint`-discriminated, not
 * checkout-only by design) — so it is pulled into this small, focused
 * module and exported, letting `CheckoutModule` (`POST /checkout/orders`)
 * and `SubscriptionModule` (`POST /admin/subscription/*`, Stage 2) both
 * import `IdempotencyModule` rather than one importing the other's whole
 * (much larger, unrelated-to-billing) module graph. `IdempotencyService`
 * itself is completely unmodified by this extraction — only where it is
 * `@Module`-registered changed.
 */
@Module({
  providers: [IdempotencyService],
  exports: [IdempotencyService],
})
export class IdempotencyModule {}
