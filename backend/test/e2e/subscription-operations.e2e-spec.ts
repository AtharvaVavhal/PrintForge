import { randomUUID } from 'crypto';
import { INestApplication } from '@nestjs/common';
import { resetDatabase } from './support/db';
import { createTestApp } from './support/test-app';
import { apiPath, authHeader, http, registerUser } from './support/fixtures';
import { PrismaService } from '../../src/common/database/prisma.service';
import { EntitlementService } from '../../src/entitlements/entitlement.service';
import { seedFreePlanCatalogue } from '../../prisma/free-plan-catalogue';
import { BILLING_PROVIDER } from '../../src/subscriptions/billing-provider.token';
import type { BillingProvider } from '../../src/subscriptions/billing-provider.interface';

/**
 * Phase 7 Stage 2 (docs/saas/DECISIONS.md P7-D2) — the tenant-facing
 * subscription-mutation HTTP surface, exercised through the REAL guard
 * chain, real Postgres, and the real `FakeBillingProvider` binding
 * `SubscriptionModule` provides in the running app (no override needed —
 * see `subscription.module.ts`'s own comment on why this differs from
 * `CloudinaryService`/`FakeCloudinaryService`). Bare-service-level
 * Stage 1 lifecycle proof lives in `subscription-lifecycle.e2e-spec.ts`;
 * this file proves the Stage 2 orchestration/HTTP/permission/idempotency
 * layer on top of it.
 */
describe('Phase 7 Stage 2 — tenant subscription mutation APIs (real Postgres, real guard chain, real FakeBillingProvider)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let entitlementService: EntitlementService;
  let billingProvider: BillingProvider;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    entitlementService = app.get(EntitlementService);
    // The SAME singleton SubscriptionModule bound to BILLING_PROVIDER for
    // the whole running app (SubscriptionOrchestrationService injects this
    // exact instance) — fixtures MUST register a subscription through it,
    // never fabricate a providerSubscriptionId string directly, or a real
    // mutation call will correctly (by design) fail to recognize it.
    billingProvider = app.get(BILLING_PROVIDER);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  /** Mirrors `tenant-entitlement-api.e2e-spec.ts`'s own `memberWithRole`
   * fixture — a tenant with exactly one membership (so no
   * `ACTIVE_TENANT_HEADER` is needed) and a real, provider-linked, ACTIVE
   * Subscription, since every Stage 2 mutation requires one. */
  async function memberWithRole(
    role: 'OWNER' | 'ADMIN' | 'STAFF' | 'VIEWER',
    planOverrides: { key?: string; name?: string } = {},
  ) {
    const user = await registerUser(app, `s2-${role.toLowerCase()}`);
    const tenant = await prisma.tenant.create({
      data: { slug: `s2-${role.toLowerCase()}-${randomUUID()}` },
    });
    await prisma.tenantMembership.create({
      data: { userId: user.id, tenantId: tenant.id, role, status: 'ACTIVE' },
    });
    const plan = await prisma.plan.create({
      data: {
        key: planOverrides.key ?? `s2-plan-${randomUUID()}`,
        name: planOverrides.name ?? 'Stage 2 Test Plan',
        isActive: true,
        sortOrder: 0,
        isEnterpriseCustom: false,
      },
    });
    await seedFreePlanCatalogue(prisma, plan.id);
    // A real FakeBillingProvider-linked subscription — the Subscription
    // ROW is created directly (not through the orchestration layer), so
    // each test starts from a known, already-ACTIVE state, matching how
    // `tenant-entitlement-api.e2e-spec.ts`'s own fixture seeds a
    // Subscription directly rather than driving the full create flow.
    // BUT the provider-side customer/subscription must be genuinely
    // registered with the app's real BillingProvider singleton first —
    // fabricating providerCustomerId/providerSubscriptionId strings
    // directly (as an earlier version of this fixture did) leaves them
    // unrecognized by FakeBillingProvider, so any real mutation call
    // correctly (by design) fails with an unclassified-provider-error
    // 503, since the orchestration layer never trusts an unverified
    // provider reference.
    const customer = await billingProvider.createCustomer(tenant.id);
    const providerSub = await billingProvider.createSubscription(
      customer.providerCustomerId,
      plan.id,
    );
    const now = providerSub.currentPeriodStart;
    const periodEnd = providerSub.currentPeriodEnd;
    const subscription = await prisma.subscription.create({
      data: {
        tenantId: tenant.id,
        planId: plan.id,
        status: 'ACTIVE',
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        providerCustomerId: customer.providerCustomerId,
        providerSubscriptionId: providerSub.providerSubscriptionId,
        updatedAt: now,
      },
    });
    return { ...user, tenantId: tenant.id, planId: plan.id, subscription };
  }

  async function makeUpgradeTargetPlan(features: Record<string, boolean> = {}) {
    const plan = await prisma.plan.create({
      data: {
        key: `s2-target-${randomUUID()}`,
        name: 'Stage 2 Target Plan',
        isActive: true,
        sortOrder: 1,
        isEnterpriseCustom: false,
      },
    });
    await seedFreePlanCatalogue(prisma, plan.id);
    for (const [featureKey, value] of Object.entries(features)) {
      await prisma.planFeature.updateMany({
        where: { planId: plan.id, featureKey },
        data: { enabled: value },
      });
    }
    return plan;
  }

  function idemKey(): string {
    return randomUUID();
  }

  // ─── Permission enforcement (billing:manage, P7-D2 Part A) ──────────────

  describe('permission enforcement (billing:manage, NOT dashboard:read)', () => {
    it('STAFF and VIEWER are denied on every mutation route (403)', async () => {
      for (const role of ['STAFF', 'VIEWER'] as const) {
        const member = await memberWithRole(role);
        const targetPlan = await makeUpgradeTargetPlan();
        await http(app)
          .post(apiPath('/admin/subscription/upgrade'))
          .set(...authHeader(member))
          .set('Idempotency-Key', idemKey())
          .send({ toPlanId: targetPlan.id })
          .expect(403);
        await http(app)
          .post(apiPath('/admin/subscription/downgrade'))
          .set(...authHeader(member))
          .set('Idempotency-Key', idemKey())
          .send({ toPlanId: targetPlan.id })
          .expect(403);
        await http(app)
          .post(apiPath('/admin/subscription/cancel'))
          .set(...authHeader(member))
          .set('Idempotency-Key', idemKey())
          .send({ atPeriodEnd: false })
          .expect(403);
        await http(app)
          .post(apiPath('/admin/subscription/resume'))
          .set(...authHeader(member))
          .set('Idempotency-Key', idemKey())
          .expect(403);
      }
    });

    it('OWNER and ADMIN are permitted (billing:manage granted)', async () => {
      for (const role of ['OWNER', 'ADMIN'] as const) {
        const member = await memberWithRole(role);
        const targetPlan = await makeUpgradeTargetPlan();
        const res = await http(app)
          .post(apiPath('/admin/subscription/upgrade'))
          .set(...authHeader(member))
          .set('Idempotency-Key', idemKey())
          .send({ toPlanId: targetPlan.id })
          .expect(201);
        expect(res.body.data.plan.key).toBe(targetPlan.key);
      }
    });

    it('an unauthenticated request is denied (401)', async () => {
      await http(app)
        .post(apiPath('/admin/subscription/resume'))
        .set('Idempotency-Key', idemKey())
        .expect(401);
    });
  });

  // ─── Idempotency-Key header requirement ─────────────────────────────────

  it('a missing Idempotency-Key header is rejected (400) before any mutation', async () => {
    const owner = await memberWithRole('OWNER');
    const targetPlan = await makeUpgradeTargetPlan();
    await http(app)
      .post(apiPath('/admin/subscription/upgrade'))
      .set(...authHeader(owner))
      .send({ toPlanId: targetPlan.id })
      .expect(400);

    const unchanged = await prisma.subscription.findUniqueOrThrow({
      where: { tenantId: owner.tenantId },
    });
    expect(unchanged.planId).toBe(owner.planId);
  });

  // ─── Upgrade ─────────────────────────────────────────────────────────────

  describe('upgrade', () => {
    it('changes planId immediately and entitlement resolution reflects it right away', async () => {
      const owner = await memberWithRole('OWNER');
      const targetPlan = await makeUpgradeTargetPlan({ custom_domain: true });

      const before = await entitlementService.resolve(owner.tenantId);
      expect(before.features.custom_domain).toBe(false);

      const res = await http(app)
        .post(apiPath('/admin/subscription/upgrade'))
        .set(...authHeader(owner))
        .set('Idempotency-Key', idemKey())
        .send({ toPlanId: targetPlan.id })
        .expect(201);

      expect(res.body.data.status).toBe('ACTIVE');
      expect(res.body.data.plan.key).toBe(targetPlan.key);

      const after = await entitlementService.resolve(owner.tenantId);
      expect(after.features.custom_domain).toBe(true);
    });

    it('rejects an unknown plan id (404) and leaves the subscription untouched', async () => {
      const owner = await memberWithRole('OWNER');
      await http(app)
        .post(apiPath('/admin/subscription/upgrade'))
        .set(...authHeader(owner))
        .set('Idempotency-Key', idemKey())
        .send({ toPlanId: randomUUID() })
        .expect(404);

      const unchanged = await prisma.subscription.findUniqueOrThrow({
        where: { tenantId: owner.tenantId },
      });
      expect(unchanged.planId).toBe(owner.planId);
    });
  });

  // ─── Downgrade — non-destructive, pendingPlanId only ────────────────────

  describe('downgrade', () => {
    it('sets pendingPlanId without changing planId or reducing entitlement immediately', async () => {
      const owner = await memberWithRole('OWNER');
      const targetPlan = await makeUpgradeTargetPlan();

      const res = await http(app)
        .post(apiPath('/admin/subscription/downgrade'))
        .set(...authHeader(owner))
        .set('Idempotency-Key', idemKey())
        .send({ toPlanId: targetPlan.id })
        .expect(201);

      expect(res.body.data.pendingPlanId).toBe(targetPlan.id);
      expect(res.body.data.status).toBe('ACTIVE');
      const row = await prisma.subscription.findUniqueOrThrow({
        where: { tenantId: owner.tenantId },
      });
      expect(row.planId).toBe(owner.planId); // unchanged — non-destructive
      expect(row.pendingPlanId).toBe(targetPlan.id);
      expect(row.status).toBe('ACTIVE');
    });
  });

  // ─── Cancellation — immediate (P7-D2 Part B) and at period end (Part C) ─

  describe('cancellation', () => {
    it('atPeriodEnd:false cancels immediately (ACTIVE -> CANCELLED) and retains all tenant data', async () => {
      const owner = await memberWithRole('OWNER');
      // A real, unrelated tenant resource that must NOT be touched by
      // cancellation (P7-D2 Part B: "no destructive deletion").
      const category = await prisma.category.create({
        data: {
          tenantId: owner.tenantId,
          name: 'Still here',
          slug: `still-here-${randomUUID()}`,
        },
      });

      const res = await http(app)
        .post(apiPath('/admin/subscription/cancel'))
        .set(...authHeader(owner))
        .set('Idempotency-Key', idemKey())
        .send({ atPeriodEnd: false })
        .expect(201);

      expect(res.body.data.status).toBe('CANCELLED');

      const stillThere = await prisma.category.findUnique({
        where: { id: category.id },
      });
      expect(stillThere).not.toBeNull();
      const tenantStillThere = await prisma.tenant.findUnique({
        where: { id: owner.tenantId },
      });
      expect(tenantStillThere).not.toBeNull();
    });

    it('atPeriodEnd:true schedules cancellation without an immediate CANCELLED transition', async () => {
      const owner = await memberWithRole('OWNER');

      const res = await http(app)
        .post(apiPath('/admin/subscription/cancel'))
        .set(...authHeader(owner))
        .set('Idempotency-Key', idemKey())
        .send({ atPeriodEnd: true })
        .expect(201);

      expect(res.body.data.status).toBe('ACTIVE');
      expect(res.body.data.cancelAtPeriodEnd).toBe(true);

      const row = await prisma.subscription.findUniqueOrThrow({
        where: { tenantId: owner.tenantId },
      });
      expect(row.status).toBe('ACTIVE');
      expect(row.cancelAtPeriodEnd).toBe(true);
    });
  });

  // ─── Resume ──────────────────────────────────────────────────────────────

  describe('resume', () => {
    it('reactivates a CANCELLED subscription', async () => {
      const owner = await memberWithRole('OWNER');
      await prisma.subscription.update({
        where: { tenantId: owner.tenantId },
        data: { status: 'CANCELLED' },
      });

      const res = await http(app)
        .post(apiPath('/admin/subscription/resume'))
        .set(...authHeader(owner))
        .set('Idempotency-Key', idemKey())
        .expect(201);

      expect(res.body.data.status).toBe('ACTIVE');
    });

    it('is rejected (409) for an EXPIRED subscription', async () => {
      const owner = await memberWithRole('OWNER');
      await prisma.subscription.update({
        where: { tenantId: owner.tenantId },
        data: { status: 'EXPIRED' },
      });

      await http(app)
        .post(apiPath('/admin/subscription/resume'))
        .set(...authHeader(owner))
        .set('Idempotency-Key', idemKey())
        .expect(409);
    });
  });

  // ─── HTTP idempotency (Step 12) ──────────────────────────────────────────

  describe('HTTP idempotency', () => {
    it('a repeated upgrade request with the SAME Idempotency-Key does not double-apply', async () => {
      const owner = await memberWithRole('OWNER');
      const targetPlan = await makeUpgradeTargetPlan();
      const key = idemKey();

      const first = await http(app)
        .post(apiPath('/admin/subscription/upgrade'))
        .set(...authHeader(owner))
        .set('Idempotency-Key', key)
        .send({ toPlanId: targetPlan.id })
        .expect(201);
      const second = await http(app)
        .post(apiPath('/admin/subscription/upgrade'))
        .set(...authHeader(owner))
        .set('Idempotency-Key', key)
        .send({ toPlanId: targetPlan.id })
        .expect(201);

      expect(first.body.data.plan.key).toBe(targetPlan.key);
      expect(second.body.data.plan.key).toBe(targetPlan.key);

      const events = await prisma.subscriptionEvent.findMany({
        where: { subscriptionId: owner.subscription.id, type: 'upgraded' },
      });
      expect(events).toHaveLength(1); // exactly one upgrade actually happened
    });

    it("reusing the same key for a different tenant is rejected (409), never leaking the first tenant's state", async () => {
      const ownerA = await memberWithRole('OWNER');
      const ownerB = await memberWithRole('ADMIN');
      const targetPlan = await makeUpgradeTargetPlan();
      const key = idemKey();

      await http(app)
        .post(apiPath('/admin/subscription/upgrade'))
        .set(...authHeader(ownerA))
        .set('Idempotency-Key', key)
        .send({ toPlanId: targetPlan.id })
        .expect(201);

      await http(app)
        .post(apiPath('/admin/subscription/upgrade'))
        .set(...authHeader(ownerB))
        .set('Idempotency-Key', key)
        .send({ toPlanId: targetPlan.id })
        .expect(409);

      const bRow = await prisma.subscription.findUniqueOrThrow({
        where: { tenantId: ownerB.tenantId },
      });
      expect(bRow.planId).toBe(ownerB.planId); // ownerB's own subscription untouched
    });
  });

  // ─── Tenant isolation / provider-ID isolation ───────────────────────────

  describe('tenant isolation', () => {
    it("a tenant cannot affect another tenant's subscription — each request always acts on the caller's own, server-derived tenant", async () => {
      const ownerA = await memberWithRole('OWNER');
      const ownerB = await memberWithRole('ADMIN');
      const targetPlan = await makeUpgradeTargetPlan();

      await http(app)
        .post(apiPath('/admin/subscription/upgrade'))
        .set(...authHeader(ownerA))
        .set('Idempotency-Key', idemKey())
        .send({ toPlanId: targetPlan.id })
        .expect(201);

      const bRow = await prisma.subscription.findUniqueOrThrow({
        where: { tenantId: ownerB.tenantId },
      });
      expect(bRow.planId).toBe(ownerB.planId); // unaffected by A's upgrade
    });
  });

  // ─── CAS concurrency ─────────────────────────────────────────────────────

  describe('concurrency', () => {
    it('two concurrent upgrade requests for the same tenant never corrupt state — exactly one SubscriptionEvent survives', async () => {
      const owner = await memberWithRole('OWNER');
      const targetPlan = await makeUpgradeTargetPlan();

      const [resA, resB] = await Promise.all([
        http(app)
          .post(apiPath('/admin/subscription/upgrade'))
          .set(...authHeader(owner))
          .set('Idempotency-Key', idemKey())
          .send({ toPlanId: targetPlan.id }),
        http(app)
          .post(apiPath('/admin/subscription/upgrade'))
          .set(...authHeader(owner))
          .set('Idempotency-Key', idemKey())
          .send({ toPlanId: targetPlan.id }),
      ]);

      // Both requests are distinct idempotency keys for the identical
      // logical change (planId === targetPlan.id already, second time) —
      // neither should error; the final state is the target plan either way.
      expect([200, 201]).toContain(resA.status);
      expect([200, 201]).toContain(resB.status);

      const finalRow = await prisma.subscription.findUniqueOrThrow({
        where: { tenantId: owner.tenantId },
      });
      expect(finalRow.planId).toBe(targetPlan.id);

      const events = await prisma.subscriptionEvent.findMany({
        where: { subscriptionId: owner.subscription.id, type: 'upgraded' },
      });
      // Exactly one of the two racing requests actually performed the
      // mutation (CAS); the other's own confirmUpgrade call is a same-
      // target-state idempotent no-op per SubscriptionService's own
      // contract — never two competing writes, never a corrupted state.
      expect(events.length).toBe(1);
    });
  });
});
