/**
 * Mirrors backend/src/orders/dto/order-view.interface.ts and the Prisma
 * enums it's built from (schema.prisma) — read-side response shapes for
 * GET /orders and GET /orders/:id only, no request DTOs here.
 */

export type OrderStatus =
  | 'PENDING_PAYMENT'
  | 'PAID'
  | 'PAYMENT_FAILED'
  | 'CONFIRMED'
  | 'IN_PRODUCTION'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'REFUNDED'

export type PaymentAttemptStatus = 'INITIATED' | 'CAPTURED' | 'FAILED' | 'ABANDONED'
export type RefundStatus = 'PENDING' | 'PROCESSED' | 'FAILED'

export interface OrderItemCustomizationView {
  fieldLabel: string
  textValue: string | null
  uploadedFileId: string | null
}

export interface OrderItemView {
  id: string
  productId: string | null
  productName: string
  variantLabel: string | null
  unitPrice: string
  quantity: number
  lineTotal: string
  customizations: OrderItemCustomizationView[]
}

export interface RefundView {
  id: string
  amountPaise: string
  status: RefundStatus
  reason: string | null
  createdAt: string
}

export interface PaymentAttemptView {
  id: string
  status: PaymentAttemptStatus
  amountPaise: string
  method: string | null
  failureCode: string | null
  failureReason: string | null
  createdAt: string
  capturedAt: string | null
  refunds: RefundView[]
}

export interface OrderStatusHistoryView {
  fromStatus: OrderStatus | null
  toStatus: OrderStatus
  changedByUserId: string | null
  note: string | null
  createdAt: string
}

export interface OrderListItemView {
  id: string
  orderNumber: string
  status: OrderStatus
  total: string
  currency: string
  itemCount: number
  /** True iff a refund is flagged PENDING and awaiting manual processing —
   * §12.5, no in-app refund-initiation in MVP. */
  needsManualRefund: boolean
  createdAt: string
}

export interface OrderDetailView extends OrderListItemView {
  subtotal: string
  shippingRecipientName: string
  shippingPhone: string
  shippingAddressLine1: string
  shippingAddressLine2: string | null
  shippingCity: string
  shippingState: string
  shippingPostalCode: string
  shippingCountry: string
  items: OrderItemView[]
  statusHistory: OrderStatusHistoryView[]
  paymentAttempts: PaymentAttemptView[]
}
