import { useQuery } from '@tanstack/react-query'
import { fetchAdminProduct } from '@/services/api/catalog'
import { CATALOG_STALE_TIME_MS } from '@/constants/query'

/** Admin single-product read by id (GET /products/admin/:id) — NOT
 * isActive-filtered, so a deactivated product opened from a direct link
 * or a page refresh still loads. Disabled for the create route ("new"). */
export function useAdminProduct(id: string | undefined) {
  return useQuery({
    queryKey: ['products', 'admin', 'detail', id],
    queryFn: () => fetchAdminProduct(id as string),
    enabled: Boolean(id) && id !== 'new',
    staleTime: CATALOG_STALE_TIME_MS,
  })
}
