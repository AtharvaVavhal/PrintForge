import { useMutation, useQueryClient } from '@tanstack/react-query'
import { updateCustomizationField } from '@/services/api/catalog'
import type { UpdateCustomizationFieldPayload } from '@/types/admin'

export function useUpdateCustomizationField(productId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      fieldId,
      payload,
    }: {
      fieldId: string
      payload: UpdateCustomizationFieldPayload
    }) => updateCustomizationField(productId, fieldId, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['products', 'list'] })
    },
  })
}
