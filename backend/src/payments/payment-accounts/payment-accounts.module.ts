import { Module } from '@nestjs/common';
import { AuditModule } from '../../common/audit/audit.module';
import { CredentialEncryptionModule } from '../crypto/credential-encryption.module';
import { PaymentProviderModule } from '../providers/payment-provider.module';
import { RazorpayModule } from '../razorpay/razorpay.module';
import { PaymentAccountConnectionService } from './payment-account-connection.service';
import { PaymentAccountResolutionService } from './payment-account-resolution.service';
import { PaymentAccountsController } from './payment-accounts.controller';
import { PaymentAccountsService } from './payment-accounts.service';

/**
 * Tenant Control Plane — Merchant Payment Accounts (P8-4/P8-5/P8-6).
 * Mirrors `TeamModule`'s exact shape: base-layer, depends on `AuditModule`
 * (W2) and the globally-provided `PrismaService`. `PaymentAccountsService`
 * itself still has NO dependency on Razorpay/crypto (P8-4 scope,
 * unchanged) — only `PaymentAccountConnectionService` (P8-5) needs
 * `RazorpayModule` (for `RazorpayAccountVerifierService`) and
 * `CredentialEncryptionModule` (for fresh-credential encryption), and only
 * the new `PaymentAccountResolutionService` (P8-6) needs
 * `PaymentProviderModule` (for `PaymentProviderRegistry`) — it has NO
 * dependency on Razorpay/crypto either (task scope item 3: generic
 * resolution code never decrypts/exposes credentials). Still deliberately
 * NOT importing the full `PaymentsModule` — that would also pull in
 * `OrdersModule`, which nothing in this module needs.
 *
 * `PaymentAccountResolutionService` is exported — not wired into any
 * consumer yet (checkout/payments/webhooks) by this stage; see the P8-6
 * report for why checkout integration was deliberately deferred.
 */
@Module({
  imports: [
    AuditModule,
    CredentialEncryptionModule,
    RazorpayModule,
    PaymentProviderModule,
  ],
  controllers: [PaymentAccountsController],
  providers: [
    PaymentAccountsService,
    PaymentAccountConnectionService,
    PaymentAccountResolutionService,
  ],
  exports: [PaymentAccountsService, PaymentAccountResolutionService],
})
export class PaymentAccountsModule {}
