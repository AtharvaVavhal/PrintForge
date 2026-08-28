import { z } from 'zod'
import type {
  CreateCouponPayload,
  UpdateCouponPayload,
  ValidateCheckoutPayload,
} from '@/types/coupons'

/**
 * Mirrors backend/src/coupons/dto/{create,update}-coupon.dto.ts field-for-
 * field — a UX convenience only, the server re-validates independently.
 * Same "raw string in, raw string out, no .transform()" discipline as
 * adminProduct.schema.ts/review.schema.ts: every numeric/date field stays
 * a plain string (what an HTML input actually gives react-hook-form), and
 * the string-to-payload conversion happens in the toXPayload functions
 * below, after validation succeeds.
 *
 * `code`/`type`/`percentageOff`/`flatAmountOff`/`scopeType`/`categoryId`
 * are the coupon's fixed identity, immutable after creation
 * (CreateCouponDto's own doc comment) — createCouponSchema covers all of
 * them, editCouponSchema covers none of them (AdminCouponsPage's edit
 * form doesn't render them at all, not just disables them).
 *
 * The backend's cross-field rules (percentageOff required iff
 * type=PERCENTAGE, categoryId required iff scopeType=CATEGORY) are
 * re-checked here via superRefine, matching where the form actually shows
 * these fields (conditionally, per selected type/scopeType) — this is the
 * first schema in this codebase needing cross-field validation, since
 * every prior one (adminProduct, review, checkout) validates fields
 * independently.
 */

const CODE_PATTERN = /^[A-Za-z0-9_-]+$/
const CODE_MESSAGE = 'Code must contain only letters, numbers, hyphens, and underscores'
const DECIMAL_MESSAGE = 'Must be 0 or more, at most 2 decimal places'
const INT_MESSAGE = 'Must be a whole number'

function isValidDecimal(value: string): boolean {
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 && Math.round(n * 100) === n * 100
}

function isValidPositiveInt(value: string): boolean {
  const n = Number(value)
  return Number.isInteger(n) && n >= 1
}

const COUPON_TYPES = ['PERCENTAGE', 'FLAT_AMOUNT', 'FREE_SHIPPING'] as const
const SCOPE_TYPES = ['STORE_WIDE', 'CATEGORY'] as const

export const createCouponSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(1, 'Code is required')
      .max(50)
      .regex(CODE_PATTERN, CODE_MESSAGE),
    type: z.enum(COUPON_TYPES),
    percentageOff: z
      .string()
      .trim()
      .refine((v) => v === '' || isValidPositiveInt(v), `${INT_MESSAGE}, from 1 to 100`)
      .refine((v) => v === '' || Number(v) <= 100, 'Must be 100 or less'),
    flatAmountOff: z.string().trim().refine((v) => v === '' || isValidDecimal(v), DECIMAL_MESSAGE),
    scopeType: z.enum(SCOPE_TYPES),
    categoryId: z.string().trim(),
    minOrderValue: z.string().trim().refine((v) => v === '' || isValidDecimal(v), DECIMAL_MESSAGE),
    usageLimitTotal: z
      .string()
      .trim()
      .refine((v) => v === '' || isValidPositiveInt(v), `${INT_MESSAGE}, at least 1`),
    usageLimitPerUser: z
      .string()
      .trim()
      .refine((v) => v === '' || isValidPositiveInt(v), `${INT_MESSAGE}, at least 1`),
    firstOrderOnly: z.boolean(),
    startsAt: z.string(),
    expiresAt: z.string(),
    description: z.string().trim().max(500),
  })
  .superRefine((values, ctx) => {
    if (values.type === 'PERCENTAGE' && values.percentageOff === '') {
      ctx.addIssue({
        code: 'custom',
        path: ['percentageOff'],
        message: 'Required for a percentage-off coupon',
      })
    }
    if (values.type === 'FLAT_AMOUNT' && values.flatAmountOff === '') {
      ctx.addIssue({
        code: 'custom',
        path: ['flatAmountOff'],
        message: 'Required for a flat-amount coupon',
      })
    }
    if (values.scopeType === 'CATEGORY' && values.categoryId === '') {
      ctx.addIssue({
        code: 'custom',
        path: ['categoryId'],
        message: 'Required for a category-scoped coupon',
      })
    }
  })

export type CreateCouponFormValues = z.infer<typeof createCouponSchema>

export const EMPTY_CREATE_COUPON_VALUES: CreateCouponFormValues = {
  code: '',
  type: 'PERCENTAGE',
  percentageOff: '',
  flatAmountOff: '',
  scopeType: 'STORE_WIDE',
  categoryId: '',
  minOrderValue: '',
  usageLimitTotal: '',
  usageLimitPerUser: '',
  firstOrderOnly: false,
  startsAt: '',
  expiresAt: '',
  description: '',
}

export function toCreateCouponPayload(values: CreateCouponFormValues): CreateCouponPayload {
  return {
    code: values.code,
    type: values.type,
    percentageOff: values.type === 'PERCENTAGE' ? Number(values.percentageOff) : undefined,
    flatAmountOff: values.type === 'FLAT_AMOUNT' ? Number(values.flatAmountOff) : undefined,
    scopeType: values.scopeType,
    categoryId: values.scopeType === 'CATEGORY' ? values.categoryId : undefined,
    minOrderValue: values.minOrderValue === '' ? undefined : Number(values.minOrderValue),
    usageLimitTotal: values.usageLimitTotal === '' ? undefined : Number(values.usageLimitTotal),
    usageLimitPerUser: values.usageLimitPerUser === '' ? undefined : Number(values.usageLimitPerUser),
    firstOrderOnly: values.firstOrderOnly,
    startsAt: values.startsAt === '' ? undefined : values.startsAt,
    expiresAt: values.expiresAt === '' ? undefined : values.expiresAt,
    description: values.description === '' ? undefined : values.description,
  }
}

/** UpdateCouponDto's exact field set — no code/type/percentageOff/
 * flatAmountOff/scopeType/categoryId, matching the backend whitelist. */
export const editCouponSchema = z.object({
  minOrderValue: z.string().trim().refine((v) => v === '' || isValidDecimal(v), DECIMAL_MESSAGE),
  usageLimitTotal: z
    .string()
    .trim()
    .refine((v) => v === '' || isValidPositiveInt(v), `${INT_MESSAGE}, at least 1`),
  usageLimitPerUser: z
    .string()
    .trim()
    .refine((v) => v === '' || isValidPositiveInt(v), `${INT_MESSAGE}, at least 1`),
  firstOrderOnly: z.boolean(),
  startsAt: z.string(),
  expiresAt: z.string(),
  isActive: z.boolean(),
  description: z.string().trim().max(500),
})

export type EditCouponFormValues = z.infer<typeof editCouponSchema>

export function toUpdateCouponPayload(values: EditCouponFormValues): UpdateCouponPayload {
  return {
    minOrderValue: values.minOrderValue === '' ? undefined : Number(values.minOrderValue),
    usageLimitTotal: values.usageLimitTotal === '' ? undefined : Number(values.usageLimitTotal),
    usageLimitPerUser: values.usageLimitPerUser === '' ? undefined : Number(values.usageLimitPerUser),
    firstOrderOnly: values.firstOrderOnly,
    startsAt: values.startsAt === '' ? undefined : values.startsAt,
    expiresAt: values.expiresAt === '' ? undefined : values.expiresAt,
    isActive: values.isActive,
    description: values.description === '' ? undefined : values.description,
  }
}

// ─── Checkout coupon-code input (POST /checkout/validate) ──────────────

export const checkoutCouponSchema = z.object({
  couponCode: z
    .string()
    .trim()
    .min(1, 'Enter a coupon code')
    .max(50)
    .regex(CODE_PATTERN, CODE_MESSAGE),
})

export type CheckoutCouponFormValues = z.infer<typeof checkoutCouponSchema>

export function toValidateCheckoutPayload(values: CheckoutCouponFormValues): ValidateCheckoutPayload {
  return { couponCode: values.couponCode }
}
