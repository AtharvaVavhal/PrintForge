import { SubscriptionEventType } from '@prisma/client';

/**
 * Phase 7 Stage 1 (docs/saas/DECISIONS.md P7-D1) — shared
 * `SubscriptionService` method-parameter shapes. Every method that writes
 * a `SubscriptionEvent` accepts an optional `providerEventId` — present
 * when the caller is relaying a confirmed provider event (real webhook,
 * later; `FakeBillingProvider`, now), absent for a tenant/merchant-
 * initiated action with no corresponding provider event (e.g. requesting
 * a downgrade). `providerEventId` is NEVER unique-constrained anywhere in
 * this stage (P7-D1 Part F) — passing the identical value twice is
 * expected, normal, idempotent input, not an error.
 */

export interface ConfirmActivationInput {
  toStatus: 'TRIALING' | 'ACTIVE';
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  providerCustomerId?: string;
  providerSubscriptionId?: string;
  trialEndsAt?: Date;
  providerEventId?: string;
}

export interface RecordPaymentFailureInput {
  graceEndsAt: Date;
  providerEventId?: string;
}

export interface RecoverPaymentInput {
  providerEventId?: string;
}

export interface ExhaustGraceInput {
  providerEventId?: string;
}

export interface ConfirmUpgradeInput {
  toPlanId: string;
  providerEventId?: string;
}

export interface ScheduleDowngradeInput {
  pendingPlanId: string;
}

export interface ApplyScheduledDowngradeInput {
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  providerEventId?: string;
}

/**
 * Phase 7 — Wave A: Plain Period Renewal Fix. A provider-confirmed plain
 * billing-period renewal — no plan change, no status change, nothing
 * scheduled. Mirrors `ApplyScheduledDowngradeInput`'s shape exactly
 * (same two provider-confirmed period fields), since both ultimately
 * refresh the same two columns; the difference is entirely in which
 * `SubscriptionService` method is called (see `confirmRenewal`'s own
 * doc comment for why this is not folded into
 * `applyScheduledDowngrade`).
 */
export interface ConfirmRenewalInput {
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  providerEventId?: string;
}

export interface CancelInput {
  providerEventId?: string;
}

export interface ReactivateInput {
  providerEventId?: string;
}

export interface ExpireInput {
  providerEventId?: string;
}

/**
 * Returned by every transition method. `applied: false` means the
 * operation was a safe no-op — either a lost CAS race (someone else
 * transitioned it first) or a genuine idempotent replay (already in the
 * requested target state) — never an error. `event` is `null` exactly
 * when `applied` is `false` (a no-op writes no `SubscriptionEvent`).
 */
export interface TransitionResult<T> {
  applied: boolean;
  subscription: T;
  eventType: SubscriptionEventType | null;
}
