import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { fetchOrders } from '@/services/api/orders'
import type { ListOrdersParams } from '@/types/orders'

export function useOrders(params: ListOrdersParams = {}) {
  return useQuery({
    queryKey: ['orders', 'list', params],
    queryFn: () => fetchOrders(params),
    // Keeps the current page visible (no loading flash) while a new
    // page's data loads in the background — same as useProducts.
    placeholderData: keepPreviousData,
  })
}
