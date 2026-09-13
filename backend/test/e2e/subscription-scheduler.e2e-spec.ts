import { randomUUID } from 'crypto';
import { INestApplication } from '@nestjs/common';
import { resetDatabase } from './support/db';
import { createTestApp } from './support/test-app';
import { PrismaService } from '../../src/common/database/prisma.service';
import { SubscriptionSchedulerService } from '../../src/subscriptions/subscription-scheduler.service';
import { BILLING_PROVIDER } from '../../src/subscriptions/billing-provider.token';
import { FakeBillingProvider } from '../../src/subscriptions/fake-billing-provider';
import { seedFreePlanCatalogue } from '../../prisma/free-plan-catalogue';

/**
 * Phase 7 — Scheduler Implementation Wave, extended by the Cancellation
 * Retention + Unscheduling wave. Real Postgres, real `FakeBillingProvider`
 * singleton, real `SubscriptionService`/`SubscriptionOrchestrationService`
 * — `SubscriptionSchedulerService`'s `@Cron` methods are invoked directly
 * (the standard way to test a `@nestjs/schedule` job without waiting on a
 * real timer), never through HTTP (nothing here is a route). Covers all
 * three jobs, including `runCancellationExpiration` (added once
 * `retentionEndsAt` existed as a persisted, authoritative field —
 * docs/saas/DECISIONS.md P7-D3 Part D).
 */
describe('Phase 7 — Subscription Scheduler (real Postgres, real FakeBillingProvider)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let scheduler: SubscriptionSchedulerService;
  let billingProvider: FakeBillingProvider;

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
    status: 'ACTIVE' | 'PAST_DUE' | 'CANCELLED' = 'ACTIVE',
    extra: {
      graceEndsAt?: Date;
      pendingPlanId?: string;
      cancelAtPeriodEnd?: boolean;
      retentionEndsAt?: Date;
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
      // Phase 7 — Wave A: applying a scheduled downgrade must NOT also
      // write a plain-renewal event alongside it — the two paths are
      // mutually exclusive within one reconciliation pass.
      const renewalEvents = await prisma.subscriptionEvent.findMany({
        where: { subscriptionId: subscription.id, type: 'activated' },
      });
      expect(renewalEvents).toHaveLength(0);
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
      // Phase 7 — Wave A: applying a scheduled cancellation must NOT also
      // write a plain-renewal event.
      const renewalEvents = await prisma.subscriptionEvent.findMany({
        where: { subscriptionId: subscription.id, type: 'activated' },
      });
      expect(renewalEvents).toHaveLength(0);
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

    // ─── Plain period renewal (Phase 7 — Wave A) ───────────────────────

    /**
     * Makes a subscription eligible for `findSubscriptionsNeedingPeriodReconciliation`'s
     * own local pre-filter (`currentPeriodEnd <= now`) — same technique the
     * pre-existing downgrade/cancellation tests above already use — WITHOUT
     * touching the FAKE PROVIDER's own record, so `getSubscription()` still
     * returns whatever period `advancePeriod` (called separately) produced
     * there. The local row and the provider's own record are intentionally
     * two independent stores here, exactly like a real stale-local-record
     * scenario.
     */
    async function backdateLocalPeriod(subscriptionId: string): Promise<void> {
      await prisma.subscription.update({
        where: { id: subscriptionId },
        data: {
          currentPeriodStart: new Date(Date.now() - 60 * 24 * 60 * 60_000),
          currentPeriodEnd: new Date(Date.now() - 30 * 24 * 60 * 60_000),
        },
      });
    }

    it('a plain renewal (nothing scheduled) advances the local period to the provider-confirmed boundaries and writes an activated/renewal event', async () => {
      const { subscription } = await makeRegisteredSubscription('ACTIVE');
      // Advances the FAKE PROVIDER's own record forward, then backdates the
      // LOCAL row — the real-world condition this job exists to detect:
      // the provider has moved on, the local record has not caught up.
      const advanced = billingProvider.advancePeriod(
        subscription.providerSubscriptionId!,
      );
      await backdateLocalPeriod(subscription.id);

      await scheduler.runPeriodReconciliation();

      const updated = await prisma.subscription.findUniqueOrThrow({
        where: { id: subscription.id },
      });
      expect(updated.currentPeriodStart?.getTime()).toBe(
        advanced.currentPeriodStart.getTime(),
      );
      expect(updated.currentPeriodEnd?.getTime()).toBe(
        advanced.currentPeriodEnd.getTime(),
      );
      // Never touched: status, planId, cancelAtPeriodEnd, pendingPlanId.
      expect(updated.status).toBe('ACTIVE');
      expect(updated.planId).toBe(subscription.planId);
      expect(updated.cancelAtPeriodEnd).toBeFalsy();
      expect(updated.pendingPlanId).toBeNull();

      const events = await prisma.subscriptionEvent.findMany({
        where: { subscriptionId: subscription.id, type: 'activated' },
      });
      expect(events).toHaveLength(1);
      expect(events[0].fromStatus).toBe('ACTIVE');
      expect(events[0].toStatus).toBe('ACTIVE');
      expect(events[0].metadata).toMatchObject({ renewal: true });
    });

    it('repeated reconciliation of the same renewed period is idempotent — a second run writes no duplicate renewal event', async () => {
      const { subscription } = await makeRegisteredSubscription('ACTIVE');
      billingProvider.advancePeriod(subscription.providerSubscriptionId!);
      await backdateLocalPeriod(subscription.id);

      await scheduler.runPeriodReconciliation();
      await scheduler.runPeriodReconciliation();

      const events = await prisma.subscriptionEvent.findMany({
        where: { subscriptionId: subscription.id, type: 'activated' },
      });
      expect(events).toHaveLength(1);
    });

    it('two concurrent reconciliation attempts for the same subscription do not double-renew the period', async () => {
      const { subscription } = await makeRegisteredSubscription('ACTIVE');
      billingProvider.advancePeriod(subscription.providerSubscriptionId!);
      await backdateLocalPeriod(subscription.id);

      await Promise.all([
        scheduler.runPeriodReconciliation(),
        scheduler.runPeriodReconciliation(),
      ]);

      const events = await prisma.subscriptionEvent.findMany({
        where: { subscriptionId: subscription.id, type: 'activated' },
      });
      expect(events).toHaveLength(1);
    });

    it('tenant isolation: a plain renewal for one tenant never touches another tenant’s subscription', async () => {
      const { subscription: dueSub } =
        await makeRegisteredSubscription('ACTIVE');
      const advanced = billingProvider.advancePeriod(
        dueSub.providerSubscriptionId!,
      );
      await backdateLocalPeriod(dueSub.id);
      const { subscription: untouchedSub } =
        await makeRegisteredSubscription('ACTIVE'); // own period still current, not due

      await scheduler.runPeriodReconciliation();

      const dueRow = await prisma.subscription.findUniqueOrThrow({
        where: { id: dueSub.id },
      });
      expect(dueRow.currentPeriodStart?.getTime()).toBe(
        advanced.currentPeriodStart.getTime(),
      );
      const untouchedRow = await prisma.subscription.findUniqueOrThrow({
        where: { id: untouchedSub.id },
      });
      expect(untouchedRow.currentPeriodStart?.getTime()).toBe(
        untouchedSub.currentPeriodStart?.getTime(),
      );
      const untouchedEvents = await prisma.subscriptionEvent.findMany({
        where: { subscriptionId: untouchedSub.id },
      });
      expect(untouchedEvents).toHaveLength(0);
    });
  });

  // ─── Cancellation expiration (Cancellation Retention + Unscheduling wave, P7-D3 Part D) ──

  describe('runCancellationExpiration', () => {
    it('CANCELLED with an elapsed retentionEndsAt transitions to EXPIRED and writes an expired event', async () => {
      const { subscription } = await makeRegisteredSubscription('CANCELLED', {
        retentionEndsAt: new Date(Date.now() - 60_000),
      });

      await scheduler.runCancellationExpiration();

      const updated = await prisma.subscription.findUniqueOrThrow({
        where: { id: subscription.id },
      });
      expect(updated.status).toBe('EXPIRED');
      const events = await prisma.subscriptionEvent.findMany({
        where: { subscriptionId: subscription.id, type: 'expired' },
      });
      expect(events).toHaveLength(1);
    });

    it('CANCELLED with a future retentionEndsAt is left untouched', async () => {
      const { subscription } = await makeRegisteredSubscription('CANCELLED', {
        retentionEndsAt: new Date(Date.now() + 60 * 60_000),
      });

      await scheduler.runCancellationExpiration();

      const unchanged = await prisma.subscription.findUniqueOrThrow({
        where: { id: subscription.id },
      });
      expect(unchanged.status).toBe('CANCELLED');
    });

    it('processes multiple eligible subscriptions across different tenants in one run, each independently', async () => {
      const { subscription: a } = await makeRegisteredSubscription(
        'CANCELLED',
        { retentionEndsAt: new Date(Date.now() - 60_000) },
      );
      const { subscription: b } = await makeRegisteredSubscription(
        'CANCELLED',
        { retentionEndsAt: new Date(Date.now() - 60_000) },
      );

      await scheduler.runCancellationExpiration();

      const rowA = await prisma.subscription.findUniqueOrThrow({
        where: { id: a.id },
      });
      const rowB = await prisma.subscription.findUniqueOrThrow({
        where: { id: b.id },
      });
      expect(rowA.status).toBe('EXPIRED');
      expect(rowB.status).toBe('EXPIRED');
      expect(rowA.tenantId).not.toBe(rowB.tenantId);
    });

    it('repeated execution is idempotent — a second run writes no duplicate event and does not reprocess an already-expired subscription', async () => {
      const { subscription } = await makeRegisteredSubscription('CANCELLED', {
        retentionEndsAt: new Date(Date.now() - 60_000),
      });

      await scheduler.runCancellationExpiration();
      await scheduler.runCancellationExpiration();

      const events = await prisma.subscriptionEvent.findMany({
        where: { subscriptionId: subscription.id, type: 'expired' },
      });
      expect(events).toHaveLength(1);
      const row = await prisma.subscription.findUniqueOrThrow({
        where: { id: subscription.id },
      });
      expect(row.status).toBe('EXPIRED');
    });

    it('does not delete any tenant/store/order/user data', async () => {
      const { subscription, tenant } = await makeRegisteredSubscription(
        'CANCELLED',
        { retentionEndsAt: new Date(Date.now() - 60_000) },
      );
      const category = await prisma.category.create({
        data: {
          tenantId: tenant.id,
          name: 'Still here after expiration',
          slug: `still-here-${randomUUID()}`,
        },
      });

      await scheduler.runCancellationExpiration();

      const updated = await prisma.subscription.findUniqueOrThrow({
        where: { id: subscription.id },
      });
      expect(updated.status).toBe('EXPIRED');
      const stillThere = await prisma.category.findUnique({
        where: { id: category.id },
      });
      expect(stillThere).not.toBeNull();
      const tenantStillThere = await prisma.tenant.findUnique({
        where: { id: tenant.id },
      });
      expect(tenantStillThere).not.toBeNull();
    });
  });

  // ─── Cancellation lifecycle — retentionEndsAt establishment (P7-D3 Part D) ──

  describe('cancellation lifecycle — retentionEndsAt establishment', () => {
    it('scheduled cancellation applied at the confirmed boundary establishes retentionEndsAt only at that moment, not at scheduling time', async () => {
      const { subscription } = await makeRegisteredSubscription('ACTIVE', {
        cancelAtPeriodEnd: true,
      });
      // Confirm the invariant BEFORE the boundary is reached: nothing has
      // been established yet.
      const beforeBoundary = await prisma.subscription.findUniqueOrThrow({
        where: { id: subscription.id },
      });
      expect(beforeBoundary.retentionEndsAt).toBeNull();

      // Simulate "the provider's period has already moved past our stale
      // local record" — the same technique the period-reconciliation
      // tests above already use.
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          currentPeriodStart: new Date(Date.now() - 60 * 24 * 60 * 60_000),
          currentPeriodEnd: new Date(Date.now() - 30 * 24 * 60 * 60_000),
        },
      });

      await scheduler.runPeriodReconciliation();

      const afterBoundary = await prisma.subscription.findUniqueOrThrow({
        where: { id: subscription.id },
      });
      expect(afterBoundary.status).toBe('CANCELLED');
      expect(afterBoundary.retentionEndsAt).not.toBeNull();
      const expectedMs = Date.now() + 30 * 24 * 60 * 60 * 1000;
      expect(
        Math.abs(afterBoundary.retentionEndsAt!.getTime() - expectedMs),
      ).toBeLessThan(10_000);
    });
  });
});
