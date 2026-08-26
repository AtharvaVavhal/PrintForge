import { ConflictException } from '@nestjs/common';
import { OrderStatus, PaymentAttemptStatus } from '@prisma/client';
import { isTransitionAllowed } from './state-machine/order-state-machine';

/**
 * Pure, side-effect-free helpers on top of the existing state machine
 * (order-state-machine.ts, not modified — only consumed). Kept separate
 * from OrdersService so cancellation eligibility, the refund-trigger
 * condition, and illegal-transition rejection are unit-testable without a
 * database, matching how order-state-machine.ts itself was designed.
 */

/** Whether `status` can reach CANCELLED at all — never hardcoded, always
 * read off the real transition table so this can't drift from it. */
export function isOrderCancellable(status: OrderStatus): boolean {
  return isTransitionAllowed(status, OrderStatus.CANCELLED);
}

/**
 * Whether cancelling this order must trigger a Razorpay refund first.
 * True iff a PaymentAttempt for the order was actually CAPTURED — an
 * order that's PAID always has exactly one (or the CAS/partial-unique-
 * index guarantees from Phase 6 wouldn't hold), an order still
 * PENDING_PAYMENT or PAYMENT_FAILED never does.
 */
export function orderNeedsRefund(
  capturedPaymentAttempt: { status: PaymentAttemptStatus } | null,
): boolean {
  return capturedPaymentAttempt?.status === PaymentAttemptStatus.CAPTURED;
}

/**
 * Throws 409 on an illegal transition instead of letting a caller attempt
 * a hand-rolled check — every OrdersService transition path (customer
 * cancel, admin status update) goes through this rather than re-deriving
 * "is this allowed" inline.
 */
export function assertTransitionAllowed(
  from: OrderStatus,
  to: OrderStatus,
): void {
  if (!isTransitionAllowed(from, to)) {
    throw new ConflictException(`Illegal order transition: ${from} -> ${to}`);
  }
}
