import type { ApiSuccessResponse, PaginationMeta } from '@/types/api'
import type {
  CreateReviewPayload,
  ListProductReviewsParams,
  ReviewView,
  UpdateReviewPayload,
} from '@/types/reviews'
import { apiClient } from './client'

/** Thin wrappers over backend/src/reviews/{reviews,product-reviews}.controller.ts. */

export interface ProductReviewListResult {
  items: ReviewView[]
  meta: PaginationMeta
}

/** GET /products/:id/reviews — public, always PUBLISHED-only server-side
 * (no admin/author bypass — confirmed against reviews.service.ts's
 * listForProduct, which hardcodes the status filter unconditionally). Note
 * the path param is the product's `id` (a UUID), not its `slug`. */
export async function fetchProductReviews(
  productId: string,
  params: ListProductReviewsParams = {},
): Promise<ProductReviewListResult> {
  const res = await apiClient.get<ApiSuccessResponse<ReviewView[]>>(
    `/products/${encodeURIComponent(productId)}/reviews`,
    { params },
  )
  return { items: res.data.data, meta: res.data.meta as PaginationMeta }
}

/** POST /reviews — the verified-purchase gate is entirely server-side; a
 * caller with no DELIVERED order for this product gets a 409, surfaced via
 * getApiErrorMessage same as any other mutation error. */
export async function createReview(payload: CreateReviewPayload): Promise<ReviewView> {
  const res = await apiClient.post<ApiSuccessResponse<ReviewView>>('/reviews', payload)
  return res.data.data
}

export async function updateReview(id: string, payload: UpdateReviewPayload): Promise<ReviewView> {
  const res = await apiClient.patch<ApiSuccessResponse<ReviewView>>(`/reviews/${id}`, payload)
  return res.data.data
}

/** DELETE /reviews/:id — soft (status -> REMOVED), never a real row
 * delete. The backend still returns the (now-REMOVED) ReviewView; callers
 * that want the review gone from a displayed list must remove it from
 * local state themselves — see useDeleteReview. */
export async function deleteReview(id: string): Promise<void> {
  await apiClient.delete(`/reviews/${id}`)
}
