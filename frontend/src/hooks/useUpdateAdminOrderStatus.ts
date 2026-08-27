import { useMutation, useQueryClient } from '@tanstack/react-query'
import { updateAdminOrderStatus } from '@/services/api/admin'
import type { OrderDetailView } from '@/types/orders'
import type { UpdateOrderStatusPayload } from '@/types/admin'
import { adminOrderQueryKey } from './useAdminOrder'
import { ADMIN_DASHBOARD_QUERY_KEY } from './useAdminDashboard'

/**
 * Submits the requested status as-is — no client-side legality check (the
 * backend's state machine is the only source of truth; an illegal
 * transition surfaces as a normal mutation error, rendered from
 * getApiErrorMessage same as everywhere else). On success: patches this
 * order's own cache entry from the response (same dual strategy as
 * useUpdateCartItem/useUpdateProfile) and invalidates the admin orders
 * list + dashboard, since a status change shifts both the per-status
 * counts and the revenue sum.
 */
export function useUpdateAdminOrderStatus(orderId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: UpdateOrderStatusPayload) => updateAdminOrderStatus(orderId, payload),
    onSuccess: (order) => {
      queryClient.setQueryData<OrderDetailView>(adminOrderQueryKey(orderId), order)
      void queryClient.invalidateQueries({ queryKey: ['admin', 'orders', 'list'] })
      void queryClient.invalidateQueries({ queryKey: ADMIN_DASHBOARD_QUERY_KEY })
    },
  })
}
