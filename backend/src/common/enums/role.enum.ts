/**
 * Legacy single-tenant `User.role` — see
 * docs/architecture/BLUEPRINT-v1.2.md §6 (User Roles & RBAC). Retained as a
 * dual-read identity field during the SaaS migration (decision P2-D10,
 * docs/saas/DECISIONS.md); its retirement/drop is Phase 4 scope. Route-level
 * authorization no longer reads this enum via a guard as of Phase 3
 * (decisions P2-D9, G-13, G-20): `@RequirePermission(...)` +
 * `PermissionsGuard`, backed by the ratified `TenantRole → Set<Permission>`
 * catalogue (`src/auth/permissions/permission.ts`), replaced
 * `@Roles(Role.ADMIN)` + `RolesGuard`. Some non-guard business logic still
 * legitimately reads `user.role` directly (e.g. `uploads.controller.ts`
 * object-ownership checks, `orders.service.ts` actor tracking) — those are
 * unaffected by the Phase 3 guard swap and out of its scope.
 */
export enum Role {
  CUSTOMER = 'CUSTOMER',
  ADMIN = 'ADMIN',
}
