import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { fetchAdminOrders } from '@/services/api/admin'
import type { ListAdminOrdersParams } from '@/types/admin'

export function useAdminOrders(params: ListAdminOrdersParams = {}) {
  return useQuery({
    queryKey: ['admin', 'orders', 'list', params],
    queryFn: () => fetchAdminOrders(params),
    // Same as useOrders — keeps the current page visible while the next
    // page loads, instead of a loading flash between pages.
    placeholderData: keepPreviousData,
  })
}
