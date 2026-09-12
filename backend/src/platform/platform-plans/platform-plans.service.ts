import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  LimitPeriod,
  Plan,
  PlanFeature,
  PlanLimit,
  Prisma,
  TenantEntitlementOverride,
} from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import {
  FEATURE_KEYS,
  isFeatureKey,
  isLimitKey,
  LIMIT_KEYS,
  LIMIT_KEY_PERIODS,
} from './catalogue.constants';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { SetPlanFeatureDto } from './dto/set-plan-feature.dto';
import { SetPlanLimitDto } from './dto/set-plan-limit.dto';
import { CreateEntitlementOverrideDto } from './dto/create-entitlement-override.dto';
import {
  EntitlementOverrideView,
  PlanFeatureView,
  PlanLimitView,
  PlanView,
} from './dto/plan-view.interface';

/**
 * Phase 6 (W1) — platform catalogue CRUD only (Plan/PlanFeature/PlanLimit/
 * TenantEntitlementOverride schema + management). No `EntitlementService`,
 * no `@RequireFeature`, no `assertLimit`, no `Usage` increment/decrement —
 * all Phase 6 W2. This service never reads or writes `Subscription.planId`
 * or `Subscription.status` — those remain exclusively Phase 7's write
 * surface (ratified Phase 6/Phase 7 boundary).
 *
 * Every route this service backs is already restricted to `SUPER_ADMIN` by
 * `PlatformGuard`/`@PlatformOnly()` at the controller (mirrors
 * `PlatformService`'s own header comment) — this class does not re-check
 * `platformRole`; it receives the actor only to attribute
 * `PlatformAuditLog` rows.
 */
@Injectable()
export class PlatformPlansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  // ─── Plans ──────────────────────────────────────────────────────────────

  /**
   * P6-D1 corrective fix. The naive `orderBy: [{ sortOrder: 'asc' }, ...]`
   * relies on Postgres's raw column value — a legacy `sortOrder: NULL` row
   * sorts under Postgres's default `NULLS LAST` for `ASC`, i.e. after every
   * positive value, even though its intended/coalesced meaning is `0`
   * (`toPlanView` already treats it that way). Prisma's `orderBy` API has
   * no `COALESCE`-equivalent expression, and `nulls: 'first'` is not a
   * correct substitute either — it would sort a `NULL` row strictly
   * *before* an explicit `sortOrder: 0` row, when the two must actually
   * TIE (both mean "0"), broken only by `createdAt`, same as any other
   * genuine tie. `Plan` is a small, never-paginated, platform-owned
   * catalogue (never more than a handful of rows), so a plain in-memory
   * stable sort — keyed on the exact same coalesced value `toPlanView`
   * already computes — is both correct and cheap, and avoids raw SQL
   * entirely per the no-raw-SQL-unless-necessary requirement.
   */
  async listPlans(): Promise<PlanView[]> {
    const plans = await this.prisma.plan.findMany({
      orderBy: { createdAt: 'asc' },
    });
    // Array.prototype.sort is a stable sort (guaranteed since ES2019), so
    // ties on the coalesced sortOrder preserve the createdAt-asc order
    // already fetched above — matching the original two-key intent exactly.
    const sorted = [...plans].sort(
      (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
    );
    return sorted.map((p) => this.toPlanView(p));
  }

  /** Phase 6 W7 — "inspect plan" (single-plan detail read), the one
   * platform capability §5 of the W7 authorization named that had no route
   * yet (`listPlans` above returns every plan; nothing returned exactly
   * one by id). Read-only, no audit entry (reads are never audited in this
   * codebase's existing convention — only mutations are). */
  async getPlan(id: string): Promise<PlanView> {
    const plan = await this.prisma.plan.findUnique({ where: { id } });
    if (!plan) {
      throw new NotFoundException('Plan not found');
    }
    return this.toPlanView(plan);
  }

  async createPlan(
    actor: AuthenticatedUser,
    dto: CreatePlanDto,
    ip: string,
  ): Promise<PlanView> {
    return this.prisma.$transaction(async (tx) => {
      let created: Plan;
      try {
        created = await tx.plan.create({
          data: {
            key: dto.key,
            name: dto.name,
            isPublic: dto.isPublic ?? true,
            isActive: true,
            sortOrder: dto.sortOrder ?? 0,
            isEnterpriseCustom: dto.isEnterpriseCustom ?? false,
          },
        });
      } catch (err) {
        this.mapUniqueConstraintError(
          err,
          'A plan with this key already exists',
        );
      }
      await this.auditService.logPlatformAction(tx, {
        actorUserId: actor.id,
        action: 'plan.create',
        targetType: 'Plan',
        targetId: created.id,
        metadata: { key: created.key, name: created.name },
        ip,
      });
      return this.toPlanView(created);
    });
  }

  async updatePlan(
    actor: AuthenticatedUser,
    id: string,
    dto: UpdatePlanDto,
    ip: string,
  ): Promise<PlanView> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.plan.findUnique({ where: { id } });
      if (!existing) {
        throw new NotFoundException('Plan not found');
      }
      const updated = await tx.plan.update({
        where: { id },
        data: {
          name: dto.name,
          isPublic: dto.isPublic,
          sortOrder: dto.sortOrder,
          isEnterpriseCustom: dto.isEnterpriseCustom,
        },
      });
      await this.auditService.logPlatformAction(tx, {
        actorUserId: actor.id,
        action: 'plan.update',
        targetType: 'Plan',
        targetId: id,
        metadata: { fields: Object.keys(dto) },
        ip,
      });
      return this.toPlanView(updated);
    });
  }

  /** isActive=false. Never touches PlanFeature/PlanLimit — an archived
   * plan's existing catalogue rows are untouched (Design Ratification §4);
   * only "selectable for a NEW subscription" changes. */
  async archivePlan(
    actor: AuthenticatedUser,
    id: string,
    ip: string,
  ): Promise<PlanView> {
    return this.setPlanActiveWithAudit(actor, id, false, 'plan.archive', ip);
  }

  /** isActive=true. Pure flag flip — nothing was ever deleted by archive,
   * so there is nothing to restore beyond the flag itself. */
  async restorePlan(
    actor: AuthenticatedUser,
    id: string,
    ip: string,
  ): Promise<PlanView> {
    return this.setPlanActiveWithAudit(actor, id, true, 'plan.restore', ip);
  }

  private async setPlanActiveWithAudit(
    actor: AuthenticatedUser,
    id: string,
    isActive: boolean,
    action: 'plan.archive' | 'plan.restore',
    ip: string,
  ): Promise<PlanView> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.plan.findUnique({ where: { id } });
      if (!existing) {
        throw new NotFoundException('Plan not found');
      }
      const updated = await tx.plan.update({
        where: { id },
        data: { isActive },
      });
      await this.auditService.logPlatformAction(tx, {
        actorUserId: actor.id,
        action,
        targetType: 'Plan',
        targetId: id,
        metadata: {},
        ip,
      });
      return this.toPlanView(updated);
    });
  }

  /**
   * Hard delete. Pre-checked here for a clean, intentional error — but the
   * REAL authority is `Subscription.plan`'s existing `onDelete: Restrict`
   * (schema.prisma, unchanged by W1): even if a `Subscription` were
   * created between this check and the delete below, the database itself
   * refuses the delete and the resulting FK-violation is mapped to the
   * same clean error, never a raw 500. `PlanFeature`/`PlanLimit` children
   * cascade (their own `onDelete: Cascade`) — never a `Subscription`,
   * never any other tenant data.
   */
  async deletePlan(
    actor: AuthenticatedUser,
    id: string,
    ip: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.plan.findUnique({ where: { id } });
      if (!existing) {
        throw new NotFoundException('Plan not found');
      }
      const subscriptionCount = await tx.subscription.count({
        where: { planId: id },
      });
      if (subscriptionCount > 0) {
        throw new ConflictException(
          'This plan has been assigned to at least one subscription (including historical/cancelled ones) and can never be deleted — archive it instead',
        );
      }
      try {
        await tx.plan.delete({ where: { id } });
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2003'
        ) {
          // Race: a Subscription was created between the count() above and
          // this delete. The FK is the real safety net; the count() above
          // is only what makes the common case a clean error instead of a
          // raw constraint violation.
          throw new ConflictException(
            'This plan was just assigned to a subscription and can no longer be deleted — archive it instead',
          );
        }
        throw err;
      }
      await this.auditService.logPlatformAction(tx, {
        actorUserId: actor.id,
        action: 'plan.delete',
        targetType: 'Plan',
        targetId: id,
        metadata: { key: existing.key },
        ip,
      });
    });
  }

  // ─── Feature / Limit catalogue (code-defined, read-only) ───────────────

  getFeatureCatalogue(): readonly string[] {
    return FEATURE_KEYS;
  }

  getLimitCatalogue(): { limitKey: string; period: LimitPeriod }[] {
    return LIMIT_KEYS.map((limitKey) => ({
      limitKey,
      period: LIMIT_KEY_PERIODS[limitKey],
    }));
  }

  // ─── PlanFeature ────────────────────────────────────────────────────────

  async listPlanFeatures(planId: string): Promise<PlanFeatureView[]> {
    await this.assertPlanExists(planId);
    const rows = await this.prisma.planFeature.findMany({
      where: { planId },
      orderBy: { featureKey: 'asc' },
    });
    return rows.map((r) => this.toPlanFeatureView(r));
  }

  async setPlanFeature(
    actor: AuthenticatedUser,
    planId: string,
    featureKey: string,
    dto: SetPlanFeatureDto,
    ip: string,
  ): Promise<PlanFeatureView> {
    if (!isFeatureKey(featureKey)) {
      throw new BadRequestException(
        `"${featureKey}" is not a recognized feature key`,
      );
    }
    return this.prisma.$transaction(async (tx) => {
      await this.assertPlanExists(planId, tx);
      const row = await tx.planFeature.upsert({
        where: { planId_featureKey: { planId, featureKey } },
        update: { enabled: dto.enabled },
        create: { planId, featureKey, enabled: dto.enabled },
      });
      await this.auditService.logPlatformAction(tx, {
        actorUserId: actor.id,
        action: 'plan.feature.set',
        targetType: 'PlanFeature',
        targetId: row.id,
        metadata: { planId, featureKey, enabled: dto.enabled },
        ip,
      });
      return this.toPlanFeatureView(row);
    });
  }

  // ─── PlanLimit ──────────────────────────────────────────────────────────

  async listPlanLimits(planId: string): Promise<PlanLimitView[]> {
    await this.assertPlanExists(planId);
    const rows = await this.prisma.planLimit.findMany({
      where: { planId },
      orderBy: { limitKey: 'asc' },
    });
    return rows.map((r) => this.toPlanLimitView(r));
  }

  async setPlanLimit(
    actor: AuthenticatedUser,
    planId: string,
    limitKey: string,
    dto: SetPlanLimitDto,
    ip: string,
  ): Promise<PlanLimitView> {
    if (!isLimitKey(limitKey)) {
      throw new BadRequestException(
        `"${limitKey}" is not a recognized limit key`,
      );
    }
    // Period is derived from the ratified catalogue, never client-supplied
    // — a limit's period classification can never drift per-plan.
    const period = LIMIT_KEY_PERIODS[limitKey];
    return this.prisma.$transaction(async (tx) => {
      await this.assertPlanExists(planId, tx);
      const row = await tx.planLimit.upsert({
        where: { planId_limitKey: { planId, limitKey } },
        update: { limitValue: dto.limitValue, period },
        create: { planId, limitKey, limitValue: dto.limitValue, period },
      });
      await this.auditService.logPlatformAction(tx, {
        actorUserId: actor.id,
        action: 'plan.limit.set',
        targetType: 'PlanLimit',
        targetId: row.id,
        metadata: { planId, limitKey, limitValue: dto.limitValue, period },
        ip,
      });
      return this.toPlanLimitView(row);
    });
  }

  // ─── TenantEntitlementOverride ──────────────────────────────────────────

  async listOverridesForTenant(
    tenantId: string,
  ): Promise<EntitlementOverrideView[]> {
    await this.assertTenantExists(tenantId);
    const rows = await this.prisma.tenantEntitlementOverride.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => this.toOverrideView(r));
  }

  async createOverride(
    actor: AuthenticatedUser,
    tenantId: string,
    dto: CreateEntitlementOverrideDto,
    ip: string,
  ): Promise<EntitlementOverrideView> {
    const hasFeatureKey = dto.featureKey !== undefined;
    const hasLimitKey = dto.limitKey !== undefined;
    if (hasFeatureKey === hasLimitKey) {
      // Same DB-level invariant as the CHECK constraint
      // (`tenant_entitlement_overrides_exactly_one_key`) — checked here
      // too so the caller gets a clean 400, never a raw constraint
      // violation. The CHECK remains the actual authority.
      throw new BadRequestException(
        'Exactly one of featureKey or limitKey must be provided',
      );
    }
    if (hasFeatureKey) {
      if (!isFeatureKey(dto.featureKey as string)) {
        throw new BadRequestException(
          `"${dto.featureKey}" is not a recognized feature key`,
        );
      }
      if (dto.boolValue === undefined) {
        throw new BadRequestException('A feature override requires boolValue');
      }
      if (dto.intValue !== undefined) {
        throw new BadRequestException(
          'A feature override must not set intValue',
        );
      }
    } else {
      if (!isLimitKey(dto.limitKey as string)) {
        throw new BadRequestException(
          `"${dto.limitKey}" is not a recognized limit key`,
        );
      }
      if (dto.intValue === undefined) {
        throw new BadRequestException(
          'A limit override requires intValue (or null for unlimited)',
        );
      }
      if (dto.boolValue !== undefined) {
        throw new BadRequestException(
          'A limit override must not set boolValue',
        );
      }
    }

    return this.prisma.$transaction(async (tx) => {
      await this.assertTenantExists(tenantId, tx);
      const created = await tx.tenantEntitlementOverride.create({
        data: {
          tenantId,
          featureKey: dto.featureKey ?? null,
          limitKey: dto.limitKey ?? null,
          boolValue: dto.boolValue ?? null,
          intValue: dto.intValue === undefined ? null : dto.intValue,
          reason: dto.reason,
          createdByUserId: actor.id,
        },
      });
      await this.auditService.logPlatformAction(tx, {
        actorUserId: actor.id,
        action: 'entitlement_override.create',
        targetType: 'TenantEntitlementOverride',
        targetId: created.id,
        tenantId,
        metadata: {
          featureKey: created.featureKey,
          limitKey: created.limitKey,
          reason: created.reason,
        },
        ip,
      });
      return this.toOverrideView(created);
    });
  }

  /** Soft revoke — `revokedAt`/`revokedByUserId` set, the row is never
   * deleted or mutated in any other field. "Update" means revoke-and-
   * recreate (create a fresh override) — there is no separate update
   * method for an override's own value fields. */
  async revokeOverride(
    actor: AuthenticatedUser,
    tenantId: string,
    overrideId: string,
    ip: string,
  ): Promise<EntitlementOverrideView> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.tenantEntitlementOverride.findUnique({
        where: { id: overrideId },
      });
      // Cross-tenant id mismatch treated as 404, never 403 — same
      // existence-leak reasoning as `assertObjectInTenant` everywhere else
      // in this codebase, even though this route is platform-side.
      if (!existing || existing.tenantId !== tenantId) {
        throw new NotFoundException('Override not found');
      }
      if (existing.revokedAt) {
        throw new ConflictException('This override has already been revoked');
      }
      const updated = await tx.tenantEntitlementOverride.update({
        where: { id: overrideId },
        data: { revokedAt: new Date(), revokedByUserId: actor.id },
      });
      await this.auditService.logPlatformAction(tx, {
        actorUserId: actor.id,
        action: 'entitlement_override.revoke',
        targetType: 'TenantEntitlementOverride',
        targetId: overrideId,
        tenantId,
        metadata: {
          featureKey: existing.featureKey,
          limitKey: existing.limitKey,
        },
        ip,
      });
      return this.toOverrideView(updated);
    });
  }

  // ─── Helpers ────────────────────────────────────────────────────────────

  private async assertPlanExists(
    planId: string,
    client: Pick<PrismaService, 'plan'> = this.prisma,
  ): Promise<void> {
    const plan = await client.plan.findUnique({ where: { id: planId } });
    if (!plan) {
      throw new NotFoundException('Plan not found');
    }
  }

  private async assertTenantExists(
    tenantId: string,
    client: Pick<PrismaService, 'tenant'> = this.prisma,
  ): Promise<void> {
    const tenant = await client.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }
  }

  private mapUniqueConstraintError(err: unknown, message: string): never {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      throw new ConflictException(message);
    }
    throw err as Error;
  }

  private toPlanView(plan: Plan): PlanView {
    return {
      id: plan.id,
      key: plan.key,
      name: plan.name,
      isPublic: plan.isPublic,
      // Coalesced — see schema.prisma's own Plan comment: `null` is only
      // ever a legacy-row artifact for a row the W1 backfill hasn't
      // reached, never a value the API surfaces to a caller.
      isActive: plan.isActive ?? true,
      sortOrder: plan.sortOrder ?? 0,
      isEnterpriseCustom: plan.isEnterpriseCustom ?? false,
      createdAt: plan.createdAt,
    };
  }

  private toPlanFeatureView(row: PlanFeature): PlanFeatureView {
    return {
      id: row.id,
      planId: row.planId,
      featureKey: row.featureKey,
      enabled: row.enabled,
    };
  }

  private toPlanLimitView(row: PlanLimit): PlanLimitView {
    return {
      id: row.id,
      planId: row.planId,
      limitKey: row.limitKey,
      limitValue: row.limitValue,
      period: row.period,
    };
  }

  private toOverrideView(
    row: TenantEntitlementOverride,
  ): EntitlementOverrideView {
    return {
      id: row.id,
      tenantId: row.tenantId,
      featureKey: row.featureKey,
      limitKey: row.limitKey,
      boolValue: row.boolValue,
      intValue: row.intValue,
      reason: row.reason,
      createdByUserId: row.createdByUserId,
      revokedAt: row.revokedAt,
      revokedByUserId: row.revokedByUserId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
