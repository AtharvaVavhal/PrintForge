import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { resetDatabase } from './support/db';
import { seedFreePlanCatalogue } from '../../prisma/free-plan-catalogue';
import { EntitlementService } from '../../src/entitlements/entitlement.service';
import { PrismaService } from '../../src/common/database/prisma.service';

/**
 * Phase 6 W5 — the business-approved Free-plan catalogue
 * ("PHASE 6 — W5 FREE PLAN CATALOGUE CONFIGURATION", 2026-09-12), exercised
 * against a REAL Postgres database and the REAL `EntitlementService`. No
 * Nest app / HTTP surface needed — same reasoning
 * `entitlement-engine.e2e-spec.ts` uses: a bare `PrismaClient` +
 * `EntitlementService` proves the real DB round-trip; no controller exists
 * to gate this. `seedFreePlanCatalogue` (the exact function the canonical
 * bootstrap scripts call) is invoked directly here — this is real
 * production code under test, not a re-implementation of it.
 */
describe('Phase 6 W5 — Free plan catalogue (real Postgres, real EntitlementService)', () => {
  const prisma = new PrismaClient();
  const service = new EntitlementService(prisma as unknown as PrismaService);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  async function makeFreePlan() {
    return prisma.plan.create({
      data: {
        key: 'free',
        name: 'Free',
        isPublic: true,
        isActive: true,
        sortOrder: 0,
        isEnterpriseCustom: false,
      },
    });
  }

  async function makeTenantOnPlan(planId: string) {
    const tenant = await prisma.tenant.create({
      data: { slug: `free-plan-test-${randomUUID()}`, status: 'ACTIVE' },
    });
    await prisma.subscription.create({
      data: { tenantId: tenant.id, planId, status: 'ACTIVE' },
    });
    return tenant;
  }

  // ─── Idempotency: real row counts never exceed the approved 7 + 5 ──────

  it('running seedFreePlanCatalogue twice against the real free Plan creates exactly 7 PlanFeature rows and 5 PlanLimit rows — never duplicated', async () => {
    const plan = await makeFreePlan();

    const first = await seedFreePlanCatalogue(prisma, plan.id);
    expect(first).toEqual({ featuresWritten: 7, limitsWritten: 5 });

    const second = await seedFreePlanCatalogue(prisma, plan.id);
    expect(second).toEqual({ featuresWritten: 7, limitsWritten: 5 });

    const featureCount = await prisma.planFeature.count({
      where: { planId: plan.id },
    });
    const limitCount = await prisma.planLimit.count({
      where: { planId: plan.id },
    });
    expect(featureCount).toBe(7);
    expect(limitCount).toBe(5);
  });

  it('re-running the catalogue seed after a manual edit converges the row back to the approved value (never leaves drift)', async () => {
    const plan = await makeFreePlan();
    await seedFreePlanCatalogue(prisma, plan.id);

    // Simulate accidental local drift.
    await prisma.planFeature.update({
      where: { planId_featureKey: { planId: plan.id, featureKey: 'coupons' } },
      data: { enabled: false },
    });
    await prisma.planLimit.update({
      where: { planId_limitKey: { planId: plan.id, limitKey: 'products' } },
      data: { limitValue: 5 },
    });

    await seedFreePlanCatalogue(prisma, plan.id);

    const coupons = await prisma.planFeature.findUniqueOrThrow({
      where: { planId_featureKey: { planId: plan.id, featureKey: 'coupons' } },
    });
    const products = await prisma.planLimit.findUniqueOrThrow({
      where: { planId_limitKey: { planId: plan.id, limitKey: 'products' } },
    });
    expect(coupons.enabled).toBe(true);
    expect(products.limitValue).toBe(100);
  });

  // ─── EntitlementService.resolve() surfaces exactly the approved values ──

  it('resolves every approved feature to its exact approved enabled value', async () => {
    const plan = await makeFreePlan();
    await seedFreePlanCatalogue(prisma, plan.id);
    const tenant = await makeTenantOnPlan(plan.id);

    const result = await service.resolve(tenant.id);

    expect(result.features.coupons).toBe(true);
    expect(result.features.team_members).toBe(true);
    expect(result.features.custom_domain).toBe(false);
    expect(result.features.custom_storefront).toBe(false);
    expect(result.features.custom_branding).toBe(false);
    expect(result.features.advanced_analytics).toBe(false);
    expect(result.features.api_access).toBe(false);
  });

  it('resolves every approved limit to its exact approved value and ratified period', async () => {
    const plan = await makeFreePlan();
    await seedFreePlanCatalogue(prisma, plan.id);
    const tenant = await makeTenantOnPlan(plan.id);

    const result = await service.resolve(tenant.id);

    expect(result.limits.products).toEqual({
      value: 100,
      period: 'PERSISTENT',
    });
    expect(result.limits.team_members).toEqual({
      value: 2,
      period: 'PERSISTENT',
    });
    expect(result.limits.orders_per_month).toEqual({
      value: 100,
      period: 'BILLING_PERIOD',
    });
    expect(result.limits.storage_mb).toEqual({
      value: 1024,
      period: 'PERSISTENT',
    });
    expect(result.limits.custom_domains).toEqual({
      value: 0,
      period: 'PERSISTENT',
    });
  });

  // ─── Fail-closed behavior is unaffected by the Free-plan catalogue ─────

  it('a DIFFERENT plan with no catalogue rows at all still fails closed (value: 0 / feature false) — the Free-plan catalogue change never altered the global missing-PlanLimit/PlanFeature default (P6-D2)', async () => {
    const barePlan = await prisma.plan.create({
      data: {
        key: `bare-${randomUUID()}`,
        name: 'Bare',
        isActive: true,
        sortOrder: 0,
        isEnterpriseCustom: false,
      },
    });
    const tenant = await makeTenantOnPlan(barePlan.id);

    const result = await service.resolve(tenant.id);

    expect(result.features.coupons).toBe(false);
    expect(result.limits.products).toEqual({ value: 0, period: 'PERSISTENT' });
    expect(result.limits.orders_per_month).toEqual({
      value: 0,
      period: 'BILLING_PERIOD',
    });
  });
});
