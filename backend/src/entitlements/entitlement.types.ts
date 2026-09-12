import { LimitPeriod } from '@prisma/client';
import {
  FeatureKey,
  LimitKey,
} from '../platform/platform-plans/catalogue.constants';

/**
 * Phase 6 W2 — the public `EntitlementService.resolve()` contract. Never a
 * Prisma model shape (no `Plan`/`PlanFeature`/`PlanLimit`/`Subscription`/
 * `TenantEntitlementOverride` field ever passes through untransformed) —
 * every key from the ratified catalogue (`catalogue.constants.ts`, frozen
 * in Phase 6 W1) is always present, deny-by-default, so a caller never
 * needs to guard against a missing key.
 *
 * **Deviation from the Design Ratification's literal example shape**
 * (`{ [limitKey]: number | null }`) — flagged explicitly, not silently
 * decided (W2 authorization §16): a bare `number | null` cannot also
 * satisfy §9's separate requirement that W2 "resolve and expose the
 * configured period" for each limit. `EntitlementLimitValue` carries both
 * `value` and `period` instead of `limits` mapping straight to a number.
 * `period` is always the ratified, catalogue-defined value for that
 * `limitKey` (`LIMIT_KEY_PERIODS`) — not merely whatever a `PlanLimit` row
 * happens to store — so it is present and deterministic even for a
 * deny-by-default (no `PlanLimit` row) limit. No usage-period or
 * billing-period *calculation* is implied or performed here (§9) — this is
 * the static, configured classification only.
 */
export interface EntitlementLimitValue {
  /** `null` = unlimited. A finite non-negative integer otherwise. Never
   * negative — `PlanLimit.limitValue`/`TenantEntitlementOverride.intValue`
   * are both `@Min(0)`-validated at every write path (W1). */
  value: number | null;
  period: LimitPeriod;
}

export type EntitlementFeatures = Record<FeatureKey, boolean>;
export type EntitlementLimits = Record<LimitKey, EntitlementLimitValue>;

export interface EntitlementResolution {
  features: EntitlementFeatures;
  limits: EntitlementLimits;
}
