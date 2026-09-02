import type { ApiSuccessResponse } from '@/types/api'
import type { InvoiceView } from '@/types/invoices'
import { apiClient } from './client'

/**
 * GET /orders/:id/invoice — owner only, server-side. Lazily creates the
 * invoice on first request for a paid order, then returns the same one
 * (idempotent). A 409 means the order isn't paid yet; a 404 means the
 * order isn't the caller's.
 */
export async function fetchInvoice(orderId: string): Promise<InvoiceView> {
  const res = await apiClient.get<ApiSuccessResponse<InvoiceView>>(
    `/orders/${encodeURIComponent(orderId)}/invoice`,
  )
  return res.data.data
}

/** GET /admin/orders/:id/invoice — ADMIN only. */
export async function fetchAdminInvoice(orderId: string): Promise<InvoiceView> {
  const res = await apiClient.get<ApiSuccessResponse<InvoiceView>>(
    `/admin/orders/${encodeURIComponent(orderId)}/invoice`,
  )
  return res.data.data
}
