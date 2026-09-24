import { TenantRole } from '@prisma/client';

/**
 * Permission catalogue — SaaS Master Plan §8/§9; decisions P2-D8 (typed
 * constant representation, frozen), G-13 (ratified 2026-09-07,
 * docs/saas/DECISIONS.md — the original 13-permission set), and P7-D2
 * Part A (ratified 2026-09-12 — adds `billing:manage`, the 14th
 * permission). Do not add, remove, or rename a permission without a
 * recorded ratification the same way this set was ratified (G-13's own
 * "future addition" norm, exercised here by P7-D2).
 *
 * `members:manage` and `payment-account:manage` are reserved: no current
 * route uses them (no team-management or payment-account-linkage surface
 * exists yet — Phase 5 / Phase 8 respectively). They are ratified now so
 * that future work does not need to reopen this catalogue.
 *
 * `billing:manage` (P7-D2 Part A) is NOT reserved — it is live from this
 * change, gating the four new Stage 2 tenant subscription-mutation routes
 * (`POST /admin/subscription/upgrade|downgrade|cancel|resume`). Not the
 * same concern as `payment-account:manage` (Phase 8 — a tenant linking
 * its OWN merchant Razorpay credentials) or `dashboard:read` (read-only) —
 * P7-D2 Part A explicitly ratified a distinct permission rather than
 * reusing either. Role grant (this file's own decision, since P7-D2 only
 * ratified "not CUSTOMER" — `CUSTOMER` is in any case not a `TenantRole`
 * value here at all): `OWNER`/`ADMIN` only, matching every other
 * financially-consequential write in this catalogue (`coupons:write`,
 * `settings:write`) — `STAFF`/`VIEWER` do not receive it, since changing
 * or cancelling the tenant's own SaaS subscription is at least as
 * consequential as those, and no route currently expects a non-admin
 * membership to hold it.
 */
export const PERMISSIONS = [
  'dashboard:read',
  'orders:read',
  'orders:transition',
  'customers:read',
  'reviews:moderate',
  'coupons:read',
  'coupons:write',
  'settings:read',
  'settings:write',
  'products:read',
  'products:write',
  'members:manage',
  'payment-account:manage',
  'billing:manage',
  // Phase 9 (P9-S2, ratified 2026-09-20): merchant store-domain management
  // — add / list / verify (W5), and set-primary / remove / TLS refresh
  // (W6). OWNER-only by ratified default, excluded from ADMIN exactly like
  // `members:manage` / `payment-account:manage`. `settings:write` is NOT
  // reused (P9-S2: "Do not reuse an existing permission").
  'store-domain:manage',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/**
 * `TenantRole → Set<Permission>` map (G-13). `SUPER_ADMIN` (`PlatformRole`,
 * not `TenantRole`) is deliberately absent — a platform super-admin has no
 * entry here and therefore no tenant permission through `PermissionsGuard`
 * under any circumstance, preserving frozen invariant 4 (`PlatformGuard` and
 * `PermissionsGuard` stay fully independent).
 */
const ALL_PERMISSIONS = new Set<Permission>(PERMISSIONS);

const ADMIN_PERMISSIONS = new Set<Permission>(
  PERMISSIONS.filter(
    (p): p is Permission =>
      p !== 'members:manage' &&
      p !== 'payment-account:manage' &&
      p !== 'store-domain:manage',
  ),
);

const STAFF_PERMISSIONS = new Set<Permission>([
  'dashboard:read',
  'orders:read',
  'orders:transition',
  'customers:read',
  'reviews:moderate',
  'coupons:read',
  'settings:read',
  'products:read',
  'products:write',
]);

const VIEWER_PERMISSIONS = new Set<Permission>([
  'dashboard:read',
  'orders:read',
  'customers:read',
  'coupons:read',
  'settings:read',
  'products:read',
]);

export const ROLE_PERMISSIONS: Readonly<
  Record<TenantRole, ReadonlySet<Permission>>
> = {
  OWNER: ALL_PERMISSIONS,
  ADMIN: ADMIN_PERMISSIONS,
  STAFF: STAFF_PERMISSIONS,
  VIEWER: VIEWER_PERMISSIONS,
};

/**
 * Deny-by-default permission check. A `role` of `undefined`/`null` (no
 * active membership) always denies — there is no implicit permission
 * without an `ACTIVE` `TenantMembership` (spec §5, §9).
 */
export function can(
  role: TenantRole | null | undefined,
  permission: Permission,
): boolean {
  if (!role) {
    return false;
  }
  return ROLE_PERMISSIONS[role].has(permission);
}
