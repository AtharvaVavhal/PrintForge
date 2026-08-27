import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createCategory } from '@/services/api/catalog'

export function useCreateCategory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createCategory,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['categories'] })
    },
  })
}
