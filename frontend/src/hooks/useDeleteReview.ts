import { useMutation, useQueryClient } from '@tanstack/react-query'
import { deleteReview } from '@/services/api/reviews'

/**
 * DELETE /reviews/:id is soft (status -> REMOVED, reviews.service.ts) —
 * the row still exists server-side. It "visibly disappears from the list"
 * for free after this invalidation, with no client-side filtering needed
 * here: GET /products/:id/reviews always filters to PUBLISHED-only
 * unconditionally, so a REMOVED review simply stops coming back on the
 * next fetch.
 */
export function useDeleteReview(productId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: deleteReview,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['products', productId, 'reviews'] })
      void queryClient.invalidateQueries({ queryKey: ['products', 'detail'] })
    },
  })
}
