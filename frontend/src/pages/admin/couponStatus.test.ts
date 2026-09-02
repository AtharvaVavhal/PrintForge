import { describe, expect, it } from 'vitest'
import type { CouponView } from '@/types/coupons'
import { deriveCouponStatus } from './couponStatus'

const NOW = new Date('2026-06-15T12:00:00.000Z')

function coupon(overrides: Partial<CouponView> = {}): CouponView {
  return {
    id: 'c1',
    code: 'CODE',
    type: 'PERCENTAGE',
    percentageOff: 10,
    flatAmountOff: null,
    scopeType: 'STORE_WIDE',
    categoryId: null,
    minOrderValue: null,
    usageLimitTotal: null,
    usageLimitPerUser: 1,
    usedCount: 0,
    firstOrderOnly: false,
    startsAt: null,
    expiresAt: null,
    isActive: true,
    description: null,
    createdByAdminId: 'a1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('deriveCouponStatus', () => {
  it('returns active for a plain live coupon', () => {
    expect(deriveCouponStatus(coupon(), NOW)).toMatchObject({ status: 'active', label: 'Active', variant: 'success' })
  })

  it('returns inactive when isActive is false', () => {
    expect(deriveCouponStatus(coupon({ isActive: false }), NOW)).toMatchObject({
      status: 'inactive',
      label: 'Inactive',
      variant: 'neutral',
    })
  })

  it('returns expired when past expiresAt', () => {
    expect(
      deriveCouponStatus(coupon({ expiresAt: '2026-01-01T00:00:00.000Z' }), NOW),
    ).toMatchObject({ status: 'expired', label: 'Expired', variant: 'warning' })
  })

  it('returns scheduled when before startsAt', () => {
    expect(
      deriveCouponStatus(coupon({ startsAt: '2026-12-01T00:00:00.000Z' }), NOW),
    ).toMatchObject({ status: 'scheduled', label: 'Scheduled', variant: 'warning' })
  })

  it('returns limit_reached when usedCount hits usageLimitTotal', () => {
    expect(
      deriveCouponStatus(coupon({ usageLimitTotal: 5, usedCount: 5 }), NOW),
    ).toMatchObject({ status: 'limit_reached', label: 'Limit reached', variant: 'warning' })
  })

  it('does not report limit_reached when usageLimitTotal is null (unlimited)', () => {
    expect(deriveCouponStatus(coupon({ usageLimitTotal: null, usedCount: 999 }), NOW).status).toBe(
      'active',
    )
  })

  describe('precedence', () => {
    it('inactive beats expired', () => {
      expect(
        deriveCouponStatus(coupon({ isActive: false, expiresAt: '2026-01-01T00:00:00.000Z' }), NOW)
          .status,
      ).toBe('inactive')
    })

    it('inactive beats scheduled', () => {
      expect(
        deriveCouponStatus(coupon({ isActive: false, startsAt: '2026-12-01T00:00:00.000Z' }), NOW)
          .status,
      ).toBe('inactive')
    })

    it('active + expired reports expired', () => {
      expect(
        deriveCouponStatus(coupon({ isActive: true, expiresAt: '2026-01-01T00:00:00.000Z' }), NOW)
          .status,
      ).toBe('expired')
    })

    it('active + scheduled reports scheduled', () => {
      expect(
        deriveCouponStatus(coupon({ isActive: true, startsAt: '2026-12-01T00:00:00.000Z' }), NOW)
          .status,
      ).toBe('scheduled')
    })

    it('expired beats limit_reached', () => {
      expect(
        deriveCouponStatus(
          coupon({ expiresAt: '2026-01-01T00:00:00.000Z', usageLimitTotal: 1, usedCount: 5 }),
          NOW,
        ).status,
      ).toBe('expired')
    })

    it('active + limit reached reports limit_reached', () => {
      expect(
        deriveCouponStatus(coupon({ usageLimitTotal: 2, usedCount: 2 }), NOW).status,
      ).toBe('limit_reached')
    })
  })
})
