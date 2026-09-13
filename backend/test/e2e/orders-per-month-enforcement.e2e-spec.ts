import { randomUUID } from 'crypto';
import { INestApplication } from '@nestjs/common';
import { resetDatabase } from './support/db';
import { createTestApp } from './support/test-app';
import {
  apiPath,
  authHeader,
  addCartItem,
  createProduct,
  http,
  registerUser,
  shippingFields,
  TestUser,
} from './support/fixtures';
import { PrismaService } from '../../src/common/database/prisma.service';
import { deriveBillingPeriodIdentifier } from '../../src/usage/usage-period';

/**
 * Phase 7 — Wave B (orders_per_month enforcement). Real Postgres, real
 * HTTP `POST /checkout/orders`, real `LimitEnforcementService`/
 * `UsageService`/`EntitlementService` — no guard or service is mocked.
 *
 * `POST /checkout/orders` is a STOREFRONT (customer, non-membership)
 * route: its tenant is resolved by `StorefrontTenantResolver`, whose own
 * fallback (no `StoreDomain` match) is "the most RECENTLY created Tenant
 * row" (see that class's own doc comment) — NOT "the sole tenant". Every
 * test below therefore creates its own tenant/store/plan/subscription
 * FIRST, then registers its user and adds to cart immediately after —
 * exactly the sequencing `test/e2e/support/db.ts`'s own `resetDatabase`
 * comment already documents ("a test that creates its OWN tenant(s)...
 * that tenant simply becomes the most-recently-created one from that
 * point on"). A cart's `tenantId` is fixed at cart-creation time and
 * never changes afterward, so once a user's cart exists it is safe for a
 * LATER test-local tenant to become "most recent" without affecting it.
 */
describe('Phase 7 — Wave B: orders_per_month enforcement (real Postgres, real checkout flow)', () => {
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

  async function makeTenantWithOrdersLimit(limit: number | null) {
    const tenant = await prisma.tenant.create({
      data: { slug: `opm-${randomUUID()}` },
    });
    await prisma.store.create({
      data: {
        tenantId: tenant.id,
        slug: `opm-store-${randomUUID()}`,
        name: 'OPM Test Store',
        status: 'ACTIVE',
        isPrimary: true,
      },
    });
    const plan = await prisma.plan.create({
      data: {
        key: `opm-plan-${randomUUID()}`,
        name: 'OPM Test Plan',
        isActive: true,
        sortOrder: 0,
        isEnterpriseCustom: false,
      },
    });
    await prisma.planLimit.create({
      data: {
        planId: plan.id,
        limitKey: 'orders_per_month',
        limitValue: limit,
        period: 'BILLING_PERIOD',
      },
    });
    return { tenant, plan };
  }

  async function attachSubscriptionWithPeriod(
    tenantId: string,
    planId: string,
    currentPeriodStart: Date | null,
    currentPeriodEnd: Date | null,
  ) {
    return prisma.subscription.create({
      data: {
        tenantId,
        planId,
        status: 'ACTIVE',
        currentPeriodStart,
        currentPeriodEnd,
      },
    });
  }

  /** Registers a fresh customer, gives them one cart item, for the
   * given (already-most-recent) tenant. */
  async function makeCheckoutReadyUser(tenantId: string): Promise<TestUser> {
    const { productId } = await createProduct(prisma, {
      tenantId,
      basePrice: '50.00',
    });
    const user = await registerUser(app, `opm-${randomUUID().slice(0, 8)}`);
    await addCartItem(app, user, { productId, quantity: 1 });
    return user;
  }

  function checkoutOnce(user: TestUser, idempotencyKey = randomUUID()) {
    return http(app)
      .post(apiPath('/checkout/orders'))
      .set(...authHeader(user))
      .set('Idempotency-Key', idempotencyKey)
      .send(shippingFields());
  }

  async function usageCount(tenantId: string, period: string) {
    const row = await prisma.usage.findUnique({
      where: {
        tenantId_limitKey_period: {
          tenantId,
          limitKey: 'orders_per_month',
          period,
        },
      },
    });
    return row?.count ?? 0;
  }

  const PERIOD_START = new Date('2026-02-01T00:00:00.000Z');
  const PERIOD_END = new Date('2026-03-01T00:00:00.000Z');
  const PERIOD = deriveBillingPeriodIdentifier(PERIOD_START);

  // ─── 1/8: basic reservation + exact period stamp ─────────────────────────

  it('1/8. a successful order increments orders_per_month usage by exactly 1, keyed on Subscription.currentPeriodStart.toISOString()', async () => {
    const { tenant, plan } = await makeTenantWithOrdersLimit(10);
    await attachSubscriptionWithPeriod(
      tenant.id,
      plan.id,
      PERIOD_START,
      PERIOD_END,
    );
    const user = await makeCheckoutReadyUser(tenant.id);

    const res = await checkoutOnce(user);
    expect(res.status).toBe(201);

    const order = await prisma.order.findUniqueOrThrow({
      where: { id: res.body.data.id as string },
    });
    expect(order.tenantId).toBe(tenant.id); // confirms tenant resolution assumption

    expect(await usageCount(tenant.id, PERIOD)).toBe(1);
    // Never calendar/timezone/createdAt-derived — the exact ISO string.
    const row = await prisma.usage.findUniqueOrThrow({
      where: {
        tenantId_limitKey_period: {
          tenantId: tenant.id,
          limitKey: 'orders_per_month',
          period: PERIOD,
        },
      },
    });
    expect(row.period).toBe(PERIOD_START.toISOString());
  });

  // ─── 2/3: exact limit boundary ────────────────────────────────────────────

  it('2/3. orders succeed up to the limit, then the next is rejected — no Order and no extra usage on the rejected attempt', async () => {
    const { tenant, plan } = await makeTenantWithOrdersLimit(2);
    await attachSubscriptionWithPeriod(
      tenant.id,
      plan.id,
      PERIOD_START,
      PERIOD_END,
    );
    const userA = await makeCheckoutReadyUser(tenant.id);
    const userB = await makeCheckoutReadyUser(tenant.id);
    const userC = await makeCheckoutReadyUser(tenant.id);

    await expect(checkoutOnce(userA)).resolves.toMatchObject({ status: 201 });
    await expect(checkoutOnce(userB)).resolves.toMatchObject({ status: 201 });
    expect(await usageCount(tenant.id, PERIOD)).toBe(2);

    const beforeOrderCount = await prisma.order.count({
      where: { tenantId: tenant.id },
    });
    const rejected = await checkoutOnce(userC);
    expect(rejected.status).toBe(403);
    expect(rejected.body.error.message).toBe('limit_exceeded');

    expect(await prisma.order.count({ where: { tenantId: tenant.id } })).toBe(
      beforeOrderCount,
    ); // no Order created
    expect(await usageCount(tenant.id, PERIOD)).toBe(2); // no extra usage consumed
    // The rejected user's cart is untouched (checkout never clears it on failure).
    const cart = await prisma.cart.findUnique({
      where: { userId: userC.id },
      include: { items: true },
    });
    expect(cart?.items).toHaveLength(1);
  });

  // ─── 4/5: renewal changes the period; old-period usage survives ─────────

  it('4/5. a renewal (new currentPeriodStart) uses a NEW Usage.period — old-period usage is untouched', async () => {
    const { tenant, plan } = await makeTenantWithOrdersLimit(10);
    const subscription = await attachSubscriptionWithPeriod(
      tenant.id,
      plan.id,
      PERIOD_START,
      PERIOD_END,
    );
    const userA = await makeCheckoutReadyUser(tenant.id);
    await expect(checkoutOnce(userA)).resolves.toMatchObject({ status: 201 });
    expect(await usageCount(tenant.id, PERIOD)).toBe(1);

    // Simulate a provider-confirmed renewal — the exact write site is
    // SubscriptionService.confirmRenewal (Phase 7 Wave A); a direct
    // Prisma update here is sufficient to prove Wave B's OWN period
    // derivation reacts correctly to it, without re-exercising Wave A's
    // own already-tested renewal machinery.
    const newStart = new Date('2026-03-01T00:00:00.000Z');
    const newEnd = new Date('2026-04-01T00:00:00.000Z');
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: { currentPeriodStart: newStart, currentPeriodEnd: newEnd },
    });
    const newPeriod = deriveBillingPeriodIdentifier(newStart);

    const userB = await makeCheckoutReadyUser(tenant.id);
    await expect(checkoutOnce(userB)).resolves.toMatchObject({ status: 201 });

    expect(await usageCount(tenant.id, PERIOD)).toBe(1); // old period untouched
    expect(await usageCount(tenant.id, newPeriod)).toBe(1); // new period, fresh count
  });

  // ─── 6: concurrency at the boundary ───────────────────────────────────────

  it('6. two concurrent order creations near the limit cannot both succeed when only one slot remains', async () => {
    const { tenant, plan } = await makeTenantWithOrdersLimit(1);
    await attachSubscriptionWithPeriod(
      tenant.id,
      plan.id,
      PERIOD_START,
      PERIOD_END,
    );
    const userA = await makeCheckoutReadyUser(tenant.id);
    const userB = await makeCheckoutReadyUser(tenant.id);

    const [resA, resB] = await Promise.all([
      checkoutOnce(userA),
      checkoutOnce(userB),
    ]);

    const statuses = [resA.status, resB.status].sort();
    expect(statuses).toEqual([201, 403]);
    expect(await prisma.order.count({ where: { tenantId: tenant.id } })).toBe(
      1,
    );
    expect(await usageCount(tenant.id, PERIOD)).toBe(1); // never oversubscribed
  });

  // ─── 7: tenant isolation ───────────────────────────────────────────────

  it('7. tenant A usage cannot affect tenant B — separate Usage rows, separate limits', async () => {
    // Tenant A: created first, and ALL of its users/carts are set up
    // while it is still "most recent" — including the exhausting SECOND
    // order attempt, deliberately made BEFORE tenant B ever exists, so
    // that user's cart resolution is unambiguous (see this file's own
    // header comment on `StorefrontTenantResolver`'s "most recently
    // created tenant" fallback).
    const { tenant: tenantA, plan: planA } = await makeTenantWithOrdersLimit(1);
    await attachSubscriptionWithPeriod(
      tenantA.id,
      planA.id,
      PERIOD_START,
      PERIOD_END,
    );
    const userA1 = await makeCheckoutReadyUser(tenantA.id);
    const userA2 = await makeCheckoutReadyUser(tenantA.id);
    await expect(checkoutOnce(userA1)).resolves.toMatchObject({
      status: 201,
    });
    expect(await usageCount(tenantA.id, PERIOD)).toBe(1);
    const rejectedA = await checkoutOnce(userA2);
    expect(rejectedA.status).toBe(403); // tenant A already exhausted

    // Tenant B: created afterward (now "most recent"), completely
    // independent limit/usage.
    const { tenant: tenantB, plan: planB } = await makeTenantWithOrdersLimit(5);
    await attachSubscriptionWithPeriod(
      tenantB.id,
      planB.id,
      PERIOD_START,
      PERIOD_END,
    );
    const userB = await makeCheckoutReadyUser(tenantB.id);
    await expect(checkoutOnce(userB)).resolves.toMatchObject({ status: 201 });

    expect(await usageCount(tenantA.id, PERIOD)).toBe(1); // unaffected by B
    expect(await usageCount(tenantB.id, PERIOD)).toBe(1); // unaffected by A's exhaustion
  });

  // ─── Fail-closed: no confirmed period yet ────────────────────────────────

  it('a subscription with no confirmed currentPeriodStart FAILS CLOSED — no Order, no Usage row for any period, real or invented', async () => {
    const { tenant, plan } = await makeTenantWithOrdersLimit(100); // generous — must not matter
    const subscription = await attachSubscriptionWithPeriod(
      tenant.id,
      plan.id,
      null,
      null,
    );
    const user = await makeCheckoutReadyUser(tenant.id);

    const res = await checkoutOnce(user);

    expect(res.status).toBe(503);
    expect(res.body.error.message).toBe('billing_period_unavailable');
    expect(await prisma.order.count({ where: { tenantId: tenant.id } })).toBe(
      0,
    );
    const rows = await prisma.usage.findMany({
      where: { tenantId: tenant.id, limitKey: 'orders_per_month' },
    });
    expect(rows).toHaveLength(0); // no fabricated period, no usage row at all
    // The cart is left completely intact — checkout never got far enough
    // to clear it.
    const cart = await prisma.cart.findUnique({
      where: { userId: user.id },
      include: { items: true },
    });
    expect(cart?.items).toHaveLength(1);

    // Once the SAME subscription receives a provider-confirmed period,
    // checkout succeeds subject to its effective limit, and the
    // persisted Usage.period is exactly currentPeriodStart.toISOString().
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: { currentPeriodStart: PERIOD_START, currentPeriodEnd: PERIOD_END },
    });
    const retryRes = await checkoutOnce(user);
    expect(retryRes.status).toBe(201);
    const row = await prisma.usage.findUniqueOrThrow({
      where: {
        tenantId_limitKey_period: {
          tenantId: tenant.id,
          limitKey: 'orders_per_month',
          period: PERIOD,
        },
      },
    });
    expect(row.period).toBe(PERIOD_START.toISOString());
    expect(row.count).toBe(1);
  });

  // ─── 11/12: subscription-state semantics (unchanged, reused as-is) ──────

  it('11. PAST_DUE uses the FULL assigned plan limit (existing entitlement semantics, unchanged by this wave)', async () => {
    const { tenant, plan } = await makeTenantWithOrdersLimit(5);
    await attachSubscriptionWithPeriod(
      tenant.id,
      plan.id,
      PERIOD_START,
      PERIOD_END,
    );
    await prisma.subscription.update({
      where: { tenantId: tenant.id },
      data: { status: 'PAST_DUE' },
    });
    const user = await makeCheckoutReadyUser(tenant.id);

    const res = await checkoutOnce(user);

    expect(res.status).toBe(201); // full plan access during PAST_DUE grace
    expect(await usageCount(tenant.id, PERIOD)).toBe(1);
  });

  it('12. PAUSED falls back to the platform "free" plan\'s own limit, never the tenant\'s own (unreachable) assigned plan', async () => {
    // Tenant's OWN plan is deliberately tiny (already exhausted) — if
    // fallback ever incorrectly used it instead of "free", the order
    // below would be rejected.
    const { tenant, plan } = await makeTenantWithOrdersLimit(0);
    await attachSubscriptionWithPeriod(
      tenant.id,
      plan.id,
      PERIOD_START,
      PERIOD_END,
    );
    await prisma.subscription.update({
      where: { tenantId: tenant.id },
      data: { status: 'PAUSED' },
    });
    // The real platform fallback plan (EntitlementService's own
    // hardcoded FALLBACK_PLAN_KEY = 'free') — no e2e fixture creates this
    // by default, so this test seeds it explicitly.
    const freePlan = await prisma.plan.upsert({
      where: { key: 'free' },
      create: {
        key: 'free',
        name: 'Free',
        isActive: true,
        sortOrder: 0,
        isEnterpriseCustom: false,
      },
      update: {},
    });
    await prisma.planLimit.upsert({
      where: {
        planId_limitKey: { planId: freePlan.id, limitKey: 'orders_per_month' },
      },
      create: {
        planId: freePlan.id,
        limitKey: 'orders_per_month',
        limitValue: 50,
        period: 'BILLING_PERIOD',
      },
      update: { limitValue: 50 },
    });
    const user = await makeCheckoutReadyUser(tenant.id);

    const res = await checkoutOnce(user);

    expect(res.status).toBe(201); // uses free plan's limit (50), not the tenant's own (0)
    expect(await usageCount(tenant.id, PERIOD)).toBe(1);
  });
});
