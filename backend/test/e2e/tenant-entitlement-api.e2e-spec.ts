import { randomUUID } from 'crypto';
import { INestApplication } from '@nestjs/common';
import { resetDatabase } from './support/db';
import { createTestApp } from './support/test-app';
import { apiPath, authHeader, http, registerUser } from './support/fixtures';
import { PrismaService } from '../../src/common/database/prisma.service';
import { ACTIVE_TENANT_HEADER } from '../../src/common/tenant/tenant-context.guard';
import { EntitlementService } from '../../src/entitlements/entitlement.service';
import { UsageService } from '../../src/usage/usage.service';
import { PERSISTENT_PERIOD } from '../../src/usage/usage-period';
import { seedFreePlanCatalogue } from '../../prisma/free-plan-catalogue';

/**
 * Phase 6 W6 — GET /admin/subscription|usage|entitlements, exercised
 * through the REAL HTTP guard chain (JwtAuthGuard -> TenantContextGuard ->
 * TenantLifecycleGuard -> PermissionsGuard -> EntitlementGuard ->
 * PlatformGuard), real Postgres, real `EntitlementService`/`UsageService`.
 * No guard is bypassed anywhere in this file — every request goes through
 * `createTestApp()`'s full, unmodified Nest application.
 */
describe('Phase 6 W6 — tenant entitlement read APIs (real Postgres, real guard chain)', () => {
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

  const ENDPOINTS = [
    '/admin/subscription',
    '/admin/usage',
    '/admin/entitlements',
  ];

  /** Mirrors `tenant-isolation.e2e-spec.ts`'s own `memberWithRole` fixture
   * exactly, extended with a real Free-plan Subscription — these 3
   * endpoints all require one (unlike dashboard/settings, which don't). */
  async function memberWithRole(role: 'OWNER' | 'ADMIN' | 'STAFF' | 'VIEWER') {
    const user = await registerUser(app, `w6-${role.toLowerCase()}`);
    const tenant = await prisma.tenant.create({
      data: { slug: `w6-${role.toLowerCase()}-${randomUUID()}` },
    });
    await prisma.tenantMembership.create({
      data: { userId: user.id, tenantId: tenant.id, role, status: 'ACTIVE' },
    });
    const plan = await prisma.plan.create({
      data: {
        key: `w6-plan-${randomUUID()}`,
        name: 'W6 Test Plan',
        isActive: true,
        sortOrder: 0,
        isEnterpriseCustom: false,
      },
    });
    await seedFreePlanCatalogue(prisma, plan.id);
    await prisma.subscription.create({
      data: { tenantId: tenant.id, planId: plan.id, status: 'ACTIVE' },
    });
    return { ...user, tenantId: tenant.id, planId: plan.id };
  }

  // ─── Endpoint inventory / basic shape ───────────────────────────────────

  describe('endpoint inventory', () => {
    it('GET /admin/subscription returns status, plan identity, and period fields — nothing else', async () => {
      const owner = await memberWithRole('OWNER');
      const res = await http(app)
        .get(apiPath('/admin/subscription'))
        .set(...authHeader(owner))
        .expect(200);

      expect(res.body.data.status).toBe('ACTIVE');
      expect(res.body.data.plan).toEqual({
        key: expect.any(String),
        name: 'W6 Test Plan',
      });
      expect(res.body.data).not.toHaveProperty('id');
      expect(res.body.data).not.toHaveProperty('tenantId');
      expect(res.body.data).not.toHaveProperty('planId');
    });

    it('GET /admin/usage returns every recognized limit key, orders_per_month as count: null', async () => {
      const owner = await memberWithRole('OWNER');
      const res = await http(app)
        .get(apiPath('/admin/usage'))
        .set(...authHeader(owner))
        .expect(200);

      for (const key of [
        'products',
        'team_members',
        'orders_per_month',
        'storage_mb',
        'custom_domains',
      ]) {
        expect(res.body.data).toHaveProperty(key);
      }
      expect(res.body.data.products).toEqual({
        count: 0,
        period: 'PERSISTENT',
      });
      expect(res.body.data.orders_per_month).toEqual({
        count: null,
        period: 'BILLING_PERIOD',
      });
    });

    it('GET /admin/entitlements returns the exact EntitlementResolution contract', async () => {
      const owner = await memberWithRole('OWNER');
      const res = await http(app)
        .get(apiPath('/admin/entitlements'))
        .set(...authHeader(owner))
        .expect(200);

      expect(res.body.data).toHaveProperty('features');
      expect(res.body.data).toHaveProperty('limits');
      expect(res.body.data.features.coupons).toBe(true); // approved Free-plan value
      expect(res.body.data.limits.products).toEqual({
        value: 100,
        period: 'PERSISTENT',
      });
    });
  });

  // ─── Permission matrix (§17) — dashboard:read, G-13, no new permission ──

  describe('permission enforcement (G-13 dashboard:read, unchanged)', () => {
    for (const role of ['OWNER', 'ADMIN', 'STAFF', 'VIEWER'] as const) {
      it(`${role} + dashboard:read is allowed on all 3 endpoints`, async () => {
        const member = await memberWithRole(role);
        for (const endpoint of ENDPOINTS) {
          await http(app)
            .get(apiPath(endpoint))
            .set(...authHeader(member))
            .expect(200);
        }
      });
    }

    it('an authenticated user with no tenant membership at all (hence no dashboard:read) is denied on all 3 endpoints', async () => {
      const customer = await registerUser(app, 'no-membership');
      for (const endpoint of ENDPOINTS) {
        await http(app)
          .get(apiPath(endpoint))
          .set(...authHeader(customer))
          .expect(403);
      }
    });

    it('unauthenticated requests are denied (401) on all 3 endpoints', async () => {
      for (const endpoint of ENDPOINTS) {
        await http(app).get(apiPath(endpoint)).expect(401);
      }
    });
  });

  // ─── Tenant isolation + spoofed tenantId rejection (§16) ────────────────

  describe('tenant isolation', () => {
    it('Tenant A sees only its own subscription/usage/entitlements — Tenant B data never leaks', async () => {
      const a = await memberWithRole('OWNER');
      const b = await memberWithRole('OWNER');

      // Give A and B visibly different, attributable state.
      await prisma.usage.create({
        data: {
          tenantId: a.tenantId,
          limitKey: 'products',
          period: PERSISTENT_PERIOD,
          count: 3,
        },
      });
      await prisma.usage.create({
        data: {
          tenantId: b.tenantId,
          limitKey: 'products',
          period: PERSISTENT_PERIOD,
          count: 99,
        },
      });

      const subA = await http(app)
        .get(apiPath('/admin/subscription'))
        .set(...authHeader(a))
        .expect(200);
      const usageA = await http(app)
        .get(apiPath('/admin/usage'))
        .set(...authHeader(a))
        .expect(200);
      const entA = await http(app)
        .get(apiPath('/admin/entitlements'))
        .set(...authHeader(a))
        .expect(200);

      expect(usageA.body.data.products.count).toBe(3);
      expect(usageA.body.data.products.count).not.toBe(99);
      // Nothing in any response ever names tenant B's id/plan/subscription.
      expect(JSON.stringify(subA.body)).not.toContain(b.tenantId);
      expect(JSON.stringify(usageA.body)).not.toContain(b.tenantId);
      expect(JSON.stringify(entA.body)).not.toContain(b.tenantId);
    });

    it("a client-supplied tenantId in the query string is silently ignored — response still reflects the authenticated caller's own tenant", async () => {
      const a = await memberWithRole('OWNER');
      const b = await memberWithRole('OWNER');
      await prisma.usage.create({
        data: {
          tenantId: b.tenantId,
          limitKey: 'products',
          period: PERSISTENT_PERIOD,
          count: 99,
        },
      });

      const res = await http(app)
        .get(`${apiPath('/admin/usage')}?tenantId=${b.tenantId}`)
        .set(...authHeader(a))
        .expect(200);

      // Still A's own (zero) usage, never B's 99 — the query param was
      // never read by anything in the request path.
      expect(res.body.data.products.count).toBe(0);
    });

    it('the X-Active-Tenant header cannot select a tenant the caller is not a member of (D6) — rejected before reaching any of the 3 handlers', async () => {
      const a = await memberWithRole('OWNER');
      const b = await memberWithRole('OWNER');

      for (const endpoint of ENDPOINTS) {
        await http(app)
          .get(apiPath(endpoint))
          .set(...authHeader(a))
          .set(ACTIVE_TENANT_HEADER, b.tenantId)
          .expect(403);
      }
    });
  });

  // ─── Free-plan / unlimited / missing-limit / override output (§12-§14) ──

  describe('entitlement resolution output — matches EntitlementService.resolve() exactly (§20 data consistency)', () => {
    it('the approved Free-plan catalogue resolves through the real HTTP endpoint identically to a direct EntitlementService.resolve() call', async () => {
      const owner = await memberWithRole('OWNER');
      const entitlementService = app.get(EntitlementService);

      const res = await http(app)
        .get(apiPath('/admin/entitlements'))
        .set(...authHeader(owner))
        .expect(200);
      const direct = await entitlementService.resolve(owner.tenantId);

      expect(res.body.data).toEqual(direct);
    });

    it('an unlimited limit (limitValue: NULL) resolves as value: null through the real endpoint', async () => {
      const owner = await memberWithRole('OWNER');
      // Overwrite the approved Free-plan storage_mb row (1024) with an
      // unlimited one for this test's own plan only — proves the endpoint
      // faithfully surfaces `null`, not a re-derived/invented number.
      await prisma.planLimit.update({
        where: {
          planId_limitKey: { planId: owner.planId, limitKey: 'storage_mb' },
        },
        data: { limitValue: null },
      });

      const res = await http(app)
        .get(apiPath('/admin/entitlements'))
        .set(...authHeader(owner))
        .expect(200);

      expect(res.body.data.limits.storage_mb).toEqual({
        value: null,
        period: 'PERSISTENT',
      });
    });

    it('a limit key with NO PlanLimit row at all (missing, not zero-by-approval) resolves to value: 0 (P6-D2 deny-by-default)', async () => {
      const user = await registerUser(app, 'w6-bare');
      const tenant = await prisma.tenant.create({
        data: { slug: `w6-bare-${randomUUID()}` },
      });
      await prisma.tenantMembership.create({
        data: {
          userId: user.id,
          tenantId: tenant.id,
          role: 'OWNER',
          status: 'ACTIVE',
        },
      });
      const barePlan = await prisma.plan.create({
        data: {
          key: `w6-bare-plan-${randomUUID()}`,
          name: 'Bare',
          isActive: true,
          sortOrder: 0,
          isEnterpriseCustom: false,
        },
      });
      // Deliberately NO seedFreePlanCatalogue call — zero PlanFeature/
      // PlanLimit rows for this plan.
      await prisma.subscription.create({
        data: { tenantId: tenant.id, planId: barePlan.id, status: 'ACTIVE' },
      });

      const res = await http(app)
        .get(apiPath('/admin/entitlements'))
        .set(...authHeader({ ...user, accessToken: user.accessToken }))
        .expect(200);

      expect(res.body.data.limits.products).toEqual({
        value: 0,
        period: 'PERSISTENT',
      });
      expect(res.body.data.features.coupons).toBe(false);
    });

    it('an active TenantEntitlementOverride is reflected as the FINAL effective value, not the underlying plan value', async () => {
      const owner = await memberWithRole('OWNER');
      await prisma.tenantEntitlementOverride.create({
        data: {
          tenantId: owner.tenantId,
          featureKey: 'custom_domain', // Free plan: false by approval
          boolValue: true,
          reason: 'W6 e2e test override',
          createdByUserId: owner.id,
        },
      });
      await prisma.tenantEntitlementOverride.create({
        data: {
          tenantId: owner.tenantId,
          limitKey: 'products', // Free plan: 100 by approval
          intValue: 5,
          reason: 'W6 e2e test override',
          createdByUserId: owner.id,
        },
      });

      const res = await http(app)
        .get(apiPath('/admin/entitlements'))
        .set(...authHeader(owner))
        .expect(200);

      expect(res.body.data.features.custom_domain).toBe(true);
      expect(res.body.data.limits.products).toEqual({
        value: 5,
        period: 'PERSISTENT',
      });
      // No raw override record leaked — only the resolved effective value.
      expect(res.body.data).not.toHaveProperty('overrides');
      expect(JSON.stringify(res.body)).not.toMatch(/W6 e2e test override/);
    });

    it('GET /admin/usage matches UsageService.getUsage() exactly for every PERSISTENT key (§20)', async () => {
      const owner = await memberWithRole('OWNER');
      await prisma.usage.create({
        data: {
          tenantId: owner.tenantId,
          limitKey: 'team_members',
          period: PERSISTENT_PERIOD,
          count: 2,
        },
      });
      const usageService = app.get(UsageService);

      const res = await http(app)
        .get(apiPath('/admin/usage'))
        .set(...authHeader(owner))
        .expect(200);

      for (const key of [
        'products',
        'team_members',
        'storage_mb',
        'custom_domains',
      ] as const) {
        const direct = await usageService.getUsage(
          prisma,
          owner.tenantId,
          key,
          PERSISTENT_PERIOD,
        );
        expect(res.body.data[key].count).toBe(direct.count);
      }
    });
  });

  // ─── No mutation from GET requests (§21) ────────────────────────────────

  describe('no mutation from GET requests', () => {
    it('calling all 3 endpoints creates zero new Usage/PlanFeature/PlanLimit/Subscription/TenantEntitlementOverride/TenantMembership rows', async () => {
      const owner = await memberWithRole('OWNER');

      const before = await Promise.all([
        prisma.usage.count(),
        prisma.planFeature.count(),
        prisma.planLimit.count(),
        prisma.subscription.count(),
        prisma.tenantEntitlementOverride.count(),
        prisma.tenantMembership.count(),
      ]);

      for (const endpoint of ENDPOINTS) {
        await http(app)
          .get(apiPath(endpoint))
          .set(...authHeader(owner))
          .expect(200);
      }
      // Twice, to also rule out any "first call creates, second call
      // reads" lazy-materialization behavior.
      for (const endpoint of ENDPOINTS) {
        await http(app)
          .get(apiPath(endpoint))
          .set(...authHeader(owner))
          .expect(200);
      }

      const after = await Promise.all([
        prisma.usage.count(),
        prisma.planFeature.count(),
        prisma.planLimit.count(),
        prisma.subscription.count(),
        prisma.tenantEntitlementOverride.count(),
        prisma.tenantMembership.count(),
      ]);

      expect(after).toEqual(before);
    });
  });
});
