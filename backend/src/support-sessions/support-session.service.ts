import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TenantStatus } from '@prisma/client';
import { PrismaService } from '../common/database/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { PaginatedResult } from '../common/types/api-response.interface';
import type { Permission } from '../auth/permissions/permission';
import { CreateSupportSessionDto } from './dto/create-support-session.dto';
import {
  ListSupportSessionsQueryDto,
  SupportSessionStatusFilter,
} from './dto/list-support-sessions-query.dto';
import { SupportSessionView } from './dto/support-session-view.interface';

type SupportSessionRow = Prisma.SupportSessionGetPayload<Record<string, never>>;

/**
 * SupportSession lifecycle service (Phase 5 W6; decisions P5-D4 / P5-D4A /
 * P5-D8). `PlatformGuard`/`@PlatformOnly()` already restrict every route
 * this service backs to an authenticated `SUPER_ADMIN` before any method
 * here runs (`support-session.controller.ts`) — this class does not
 * re-check `platformRole`; it receives the actor only to attribute rows.
 *
 * Every method here is a PLATFORM-level action ABOUT a support session
 * (create one, revoke one, list them across tenants) — not an action
 * performed THROUGH one. It therefore queries `Tenant`/`SupportSession`
 * directly via the plain `PrismaService`, mirroring `PlatformService`'s own
 * existing, allowlisted pattern exactly (same category: "narrowly scoped
 * platform service querying the Tenant table for platform-level tenant
 * management", now extended to the one further table this phase adds).
 * `getSupportSessionScopedClient` (W5) is deliberately NOT used here — its
 * contract is "an already-resolved, server-derived SupportSession identity
 * in hand"; at creation time no session yet exists (the request body's
 * `tenantId` is the platform admin's own explicit target selection, exactly
 * like `PlatformService.suspendTenant`'s own `tenantId` path param), and at
 * revocation/list time the action targets the `SupportSession` row itself,
 * not tenant-owned business data — see the W6 implementation report's
 * "W5 scoped-client integration" section for the full reasoning.
 */
@Injectable()
export class SupportSessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  // ─── POST /platform/support-sessions ────────────────────────────────────

  async createSession(
    actor: AuthenticatedUser,
    dto: CreateSupportSessionDto,
    ip: string,
  ): Promise<SupportSessionView> {
    const expiresAt = new Date(dto.expiresAt);
    if (Number.isNaN(expiresAt.getTime())) {
      throw new BadRequestException('expiresAt is not a valid date');
    }
    if (expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException('expiresAt must be in the future');
    }

    return this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.findUnique({
        where: { id: dto.tenantId },
      });
      if (!tenant) {
        throw new NotFoundException('Tenant not found');
      }
      // Strict equality, not merely "not SUSPENDED" — creation is the one
      // place this phase's plan explicitly requires "target tenant must be
      // ACTIVE", uniformly rejecting SUSPENDED/PENDING_DELETION/DELETED
      // alike. This is a single equality check at one endpoint, not new
      // PENDING_DELETION/DELETED lifecycle machinery (out of scope — see
      // the W6 report's tenant-lifecycle section for why request-time
      // enforcement deliberately stays SUSPENDED-only, unchanged from W4).
      if (tenant.status !== TenantStatus.ACTIVE) {
        throw new ConflictException(
          `Tenant is not ACTIVE (current status: ${tenant.status}) — cannot open a support session`,
        );
      }

      const session = await tx.supportSession.create({
        data: {
          tenantId: dto.tenantId,
          createdByUserId: actor.id,
          justification: dto.justification,
          grantedPermissions: dto.grantedPermissions,
          expiresAt,
        },
      });

      await this.auditService.logPlatformAction(tx, {
        actorUserId: actor.id,
        action: 'support_session.create',
        targetType: 'SupportSession',
        targetId: session.id,
        tenantId: dto.tenantId,
        justification: dto.justification,
        metadata: {
          grantedPermissions: dto.grantedPermissions,
          expiresAt: expiresAt.toISOString(),
        },
        ip,
      });

      // Tenant-side attribution (frozen audit model): the actor is a
      // platform admin, not a tenant member or customer — actorMembershipId
      // / actorCustomerId are both correctly omitted (never fabricated);
      // the platform actor is identified solely via viaSupportSessionId,
      // exactly as W2's forward-reference comment on that column
      // anticipated. This is the one tenant-side action W6 itself performs
      // (opening/closing a session against a tenant) — see the report for
      // why no broader per-route audit wiring was added.
      await this.auditService.logTenantAction(tx, {
        tenantId: dto.tenantId,
        action: 'support_session.create',
        targetType: 'SupportSession',
        targetId: session.id,
        metadata: {
          grantedPermissions: dto.grantedPermissions,
          expiresAt: expiresAt.toISOString(),
        },
        viaSupportSessionId: session.id,
      });

      return this.toView(session);
    });
  }

  // ─── POST /platform/support-sessions/:id/revoke ────────────────────────

  async revokeSession(
    actor: AuthenticatedUser,
    sessionId: string,
    ip: string,
  ): Promise<SupportSessionView> {
    return this.prisma.$transaction(async (tx) => {
      const session = await tx.supportSession.findUnique({
        where: { id: sessionId },
      });
      if (!session) {
        throw new NotFoundException('Support session not found');
      }
      if (session.revokedAt !== null) {
        // Repeated revoke: a consistent, safe, explicit conflict — never a
        // silent no-op that could mask which admin actually revoked it
        // (same rationale PlatformService.transitionTenantStatus documents
        // for its own CAS: a rare, single-actor, fully-audited platform
        // action, not a high-frequency race to absorb silently).
        throw new ConflictException('Support session is already revoked');
      }

      const cas = await tx.supportSession.updateMany({
        where: { id: sessionId, revokedAt: null },
        data: { revokedAt: new Date(), revokedByUserId: actor.id },
      });
      if (cas.count !== 1) {
        throw new ConflictException(
          'Support session was revoked concurrently — retry',
        );
      }

      await this.auditService.logPlatformAction(tx, {
        actorUserId: actor.id,
        action: 'support_session.revoke',
        targetType: 'SupportSession',
        targetId: sessionId,
        tenantId: session.tenantId,
        metadata: {},
        ip,
      });

      await this.auditService.logTenantAction(tx, {
        tenantId: session.tenantId,
        action: 'support_session.revoke',
        targetType: 'SupportSession',
        targetId: sessionId,
        metadata: {},
        viaSupportSessionId: sessionId,
      });

      const updated = await tx.supportSession.findUniqueOrThrow({
        where: { id: sessionId },
      });
      return this.toView(updated);
    });
  }

  // ─── GET /platform/support-sessions ─────────────────────────────────────
  // Cross-tenant by design (a platform-wide list, exactly like
  // PlatformService.listTenants/listPlatformAudit) — never exposes a
  // secret/token (there is none to expose; see the model's own schema
  // comment).

  async listSessions(
    query: ListSupportSessionsQueryDto,
  ): Promise<PaginatedResult<SupportSessionView>> {
    const now = new Date();
    const where: Prisma.SupportSessionWhereInput = {
      ...(query.tenantId ? { tenantId: query.tenantId } : {}),
      ...(query.status === 'REVOKED' ? { revokedAt: { not: null } } : {}),
      ...(query.status === 'EXPIRED'
        ? { revokedAt: null, expiresAt: { lte: now } }
        : {}),
      ...(query.status === 'ACTIVE'
        ? { revokedAt: null, expiresAt: { gt: now } }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.supportSession.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.supportSession.count({ where }),
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

  // ─── View assembly (field-by-field — never a spread; no secret column
  // exists on this model, so there is nothing to accidentally leak here
  // beyond what's listed) ──────────────────────────────────────────────────

  private toView(session: SupportSessionRow): SupportSessionView {
    return {
      id: session.id,
      tenantId: session.tenantId,
      createdByUserId: session.createdByUserId,
      justification: session.justification,
      grantedPermissions: session.grantedPermissions as Permission[],
      expiresAt: session.expiresAt,
      revokedAt: session.revokedAt,
      revokedByUserId: session.revokedByUserId,
      createdAt: session.createdAt,
      status: this.computeStatus(session),
    };
  }

  private computeStatus(session: {
    revokedAt: Date | null;
    expiresAt: Date;
  }): SupportSessionStatusFilter {
    if (session.revokedAt !== null) {
      return 'REVOKED';
    }
    if (session.expiresAt.getTime() <= Date.now()) {
      return 'EXPIRED';
    }
    return 'ACTIVE';
  }
}
