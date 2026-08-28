import { useMutation, useQueryClient } from '@tanstack/react-query'
import { updateReview } from '@/services/api/reviews'
import type { UpdateReviewPayload } from '@/types/reviews'

/** A rating edit changes the product's avgRating too — same double
 * invalidation as useCreateReview. */
export function useUpdateReview(productId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateReviewPayload }) =>
      updateReview(id, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['products', productId, 'reviews'] })
      void queryClient.invalidateQueries({ queryKey: ['products', 'detail'] })
    },
  })
}
