import type { ApiSuccessResponse } from '@/types/api'
import type { VerifyPaymentPayload, VerifyPaymentView } from '@/types/payments'
import { apiClient } from './client'

/**
 * Thin wrapper over backend/src/payments/payments.controller.ts's
 * POST /payments/verify — the client-side verification call made from
 * Razorpay Checkout.js's success handler. This is a UX accelerant only;
 * the webhook is the authoritative path server-side, so callers must
 * treat the returned `status` as informational, not as proof of a
 * confirmed payment (see VerifyPaymentView's doc comment).
 */
export async function verifyPayment(payload: VerifyPaymentPayload): Promise<VerifyPaymentView> {
  const res = await apiClient.post<ApiSuccessResponse<VerifyPaymentView>>('/payments/verify', payload)
  return res.data.data
}
