import { useMutation, useQueryClient } from '@tanstack/react-query'
import { removeProductImage } from '@/services/api/catalog'

export function useRemoveProductImage(productId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (imageId: string) => removeProductImage(productId, imageId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['products', 'list'] })
    },
  })
}
