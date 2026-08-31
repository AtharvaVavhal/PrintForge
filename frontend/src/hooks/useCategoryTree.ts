import { useQuery } from '@tanstack/react-query'
import { fetchCategoryTree } from '@/services/api/catalog'
import { CATALOG_STALE_TIME_MS } from '@/constants/query'
import type { CategoryTreeNode } from '@/types/catalog'

export function useCategoryTree() {
  return useQuery<CategoryTreeNode[]>({
    queryKey: ['categories', 'tree'],
    queryFn: fetchCategoryTree,
    staleTime: CATALOG_STALE_TIME_MS,
  })
}
