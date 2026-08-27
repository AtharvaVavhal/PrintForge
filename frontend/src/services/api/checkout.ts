import type { ApiSuccessResponse } from '@/types/api'
import type { CheckoutOrderView, CreateOrderPayload } from '@/types/checkout'
import type { InitiatePaymentView } from '@/types/payments'
import { apiClient } from './client'

/** Thin wrappers over backend/src/checkout/checkout.controller.ts. */

const IDEMPOTENCY_KEY_HEADER = 'Idempotency-Key'

/**
 * `idempotencyKey` must be the SAME value across every retry of a given
 * checkout attempt (one generated per CheckoutPage mount, not per click —
 * see CheckoutPage.tsx) — that's what makes a double-click or a retry
 * after a dropped response safe: the backend returns the same order
 * instead of creating a second one (checkout.controller.ts, 201 on genuine
 * creation vs 200 on an idempotent replay, identical body either way).
 */
export async function createOrder(
  payload: CreateOrderPayload,
  idempotencyKey: string,
): Promise<CheckoutOrderView> {
  const res = await apiClient.post<ApiSuccessResponse<CheckoutOrderView>>(
    '/checkout/orders',
    payload,
    { headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey } },
  )
  return res.data.data
}

/**
 * POST /checkout/orders itself returns no Razorpay order details (see
 * CheckoutOrderView) — this call always follows createOrder immediately to
 * get the Razorpay order id/amount/key for opening Checkout.js, and it's
 * also the one the "Retry Payment" action calls again on a later visit;
 * the backend reuses the existing razorpayOrderId on a retry rather than
 * creating a new one (checkout.controller.ts's doc comment).
 */
export async function retryPayment(orderId: string): Promise<InitiatePaymentView> {
  const res = await apiClient.post<ApiSuccessResponse<InitiatePaymentView>>(
    `/checkout/orders/${orderId}/retry-payment`,
  )
  return res.data.data
}
