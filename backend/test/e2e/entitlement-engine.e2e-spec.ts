import { randomUUID } from 'crypto';
import { PrismaClient, SubscriptionStatus } from '@prisma/client';
import { resetDatabase } from './support/db';
import { EntitlementService } from '../../src/entitlements/entitlement.service';
import { PrismaService } from '../../src/common/database/prisma.service';

/**
 * Phase 6 W2 — the entitlement engine, exercised against a REAL Postgres
 * database. No Nest app / HTTP surface needed (W2 builds no controller —
 * same reasoning `tenancy-foundation.e2e-spec.ts`/`tenant-rls.e2e-spec.ts`
 * use a bare `PrismaClient` with no `createTestApp()`). Proves what the
 * mocked unit suite (`entitlement.service.spec.ts`) cannot: that
 * `getTenantScopedClient`'s real Prisma `$extends` middleware, and a real
 * `WHERE "tenantId" = $1 AND "revokedAt" IS NULL` query, actually behave as
 * the unit tests assume.
 */
describe('Phase 6 W2 — EntitlementService (real Postgres)', () => {
  const prisma = new PrismaClient();
  const service = new EntitlementService(prisma as unknown as PrismaService);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  async function makeTenant(status: 'ACTIVE' | 'SUSPENDED' = 'ACTIVE') {
    return prisma.tenant.create({
      data: { slug: `entitlement-test-${randomUUID()}`, status },
    });
  }

  async function makePlan(key: string) {
    return prisma.plan.create({
      data: {
        key,
        name: key,
        isActive: true,
        sortOrder: 0,
        isEnterpriseCustom: false,
      },
    });
  }

  async function makeSubscription(
    tenantId: string,
    planId: string,
    status: SubscriptionStatus,
  ) {
    return prisma.subscription.create({ data: { tenantId, planId, status } });
  }

  // ─── Real end-to-end assigned-plan resolution ───────────────────────────

  it("resolves an ACTIVE subscription's real assigned plan features/limits from the database", async () => {
    const tenant = await makeTenant();
    const plan = await makePlan('growth');
    await prisma.planFeature.create({
      data: { planId: plan.id, featureKey: 'coupons', enabled: true },
    });
    await prisma.planLimit.create({
      data: {
        planId: plan.id,
        limitKey: 'products',
        limitValue: 250,
        period: 'PERSISTENT',
      },
    });
    await makeSubscription(tenant.id, plan.id, SubscriptionStatus.ACTIVE);

    const result = await service.resolve(tenant.id);

    expect(result.features.coupons).toBe(true);
    expect(result.limits.products).toEqual({
      value: 250,
      period: 'PERSISTENT',
    });
  });

  // ─── Real fallback-to-free ───────────────────────────────────────────────

  it('a CANCELLED subscription falls back to the real "free" plan (never the assigned plan)', async () => {
    const tenant = await makeTenant();
    const freePlan = await makePlan('free');
    const paidPlan = await makePlan('growth');
    await prisma.planFeature.create({
      data: { planId: paidPlan.id, featureKey: 'coupons', enabled: true },
    });
    // free plan deliberately left unconfigured — deny-by-default applies.
    await makeSubscription(
      tenant.id,
      paidPlan.id,
      SubscriptionStatus.CANCELLED,
    );
    void freePlan;

    const result = await service.resolve(tenant.id);

    expect(result.features.coupons).toBe(false);
  });

  it('a tenant with no Subscription row at all falls back to the free plan', async () => {
    const tenant = await makeTenant();
    const freePlan = await makePlan('free');
    await prisma.planFeature.create({
      data: { planId: freePlan.id, featureKey: 'coupons', enabled: true },
    });

    const result = await service.resolve(tenant.id);

    expect(result.features.coupons).toBe(true);
  });

  // ─── Real unlimited (NULL) limit ─────────────────────────────────────────

  it('a real PlanLimit row with limitValue: NULL resolves to unlimited end-to-end', async () => {
    const tenant = await makeTenant();
    const plan = await makePlan('enterprise');
    await prisma.planLimit.create({
      data: {
        planId: plan.id,
        limitKey: 'storage_mb',
        limitValue: null,
        period: 'PERSISTENT',
      },
    });
    await makeSubscription(tenant.id, plan.id, SubscriptionStatus.ACTIVE);

    const result = await service.resolve(tenant.id);

    expect(result.limits.storage_mb).toEqual({
      value: null,
      period: 'PERSISTENT',
    });
  });

  // ─── Real revoked-override exclusion ─────────────────────────────────────

  it('a real revoked override in the database is excluded — only the active one participates', async () => {
    const tenant = await makeTenant();
    const plan = await makePlan('growth');
    await prisma.planFeature.create({
      data: { planId: plan.id, featureKey: 'coupons', enabled: false },
    });
    await makeSubscription(tenant.id, plan.id, SubscriptionStatus.ACTIVE);

    const user = await prisma.user.create({
      data: { email: `sa-${randomUUID()}@example.test`, passwordHash: 'x' },
    });
    // A revoked override that, if it were mistakenly included, would flip
    // the feature the OPPOSITE way from the still-active one below.
    await prisma.tenantEntitlementOverride.create({
      data: {
        tenantId: tenant.id,
        featureKey: 'coupons',
        boolValue: false,
        reason: 'revoked test row',
        createdByUserId: user.id,
        revokedAt: new Date(),
        revokedByUserId: user.id,
      },
    });
    await prisma.tenantEntitlementOverride.create({
      data: {
        tenantId: tenant.id,
        featureKey: 'coupons',
        boolValue: true,
        reason: 'active override',
        createdByUserId: user.id,
      },
    });

    const result = await service.resolve(tenant.id);

    expect(result.features.coupons).toBe(true);
  });

  // ─── Cross-tenant isolation (the security-critical requirement) ─────────

  it("never leaks another tenant's subscription, plan, or overrides — two tenants resolved independently", async () => {
    const tenantA = await makeTenant();
    const tenantB = await makeTenant();
    const planA = await makePlan('plan-a');
    const planB = await makePlan('plan-b');
    await prisma.planFeature.create({
      data: { planId: planA.id, featureKey: 'coupons', enabled: true },
    });
    await prisma.planFeature.create({
      data: { planId: planB.id, featureKey: 'coupons', enabled: false },
    });
    await prisma.planLimit.create({
      data: {
        planId: planA.id,
        limitKey: 'products',
        limitValue: 10,
        period: 'PERSISTENT',
      },
    });
    await prisma.planLimit.create({
      data: {
        planId: planB.id,
        limitKey: 'products',
        limitValue: 999,
        period: 'PERSISTENT',
      },
    });
    await makeSubscription(tenantA.id, planA.id, SubscriptionStatus.ACTIVE);
    await makeSubscription(tenantB.id, planB.id, SubscriptionStatus.ACTIVE);

    const user = await prisma.user.create({
      data: { email: `sa-${randomUUID()}@example.test`, passwordHash: 'x' },
    });
    // Tenant B gets an override; Tenant A must never see it.
    await prisma.tenantEntitlementOverride.create({
      data: {
        tenantId: tenantB.id,
        limitKey: 'products',
        intValue: null, // unlimited, would be a dramatic leak if seen by A
        reason: 'tenant B only',
        createdByUserId: user.id,
      },
    });

    const resultA = await service.resolve(tenantA.id);
    const resultB = await service.resolve(tenantB.id);

    expect(resultA.features.coupons).toBe(true);
    expect(resultA.limits.products).toEqual({
      value: 10,
      period: 'PERSISTENT',
    });
    expect(resultB.features.coupons).toBe(false);
    expect(resultB.limits.products).toEqual({
      value: null,
      period: 'PERSISTENT',
    }); // B's own override

    // Explicit negative assertions — tenant A's resolution must never
    // reflect tenant B's override or plan values under any circumstance.
    expect(resultA.limits.products.value).not.toBe(null);
    expect(resultA.limits.products.value).not.toBe(999);
  });

  it('an ARCHIVED (isActive: false) assigned plan still resolves its entitlements — W2 never reads Plan.isActive', async () => {
    const tenant = await makeTenant();
    const plan = await prisma.plan.create({
      data: {
        key: 'archived-plan',
        name: 'Archived',
        isActive: false, // archived — W1 concept, must not affect W2 resolution
        sortOrder: 0,
        isEnterpriseCustom: false,
      },
    });
    await prisma.planFeature.create({
      data: { planId: plan.id, featureKey: 'coupons', enabled: true },
    });
    await makeSubscription(tenant.id, plan.id, SubscriptionStatus.ACTIVE);

    const result = await service.resolve(tenant.id);

    expect(result.features.coupons).toBe(true);
  });
});
