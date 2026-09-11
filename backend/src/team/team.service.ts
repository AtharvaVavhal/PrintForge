import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MembershipStatus, Prisma, TenantRole } from '@prisma/client';
import { PrismaService } from '../common/database/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { assertObjectInTenant } from '../common/tenant/object-auth';
import { TenantContext } from '../common/tenant/tenant-context';
import { PaginatedResult } from '../common/types/api-response.interface';
import { InviteTeamMemberDto } from './dto/invite-team-member.dto';
import { ListTeamQueryDto } from './dto/list-team-query.dto';
import { TeamMemberView } from './dto/team-member-view.interface';
import { UpdateTeamMemberRoleDto } from './dto/update-team-member-role.dto';

const MEMBER_INCLUDE = {
  user: { select: { id: true, email: true } },
} satisfies Prisma.TenantMembershipInclude;

type MembershipRow = Prisma.TenantMembershipGetPayload<{
  include: typeof MEMBER_INCLUDE;
}>;

/**
 * Tenant Control Plane — Team Management (SaaS Master Plan §11; Phase 5
 * W7). `PermissionsGuard`'s existing `@RequirePermission('members:manage')`
 * check (`team.controller.ts`) already restricts every route this service
 * backs to an authenticated caller whose resolved `TenantContext` carries
 * that permission — G-13 grants it to `OWNER` only, unmodified — before any
 * method here runs; this class does not re-check role/permission, it
 * receives the actor/tenantContext only to scope queries and attribute
 * audit rows.
 *
 * Deliberately queries `TenantMembership` directly via the plain
 * `PrismaService`, exactly the "narrowly scoped service" category
 * `tenant-data-access-guard.spec.ts`'s allowlist already recognizes for
 * `platform.service.ts`/`support-session.service.ts` — every read/write
 * here is filtered by the caller's own server-derived `tenantId`, and this
 * file never queries any other D4 tenancy model (`Store`/`StoreDomain`/
 * `Subscription`/`Customer`) or business/commerce table.
 */
@Injectable()
export class TeamService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  // ─── GET /admin/team ─────────────────────────────────────────────────

  async listTeam(
    tenantId: string,
    query: ListTeamQueryDto,
  ): Promise<PaginatedResult<TeamMemberView>> {
    const where: Prisma.TenantMembershipWhereInput = { tenantId };

    const [rows, total] = await Promise.all([
      this.prisma.tenantMembership.findMany({
        where,
        include: MEMBER_INCLUDE,
        orderBy: { createdAt: 'asc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.tenantMembership.count({ where }),
    ]);

    return {
      items: rows.map((row) => this.toView(row)),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.limit)),
      },
    };
  }

  // ─── POST /admin/team/invite ────────────────────────────────────────
  //
  // No invitation-token/acceptance flow exists anywhere in this codebase
  // (confirmed by fact-find — `invitedByUserId` is a plain FK column, not
  // a mechanism), and W7's own named endpoint set has no "accept invite"
  // route. The smallest architecture-consistent implementation is
  // therefore: the target user must already hold a registered `User`
  // account (looked up by email); inviting them creates their
  // `TenantMembership` directly in `INVITED` status. No email is sent —
  // see the W7 implementation report's "invitation-token/email behavior"
  // section for why, and for the resulting delivery limitation.

  async inviteMember(
    tenantContext: TenantContext,
    actor: AuthenticatedUser,
    dto: InviteTeamMemberDto,
  ): Promise<TeamMemberView> {
    const tenantId = tenantContext.tenantId;

    const targetUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true },
    });
    if (!targetUser) {
      throw new NotFoundException(
        'No user account exists for that email — they must register before being invited',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.tenantMembership.findUnique({
        where: { userId_tenantId: { userId: targetUser.id, tenantId } },
      });
      if (existing) {
        throw new ConflictException(
          `This user already has a membership in this tenant (status: ${existing.status})`,
        );
      }

      const created = await tx.tenantMembership.create({
        data: {
          userId: targetUser.id,
          tenantId,
          role: dto.role,
          status: MembershipStatus.INVITED,
          invitedByUserId: actor.id,
        },
        include: MEMBER_INCLUDE,
      });

      await this.writeAudit(tx, tenantContext, actor, {
        action: 'team.invite',
        targetId: created.id,
        metadata: { invitedEmail: dto.email, role: dto.role },
      });

      return this.toView(created);
    });
  }

  // ─── PATCH /admin/team/:membershipId/role ──────────────────────────

  async updateRole(
    tenantContext: TenantContext,
    actor: AuthenticatedUser,
    membershipId: string,
    dto: UpdateTeamMemberRoleDto,
  ): Promise<TeamMemberView> {
    const tenantId = tenantContext.tenantId;

    return this.prisma.$transaction(async (tx) => {
      const target = await tx.tenantMembership.findUnique({
        where: { id: membershipId },
      });
      // A membership from another tenant is indistinguishable from a
      // nonexistent one here (404, never 403) — same existence-leak
      // reasoning as every other assertObjectInTenant call site.
      assertObjectInTenant(target, tenantId);

      if (target.role === TenantRole.OWNER) {
        const activeOwners = await this.countActiveOwners(tx, tenantId);
        if (activeOwners <= 1) {
          throw new ConflictException(
            "Cannot change the role of the tenant's final OWNER — OWNER transfer is not implemented (P5-GOV-02)",
          );
        }
      }

      const cas = await tx.tenantMembership.updateMany({
        where: { id: membershipId, tenantId, role: target.role },
        data: { role: dto.role },
      });
      if (cas.count !== 1) {
        throw new ConflictException(
          'Membership role changed concurrently — retry',
        );
      }

      await this.writeAudit(tx, tenantContext, actor, {
        action: 'team.role_change',
        targetId: membershipId,
        metadata: { fromRole: target.role, toRole: dto.role },
      });

      const updated = await tx.tenantMembership.findUniqueOrThrow({
        where: { id: membershipId },
        include: MEMBER_INCLUDE,
      });
      return this.toView(updated);
    });
  }

  // ─── POST /admin/team/:membershipId/suspend ────────────────────────

  async suspendMember(
    tenantContext: TenantContext,
    actor: AuthenticatedUser,
    membershipId: string,
  ): Promise<TeamMemberView> {
    const tenantId = tenantContext.tenantId;

    return this.prisma.$transaction(async (tx) => {
      const target = await tx.tenantMembership.findUnique({
        where: { id: membershipId },
      });
      assertObjectInTenant(target, tenantId);

      if (target.status === MembershipStatus.SUSPENDED) {
        throw new ConflictException('This membership is already suspended');
      }

      if (target.role === TenantRole.OWNER) {
        const activeOwners = await this.countActiveOwners(tx, tenantId);
        if (activeOwners <= 1) {
          throw new ConflictException(
            "Cannot suspend the tenant's final OWNER",
          );
        }
      }

      const cas = await tx.tenantMembership.updateMany({
        where: {
          id: membershipId,
          tenantId,
          status: { not: MembershipStatus.SUSPENDED },
        },
        data: { status: MembershipStatus.SUSPENDED },
      });
      if (cas.count !== 1) {
        throw new ConflictException(
          'Membership status changed concurrently — retry',
        );
      }

      await this.writeAudit(tx, tenantContext, actor, {
        action: 'team.suspend',
        targetId: membershipId,
        metadata: { fromStatus: target.status },
      });

      const updated = await tx.tenantMembership.findUniqueOrThrow({
        where: { id: membershipId },
        include: MEMBER_INCLUDE,
      });
      return this.toView(updated);
    });
  }

  // ─── Shared helpers ─────────────────────────────────────────────────

  /** The tenant's current count of ACTIVE OWNER memberships — an
   * INVITED or SUSPENDED OWNER row does not count as a functioning owner
   * (JwtStrategy already excludes non-ACTIVE memberships from
   * AuthenticatedUser entirely), so it is not a valid "still has an
   * owner" safety net either. */
  private async countActiveOwners(
    tx: Prisma.TransactionClient,
    tenantId: string,
  ): Promise<number> {
    return tx.tenantMembership.count({
      where: {
        tenantId,
        role: TenantRole.OWNER,
        status: MembershipStatus.ACTIVE,
      },
    });
  }

  /**
   * Correct actor attribution (no fabricated membership, ever): an
   * ordinary OWNER's own membership row is looked up fresh (never taken
   * from a cached/stale value) and used as `actorMembershipId`; a
   * SupportSession-driven actor (Phase 5 W6 — genuinely possible here
   * since `members:manage` is an ordinary ratified permission a session
   * can be scoped to, and this controller adds no special-case logic to
   * prevent that) structurally has NO real TenantMembership row for this
   * tenant, so `actorMembership` resolves to `null` and `actorMembershipId`
   * is correctly left undefined, with `viaSupportSessionId` set instead.
   */
  private async writeAudit(
    tx: Prisma.TransactionClient,
    tenantContext: TenantContext,
    actor: AuthenticatedUser,
    action: {
      action: string;
      targetId: string;
      metadata: Prisma.InputJsonValue;
    },
  ): Promise<void> {
    const actorMembership = await tx.tenantMembership.findUnique({
      where: {
        userId_tenantId: { userId: actor.id, tenantId: tenantContext.tenantId },
      },
      select: { id: true },
    });

    await this.auditService.logTenantAction(tx, {
      tenantId: tenantContext.tenantId,
      actorMembershipId: actorMembership?.id,
      viaSupportSessionId:
        tenantContext.source === 'support-session'
          ? tenantContext.supportSession?.id
          : undefined,
      action: action.action,
      targetType: 'TenantMembership',
      targetId: action.targetId,
      metadata: action.metadata,
    });
  }

  // ─── View assembly (field-by-field — never a spread) ────────────────

  private toView(row: MembershipRow): TeamMemberView {
    return {
      id: row.id,
      userId: row.user.id,
      email: row.user.email,
      role: row.role,
      status: row.status,
      invitedByUserId: row.invitedByUserId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
