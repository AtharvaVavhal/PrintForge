import type { ApiSuccessResponse, PaginationMeta } from '@/types/api'
import type {
  CouponView,
  CreateCouponPayload,
  ListAdminCouponsParams,
  UpdateCouponPayload,
} from '@/types/coupons'
import { apiClient } from './client'

/**
 * Thin wrappers over backend/src/admin/admin.controller.ts's coupon
 * routes — GET/POST/PATCH /admin/coupons[/:id], every one admin-only
 * (RolesGuard). Unlike products, GET /admin/coupons/:id genuinely exists,
 * so AdminCouponsPage can fetch a single coupon directly rather than
 * needing the router-state handoff AdminProductDetailPage relies on.
 */

export interface AdminCouponListResult {
  items: CouponView[]
  meta: PaginationMeta
}

export async function fetchAdminCoupons(
  params: ListAdminCouponsParams = {},
): Promise<AdminCouponListResult> {
  const res = await apiClient.get<ApiSuccessResponse<CouponView[]>>('/admin/coupons', { params })
  return { items: res.data.data, meta: res.data.meta as PaginationMeta }
}

export async function createCoupon(payload: CreateCouponPayload): Promise<CouponView> {
  const res = await apiClient.post<ApiSuccessResponse<CouponView>>('/admin/coupons', payload)
  return res.data.data
}

/** PATCH /admin/coupons/:id — code/type/percentageOff/flatAmountOff/
 * scopeType/categoryId are rejected by the backend whitelist (400) if
 * sent; UpdateCouponPayload's type already excludes them. */
export async function updateCoupon(id: string, payload: UpdateCouponPayload): Promise<CouponView> {
  const res = await apiClient.patch<ApiSuccessResponse<CouponView>>(`/admin/coupons/${id}`, payload)
  return res.data.data
}
