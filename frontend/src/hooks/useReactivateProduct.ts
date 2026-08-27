import { useMutation, useQueryClient } from '@tanstack/react-query'
import { reactivateProduct } from '@/services/api/catalog'

/** Mirrors useDeactivateProduct exactly. */
export function useReactivateProduct(productId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => reactivateProduct(productId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['products', 'list'] })
    },
  })
}
