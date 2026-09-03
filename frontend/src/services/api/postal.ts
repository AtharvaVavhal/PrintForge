import type { ApiSuccessResponse } from '@/types/api'
import type { PostalLookupView } from '@/types/postal'
import { apiClient } from './client'

/**
 * GET /postal-codes/:postalCode — server-proxied PIN-code → City/State
 * lookup. The backend owns the external provider call, the timeout, and
 * the error taxonomy; this is a thin wrapper.
 *
 * `signal` is forwarded to axios so React Query can abort an in-flight
 * lookup when the PIN changes or the component unmounts — the stale-result
 * guard (a late response for an old PIN must never win).
 */
export async function lookupPostalCode(
  postalCode: string,
  signal?: AbortSignal,
): Promise<PostalLookupView> {
  const res = await apiClient.get<ApiSuccessResponse<PostalLookupView>>(
    `/postal-codes/${encodeURIComponent(postalCode)}`,
    { signal },
  )
  return res.data.data
}
