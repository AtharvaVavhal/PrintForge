import { ConflictException } from '@nestjs/common';
import { SubscriptionStatus } from '@prisma/client';

/**
 * Phase 7 Stage 1 (docs/saas/DECISIONS.md P7-D1) — `Subscription.status`
 * transition table. Modeled directly on
 * `orders/state-machine/order-state-machine.ts`: a pure, side-effect-free
 * lookup (no DB access, unit-testable alone) — a transition not listed
 * here is rejected, never silently allowed.
 *
 * This was originally EXACTLY the "at minimum" matrix from the
 * ratification gate's own Step 5, no more, no less — deliberately not
 * including every edge the earlier design audit left marked `DECISION
 * REQUIRED` (e.g. `TRIALING -> EXPIRED`), because "do not invent
 * additional transitions beyond P7-D1" applied as strictly as anywhere
 * else in this file.
 *
 * **Phase 7 Stage 2 (P7-D2 Part B) amendment**: `ACTIVE -> CANCELLED` is
 * now ratified and added below — an explicit, intentional amendment to
 * P7-D1 Part B's original matrix (which allowed only `PAST_DUE`/`PAUSED`
 * as `CANCELLED` sources), representing an immediate tenant-requested
 * cancellation. See `docs/saas/DECISIONS.md` P7-D2 Part B for the full
 * ratified requirements (provider-confirmed only, non-destructive,
 * `SubscriptionEvent`-recorded, existing entitlement-fallback semantics).
 * Every other edge remains exactly as P7-D1 ratified it — no other DR
 * edge (`TRIALING -> EXPIRED`, additional `PAUSED` exits, etc.) is added
 * by this amendment.
 *
 * `ACTIVE -> ACTIVE` covers TWO distinct semantic operations (confirmed
 * immediate upgrade, and downgrade scheduling via `pendingPlanId`) — the
 * table itself cannot and does not distinguish them; that distinction is
 * made by which `SubscriptionService` method is called, each with its own
 * idempotency check on the field IT governs (`planId` for upgrade,
 * `pendingPlanId` for downgrade scheduling), not by the generic
 * status-transition allowlist. Likewise, `ACTIVE -> CANCELLED` now serves
 * BOTH an immediate cancellation (`cancel()` called directly) and the
 * confirmed-boundary application of a previously-scheduled cancellation
 * (`scheduleCancellation()` sets `cancelAtPeriodEnd`, unrelated to
 * `status`; `cancel()` is what the orchestration layer calls once the
 * period boundary is confirmed) — again the same underlying transition,
 * distinguished by caller/timing, not by a second table entry.
 */
export const SUBSCRIPTION_STATE_TRANSITIONS: Readonly<
  Record<SubscriptionStatus, readonly SubscriptionStatus[]>
> = {
  PENDING: ['TRIALING', 'ACTIVE'],
  TRIALING: ['ACTIVE', 'PAST_DUE'],
  ACTIVE: ['ACTIVE', 'PAST_DUE', 'CANCELLED'],
  PAST_DUE: ['ACTIVE', 'PAUSED', 'CANCELLED'],
  PAUSED: ['ACTIVE', 'CANCELLED', 'EXPIRED'],
  CANCELLED: ['ACTIVE', 'EXPIRED'],
  // EXPIRED is terminal (P7-D1 Part B) — no outgoing transition, ever.
  EXPIRED: [],
};

export function isSubscriptionTransitionAllowed(
  from: SubscriptionStatus,
  to: SubscriptionStatus,
): boolean {
  return SUBSCRIPTION_STATE_TRANSITIONS[from].includes(to);
}

/**
 * Throws 409 on an illegal transition — same convention as
 * `order-lifecycle.util.ts#assertTransitionAllowed`. Every
 * `SubscriptionService` method that changes `status` goes through this
 * rather than re-deriving "is this allowed" inline.
 */
export function assertSubscriptionTransitionAllowed(
  from: SubscriptionStatus,
  to: SubscriptionStatus,
): void {
  if (!isSubscriptionTransitionAllowed(from, to)) {
    throw new ConflictException(
      `Illegal subscription transition: ${from} -> ${to}`,
    );
  }
}
