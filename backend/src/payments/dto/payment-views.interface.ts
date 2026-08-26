import { OrderStatus } from '@prisma/client';

/**
 * Response for POST /checkout/orders/:id/retry-payment — everything the
 * frontend's Razorpay Checkout.js widget needs, and nothing more (never
 * the key secret). `amountPaise` is deliberately paise, not a rupee
 * decimal string — §21's one stated exception ("the Razorpay amount field
 * inside checkout/payment payloads... is in paise, called out explicitly
 * to avoid a unit-conversion bug") applies here.
 */
export interface InitiatePaymentView {
  paymentAttemptId: string;
  razorpayOrderId: string;
  razorpayKeyId: string;
  amountPaise: string;
  currency: string;
}

/** Response for POST /payments/verify. */
export interface VerifyPaymentView {
  orderId: string;
  status: OrderStatus;
}
