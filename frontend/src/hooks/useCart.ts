import { useQuery } from '@tanstack/react-query'
import { fetchCart } from '@/services/api/cart'
import { useAuth } from './useAuth'

export const CART_QUERY_KEY = ['cart'] as const

/**
 * §18: cart is `staleTime: 0, refetchOnWindowFocus: true` — the opposite of
 * catalog's 5-minute staleTime (constants/query.ts) — because price/
 * availability must always reflect the latest server state, never a stale
 * cache. `enabled` on auth status: GET /cart requires auth (no @Public()
 * on cart.controller.ts, no guest cart §10), and this hook is called from
 * the header on every page including public ones — without this gate,
 * every anonymous visitor would fire a doomed, interceptor-retried request.
 */
export function useCart() {
  const { status } = useAuth()
  return useQuery({
    queryKey: CART_QUERY_KEY,
    queryFn: fetchCart,
    enabled: status === 'authenticated',
    staleTime: 0,
    refetchOnWindowFocus: true,
  })
}
