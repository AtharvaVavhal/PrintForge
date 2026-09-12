import { randomUUID } from 'crypto';
import { INestApplication } from '@nestjs/common';
import { resetDatabase } from './support/db';
import { createTestApp } from './support/test-app';
import {
  apiPath,
  authHeader,
  http,
  registerSuperAdmin,
  registerUser,
} from './support/fixtures';
import { PrismaService } from '../../src/common/database/prisma.service';
import { EntitlementService } from '../../src/entitlements/entitlement.service';
import { seedFreePlanCatalogue } from '../../prisma/free-plan-catalogue';

/**
 * Phase 6 W7 (§31 items 24/25 of the W7 authorization) — the one proof
 * `platform-plans.e2e-spec.ts` never made: that a platform-side
 * `TenantEntitlementOverride` mutation, made through the REAL
 * `/platform/tenants/:tenantId/overrides` HTTP API (never a raw Prisma
 * write), actually changes what the REAL `EntitlementService.resolve()`
 * (W2) — and, through it, the real `GET /admin/entitlements` (W6) — return
 * for that tenant, and that revoking it reverts to the plan's own value.
 * This is a genuine cross-wave (W2 + W6 + W7) integration test, not a
 * restatement of any single wave's own unit tests.
 */
describe('Phase 6 W7 — platform override mutations change real effective entitlements (W2/W6/W7 integration)', () => {
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

  /** A real tenant on a real, fully-catalogued plan (the approved Free-plan
   * values — not arbitrary), with a real OWNER membership so `/admin/
   * entitlements` (W6) is reachable for it. */
  async function makeTenantOnFreeStylePlan() {
    const owner = await registerUser(app, 'w7-int-owner');
    const tenant = await prisma.tenant.create({
      data: { slug: `w7-int-${randomUUID()}` },
    });
    await prisma.tenantMembership.create({
      data: {
        userId: owner.id,
        tenantId: tenant.id,
        role: 'OWNER',
        status: 'ACTIVE',
      },
    });
    const plan = await prisma.plan.create({
      data: {
        key: `w7-int-plan-${randomUUID()}`,
        name: 'W7 Integration Test Plan',
        isActive: true,
        sortOrder: 0,
        isEnterpriseCustom: false,
      },
    });
    await seedFreePlanCatalogue(prisma, plan.id);
    await prisma.subscription.create({
      data: { tenantId: tenant.id, planId: plan.id, status: 'ACTIVE' },
    });
    return { owner, tenant };
  }

  it('a platform-created feature override flips the real GET /admin/entitlements output, and revoking it reverts to the plan value', async () => {
    const superAdmin = await registerSuperAdmin(app, prisma);
    const { owner, tenant } = await makeTenantOnFreeStylePlan();

    // Baseline: the approved Free-plan value for custom_domain is false.
    const before = await http(app)
      .get(apiPath('/admin/entitlements'))
      .set(...authHeader(owner))
      .expect(200);
    expect(before.body.data.features.custom_domain).toBe(false);

    const created = await http(app)
      .post(apiPath(`/platform/tenants/${tenant.id}/overrides`))
      .set(...authHeader(superAdmin))
      .send({
        featureKey: 'custom_domain',
        boolValue: true,
        reason: 'W7 integration test — pilot grant',
      })
      .expect(201);
    const overrideId = created.body.data.id as string;

    const during = await http(app)
      .get(apiPath('/admin/entitlements'))
      .set(...authHeader(owner))
      .expect(200);
    expect(during.body.data.features.custom_domain).toBe(true);

    await http(app)
      .post(
        apiPath(
          `/platform/tenants/${tenant.id}/overrides/${overrideId}/revoke`,
        ),
      )
      .set(...authHeader(superAdmin))
      .expect(200);

    const after = await http(app)
      .get(apiPath('/admin/entitlements'))
      .set(...authHeader(owner))
      .expect(200);
    expect(after.body.data.features.custom_domain).toBe(false); // reverted
  });

  it('a platform-created limit override flips the real GET /admin/entitlements output, and revoking it reverts to the plan value', async () => {
    const superAdmin = await registerSuperAdmin(app, prisma);
    const { owner, tenant } = await makeTenantOnFreeStylePlan();

    const before = await http(app)
      .get(apiPath('/admin/entitlements'))
      .set(...authHeader(owner))
      .expect(200);
    expect(before.body.data.limits.products).toEqual({
      value: 100,
      period: 'PERSISTENT',
    });

    const created = await http(app)
      .post(apiPath(`/platform/tenants/${tenant.id}/overrides`))
      .set(...authHeader(superAdmin))
      .send({
        limitKey: 'products',
        intValue: null, // unlimited override
        reason: 'W7 integration test — enterprise pilot',
      })
      .expect(201);
    const overrideId = created.body.data.id as string;

    const during = await http(app)
      .get(apiPath('/admin/entitlements'))
      .set(...authHeader(owner))
      .expect(200);
    expect(during.body.data.limits.products).toEqual({
      value: null,
      period: 'PERSISTENT',
    });

    await http(app)
      .post(
        apiPath(
          `/platform/tenants/${tenant.id}/overrides/${overrideId}/revoke`,
        ),
      )
      .set(...authHeader(superAdmin))
      .expect(200);

    const after = await http(app)
      .get(apiPath('/admin/entitlements'))
      .set(...authHeader(owner))
      .expect(200);
    expect(after.body.data.limits.products).toEqual({
      value: 100,
      period: 'PERSISTENT',
    }); // reverted to the plan's own value
  });

  it('the same effect is directly observable through EntitlementService.resolve() itself (real service, real Postgres, no HTTP)', async () => {
    const superAdmin = await registerSuperAdmin(app, prisma);
    const { tenant } = await makeTenantOnFreeStylePlan();
    const entitlementService = app.get(EntitlementService);

    const before = await entitlementService.resolve(tenant.id);
    expect(before.features.api_access).toBe(false);

    await http(app)
      .post(apiPath(`/platform/tenants/${tenant.id}/overrides`))
      .set(...authHeader(superAdmin))
      .send({
        featureKey: 'api_access',
        boolValue: true,
        reason: 'W7 integration test — direct service proof',
      })
      .expect(201);

    const after = await entitlementService.resolve(tenant.id);
    expect(after.features.api_access).toBe(true);
  });
});
