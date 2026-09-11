import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentTenantContext } from '../common/decorators/current-tenant-context.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import type { TenantContext } from '../common/tenant/tenant-context';
import { RequirePermission } from '../auth/permissions/require-permission.decorator';
import { InviteTeamMemberDto } from './dto/invite-team-member.dto';
import { ListTeamQueryDto } from './dto/list-team-query.dto';
import { UpdateTeamMemberRoleDto } from './dto/update-team-member-role.dto';
import { TeamService } from './team.service';

/**
 * Tenant Control Plane — Team Management (SaaS Master Plan §11; Phase 5
 * W7). Owns: GET /admin/team, POST /admin/team/invite,
 * PATCH /admin/team/:membershipId/role,
 * POST /admin/team/:membershipId/suspend. Every route here requires
 * `members:manage` via the class-level `@RequirePermission(...)` below —
 * the SAME `PermissionsGuard`/`TenantContextGuard`/`TenantLifecycleGuard`
 * pipeline every other `/admin/*` route already uses; no second
 * authorization mechanism, no SUPER_ADMIN special-casing anywhere in this
 * file. G-13 grants `members:manage` to `OWNER` only (unmodified), so this
 * is structurally OWNER-only already, with zero role-name checks here.
 */
@Controller('admin/team')
@RequirePermission('members:manage')
export class TeamController {
  constructor(private readonly teamService: TeamService) {}

  @Get()
  async listTeam(
    @CurrentTenantContext() tenantContext: TenantContext,
    @Query() query: ListTeamQueryDto,
  ) {
    return this.teamService.listTeam(tenantContext.tenantId, query);
  }

  @Post('invite')
  async invite(
    @CurrentTenantContext() tenantContext: TenantContext,
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: InviteTeamMemberDto,
  ) {
    return this.teamService.inviteMember(tenantContext, actor, dto);
  }

  @Patch(':membershipId/role')
  async updateRole(
    @CurrentTenantContext() tenantContext: TenantContext,
    @CurrentUser() actor: AuthenticatedUser,
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
    @Body() dto: UpdateTeamMemberRoleDto,
  ) {
    return this.teamService.updateRole(tenantContext, actor, membershipId, dto);
  }

  @Post(':membershipId/suspend')
  @HttpCode(HttpStatus.OK)
  async suspend(
    @CurrentTenantContext() tenantContext: TenantContext,
    @CurrentUser() actor: AuthenticatedUser,
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
  ) {
    return this.teamService.suspendMember(tenantContext, actor, membershipId);
  }
}
