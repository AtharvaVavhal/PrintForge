import { randomUUID } from 'crypto';
import { INestApplication } from '@nestjs/common';
import { resetDatabase } from './support/db';
import { createTestApp } from './support/test-app';
import { PrismaService } from '../../src/common/database/prisma.service';
import { SubscriptionSchedulerService } from '../../src/subscriptions/subscription-scheduler.service';
import { BILLING_PROVIDER } from '../../src/subscriptions/billing-provider.token';
import type { BillingProvider } from '../../src/subscriptions/billing-provider.interface';
import { seedFreePlanCatalogue } from '../../prisma/free-plan-catalogue';

/**
 * Phase 7 — Scheduler Implementation Wave. Real Postgres, real
 * `FakeBillingProvider` singleton, real `SubscriptionService`/
 * `SubscriptionOrchestrationService` — `SubscriptionSchedulerService`'s
 * `@Cron` methods are invoked directly (the standard way to test a
 * `@nestjs/schedule` job without waiting on a real timer), never through
 * HTTP (nothing here is a route). Covers exactly the two implemented
 * jobs; deliberately contains NO cancellation-expiration coverage — that
 * job does not exist (see `subscription-scheduler.service.ts`'s own
 * header comment for why).
 */
describe('Phase 7 — Subscription Scheduler (real Postgres, real FakeBillingProvider)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let scheduler: SubscriptionSchedulerService;
  let billingProvider: BillingProvider;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    scheduler = app.get(SubscriptionSchedulerService);
    billingProvider = app.get(BILLING_PROVIDER);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  async function makeTenantAndPlan(planOverrides: { key?: string } = {}) {
    const tenant = await prisma.tenant.create({
      data: { slug: `sched-${randomUUID()}` },
    });
    const plan = await prisma.plan.create({
      data: {
        key: planOverrides.key ?? `sched-plan-${randomUUID()}`,
        name: 'Scheduler Test Plan',
        isActive: true,
        sortOrder: 0,
        isEnterpriseCustom: false,
      },
    });
    await seedFreePlanCatalogue(prisma, plan.id);
    return { tenant, plan };
  }

  /** A real, provider-registered ACTIVE subscription (via the app's real
   * FakeBillingProvider singleton — never a fabricated providerSubscriptionId
   * string, matching the lesson learned in subscription-operations
   * .e2e-spec.ts's own fixture). */
  async function makeRegisteredSubscription(
    status: 'ACTIVE' | 'PAST_DUE' = 'ACTIVE',
    extra: {
      graceEndsAt?: Date;
      pendingPlanId?: string;
      cancelAtPeriodEnd?: boolean;
    } = {},
  ) {
    const { tenant, plan } = await makeTenantAndPlan();
    const customer = await billingProvider.createCustomer(tenant.id);
    const providerSub = await billingProvider.createSubscription(
      customer.providerCustomerId,
      plan.id,
    );
    const subscription = await prisma.subscription.create({
      data: {
        tenantId: tenant.id,
        planId: plan.id,
        status,
        currentPeriodStart: providerSub.currentPeriodStart,
        currentPeriodEnd: providerSub.currentPeriodEnd,
        providerCustomerId: customer.providerCustomerId,
        providerSubscriptionId: providerSub.providerSubscriptionId,
        updatedAt: new Date(),
        ...extra,
      },
    });
    return { tenant, plan, subscription };
  }

  // ─── Grace exhaustion ─────────────────────────────────────────────────

  describe('runGraceExhaustion', () => {
    it('PAST_DUE with an elapsed graceEndsAt transitions to PAUSED and writes a paused event', async () => {
      const { subscription } = await makeRegisteredSubscription('PAST_DUE', {
        graceEndsAt: new Date(Date.now() - 60_000),
      });

      await scheduler.runGraceExhaustion();

      const updated = await prisma.subscription.findUniqueOrThrow({
        where: { id: subscription.id },
      });
      expect(updated.status).toBe('PAUSED');
      const events = await prisma.subscriptionEvent.findMany({
        where: { subscriptionId: subscription.id, type: 'paused' },
      });
      expect(events).toHaveLength(1);
    });

    it('PAST_DUE with a future graceEndsAt is left untouched', async () => {
      const { subscription } = await makeRegisteredSubscription('PAST_DUE', {
        graceEndsAt: new Date(Date.now() + 60 * 60_000),
      });

      await scheduler.runGraceExhaustion();

      const unchanged = await prisma.subscription.findUniqueOrThrow({
        where: { id: subscription.id },
      });
      expect(unchanged.status).toBe('PAST_DUE');
    });

    it('processes multiple eligible subscriptions across different tenants in one run, each independently', async () => {
      const { subscription: a } = await makeRegisteredSubscription('PAST_DUE', {
        graceEndsAt: new Date(Date.now() - 60_000),
      });
      const { subscription: b } = await makeRegisteredSubscription('PAST_DUE', {
        graceEndsAt: new Date(Date.now() - 60_000),
      });

      await scheduler.runGraceExhaustion();

      const rowA = await prisma.subscription.findUniqueOrThrow({
        where: { id: a.id },
      });
      const rowB = await prisma.subscription.findUniqueOrThrow({
        where: { id: b.id },
      });
      expect(rowA.status).toBe('PAUSED');
      expect(rowB.status).toBe('PAUSED');
      expect(rowA.tenantId).not.toBe(rowB.tenantId); // genuinely different tenants, both handled
    });

    it('repeated execution is idempotent — a second run writes no duplicate event', async () => {
      const { subscription } = await makeRegisteredSubscription('PAST_DUE', {
        graceEndsAt: new Date(Date.now() - 60_000),
      });

      await scheduler.runGraceExhaustion();
      await scheduler.runGraceExhaustion();

      const events = await prisma.subscriptionEvent.findMany({
        where: { subscriptionId: subscription.id, type: 'paused' },
      });
      expect(events).toHaveLength(1);
      const row = await prisma.subscription.findUniqueOrThrow({
        where: { id: subscription.id },
      });
      expect(row.status).toBe('PAUSED');
    });
  });

  // ─── Period reconciliation ───────────────────────────────────────────

  describe('runPeriodReconciliation', () => {
    it('applies a scheduled downgrade once the local currentPeriodEnd has elapsed', async () => {
      const { plan: targetPlan } = await makeTenantAndPlan();
      const { subscription } = await makeRegisteredSubscription('ACTIVE', {
        pendingPlanId: targetPlan.id,
      });
      // Simulate "the provider's period has already moved past our stale
      // local record" — the real-world condition reconcilePeriod exists
      // to detect (see the file's own fixture-design comment above).
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          currentPeriodStart: new Date(Date.now() - 60 * 24 * 60 * 60_000),
          currentPeriodEnd: new Date(Date.now() - 30 * 24 * 60 * 60_000),
        },
      });

      await scheduler.runPeriodReconciliation();

      const updated = await prisma.subscription.findUniqueOrThrow({
        where: { id: subscription.id },
      });
      expect(updated.planId).toBe(targetPlan.id);
      expect(updated.pendingPlanId).toBeNull();
    });

    it('applies a scheduled cancellation once the local currentPeriodEnd has elapsed', async () => {
      const { subscription } = await makeRegisteredSubscription('ACTIVE', {
        cancelAtPeriodEnd: true,
      });
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          currentPeriodStart: new Date(Date.now() - 60 * 24 * 60 * 60_000),
          currentPeriodEnd: new Date(Date.now() - 30 * 24 * 60 * 60_000),
        },
      });

      await scheduler.runPeriodReconciliation();

      const updated = await prisma.subscription.findUniqueOrThrow({
        where: { id: subscription.id },
      });
      expect(updated.status).toBe('CANCELLED');
    });

    it('an ACTIVE subscription whose currentPeriodEnd has NOT elapsed is left untouched', async () => {
      const { plan: targetPlan } = await makeTenantAndPlan();
      const { subscription } = await makeRegisteredSubscription('ACTIVE', {
        pendingPlanId: targetPlan.id,
      });
      // currentPeriodEnd from makeRegisteredSubscription is ~30 days out —
      // not eligible yet.

      await scheduler.runPeriodReconciliation();

      const unchanged = await prisma.subscription.findUniqueOrThrow({
        where: { id: subscription.id },
      });
      expect(unchanged.pendingPlanId).toBe(targetPlan.id); // still pending, nothing applied
      expect(unchanged.planId).not.toBe(targetPlan.id);
    });

    it('one subscription failing reconciliation does not prevent an unrelated one from being reconciled (failure isolation)', async () => {
      const { plan: targetPlan } = await makeTenantAndPlan();
      const { subscription: healthy } = await makeRegisteredSubscription(
        'ACTIVE',
        {
          pendingPlanId: targetPlan.id,
        },
      );
      await prisma.subscription.update({
        where: { id: healthy.id },
        data: {
          currentPeriodStart: new Date(Date.now() - 60 * 24 * 60 * 60_000),
          currentPeriodEnd: new Date(Date.now() - 30 * 24 * 60 * 60_000),
        },
      });
      // A second, ACTIVE subscription whose providerSubscriptionId is
      // corrupted to something FakeBillingProvider never registered —
      // its own reconciliation will throw when reconcilePeriod's internal
      // getSubscription() call rejects; the scheduler must still process
      // `healthy` regardless of iteration order.
      const { subscription: broken } =
        await makeRegisteredSubscription('ACTIVE');
      await prisma.subscription.update({
        where: { id: broken.id },
        data: {
          providerSubscriptionId: `unregistered-${randomUUID()}`,
          currentPeriodStart: new Date(Date.now() - 60 * 24 * 60 * 60_000),
          currentPeriodEnd: new Date(Date.now() - 30 * 24 * 60 * 60_000),
        },
      });

      await expect(scheduler.runPeriodReconciliation()).resolves.not.toThrow();

      const healthyRow = await prisma.subscription.findUniqueOrThrow({
        where: { id: healthy.id },
      });
      expect(healthyRow.planId).toBe(targetPlan.id); // reconciled despite the other's failure
      const brokenRow = await prisma.subscription.findUniqueOrThrow({
        where: { id: broken.id },
      });
      expect(brokenRow.status).toBe('ACTIVE'); // untouched — its own failure never applied anything
    });

    it('repeated execution is idempotent — a second run does not re-apply or duplicate events', async () => {
      const { plan: targetPlan } = await makeTenantAndPlan();
      const { subscription } = await makeRegisteredSubscription('ACTIVE', {
        pendingPlanId: targetPlan.id,
      });
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          currentPeriodStart: new Date(Date.now() - 60 * 24 * 60 * 60_000),
          currentPeriodEnd: new Date(Date.now() - 30 * 24 * 60 * 60_000),
        },
      });

      await scheduler.runPeriodReconciliation();
      await scheduler.runPeriodReconciliation();

      const events = await prisma.subscriptionEvent.findMany({
        where: { subscriptionId: subscription.id, type: 'downgrade_applied' },
      });
      expect(events).toHaveLength(1); // the second run no longer matches the eligibility query at all (planId already applied, currentPeriodEnd refreshed)
    });
  });
});
