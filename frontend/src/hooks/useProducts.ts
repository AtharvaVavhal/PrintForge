import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { fetchProducts } from '@/services/api/catalog'
import type { ListProductsParams } from '@/types/catalog'
import { CATALOG_STALE_TIME_MS } from '@/constants/query'

export function useProducts(params: ListProductsParams = {}) {
  return useQuery({
    queryKey: ['products', 'list', params],
    queryFn: () => fetchProducts(params),
    staleTime: CATALOG_STALE_TIME_MS,
    // Keeps the current grid visible (no loading flash) while a new
    // page/filter's data loads in the background.
    placeholderData: keepPreviousData,
  })
}
