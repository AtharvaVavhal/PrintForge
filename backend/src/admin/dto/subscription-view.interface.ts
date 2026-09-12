import { SubscriptionStatus } from '@prisma/client';

/**
 * Phase 6 W6 — GET /admin/subscription. Read-side response shape, not a
 * Prisma model passthrough (same "assembled field-by-field" discipline as
 * `customer-view.interface.ts`) — `Subscription.id`/`tenantId`/`planId`
 * and `Plan.id`/`isPublic`/`isActive`/`sortOrder`/`isEnterpriseCustom` are
 * deliberately omitted: none of them are "subscription state" or "plan
 * identity" an admin needs to see (§4/§7 — internal identifiers/platform
 * catalogue metadata, not this endpoint's concern), and none of them are
 * addressable via any route this phase builds (no
 * `GET /admin/subscription/:id`), unlike Order/Customer's own `id` fields
 * which back real detail routes.
 */
export interface AdminSubscriptionPlanView {
  key: string;
  name: string;
}

export interface AdminSubscriptionView {
  status: SubscriptionStatus;
  plan: AdminSubscriptionPlanView;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
}
