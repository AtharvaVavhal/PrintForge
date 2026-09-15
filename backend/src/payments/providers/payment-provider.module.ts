import { Module } from '@nestjs/common';
import { CredentialEncryptionModule } from '../crypto/credential-encryption.module';
import { RazorpayProviderAdapter } from '../razorpay/razorpay-provider-adapter';
import { PaymentProviderRegistry } from './payment-provider-registry';

/**
 * Leaf-ish module (mirrors `RazorpayModule`/`CredentialEncryptionModule`'s
 * shape) — `PaymentProviderRegistry` and its one registered adapter have
 * no dependency on Prisma or any other Phase 8 module, so any future
 * consumer (checkout, payments, webhooks) can import this directly without
 * pulling in `PaymentAccountsModule`/`RazorpayModule`'s own dependency
 * trees. `RazorpayProviderAdapter` is provided ONLY here — not also
 * registered in `RazorpayModule` — so there is exactly one instance, never
 * two competing registrations of the same class.
 *
 * Phase 8 (P8-8) adds `CredentialEncryptionModule` — `RazorpayProviderAdapter`
 * now needs `CredentialEncryptionService` to decrypt merchant `PaymentAccount`
 * credentials at the moment of a provider call (P8-D6 §7 decryption
 * boundary). `CredentialEncryptionModule` is a dependency-free leaf
 * (imported the same way by `RazorpayModule`/`PaymentAccountsModule`
 * already), so this adds no cycle.
 */
@Module({
  imports: [CredentialEncryptionModule],
  providers: [RazorpayProviderAdapter, PaymentProviderRegistry],
  exports: [PaymentProviderRegistry],
})
export class PaymentProviderModule {}
