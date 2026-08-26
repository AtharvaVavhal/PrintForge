import { useQuery } from '@tanstack/react-query'
import { fetchCategories } from '@/services/api/catalog'
import { CATALOG_STALE_TIME_MS } from '@/constants/query'

export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: fetchCategories,
    staleTime: CATALOG_STALE_TIME_MS,
  })
}
