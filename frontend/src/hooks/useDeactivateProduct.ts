import { useMutation, useQueryClient } from '@tanstack/react-query'
import { deactivateProduct } from '@/services/api/catalog'

/** See useReactivateProduct for the reverse action. Once deactivated, a
 * product drops out of GET /products entirely (isActive-filtered) — the
 * one place it's still reachable to reactivate is this same detail page,
 * immediately after deactivating, before navigating away (see
 * AdminProductDetailPage's own doc comment for why the products *list*
 * can never offer this action). */
export function useDeactivateProduct(productId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => deactivateProduct(productId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['products', 'list'] })
    },
  })
}
