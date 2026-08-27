import { useMutation, useQueryClient } from '@tanstack/react-query'
import { updateCategory } from '@/services/api/catalog'
import type { UpdateCategoryPayload } from '@/types/admin'

export function useUpdateCategory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateCategoryPayload }) =>
      updateCategory(id, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['categories'] })
    },
  })
}
