import type { TenantRole } from '@prisma/client';

/**
 * Server-derived tenant context (SaaS Master Plan §9; decision D6,
 * docs/saas/DECISIONS.md, resolved 2026-09-07 — BOTH host/subdomain and
 * `X-Active-Tenant` header, header cross-validated against the caller's
 * `ACTIVE` `TenantMembership` rows).
 *
 * `TenantContextGuard` is the ONLY place that constructs this. Nothing else
 * should ever read `X-Active-Tenant` (or any client-supplied identifier)
 * directly and treat it as authoritative — see that guard's own header
 * comment.
 */
export interface TenantContext {
  tenantId: string;
  source: 'membership-header' | 'membership-default' | 'domain';
  /** Present for the merchant path; absent for the (future, Phase 9/12)
   * unauthenticated storefront path. Carries only `role` — that is all
   * `PermissionsGuard.can()` needs, and it is already loaded (fresh, per
   * request) onto `AuthenticatedUser.memberships` by `JwtStrategy`; no
   * second database lookup is made to populate this. */
  membership?: {
    role: TenantRole;
  };
}

/**
 * Request shape after `JwtAuthGuard` + `TenantContextGuard` have run.
 * `tenantContext` is `undefined` when no tenant could be established
 * (platform-only routes, `@Public()` routes, or a merchant request with no
 * resolvable/authorized tenant) — every guard/handler downstream must treat
 * "no context" as "no tenant access", never as "all tenants" (fail closed).
 */
export interface RequestWithTenantContext {
  tenantContext?: TenantContext;
}
