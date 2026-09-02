import { useId, useState } from 'react'
import { useProductReviews } from '@/hooks/useProductReviews'
import { useUpdateReviewStatus } from '@/hooks/useUpdateReviewStatus'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { AdminCard } from '@/components/admin/AdminCard'
import { AdminTable } from '@/components/admin/AdminTable'
import { AdminBadge } from '@/components/admin/AdminBadge'
import { AdminEmptyState } from '@/components/admin/AdminEmptyState'
import { AdminPagination } from '@/components/admin/AdminPagination'
import { getApiErrorMessage } from '@/utils/apiError'
import { formatDate } from '@/utils/formatDate'
import type { ReviewStatus } from '@/types/reviews'
import { reviewStatusInfo } from './reviewStatus'
import styles from './ProductReviewModeration.module.css'

interface ProductReviewModerationProps {
  productId: string
}

const PAGE_SIZE = 20
const STAR_COUNT = 5
const TABLE_COLUMNS = 6

/** Opaque, deterministic short token for a review's author — `ReviewView`
 * carries only `userId` (no name/email), so this just makes rows tellable
 * apart without pretending to be a real customer identity. */
function reviewerToken(userId: string): string {
  return `#${userId.replace(/[^a-z0-9]/gi, '').slice(0, 6) || userId.slice(0, 6)}`
}

function RatingStars({ rating }: { rating: number }) {
  return (
    <span className={styles.rating} role="img" aria-label={`${rating} out of 5 stars`}>
      <span aria-hidden="true" className={styles.stars}>
        {'★'.repeat(rating)}
        {'☆'.repeat(Math.max(0, STAR_COUNT - rating))}
      </span>
      <span aria-hidden="true" className={styles.ratingNum}>
        {rating}
      </span>
    </span>
  )
}

/**
 * Admin moderation for THIS product's reviews (PATCH /admin/reviews/:id/
 * status) — deliberately not a standalone AdminReviewsPage: there is no
 * `GET /admin/reviews` (list-all) endpoint, only the per-product public
 * list (GET /products/:id/reviews, always PUBLISHED-only, paginated,
 * createdAt-desc, page/limit only) and the single-review status PATCH.
 *
 * Preserved limitation, not solved here: moving a review away from
 * PUBLISHED makes it disappear from a *fresh* fetch of this same list
 * (the endpoint is unconditionally PUBLISHED-only), so a REJECTED/REMOVED
 * review is only re-editable for the rest of THIS component's mounted
 * lifetime — via `statusOverrides`, which keeps the row visible and its
 * action live without a refetch (`useUpdateReviewStatus` deliberately
 * does NOT invalidate this list). Navigating away and back loses it.
 */
export function ProductReviewModeration({ productId }: ProductReviewModerationProps) {
  const headingId = useId()
  const [page, setPage] = useState(1)
  const [statusOverrides, setStatusOverrides] = useState<Record<string, ReviewStatus>>({})
  const [pendingRejectId, setPendingRejectId] = useState<string | null>(null)

  const reviewsQuery = useProductReviews(productId, { page, limit: PAGE_SIZE })
  const updateStatus = useUpdateReviewStatus()

  const items = reviewsQuery.data?.items ?? []
  const meta = reviewsQuery.data?.meta

  const listError = reviewsQuery.isError ? getApiErrorMessage(reviewsQuery.error) : null
  const moderationError = updateStatus.isError ? getApiErrorMessage(updateStatus.error) : null

  function moderate(reviewId: string, status: ReviewStatus, onSettled?: () => void) {
    updateStatus.mutate(
      { id: reviewId, payload: { status } },
      {
        // Keep the just-moderated row visible/re-toggleable for the rest
        // of this mount — the list refetch would drop it (PUBLISHED-only).
        onSuccess: () => setStatusOverrides((prev) => ({ ...prev, [reviewId]: status })),
        onSettled,
      },
    )
  }

  function confirmReject() {
    if (!pendingRejectId) return
    moderate(pendingRejectId, 'REJECTED', () => setPendingRejectId(null))
  }

  const isPendingFor = (reviewId: string) =>
    updateStatus.isPending && updateStatus.variables?.id === reviewId

  return (
    <section aria-labelledby={headingId} className={styles.section}>
      <h2 id={headingId} className={styles.heading}>
        Reviews
      </h2>

      {listError && <Alert variant="error">{listError}</Alert>}
      {moderationError && <Alert variant="error">{moderationError}</Alert>}

      <div className={styles.results} aria-busy={reviewsQuery.isFetching || undefined}>
        {reviewsQuery.isPending ? (
          <AdminCard flush>
            <AdminTable caption="Reviews for this product">
              <ReviewTableHead />
              <AdminTable.SkeletonBody columns={TABLE_COLUMNS} />
            </AdminTable>
          </AdminCard>
        ) : items.length === 0 ? (
          <AdminEmptyState
            title="No published reviews yet"
            description="Reviews rejected or removed from the storefront are not shown here — this list only carries published reviews."
          />
        ) : (
          <>
            <AdminCard flush>
              <AdminTable caption="Reviews for this product">
                <ReviewTableHead />
                <AdminTable.Body>
                  {items.map((review) => {
                    const status = statusOverrides[review.id] ?? review.status
                    const badge = reviewStatusInfo(status)
                    return (
                      <AdminTable.Row key={review.id}>
                        <AdminTable.Cell>
                          <RatingStars rating={review.rating} />
                        </AdminTable.Cell>
                        <AdminTable.Cell>
                          {review.bodyText ? (
                            <span className={styles.body} title={review.bodyText}>
                              {review.bodyText}
                            </span>
                          ) : (
                            <span className={styles.muted}>—</span>
                          )}
                        </AdminTable.Cell>
                        <AdminTable.Cell>
                          <span className={styles.reviewer} title={review.userId}>
                            {reviewerToken(review.userId)}
                          </span>
                        </AdminTable.Cell>
                        <AdminTable.Cell>{formatDate(review.createdAt)}</AdminTable.Cell>
                        <AdminTable.Cell>
                          <AdminBadge variant={badge.variant}>{badge.label}</AdminBadge>
                        </AdminTable.Cell>
                        <AdminTable.Cell>
                          {status === 'PUBLISHED' ? (
                            <Button
                              type="button"
                              variant="secondary"
                              onClick={() => setPendingRejectId(review.id)}
                            >
                              Reject
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              variant="secondary"
                              isLoading={isPendingFor(review.id)}
                              onClick={() => moderate(review.id, 'PUBLISHED')}
                            >
                              Publish
                            </Button>
                          )}
                        </AdminTable.Cell>
                      </AdminTable.Row>
                    )
                  })}
                </AdminTable.Body>
              </AdminTable>
            </AdminCard>

            {meta && (
              <AdminPagination
                page={meta.page}
                totalPages={meta.totalPages}
                onPageChange={setPage}
                label="Reviews pagination"
              />
            )}
          </>
        )}
      </div>

      <Modal
        isOpen={pendingRejectId !== null}
        onClose={() => setPendingRejectId(null)}
        title="Reject this review"
        size="sm"
      >
        <div className={styles.confirm}>
          <p>
            This review will no longer appear on the storefront, and the product&rsquo;s rating
            and review count will be recalculated. You can publish it again later.
          </p>
          <div className={styles.confirmActions}>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setPendingRejectId(null)}
              disabled={updateStatus.isPending}
            >
              Cancel
            </Button>
            <Button type="button" isLoading={updateStatus.isPending} onClick={confirmReject}>
              Reject review
            </Button>
          </div>
        </div>
      </Modal>
    </section>
  )
}

function ReviewTableHead() {
  return (
    <AdminTable.Head>
      <AdminTable.Row>
        <AdminTable.HeaderCell>Rating</AdminTable.HeaderCell>
        <AdminTable.HeaderCell>Review</AdminTable.HeaderCell>
        <AdminTable.HeaderCell>Reviewer</AdminTable.HeaderCell>
        <AdminTable.HeaderCell>Date</AdminTable.HeaderCell>
        <AdminTable.HeaderCell>Status</AdminTable.HeaderCell>
        <AdminTable.HeaderCell>Actions</AdminTable.HeaderCell>
      </AdminTable.Row>
    </AdminTable.Head>
  )
}
