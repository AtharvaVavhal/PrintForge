import { IsEmail, IsIn } from 'class-validator';
import { TenantRole } from '@prisma/client';
import { ASSIGNABLE_TENANT_ROLES } from '../assignable-roles';

/**
 * POST /admin/team/invite (Phase 5 W7). `role` is required, not defaulted
 * — the frozen plan does not specify a default invite role, and inventing
 * one silently was explicitly ruled out; the caller must state it
 * explicitly, and it is validated against the same OWNER-excluding
 * ceiling `PATCH .../role` uses (P5-GOV-02).
 *
 * No `tenantId` field — the target tenant is exclusively the caller's
 * server-derived `TenantContext.tenantId`, never a client-supplied value
 * (the global ValidationPipe's `forbidNonWhitelisted` rejects any attempt
 * to add one).
 */
export class InviteTeamMemberDto {
  @IsEmail()
  email: string;

  @IsIn(ASSIGNABLE_TENANT_ROLES)
  role: TenantRole;
}
