import { useQuery } from '@tanstack/react-query'
import { fetchEntitlements } from '@/services/api/entitlements'

/**
 * Same query-key convention as `useAdminDashboard`'s `ADMIN_DASHBOARD_QUERY_KEY`
 * — not tenant-id-scoped, because nothing else in this codebase's query
 * architecture scopes an admin query key by tenant either: the active
 * tenant is selected server-side (JWT + the existing tenant-context
 * mechanism), not by a client-supplied query-key segment, and this app has
 * no admin-facing tenant switcher today. If one is ever added, every admin
 * query key in this codebase would need the same change together, not
 * just this hook.
 */
export const ADMIN_ENTITLEMENTS_QUERY_KEY = ['admin', 'entitlements'] as const

/**
 * Backend-authoritative entitlement state (`EntitlementService.resolve()`,
 * Phase 6 W2, surfaced via GET /admin/entitlements, Phase 6 W6). Never
 * re-derives features/limits client-side — this hook is a thin read of
 * the server's own resolution, nothing more.
 */
export function useEntitlements() {
  return useQuery({
    queryKey: ADMIN_ENTITLEMENTS_QUERY_KEY,
    queryFn: fetchEntitlements,
  })
}
