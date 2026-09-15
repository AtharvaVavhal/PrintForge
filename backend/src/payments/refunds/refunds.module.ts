import { Module } from '@nestjs/common';
import { AuditModule } from '../../common/audit/audit.module';
import { PaymentAccountsModule } from '../payment-accounts/payment-accounts.module';
import { RefundsService } from './refunds.service';

/**
 * Phase 8 (P8-11) — merchant commerce refund business workflow. Mirrors
 * `PaymentAccountsModule`'s own base-layer shape exactly: depends on
 * `AuditModule` (refund requests are audited the same way `PaymentAccount`
 * lifecycle transitions already are) and `PaymentAccountsModule` (exports
 * both `PaymentAccountResolutionService` — historical-account resolution
 * — and `PaymentAccountsService` — the approved encrypted-credential
 * read boundary; `RefundsService` never decrypts anything itself). No
 * controller of its own — `AdminController` (`src/admin/`) owns the one
 * new route (`POST /admin/payment-attempts/:id/refund`), reusing the
 * already-ratified `orders:transition` permission rather than
 * introducing a new one, the same way `AdminModule` already delegates
 * order/review/coupon/subscription mutations to their own domain
 * services without duplicating authorization plumbing.
 */
@Module({
  imports: [AuditModule, PaymentAccountsModule],
  providers: [RefundsService],
  exports: [RefundsService],
})
export class RefundsModule {}
