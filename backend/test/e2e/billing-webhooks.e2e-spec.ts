import { randomUUID } from 'crypto';
import { INestApplication } from '@nestjs/common';
import { resetDatabase } from './support/db';
import { createTestApp } from './support/test-app';
import { apiPath, http } from './support/fixtures';
import { PrismaService } from '../../src/common/database/prisma.service';
import { BillingWebhookProcessor } from '../../src/subscriptions/billing-webhook-processor.service';
import { BILLING_PROVIDER } from '../../src/subscriptions/billing-provider.token';
import { FakeBillingProvider } from '../../src/subscriptions/fake-billing-provider';
import { seedFreePlanCatalogue } from '../../prisma/free-plan-catalogue';

/**
 * Phase 7 — D7 SaaS Billing Webhooks wave (docs/saas/DECISIONS.md P7-D3).
 * Real Postgres, real `FakeBillingProvider` singleton (never a fabricated
 * `providerSubscriptionId` string — same lesson `subscription-operations
 * .e2e-spec.ts`'s own fixture already learned), real HTTP ingestion route,
 * real `BillingWebhookProcessor` poller (invoked directly — the standard
 * way to test a `@nestjs/schedule` job without waiting on a real timer,
 * same convention `subscription-scheduler.e2e-spec.ts` already
 * establishes).
 *
 * `FakeBillingProvider.verifyWebhook()` unconditionally accepts any
 * non-empty signature (P7-D1 Part H: "no real signature verification is
 * implemented anywhere") — so "the PROVIDER rejects an invalid signature"
 * is proven at the unit level against a mocked `BillingProvider`
 * (`billing-webhook-ingestion.service.spec.ts`), not here. What this file
 * proves at the HTTP boundary instead is the still-real, still-enforced
 * "no signature header at all -> 400, zero DB rows" guard the controller
 * itself applies before ever calling into `BillingProvider`.
 */
describe('Phase 7 — D7 SaaS Billing Webhooks (real Postgres, real FakeBillingProvider, real HTTP)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let processor: BillingWebhookProcessor;
  let billingProvider: FakeBillingProvider;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    processor = app.get(BillingWebhookProcessor);
    billingProvider = app.get(BILLING_PROVIDER);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  async function makeTenantAndPlan() {
    const tenant = await prisma.tenant.create({
      data: { slug: `bwh-${randomUUID()}` },
    });
    const plan = await prisma.plan.create({
      data: {
        key: `bwh-plan-${randomUUID()}`,
        name: 'Billing Webhook Test Plan',
        isActive: true,
        sortOrder: 0,
        isEnterpriseCustom: false,
      },
    });
    await seedFreePlanCatalogue(prisma, plan.id);
    return { tenant, plan };
  }

  /** A real, provider-registered subscription — via the app's real
   * FakeBillingProvider singleton. */
  async function makeRegisteredSubscription(
    status: 'ACTIVE' | 'EXPIRED' = 'ACTIVE',
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
      },
    });
    return { tenant, plan, subscription, providerSub, customer };
  }

  function eventBody(opts: {
    type: string;
    providerSubscriptionId?: string;
    providerCustomerId?: string;
    providerEventId?: string;
    occurredAt?: Date;
    currentPeriodStart?: Date;
    currentPeriodEnd?: Date;
  }): Record<string, unknown> {
    const bytes = billingProvider.buildWebhookEventBody(opts);
    return JSON.parse(bytes.toString('utf8')) as Record<string, unknown>;
  }

  /**
   * P7-D3 Part F's own comparison is `eventTimestamp <= subscription.
   * updatedAt` (deliberately non-strict — see billing-webhook-processor
   * .service.ts's own comment) — a subscription's `updatedAt` is set at
   * creation and an event built with the DEFAULT `occurredAt` (`new
   * Date()`) can land in the SAME millisecond in a fast test run, which
   * the `<=` rule then (correctly, per spec) treats as stale. Every test
   * below that expects an event to actually APPLY passes an explicit,
   * unambiguously-future `occurredAt` instead of relying on wall-clock
   * ordering at millisecond granularity.
   */
  function future(ms = 60_000): Date {
    return new Date(Date.now() + ms);
  }

  function postWebhook(body: Record<string, unknown>, signature = 'sig-1') {
    const req = http(app)
      .post(apiPath('/webhooks/billing'))
      .set('Content-Type', 'application/json');
    if (signature) {
      req.set('x-razorpay-signature', signature);
    }
    return req.send(body);
  }

  // ─── Ingestion (Phase 1) ────────────────────────────────────────────────

  describe('ingestion', () => {
    it('a valid event reaches the database as a RECEIVED row', async () => {
      const { subscription } = await makeRegisteredSubscription();
      const body = eventBody({
        type: 'payment_failed',
        providerSubscriptionId: subscription.providerSubscriptionId!,
      });

      await postWebhook(body).expect(200);

      const rows = await prisma.billingWebhookEvent.findMany({
        where: { providerEventId: body.providerEventId as string },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0].status).toBe('RECEIVED');
    });

    it('missing signature header produces 400 and zero DB rows', async () => {
      const { subscription } = await makeRegisteredSubscription();
      const body = eventBody({
        type: 'payment_failed',
        providerSubscriptionId: subscription.providerSubscriptionId!,
      });

      await postWebhook(body, '').expect(400);

      const rows = await prisma.billingWebhookEvent.findMany({
        where: { providerEventId: body.providerEventId as string },
      });
      expect(rows).toHaveLength(0);
    });

    it('duplicate delivery (identical providerEventId) is deduplicated at the database level — exactly one row', async () => {
      const { subscription } = await makeRegisteredSubscription();
      const body = eventBody({
        type: 'cancelled',
        providerSubscriptionId: subscription.providerSubscriptionId!,
        providerEventId: `evt-dup-${randomUUID()}`,
      });

      await postWebhook(body).expect(200);
      await postWebhook(body).expect(200); // exact redelivery, Razorpay-style at-least-once

      const rows = await prisma.billingWebhookEvent.findMany({
        where: { providerEventId: body.providerEventId as string },
      });
      expect(rows).toHaveLength(1);
    });
  });

  // ─── Processing (Phase 2) ───────────────────────────────────────────────

  describe('processing', () => {
    it('a payment_failed event moves ACTIVE -> PAST_DUE and writes exactly one payment_failed SubscriptionEvent', async () => {
      const { subscription } = await makeRegisteredSubscription('ACTIVE');
      const body = eventBody({
        type: 'payment_failed',
        providerSubscriptionId: subscription.providerSubscriptionId!,
        occurredAt: future(),
      });
      await postWebhook(body).expect(200);

      await processor.processReceivedBillingWebhooks();

      const updated = await prisma.subscription.findUniqueOrThrow({
        where: { id: subscription.id },
      });
      expect(updated.status).toBe('PAST_DUE');
      expect(updated.graceEndsAt).toBeInstanceOf(Date);
      const events = await prisma.subscriptionEvent.findMany({
        where: { subscriptionId: subscription.id, type: 'payment_failed' },
      });
      expect(events).toHaveLength(1);
      const row = await prisma.billingWebhookEvent.findUniqueOrThrow({
        where: { providerEventId: body.providerEventId as string },
      });
      expect(row.status).toBe('PROCESSED');
    });

    it('resolves via providerCustomerId when the event carries no providerSubscriptionId', async () => {
      const { subscription, customer } =
        await makeRegisteredSubscription('ACTIVE');
      const body = eventBody({
        type: 'payment_failed',
        providerCustomerId: customer.providerCustomerId,
        occurredAt: future(),
      });
      await postWebhook(body).expect(200);

      await processor.processReceivedBillingWebhooks();

      const updated = await prisma.subscription.findUniqueOrThrow({
        where: { id: subscription.id },
      });
      expect(updated.status).toBe('PAST_DUE');
    });

    it('an event for an unrecognized providerSubscriptionId is marked IGNORED and touches no subscription', async () => {
      const body = eventBody({
        type: 'cancelled',
        providerSubscriptionId: 'fake-sub-does-not-exist',
      });
      await postWebhook(body).expect(200);

      await processor.processReceivedBillingWebhooks();

      const row = await prisma.billingWebhookEvent.findUniqueOrThrow({
        where: { providerEventId: body.providerEventId as string },
      });
      expect(row.status).toBe('IGNORED');
      expect(row.lastError).toMatch(/no matching local subscription/);
    });

    it('duplicate delivery is processed exactly once — one SubscriptionEvent, not two', async () => {
      const { subscription } = await makeRegisteredSubscription('ACTIVE');
      const body = eventBody({
        type: 'payment_failed',
        providerSubscriptionId: subscription.providerSubscriptionId!,
        providerEventId: `evt-dup-proc-${randomUUID()}`,
        occurredAt: future(),
      });
      await postWebhook(body).expect(200);
      await postWebhook(body).expect(200);

      await processor.processReceivedBillingWebhooks();

      const events = await prisma.subscriptionEvent.findMany({
        where: { subscriptionId: subscription.id, type: 'payment_failed' },
      });
      expect(events).toHaveLength(1);
    });

    it('a stale event (occurredAt <= Subscription.updatedAt) is IGNORED — state is never regressed', async () => {
      const { subscription } = await makeRegisteredSubscription('ACTIVE');
      // Advance the subscription's own updatedAt first (a real transition).
      const firstEvent = eventBody({
        type: 'payment_failed',
        providerSubscriptionId: subscription.providerSubscriptionId!,
        occurredAt: future(),
      });
      await postWebhook(firstEvent).expect(200);
      await processor.processReceivedBillingWebhooks();
      const afterFirst = await prisma.subscription.findUniqueOrThrow({
        where: { id: subscription.id },
      });
      expect(afterFirst.status).toBe('PAST_DUE');

      // A second, stale event timestamped BEFORE the subscription's own
      // updatedAt — must not regress it back toward ACTIVE.
      const staleEvent = eventBody({
        type: 'recovered',
        providerSubscriptionId: subscription.providerSubscriptionId!,
        occurredAt: new Date(afterFirst.updatedAt!.getTime() - 60_000),
      });
      await postWebhook(staleEvent).expect(200);
      await processor.processReceivedBillingWebhooks();

      const finalRow = await prisma.subscription.findUniqueOrThrow({
        where: { id: subscription.id },
      });
      expect(finalRow.status).toBe('PAST_DUE'); // unchanged, not regressed to ACTIVE
      const row = await prisma.billingWebhookEvent.findUniqueOrThrow({
        where: { providerEventId: staleEvent.providerEventId as string },
      });
      expect(row.status).toBe('IGNORED');
      expect(row.lastError).toMatch(/stale/);
    });

    it('concurrent processing ticks never double-apply the same row', async () => {
      const { subscription } = await makeRegisteredSubscription('ACTIVE');
      const body = eventBody({
        type: 'payment_failed',
        providerSubscriptionId: subscription.providerSubscriptionId!,
        occurredAt: future(),
      });
      await postWebhook(body).expect(200);

      await Promise.all([
        processor.processReceivedBillingWebhooks(),
        processor.processReceivedBillingWebhooks(),
      ]);

      const events = await prisma.subscriptionEvent.findMany({
        where: { subscriptionId: subscription.id, type: 'payment_failed' },
      });
      expect(events).toHaveLength(1);
    });

    it('cross-tenant isolation — an event for tenant A never touches tenant B, even with the same event type in flight', async () => {
      const { subscription: subA } = await makeRegisteredSubscription('ACTIVE');
      const { subscription: subB } = await makeRegisteredSubscription('ACTIVE');
      const bodyA = eventBody({
        type: 'payment_failed',
        providerSubscriptionId: subA.providerSubscriptionId!,
        occurredAt: future(),
      });
      await postWebhook(bodyA).expect(200);

      await processor.processReceivedBillingWebhooks();

      const updatedA = await prisma.subscription.findUniqueOrThrow({
        where: { id: subA.id },
      });
      const updatedB = await prisma.subscription.findUniqueOrThrow({
        where: { id: subB.id },
      });
      expect(updatedA.status).toBe('PAST_DUE');
      expect(updatedB.status).toBe('ACTIVE'); // untouched
    });

    it('an illegal transition (EXPIRED subscription, cancelled event) is non-retryable — immediate FAILED, no state change', async () => {
      const { subscription } = await makeRegisteredSubscription('EXPIRED');
      const body = eventBody({
        type: 'cancelled',
        providerSubscriptionId: subscription.providerSubscriptionId!,
        occurredAt: future(),
      });
      await postWebhook(body).expect(200);

      await processor.processReceivedBillingWebhooks();

      const row = await prisma.billingWebhookEvent.findUniqueOrThrow({
        where: { providerEventId: body.providerEventId as string },
      });
      expect(row.status).toBe('FAILED');
      expect(row.attempts).toBe(1);
      const unchanged = await prisma.subscription.findUniqueOrThrow({
        where: { id: subscription.id },
      });
      expect(unchanged.status).toBe('EXPIRED');
    });

    it('no data deletion occurs anywhere in ingestion or processing — row counts only ever grow', async () => {
      const { subscription } = await makeRegisteredSubscription('ACTIVE');
      const beforeSubs = await prisma.subscription.count();
      const beforeEvents = await prisma.subscriptionEvent.count();
      const body = eventBody({
        type: 'payment_failed',
        providerSubscriptionId: subscription.providerSubscriptionId!,
        occurredAt: future(),
      });
      await postWebhook(body).expect(200);

      await processor.processReceivedBillingWebhooks();

      expect(await prisma.subscription.count()).toBe(beforeSubs);
      expect(await prisma.subscriptionEvent.count()).toBeGreaterThan(
        beforeEvents,
      );
      expect(await prisma.billingWebhookEvent.count()).toBe(1);
    });
  });

  // ─── Plain period renewal (Phase 7 — Wave A) ─────────────────────────────

  describe('plain period renewal (canonical "renewed" webhook event)', () => {
    it('a canonical renewed event with both period boundaries refreshes currentPeriodStart/End and writes an activated/renewal event', async () => {
      const { subscription } = await makeRegisteredSubscription('ACTIVE');
      const newStart = future(60_000);
      const newEnd = future(30 * 24 * 60 * 60_000);
      const body = eventBody({
        type: 'renewed',
        providerSubscriptionId: subscription.providerSubscriptionId!,
        occurredAt: future(),
        currentPeriodStart: newStart,
        currentPeriodEnd: newEnd,
      });

      await postWebhook(body).expect(200);
      await processor.processReceivedBillingWebhooks();

      const updated = await prisma.subscription.findUniqueOrThrow({
        where: { id: subscription.id },
      });
      expect(updated.currentPeriodStart?.getTime()).toBe(newStart.getTime());
      expect(updated.currentPeriodEnd?.getTime()).toBe(newEnd.getTime());
      expect(updated.status).toBe('ACTIVE'); // unchanged
      expect(updated.planId).toBe(subscription.planId); // unchanged

      const events = await prisma.subscriptionEvent.findMany({
        where: { subscriptionId: subscription.id, type: 'activated' },
      });
      expect(events).toHaveLength(1);
      expect(events[0].metadata).toMatchObject({ renewal: true });
      const row = await prisma.billingWebhookEvent.findUniqueOrThrow({
        where: { providerEventId: body.providerEventId as string },
      });
      expect(row.status).toBe('PROCESSED');
    });

    it('a stale renewal (occurredAt before the subscription was last updated) is IGNORED and cannot regress the period', async () => {
      const { subscription } = await makeRegisteredSubscription('ACTIVE');
      // Advance the subscription's own updatedAt first, via a real,
      // non-stale renewal.
      const firstStart = future(60_000);
      const firstEnd = future(30 * 24 * 60 * 60_000);
      await postWebhook(
        eventBody({
          type: 'renewed',
          providerSubscriptionId: subscription.providerSubscriptionId!,
          occurredAt: future(),
          currentPeriodStart: firstStart,
          currentPeriodEnd: firstEnd,
        }),
      ).expect(200);
      await processor.processReceivedBillingWebhooks();
      const afterFirst = await prisma.subscription.findUniqueOrThrow({
        where: { id: subscription.id },
      });
      expect(afterFirst.currentPeriodStart?.getTime()).toBe(
        firstStart.getTime(),
      );

      // A second, STALE renewal — timestamped before the subscription's
      // own updatedAt — carrying a DIFFERENT (earlier) period than what's
      // now stored. Must never regress currentPeriodStart/End backward.
      const staleStart = new Date(subscription.currentPeriodStart!);
      const staleEnd = new Date(subscription.currentPeriodEnd!);
      const staleBody = eventBody({
        type: 'renewed',
        providerSubscriptionId: subscription.providerSubscriptionId!,
        occurredAt: new Date(afterFirst.updatedAt!.getTime() - 60_000),
        currentPeriodStart: staleStart,
        currentPeriodEnd: staleEnd,
      });
      await postWebhook(staleBody).expect(200);
      await processor.processReceivedBillingWebhooks();

      const finalRow = await prisma.subscription.findUniqueOrThrow({
        where: { id: subscription.id },
      });
      expect(finalRow.currentPeriodStart?.getTime()).toBe(firstStart.getTime()); // unchanged, NOT regressed to staleStart
      const row = await prisma.billingWebhookEvent.findUniqueOrThrow({
        where: { providerEventId: staleBody.providerEventId as string },
      });
      expect(row.status).toBe('IGNORED');
      expect(row.lastError).toMatch(/stale/);
    });

    it('tenant isolation: a renewal event for tenant A never touches tenant B', async () => {
      const { subscription: subA } = await makeRegisteredSubscription('ACTIVE');
      const { subscription: subB } = await makeRegisteredSubscription('ACTIVE');
      const newStart = future(60_000);
      const newEnd = future(30 * 24 * 60 * 60_000);
      const body = eventBody({
        type: 'renewed',
        providerSubscriptionId: subA.providerSubscriptionId!,
        occurredAt: future(),
        currentPeriodStart: newStart,
        currentPeriodEnd: newEnd,
      });
      await postWebhook(body).expect(200);

      await processor.processReceivedBillingWebhooks();

      const updatedA = await prisma.subscription.findUniqueOrThrow({
        where: { id: subA.id },
      });
      const updatedB = await prisma.subscription.findUniqueOrThrow({
        where: { id: subB.id },
      });
      expect(updatedA.currentPeriodStart?.getTime()).toBe(newStart.getTime());
      expect(updatedB.currentPeriodStart?.getTime()).toBe(
        subB.currentPeriodStart?.getTime(),
      ); // untouched
      const eventsB = await prisma.subscriptionEvent.findMany({
        where: { subscriptionId: subB.id },
      });
      expect(eventsB).toHaveLength(0);
    });
  });
});
