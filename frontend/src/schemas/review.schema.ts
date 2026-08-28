import { z } from 'zod'
import type { CreateReviewPayload, UpdateReviewPayload } from '@/types/reviews'

/**
 * Mirrors backend/src/reviews/dto/{create,update}-review.dto.ts field-for-
 * field — a UX convenience only, the server re-validates independently.
 * `rating` stays a plain string here (an HTML radio/select group's value
 * is always a string) rather than a number, same reasoning
 * adminProduct.schema.ts documents for its own numeric fields: no
 * `.transform()` inside the schema, so useForm's input/output types match
 * without special zodResolver configuration. The string-to-payload
 * conversion happens in toCreateReviewPayload/toUpdateReviewPayload below.
 *
 * No `productId` field — that's supplied by the caller (ReviewList already
 * has it from the page it's rendered on), never user-editable form input.
 */

const RATING_VALUES = ['1', '2', '3', '4', '5'] as const
const RATING_MESSAGE = 'Select a rating from 1 to 5 stars'
const BODY_TEXT_MAX = 2000

export const reviewSchema = z.object({
  rating: z.enum(RATING_VALUES, { message: RATING_MESSAGE }),
  bodyText: z.string().trim().max(BODY_TEXT_MAX, `Must be ${BODY_TEXT_MAX} characters or fewer`),
})

export type ReviewFormValues = z.infer<typeof reviewSchema>

export const EMPTY_REVIEW_FORM_VALUES: ReviewFormValues = { rating: '5', bodyText: '' }

export function toCreateReviewPayload(
  productId: string,
  values: ReviewFormValues,
): CreateReviewPayload {
  return {
    productId,
    rating: Number(values.rating),
    bodyText: values.bodyText === '' ? undefined : values.bodyText,
  }
}

export function toUpdateReviewPayload(values: ReviewFormValues): UpdateReviewPayload {
  return {
    rating: Number(values.rating),
    bodyText: values.bodyText === '' ? undefined : values.bodyText,
  }
}
