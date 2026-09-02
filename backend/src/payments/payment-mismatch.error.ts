/**
 * Raised when Razorpay reports a captured payment whose order id, currency,
 * or amount does not exactly match the local order it is claimed against
 * (Phase 13.3 §4). A mismatch is never silently accepted: the caller must
 * refuse to mark the order PAID / the attempt CAPTURED, record the
 * discrepancy, and surface an observable error.
 *
 * `reason` is a stable machine tag; `detail` is a short human string with
 * the two values that disagreed (never a secret — order/payment ids and
 * paise amounts only).
 */
export type PaymentMismatchReason =
  'RAZORPAY_ORDER_ID_MISMATCH' | 'CURRENCY_MISMATCH' | 'AMOUNT_MISMATCH';

export class PaymentMismatchError extends Error {
  constructor(
    readonly reason: PaymentMismatchReason,
    readonly detail: string,
  ) {
    super(`Payment mismatch (${reason}): ${detail}`);
    this.name = 'PaymentMismatchError';
  }
}
