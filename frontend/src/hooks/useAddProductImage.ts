import { useMutation, useQueryClient } from '@tanstack/react-query'
import { addProductImage } from '@/services/api/catalog'
import type { CreateProductImagePayload } from '@/types/admin'

export function useAddProductImage(productId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreateProductImagePayload) => addProductImage(productId, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['products', 'list'] })
    },
  })
}
