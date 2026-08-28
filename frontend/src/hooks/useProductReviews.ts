import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { fetchProductReviews } from '@/services/api/reviews'
import type { ListProductReviewsParams } from '@/types/reviews'

export function productReviewsQueryKey(productId: string, params: ListProductReviewsParams = {}) {
  return ['products', productId, 'reviews', params] as const
}

/** GET /products/:id/reviews — public, no auth required to view. Same
 * keepPreviousData pagination pattern as useOrders/useAdminOrders. */
export function useProductReviews(productId: string, params: ListProductReviewsParams = {}) {
  return useQuery({
    queryKey: productReviewsQueryKey(productId, params),
    queryFn: () => fetchProductReviews(productId, params),
    enabled: Boolean(productId),
    placeholderData: keepPreviousData,
  })
}
