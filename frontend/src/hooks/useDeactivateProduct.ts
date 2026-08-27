import { useMutation, useQueryClient } from '@tanstack/react-query'
import { deactivateProduct } from '@/services/api/catalog'

/** No reactivate hook exists — there's no reactivate endpoint on the
 * backend (deactivateProduct's own doc comment). Once deactivated, a
 * product also drops out of GET /products entirely (isActive-filtered),
 * so it becomes unreachable through this admin UI too. */
export function useDeactivateProduct(productId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => deactivateProduct(productId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['products', 'list'] })
    },
  })
}
