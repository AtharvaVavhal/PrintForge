import { Prisma } from '@prisma/client';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { PlatformPlansService } from './platform-plans.service';

/**
 * Phase 6 W1. Unit tests against a mocked `PrismaService` whose
 * `$transaction` invokes the callback with a fake `tx` — same convention as
 * `platform.service.spec.ts`. HTTP-level authorization (guard chain) is
 * proven by `PlatformGuard`'s own existing tests plus e2e coverage; this
 * file proves `PlatformPlansService`'s own logic in isolation: plan
 * lifecycle, catalogue-key validation, override invariants, and that every
 * mutation writes exactly one `PlatformAuditLog` via `AuditService`.
 */
describe('PlatformPlansService', () => {
  const actor: AuthenticatedUser = {
    id: 'super-admin-1',
    email: 'sa@example.test',
    role: 'ADMIN',
    platformRole: 'SUPER_ADMIN',
    memberships: [],
  };
  const ip = '203.0.113.7';

  const activePlan = {
    id: 'plan-1',
    key: 'starter',
    name: 'Starter',
    isPublic: true,
    isActive: true,
    sortOrder: 1,
    isEnterpriseCustom: false,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  };

  const legacyNullPlan = {
    ...activePlan,
    id: 'plan-legacy',
    isActive: null,
    sortOrder: null,
    isEnterpriseCustom: null,
  };

  function p2002(): Prisma.PrismaClientKnownRequestError {
    return new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed',
      {
        code: 'P2002',
        clientVersion: '6.19.3',
      },
    );
  }

  function p2003(): Prisma.PrismaClientKnownRequestError {
    return new Prisma.PrismaClientKnownRequestError(
      'Foreign key constraint failed',
      {
        code: 'P2003',
        clientVersion: '6.19.3',
      },
    );
  }

  function makePrisma() {
    const tx = {
      plan: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      subscription: { count: jest.fn() },
      planFeature: { upsert: jest.fn() },
      planLimit: { upsert: jest.fn() },
      tenant: { findUnique: jest.fn() },
      tenantEntitlementOverride: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };
    const prisma = {
      plan: { findMany: jest.fn(), findUnique: jest.fn() },
      planFeature: { findMany: jest.fn() },
      planLimit: { findMany: jest.fn() },
      tenant: { findUnique: jest.fn() },
      tenantEntitlementOverride: { findMany: jest.fn() },
      $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(tx)),
    };
    return { prisma, tx };
  }

  function makeAudit() {
    return { logPlatformAction: jest.fn().mockResolvedValue(undefined) };
  }

  function makeService(prisma: unknown, audit: unknown) {
    return new PlatformPlansService(prisma as never, audit as AuditService);
  }

  // ─── Plans ──────────────────────────────────────────────────────────────

  describe('listPlans', () => {
    it('coalesces a legacy fully-null row to its documented app-level defaults', async () => {
      const { prisma } = makePrisma();
      prisma.plan.findMany.mockResolvedValue([legacyNullPlan]);
      const service = makeService(prisma, makeAudit());

      const result = await service.listPlans();

      expect(result[0]).toEqual(
        expect.objectContaining({
          isActive: true,
          sortOrder: 0,
          isEnterpriseCustom: false,
        }),
      );
    });

    it('leaves an already-non-null row completely unchanged by coalescing', async () => {
      const { prisma } = makePrisma();
      prisma.plan.findMany.mockResolvedValue([activePlan]);
      const service = makeService(prisma, makeAudit());

      const result = await service.listPlans();

      expect(result[0]).toEqual(
        expect.objectContaining({
          isActive: activePlan.isActive,
          sortOrder: activePlan.sortOrder,
          isEnterpriseCustom: activePlan.isEnterpriseCustom,
        }),
      );
    });

    // P6-D1 corrective fix — query-level `sortOrder` NULL semantics. The
    // naive `orderBy: [{ sortOrder: 'asc' }, ...]` relies on Postgres's own
    // NULLS LAST default for ASC, which would sort a legacy NULL row AFTER
    // every positive `sortOrder`, contradicting its coalesced/intended
    // meaning of `0`. `listPlans()` now fetches ordered by `createdAt` only
    // and stably re-sorts in memory on the coalesced value — these tests
    // prove that re-sort is exactly equivalent to `COALESCE(sortOrder, 0)`,
    // not merely "nulls sort near the front".
    describe('NULL sortOrder query-level ordering (must behave exactly as 0)', () => {
      it('fetches ordered by createdAt only — no DB-level sortOrder ORDER BY (that is what carried the bug)', async () => {
        const { prisma } = makePrisma();
        prisma.plan.findMany.mockResolvedValue([]);
        const service = makeService(prisma, makeAudit());

        await service.listPlans();

        expect(prisma.plan.findMany).toHaveBeenCalledWith({
          orderBy: { createdAt: 'asc' },
        });
      });

      it('a NULL sortOrder row sorts BEFORE a positive sortOrder row — matching where an explicit 0 would sort, not Postgres NULLS LAST', async () => {
        const { prisma } = makePrisma();
        const nullRow = {
          ...legacyNullPlan,
          id: 'null-row',
          createdAt: new Date('2026-01-01T00:00:00Z'),
        };
        const positiveRow = {
          ...activePlan,
          id: 'positive-row',
          sortOrder: 3,
          createdAt: new Date('2026-01-02T00:00:00Z'),
        };
        // Deliberately fed in the "wrong" (post-bug) order to prove the
        // service itself re-sorts rather than trusting fetch order.
        prisma.plan.findMany.mockResolvedValue([positiveRow, nullRow]);
        const service = makeService(prisma, makeAudit());

        const result = await service.listPlans();

        expect(result.map((p) => p.id)).toEqual(['null-row', 'positive-row']);
      });

      it('a NULL sortOrder row TIES with an explicit sortOrder: 0 row — broken by createdAt, exactly like any other genuine tie (proves NULL behaves as 0, not as "less than 0")', async () => {
        const { prisma } = makePrisma();
        const explicitZero = {
          ...activePlan,
          id: 'explicit-zero',
          sortOrder: 0,
          createdAt: new Date('2026-01-01T00:00:00Z'),
        };
        const nullRow = {
          ...legacyNullPlan,
          id: 'null-row',
          createdAt: new Date('2026-01-02T00:00:00Z'),
        };
        // Mocked findMany does not itself apply the real `orderBy` clause —
        // fed in the order Postgres would actually return for `{createdAt:
        // 'asc'}` (explicitZero was created first), so the stable re-sort's
        // tie-break behavior is what's actually under test here.
        prisma.plan.findMany.mockResolvedValue([explicitZero, nullRow]);
        const service = makeService(prisma, makeAudit());

        const result = await service.listPlans();

        // explicit-zero was created first, so on a true tie it sorts first.
        expect(result.map((p) => p.id)).toEqual(['explicit-zero', 'null-row']);
      });

      it('preserves existing relative ordering among non-null sortOrder values (regression — the fix must not disturb normal ordering)', async () => {
        const { prisma } = makePrisma();
        const rows = [
          {
            ...activePlan,
            id: 'c',
            sortOrder: 10,
            createdAt: new Date('2026-01-01T00:00:00Z'),
          },
          {
            ...activePlan,
            id: 'a',
            sortOrder: 1,
            createdAt: new Date('2026-01-02T00:00:00Z'),
          },
          {
            ...activePlan,
            id: 'b',
            sortOrder: 5,
            createdAt: new Date('2026-01-03T00:00:00Z'),
          },
        ];
        prisma.plan.findMany.mockResolvedValue(rows);
        const service = makeService(prisma, makeAudit());

        const result = await service.listPlans();

        expect(result.map((p) => p.id)).toEqual(['a', 'b', 'c']);
      });
    });
  });

  // Phase 6 W7 — "inspect plan" (§5 of the W7 authorization): the one
  // platform capability that had no dedicated read yet.
  describe('getPlan', () => {
    it('returns the plan view for an existing plan', async () => {
      const { prisma } = makePrisma();
      prisma.plan.findUnique.mockResolvedValue(activePlan);

      const service = makeService(prisma, makeAudit());
      const result = await service.getPlan('plan-1');

      expect(prisma.plan.findUnique).toHaveBeenCalledWith({
        where: { id: 'plan-1' },
      });
      expect(result).toMatchObject({ id: 'plan-1', key: 'starter' });
    });

    it('404s on a nonexistent plan', async () => {
      const { prisma } = makePrisma();
      prisma.plan.findUnique.mockResolvedValue(null);

      const service = makeService(prisma, makeAudit());
      await expect(service.getPlan('missing')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('coalesces a legacy fully-null row the same way listPlans does', async () => {
      const { prisma } = makePrisma();
      prisma.plan.findUnique.mockResolvedValue(legacyNullPlan);

      const service = makeService(prisma, makeAudit());
      const result = await service.getPlan('plan-legacy');

      expect(result.isActive).toBe(true);
      expect(result.sortOrder).toBe(0);
      expect(result.isEnterpriseCustom).toBe(false);
    });
  });

  describe('createPlan', () => {
    it('creates with isActive always true and defaults applied for omitted optional fields', async () => {
      const { prisma, tx } = makePrisma();
      tx.plan.create.mockResolvedValue({
        ...activePlan,
        isPublic: true,
        sortOrder: 0,
        isEnterpriseCustom: false,
      });
      const audit = makeAudit();
      const service = makeService(prisma, audit);

      await service.createPlan(actor, { key: 'starter', name: 'Starter' }, ip);

      expect(tx.plan.create).toHaveBeenCalledWith({
        data: {
          key: 'starter',
          name: 'Starter',
          isPublic: true,
          isActive: true,
          sortOrder: 0,
          isEnterpriseCustom: false,
        },
      });
      expect(audit.logPlatformAction).toHaveBeenCalledWith(tx, {
        actorUserId: actor.id,
        action: 'plan.create',
        targetType: 'Plan',
        targetId: activePlan.id,
        metadata: { key: 'starter', name: 'Starter' },
        ip,
      });
    });

    it('respects explicitly supplied isPublic/sortOrder/isEnterpriseCustom', async () => {
      const { prisma, tx } = makePrisma();
      tx.plan.create.mockResolvedValue(activePlan);
      const service = makeService(prisma, makeAudit());

      await service.createPlan(
        actor,
        {
          key: 'growth',
          name: 'Growth',
          isPublic: false,
          sortOrder: 5,
          isEnterpriseCustom: true,
        },
        ip,
      );

      expect(tx.plan.create).toHaveBeenCalledWith({
        data: {
          key: 'growth',
          name: 'Growth',
          isPublic: false,
          isActive: true,
          sortOrder: 5,
          isEnterpriseCustom: true,
        },
      });
    });

    it('maps a duplicate key (P2002) to ConflictException and never audits', async () => {
      const { prisma, tx } = makePrisma();
      tx.plan.create.mockRejectedValue(p2002());
      const audit = makeAudit();
      const service = makeService(prisma, audit);

      await expect(
        service.createPlan(actor, { key: 'starter', name: 'Starter' }, ip),
      ).rejects.toThrow(ConflictException);
      expect(audit.logPlatformAction).not.toHaveBeenCalled();
    });

    it('rethrows a non-P2002 error unchanged', async () => {
      const { prisma, tx } = makePrisma();
      tx.plan.create.mockRejectedValue(new Error('connection lost'));
      const service = makeService(prisma, makeAudit());

      await expect(
        service.createPlan(actor, { key: 'starter', name: 'Starter' }, ip),
      ).rejects.toThrow('connection lost');
    });
  });

  describe('updatePlan', () => {
    it('404s on a nonexistent plan', async () => {
      const { prisma, tx } = makePrisma();
      tx.plan.findUnique.mockResolvedValue(null);
      const service = makeService(prisma, makeAudit());

      await expect(
        service.updatePlan(actor, 'missing', { name: 'X' }, ip),
      ).rejects.toThrow(NotFoundException);
    });

    it('updates the given fields and audits plan.update with the changed field names', async () => {
      const { prisma, tx } = makePrisma();
      tx.plan.findUnique.mockResolvedValue(activePlan);
      tx.plan.update.mockResolvedValue({ ...activePlan, name: 'Starter Plus' });
      const audit = makeAudit();
      const service = makeService(prisma, audit);

      const result = await service.updatePlan(
        actor,
        'plan-1',
        { name: 'Starter Plus' },
        ip,
      );

      expect(tx.plan.update).toHaveBeenCalledWith({
        where: { id: 'plan-1' },
        data: {
          name: 'Starter Plus',
          isPublic: undefined,
          sortOrder: undefined,
          isEnterpriseCustom: undefined,
        },
      });
      expect(audit.logPlatformAction).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({
          action: 'plan.update',
          metadata: { fields: ['name'] },
        }),
      );
      expect(result.name).toBe('Starter Plus');
    });
  });

  describe('archivePlan / restorePlan', () => {
    it('archivePlan sets isActive=false and audits plan.archive', async () => {
      const { prisma, tx } = makePrisma();
      tx.plan.findUnique.mockResolvedValue(activePlan);
      tx.plan.update.mockResolvedValue({ ...activePlan, isActive: false });
      const audit = makeAudit();
      const service = makeService(prisma, audit);

      const result = await service.archivePlan(actor, 'plan-1', ip);

      expect(tx.plan.update).toHaveBeenCalledWith({
        where: { id: 'plan-1' },
        data: { isActive: false },
      });
      expect(audit.logPlatformAction).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({ action: 'plan.archive' }),
      );
      expect(result.isActive).toBe(false);
    });

    it('restorePlan sets isActive=true and audits plan.restore', async () => {
      const { prisma, tx } = makePrisma();
      tx.plan.findUnique.mockResolvedValue({ ...activePlan, isActive: false });
      tx.plan.update.mockResolvedValue(activePlan);
      const audit = makeAudit();
      const service = makeService(prisma, audit);

      const result = await service.restorePlan(actor, 'plan-1', ip);

      expect(tx.plan.update).toHaveBeenCalledWith({
        where: { id: 'plan-1' },
        data: { isActive: true },
      });
      expect(audit.logPlatformAction).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({ action: 'plan.restore' }),
      );
      expect(result.isActive).toBe(true);
    });

    it('404s archive/restore on a nonexistent plan', async () => {
      const { prisma, tx } = makePrisma();
      tx.plan.findUnique.mockResolvedValue(null);
      const service = makeService(prisma, makeAudit());

      await expect(service.archivePlan(actor, 'missing', ip)).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.restorePlan(actor, 'missing', ip)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('deletePlan', () => {
    it('404s on a nonexistent plan', async () => {
      const { prisma, tx } = makePrisma();
      tx.plan.findUnique.mockResolvedValue(null);
      const service = makeService(prisma, makeAudit());

      await expect(service.deletePlan(actor, 'missing', ip)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('rejects deletion of a plan referenced by any subscription (including historical) — never deletes, never audits', async () => {
      const { prisma, tx } = makePrisma();
      tx.plan.findUnique.mockResolvedValue(activePlan);
      tx.subscription.count.mockResolvedValue(1);
      const audit = makeAudit();
      const service = makeService(prisma, audit);

      await expect(service.deletePlan(actor, 'plan-1', ip)).rejects.toThrow(
        ConflictException,
      );
      expect(tx.plan.delete).not.toHaveBeenCalled();
      expect(audit.logPlatformAction).not.toHaveBeenCalled();
    });

    it('deletes an unused plan (zero subscriptions) and audits plan.delete', async () => {
      const { prisma, tx } = makePrisma();
      tx.plan.findUnique.mockResolvedValue(activePlan);
      tx.subscription.count.mockResolvedValue(0);
      tx.plan.delete.mockResolvedValue(activePlan);
      const audit = makeAudit();
      const service = makeService(prisma, audit);

      await service.deletePlan(actor, 'plan-1', ip);

      expect(tx.plan.delete).toHaveBeenCalledWith({ where: { id: 'plan-1' } });
      expect(audit.logPlatformAction).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({ action: 'plan.delete' }),
      );
    });

    it('a lost race (a Subscription is created between the count() and the delete) still surfaces a clean ConflictException via the FK P2003 safety net', async () => {
      const { prisma, tx } = makePrisma();
      tx.plan.findUnique.mockResolvedValue(activePlan);
      tx.subscription.count.mockResolvedValue(0);
      tx.plan.delete.mockRejectedValue(p2003());
      const audit = makeAudit();
      const service = makeService(prisma, audit);

      await expect(service.deletePlan(actor, 'plan-1', ip)).rejects.toThrow(
        ConflictException,
      );
      expect(audit.logPlatformAction).not.toHaveBeenCalled();
    });

    it('rethrows a non-P2003 delete error unchanged', async () => {
      const { prisma, tx } = makePrisma();
      tx.plan.findUnique.mockResolvedValue(activePlan);
      tx.subscription.count.mockResolvedValue(0);
      tx.plan.delete.mockRejectedValue(new Error('connection lost'));
      const service = makeService(prisma, makeAudit());

      await expect(service.deletePlan(actor, 'plan-1', ip)).rejects.toThrow(
        'connection lost',
      );
    });
  });

  // ─── Feature / limit catalogue ──────────────────────────────────────────

  describe('getFeatureCatalogue / getLimitCatalogue', () => {
    it('returns the fixed code-defined feature key list, never support_sessions', () => {
      const service = makeService(makePrisma().prisma, makeAudit());
      const keys = service.getFeatureCatalogue();
      expect(keys).toContain('coupons');
      expect(keys).not.toContain('support_sessions');
    });

    it("returns the fixed limit catalogue with each key's ratified period", () => {
      const service = makeService(makePrisma().prisma, makeAudit());
      const limits = service.getLimitCatalogue();
      expect(limits).toEqual(
        expect.arrayContaining([
          { limitKey: 'orders_per_month', period: 'BILLING_PERIOD' },
          { limitKey: 'products', period: 'PERSISTENT' },
        ]),
      );
    });
  });

  // ─── PlanFeature ────────────────────────────────────────────────────────

  describe('listPlanFeatures', () => {
    it('404s if the plan does not exist', async () => {
      const { prisma } = makePrisma();
      prisma.plan.findUnique.mockResolvedValue(null);
      const service = makeService(prisma, makeAudit());
      await expect(service.listPlanFeatures('missing')).rejects.toThrow(
        NotFoundException,
      );
    });

    it("returns the plan's feature rows", async () => {
      const { prisma } = makePrisma();
      prisma.plan.findUnique.mockResolvedValue(activePlan);
      prisma.planFeature.findMany.mockResolvedValue([
        { id: 'pf-1', planId: 'plan-1', featureKey: 'coupons', enabled: true },
      ]);
      const service = makeService(prisma, makeAudit());
      const result = await service.listPlanFeatures('plan-1');
      expect(result).toEqual([
        { id: 'pf-1', planId: 'plan-1', featureKey: 'coupons', enabled: true },
      ]);
    });
  });

  describe('setPlanFeature', () => {
    it('rejects an unrecognized feature key without opening a transaction', async () => {
      const { prisma } = makePrisma();
      const service = makeService(prisma, makeAudit());

      await expect(
        service.setPlanFeature(
          actor,
          'plan-1',
          'support_sessions',
          { enabled: true },
          ip,
        ),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('404s if the plan does not exist', async () => {
      const { prisma, tx } = makePrisma();
      tx.plan.findUnique.mockResolvedValue(null);
      const service = makeService(prisma, makeAudit());

      await expect(
        service.setPlanFeature(
          actor,
          'missing',
          'coupons',
          { enabled: true },
          ip,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('upserts the feature flag and audits plan.feature.set', async () => {
      const { prisma, tx } = makePrisma();
      tx.plan.findUnique.mockResolvedValue(activePlan);
      tx.planFeature.upsert.mockResolvedValue({
        id: 'pf-1',
        planId: 'plan-1',
        featureKey: 'coupons',
        enabled: true,
      });
      const audit = makeAudit();
      const service = makeService(prisma, audit);

      const result = await service.setPlanFeature(
        actor,
        'plan-1',
        'coupons',
        { enabled: true },
        ip,
      );

      expect(tx.planFeature.upsert).toHaveBeenCalledWith({
        where: {
          planId_featureKey: { planId: 'plan-1', featureKey: 'coupons' },
        },
        update: { enabled: true },
        create: { planId: 'plan-1', featureKey: 'coupons', enabled: true },
      });
      expect(audit.logPlatformAction).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({
          action: 'plan.feature.set',
          metadata: { planId: 'plan-1', featureKey: 'coupons', enabled: true },
        }),
      );
      expect(result.enabled).toBe(true);
    });
  });

  // ─── PlanLimit ──────────────────────────────────────────────────────────

  describe('listPlanLimits', () => {
    it('404s if the plan does not exist', async () => {
      const { prisma } = makePrisma();
      prisma.plan.findUnique.mockResolvedValue(null);
      const service = makeService(prisma, makeAudit());
      await expect(service.listPlanLimits('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('setPlanLimit', () => {
    it('rejects an unrecognized limit key without opening a transaction', async () => {
      const { prisma } = makePrisma();
      const service = makeService(prisma, makeAudit());

      await expect(
        service.setPlanLimit(
          actor,
          'plan-1',
          'not_a_real_limit',
          { limitValue: 5 },
          ip,
        ),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('derives the period server-side from the ratified catalogue (never client-supplied) for a BILLING_PERIOD key', async () => {
      const { prisma, tx } = makePrisma();
      tx.plan.findUnique.mockResolvedValue(activePlan);
      tx.planLimit.upsert.mockResolvedValue({
        id: 'pl-1',
        planId: 'plan-1',
        limitKey: 'orders_per_month',
        limitValue: 100,
        period: 'BILLING_PERIOD',
      });
      const service = makeService(prisma, makeAudit());

      await service.setPlanLimit(
        actor,
        'plan-1',
        'orders_per_month',
        { limitValue: 100 },
        ip,
      );

      expect(tx.planLimit.upsert).toHaveBeenCalledWith({
        where: {
          planId_limitKey: { planId: 'plan-1', limitKey: 'orders_per_month' },
        },
        update: { limitValue: 100, period: 'BILLING_PERIOD' },
        create: {
          planId: 'plan-1',
          limitKey: 'orders_per_month',
          limitValue: 100,
          period: 'BILLING_PERIOD',
        },
      });
    });

    it('accepts limitValue: null to mean unlimited', async () => {
      const { prisma, tx } = makePrisma();
      tx.plan.findUnique.mockResolvedValue(activePlan);
      tx.planLimit.upsert.mockResolvedValue({
        id: 'pl-1',
        planId: 'plan-1',
        limitKey: 'products',
        limitValue: null,
        period: 'PERSISTENT',
      });
      const audit = makeAudit();
      const service = makeService(prisma, audit);

      const result = await service.setPlanLimit(
        actor,
        'plan-1',
        'products',
        { limitValue: null },
        ip,
      );

      expect(tx.planLimit.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: {
            planId: 'plan-1',
            limitKey: 'products',
            limitValue: null,
            period: 'PERSISTENT',
          },
        }),
      );
      expect(result.limitValue).toBeNull();
      expect(audit.logPlatformAction).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({ action: 'plan.limit.set' }),
      );
    });

    it('404s if the plan does not exist', async () => {
      const { prisma, tx } = makePrisma();
      tx.plan.findUnique.mockResolvedValue(null);
      const service = makeService(prisma, makeAudit());

      await expect(
        service.setPlanLimit(
          actor,
          'missing',
          'products',
          { limitValue: 5 },
          ip,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── TenantEntitlementOverride ──────────────────────────────────────────

  describe('listOverridesForTenant', () => {
    it('404s if the tenant does not exist', async () => {
      const { prisma } = makePrisma();
      prisma.tenant.findUnique.mockResolvedValue(null);
      const service = makeService(prisma, makeAudit());
      await expect(service.listOverridesForTenant('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('createOverride', () => {
    it('rejects when both featureKey and limitKey are supplied', async () => {
      const { prisma } = makePrisma();
      const service = makeService(prisma, makeAudit());
      await expect(
        service.createOverride(
          actor,
          'tenant-a',
          {
            featureKey: 'coupons',
            limitKey: 'products',
            boolValue: true,
            intValue: 5,
            reason: 'x',
          },
          ip,
        ),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects when neither featureKey nor limitKey is supplied', async () => {
      const { prisma } = makePrisma();
      const service = makeService(prisma, makeAudit());
      await expect(
        service.createOverride(actor, 'tenant-a', { reason: 'x' }, ip),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects an unrecognized featureKey', async () => {
      const { prisma } = makePrisma();
      const service = makeService(prisma, makeAudit());
      await expect(
        service.createOverride(
          actor,
          'tenant-a',
          { featureKey: 'support_sessions', boolValue: true, reason: 'x' },
          ip,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a feature override missing boolValue', async () => {
      const { prisma } = makePrisma();
      const service = makeService(prisma, makeAudit());
      await expect(
        service.createOverride(
          actor,
          'tenant-a',
          { featureKey: 'coupons', reason: 'x' },
          ip,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a feature override that also sets intValue', async () => {
      const { prisma } = makePrisma();
      const service = makeService(prisma, makeAudit());
      await expect(
        service.createOverride(
          actor,
          'tenant-a',
          { featureKey: 'coupons', boolValue: true, intValue: 3, reason: 'x' },
          ip,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects an unrecognized limitKey', async () => {
      const { prisma } = makePrisma();
      const service = makeService(prisma, makeAudit());
      await expect(
        service.createOverride(
          actor,
          'tenant-a',
          { limitKey: 'not_real', intValue: 5, reason: 'x' },
          ip,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a limit override missing intValue', async () => {
      const { prisma } = makePrisma();
      const service = makeService(prisma, makeAudit());
      await expect(
        service.createOverride(
          actor,
          'tenant-a',
          { limitKey: 'products', reason: 'x' },
          ip,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a limit override that also sets boolValue', async () => {
      const { prisma } = makePrisma();
      const service = makeService(prisma, makeAudit());
      await expect(
        service.createOverride(
          actor,
          'tenant-a',
          { limitKey: 'products', intValue: 5, boolValue: true, reason: 'x' },
          ip,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('accepts a limit override with intValue: null (unlimited)', async () => {
      const { prisma, tx } = makePrisma();
      tx.tenant.findUnique.mockResolvedValue({ id: 'tenant-a' });
      tx.tenantEntitlementOverride.create.mockResolvedValue({
        id: 'ov-1',
        tenantId: 'tenant-a',
        featureKey: null,
        limitKey: 'products',
        boolValue: null,
        intValue: null,
        reason: 'unlimited for pilot customer',
        createdByUserId: actor.id,
        revokedAt: null,
        revokedByUserId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const service = makeService(prisma, makeAudit());

      const result = await service.createOverride(
        actor,
        'tenant-a',
        {
          limitKey: 'products',
          intValue: null,
          reason: 'unlimited for pilot customer',
        },
        ip,
      );

      expect(tx.tenantEntitlementOverride.create).toHaveBeenCalledWith({
        // jest's own `expect.objectContaining` matcher is typed `any` by
        // design — same convention as support-session.service.spec.ts.
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        data: expect.objectContaining({ limitKey: 'products', intValue: null }),
      });
      expect(result.intValue).toBeNull();
    });

    it('404s if the tenant does not exist', async () => {
      const { prisma, tx } = makePrisma();
      tx.tenant.findUnique.mockResolvedValue(null);
      const service = makeService(prisma, makeAudit());

      await expect(
        service.createOverride(
          actor,
          'missing-tenant',
          { featureKey: 'coupons', boolValue: true, reason: 'pilot grant' },
          ip,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('creates a valid feature override attributed to the actor and audits entitlement_override.create with the tenantId', async () => {
      const { prisma, tx } = makePrisma();
      tx.tenant.findUnique.mockResolvedValue({ id: 'tenant-a' });
      tx.tenantEntitlementOverride.create.mockResolvedValue({
        id: 'ov-1',
        tenantId: 'tenant-a',
        featureKey: 'coupons',
        limitKey: null,
        boolValue: true,
        intValue: null,
        reason: 'pilot grant',
        createdByUserId: actor.id,
        revokedAt: null,
        revokedByUserId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const audit = makeAudit();
      const service = makeService(prisma, audit);

      const result = await service.createOverride(
        actor,
        'tenant-a',
        { featureKey: 'coupons', boolValue: true, reason: 'pilot grant' },
        ip,
      );

      expect(tx.tenantEntitlementOverride.create).toHaveBeenCalledWith({
        data: {
          tenantId: 'tenant-a',
          featureKey: 'coupons',
          limitKey: null,
          boolValue: true,
          intValue: null,
          reason: 'pilot grant',
          createdByUserId: actor.id,
        },
      });
      expect(audit.logPlatformAction).toHaveBeenCalledWith(tx, {
        actorUserId: actor.id,
        action: 'entitlement_override.create',
        targetType: 'TenantEntitlementOverride',
        targetId: 'ov-1',
        tenantId: 'tenant-a',
        metadata: {
          featureKey: 'coupons',
          limitKey: null,
          reason: 'pilot grant',
        },
        ip,
      });
      expect(result.createdByUserId).toBe(actor.id);
    });
  });

  describe('revokeOverride', () => {
    it('404s when the override does not exist', async () => {
      const { prisma, tx } = makePrisma();
      tx.tenantEntitlementOverride.findUnique.mockResolvedValue(null);
      const service = makeService(prisma, makeAudit());

      await expect(
        service.revokeOverride(actor, 'tenant-a', 'missing-override', ip),
      ).rejects.toThrow(NotFoundException);
    });

    it('404s (not 403) when the override belongs to a different tenant — no cross-tenant existence leak', async () => {
      const { prisma, tx } = makePrisma();
      tx.tenantEntitlementOverride.findUnique.mockResolvedValue({
        id: 'ov-1',
        tenantId: 'tenant-b',
        revokedAt: null,
      });
      const service = makeService(prisma, makeAudit());

      await expect(
        service.revokeOverride(actor, 'tenant-a', 'ov-1', ip),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects revoking an already-revoked override', async () => {
      const { prisma, tx } = makePrisma();
      tx.tenantEntitlementOverride.findUnique.mockResolvedValue({
        id: 'ov-1',
        tenantId: 'tenant-a',
        revokedAt: new Date('2026-01-01T00:00:00Z'),
      });
      const service = makeService(prisma, makeAudit());

      await expect(
        service.revokeOverride(actor, 'tenant-a', 'ov-1', ip),
      ).rejects.toThrow(ConflictException);
    });

    it('sets revokedAt/revokedByUserId, never deletes the row, and audits entitlement_override.revoke', async () => {
      const { prisma, tx } = makePrisma();
      tx.tenantEntitlementOverride.findUnique.mockResolvedValue({
        id: 'ov-1',
        tenantId: 'tenant-a',
        featureKey: 'coupons',
        limitKey: null,
        revokedAt: null,
      });
      tx.tenantEntitlementOverride.update.mockResolvedValue({
        id: 'ov-1',
        tenantId: 'tenant-a',
        featureKey: 'coupons',
        limitKey: null,
        boolValue: true,
        intValue: null,
        reason: 'pilot grant',
        createdByUserId: 'someone-else',
        revokedAt: new Date('2026-02-01T00:00:00Z'),
        revokedByUserId: actor.id,
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-02-01T00:00:00Z'),
      });
      const audit = makeAudit();
      const service = makeService(prisma, audit);

      const result = await service.revokeOverride(
        actor,
        'tenant-a',
        'ov-1',
        ip,
      );

      expect(tx.tenantEntitlementOverride.update).toHaveBeenCalledWith({
        where: { id: 'ov-1' },
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        data: { revokedAt: expect.any(Date), revokedByUserId: actor.id },
      });
      expect(audit.logPlatformAction).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({
          action: 'entitlement_override.revoke',
          targetId: 'ov-1',
          tenantId: 'tenant-a',
        }),
      );
      expect(result.revokedByUserId).toBe(actor.id);
      expect(result.revokedAt).not.toBeNull();
    });
  });
});
