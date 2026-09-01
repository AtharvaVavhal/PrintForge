import { useQuery } from '@tanstack/react-query'
import { fetchAdminCategories } from '@/services/api/catalog'
import { CATALOG_STALE_TIME_MS } from '@/constants/query'

/** Admin-only category list — active AND inactive. Distinct query key
 * from useCategories (the public list) so the two caches don't collide;
 * both are invalidated by the category mutations below. */
export function useAdminCategories() {
  return useQuery({
    queryKey: ['categories', 'admin'],
    queryFn: fetchAdminCategories,
    staleTime: CATALOG_STALE_TIME_MS,
  })
}
