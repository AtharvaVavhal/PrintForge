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
  registerUser,
  shippingFields,
} from './support/fixtures';
import {
  buildWebhookBody,
  signWebhookPayload,
} from './support/razorpay-signing';
import { PrismaService } from '../../src/common/database/prisma.service';
import { WebhookProcessor } from '../../src/payments/webhooks/webhook-processor.service';
import { PaymentsService } from '../../src/payments/payments.service';

async function pendingOrder(app: INestApplication, prisma: PrismaService) {
  const user = await registerUser(app, 'wh');
  const { productId } = await createProduct(prisma, { basePrice: '150.00' });
  await addCartItem(app, user, { productId, quantity: 1 });
  const res = await http(app)
    .post(apiPath('/checkout/orders'))
    .set(...authHeader(user))
    .set('Idempotency-Key', `wh-${randomUUID()}`)
    .send(shippingFields())
    .expect(201);
  const orderId = res.body.data.id as string;
  const order = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
  });
  const amountPaise = BigInt(
    order.total.times(100).toDecimalPlaces(0).toFixed(0),
  );
  const razorpayOrderId = `order_test_${randomUUID()}`;
  await prisma.order.update({
    where: { id: orderId },
    data: { razorpayOrderId },
  });
  await prisma.paymentAttempt.create({
    data: {
      orderId,
      razorpayOrderId,
      amountPaise,
      currency: 'INR',
      status: 'INITIATED',
    },
  });
  return { orderId, razorpayOrderId, amountPaise };
}

async function postWebhook(
  app: INestApplication,
  event: 'payment.captured' | 'payment.failed',
  entity: { id: string; order_id: string; amount: number; status: string },
) {
  const body = buildWebhookBody(event, entity);
  await http(app)
    .post(apiPath('/payments/webhook'))
    .set('Content-Type', 'application/json')
    .set('x-razorpay-signature', signWebhookPayload(body))
    .set('x-razorpay-event-id', `evt_${randomUUID()}`)
    .send(body)
    .expect(200);
}

describe('Webhook bounded retry (Phase 13.3)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let processor: WebhookProcessor;
  let payments: PaymentsService;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    processor = app.get(WebhookProcessor);
    payments = app.get(PaymentsService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  it('a normal captured webhook still processes to PROCESSED (regression)', async () => {
    const o = await pendingOrder(app, prisma);
    await postWebhook(app, 'payment.captured', {
      id: `pay_${randomUUID()}`,
      order_id: o.razorpayOrderId,
      amount: Number(o.amountPaise),
      status: 'captured',
    });

    await processor.processReceivedWebhooks();

    const row = await prisma.webhookEvent.findFirstOrThrow();
    expect(row.status).toBe('PROCESSED');
    expect(row.processedAt).not.toBeNull();
    expect(
      (await prisma.order.findUniqueOrThrow({ where: { id: o.orderId } }))
        .status,
    ).toBe('PAID');
  });

  it('a transient processing failure is retried with an increasing backoff, then dead-lettered', async () => {
    const o = await pendingOrder(app, prisma);
    await postWebhook(app, 'payment.captured', {
      id: `pay_${randomUUID()}`,
      order_id: o.razorpayOrderId,
      amount: Number(o.amountPaise),
      status: 'captured',
    });

    const spy = jest
      .spyOn(payments, 'applyWebhookEvent')
      .mockRejectedValue(new Error('simulated processing outage'));

    try {
      // Attempt 1
      await processor.processReceivedWebhooks();
      let row = await prisma.webhookEvent.findFirstOrThrow();
      expect(row.status).toBe('PROCESSING_FAILED');
      expect(row.attempts).toBe(1);
      expect(row.lastError).toMatch(/simulated processing outage/);
      const firstDelay = row.availableAt.getTime() - Date.now();
      expect(firstDelay).toBeGreaterThan(15_000);

      // Not due yet — a run right now is a no-op.
      await processor.processReceivedWebhooks();
      row = await prisma.webhookEvent.findFirstOrThrow();
      expect(row.attempts).toBe(1);

      // Fast-forward each retry by making it due, up to the max.
      for (let i = 2; i <= 6; i++) {
        await prisma.webhookEvent.update({
          where: { id: row.id },
          data: { availableAt: new Date(Date.now() - 1000) },
        });
        await processor.processReceivedWebhooks();
        row = await prisma.webhookEvent.findFirstOrThrow();
        if (i < 6) {
          expect(row.status).toBe('PROCESSING_FAILED');
          expect(row.attempts).toBe(i);
        }
      }

      expect(row.status).toBe('FAILED');
      expect(row.attempts).toBe(6);
      expect(row.processedAt).not.toBeNull();

      // A dead-lettered event is never picked up again.
      await prisma.webhookEvent.update({
        where: { id: row.id },
        data: { availableAt: new Date(Date.now() - 1000) },
      });
      await processor.processReceivedWebhooks();
      expect((await prisma.webhookEvent.findFirstOrThrow()).attempts).toBe(6);
    } finally {
      spy.mockRestore();
    }

    // The order was never touched by any of that.
    expect(
      (await prisma.order.findUniqueOrThrow({ where: { id: o.orderId } }))
        .status,
    ).toBe('PENDING_PAYMENT');
  });

  it('an amount-mismatched captured webhook is dead-lettered immediately and never marks the order PAID', async () => {
    const o = await pendingOrder(app, prisma);
    // Valid signature, but the reported amount is wrong.
    await postWebhook(app, 'payment.captured', {
      id: `pay_${randomUUID()}`,
      order_id: o.razorpayOrderId,
      amount: Number(o.amountPaise) - 500,
      status: 'captured',
    });

    await processor.processReceivedWebhooks();

    const row = await prisma.webhookEvent.findFirstOrThrow();
    expect(row.status).toBe('FAILED'); // terminal, not PROCESSING_FAILED
    expect(row.attempts).toBe(1); // no wasted retry budget
    expect(row.lastError).toMatch(/AMOUNT_MISMATCH/);

    const order = await prisma.order.findUniqueOrThrow({
      where: { id: o.orderId },
    });
    expect(order.status).toBe('PENDING_PAYMENT');
    expect(
      await prisma.paymentAttempt.count({
        where: { orderId: o.orderId, status: 'CAPTURED' },
      }),
    ).toBe(0);
  });
});
