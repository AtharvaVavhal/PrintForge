import { LimitPeriod } from '@prisma/client';
import { LimitKey } from '../../platform/platform-plans/catalogue.constants';

/**
 * Phase 6 W6 — GET /admin/usage. Deliberately the same `Record<LimitKey,
 * ...>` shape family as `EntitlementLimits` (`entitlement.types.ts`) —
 * every recognized limit key is always present, so a caller never needs
 * to guard against a missing key, exactly as §6 requires for entitlements
 * and §5 asks be "preserved" here.
 *
 * `count: null` (never a fabricated `0`) is the one deliberate deviation
 * from `UsageService.getUsage()`'s own "missing row -> count: 0" contract
 * — reserved for `orders_per_month` ONLY, whose `BILLING_PERIOD` period
 * identifier is a formally unresolved Phase 7 dependency (P6-D3 Part B,
 * `usage/usage-period.ts`): there is no valid `period` string this
 * endpoint can pass to `UsageService.getUsage()` for that key at all, so
 * it is never queried, and `null` here means "not yet resolvable" —
 * distinct from a real, queried `0`, which would misleadingly claim
 * "confirmed zero usage this period." Every other (PERSISTENT) key is a
 * real `UsageService.getUsage()` read and is never `null`.
 */
export interface AdminUsageLimitView {
  count: number | null;
  period: LimitPeriod;
}

export type AdminUsageView = Record<LimitKey, AdminUsageLimitView>;
