/**
 * Mirrors backend/src/reviews/dto/review-view.interface.ts and its request
 * DTOs. ReviewView is deliberately thin — `userId` only, no name/email
 * (confirmed against the actual interface before assuming otherwise; the
 * backend never joins to the users table for this response). Rendering
 * "who wrote this" therefore can't show a real name — see
 * features/reviews/ReviewList.tsx for how that's handled.
 */

export type ReviewStatus = 'PUBLISHED' | 'REJECTED' | 'REMOVED'

export interface ReviewView {
  id: string
  productId: string
  userId: string
  rating: number
  bodyText: string | null
  status: ReviewStatus
  createdAt: string
  updatedAt: string
}

/** GET /products/:id/reviews only accepts page/limit
 * (ListProductReviewsQueryDto) — no status filter (always PUBLISHED-only,
 * server-enforced, no admin bypass). */
export interface ListProductReviewsParams {
  page?: number
  limit?: number
}

/** POST /reviews — `productId` is the only anchor; the verified-purchase
 * check (a DELIVERED order containing this product) happens entirely
 * server-side from the caller's own id, never a client-supplied
 * orderId/orderItemId. */
export interface CreateReviewPayload {
  productId: string
  rating: number
  bodyText?: string
}

/** PATCH /reviews/:id — author-only, rating/bodyText only. No `status`
 * field: whitelist:true/forbidNonWhitelisted:true (main.ts) rejects one
 * with a 400, same as UpdateProfileDto rejecting `email`. */
export interface UpdateReviewPayload {
  rating?: number
  bodyText?: string
}
