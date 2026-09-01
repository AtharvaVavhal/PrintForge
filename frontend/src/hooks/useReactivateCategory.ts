import { useMutation, useQueryClient } from '@tanstack/react-query'
import { reactivateCategory } from '@/services/api/catalog'

/** Mirrors useDeactivateCategory. */
export function useReactivateCategory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => reactivateCategory(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['categories'] })
    },
  })
}
