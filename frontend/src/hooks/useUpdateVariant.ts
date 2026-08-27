import { useMutation, useQueryClient } from '@tanstack/react-query'
import { updateVariant } from '@/services/api/catalog'
import type { UpdateVariantPayload } from '@/types/admin'

export function useUpdateVariant(productId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ variantId, payload }: { variantId: string; payload: UpdateVariantPayload }) =>
      updateVariant(productId, variantId, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['products', 'list'] })
    },
  })
}
