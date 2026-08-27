import { CouponScopeType, CouponType } from '@prisma/client';

/** Read-side response shape for GET/POST/PATCH /admin/coupons[/:id] — not
 * a request DTO. Assembled field-by-field in CouponsService, same
 * "never `{...coupon}`" discipline as UsersService.toProfileView, though
 * here it's less about hiding sensitive columns (there are none) and more
 * about keeping the response shape independent of the Prisma model's own
 * field order/shape. */
export interface CouponView {
  id: string;
  code: string;
  type: CouponType;
  percentageOff: number | null;
  flatAmountOff: string | null;
  scopeType: CouponScopeType;
  categoryId: string | null;
  minOrderValue: string | null;
  usageLimitTotal: number | null;
  usageLimitPerUser: number | null;
  usedCount: number;
  firstOrderOnly: boolean;
  startsAt: Date | null;
  expiresAt: Date | null;
  isActive: boolean;
  description: string | null;
  createdByAdminId: string;
  createdAt: Date;
  updatedAt: Date;
}
