import { useQuery } from '@tanstack/react-query'
import { lookupPostalCode } from '@/services/api/postal'
import { parseApiError } from '@/utils/apiError'
import type { PostalLookupView } from '@/types/postal'

/** Local, immediate format check — six digits, nothing more. Existence is
 * the backend/provider's job. */
export const PIN_CODE_REGEX = /^\d{6}$/

export type PostalLookupStatus = 'idle' | 'loading' | 'success' | 'error'

/** `not-found` → the PIN is well-formed but no location matched (show
 * "check it and try again"). `unavailable` → provider/network problem
 * (show "enter your address manually"). */
export type PostalLookupErrorKind = 'not-found' | 'unavailable' | null

export interface PostalLookupResult {
  status: PostalLookupStatus
  data: PostalLookupView | undefined
  errorKind: PostalLookupErrorKind
}

/**
 * Resolves a 6-digit PIN to City/District/State/Country via the backend
 * proxy.
 *
 * - Only fires once `rawPostalCode` trims to exactly six digits — never on
 *   every keystroke.
 * - Keyed by the PIN, so changing the PIN starts a fresh lookup and the
 *   old one's result is scoped to its own (now unobserved) cache entry —
 *   a late response for a previous PIN can never surface here. React Query
 *   also aborts the previous request's `AbortSignal` (forwarded to axios).
 * - `staleTime: Infinity` — re-typing the same PIN reuses the cached
 *   result instead of hitting the provider again.
 * - `retry: false` — a provider outage should fall back to manual entry
 *   immediately, not hammer the endpoint.
 */
export function usePostalLookup(rawPostalCode: string): PostalLookupResult {
  const postalCode = rawPostalCode.trim()
  const enabled = PIN_CODE_REGEX.test(postalCode)

  const query = useQuery({
    queryKey: ['postal-code', postalCode],
    queryFn: ({ signal }) => lookupPostalCode(postalCode, signal),
    enabled,
    staleTime: Infinity,
    gcTime: 5 * 60 * 1000,
    retry: false,
  })

  if (!enabled) {
    return { status: 'idle', data: undefined, errorKind: null }
  }
  if (query.isSuccess) {
    return { status: 'success', data: query.data, errorKind: null }
  }
  if (query.isError) {
    const code = parseApiError(query.error).code
    return {
      status: 'error',
      data: undefined,
      errorKind: code === 'NOT_FOUND' ? 'not-found' : 'unavailable',
    }
  }
  return { status: 'loading', data: undefined, errorKind: null }
}
