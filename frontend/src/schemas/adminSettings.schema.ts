import { z } from 'zod'

/**
 * Client-side convenience validation for the admin settings form. The
 * server (backend/src/app-setting/app-setting.constants.ts) re-validates
 * every value independently and is the authority — this only gives fast
 * inline feedback and mirrors those rules.
 */

const MONEY_PATTERN = /^\d+(\.\d{1,2})?$/
export const ANNOUNCEMENT_MAX_LENGTH = 200

export const shippingFeeSchema = z.object({
  value: z
    .string()
    .trim()
    .min(1, 'Enter a shipping fee (use 0 for free shipping)')
    .regex(
      MONEY_PATTERN,
      'Must be a non-negative amount with at most 2 decimal places',
    )
    .refine((v) => Number(v) <= 100000, 'That shipping fee is too large'),
})

export const announcementSchema = z.object({
  value: z
    .string()
    .trim()
    .max(
      ANNOUNCEMENT_MAX_LENGTH,
      `Keep it under ${ANNOUNCEMENT_MAX_LENGTH} characters`,
    ),
})

export type ShippingFeeFormValues = z.infer<typeof shippingFeeSchema>
export type AnnouncementFormValues = z.infer<typeof announcementSchema>

/** Picks the right schema for a setting by its backend `kind`. */
export function schemaForKind(kind: 'money' | 'text') {
  return kind === 'money' ? shippingFeeSchema : announcementSchema
}
