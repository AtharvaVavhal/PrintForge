import { QueryClient } from '@tanstack/react-query'

/**
 * Single QueryClient for the app. Deliberately no global staleTime/
 * refetchOnWindowFocus override here — the cart resource (§18) will need
 * `staleTime: 0, refetchOnWindowFocus: true` on its own query, and other
 * resources will want their own tuning; a global default here would just
 * fight per-query overrides added later. `retry: 1` softens transient
 * network blips without masking a genuinely failing request.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
    },
  },
})
