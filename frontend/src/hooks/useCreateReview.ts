import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createReview } from '@/services/api/reviews'

/**
 * On success: invalidates both this product's review list (all pages) and
 * its detail query — the latter is what carries the denormalized
 * avgRating/reviewCount that just changed server-side (reviews.service.ts
 * recomputes it in the same transaction as the write). Invalidated by key
 * prefix (`['products', 'detail']`, matching useProduct's own key
 * regardless of which slug), not a targeted patch — this hook only has
 * productId, not the slug useProduct.ts keys on.
 *
 * A 409 (no DELIVERED order for this product) surfaces as a normal
 * mutation error via getApiErrorMessage, same as everywhere else — there
 * is no client-side eligibility pre-check (no endpoint exists for one);
 * see features/reviews/ReviewList.tsx for the "submit optimistically"
 * rationale.
 */
export function useCreateReview(productId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createReview,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['products', productId, 'reviews'] })
      void queryClient.invalidateQueries({ queryKey: ['products', 'detail'] })
    },
  })
}
