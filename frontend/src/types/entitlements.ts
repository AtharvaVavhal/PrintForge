/**
 * Mirrors backend/src/platform/platform-plans/catalogue.constants.ts and
 * backend/src/entitlements/entitlement.types.ts — GET /admin/entitlements
 * and GET /admin/usage response shapes. Same hand-written-mirror
 * convention as types/api.ts (separate npm projects, no workspace
 * linking).
 *
 * These are catalogue KEY identifiers, not commercial values or plan
 * names — the ratified architecture's "no plan-name logic in business
 * code" rule is about never branching on `plan.key === 'free'`/'business'
 * etc.; the feature/limit keys themselves are the one place this
 * repository's entitlement architecture is allowed to be explicit, on
 * both backend and frontend, exactly mirroring the backend's own single
 * source of truth.
 */

export const FEATURE_KEYS = [
  'coupons',
  'team_members',
  'custom_domain',
  'custom_storefront',
  'custom_branding',
  'advanced_analytics',
  'api_access',
] as const

export type FeatureKey = (typeof FEATURE_KEYS)[number]

export const LIMIT_KEYS = [
  'products',
  'team_members',
  'orders_per_month',
  'storage_mb',
  'custom_domains',
] as const

export type LimitKey = (typeof LIMIT_KEYS)[number]

export type LimitPeriod = 'PERSISTENT' | 'BILLING_PERIOD'

export interface EntitlementLimitValue {
  /** `null` = unlimited. */
  value: number | null
  period: LimitPeriod
}

export type EntitlementFeatures = Record<FeatureKey, boolean>
export type EntitlementLimits = Record<LimitKey, EntitlementLimitValue>

/** GET /admin/entitlements. */
export interface EntitlementResolution {
  features: EntitlementFeatures
  limits: EntitlementLimits
}

export interface UsageLimitView {
  /** Actual current usage count. `null` only for `orders_per_month` — its
   * BILLING_PERIOD identifier is an explicit, unresolved Phase 7
   * dependency (never a fabricated 0). */
  count: number | null
  period: LimitPeriod
}

/** GET /admin/usage. */
export type UsageView = Record<LimitKey, UsageLimitView>
