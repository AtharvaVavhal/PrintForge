import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createVariant } from '@/services/api/catalog'
import type { CreateVariantPayload } from '@/types/admin'

export function useCreateVariant(productId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreateVariantPayload) => createVariant(productId, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['products', 'list'] })
    },
  })
}
