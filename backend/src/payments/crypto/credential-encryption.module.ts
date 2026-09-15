import { Module } from '@nestjs/common';
import { CredentialEncryptionService } from './credential-encryption.service';

/**
 * Leaf module — mirrors `RazorpayModule`'s shape (backend/src/payments/
 * razorpay/razorpay.module.ts). The AES-256-GCM credential-encryption
 * utility has no dependency on Prisma, Razorpay, or any domain service, so
 * both `payment-accounts` (encrypts fresh merchant-submitted credentials
 * before persistence) and `razorpay` (decrypts only inside the provider-
 * adapter boundary, P8-D6 §7) can import it directly with no module cycle.
 */
@Module({
  providers: [CredentialEncryptionService],
  exports: [CredentialEncryptionService],
})
export class CredentialEncryptionModule {}
