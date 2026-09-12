/**
 * Phase 6 W3 — the canonical `Usage.period` string for every
 * `PERSISTENT`-classified limit key (`products`, `team_members`,
 * `storage_mb`, `custom_domains` — every ratified limit key except
 * `orders_per_month`).
 *
 * A single, fixed, never-changing sentinel — deliberately NOT
 * date-derived. "PERSISTENT" (Design Ratification §9 / W1) means exactly
 * one stable period identity for the tenant + limit key, forever; using
 * any date-based value here (even a constant one) would be misleading and
 * would risk a future accidental "rollover" if someone later swapped the
 * derivation for a real timestamp. `tenantId` + `limitKey` (both always
 * separate columns in `Usage`'s own `@@unique([tenantId, limitKey,
 * period])`) already provide the tenant/key scoping — this string's only
 * job is to be a fixed placeholder for "there is no period concept here."
 */
export const PERSISTENT_PERIOD = 'persistent';

/**
 * Phase 6 W3/P6-D3 — the `BILLING_PERIOD` period-key question was FORMALLY
 * RECORDED AS AN UNRESOLVED PHASE 7 DEPENDENCY (`docs/saas/DECISIONS.md`,
 * record P6-D3, part B) — not merely an implementation gap, a ratified
 * "this is not yet decided" status at the time. See the W3 implementation
 * report §4/§29 and the P6-D3 record for the full original investigation.
 *
 * **Phase 7 Stage 1 (P7-D1, Part E) resolves the STAMP FORMAT question**
 * (not the enforcement wiring — `orders_per_month` limit enforcement
 * itself remains unimplemented; only "what string identifies a billing
 * period, once one exists" is now ratified): the canonical representation
 * is the ISO-8601 timestamp of the provider-confirmed
 * `Subscription.currentPeriodStart`, at the moment it was last set by a
 * confirmed billing event (`SubscriptionService.confirmActivation`/
 * `applyScheduledDowngrade`, Phase 7 Stage 1) — never a calendar month,
 * never a timezone-local date, never derived from `createdAt`. See
 * `deriveBillingPeriodIdentifier` below.
 */
export function deriveBillingPeriodIdentifier(
  currentPeriodStart: Date,
): string {
  return currentPeriodStart.toISOString();
}
