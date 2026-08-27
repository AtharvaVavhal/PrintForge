import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createCustomizationField } from '@/services/api/catalog'
import type { CreateCustomizationFieldPayload } from '@/types/admin'

export function useCreateCustomizationField(productId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreateCustomizationFieldPayload) =>
      createCustomizationField(productId, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['products', 'list'] })
    },
  })
}
