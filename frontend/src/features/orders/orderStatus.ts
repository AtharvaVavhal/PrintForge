import type { OrderStatus } from '@/types/orders'

/** Single source of truth for order status display text and badge
 * severity — shared by OrderListRow's badge (OrdersPage) and
 * OrderDetailPage's header badge, so a given status never reads
 * differently between the list and detail views. */
export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING_PAYMENT: 'Awaiting payment',
  PAID: 'Payment confirmed',
  PAYMENT_FAILED: 'Payment failed',
  CONFIRMED: 'Confirmed',
  IN_PRODUCTION: 'In production',
  SHIPPED: 'Shipped',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  REFUNDED: 'Refunded',
}

export type OrderStatusTone = 'success' | 'error' | 'info'

export function orderStatusTone(status: OrderStatus): OrderStatusTone {
  if (status === 'PAYMENT_FAILED') return 'error'
  if (status === 'PENDING_PAYMENT' || status === 'CANCELLED') return 'info'
  return 'success'
}
