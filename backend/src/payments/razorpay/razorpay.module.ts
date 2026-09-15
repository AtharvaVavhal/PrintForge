import { Module } from '@nestjs/common';
import { CredentialEncryptionModule } from '../crypto/credential-encryption.module';
import { RazorpayAccountVerifierService } from './razorpay-account-verifier.service';
import { RazorpayService } from './razorpay.service';

/**
 * Extracted into its own leaf module (Phase 7) so both `payments/` and
 * `orders/` can depend on it without creating a module cycle: `payments`
 * already depends on `orders` (§17, one-directional by design), and Phase
 * 7's order-cancellation refund trigger means `orders` now also needs the
 * Razorpay client. RazorpayService itself only wraps the SDK + config — no
 * coupling to Prisma/Orders/Payments business logic — so it's a clean leaf:
 * `orders` and `payments` both import `RazorpayModule` directly, neither
 * imports the other's domain module for this, no `forwardRef()` needed.
 *
 * Phase 8 (P8-5) adds `RazorpayAccountVerifierService` — the merchant
 * `PaymentAccount` connection-verification adapter (distinct from
 * `RazorpayService`, which stays the SaaS-Tenant-#1-seed/global-credential
 * client for existing checkout/reconciliation flows). It depends on
 * `CredentialEncryptionModule` (P8-D6) for its stored-credential
 * "test connection" path, imported here so `PaymentAccountsModule` only
 * needs this one module, not a second direct import.
 */
@Module({
  imports: [CredentialEncryptionModule],
  providers: [RazorpayService, RazorpayAccountVerifierService],
  exports: [RazorpayService, RazorpayAccountVerifierService],
})
export class RazorpayModule {}
