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
 * Phase 6 W3/P6-D3 — the `BILLING_PERIOD` period-key question is FORMALLY
 * RECORDED AS AN UNRESOLVED PHASE 7 DEPENDENCY (`docs/saas/DECISIONS.md`,
 * record P6-D3, part B) — not merely an implementation gap, a ratified
 * "this is not yet decided" status. No helper exists here to compute "the
 * current billing period" for `orders_per_month` (the sole
 * `BILLING_PERIOD`-classified limit key) — see the W3 implementation
 * report §4/§29 and the P6-D3 record for the full investigation. In
 * summary: `Subscription.currentPeriodStart`/
 * `currentPeriodEnd` are the only schema fields that could plausibly carry
 * this, but (1) `currentPeriodEnd` is never set anywhere in this
 * repository (grepped in full — only `currentPeriodStart` is set, once, by
 * `seed-tenant-bootstrap.ts`, to the seed run's own `new Date()`), (2)
 * nothing anywhere recomputes/rolls either field over, and (3) Phase 7
 * (billing) — the phase that would own period-rollover logic — has not
 * been implemented. Inventing a derivation now (a calendar month string, a
 * fixed-duration window from `currentPeriodStart`, or anything else) would
 * be fabricating billing semantics this repository does not yet
 * authoritatively define, which the W3 authorization explicitly forbids
 * ("Do not invent currentPeriodStart/currentPeriodEnd behavior if it is
 * not already established... STOP and report the ambiguity"). No helper
 * function is provided here for it — `UsageService` itself is fully
 * period-format-agnostic (it accepts whatever `period` string its caller
 * supplies and never derives one internally), so this gap blocks only
 * "what string should a future caller pass for `orders_per_month`", not
 * the usage/CAS engine itself.
 */
