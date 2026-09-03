import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { reviewSchema, type ReviewFormValues } from '@/schemas/review.schema'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { RequiredMark } from '@/components/ui/RequiredMark'
import styles from './ReviewForm.module.css'

const RATING_VALUES = ['1', '2', '3', '4', '5'] as const
const BODY_TEXT_MAX = 2000

interface ReviewFormProps {
  defaultValues: ReviewFormValues
  onSubmit: (values: ReviewFormValues) => void
  onCancel?: () => void
  isSubmitting: boolean
  submitError: string | null
  submitLabel: string
}

/** Shared by both "write a review" and "edit my review" — same two
 * fields either way (CreateReviewDto/UpdateReviewDto both take exactly
 * rating + bodyText). Rating is a native radio group, not a custom
 * component wrapped in Controller: RHF's register() already handles a
 * shared-name radio group natively, same as the checkbox/select inputs
 * elsewhere in this codebase (VariantManager, AdminCategoriesPage). */
export function ReviewForm({
  defaultValues,
  onSubmit,
  onCancel,
  isSubmitting,
  submitError,
  submitLabel,
}: ReviewFormProps) {
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<ReviewFormValues>({
    resolver: zodResolver(reviewSchema),
    defaultValues,
  })

  // useWatch (a subscription hook), not the form instance's own watch()
  // function — the latter is a plain function RHF returns fresh per
  // render that can't be memoized, which the React Compiler flags (same
  // reasoning CustomizationForm.tsx already documents for its own use).
  const currentRating = useWatch({ control, name: 'rating', defaultValue: defaultValues.rating })

  return (
    <form className={styles.form} onSubmit={(e) => void handleSubmit(onSubmit)(e)} noValidate>
      {submitError && <Alert variant="error">{submitError}</Alert>}

      <div className={styles.field}>
        <span className={styles.label} id="review-rating-label">
          Your rating
          <RequiredMark />
        </span>
        <div
          className={styles.stars}
          role="radiogroup"
          aria-labelledby="review-rating-label"
          aria-required="true"
        >
          {RATING_VALUES.map((star) => (
            <label key={star} className={styles.starLabel}>
              <input
                type="radio"
                value={star}
                className={styles.starInput}
                aria-label={`${star} star${star === '1' ? '' : 's'}`}
                {...register('rating')}
              />
              <span className={Number(star) <= Number(currentRating) ? styles.starFilled : styles.starEmpty}>
                ★
              </span>
            </label>
          ))}
        </div>
        {errors.rating && (
          <p className={styles.error} role="alert">
            {errors.rating.message}
          </p>
        )}
      </div>

      <div className={styles.field}>
        <label htmlFor="review-body-text" className={styles.label}>
          Your review (optional)
        </label>
        <textarea
          id="review-body-text"
          className={styles.textarea}
          maxLength={BODY_TEXT_MAX}
          rows={4}
          {...register('bodyText')}
        />
        {errors.bodyText && (
          <p className={styles.error} role="alert">
            {errors.bodyText.message}
          </p>
        )}
      </div>

      <div className={styles.actions}>
        <Button type="submit" isLoading={isSubmitting}>
          {submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  )
}
