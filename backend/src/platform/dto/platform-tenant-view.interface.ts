import { StoreStatus, SubscriptionStatus, TenantStatus } from '@prisma/client';

/**
 * Platform Control Plane views — SaaS Master Plan §11; Phase 5 W3.
 * Assembled field-by-field (never `{...tenant}`), same discipline as
 * `AdminCustomerListItemView` (admin/dto/customer-view.interface.ts) — a
 * broad spread on `Tenant` would risk leaking nothing sensitive TODAY (the
 * model itself is small) but would silently start leaking whatever the
 * model grows tomorrow. §11 requires list/detail to expose *metadata
 * only*, never a tenant's business/commerce/customer rows.
 */

/** GET /platform/tenants — one row. Minimum metadata only. */
export interface PlatformTenantSummaryView {
  id: string;
  slug: string;
  status: TenantStatus;
  createdAt: Date;
  storeCount: number;
}

/** A store's platform-visible metadata, nested in the tenant detail view —
 * never a store's domain/customer data. */
export interface PlatformStoreSummaryView {
  id: string;
  slug: string;
  name: string;
  status: StoreStatus;
  isPrimary: boolean;
}

/** GET /platform/tenants/:id — metadata + store list + subscription
 * status, per §11's "view a tenant's subscription + store + domain status
 * (read of *metadata*, not the tenant's business rows)". Domain status is NOT
 * inlined here: Phase 9 W6 gives it a dedicated surface (P9-D5) —
 * `GET /platform/domains?tenantId=<id>` lists this tenant's domains with
 * their verification/TLS state, and `GET /platform/domains/:id` inspects one
 * with a live provider read. */
export interface PlatformTenantDetailView {
  id: string;
  slug: string;
  status: TenantStatus;
  createdAt: Date;
  updatedAt: Date;
  stores: PlatformStoreSummaryView[];
  subscription: { status: SubscriptionStatus } | null;
}
