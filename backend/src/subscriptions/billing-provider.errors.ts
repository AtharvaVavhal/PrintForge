/**
 * Phase 7 Stage 2 (docs/saas/DECISIONS.md P7-D2 Part E) — the error-
 * classification contract `SubscriptionOrchestrationService` relies on to
 * decide "provider rejected this" (a legitimate business outcome, safe to
 * surface to the tenant) versus "the operation may or may not have
 * succeeded" (a timeout/ambiguous case requiring `getSubscription()`
 * reconciliation, never a blind retry). Any error a `BillingProvider`
 * implementation throws that is NOT one of these two types is treated by
 * the orchestration layer as a generic "provider unavailable" failure
 * (transient, no local mutation, no reconciliation attempted, message
 * never surfaced to the caller — P7-D2 Part E's "do not invent vendor-
 * specific idempotency semantics" applies here too: an unclassified
 * error gets the safest, most conservative treatment, not a guess).
 *
 * `FakeBillingProvider` itself never throws either of these under normal
 * operation (Stage 1 built it to succeed deterministically) — tests that
 * need to exercise rejection/timeout paths mock/spy the specific
 * `BillingProvider` method to throw one of these, exactly the same way a
 * real adapter would be expected to for its own vendor's decline/timeout
 * responses.
 */

/** The provider explicitly declined the requested operation (e.g. a
 * card decline, an invalid plan reference on the provider's own side). A
 * legitimate business response — its `message` is assumed safe to show
 * the tenant, never a raw vendor secret/internal detail. */
export class BillingProviderRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BillingProviderRejectedError';
  }
}

/** The provider call did not return within its expected window, and
 * whether the remote operation actually applied is unknown — never
 * treated as a success OR a failure by itself; always routed through
 * `getSubscription()` reconciliation (P7-D2 Part E). */
export class BillingProviderTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BillingProviderTimeoutError';
  }
}
