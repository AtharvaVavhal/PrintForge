import { useMutation, useQueryClient } from '@tanstack/react-query'
import { updateProduct } from '@/services/api/catalog'
import type { UpdateProductPayload } from '@/types/admin'

export function useUpdateProduct(productId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: UpdateProductPayload) => updateProduct(productId, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['products', 'list'] })
    },
  })
}
