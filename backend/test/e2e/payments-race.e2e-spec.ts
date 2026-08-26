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
  TestUser,
} from './support/fixtures';
import {
  buildWebhookBody,
  signVerifyPayload,
  signWebhookPayload,
} from './support/razorpay-signing';
import { PrismaService } from '../../src/common/database/prisma.service';
import { EmailService } from '../../src/notifications/email/email.service';
import { OutboxPoller } from '../../src/notifications/outbox/outbox.poller';
import { WebhookProcessor } from '../../src/payments/webhooks/webhook-processor.service';

interface PendingPaymentFixture {
  user: TestUser;
  orderId: string;
  razorpayOrderId: string;
  amountPaise: bigint;
}

/**
 * §27 #4, #5, #15 — webhook/verify convergence and email-outage isolation.
 * Bypasses the real Razorpay createOrder API (initiatePayment) and goes
 * straight to the state it would have produced — an order with a
 * razorpayOrderId and one INITIATED PaymentAttempt — via Prisma directly.
 * Nothing about what these tests actually assert (webhook dedup,
 * verify-vs-webhook races, email-outage isolation) exercises Razorpay's
 * API; both the webhook and verify endpoints under test only ever do a
 * local HMAC check, never an outbound call to Razorpay.
 */
async function setupPendingPayment(
  app: INestApplication,
  prisma: PrismaService,
  basePrice = '150.00',
): Promise<PendingPaymentFixture> {
  const user = await registerUser(app, 'payer');
  const { productId } = await createProduct(prisma, { basePrice });
  await addCartItem(app, user, { productId, quantity: 1 });

  const checkoutRes = await http(app)
    .post(apiPath('/checkout/orders'))
    .set(...authHeader(user))
    .set('Idempotency-Key', `pay-setup-${randomUUID()}`)
    .send(shippingFields())
    .expect(201);

  const orderId = checkoutRes.body.data.id as string;
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

  return { user, orderId, razorpayOrderId, amountPaise };
}

describe('Payment race convergence & email-outage isolation (§27 #4, #5, #15)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let emailService: EmailService;
  let webhookProcessor: WebhookProcessor;
  let outboxPoller: OutboxPoller;
  let sendSpy: jest.SpyInstance;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    emailService = app.get(EmailService);
    webhookProcessor = app.get(WebhookProcessor);
    outboxPoller = app.get(OutboxPoller);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    sendSpy = jest.spyOn(emailService, 'send').mockResolvedValue(undefined);
  });

  afterEach(() => {
    sendSpy.mockRestore();
  });

  it('#4 — a webhook delivered twice produces exactly one PAID transition and one outbox email event', async () => {
    const { orderId, razorpayOrderId, amountPaise } = await setupPendingPayment(
      app,
      prisma,
    );
    const paymentId = `pay_${randomUUID()}`;
    const body = buildWebhookBody('payment.captured', {
      id: paymentId,
      order_id: razorpayOrderId,
      amount: Number(amountPaise),
      status: 'captured',
    });
    const signature = signWebhookPayload(body);
    const eventId = `evt_${randomUUID()}`;

    // Razorpay's actual at-least-once delivery guarantee, simulated: the
    // exact same event, twice, over HTTP.
    for (let i = 0; i < 2; i++) {
      await http(app)
        .post(apiPath('/payments/webhook'))
        .set('Content-Type', 'application/json')
        .set('x-razorpay-signature', signature)
        .set('x-razorpay-event-id', eventId)
        .send(body)
        .expect(200);
    }

    const webhookRows = await prisma.webhookEvent.findMany({
      where: { razorpayEventId: eventId },
    });
    expect(webhookRows).toHaveLength(1); // INSERT...ON CONFLICT DO NOTHING dedup

    await webhookProcessor.processReceivedWebhooks();

    const order = await prisma.order.findUniqueOrThrow({
      where: { id: orderId },
    });
    expect(order.status).toBe('PAID');

    const paidHistory = await prisma.orderStatusHistory.findMany({
      where: { orderId, toStatus: 'PAID' },
    });
    expect(paidHistory).toHaveLength(1);

    const capturedAttempts = await prisma.paymentAttempt.findMany({
      where: { orderId, status: 'CAPTURED' },
    });
    expect(capturedAttempts).toHaveLength(1);

    const outboxRows = await prisma.outboxEvent.findMany({
      where: { eventType: 'ORDER_PAID', aggregateId: orderId },
    });
    expect(outboxRows).toHaveLength(1);

    await outboxPoller.processPendingEvents();
    expect(sendSpy).toHaveBeenCalledTimes(1);
  });

  it('#5 — webhook-first and verify-first racing to confirm the same payment converge to one PAID state and exactly one email', async () => {
    const { user, orderId, razorpayOrderId, amountPaise } =
      await setupPendingPayment(app, prisma);
    const paymentId = `pay_${randomUUID()}`;

    const webhookBody = buildWebhookBody('payment.captured', {
      id: paymentId,
      order_id: razorpayOrderId,
      amount: Number(amountPaise),
      status: 'captured',
    });
    await http(app)
      .post(apiPath('/payments/webhook'))
      .set('Content-Type', 'application/json')
      .set('x-razorpay-signature', signWebhookPayload(webhookBody))
      .set('x-razorpay-event-id', `evt_${randomUUID()}`)
      .send(webhookBody)
      .expect(200);

    const verifySignature = signVerifyPayload(razorpayOrderId, paymentId);

    // Genuine concurrency: the poller's DB transaction (webhook path) and
    // the HTTP request's DB transaction (verify path) fire together via
    // Promise.all, both racing to CAS-capture the same INITIATED
    // PaymentAttempt row — real Postgres transactions, not mocked.
    const [, verifyRes] = await Promise.all([
      webhookProcessor.processReceivedWebhooks(),
      http(app)
        .post(apiPath('/payments/verify'))
        .set(...authHeader(user))
        .send({
          razorpay_order_id: razorpayOrderId,
          razorpay_payment_id: paymentId,
          razorpay_signature: verifySignature,
        }),
    ]);

    expect(verifyRes.status).toBe(201);
    expect(verifyRes.body.data.status).toBe('PAID');

    const order = await prisma.order.findUniqueOrThrow({
      where: { id: orderId },
    });
    expect(order.status).toBe('PAID');

    const paidHistory = await prisma.orderStatusHistory.findMany({
      where: { orderId, toStatus: 'PAID' },
    });
    expect(paidHistory).toHaveLength(1);

    const capturedAttempts = await prisma.paymentAttempt.findMany({
      where: { orderId, status: 'CAPTURED' },
    });
    expect(capturedAttempts).toHaveLength(1);
    expect(capturedAttempts[0].razorpayPaymentId).toBe(paymentId);

    const outboxRows = await prisma.outboxEvent.findMany({
      where: { eventType: 'ORDER_PAID', aggregateId: orderId },
    });
    expect(outboxRows).toHaveLength(1);

    await outboxPoller.processPendingEvents();
    expect(sendSpy).toHaveBeenCalledTimes(1);
  });

  it('#15 — a simulated email-provider outage never changes orders/payment_attempts state', async () => {
    sendSpy.mockRestore();
    sendSpy = jest
      .spyOn(emailService, 'send')
      .mockRejectedValue(new Error('Simulated Resend outage'));

    const { user, orderId, razorpayOrderId } = await setupPendingPayment(
      app,
      prisma,
    );
    const paymentId = `pay_${randomUUID()}`;
    const signature = signVerifyPayload(razorpayOrderId, paymentId);

    const verifyRes = await http(app)
      .post(apiPath('/payments/verify'))
      .set(...authHeader(user))
      .send({
        razorpay_order_id: razorpayOrderId,
        razorpay_payment_id: paymentId,
        razorpay_signature: signature,
      })
      .expect(201);
    expect(verifyRes.body.data.status).toBe('PAID');

    const orderBefore = await prisma.order.findUniqueOrThrow({
      where: { id: orderId },
    });
    const attemptBefore = await prisma.paymentAttempt.findFirstOrThrow({
      where: { orderId },
    });
    expect(orderBefore.status).toBe('PAID');
    expect(attemptBefore.status).toBe('CAPTURED');

    // The outage: the outbox poller's only write path throws.
    await outboxPoller.processPendingEvents();
    expect(sendSpy).toHaveBeenCalledTimes(1);

    const orderAfter = await prisma.order.findUniqueOrThrow({
      where: { id: orderId },
    });
    const attemptAfter = await prisma.paymentAttempt.findFirstOrThrow({
      where: { orderId },
    });
    expect(orderAfter.status).toBe(orderBefore.status);
    expect(orderAfter.updatedAt.getTime()).toBe(
      orderBefore.updatedAt.getTime(),
    );
    expect(attemptAfter.status).toBe(attemptBefore.status);
    expect(attemptAfter.updatedAt.getTime()).toBe(
      attemptBefore.updatedAt.getTime(),
    );

    // The outbox event itself is the only thing that moved — retried, not
    // silently dropped, and never marked SENT.
    const outboxRow = await prisma.outboxEvent.findFirstOrThrow({
      where: { eventType: 'ORDER_PAID', aggregateId: orderId },
    });
    expect(outboxRow.status).toBe('PENDING');
    expect(outboxRow.attempts).toBe(1);
    expect(outboxRow.lastError).toMatch(/Simulated Resend outage/);
  });
});
