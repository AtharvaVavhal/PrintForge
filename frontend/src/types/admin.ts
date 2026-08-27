/**
 * Mirrors backend/src/admin/dto/*.interface.ts and admin.controller.ts's
 * query DTOs — response/request shapes for GET /admin/dashboard, GET/PATCH
 * /admin/orders[/:id][/status], GET /admin/customers[/:id]. All confirmed
 * live (curl, real ADMIN JWT) rather than assumed from the DTO source.
 *
 * Order shapes (`OrderListItemView`/`OrderDetailView`) are imported from
 * types/orders.ts, not redefined here — confirmed live that GET
 * /admin/orders[/:id] returns exactly that same shape (needsManualRefund
 * included, same as the customer-facing endpoint) with no admin-only
 * fields layered on top.
 */
import type { OrderListItemView, OrderStatus } from './orders'

export interface OrderStatusCount {
  status: OrderStatus
  count: number
}

export interface AdminDashboardView {
  totalOrders: number
  /** Every OrderStatus value, zero-filled — confirmed live. */
  ordersByStatus: OrderStatusCount[]
  /** Major-unit decimal string. "Paid-or-later" order totals only. */
  totalRevenue: string
  /** Last 10, newest first. */
  recentOrders: OrderListItemView[]
}

/** GET /admin/orders/GET /admin/orders/:id accept only page/limit/status/
 * userId/dateFrom/dateTo (ListAdminOrdersQueryDto) — no free-text search. */
export interface ListAdminOrdersParams {
  page?: number
  limit?: number
  status?: OrderStatus
  userId?: string
  dateFrom?: string
  dateTo?: string
}

export interface UpdateOrderStatusPayload {
  status: OrderStatus
  reason?: string
}

/** GET /admin/customers accepts page/limit/search (email substring, case
 * insensitive)/isActive — ListAdminCustomersQueryDto. */
export interface ListAdminCustomersParams {
  page?: number
  limit?: number
  search?: string
  isActive?: boolean
}

export interface AdminCustomerListItemView {
  id: string
  email: string
  addressLine1: string | null
  addressLine2: string | null
  city: string | null
  state: string | null
  postalCode: string | null
  country: string | null
  phone: string | null
  role: string
  isActive: boolean
  createdAt: string
  /** All orders regardless of status. */
  orderCount: number
}

export interface AdminCustomerDetailView extends AdminCustomerListItemView {
  /** Major-unit decimal string — sum of paid-or-later order totals. */
  totalSpend: string
  recentOrders: OrderListItemView[]
}
