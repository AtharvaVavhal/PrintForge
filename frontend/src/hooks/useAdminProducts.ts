import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { fetchAdminProducts } from '@/services/api/catalog'
import type { ListAdminProductsParams } from '@/types/catalog'
import { CATALOG_STALE_TIME_MS } from '@/constants/query'

/** Admin catalog-management list — includes inactive products, unlike
 * useProducts. */
export function useAdminProducts(params: ListAdminProductsParams = {}) {
  return useQuery({
    queryKey: ['products', 'admin', 'list', params],
    queryFn: () => fetchAdminProducts(params),
    staleTime: CATALOG_STALE_TIME_MS,
    placeholderData: keepPreviousData,
  })
}
