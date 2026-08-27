import type { OrderStatus } from './orders'

/** Mirrors backend/src/payments/dto/payment-views.interface.ts. */

/** Response for POST /checkout/orders/:id/retry-payment. */
export interface InitiatePaymentView {
  paymentAttemptId: string
  razorpayOrderId: string
  razorpayKeyId: string
  /** Paise, as a decimal string — §21's one stated exception. Converted to
   * a number only at the point of handing it to Razorpay Checkout.js. */
  amountPaise: string
  currency: string
}

/**
 * Matches backend/src/payments/dto/verify-payment.dto.ts's field names
 * verbatim (razorpay_* snake_case) — an external-system contract boundary,
 * not this API's usual camelCase convention. These are exactly the fields
 * Razorpay Checkout.js's success handler callback hands back.
 */
export interface VerifyPaymentPayload {
  razorpay_order_id: string
  razorpay_payment_id: string
  razorpay_signature: string
}

/** Response for POST /payments/verify. `status` is the order's real status
 * right after this call's own CAS attempt (or a race it lost) — not a
 * promise that payment is confirmed. Callers must re-derive the
 * user-facing "confirmed" state from a fresh GET /orders/:id, never from
 * this field alone (the webhook is the authoritative path — see
 * PaymentsService.verifyPayment's doc comment). */
export interface VerifyPaymentView {
  orderId: string
  status: OrderStatus
}
