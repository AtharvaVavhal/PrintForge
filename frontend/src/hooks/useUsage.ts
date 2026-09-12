import { useQuery } from '@tanstack/react-query'
import { fetchUsage } from '@/services/api/entitlements'

/** Same non-tenant-scoped query-key reasoning as `useEntitlements`'s own
 * `ADMIN_ENTITLEMENTS_QUERY_KEY`. */
export const ADMIN_USAGE_QUERY_KEY = ['admin', 'usage'] as const

/**
 * Backend-authoritative usage counters (`UsageService`, Phase 6 W3,
 * surfaced via GET /admin/usage, Phase 6 W6). `count: null` for
 * `orders_per_month` is the backend's own explicit "not yet resolvable"
 * signal (its BILLING_PERIOD identifier is a Phase 7 dependency) — this
 * hook passes it through unchanged; nothing here invents a period count.
 */
export function useUsage() {
  return useQuery({
    queryKey: ADMIN_USAGE_QUERY_KEY,
    queryFn: fetchUsage,
  })
}
