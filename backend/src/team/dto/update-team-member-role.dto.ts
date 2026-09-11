import { IsIn } from 'class-validator';
import { TenantRole } from '@prisma/client';
import { ASSIGNABLE_TENANT_ROLES } from '../assignable-roles';

/**
 * PATCH /admin/team/:membershipId/role (Phase 5 W7). `role` cannot be
 * `OWNER` at the type/validation layer itself (P5-GOV-02, deferred owner
 * transfer) — defense in depth beyond `TeamService`'s own check.
 */
export class UpdateTeamMemberRoleDto {
  @IsIn(ASSIGNABLE_TENANT_ROLES)
  role: TenantRole;
}
