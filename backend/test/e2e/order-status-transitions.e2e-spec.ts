import { randomUUID } from 'crypto';
import { INestApplication } from '@nestjs/common';
import { resetDatabase } from './support/db';
import { createTestApp } from './support/test-app';
import {
  addCartItem,
  apiPath,
  authHeader,
  createProduct,
  http,
  registerAdmin,
  registerUser,
  shippingFields,
  TestUser,
} from './support/fixtures';
import { PrismaService } from '../../src/common/database/prisma.service';

/**
 * §27 #8 — order-status transition legality via PATCH /admin/orders/:id/status.
 * order-state-machine.ts's transition table is the source of truth (not
 * touched by this phase); these tests only exercise it through the real
 * HTTP/DB path — CAS update + history row + outbox event, all inside one
 * transaction (orders.service.ts's transitionOrderWithHistory).
 */
describe('Order-status transition legality (§27 #8)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: TestUser;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    admin = await registerAdmin(app, prisma);
  });

  async function createPendingOrder(): Promise<{
    orderId: string;
    customer: TestUser;
  }> {
    const customer = await registerUser(app, 'buyer');
    const { productId } = await createProduct(prisma, { basePrice: '99.00' });
    await addCartItem(app, customer, { productId, quantity: 1 });
    const checkoutRes = await http(app)
      .post(apiPath('/checkout/orders'))
      .set(...authHeader(customer))
      .set('Idempotency-Key', `status-fixture-${randomUUID()}`)
      .send(shippingFields())
      .expect(201);
    return { orderId: checkoutRes.body.data.id as string, customer };
  }

  it('an illegal order-status jump (PENDING_PAYMENT -> DELIVERED) is rejected with 409, and nothing changes', async () => {
    const { orderId } = await createPendingOrder();

    const res = await http(app)
      .patch(apiPath(`/admin/orders/${orderId}/status`))
      .set(...authHeader(admin))
      .send({ status: 'DELIVERED' })
      .expect(409);
    expect(res.body.success).toBe(false);

    const order = await prisma.order.findUniqueOrThrow({
      where: { id: orderId },
    });
    expect(order.status).toBe('PENDING_PAYMENT');

    // Only the checkout-time creation row (fromStatus: null) should exist —
    // no row for the rejected DELIVERED transition.
    const history = await prisma.orderStatusHistory.findMany({
      where: { orderId },
    });
    expect(history).toHaveLength(1);
    expect(history[0].toStatus).toBe('PENDING_PAYMENT');
    expect(history[0].fromStatus).toBeNull();

    const outbox = await prisma.outboxEvent.findMany({
      where: { aggregateId: orderId, eventType: 'ORDER_STATUS_CHANGED' },
    });
    expect(outbox).toHaveLength(0);
  });

  it('another illegal jump (PENDING_PAYMENT -> IN_PRODUCTION, skipping PAID/CONFIRMED) is also rejected with 409', async () => {
    const { orderId } = await createPendingOrder();

    await http(app)
      .patch(apiPath(`/admin/orders/${orderId}/status`))
      .set(...authHeader(admin))
      .send({ status: 'IN_PRODUCTION' })
      .expect(409);

    const order = await prisma.order.findUniqueOrThrow({
      where: { id: orderId },
    });
    expect(order.status).toBe('PENDING_PAYMENT');
  });

  it('re-applying an already-applied transition is idempotent: 200, no duplicate history row or outbox event', async () => {
    const { orderId } = await createPendingOrder();

    // PENDING_PAYMENT -> PAID is a legal transition.
    const firstRes = await http(app)
      .patch(apiPath(`/admin/orders/${orderId}/status`))
      .set(...authHeader(admin))
      .send({ status: 'PAID' })
      .expect(200);
    expect(firstRes.body.data.status).toBe('PAID');

    // Re-applying the SAME status (already PAID) must be a no-op success,
    // not a rejected transition and not a re-run of the side effects.
    const secondRes = await http(app)
      .patch(apiPath(`/admin/orders/${orderId}/status`))
      .set(...authHeader(admin))
      .send({ status: 'PAID' })
      .expect(200);
    expect(secondRes.body.data.status).toBe('PAID');

    const order = await prisma.order.findUniqueOrThrow({
      where: { id: orderId },
    });
    expect(order.status).toBe('PAID');

    const history = await prisma.orderStatusHistory.findMany({
      where: { orderId, toStatus: 'PAID' },
    });
    expect(history).toHaveLength(1);

    const outbox = await prisma.outboxEvent.findMany({
      where: {
        aggregateId: orderId,
        eventType: 'ORDER_STATUS_CHANGED',
        eventKey: `ORDER_STATUS_CHANGED:${orderId}:PAID`,
      },
    });
    expect(outbox).toHaveLength(1);
  });

  it('a legal multi-step chain (PAID -> CONFIRMED -> IN_PRODUCTION) each produces exactly one history row', async () => {
    const { orderId } = await createPendingOrder();

    await http(app)
      .patch(apiPath(`/admin/orders/${orderId}/status`))
      .set(...authHeader(admin))
      .send({ status: 'PAID' })
      .expect(200);
    await http(app)
      .patch(apiPath(`/admin/orders/${orderId}/status`))
      .set(...authHeader(admin))
      .send({ status: 'CONFIRMED' })
      .expect(200);
    await http(app)
      .patch(apiPath(`/admin/orders/${orderId}/status`))
      .set(...authHeader(admin))
      .send({ status: 'IN_PRODUCTION' })
      .expect(200);

    const history = await prisma.orderStatusHistory.findMany({
      where: { orderId },
      orderBy: { createdAt: 'asc' },
    });
    // Includes the checkout-time creation row (PENDING_PAYMENT) ahead of
    // the three admin-driven transitions under test.
    expect(history.map((h) => h.toStatus)).toEqual([
      'PENDING_PAYMENT',
      'PAID',
      'CONFIRMED',
      'IN_PRODUCTION',
    ]);

    // Once IN_PRODUCTION, going "backwards" to CONFIRMED is illegal.
    await http(app)
      .patch(apiPath(`/admin/orders/${orderId}/status`))
      .set(...authHeader(admin))
      .send({ status: 'CONFIRMED' })
      .expect(409);
  });

  it('REFUNDED is terminal — even an admin cannot transition out of it', async () => {
    const { orderId } = await createPendingOrder();

    await http(app)
      .patch(apiPath(`/admin/orders/${orderId}/status`))
      .set(...authHeader(admin))
      .send({ status: 'PAID' })
      .expect(200);
    await http(app)
      .patch(apiPath(`/admin/orders/${orderId}/status`))
      .set(...authHeader(admin))
      .send({ status: 'REFUNDED' })
      .expect(200);

    await http(app)
      .patch(apiPath(`/admin/orders/${orderId}/status`))
      .set(...authHeader(admin))
      .send({ status: 'CONFIRMED' })
      .expect(409);
  });
});
