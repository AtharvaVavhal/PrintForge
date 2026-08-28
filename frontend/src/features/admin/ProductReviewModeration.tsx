import { useState } from 'react'
import { useProductReviews } from '@/hooks/useProductReviews'
import { useUpdateReviewStatus } from '@/hooks/useUpdateReviewStatus'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { getApiErrorMessage } from '@/utils/apiError'
import { formatDate } from '@/utils/formatDate'
import type { ReviewStatus } from '@/types/reviews'
import styles from './ProductReviewModeration.module.css'

interface ProductReviewModerationProps {
  productId: string
}

const PAGE_SIZE = 20

const STATUS_OPTIONS: ReviewStatus[] = ['PUBLISHED', 'REJECTED', 'REMOVED']

/**
 * Admin moderation for this product's reviews (PATCH /admin/reviews/:id/
 * status) — deliberately not a separate AdminReviewsPage: there is no
 * `GET /admin/reviews` (list-all) endpoint, only this per-product public
 * list (GET /products/:id/reviews, always PUBLISHED-only) and the
 * single-review PATCH. A standalone page would have no way to discover
 * which reviews exist across products, so this reuses the one place a
 * product's reviews are already fetched: this product's own admin detail
 * page, which already has `productId` in hand.
 *
 * Real limitation, not solved here: moving a review away from PUBLISHED
 * makes it disappear from a *fresh* fetch of this same list (the endpoint
 * is unconditionally PUBLISHED-only), so a REJECTED/REMOVED review is only
 * re-editable for the rest of THIS component's mounted lifetime — via
 * `statusOverrides` below, which keeps the row visible and its dropdown
 * live without needing a refetch. Navigating away and back loses it, same
 * as the reactivate-flow's own documented gap.
 */
export function ProductReviewModeration({ productId }: ProductReviewModerationProps) {
  const [page, setPage] = useState(1)
  const [statusOverrides, setStatusOverrides] = useState<Record<string, ReviewStatus>>({})
  const reviewsQuery = useProductReviews(productId, { page, limit: PAGE_SIZE })
  const updateStatus = useUpdateReviewStatus()

  const items = reviewsQuery.data?.items ?? []
  const meta = reviewsQuery.data?.meta

  function handleStatusChange(reviewId: string, status: ReviewStatus) {
    updateStatus.mutate(
      { id: reviewId, payload: { status } },
      { onSuccess: () => setStatusOverrides((prev) => ({ ...prev, [reviewId]: status })) },
    )
  }

  return (
    <div className={styles.wrap}>
      <h2 className={styles.heading}>Reviews</h2>

      {reviewsQuery.isPending && <Skeleton className={styles.skeleton} />}

      {reviewsQuery.isError && <Alert variant="error">{getApiErrorMessage(reviewsQuery.error)}</Alert>}

      {updateStatus.isError && <Alert variant="error">{getApiErrorMessage(updateStatus.error)}</Alert>}

      {reviewsQuery.data && items.length === 0 && (
        <p className={styles.empty}>No published reviews for this product.</p>
      )}

      {items.length > 0 && (
        <ul className={styles.list}>
          {items.map((review) => {
            const currentStatus = statusOverrides[review.id] ?? review.status
            return (
              <li key={review.id} className={styles.row}>
                <div className={styles.summary}>
                  <span className={styles.rating}>{review.rating}★</span>
                  {review.bodyText && <span className={styles.body}>{review.bodyText}</span>}
                  <span className={styles.date}>{formatDate(review.createdAt)}</span>
                </div>
                <div className={styles.selectField}>
                  <label htmlFor={`review-status-${review.id}`} className={styles.selectLabel}>
                    Status
                  </label>
                  <select
                    id={`review-status-${review.id}`}
                    className={styles.select}
                    value={currentStatus}
                    disabled={updateStatus.isPending}
                    onChange={(event) =>
                      handleStatusChange(review.id, event.target.value as ReviewStatus)
                    }
                  >
                    {STATUS_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {meta && meta.totalPages > 1 && (
        <div className={styles.pagination}>
          <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <span className={styles.pageIndicator}>
            Page {meta.page} of {meta.totalPages}
          </span>
          <Button
            variant="secondary"
            disabled={page >= meta.totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  )
}
