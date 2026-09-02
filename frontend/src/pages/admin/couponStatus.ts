import type { AdminBadgeVariant } from '@/components/admin/AdminBadge'
import type { CouponView } from '@/types/coupons'

export type CouponStatus = 'active' | 'inactive' | 'expired' | 'scheduled' | 'limit_reached'

export interface CouponStatusInfo {
  status: CouponStatus
  label: string
  variant: AdminBadgeVariant
}

const STATUS_META: Record<CouponStatus, { label: string; variant: AdminBadgeVariant }> = {
  active: { label: 'Active', variant: 'success' },
  inactive: { label: 'Inactive', variant: 'neutral' },
  expired: { label: 'Expired', variant: 'warning' },
  scheduled: { label: 'Scheduled', variant: 'warning' },
  limit_reached: { label: 'Limit reached', variant: 'warning' },
}

/**
 * Pure presentation derivation — never mutates the coupon, never calls an
 * API. "Expired" and "Scheduled" are display-only reads of the date window
 * against `now`; the backend never auto-flips `isActive`.
 *
 * Precedence (must stay in this order):
 *   1. !isActive                              -> inactive
 *   2. isActive & expiresAt & now > expiresAt -> expired
 *   3. isActive & startsAt & now < startsAt   -> scheduled
 *   4. usageLimitTotal != null & usedCount >= usageLimitTotal -> limit_reached
 *   5. otherwise                              -> active
 */
export function deriveCouponStatus(coupon: CouponView, now: Date = new Date()): CouponStatusInfo {
  let status: CouponStatus
  if (!coupon.isActive) {
    status = 'inactive'
  } else if (coupon.expiresAt !== null && now.getTime() > new Date(coupon.expiresAt).getTime()) {
    status = 'expired'
  } else if (coupon.startsAt !== null && now.getTime() < new Date(coupon.startsAt).getTime()) {
    status = 'scheduled'
  } else if (coupon.usageLimitTotal !== null && coupon.usedCount >= coupon.usageLimitTotal) {
    status = 'limit_reached'
  } else {
    status = 'active'
  }
  return { status, ...STATUS_META[status] }
}
