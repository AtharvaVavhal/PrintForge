import { useMutation, useQueryClient } from '@tanstack/react-query'
import { updateReviewStatus } from '@/services/api/admin'
import type { UpdateReviewStatusPayload } from '@/types/admin'

/**
 * Deliberately does NOT invalidate the product's review-list query
 * (['products', productId, 'reviews']) — that list is GET /products/:id/
 * reviews, always PUBLISHED-only server-side with no admin bypass. Moving
 * a review away from PUBLISHED would make it vanish from a refetch, taking
 * the moderation control with it — the same "no way back" dead-end
 * useReactivateProduct's own history warns about. The caller
 * (ProductReviewModeration) patches its own local list from this
 * mutation's response instead, so a row stays visible and re-toggleable
 * for the rest of the admin's session even after it leaves PUBLISHED.
 *
 * Still invalidates the product detail query (avgRating/reviewCount is
 * recomputed from PUBLISHED reviews on every status write,
 * reviews.service.ts's recomputeProductRating) so a customer viewing the
 * product picks up the new aggregate.
 */
export function useUpdateReviewStatus() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateReviewStatusPayload }) =>
      updateReviewStatus(id, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['products', 'detail'] })
    },
  })
}
