import { useQuery } from '@tanstack/react-query'
import { fetchProductBySlug } from '@/services/api/catalog'
import { CATALOG_STALE_TIME_MS } from '@/constants/query'

export function useProduct(slug: string | undefined) {
  return useQuery({
    queryKey: ['products', 'detail', slug],
    queryFn: () => fetchProductBySlug(slug as string),
    enabled: Boolean(slug),
    staleTime: CATALOG_STALE_TIME_MS,
  })
}
