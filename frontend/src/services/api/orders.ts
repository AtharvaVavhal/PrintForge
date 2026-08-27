import type { ApiSuccessResponse } from '@/types/api'
import type { OrderDetailView } from '@/types/orders'
import { apiClient } from './client'

/** Thin wrapper over backend/src/orders/orders.controller.ts's GET /orders/:id. */
export async function fetchOrder(orderId: string): Promise<OrderDetailView> {
  const res = await apiClient.get<ApiSuccessResponse<OrderDetailView>>(`/orders/${orderId}`)
  return res.data.data
}
