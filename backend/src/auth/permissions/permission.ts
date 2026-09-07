import { TenantRole } from '@prisma/client';

/**
 * Permission catalogue — SaaS Master Plan §8/§9; decisions P2-D8 (typed
 * constant representation, frozen) and G-13 (ratified 2026-09-07,
 * docs/saas/DECISIONS.md). This is the exact, ratified 13-permission set —
 * do not add, remove, or rename a permission without a recorded ratification
 * the same way this set was ratified (G-13's own "future addition" norm).
 *
 * `members:manage` and `payment-account:manage` are reserved: no current
 * route uses them (no team-management or payment-account-linkage surface
 * exists yet — Phase 5 / Phase 8 respectively). They are ratified now so
 * that future work does not need to reopen this catalogue.
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
      p !== 'members:manage' && p !== 'payment-account:manage',
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
