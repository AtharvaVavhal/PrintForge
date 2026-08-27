import type { OrderStatus } from './orders'

/**
 * Mirrors backend/src/checkout/dto/order-view.interface.ts — the response
 * shape for POST /checkout/orders. Deliberately distinct from
 * OrderDetailView (types/orders.ts): this view has no itemCount,
 * needsManualRefund, statusHistory, or paymentAttempts — those are only
 * assembled by the orders module (GET /orders/:id), not checkout.
 */

export interface CheckoutOrderItemCustomizationView {
  fieldLabel: string
  textValue: string | null
  uploadedFileId: string | null
}

export interface CheckoutOrderItemView {
  id: string
  productId: string | null
  productName: string
  variantLabel: string | null
  unitPrice: string
  quantity: number
  lineTotal: string
  customizations: CheckoutOrderItemCustomizationView[]
}

export interface CheckoutOrderView {
  id: string
  orderNumber: string
  status: OrderStatus
  subtotal: string
  shippingFee: string
  total: string
  currency: string
  shippingRecipientName: string
  shippingPhone: string
  shippingAddressLine1: string
  shippingAddressLine2: string | null
  shippingCity: string
  shippingState: string
  shippingPostalCode: string
  shippingCountry: string
  items: CheckoutOrderItemView[]
  createdAt: string
}

/** Matches CreateOrderDto's fields exactly (backend/src/checkout/dto/create-order.dto.ts). */
export interface CreateOrderPayload {
  shippingRecipientName: string
  shippingPhone: string
  shippingAddressLine1: string
  shippingAddressLine2?: string
  shippingCity: string
  shippingState: string
  shippingPostalCode: string
  shippingCountry: string
}
