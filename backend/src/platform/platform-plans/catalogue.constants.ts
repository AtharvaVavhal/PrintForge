/**
 * Phase 6 (W1) — the code-defined feature/limit key catalogue. Mirrors
 * `app-setting.constants.ts`'s own allowlist/typed-definition pattern
 * exactly (same reasoning: a fixed, reviewed set of valid keys, never an
 * arbitrary client-supplied string reaching the database).
 *
 * This is the SOLE source of truth for which `featureKey`/`limitKey`
 * values `PlanFeature`/`PlanLimit`/`TenantEntitlementOverride` may ever
 * reference — the platform service validates every write against it, so a
 * `plan_features`/`plan_limits` row can never be created for an unknown
 * key, and `featureKey`/`limitKey` are never free-text in any request DTO.
 *
 * Per the ratified Phase 6 Design Ratification (§6/§8/Gap 5): every key
 * here is [PROPOSED] technical catalogue, not frozen commercial policy —
 * numeric limit VALUES are never defined here (those live only on a
 * `PlanLimit` row, set per-plan by a SUPER_ADMIN) and no pricing/tier
 * mapping exists anywhere in code. `support_sessions` is deliberately
 * ABSENT — it is a platform-initiated capability a tenant's plan can never
 * grant or withhold (Design Ratification §6, explicit rejection), not an
 * oversight.
 */

export const FEATURE_KEYS = [
  'coupons',
  'team_members',
  'custom_domain',
  'custom_storefront',
  'custom_branding',
  'advanced_analytics',
  'api_access',
] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];

export function isFeatureKey(key: string): key is FeatureKey {
  return (FEATURE_KEYS as readonly string[]).includes(key);
}

export const LIMIT_KEYS = [
  'products',
  'team_members',
  'orders_per_month',
  'storage_mb',
  'custom_domains',
] as const;

export type LimitKey = (typeof LIMIT_KEYS)[number];

export function isLimitKey(key: string): key is LimitKey {
  return (LIMIT_KEYS as readonly string[]).includes(key);
}

/**
 * Ratified period assignment per limit key (Design Ratification §9 —
 * "Final Usage Semantics"). `PlanLimit.period` for a given `limitKey` must
 * match this table; the platform service rejects a mismatched period
 * rather than trusting whatever the caller sends, so a limit's period
 * classification can never silently drift from its ratified definition.
 */
export const LIMIT_KEY_PERIODS: Readonly<
  Record<LimitKey, 'PERSISTENT' | 'BILLING_PERIOD'>
> = {
  products: 'PERSISTENT',
  team_members: 'PERSISTENT',
  orders_per_month: 'BILLING_PERIOD',
  storage_mb: 'PERSISTENT',
  custom_domains: 'PERSISTENT',
};
