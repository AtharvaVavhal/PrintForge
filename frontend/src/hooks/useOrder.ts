import { useQuery } from '@tanstack/react-query'
import { fetchOrder } from '@/services/api/orders'

export const orderQueryKey = (orderId: string) => ['orders', orderId] as const

/**
 * GET /orders/:id, polled every 3s while the order is still
 * PENDING_PAYMENT. POST /payments/verify is a UX accelerant, not the
 * source of truth (§13.G) — the webhook may confirm or fail the payment
 * slightly after verify() returns, so a page showing this order can't just
 * render one snapshot the way a normal detail view would. Polling stops
 * the instant the order leaves PENDING_PAYMENT.
 */
export function useOrder(orderId: string) {
  return useQuery({
    queryKey: orderQueryKey(orderId),
    queryFn: () => fetchOrder(orderId),
    refetchInterval: (query) => (query.state.data?.status === 'PENDING_PAYMENT' ? 3000 : false),
  })
}
