/**
 * Phase 9 W3 — `request.storeContext` (spec §4.4). Distinct from, and never
 * derived from or written into, the merchant `request.tenantContext`
 * (D6). Exists ONLY after every gate in the §4.3 pipeline has passed (or,
 * in `legacy_single_store` mode, after the pre-Phase-9 resolver has run).
 *
 * Downstream code treats this as the ONE storefront scope for the request:
 * public reads filter by it (W4), brand-new shopper-owned rows (cart,
 * upload) take their `tenantId` from it (P4-D2), and NOTHING grants
 * merchant or platform authority from it (spec §4.1.1 trust model).
 */
export interface StoreContext {
  /**
   * The resolved store. Always set by the `host_resolution` pipeline. In
   * `legacy_single_store` mode it is the tenant's primary store when one
   * exists and `null` otherwise — the pre-Phase-9 path never required a
   * store to exist (only a tenant), and §4.5 keeps that behaviour verbatim:
   * a missing primary store must not turn a legacy request into a 404.
   * (Production's Tenant #1 always has one — D11 / `seed-tenant-bootstrap`.)
   */
  storeId: string | null;
  tenantId: string;
  /** The matched `StoreDomain.id`; `null` in `legacy_single_store` mode (no row matched). */
  storeDomainId: string | null;
  /** Whether the matched hostname is the store's primary domain; `true` in legacy mode. */
  isPrimary: boolean;
  /**
   * `<scheme>://<primary hostname>` of the resolved store, for the SPA's
   * self-canonicalisation (§11) — the API itself never redirects. `null` in
   * legacy mode (no domain row to derive it from).
   */
  canonicalOrigin: string | null;
  /**
   * How the context was derived. `origin` — the §4.3 pipeline from the
   * browser `Origin` header; `legacy` — §4.5 pre-Phase-9 single-store
   * resolution. (`edge` is reserved for the W5 SEO routes.)
   */
  resolvedBy: 'origin' | 'edge' | 'legacy';
}

export interface RequestWithStoreContext {
  storeContext?: StoreContext;
}
