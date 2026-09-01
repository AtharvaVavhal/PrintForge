import { useMutation, useQueryClient } from '@tanstack/react-query'
import { deactivateCategory } from '@/services/api/catalog'

/** Soft-delete (isActive=false). Invalidates every ['categories', ...]
 * query so both the admin list and the public list/tree refetch. */
export function useDeactivateCategory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deactivateCategory(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['categories'] })
    },
  })
}
