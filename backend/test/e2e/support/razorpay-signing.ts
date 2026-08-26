import { createHmac } from 'crypto';

/**
 * Mirrors RazorpayService's own hmacSha256Hex exactly (razorpay.service.ts)
 * — tests sign with the real RAZORPAY_KEY_SECRET / RAZORPAY_WEBHOOK_SECRET
 * from .env.test so the app's real verifySignature/verifyWebhookSignature
 * code runs unmocked. No Razorpay network call is involved in either path:
 * both are local HMAC checks.
 */
function hmacSha256Hex(message: string, secret: string): string {
  return createHmac('sha256', secret).update(message).digest('hex');
}

/** POST /payments/verify signature — hmac_sha256(orderId|paymentId, key_secret). */
export function signVerifyPayload(
  razorpayOrderId: string,
  razorpayPaymentId: string,
): string {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret) {
    throw new Error('RAZORPAY_KEY_SECRET not set — check .env.test is loaded');
  }
  return hmacSha256Hex(`${razorpayOrderId}|${razorpayPaymentId}`, secret);
}

/** POST /payments/webhook signature — hmac_sha256(rawBody, webhook_secret). */
export function signWebhookPayload(rawBody: string): string {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error(
      'RAZORPAY_WEBHOOK_SECRET not set — check .env.test is loaded',
    );
  }
  return hmacSha256Hex(rawBody, secret);
}

export interface RazorpayPaymentEntityFixture {
  id: string;
  order_id: string;
  amount: number;
  status: string;
  method?: string;
}

/** Builds a `payment.captured`/`payment.failed` webhook body — matches the
 * RazorpayWebhookPayload shape payments.service.ts's applyWebhookEvent
 * reads (payments.service.ts's RazorpayPaymentEntity/RazorpayWebhookPayload
 * interfaces). Returned as an exact JSON string, not an object, so the test
 * can sign and send byte-for-byte the same bytes (main.ts's `rawBody: true`
 * makes the signature check sensitive to exact serialization). */
export function buildWebhookBody(
  event: 'payment.captured' | 'payment.failed',
  entity: RazorpayPaymentEntityFixture,
): string {
  return JSON.stringify({
    event,
    payload: { payment: { entity } },
    created_at: Math.floor(Date.now() / 1000),
  });
}
