import { SubscriptionStatus } from '@prisma/client';

/**
 * Phase 7 Stage 2 (docs/saas/DECISIONS.md P7-D2) — the response shape for
 * every subscription-mutation endpoint (`POST
 * /admin/subscription/upgrade|downgrade|cancel|resume`). Deliberately a
 * DIFFERENT, wider interface than `AdminSubscriptionView`
 * (`admin/dto/subscription-view.interface.ts`) rather than a reuse of it
 * — that interface backs the pre-existing, unchanged `GET
 * /admin/subscription` read endpoint (Phase 6 W6) and is intentionally
 * narrow (§4/§7 of that endpoint's own authorization: no internal
 * identifiers, no fields no route yet exposes). A tenant acting on a
 * mutation response needs to see the Stage 2 fields a mutation actually
 * changes (`pendingPlanId`, `cancelAtPeriodEnd`, `graceEndsAt`,
 * `trialEndsAt`) — adding them to the shared read view was avoided so
 * `GET /admin/subscription`'s own response shape stays byte-for-byte
 * unchanged, exactly as this stage's implementation authorization
 * requires ("Preserve existing GET /admin/subscription... Do not change
 * their authorization" — extended here, conservatively, to also mean
 * "do not change its response shape").
 */
export interface SubscriptionMutationPlanView {
  key: string;
  name: string;
}

export interface SubscriptionMutationView {
  status: SubscriptionStatus;
  plan: SubscriptionMutationPlanView;
  pendingPlanId: string | null;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  graceEndsAt: Date | null;
  trialEndsAt: Date | null;
}
