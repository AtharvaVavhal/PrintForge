/**
 * Phase 7 Stage 1 (docs/saas/DECISIONS.md P7-D1, Part G) — the
 * vendor-independent billing-provider abstraction. Deliberately NOT bound
 * to Razorpay/Stripe/Paddle/Chargebee/etc. — the production billing
 * provider remains UNDECIDED (P7-D1 Part G); no field or method here
 * implies or requires a particular vendor's concepts.
 *
 * Mirrors the method list the authoritative master plan (§13) already
 * specifies (`createCustomer, createSubscription, updateSubscription,
 * cancelSubscription, listInvoices, getSubscription, verifyWebhook,
 * parseWebhook`), split into `changeSubscription`/`resumeSubscription`
 * for the explicit upgrade/downgrade/resume distinction this stage's
 * ratified transition matrix needs. `listInvoices` is intentionally
 * ABSENT — SaaS invoices are explicitly out of Stage 1 scope; adding a
 * method for a capability this stage never calls would be exactly the
 * "add a provider-specific field/method unless architecturally required"
 * the ratification gate forbids.
 *
 * Webhook methods (`verifyWebhook`/`parseWebhook`) are interface-level
 * contracts ONLY — no real webhook receiver, no `BillingWebhookEvent`
 * table, and no provider-specific payload parsing exist anywhere in this
 * stage (D7 remains OPEN; see P7-D1 Part H). They are declared here so a
 * future webhook processor has a defined shape to call into without this
 * interface needing to change later.
 *
 * No method returns or accepts a value that presupposes a specific
 * provider's billing-period semantics — every date/period value is a
 * plain `Date`, resolved by whichever concrete provider (or
 * `FakeBillingProvider`, Stage 1's only real implementation) is behind
 * this interface.
 */

export interface BillingProviderCustomer {
  providerCustomerId: string;
}

export interface BillingProviderSubscription {
  providerSubscriptionId: string;
  /** The provider's own confirmed status concept, normalized to this
   * repository's own `SubscriptionStatus` shape by the caller — this
   * interface does not assume the provider's status vocabulary matches
   * the ratified 7-state enum. */
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  trialEndsAt?: Date;
  /**
   * Phase 7 Stage 2 (P7-D2 Part E) addition — the provider's own opaque
   * plan/price reference currently in effect, as of whenever this value
   * was produced. Optional: a provider adapter that genuinely cannot
   * report this may omit it. Added specifically so
   * `getSubscription()`-based timeout reconciliation (P7-D2 Part E) has
   * something to compare an upgrade/downgrade against — without it,
   * reconciling a plan-change timeout would have no signal to check at
   * all. Never assumed to equal a real `Plan.id`; always an opaque,
   * provider-defined string (the same `planRef` shape `createSubscription`/
   * `changeSubscription` already accept).
   */
  planRef?: string;
}

export interface NormalizedBillingEvent {
  providerEventId: string;
  /** Free-form — the caller (a future webhook processor, not built in
   * Stage 1) is responsible for interpreting this against whichever
   * provider produced it. */
  type: string;
  payload: unknown;
}

export interface BillingProvider {
  createCustomer(tenantId: string): Promise<BillingProviderCustomer>;

  createSubscription(
    providerCustomerId: string,
    planRef: string,
  ): Promise<BillingProviderSubscription>;

  /** Upgrade or downgrade — the caller decides `mode`; this method never
   * itself decides whether a change applies immediately (upgrade,
   * confirmed) or at period end (downgrade, scheduled) — that decision is
   * `SubscriptionService`'s, per the ratified transition matrix. */
  changeSubscription(
    providerSubscriptionId: string,
    newPlanRef: string,
    mode: 'immediate' | 'at_period_end',
  ): Promise<BillingProviderSubscription>;

  cancelSubscription(
    providerSubscriptionId: string,
    mode: 'immediate' | 'at_period_end',
  ): Promise<void>;

  resumeSubscription(
    providerSubscriptionId: string,
  ): Promise<BillingProviderSubscription>;

  getSubscription(
    providerSubscriptionId: string,
  ): Promise<BillingProviderSubscription>;

  /** Interface-level contract only — no real signature verification is
   * implemented anywhere in Stage 1 (P7-D1 Part H). */
  verifyWebhook(rawBody: Buffer, signature: string): boolean;

  /** Interface-level contract only — no real payload parsing is
   * implemented anywhere in Stage 1 (P7-D1 Part H). */
  parseWebhook(rawBody: Buffer): NormalizedBillingEvent;
}
