import { PaymentProviderType } from '@prisma/client';

/**
 * Phase 8 (P8-8) — the small provider-neutral error boundary for
 * `PaymentProviderAdapter` implementations (task scope item 8: "Define/use
 * a small provider-neutral error boundary... Do not convert every provider
 * error into an HTTP exception inside the adapter"). Plain `Error`
 * subclasses, not NestJS HTTP exceptions — same "adapter throws a domain
 * error, caller translates to a response shape" convention
 * `PaymentAccountResolutionError`/`PaymentMismatchError` already establish
 * in this codebase. Never carries credential material, raw SDK error
 * objects, or ciphertext/plaintext — only tenant-safe identifiers, HTTP
 * status/error codes, and human-readable descriptions the provider itself
 * already surfaces as non-secret.
 */
export abstract class PaymentProviderError extends Error {}

/** The account's stored credential ciphertext could not be decrypted, or
 * decrypted to something that isn't a valid credential shape for this
 * provider (corrupted ciphertext, tampered auth tag, unexpected JSON
 * shape). Fail-closed — never carries the underlying crypto error, the
 * ciphertext, or any partial plaintext. */
export class PaymentProviderCredentialError extends PaymentProviderError {
  constructor(readonly provider: PaymentProviderType) {
    super(`Payment provider credentials for ${provider} could not be used`);
    this.name = 'PaymentProviderCredentialError';
  }
}

/** A provider API call failed — either a real API error response
 * (`statusCode`/`code` set, `transport: false`) or a transport-level
 * failure that never reached the provider (`transport: true`,
 * `statusCode`/`code` undefined). Mirrors `RazorpayApiError`'s
 * (`../razorpay/razorpay.service.ts`) existing shape, kept as a separate,
 * provider-neutral type here rather than reused directly — the Phase 7
 * `RazorpayApiError` is scoped to `RazorpayService`'s own global-credential
 * client (task scope item 11: keep SaaS/global-credential and merchant
 * commerce abstractions separate). */
export class PaymentProviderApiError extends PaymentProviderError {
  constructor(
    message: string,
    readonly provider: PaymentProviderType,
    readonly statusCode: number | undefined,
    readonly code: string | undefined,
    readonly transport: boolean,
  ) {
    super(message);
    this.name = 'PaymentProviderApiError';
  }
}
