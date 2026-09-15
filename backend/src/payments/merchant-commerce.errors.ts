import { BadGatewayException, UnprocessableEntityException } from '@nestjs/common';

/**
 * Phase 8 (P8-9) — the two stable, customer-facing errors
 * `PaymentsService.initiatePayment`/`verifyPayment` throw at the merchant-
 * commerce boundary. Real NestJS `HttpException` subclasses (unlike
 * `PaymentAccountResolutionError`/`PaymentProviderError`, which are plain
 * `Error`s meant for a caller to translate) — `PaymentsService` is only
 * ever called from `PaymentsController`/`CheckoutController`, so throwing
 * the final HTTP shape directly here is the same convention this file's
 * existing `BadRequestException`/`ConflictException`/`NotFoundException`
 * throws already establish.
 *
 * Neither message ever includes a `PaymentAccount` id, a store id, or any
 * detail about WHY resolution/the provider call failed (missing account
 * vs. disabled vs. tenant-mismatch vs. a transient provider outage all
 * collapse to the same fixed text) — same "stable, generic, no internals"
 * discipline `RazorpayAccountVerifierService`'s `VERIFICATION_FAILED_MESSAGE`
 * already establishes for this identical class of concern.
 */

/** No usable merchant `PaymentAccount` is bound/resolvable for this order —
 * either the store has never configured Razorpay, its only configured
 * account isn't `ACTIVE` yet, or (structurally-shouldn't-happen)
 * defense-in-depth resolution failed. 422, per P8-3 §6 point 4's own
 * already-ratified framing ("a clear, merchant-onboarding-shaped error...
 * never a generic 500"). Never falls back to any global/platform/SaaS
 * credential — there is no fallback path, only this error. */
export class MerchantPaymentUnavailableError extends UnprocessableEntityException {
  constructor() {
    super(
      'This store has not finished setting up payments yet. Please try again later or contact the merchant.',
    );
  }
}

/** The resolved merchant account's own Razorpay call failed (API error or
 * transport failure — see `PaymentProviderApiError`) or its stored
 * credentials could not be decrypted (`PaymentProviderCredentialError`).
 * 502 — this is an upstream-provider/credential problem, not a request
 * validation problem, and never the customer's fault to retry
 * differently. Never includes the underlying `PaymentProviderError`'s own
 * message (already credential-free, but still provider-internal detail
 * a customer response should not carry) or any SDK object. */
export class PaymentProviderUnavailableError extends BadGatewayException {
  constructor() {
    super(
      'The payment provider could not process this request. Please try again shortly.',
    );
  }
}
