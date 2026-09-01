import { useMutation, useQueryClient } from '@tanstack/react-query'
import { deactivateProduct } from '@/services/api/catalog'

/** See useReactivateProduct for the reverse action. Invalidates every
 * ['products', ...] query — the public list stops returning the product,
 * and the admin list (GET /products/admin) now keeps it visible with an
 * "Inactive" badge so it stays reachable for reactivation. */
export function useDeactivateProduct(productId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => deactivateProduct(productId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['products'] })
    },
  })
}
