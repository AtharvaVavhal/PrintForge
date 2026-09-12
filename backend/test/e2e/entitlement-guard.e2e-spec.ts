import { randomUUID } from 'crypto';
import { INestApplication } from '@nestjs/common';
import { resetDatabase } from './support/db';
import { createTestAppWithExtraModules } from './support/test-app';
import { EntitlementTestModule } from './support/entitlement-test.module';
import {
  apiPath,
  authHeader,
  grantMembership,
  http,
  registerAdmin,
  registerUser,
} from './support/fixtures';
import { PrismaService } from '../../src/common/database/prisma.service';

/**
 * Phase 6 W4 — `EntitlementGuard` exercised through the REAL, globally
 * registered guard chain (`TenantContextGuard -> TenantLifecycleGuard ->
 * PermissionsGuard -> EntitlementGuard`), a real Postgres-backed
 * `EntitlementService`, and `EntitlementTestController` (test-only, never
 * part of the real app — see that file's header). No guard is mocked here.
 */
describe('Phase 6 W4 — EntitlementGuard (/test-support/entitlement/*, real guard chain)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await createTestAppWithExtraModules([
      EntitlementTestModule,
    ]));
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  async function makePlanWithFeature(featureKey: string, enabled: boolean) {
    const plan = await prisma.plan.create({
      data: {
        key: `plan-${randomUUID().slice(0, 8)}`,
        name: 'Test Plan',
        isActive: true,
        sortOrder: 0,
        isEnterpriseCustom: false,
      },
    });
    await prisma.planFeature.create({
      data: { planId: plan.id, featureKey, enabled },
    });
    return plan;
  }

  async function makePlanWithNoFeatureRow() {
    return prisma.plan.create({
      data: {
        key: `plan-${randomUUID().slice(0, 8)}`,
        name: 'Bare Plan',
        isActive: true,
        sortOrder: 0,
        isEnterpriseCustom: false,
      },
    });
  }

  async function attachSubscription(tenantId: string, planId: string) {
    await prisma.subscription.create({
      data: { tenantId, planId, status: 'ACTIVE' },
    });
  }

  async function createOverride(
    tenantId: string,
    featureKey: string,
    boolValue: boolean,
    createdByUserId: string,
    revoked = false,
  ) {
    await prisma.tenantEntitlementOverride.create({
      data: {
        tenantId,
        featureKey,
        boolValue,
        reason: 'e2e test override',
        createdByUserId,
        revokedAt: revoked ? new Date() : null,
        revokedByUserId: revoked ? createdByUserId : null,
      },
    });
  }

  // ─── 1/2: enabled vs disabled ────────────────────────────────────────────

  it('1. a tenant with the feature enabled succeeds (200)', async () => {
    const admin = await registerAdmin(app, prisma);
    const plan = await makePlanWithFeature('coupons', true);
    await attachSubscription(admin.tenantId, plan.id);

    await http(app)
      .get(apiPath('/test-support/entitlement/coupons-gated'))
      .set(...authHeader(admin))
      .expect(200);
  });

  it('2. a tenant with the feature disabled receives 403 upgrade_required', async () => {
    const admin = await registerAdmin(app, prisma);
    const plan = await makePlanWithFeature('coupons', false);
    await attachSubscription(admin.tenantId, plan.id);

    const res = await http(app)
      .get(apiPath('/test-support/entitlement/coupons-gated'))
      .set(...authHeader(admin))
      .expect(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toBe('upgrade_required');
  });

  // ─── 3: missing PlanFeature row ──────────────────────────────────────────

  it('3. a plan with no PlanFeature row for the key denies (403 upgrade_required) — deny-by-default', async () => {
    const admin = await registerAdmin(app, prisma);
    const plan = await makePlanWithNoFeatureRow();
    await attachSubscription(admin.tenantId, plan.id);

    const res = await http(app)
      .get(apiPath('/test-support/entitlement/coupons-gated'))
      .set(...authHeader(admin))
      .expect(403);
    expect(res.body.error.message).toBe('upgrade_required');
  });

  // ─── 4/5/6: overrides ────────────────────────────────────────────────────

  it('4. an active override enables an otherwise-disabled plan feature — request succeeds', async () => {
    const admin = await registerAdmin(app, prisma);
    const plan = await makePlanWithFeature('coupons', false);
    await attachSubscription(admin.tenantId, plan.id);
    await createOverride(admin.tenantId, 'coupons', true, admin.id);

    await http(app)
      .get(apiPath('/test-support/entitlement/coupons-gated'))
      .set(...authHeader(admin))
      .expect(200);
  });

  it('5. an active override disables an otherwise-enabled plan feature — 403 upgrade_required', async () => {
    const admin = await registerAdmin(app, prisma);
    const plan = await makePlanWithFeature('coupons', true);
    await attachSubscription(admin.tenantId, plan.id);
    await createOverride(admin.tenantId, 'coupons', false, admin.id);

    const res = await http(app)
      .get(apiPath('/test-support/entitlement/coupons-gated'))
      .set(...authHeader(admin))
      .expect(403);
    expect(res.body.error.message).toBe('upgrade_required');
  });

  it('6. a revoked override is ignored — the request behaves according to the underlying plan value', async () => {
    const admin = await registerAdmin(app, prisma);
    const plan = await makePlanWithFeature('coupons', true);
    await attachSubscription(admin.tenantId, plan.id);
    // Revoked override tries to disable — must have NO effect; the plan's
    // own `true` must govern.
    await createOverride(admin.tenantId, 'coupons', false, admin.id, true);

    await http(app)
      .get(apiPath('/test-support/entitlement/coupons-gated'))
      .set(...authHeader(admin))
      .expect(200);
  });

  // ─── 7: cross-tenant isolation (mandatory, §17) ──────────────────────────

  describe('cross-tenant isolation (mandatory)', () => {
    it('Tenant A (feature disabled) cannot gain access even though Tenant B (feature enabled) exists — and the reverse holds too', async () => {
      const adminA = await registerAdmin(app, prisma);
      const adminB = await registerAdmin(app, prisma);
      const disabledPlan = await makePlanWithFeature('coupons', false);
      const enabledPlan = await makePlanWithFeature('coupons', true);
      await attachSubscription(adminA.tenantId, disabledPlan.id);
      await attachSubscription(adminB.tenantId, enabledPlan.id);

      const resA = await http(app)
        .get(apiPath('/test-support/entitlement/coupons-gated'))
        .set(...authHeader(adminA))
        .expect(403);
      expect(resA.body.error.message).toBe('upgrade_required');

      // Reverse: Tenant B, enabled, must succeed — proving A's denial
      // wasn't a global guard malfunction, and B's grant is real.
      await http(app)
        .get(apiPath('/test-support/entitlement/coupons-gated'))
        .set(...authHeader(adminB))
        .expect(200);
    });

    it("a client-supplied X-Active-Tenant header cannot be used to borrow another tenant's entitlement (TenantContextGuard rejects a mismatched header outright)", async () => {
      const adminA = await registerAdmin(app, prisma);
      const adminB = await registerAdmin(app, prisma);
      const disabledPlan = await makePlanWithFeature('coupons', false);
      const enabledPlan = await makePlanWithFeature('coupons', true);
      await attachSubscription(adminA.tenantId, disabledPlan.id);
      await attachSubscription(adminB.tenantId, enabledPlan.id);

      // adminA tries to claim tenant B's id via the header — TenantContextGuard
      // itself rejects this (403) before EntitlementGuard ever runs, since
      // adminA holds no ACTIVE membership in tenant B.
      const res = await http(app)
        .get(apiPath('/test-support/entitlement/coupons-gated'))
        .set(...authHeader(adminA))
        .set('X-Active-Tenant', adminB.tenantId)
        .expect(403);
      expect(res.body.error.message).not.toBe('upgrade_required'); // a different, earlier denial
    });
  });

  // ─── 8: permission vs feature composition (mandatory, §18) ──────────────

  describe('permission + feature composition', () => {
    it('permission denied remains permission denial, even when the feature IS enabled', async () => {
      const owner = await registerAdmin(app, prisma);
      const plan = await makePlanWithFeature('coupons', true);
      await attachSubscription(owner.tenantId, plan.id);
      // A plain user with zero membership anywhere — PermissionsGuard denies
      // for lack of tenant context before EntitlementGuard ever runs.
      const outsider = await registerUser(app);

      const res = await http(app)
        .get(apiPath('/test-support/entitlement/coupons-gated'))
        .set(...authHeader(outsider))
        .expect(403);
      expect(res.body.error.message).not.toBe('upgrade_required');
    });

    it('permission granted + feature disabled -> 403 upgrade_required (the feature layer, not the permission layer, produces this denial)', async () => {
      const admin = await registerAdmin(app, prisma);
      const plan = await makePlanWithFeature('coupons', false);
      await attachSubscription(admin.tenantId, plan.id);

      const res = await http(app)
        .get(apiPath('/test-support/entitlement/coupons-gated'))
        .set(...authHeader(admin))
        .expect(403);
      expect(res.body.error.message).toBe('upgrade_required');
    });

    it('permission granted + feature enabled -> request proceeds', async () => {
      const admin = await registerAdmin(app, prisma);
      const plan = await makePlanWithFeature('coupons', true);
      await attachSubscription(admin.tenantId, plan.id);

      await http(app)
        .get(apiPath('/test-support/entitlement/coupons-gated'))
        .set(...authHeader(admin))
        .expect(200);
    });

    it('a STAFF member (holds dashboard:read) is still feature-gated the same way as an OWNER', async () => {
      const owner = await registerAdmin(app, prisma);
      const staffUser = await registerUser(app, 'staff');
      await grantMembership(prisma, staffUser.id, owner.tenantId, 'STAFF');
      const plan = await makePlanWithFeature('coupons', false);
      await attachSubscription(owner.tenantId, plan.id);

      const res = await http(app)
        .get(apiPath('/test-support/entitlement/coupons-gated'))
        .set(...authHeader(staffUser))
        .expect(403);
      expect(res.body.error.message).toBe('upgrade_required');
    });
  });

  // ─── 9: missing tenant context cannot grant access ──────────────────────

  it('9. no resolvable tenant context (zero memberships) cannot grant feature access', async () => {
    const user = await registerUser(app);
    // No membership at all — TenantContextGuard resolves no context;
    // PermissionsGuard denies for lack of context before EntitlementGuard
    // ever executes.
    const res = await http(app)
      .get(apiPath('/test-support/entitlement/coupons-gated'))
      .set(...authHeader(user))
      .expect(403);
    expect(res.body.success).toBe(false);
  });

  it('unauthenticated access is rejected (401, before any tenant/feature logic runs)', async () => {
    await http(app)
      .get(apiPath('/test-support/entitlement/coupons-gated'))
      .expect(401);
  });

  // ─── Different feature key, same mechanism ──────────────────────────────

  it('a different route gated by a different feature key (team_members) is independently evaluated', async () => {
    const admin = await registerAdmin(app, prisma);
    const plan = await makePlanWithFeature('team_members', true);
    // Deliberately do NOT configure `coupons` — it must independently deny.
    await attachSubscription(admin.tenantId, plan.id);

    await http(app)
      .get(apiPath('/test-support/entitlement/team-members-gated'))
      .set(...authHeader(admin))
      .expect(200);
    const res = await http(app)
      .get(apiPath('/test-support/entitlement/coupons-gated'))
      .set(...authHeader(admin))
      .expect(403);
    expect(res.body.error.message).toBe('upgrade_required');
  });

  // ─── §23: existing, unmodified real endpoint is completely unaffected ───

  describe('regression — existing endpoints without @RequireFeature are unaffected', () => {
    it('GET /admin/dashboard (no @RequireFeature metadata) behaves exactly as before — succeeds for an OWNER regardless of plan/feature state', async () => {
      const admin = await registerAdmin(app, prisma);
      // Deliberately create NO Plan/Subscription at all for this tenant —
      // if EntitlementGuard were accidentally active on this route, a
      // missing subscription would (via the fallback/free deny-by-default
      // path) have no bearing here, since no @RequireFeature is declared.
      await http(app)
        .get(apiPath('/admin/dashboard'))
        .set(...authHeader(admin))
        .expect(200);
    });

    it('GET /admin/dashboard still correctly denies a plain user with no membership — permission behavior unchanged', async () => {
      const user = await registerUser(app);
      await http(app)
        .get(apiPath('/admin/dashboard'))
        .set(...authHeader(user))
        .expect(403);
    });
  });
});
