import { randomUUID } from 'crypto';
import { INestApplication } from '@nestjs/common';
import { resetDatabase } from './support/db';
import { createTestApp } from './support/test-app';
import {
  addCartItem,
  apiPath,
  authHeader,
  createCoupon,
  createProduct,
  http,
  registerAdmin,
  registerUser,
  shippingFields,
} from './support/fixtures';
import { PrismaService } from '../../src/common/database/prisma.service';

/**
 * §27 #3, #13, #14 — three distinct order-creation race scenarios, each
 * exercising a different mechanism:
 *   #3/#13 — same Idempotency-Key, concurrent/double-clicked: the
 *     idempotency_keys unique-constraint claim (INSERT...ON CONFLICT) is
 *     what serializes these.
 *   #14 — different Idempotency-Keys, same cart, concurrent ("two tabs"):
 *     the idempotency claim does NOT dedupe this (different keys never
 *     conflict) — it's the `SELECT cart FOR UPDATE` row lock
 *     (checkout.service.ts) that must serialize it instead. This is the
 *     row-lock the blueprint's §13.G transaction boundary specifies as the
 *     *first* step; it was missing before this phase's fix (see the
 *     completion report) — this test is what caught it.
 *
 * Every "concurrent" case fires both requests via Promise.all against the
 * same running app/connection pool — genuinely concurrent, not sequential.
 */
describe('Checkout order-creation races (§27 #3, #13, #14)', () => {
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

  it('#3 — two genuinely concurrent POST /checkout/orders with the same Idempotency-Key produce exactly one order', async () => {
    const user = await registerUser(app);
    const { productId } = await createProduct(prisma, { basePrice: '75.00' });
    await addCartItem(app, user, { productId, quantity: 1 });

    const idempotencyKey = `same-key-concurrent-${randomUUID()}`;
    const fire = () =>
      http(app)
        .post(apiPath('/checkout/orders'))
        .set(...authHeader(user))
        .set('Idempotency-Key', idempotencyKey)
        .send(shippingFields());

    const [resA, resB] = await Promise.all([fire(), fire()]);

    expect([resA.status, resB.status].sort()).toEqual([200, 201]);

    const orders = await prisma.order.findMany({ where: { userId: user.id } });
    expect(orders).toHaveLength(1);
  });

  it('#13 — a double-clicked checkout (same Idempotency-Key sent twice) produces exactly one order and returns the same order both times', async () => {
    const user = await registerUser(app);
    const { productId } = await createProduct(prisma, { basePrice: '42.00' });
    await addCartItem(app, user, { productId, quantity: 3 });

    const idempotencyKey = `double-click-${randomUUID()}`;
    const fire = () =>
      http(app)
        .post(apiPath('/checkout/orders'))
        .set(...authHeader(user))
        .set('Idempotency-Key', idempotencyKey)
        .send(shippingFields());

    const [resA, resB] = await Promise.all([fire(), fire()]);

    const orders = await prisma.order.findMany({ where: { userId: user.id } });
    expect(orders).toHaveLength(1);

    // Same order id and same total in both responses — the replay returns
    // the original result, not a fresh computation.
    expect(resA.body.data.id).toBe(resB.body.data.id);
    expect(resA.body.data.orderNumber).toBe(resB.body.data.orderNumber);
    expect(resA.body.data.total).toBe(resB.body.data.total);
    expect(resA.body.data.total).toBe('126.00');
  });

  it('#14 — two simultaneous checkout tabs on the same cart, different Idempotency-Keys, produce exactly one order via the cart row lock', async () => {
    const user = await registerUser(app);
    const { productId } = await createProduct(prisma, { basePrice: '60.00' });
    await addCartItem(app, user, { productId, quantity: 2 });

    const fire = (key: string) =>
      http(app)
        .post(apiPath('/checkout/orders'))
        .set(...authHeader(user))
        .set('Idempotency-Key', key)
        .send(shippingFields());

    const [resA, resB] = await Promise.all([
      fire(`tab-a-${randomUUID()}`),
      fire(`tab-b-${randomUUID()}`),
    ]);

    // Different Idempotency-Keys mean the idempotency claim cannot be what
    // dedupes this — if it's still exactly one order, the cart row lock is
    // what did it. Exactly one request should succeed; the other loses the
    // lock race and finds the cart already emptied ("Your cart is empty").
    const statuses = [resA.status, resB.status].sort((a, b) => a - b);
    expect(statuses).toEqual([201, 400]);

    const orders = await prisma.order.findMany({ where: { userId: user.id } });
    expect(orders).toHaveLength(1);
    expect(orders[0].total.toFixed(2)).toBe('120.00');

    const winner = resA.status === 201 ? resA : resB;
    const loser = resA.status === 201 ? resB : resA;
    expect(winner.body.data.id).toBe(orders[0].id);
    expect(loser.body.error.message).toMatch(/cart is empty/i);
  });

  it('#3 — a coupon with usageLimitTotal: 1, claimed by genuinely concurrent checkouts from different users, is granted to exactly one', async () => {
    const admin = await registerAdmin(app, prisma);
    const coupon = await createCoupon(prisma, admin.id, {
      percentageOff: 10,
      usageLimitTotal: 1,
    });
    const { productId } = await createProduct(prisma, { basePrice: '50.00' });

    const raceSize = 5;
    const users = await Promise.all(
      Array.from({ length: raceSize }, () => registerUser(app, 'racer')),
    );
    await Promise.all(
      users.map((user) => addCartItem(app, user, { productId, quantity: 1 })),
    );

    const fire = (user: (typeof users)[number]) =>
      http(app)
        .post(apiPath('/checkout/orders'))
        .set(...authHeader(user))
        .set('Idempotency-Key', `coupon-race-${user.id}`)
        .send({ ...shippingFields(), couponCode: coupon.code });

    const results = await Promise.all(users.map((user) => fire(user)));

    const succeeded = results.filter((r) => r.status === 201);
    const conflicted = results.filter((r) => r.status === 409);
    expect(succeeded).toHaveLength(1);
    expect(conflicted).toHaveLength(raceSize - 1);
    conflicted.forEach((r) => {
      expect(r.body.error.message).toMatch(/usage limit/i);
    });

    const persistedCoupon = await prisma.coupon.findUniqueOrThrow({
      where: { id: coupon.id },
    });
    expect(persistedCoupon.usedCount).toBe(1);

    const usages = await prisma.couponUsage.findMany({
      where: { couponId: coupon.id },
    });
    expect(usages).toHaveLength(1);
    expect(usages[0].orderId).toBe(succeeded[0].body.data.id);

    const orders = await prisma.order.findMany({
      where: { couponCode: coupon.code },
    });
    expect(orders).toHaveLength(1);

    // Every losing user's cart still has its item — the transaction rolled
    // back cleanly, nothing silently lost. The winner's cart was emptied by
    // the successful checkout, same as any ordinary order.
    const winnerUserId = orders[0].userId;
    for (const user of users) {
      const cartItems = await prisma.cartItem.findMany({
        where: { cart: { userId: user.id } },
      });
      expect(cartItems).toHaveLength(user.id === winnerUserId ? 0 : 1);
    }
  });

  it('#14 — the cart is left with its items intact for the losing tab to retry from (nothing silently lost)', async () => {
    // Sanity companion to the race test above: a genuinely sequential
    // double-checkout (cart re-filled between attempts) still works, so
    // the fix only serializes concurrent access — it doesn't break the
    // ordinary "cart emptied by checkout" flow.
    const user = await registerUser(app);
    const { productId } = await createProduct(prisma, { basePrice: '10.00' });
    await addCartItem(app, user, { productId, quantity: 1 });

    await http(app)
      .post(apiPath('/checkout/orders'))
      .set(...authHeader(user))
      .set('Idempotency-Key', `sequential-first-${randomUUID()}`)
      .send(shippingFields())
      .expect(201);

    await addCartItem(app, user, { productId, quantity: 1 });

    await http(app)
      .post(apiPath('/checkout/orders'))
      .set(...authHeader(user))
      .set('Idempotency-Key', `sequential-second-${randomUUID()}`)
      .send(shippingFields())
      .expect(201);

    const orders = await prisma.order.findMany({ where: { userId: user.id } });
    expect(orders).toHaveLength(2);
  });
});
