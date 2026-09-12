/**
 * Formats a `useUsage()` count against a `useEntitlements()` limit value
 * for display (Phase 6 W8 — "42 / 100 products"). Never fabricates a
 * value: `count: null` (today, only `orders_per_month` — its
 * BILLING_PERIOD period identifier is an unresolved Phase 7 dependency)
 * renders as an explicit "not available" marker, never a guessed number;
 * `limit: null` (unlimited) renders as "Unlimited", never a made-up cap.
 */
export function formatUsageMeter(count: number | null, limit: number | null): string {
  if (count === null) {
    return 'Usage not available'
  }
  if (limit === null) {
    return `${count} used (unlimited)`
  }
  return `${count} / ${limit}`
}
