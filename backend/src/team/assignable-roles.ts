import { TenantRole } from '@prisma/client';

/**
 * Phase 5 W7 (P5-GOV-02 — OWNER transfer is deferred). The set of
 * `TenantRole` values `POST /admin/team/invite` and
 * `PATCH /admin/team/:membershipId/role` may ever assign. `OWNER` is
 * deliberately excluded from both: an invite can never create a second
 * OWNER, and the role-change endpoint can never promote a member to
 * OWNER or replace the existing one — creating/transferring OWNER status
 * is out of scope for W7 by design, not an oversight. Shared by both DTOs
 * (`@IsIn`) and `TeamService` (defense in depth beyond the DTO layer) so
 * the ceiling is expressed in exactly one place.
 */
export const ASSIGNABLE_TENANT_ROLES = [
  TenantRole.ADMIN,
  TenantRole.STAFF,
  TenantRole.VIEWER,
] as const;

export type AssignableTenantRole = (typeof ASSIGNABLE_TENANT_ROLES)[number];
