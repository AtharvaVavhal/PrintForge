import { useQuery } from '@tanstack/react-query'
import { fetchAdminOrder } from '@/services/api/admin'

export const adminOrderQueryKey = (orderId: string) => ['admin', 'orders', orderId] as const

/** No polling here, unlike the customer-facing useOrder — that 3s
 * PENDING_PAYMENT poll exists specifically to catch up with the Razorpay
 * webhook after a checkout the customer is actively watching. An admin
 * viewing an order isn't waiting on their own in-flight payment; a normal
 * one-shot fetch (refreshed by the status-change mutation's own cache
 * update) is enough. */
export function useAdminOrder(orderId: string) {
  return useQuery({
    queryKey: adminOrderQueryKey(orderId),
    queryFn: () => fetchAdminOrder(orderId),
  })
}
