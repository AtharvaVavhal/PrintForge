import { randomUUID } from 'crypto';
import { INestApplication } from '@nestjs/common';
import { resetDatabase } from './support/db';
import { createTestApp } from './support/test-app';
import {
  apiPath,
  authHeader,
  createPrimaryStore,
  http,
  registerUser,
} from './support/fixtures';
import { PrismaService } from '../../src/common/database/prisma.service';

/**
 * Phase 6 W8 — `AdminController.createCoupon`'s new `@RequireFeature
 * ('coupons')` gate (composed with the pre-existing `coupons:write`
 * permission), exercised through the real HTTP guard chain against a real
 * Postgres database. No other coupon route is feature-gated (§ — see the
 * W8 report's "downgrade non-destructive" reasoning in
 * `admin.controller.ts`'s own comment above `createCoupon`), so this file
 * only exercises `POST /admin/coupons`.
 */
describe('Phase 6 W8 — coupons feature gate on POST /admin/coupons', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  const validCouponPayload = () => ({
    code: `SAVE${randomUUID().slice(0, 6).toUpperCase()}`,
    type: 'PERCENTAGE',
    percentageOff: 10,
    scopeType: 'STORE_WIDE',
  });

  /** A real tenant + membership, with a real Plan whose `coupons`
   * PlanFeature row is exactly `enabled`. `role` defaults to OWNER (has
   * `coupons:write`) so tests isolate the FEATURE dimension; the
   * permission-composition test below explicitly uses VIEWER instead. */
  async function memberWithCouponsFeature(
    enabled: boolean,
    role: 'OWNER' | 'ADMIN' | 'STAFF' | 'VIEWER' = 'OWNER',
  ) {
    const user = await registerUser(app, `coupons-gate-${role.toLowerCase()}`);
    const tenant = await prisma.tenant.create({
      data: { slug: `coupons-gate-${randomUUID()}` },
    });
    // P8-4.1 — `createCoupon` now resolves the tenant's primary store
    // unconditionally (same dependency `resolvePrimaryStoreId` already
    // has elsewhere); this ad-hoc tenant needs one paired the same way
    // `grantOwnerMembership`/`ensureTenantId` already do, or every test
    // below would 404 despite having done nothing wrong.
    await createPrimaryStore(prisma, tenant.id);
    await prisma.tenantMembership.create({
      data: { userId: user.id, tenantId: tenant.id, role, status: 'ACTIVE' },
    });
    const plan = await prisma.plan.create({
      data: {
        key: `coupons-gate-plan-${randomUUID()}`,
        name: 'Test Plan',
        isActive: true,
        sortOrder: 0,
        isEnterpriseCustom: false,
      },
    });
    await prisma.planFeature.create({
      data: { planId: plan.id, featureKey: 'coupons', enabled },
    });
    await prisma.subscription.create({
      data: { tenantId: tenant.id, planId: plan.id, status: 'ACTIVE' },
    });
    return { ...user, tenantId: tenant.id };
  }

  it('coupons feature disabled -> 403 upgrade_required, no coupon created', async () => {
    const owner = await memberWithCouponsFeature(false);

    const res = await http(app)
      .post(apiPath('/admin/coupons'))
      .set(...authHeader(owner))
      .send(validCouponPayload())
      .expect(403);
    expect(res.body.error.message).toBe('upgrade_required');

    const count = await prisma.coupon.count({
      where: { tenantId: owner.tenantId },
    });
    expect(count).toBe(0);
  });

  it('coupons feature enabled -> creation succeeds', async () => {
    const owner = await memberWithCouponsFeature(true);

    const res = await http(app)
      .post(apiPath('/admin/coupons'))
      .set(...authHeader(owner))
      .send(validCouponPayload())
      .expect(201);

    // P8-4.1 — through the REAL POST /admin/coupons code path (not a
    // direct-Prisma test fixture): the created coupon's storeId is the
    // tenant's own primary store, never null, never client-supplied
    // (`CreateCouponDto` has no storeId field).
    const primaryStore = await prisma.store.findFirstOrThrow({
      where: { tenantId: owner.tenantId, isPrimary: true },
    });
    const coupon = await prisma.coupon.findUniqueOrThrow({
      where: { id: res.body.data.id as string },
    });
    expect(coupon.storeId).not.toBeNull();
    expect(coupon.storeId).toBe(primaryStore.id);
  });

  it('a missing PlanFeature row for coupons (deny-by-default, P6-D2) also 403s with upgrade_required', async () => {
    const user = await registerUser(app, 'coupons-gate-bare');
    const tenant = await prisma.tenant.create({
      data: { slug: `coupons-gate-bare-${randomUUID()}` },
    });
    await prisma.tenantMembership.create({
      data: {
        userId: user.id,
        tenantId: tenant.id,
        role: 'OWNER',
        status: 'ACTIVE',
      },
    });
    const plan = await prisma.plan.create({
      data: {
        key: `coupons-gate-bare-plan-${randomUUID()}`,
        name: 'Bare Plan',
        isActive: true,
        sortOrder: 0,
        isEnterpriseCustom: false,
      },
    });
    // Deliberately NO PlanFeature row at all.
    await prisma.subscription.create({
      data: { tenantId: tenant.id, planId: plan.id, status: 'ACTIVE' },
    });

    const res = await http(app)
      .post(apiPath('/admin/coupons'))
      .set(...authHeader({ ...user }))
      .send(validCouponPayload())
      .expect(403);
    expect(res.body.error.message).toBe('upgrade_required');
  });

  it('permission denial still wins: a VIEWER (no coupons:write) is denied even when the coupons feature is enabled — never reported as upgrade_required', async () => {
    const viewer = await memberWithCouponsFeature(true, 'VIEWER');

    const res = await http(app)
      .post(apiPath('/admin/coupons'))
      .set(...authHeader(viewer))
      .send(validCouponPayload())
      .expect(403);
    // PermissionsGuard runs before EntitlementGuard (app.module.ts's fixed
    // guard order) — a permission failure is a DIFFERENT, RBAC-shaped
    // denial, never the feature-gate's `upgrade_required` message.
    expect(res.body.error.message).not.toBe('upgrade_required');
  });

  it('cross-tenant isolation: tenant A (feature disabled) is denied while tenant B (feature enabled) succeeds, with no leakage either way', async () => {
    const ownerA = await memberWithCouponsFeature(false);
    const ownerB = await memberWithCouponsFeature(true);

    await http(app)
      .post(apiPath('/admin/coupons'))
      .set(...authHeader(ownerA))
      .send(validCouponPayload())
      .expect(403);

    await http(app)
      .post(apiPath('/admin/coupons'))
      .set(...authHeader(ownerB))
      .send(validCouponPayload())
      .expect(201);

    expect(
      await prisma.coupon.count({ where: { tenantId: ownerA.tenantId } }),
    ).toBe(0);
    expect(
      await prisma.coupon.count({ where: { tenantId: ownerB.tenantId } }),
    ).toBe(1);
  });
});
