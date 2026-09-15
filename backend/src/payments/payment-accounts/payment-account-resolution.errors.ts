import { PaymentAccountStatus, PaymentProviderType } from '@prisma/client';

/**
 * Phase 8 (P8-6) — stable domain errors for the Tenant -> Store -> active
 * PaymentAccount -> PaymentProviderAdapter resolution chain
 * (`PaymentAccountResolutionService`). Plain `Error` subclasses, NOT
 * NestJS HTTP exceptions — this resolution service is meant to be called
 * from multiple, differently-shaped future call sites (a checkout
 * integration wants an HTTP-facing 4xx; a webhook processor wants to log/
 * requeue, never throw an HTTP response), so translation to a specific
 * response shape is each caller's own job, not this file's. Mirrors
 * `PaymentMismatchError`'s (`../payment-mismatch.error.ts`) own "plain
 * Error, caller translates" convention exactly.
 *
 * Never carries credential/provider-internal detail — only tenant-safe
 * identifiers (ids, enum values), the same discipline
 * `PaymentMismatchError.detail`'s own doc comment establishes.
 */
export abstract class PaymentAccountResolutionError extends Error {}

/** The given `storeId` does not exist, or does not belong to the caller's
 * tenant — deliberately not distinguished (same existence-leak-avoidance
 * reasoning `assertObjectInTenant` already establishes elsewhere). */
export class StoreNotFoundError extends PaymentAccountResolutionError {
  constructor(readonly storeId: string) {
    super('Store not found for this tenant');
    this.name = 'StoreNotFoundError';
  }
}

/** No `PaymentAccount` row exists at all for this `(storeId, provider)`
 * pair — the merchant has never configured this provider for this store.
 * Distinct from `InactivePaymentAccountError` (a row exists but isn't
 * ACTIVE yet/anymore) so a caller can give a merchant a different message
 * ("connect Razorpay" vs "finish verifying your Razorpay connection"). */
export class NoActivePaymentAccountError extends PaymentAccountResolutionError {
  constructor(
    readonly storeId: string,
    readonly provider: PaymentProviderType,
  ) {
    super(`No ${provider} payment account is configured for this store`);
    this.name = 'NoActivePaymentAccountError';
  }
}

/** A `PaymentAccount` row exists for this store/provider but its `status`
 * is `PENDING` or `DISABLED` — never selectable for commerce payment
 * routing (P8-3 §4: "a DISABLED account is never usable as an active
 * one"). */
export class InactivePaymentAccountError extends PaymentAccountResolutionError {
  constructor(
    readonly paymentAccountId: string,
    readonly status: PaymentAccountStatus,
  ) {
    super(`Payment account ${paymentAccountId} is ${status}, not ACTIVE`);
    this.name = 'InactivePaymentAccountError';
  }
}

/** `PaymentProviderRegistry` has no adapter registered for this
 * `PaymentProviderType` value. Structurally unreachable today (`RAZORPAY`
 * is the only enum value and the only registered adapter) — kept as a
 * real, named failure mode for when a second provider is ever added. */
export class UnsupportedPaymentProviderError extends PaymentAccountResolutionError {
  constructor(readonly provider: PaymentProviderType) {
    super(`Unsupported payment provider: ${provider}`);
    this.name = 'UnsupportedPaymentProviderError';
  }
}

/** No `PaymentAccount` row exists at all for this id — the webhook-routing
 * path parameter (P8-3 §9) didn't resolve to anything. Distinct from
 * `PaymentAccountTenantMismatchError` only in framing (no tenant is known
 * yet at this point in the flow — see `resolveForWebhook`'s own doc
 * comment) — the caller must still respond with the exact same generic
 * rejection as an invalid signature, never a distinguishable 404, so an
 * attacker cannot use this endpoint to enumerate valid account ids. */
export class UnknownPaymentAccountError extends PaymentAccountResolutionError {
  constructor(readonly paymentAccountId: string) {
    super('Payment account not found');
    this.name = 'UnknownPaymentAccountError';
  }
}

/** Covers BOTH "no such `PaymentAccount` exists" and "exists but belongs
 * to a different tenant" — same 404-not-403 existence-leak-avoidance
 * discipline `assertObjectInTenant` (`common/tenant/object-auth.ts`)
 * already establishes: a caller-facing distinction between the two would
 * confirm cross-tenant existence. Also the defense-in-depth branch inside
 * `resolveForStore` for the "structurally shouldn't happen" case where a
 * `storeId`-matched row's own denormalized `tenantId` disagrees with the
 * caller's tenant. */
export class PaymentAccountTenantMismatchError extends PaymentAccountResolutionError {
  constructor(readonly paymentAccountId: string) {
    super('Payment account not found for this tenant');
    this.name = 'PaymentAccountTenantMismatchError';
  }
}
