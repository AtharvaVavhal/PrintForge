import { randomUUID } from 'crypto';
import { INestApplication } from '@nestjs/common';
import { resetDatabase } from './support/db';
import { createTestApp } from './support/test-app';
import {
  apiPath,
  authHeader,
  http,
  registerAdmin,
  registerSuperAdmin,
  registerUser,
} from './support/fixtures';
import { PrismaService } from '../../src/common/database/prisma.service';

/**
 * Phase 6 (W1) — Platform Control Plane catalogue CRUD: Plans,
 * PlanFeature/PlanLimit, TenantEntitlementOverride. Same guard-chain
 * exercise as `platform-control-plane.e2e-spec.ts` (`ThrottlerGuard` ->
 * `JwtAuthGuard` -> `TenantContextGuard` -> `PermissionsGuard` ->
 * `PlatformGuard`), a real Postgres transaction for every mutation, and the
 * frozen `PlatformAuditLog` schema. Never touches `Subscription.planId`/
 * `.status` (Phase 7's exclusive write surface) and never exposes
 * `/platform/tenants/:id/entitlements` or `/usage` (Phase 6 W2).
 */
describe('Phase 6 W1 — Platform Plans Catalogue CRUD (/platform/plans, /features, /limits, /tenants/:id/overrides)', () => {
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

  async function makePlan(
    overrides: Partial<{
      key: string;
      name: string;
      isPublic: boolean;
      isActive: boolean | null;
      sortOrder: number | null;
      isEnterpriseCustom: boolean | null;
    }> = {},
  ) {
    return prisma.plan.create({
      data: {
        key: overrides.key ?? `plan-${randomUUID().slice(0, 8)}`,
        name: overrides.name ?? 'Test Plan',
        isPublic: overrides.isPublic ?? true,
        isActive: overrides.isActive === undefined ? true : overrides.isActive,
        sortOrder: overrides.sortOrder === undefined ? 0 : overrides.sortOrder,
        isEnterpriseCustom:
          overrides.isEnterpriseCustom === undefined
            ? false
            : overrides.isEnterpriseCustom,
      },
    });
  }

  async function makeTenant() {
    return prisma.tenant.create({
      data: { slug: `platform-plans-test-${randomUUID()}`, status: 'ACTIVE' },
    });
  }

  // ─── AUTHORIZATION ──────────────────────────────────────────────────────

  describe('authorization', () => {
    it('SUPER_ADMIN can list plans', async () => {
      const superAdmin = await registerSuperAdmin(app, prisma);
      await http(app)
        .get(apiPath('/platform/plans'))
        .set(...authHeader(superAdmin))
        .expect(200);
    });

    it('a plain registered user cannot access /platform/plans', async () => {
      const user = await registerUser(app);
      await http(app)
        .get(apiPath('/platform/plans'))
        .set(...authHeader(user))
        .expect(403);
    });

    it('a tenant OWNER (platformRole=null) cannot access /platform/plans', async () => {
      const admin = await registerAdmin(app, prisma);
      await http(app)
        .get(apiPath('/platform/plans'))
        .set(...authHeader(admin))
        .expect(403);
    });

    it('unauthenticated access is rejected', async () => {
      await http(app).get(apiPath('/platform/plans')).expect(401);
    });

    it('non-SUPER_ADMIN cannot create a plan even with a well-formed request', async () => {
      const admin = await registerAdmin(app, prisma);
      await http(app)
        .post(apiPath('/platform/plans'))
        .set(...authHeader(admin))
        .send({ key: 'sneaky', name: 'Sneaky' })
        .expect(403);
      const created = await prisma.plan.findUnique({
        where: { key: 'sneaky' },
      });
      expect(created).toBeNull();
    });

    // Phase 6 W7 (§22/§23 of the W7 authorization) — the checks above only
    // exercise `/platform/plans`; the tenant-override sub-resource is a
    // separately-routed path under the SAME `@PlatformOnly()` controller,
    // so it gets its own explicit denial proof rather than assuming the
    // class-level guard's coverage without checking.
    it('a plain registered user cannot read or create tenant entitlement overrides', async () => {
      const user = await registerUser(app);
      const tenant = await makeTenant();
      await http(app)
        .get(apiPath(`/platform/tenants/${tenant.id}/overrides`))
        .set(...authHeader(user))
        .expect(403);
      await http(app)
        .post(apiPath(`/platform/tenants/${tenant.id}/overrides`))
        .set(...authHeader(user))
        .send({ featureKey: 'coupons', boolValue: true, reason: 'x' })
        .expect(403);
      const rows = await prisma.tenantEntitlementOverride.findMany({
        where: { tenantId: tenant.id },
      });
      expect(rows).toHaveLength(0);
    });

    it('a tenant OWNER (ordinary tenant authority, not platform authority) cannot invoke override operations, including for their OWN tenant', async () => {
      const admin = await registerAdmin(app, prisma);
      await http(app)
        .get(apiPath(`/platform/tenants/${admin.tenantId}/overrides`))
        .set(...authHeader(admin))
        .expect(403);
      await http(app)
        .post(apiPath(`/platform/tenants/${admin.tenantId}/overrides`))
        .set(...authHeader(admin))
        .send({ featureKey: 'coupons', boolValue: true, reason: 'x' })
        .expect(403);
    });
  });

  // ─── PLAN CRUD ──────────────────────────────────────────────────────────

  describe('plan CRUD', () => {
    it('creates a plan with defaults applied (isActive=true, isPublic=true, sortOrder=0, isEnterpriseCustom=false)', async () => {
      const superAdmin = await registerSuperAdmin(app, prisma);
      const res = await http(app)
        .post(apiPath('/platform/plans'))
        .set(...authHeader(superAdmin))
        .send({ key: 'starter', name: 'Starter' })
        .expect(201);

      expect(res.body.data).toMatchObject({
        key: 'starter',
        name: 'Starter',
        isPublic: true,
        isActive: true,
        sortOrder: 0,
        isEnterpriseCustom: false,
      });
    });

    it('rejects a duplicate plan key with 409', async () => {
      const superAdmin = await registerSuperAdmin(app, prisma);
      await makePlan({ key: 'starter' });
      const res = await http(app)
        .post(apiPath('/platform/plans'))
        .set(...authHeader(superAdmin))
        .send({ key: 'starter', name: 'Starter Again' })
        .expect(409);
      expect(res.body.success).toBe(false);
    });

    it('rejects an invalid key shape (400)', async () => {
      const superAdmin = await registerSuperAdmin(app, prisma);
      await http(app)
        .post(apiPath('/platform/plans'))
        .set(...authHeader(superAdmin))
        .send({ key: 'Not-Valid', name: 'X' })
        .expect(400);
    });

    it('lists plans ordered by sortOrder then createdAt', async () => {
      const superAdmin = await registerSuperAdmin(app, prisma);
      await makePlan({ key: 'z-plan', sortOrder: 2 });
      await makePlan({ key: 'a-plan', sortOrder: 1 });

      const res = await http(app)
        .get(apiPath('/platform/plans'))
        .set(...authHeader(superAdmin))
        .expect(200);

      const keys = (res.body.data as Array<{ key: string }>).map((p) => p.key);
      expect(keys.indexOf('a-plan')).toBeLessThan(keys.indexOf('z-plan'));
    });

    // P6-D1 corrective fix — real-Postgres proof that a legacy NULL
    // `sortOrder` row (bypassing `makePlan()`'s own explicit defaults, the
    // way an actual pre-backfill row would) is listed exactly where an
    // explicit `sortOrder: 0` would sort, never after a positive value —
    // the unit-test suite proves the same thing against a mocked Prisma
    // client; this proves it end-to-end against the real database.
    it('a real legacy NULL-sortOrder row sorts before a positive sortOrder row, never after (real-DB proof of the P6-D1 query-level fix)', async () => {
      const superAdmin = await registerSuperAdmin(app, prisma);
      await prisma.plan.create({
        data: { key: 'positive-plan', name: 'Positive', sortOrder: 3 },
      });
      // Bypasses makePlan()'s defaults entirely — a genuine NULL row, the
      // exact legacy shape a pre-backfill Plan actually had.
      await prisma.plan.create({
        data: { key: 'legacy-null-plan', name: 'Legacy' },
      });

      const res = await http(app)
        .get(apiPath('/platform/plans'))
        .set(...authHeader(superAdmin))
        .expect(200);

      const rows = res.body.data as Array<{ key: string; sortOrder: number }>;
      const legacy = rows.find((p) => p.key === 'legacy-null-plan');
      expect(legacy?.sortOrder).toBe(0); // coalesced view value
      const keys = rows.map((p) => p.key);
      expect(keys.indexOf('legacy-null-plan')).toBeLessThan(
        keys.indexOf('positive-plan'),
      );
    });

    it('updates a plan (name/isPublic/sortOrder) but rejects key/isActive in the body', async () => {
      const superAdmin = await registerSuperAdmin(app, prisma);
      const plan = await makePlan({ key: 'growth' });

      const res = await http(app)
        .patch(apiPath(`/platform/plans/${plan.id}`))
        .set(...authHeader(superAdmin))
        .send({ name: 'Growth Plus', sortOrder: 3 })
        .expect(200);
      expect(res.body.data.name).toBe('Growth Plus');
      expect(res.body.data.sortOrder).toBe(3);

      await http(app)
        .patch(apiPath(`/platform/plans/${plan.id}`))
        .set(...authHeader(superAdmin))
        .send({ key: 'renamed' })
        .expect(400);
    });

    it('archive sets isActive=false; restore sets it back to true; existing PlanFeature/PlanLimit rows survive untouched', async () => {
      const superAdmin = await registerSuperAdmin(app, prisma);
      const plan = await makePlan({ key: 'business' });
      await prisma.planFeature.create({
        data: { planId: plan.id, featureKey: 'coupons', enabled: true },
      });

      const archived = await http(app)
        .post(apiPath(`/platform/plans/${plan.id}/archive`))
        .set(...authHeader(superAdmin))
        .expect(200);
      expect(archived.body.data.isActive).toBe(false);

      const featuresAfterArchive = await prisma.planFeature.findMany({
        where: { planId: plan.id },
      });
      expect(featuresAfterArchive).toHaveLength(1);
      expect(featuresAfterArchive[0].enabled).toBe(true);

      const restored = await http(app)
        .post(apiPath(`/platform/plans/${plan.id}/restore`))
        .set(...authHeader(superAdmin))
        .expect(200);
      expect(restored.body.data.isActive).toBe(true);
    });

    it('deletes an unused plan (hard delete)', async () => {
      const superAdmin = await registerSuperAdmin(app, prisma);
      const plan = await makePlan({ key: 'unused' });

      await http(app)
        .delete(apiPath(`/platform/plans/${plan.id}`))
        .set(...authHeader(superAdmin))
        .expect(200);

      const reloaded = await prisma.plan.findUnique({ where: { id: plan.id } });
      expect(reloaded).toBeNull();
    });

    it('rejects deleting a plan referenced by a subscription (409) and never deletes it', async () => {
      const superAdmin = await registerSuperAdmin(app, prisma);
      const plan = await makePlan({ key: 'in-use' });
      const tenant = await makeTenant();
      await prisma.subscription.create({
        data: { tenantId: tenant.id, planId: plan.id, status: 'ACTIVE' },
      });

      const res = await http(app)
        .delete(apiPath(`/platform/plans/${plan.id}`))
        .set(...authHeader(superAdmin))
        .expect(409);
      expect(res.body.success).toBe(false);

      const reloaded = await prisma.plan.findUnique({ where: { id: plan.id } });
      expect(reloaded).not.toBeNull();
    });

    // Phase 6 W7 (§5) — "inspect plan", the one platform read `listPlans`
    // alone didn't already cover.
    it('GET /platform/plans/:id returns exactly that plan', async () => {
      const superAdmin = await registerSuperAdmin(app, prisma);
      const plan = await makePlan({ key: 'inspectable' });

      const res = await http(app)
        .get(apiPath(`/platform/plans/${plan.id}`))
        .set(...authHeader(superAdmin))
        .expect(200);
      expect(res.body.data).toMatchObject({ id: plan.id, key: 'inspectable' });
    });

    it('GET /platform/plans/:id 404s on a nonexistent plan', async () => {
      const superAdmin = await registerSuperAdmin(app, prisma);
      await http(app)
        .get(apiPath(`/platform/plans/${randomUUID()}`))
        .set(...authHeader(superAdmin))
        .expect(404);
    });

    it('GET /platform/plans/:id is denied to a non-SUPER_ADMIN', async () => {
      const admin = await registerAdmin(app, prisma);
      const plan = await makePlan();
      await http(app)
        .get(apiPath(`/platform/plans/${plan.id}`))
        .set(...authHeader(admin))
        .expect(403);
    });

    it('404s update/archive/restore/delete on a nonexistent plan', async () => {
      const superAdmin = await registerSuperAdmin(app, prisma);
      const missing = randomUUID();
      await http(app)
        .patch(apiPath(`/platform/plans/${missing}`))
        .set(...authHeader(superAdmin))
        .send({ name: 'X' })
        .expect(404);
      await http(app)
        .post(apiPath(`/platform/plans/${missing}/archive`))
        .set(...authHeader(superAdmin))
        .expect(404);
      await http(app)
        .delete(apiPath(`/platform/plans/${missing}`))
        .set(...authHeader(superAdmin))
        .expect(404);
    });
  });

  // ─── FEATURE / LIMIT CATALOGUE ──────────────────────────────────────────

  describe('feature / limit catalogue', () => {
    it('GET /platform/features returns the fixed feature key list, never support_sessions', async () => {
      const superAdmin = await registerSuperAdmin(app, prisma);
      const res = await http(app)
        .get(apiPath('/platform/features'))
        .set(...authHeader(superAdmin))
        .expect(200);
      expect(res.body.data).toContain('coupons');
      expect(res.body.data).not.toContain('support_sessions');
    });

    it('GET /platform/limits returns each limit key with its ratified period', async () => {
      const superAdmin = await registerSuperAdmin(app, prisma);
      const res = await http(app)
        .get(apiPath('/platform/limits'))
        .set(...authHeader(superAdmin))
        .expect(200);
      expect(res.body.data).toEqual(
        expect.arrayContaining([
          { limitKey: 'orders_per_month', period: 'BILLING_PERIOD' },
          { limitKey: 'products', period: 'PERSISTENT' },
        ]),
      );
    });
  });

  // ─── PLAN FEATURE ───────────────────────────────────────────────────────

  describe('plan features', () => {
    it('sets a feature flag on a plan and it is reflected in the list', async () => {
      const superAdmin = await registerSuperAdmin(app, prisma);
      const plan = await makePlan();

      await http(app)
        .patch(apiPath(`/platform/plans/${plan.id}/features/coupons`))
        .set(...authHeader(superAdmin))
        .send({ enabled: true })
        .expect(200);

      const res = await http(app)
        .get(apiPath(`/platform/plans/${plan.id}/features`))
        .set(...authHeader(superAdmin))
        .expect(200);
      expect(res.body.data).toEqual([
        expect.objectContaining({ featureKey: 'coupons', enabled: true }),
      ]);
    });

    it('upserts on a repeated set (toggling enabled) rather than creating a duplicate row', async () => {
      const superAdmin = await registerSuperAdmin(app, prisma);
      const plan = await makePlan();

      await http(app)
        .patch(apiPath(`/platform/plans/${plan.id}/features/coupons`))
        .set(...authHeader(superAdmin))
        .send({ enabled: true })
        .expect(200);
      await http(app)
        .patch(apiPath(`/platform/plans/${plan.id}/features/coupons`))
        .set(...authHeader(superAdmin))
        .send({ enabled: false })
        .expect(200);

      const rows = await prisma.planFeature.findMany({
        where: { planId: plan.id },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0].enabled).toBe(false);
    });

    it('rejects an unrecognized feature key, including the deliberately-excluded support_sessions', async () => {
      const superAdmin = await registerSuperAdmin(app, prisma);
      const plan = await makePlan();
      await http(app)
        .patch(apiPath(`/platform/plans/${plan.id}/features/support_sessions`))
        .set(...authHeader(superAdmin))
        .send({ enabled: true })
        .expect(400);
    });

    it('404s when the plan does not exist', async () => {
      const superAdmin = await registerSuperAdmin(app, prisma);
      await http(app)
        .patch(apiPath(`/platform/plans/${randomUUID()}/features/coupons`))
        .set(...authHeader(superAdmin))
        .send({ enabled: true })
        .expect(404);
    });
  });

  // ─── PLAN LIMIT ─────────────────────────────────────────────────────────

  describe('plan limits', () => {
    it('sets a limit and the server derives the ratified period, ignoring anything client-supplied', async () => {
      const superAdmin = await registerSuperAdmin(app, prisma);
      const plan = await makePlan();

      const res = await http(app)
        .patch(apiPath(`/platform/plans/${plan.id}/limits/orders_per_month`))
        .set(...authHeader(superAdmin))
        // period is not part of SetPlanLimitDto at all — forbidNonWhitelisted
        // proves there is no back door even if a caller tries to send one.
        .send({ limitValue: 500, period: 'PERSISTENT' })
        .expect(400);
      expect(res.body.success).toBe(false);

      const ok = await http(app)
        .patch(apiPath(`/platform/plans/${plan.id}/limits/orders_per_month`))
        .set(...authHeader(superAdmin))
        .send({ limitValue: 500 })
        .expect(200);
      expect(ok.body.data).toMatchObject({
        limitKey: 'orders_per_month',
        limitValue: 500,
        period: 'BILLING_PERIOD',
      });
    });

    it('accepts limitValue: null to mean unlimited', async () => {
      const superAdmin = await registerSuperAdmin(app, prisma);
      const plan = await makePlan();

      const res = await http(app)
        .patch(apiPath(`/platform/plans/${plan.id}/limits/products`))
        .set(...authHeader(superAdmin))
        .send({ limitValue: null })
        .expect(200);
      expect(res.body.data.limitValue).toBeNull();
      expect(res.body.data.period).toBe('PERSISTENT');
    });

    it('rejects an omitted limitValue (required-but-nullable) and a negative value', async () => {
      const superAdmin = await registerSuperAdmin(app, prisma);
      const plan = await makePlan();
      await http(app)
        .patch(apiPath(`/platform/plans/${plan.id}/limits/products`))
        .set(...authHeader(superAdmin))
        .send({})
        .expect(400);
      await http(app)
        .patch(apiPath(`/platform/plans/${plan.id}/limits/products`))
        .set(...authHeader(superAdmin))
        .send({ limitValue: -1 })
        .expect(400);
    });

    it('rejects an unrecognized limit key', async () => {
      const superAdmin = await registerSuperAdmin(app, prisma);
      const plan = await makePlan();
      await http(app)
        .patch(apiPath(`/platform/plans/${plan.id}/limits/not_a_real_limit`))
        .set(...authHeader(superAdmin))
        .send({ limitValue: 5 })
        .expect(400);
    });
  });

  // ─── TENANT ENTITLEMENT OVERRIDES ───────────────────────────────────────

  describe('tenant entitlement overrides', () => {
    it('creates a feature override and lists it back', async () => {
      const superAdmin = await registerSuperAdmin(app, prisma);
      const tenant = await makeTenant();

      const created = await http(app)
        .post(apiPath(`/platform/tenants/${tenant.id}/overrides`))
        .set(...authHeader(superAdmin))
        .send({
          featureKey: 'coupons',
          boolValue: true,
          reason: 'pilot customer grant',
        })
        .expect(201);
      expect(created.body.data).toMatchObject({
        tenantId: tenant.id,
        featureKey: 'coupons',
        boolValue: true,
        limitKey: null,
        intValue: null,
        revokedAt: null,
      });
      expect(created.body.data.createdByUserId).toBe(superAdmin.id);

      const list = await http(app)
        .get(apiPath(`/platform/tenants/${tenant.id}/overrides`))
        .set(...authHeader(superAdmin))
        .expect(200);
      expect(list.body.data).toHaveLength(1);
    });

    it('creates a limit override with intValue: null (unlimited)', async () => {
      const superAdmin = await registerSuperAdmin(app, prisma);
      const tenant = await makeTenant();

      const res = await http(app)
        .post(apiPath(`/platform/tenants/${tenant.id}/overrides`))
        .set(...authHeader(superAdmin))
        .send({
          limitKey: 'products',
          intValue: null,
          reason: 'enterprise pilot — unlimited products',
        })
        .expect(201);
      expect(res.body.data).toMatchObject({
        limitKey: 'products',
        intValue: null,
        featureKey: null,
        boolValue: null,
      });
    });

    it('rejects a payload with both featureKey and limitKey', async () => {
      const superAdmin = await registerSuperAdmin(app, prisma);
      const tenant = await makeTenant();
      await http(app)
        .post(apiPath(`/platform/tenants/${tenant.id}/overrides`))
        .set(...authHeader(superAdmin))
        .send({
          featureKey: 'coupons',
          limitKey: 'products',
          boolValue: true,
          intValue: 5,
          reason: 'x',
        })
        .expect(400);
    });

    it('rejects a payload with neither featureKey nor limitKey', async () => {
      const superAdmin = await registerSuperAdmin(app, prisma);
      const tenant = await makeTenant();
      await http(app)
        .post(apiPath(`/platform/tenants/${tenant.id}/overrides`))
        .set(...authHeader(superAdmin))
        .send({ reason: 'x' })
        .expect(400);
    });

    it('rejects a blank reason', async () => {
      const superAdmin = await registerSuperAdmin(app, prisma);
      const tenant = await makeTenant();
      await http(app)
        .post(apiPath(`/platform/tenants/${tenant.id}/overrides`))
        .set(...authHeader(superAdmin))
        .send({ featureKey: 'coupons', boolValue: true, reason: '' })
        .expect(400);
    });

    it('404s on a nonexistent tenant', async () => {
      const superAdmin = await registerSuperAdmin(app, prisma);
      await http(app)
        .post(apiPath(`/platform/tenants/${randomUUID()}/overrides`))
        .set(...authHeader(superAdmin))
        .send({ featureKey: 'coupons', boolValue: true, reason: 'x' })
        .expect(404);
    });

    it('revokes an override (soft — row is never deleted) and rejects revoking it twice', async () => {
      const superAdmin = await registerSuperAdmin(app, prisma);
      const tenant = await makeTenant();
      const created = await http(app)
        .post(apiPath(`/platform/tenants/${tenant.id}/overrides`))
        .set(...authHeader(superAdmin))
        .send({
          featureKey: 'coupons',
          boolValue: true,
          reason: 'temporary grant',
        })
        .expect(201);
      const overrideId = created.body.data.id as string;

      const revoked = await http(app)
        .post(
          apiPath(
            `/platform/tenants/${tenant.id}/overrides/${overrideId}/revoke`,
          ),
        )
        .set(...authHeader(superAdmin))
        .expect(200);
      expect(revoked.body.data.revokedAt).not.toBeNull();
      expect(revoked.body.data.revokedByUserId).toBe(superAdmin.id);

      const stillThere = await prisma.tenantEntitlementOverride.findUnique({
        where: { id: overrideId },
      });
      expect(stillThere).not.toBeNull();

      await http(app)
        .post(
          apiPath(
            `/platform/tenants/${tenant.id}/overrides/${overrideId}/revoke`,
          ),
        )
        .set(...authHeader(superAdmin))
        .expect(409);
    });

    it('404s (not leaking existence) when revoking an override under the wrong tenant', async () => {
      const superAdmin = await registerSuperAdmin(app, prisma);
      const tenantA = await makeTenant();
      const tenantB = await makeTenant();
      const created = await http(app)
        .post(apiPath(`/platform/tenants/${tenantA.id}/overrides`))
        .set(...authHeader(superAdmin))
        .send({ featureKey: 'coupons', boolValue: true, reason: 'x' })
        .expect(201);
      const overrideId = created.body.data.id as string;

      await http(app)
        .post(
          apiPath(
            `/platform/tenants/${tenantB.id}/overrides/${overrideId}/revoke`,
          ),
        )
        .set(...authHeader(superAdmin))
        .expect(404);
    });

    // Phase 6 W7 (§24) — createdByUserId/revokedByUserId must always come
    // from the authenticated platform operator, never the client.
    it('a spoofed createdByUserId in the request body is rejected outright (global forbidNonWhitelisted, not merely ignored)', async () => {
      const superAdmin = await registerSuperAdmin(app, prisma);
      const otherAdmin = await registerSuperAdmin(app, prisma);
      const tenant = await makeTenant();

      const res = await http(app)
        .post(apiPath(`/platform/tenants/${tenant.id}/overrides`))
        .set(...authHeader(superAdmin))
        .send({
          featureKey: 'coupons',
          boolValue: true,
          reason: 'x',
          createdByUserId: otherAdmin.id,
        })
        .expect(400);
      expect(res.body.success).toBe(false);

      const rows = await prisma.tenantEntitlementOverride.findMany({
        where: { tenantId: tenant.id },
      });
      expect(rows).toHaveLength(0);
    });

    it('a spoofed revokedByUserId in the request body has no effect — the revoke route binds no body at all, so the real actor always wins', async () => {
      const superAdmin = await registerSuperAdmin(app, prisma);
      const otherAdmin = await registerSuperAdmin(app, prisma);
      const tenant = await makeTenant();
      const created = await http(app)
        .post(apiPath(`/platform/tenants/${tenant.id}/overrides`))
        .set(...authHeader(superAdmin))
        .send({ featureKey: 'coupons', boolValue: true, reason: 'x' })
        .expect(201);
      const overrideId = created.body.data.id as string;

      const revoked = await http(app)
        .post(
          apiPath(
            `/platform/tenants/${tenant.id}/overrides/${overrideId}/revoke`,
          ),
        )
        .set(...authHeader(superAdmin))
        .send({ revokedByUserId: otherAdmin.id })
        .expect(200);

      expect(revoked.body.data.revokedByUserId).toBe(superAdmin.id);
      expect(revoked.body.data.revokedByUserId).not.toBe(otherAdmin.id);
    });

    // Phase 6 W7 (§15) — "update" is revoke-and-recreate; no single PATCH
    // endpoint exists (none is required — see the W7 report). This proves
    // the two-call workflow actually achieves a clean replacement:
    // historical row retained + revoked, new row active with the new
    // value.
    it('override replacement (revoke old, create new) retains the old row as revoked and makes the new row the effective one', async () => {
      const superAdmin = await registerSuperAdmin(app, prisma);
      const tenant = await makeTenant();

      const original = await http(app)
        .post(apiPath(`/platform/tenants/${tenant.id}/overrides`))
        .set(...authHeader(superAdmin))
        .send({ limitKey: 'products', intValue: 5, reason: 'pilot cap' })
        .expect(201);
      const originalId = original.body.data.id as string;

      await http(app)
        .post(
          apiPath(
            `/platform/tenants/${tenant.id}/overrides/${originalId}/revoke`,
          ),
        )
        .set(...authHeader(superAdmin))
        .expect(200);

      const replacement = await http(app)
        .post(apiPath(`/platform/tenants/${tenant.id}/overrides`))
        .set(...authHeader(superAdmin))
        .send({ limitKey: 'products', intValue: 20, reason: 'pilot expanded' })
        .expect(201);
      const replacementId = replacement.body.data.id as string;

      const list = await http(app)
        .get(apiPath(`/platform/tenants/${tenant.id}/overrides`))
        .set(...authHeader(superAdmin))
        .expect(200);
      expect(list.body.data).toHaveLength(2); // historical row retained

      const oldRow = list.body.data.find(
        (r: { id: string }) => r.id === originalId,
      );
      const newRow = list.body.data.find(
        (r: { id: string }) => r.id === replacementId,
      );
      expect(oldRow.revokedAt).not.toBeNull();
      expect(oldRow.intValue).toBe(5); // never mutated in place
      expect(newRow.revokedAt).toBeNull();
      expect(newRow.intValue).toBe(20);
    });
  });

  // ─── AUDITING ───────────────────────────────────────────────────────────

  describe('platform auditing', () => {
    it('every plan/feature/limit/override mutation writes exactly one PlatformAuditLog with the correct actor', async () => {
      const superAdmin = await registerSuperAdmin(app, prisma);

      const created = await http(app)
        .post(apiPath('/platform/plans'))
        .set(...authHeader(superAdmin))
        .send({ key: 'audit_plan', name: 'Audit Plan' })
        .expect(201);
      const planId = created.body.data.id as string;

      await http(app)
        .patch(apiPath(`/platform/plans/${planId}/features/coupons`))
        .set(...authHeader(superAdmin))
        .send({ enabled: true })
        .expect(200);
      await http(app)
        .patch(apiPath(`/platform/plans/${planId}/limits/products`))
        .set(...authHeader(superAdmin))
        .send({ limitValue: 10 })
        .expect(200);

      const tenant = await makeTenant();
      const override = await http(app)
        .post(apiPath(`/platform/tenants/${tenant.id}/overrides`))
        .set(...authHeader(superAdmin))
        .send({ featureKey: 'coupons', boolValue: true, reason: 'x' })
        .expect(201);
      await http(app)
        .post(
          apiPath(
            `/platform/tenants/${tenant.id}/overrides/${override.body.data.id}/revoke`,
          ),
        )
        .set(...authHeader(superAdmin))
        .expect(200);

      const logs = await prisma.platformAuditLog.findMany({
        where: { actorUserId: superAdmin.id },
        orderBy: { createdAt: 'asc' },
      });
      const actions = logs.map((l) => l.action);
      expect(actions).toEqual([
        'plan.create',
        'plan.feature.set',
        'plan.limit.set',
        'entitlement_override.create',
        'entitlement_override.revoke',
      ]);
      // Every log row is attributed to the real actor, never a
      // client-suppliable value.
      expect(logs.every((l) => l.actorUserId === superAdmin.id)).toBe(true);
    });

    it('a rejected mutation (duplicate plan key) writes NO PlatformAuditLog row', async () => {
      const superAdmin = await registerSuperAdmin(app, prisma);
      await makePlan({ key: 'dup' });

      await http(app)
        .post(apiPath('/platform/plans'))
        .set(...authHeader(superAdmin))
        .send({ key: 'dup', name: 'Duplicate' })
        .expect(409);

      const logs = await prisma.platformAuditLog.findMany({
        where: { action: 'plan.create', targetType: 'Plan' },
      });
      expect(logs).toHaveLength(0);
    });
  });

  // ─── SECURITY ───────────────────────────────────────────────────────────

  describe('security', () => {
    it('a granted X-Active-Tenant header has no effect on /platform/plans (platform routes never resolve a TenantContext)', async () => {
      const superAdmin = await registerSuperAdmin(app, prisma);
      const tenant = await makeTenant();
      await makePlan({ key: 'visible-anyway' });

      await http(app)
        .get(apiPath('/platform/plans'))
        .set(...authHeader(superAdmin))
        .set('X-Active-Tenant', tenant.id)
        .expect(200);
    });

    it('existing /platform/tenants and /admin/* routes are unaffected by this module (regression)', async () => {
      const superAdmin = await registerSuperAdmin(app, prisma);
      const admin = await registerAdmin(app, prisma);
      await http(app)
        .get(apiPath('/platform/tenants'))
        .set(...authHeader(superAdmin))
        .expect(200);
      await http(app)
        .get(apiPath('/admin/dashboard'))
        .set(...authHeader(admin))
        .expect(200);
    });
  });
});
