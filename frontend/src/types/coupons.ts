/**
 * Mirrors backend/src/coupons/dto/coupon-view.interface.ts and its request
 * DTOs, and checkout/dto/{validate-checkout.dto.ts,order-view.interface.ts}'s
 * CheckoutPreviewView — confirmed against the actual current source, not
 * assumed from the proposal doc.
 */

export type CouponType = 'PERCENTAGE' | 'FLAT_AMOUNT' | 'FREE_SHIPPING'
export type CouponScopeType = 'STORE_WIDE' | 'CATEGORY'

/**
 * `code`/`type`/`percentageOff`/`flatAmountOff`/`scopeType`/`categoryId`
 * are the coupon's fixed identity, immutable after creation — enforced by
 * UpdateCouponDto's whitelist server-side (a PATCH with any of these
 * fields gets a 400), not by anything client-side, but the edit form
 * (AdminCouponsPage) doesn't offer them as editable fields at all so
 * there's nothing to enforce here in the first place.
 */
export interface CouponView {
  id: string
  code: string
  type: CouponType
  percentageOff: number | null
  flatAmountOff: string | null
  scopeType: CouponScopeType
  categoryId: string | null
  minOrderValue: string | null
  usageLimitTotal: number | null
  usageLimitPerUser: number | null
  usedCount: number
  firstOrderOnly: boolean
  startsAt: string | null
  expiresAt: string | null
  isActive: boolean
  description: string | null
  createdByAdminId: string
  createdAt: string
  updatedAt: string
}

/** GET /admin/coupons accepts page/limit/isActive/type
 * (ListAdminCouponsQueryDto). */
export interface ListAdminCouponsParams {
  page?: number
  limit?: number
  isActive?: boolean
  type?: CouponType
}

export interface CreateCouponPayload {
  code: string
  type: CouponType
  percentageOff?: number
  flatAmountOff?: number
  scopeType: CouponScopeType
  categoryId?: string
  minOrderValue?: number
  usageLimitTotal?: number
  usageLimitPerUser?: number
  firstOrderOnly?: boolean
  startsAt?: string
  expiresAt?: string
  description?: string
}

/** PATCH /admin/coupons/:id — limits/dates/isActive/description only. */
export interface UpdateCouponPayload {
  minOrderValue?: number
  usageLimitTotal?: number
  usageLimitPerUser?: number
  firstOrderOnly?: boolean
  startsAt?: string
  expiresAt?: string
  isActive?: boolean
  description?: string
}

/** POST /checkout/validate's request body — the only client-supplied
 * field. */
export interface ValidateCheckoutPayload {
  couponCode?: string
}

/** POST /checkout/validate's response — a read-only pricing preview
 * against the caller's current cart; nothing is created or claimed.
 * `couponCode` is the server's normalized (uppercased) echo of the code
 * that was actually applied, null if none was provided — this is what
 * gets passed through to the real POST /checkout/orders call, not the
 * raw user input. */
export interface CheckoutPreviewView {
  subtotal: string
  shippingFee: string
  discountAmount: string
  /** Tax preview (Phase 13.4) — "0.00" until a client-confirmed GST rate
   * is enabled; never authoritative. */
  taxableAmount: string
  taxAmount: string
  taxMode: string
  total: string
  couponCode: string | null
}
