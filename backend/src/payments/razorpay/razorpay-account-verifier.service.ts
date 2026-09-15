import { Injectable, Logger } from '@nestjs/common';
import Razorpay from 'razorpay';
import { CredentialEncryptionService } from '../crypto/credential-encryption.service';

export interface RazorpayAccountCredentials {
  keyId: string;
  keySecret: string;
  webhookSecret?: string;
}

/** Thrown on any verification failure. `message` is always the fixed,
 * generic string below — never the raw Razorpay error text, never any
 * credential material — safe to propagate as-is into an API error
 * response (see `PaymentAccountConnectionService`). */
export class RazorpayAccountVerificationError extends Error {}

const VERIFICATION_FAILED_MESSAGE =
  'Razorpay credential verification failed — check the key id and secret.';

/**
 * Phase 8 (P8-5) — Razorpay merchant-account CONNECTION verification. This
 * is deliberately NOT the full `PaymentProviderAdapter` interface sketched
 * at docs/saas/PHASE-8-ARCHITECTURE-AND-SCHEMA-SPEC.md §5.1
 * (createOrder/verifyPaymentSignature/fetchOrderPayments/createRefund) —
 * those remain out of scope for this stage (task strict rules: no order/
 * payment/refund/webhook code). This class does exactly one thing: confirm
 * a `key_id`/`key_secret` pair actually authenticates against Razorpay.
 *
 * A fresh `Razorpay` SDK client is instantiated PER CALL from the
 * caller-supplied credentials — never the app-wide `RazorpayService`
 * singleton (`../razorpay.service.ts`), which is bound once at boot to a
 * single, global credential set (the Tenant-#1 seed/fallback env vars).
 * Every merchant `PaymentAccount` may hold different credentials, so
 * resolution here is per-call, per-account (P8-3 §5.2).
 *
 * Decryption boundary (P8-D6 §7 — "decrypted only inside the payment-
 * provider adapter, only at the moment of an actual provider call"): this
 * is the ONLY class anywhere in `src/payments/` that ever calls
 * `CredentialEncryptionService.decrypt` (`verifyStoredCredentials` below).
 * `PaymentAccountsService`, `PaymentAccountConnectionService`, the
 * controller, and every DTO never see decrypted stored credentials.
 */
@Injectable()
export class RazorpayAccountVerifierService {
  private readonly logger = new Logger(RazorpayAccountVerifierService.name);

  constructor(
    private readonly credentialEncryption: CredentialEncryptionService,
  ) {}

  /** Verify freshly-submitted, not-yet-persisted credentials (the
   * "submit + verify" connect flow). */
  async verifyCredentials(
    credentials: RazorpayAccountCredentials,
  ): Promise<void> {
    const client = new Razorpay({
      key_id: credentials.keyId,
      key_secret: credentials.keySecret,
    });
    try {
      // Minimum safe, side-effect-free authenticated call: LISTS (never
      // creates) at most one order. A 401/403 here means the key id/secret
      // pair is invalid — exactly the signal verification needs, with zero
      // order/payment/refund ever created (task strict rules).
      await client.orders.all({ count: 1 });
    } catch (err) {
      throw this.toVerificationError(err);
    }
  }

  /** Re-verify a `PaymentAccount`'s already-stored, encrypted credentials
   * (the "test connection" case — no plaintext resubmitted). Decrypts,
   * then delegates to `verifyCredentials` above; the decrypted plaintext
   * never leaves this method's call stack. */
  async verifyStoredCredentials(encryptedBlob: Buffer): Promise<void> {
    let credentials: RazorpayAccountCredentials;
    try {
      const plaintext = this.credentialEncryption.decrypt(encryptedBlob);
      const parsed: unknown = JSON.parse(plaintext);
      if (
        typeof parsed !== 'object' ||
        parsed === null ||
        typeof (parsed as { keyId?: unknown }).keyId !== 'string' ||
        typeof (parsed as { keySecret?: unknown }).keySecret !== 'string'
      ) {
        throw new Error('malformed stored credential payload');
      }
      credentials = parsed as RazorpayAccountCredentials;
    } catch {
      // Corrupted ciphertext / malformed JSON / unexpected shape — fail
      // closed, no detail leaked (never the raw decrypt error, plaintext,
      // or ciphertext).
      throw new RazorpayAccountVerificationError(VERIFICATION_FAILED_MESSAGE);
    }
    return this.verifyCredentials(credentials);
  }

  /** Classifies whatever the SDK threw into the one fixed, safe error.
   * Logs only a non-secret category (HTTP status, if any) server-side —
   * mirrors `RazorpayService.translateSdkError`'s shape-detection, but
   * NEVER logs or returns key_id/key_secret or the raw provider response
   * body. */
  private toVerificationError(err: unknown): RazorpayAccountVerificationError {
    const statusCode =
      typeof err === 'object' &&
      err !== null &&
      'statusCode' in err &&
      typeof (err as { statusCode?: unknown }).statusCode === 'number'
        ? (err as { statusCode: number }).statusCode
        : undefined;
    this.logger.warn(
      statusCode
        ? `Razorpay account credential verification failed (HTTP ${statusCode})`
        : 'Razorpay account credential verification failed (no response — transport error)',
    );
    return new RazorpayAccountVerificationError(VERIFICATION_FAILED_MESSAGE);
  }
}
