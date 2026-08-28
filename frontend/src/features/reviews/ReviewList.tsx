import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useProductReviews } from '@/hooks/useProductReviews'
import { useCreateReview } from '@/hooks/useCreateReview'
import { useUpdateReview } from '@/hooks/useUpdateReview'
import { useDeleteReview } from '@/hooks/useDeleteReview'
import {
  EMPTY_REVIEW_FORM_VALUES,
  toCreateReviewPayload,
  toUpdateReviewPayload,
  type ReviewFormValues,
} from '@/schemas/review.schema'
import { ReviewForm } from './ReviewForm'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { Skeleton } from '@/components/ui/Skeleton'
import { getApiErrorMessage } from '@/utils/apiError'
import { formatDate } from '@/utils/formatDate'
import { ROUTES } from '@/constants/routes'
import type { ReviewView } from '@/types/reviews'
import styles from './ReviewList.module.css'

interface ReviewListProps {
  productId: string
}

const PAGE_SIZE = 10

const STAR_COUNT = 5

function ReviewStars({ rating }: { rating: number }) {
  return (
    <span className={styles.itemStars} aria-label={`${rating} out of 5 stars`}>
      {Array.from({ length: STAR_COUNT }, (_, i) => (
        <span key={i} className={i < rating ? styles.starFilled : styles.starEmpty} aria-hidden="true">
          ★
        </span>
      ))}
    </span>
  )
}

/**
 * Paginated review list + the write/edit/delete surface for the current
 * user's own review, all in one component (mirrors VariantManager's
 * "manager owns its own list + inline form" shape).
 *
 * ReviewView has no author name/email (confirmed against
 * review-view.interface.ts — userId only), so every review is labeled
 * "Verified buyer" generically, with a "(You)" tag on the caller's own.
 *
 * Eligibility to write a review (a DELIVERED order containing this
 * product) has no client-checkable endpoint — the form is shown to any
 * authenticated user without an existing review on the *currently fetched
 * page*, and submitted optimistically; a 409 from the server-side
 * verified-purchase gate surfaces as a normal form error. An unauthenticated
 * click redirects to /login, same pattern as AddToCartControls.
 *
 * Known limitation: "does this user already have a review" is only
 * checked against the current page's results, not the whole list — if a
 * user's own (old) review has been pushed to a later page by newer
 * reviews, the write form may incorrectly reappear rather than showing
 * edit/delete. There is no "my review for this product" endpoint to check
 * this reliably; not solved here.
 */
export function ReviewList({ productId }: ReviewListProps) {
  const { status, user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [page, setPage] = useState(1)
  const [isWriting, setIsWriting] = useState(false)
  const [isEditing, setIsEditing] = useState(false)

  const reviewsQuery = useProductReviews(productId, { page, limit: PAGE_SIZE })
  const createReview = useCreateReview(productId)
  const updateReview = useUpdateReview(productId)
  const deleteReview = useDeleteReview(productId)

  const items = reviewsQuery.data?.items ?? []
  const ownReview: ReviewView | undefined = user ? items.find((r) => r.userId === user.id) : undefined

  function handleWriteClick() {
    if (status !== 'authenticated') {
      void navigate(ROUTES.LOGIN, { state: { from: location } })
      return
    }
    createReview.reset()
    setIsWriting(true)
  }

  async function handleCreate(values: ReviewFormValues) {
    try {
      await createReview.mutateAsync(toCreateReviewPayload(productId, values))
      setIsWriting(false)
    } catch {
      // Error surfaced via createReview.isError below; form stays open.
    }
  }

  async function handleUpdate(values: ReviewFormValues) {
    if (!ownReview) return
    try {
      await updateReview.mutateAsync({ id: ownReview.id, payload: toUpdateReviewPayload(values) })
      setIsEditing(false)
    } catch {
      // Error surfaced via updateReview.isError below; form stays open.
    }
  }

  async function handleDelete() {
    if (!ownReview) return
    try {
      await deleteReview.mutateAsync(ownReview.id)
    } catch {
      // Error surfaced via deleteReview.isError below.
    }
  }

  const meta = reviewsQuery.data?.meta

  return (
    <section className={styles.wrap}>
      <h2 className={styles.heading}>Reviews</h2>

      {reviewsQuery.isPending && <Skeleton className={styles.skeleton} />}

      {reviewsQuery.isError && <Alert variant="error">{getApiErrorMessage(reviewsQuery.error)}</Alert>}

      {reviewsQuery.data && items.length === 0 && <p className={styles.empty}>No reviews yet.</p>}

      {items.length > 0 && (
        <ul className={styles.list}>
          {items.map((review) => {
            const isOwn = review.userId === user?.id
            return (
              <li key={review.id} className={styles.item}>
                <div className={styles.itemHeader}>
                  <ReviewStars rating={review.rating} />
                  <span className={styles.author}>
                    Verified buyer{isOwn && <span className={styles.youTag}> (You)</span>}
                  </span>
                  <span className={styles.date}>{formatDate(review.createdAt)}</span>
                </div>

                {review.bodyText && <p className={styles.body}>{review.bodyText}</p>}

                {isOwn && !isEditing && (
                  <div className={styles.ownActions}>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => {
                        updateReview.reset()
                        setIsEditing(true)
                      }}
                    >
                      Edit
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      isLoading={deleteReview.isPending}
                      onClick={() => void handleDelete()}
                    >
                      Delete
                    </Button>
                  </div>
                )}

                {isOwn && isEditing && (
                  <ReviewForm
                    defaultValues={{ rating: String(review.rating) as ReviewFormValues['rating'], bodyText: review.bodyText ?? '' }}
                    onSubmit={(values) => void handleUpdate(values)}
                    onCancel={() => setIsEditing(false)}
                    isSubmitting={updateReview.isPending}
                    submitError={updateReview.isError ? getApiErrorMessage(updateReview.error) : null}
                    submitLabel="Save"
                  />
                )}

                {isOwn && deleteReview.isError && (
                  <Alert variant="error">{getApiErrorMessage(deleteReview.error)}</Alert>
                )}
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

      {!ownReview && !isWriting && (
        <Button type="button" variant="secondary" onClick={handleWriteClick}>
          Write a review
        </Button>
      )}

      {!ownReview && isWriting && (
        <ReviewForm
          defaultValues={EMPTY_REVIEW_FORM_VALUES}
          onSubmit={(values) => void handleCreate(values)}
          onCancel={() => setIsWriting(false)}
          isSubmitting={createReview.isPending}
          submitError={createReview.isError ? getApiErrorMessage(createReview.error) : null}
          submitLabel="Submit review"
        />
      )}
    </section>
  )
}
