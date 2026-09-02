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
  signWebhookPayload,
} from './support/razorpay-signing';
import { PrismaService } from '../../src/common/database/prisma.service';
import { RazorpayService } from '../../src/payments/razorpay/razorpay.service';
import { PaymentReconciliationService } from '../../src/payments/payment-reconciliation.service';
import { WebhookProcessor } from '../../src/payments/webhooks/webhook-processor.service';
import { EmailService } from '../../src/notifications/email/email.service';

interface Pending {
  user: TestUser;
  orderId: string;
  razorpayOrderId: string;
  amountPaise: bigint;
}

async function setupPending(
  app: INestApplication,
  prisma: PrismaService,
  basePrice = '150.00',
): Promise<Pending> {
  const user = await registerUser(app, 'recon');
  const { productId } = await createProduct(prisma, { basePrice });
  await addCartItem(app, user, { productId, quantity: 1 });
  const res = await http(app)
    .post(apiPath('/checkout/orders'))
    .set(...authHeader(user))
    .set('Idempotency-Key', `recon-${randomUUID()}`)
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
  return { user, orderId, razorpayOrderId, amountPaise };
}

/** Backdate an order + its attempt so it falls inside the reconcile window. */
async function ageOrder(
  prisma: PrismaService,
  orderId: string,
  minutes: number,
): Promise<void> {
  const when = new Date(Date.now() - minutes * 60_000);
  await prisma.order.update({
    where: { id: orderId },
    data: { createdAt: when },
  });
  await prisma.paymentAttempt.updateMany({
    where: { orderId },
    data: { createdAt: when },
  });
}

function capturedPayment(
  p: Pending,
  over: Partial<Record<string, unknown>> = {},
) {
  return {
    id: `pay_${randomUUID()}`,
    razorpayOrderId: p.razorpayOrderId,
    amountPaise: p.amountPaise,
    currency: 'INR',
    status: 'captured',
    captured: true,
    method: 'upi',
    ...over,
  };
}

describe('Payment reconciliation (Phase 13.3)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let razorpay: RazorpayService;
  let reconciliation: PaymentReconciliationService;
  let webhookProcessor: WebhookProcessor;
  let emailSpy: jest.SpyInstance;
  let configuredSpy: jest.SpyInstance;
  let fetchSpy: jest.SpyInstance;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    razorpay = app.get(RazorpayService);
    reconciliation = app.get(PaymentReconciliationService);
    webhookProcessor = app.get(WebhookProcessor);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    emailSpy = jest
      .spyOn(app.get(EmailService), 'send')
      .mockResolvedValue(undefined);
    configuredSpy = jest.spyOn(razorpay, 'isConfigured').mockReturnValue(true);
    fetchSpy = jest.spyOn(razorpay, 'fetchOrderPayments');
  });

  afterEach(() => {
    emailSpy.mockRestore();
    configuredSpy.mockRestore();
    fetchSpy.mockRestore();
  });

  // ─── Recovery ──────────────────────────────────────────────────────────

  it('recovers a stale order to PAID when Razorpay shows a matching captured payment', async () => {
    const p = await setupPending(app, prisma);
    await ageOrder(prisma, p.orderId, 20);
    const rp = capturedPayment(p);
    fetchSpy.mockResolvedValue([rp]);

    await reconciliation.reconcile();

    const order = await prisma.order.findUniqueOrThrow({
      where: { id: p.orderId },
    });
    expect(order.status).toBe('PAID');

    const captured = await prisma.paymentAttempt.findMany({
      where: { orderId: p.orderId, status: 'CAPTURED' },
    });
    expect(captured).toHaveLength(1);
    expect(captured[0].razorpayPaymentId).toBe(rp.id);

    const history = await prisma.orderStatusHistory.findMany({
      where: { orderId: p.orderId, toStatus: 'PAID' },
    });
    expect(history).toHaveLength(1);
    expect(history[0].note).toMatch(/reconciliation/i);

    const outbox = await prisma.outboxEvent.findMany({
      where: { eventType: 'ORDER_PAID', aggregateId: p.orderId },
    });
    expect(outbox).toHaveLength(1);
  });

  it('is idempotent — a second reconciliation run changes nothing', async () => {
    const p = await setupPending(app, prisma);
    await ageOrder(prisma, p.orderId, 20);
    fetchSpy.mockResolvedValue([capturedPayment(p)]);

    await reconciliation.reconcile();
    await reconciliation.reconcile();

    const captured = await prisma.paymentAttempt.findMany({
      where: { orderId: p.orderId, status: 'CAPTURED' },
    });
    expect(captured).toHaveLength(1);
    const history = await prisma.orderStatusHistory.findMany({
      where: { orderId: p.orderId, toStatus: 'PAID' },
    });
    expect(history).toHaveLength(1);
    const outbox = await prisma.outboxEvent.findMany({
      where: { eventType: 'ORDER_PAID', aggregateId: p.orderId },
    });
    expect(outbox).toHaveLength(1);
  });

  // ─── Mismatch — must NOT mark PAID ─────────────────────────────────────

  it('does NOT mark PAID on an amount mismatch — order stays PENDING_PAYMENT', async () => {
    const p = await setupPending(app, prisma);
    await ageOrder(prisma, p.orderId, 20);
    fetchSpy.mockResolvedValue([
      capturedPayment(p, { amountPaise: p.amountPaise - 100n }),
    ]);

    await reconciliation.reconcile();

    const order = await prisma.order.findUniqueOrThrow({
      where: { id: p.orderId },
    });
    expect(order.status).toBe('PENDING_PAYMENT');
    expect(
      await prisma.paymentAttempt.count({
        where: { orderId: p.orderId, status: 'CAPTURED' },
      }),
    ).toBe(0);
  });

  it('does NOT mark PAID on a currency mismatch', async () => {
    const p = await setupPending(app, prisma);
    await ageOrder(prisma, p.orderId, 20);
    fetchSpy.mockResolvedValue([capturedPayment(p, { currency: 'USD' })]);

    await reconciliation.reconcile();

    expect(
      (await prisma.order.findUniqueOrThrow({ where: { id: p.orderId } }))
        .status,
    ).toBe('PENDING_PAYMENT');
  });

  it('does NOT mark PAID when the captured payment belongs to a different Razorpay order', async () => {
    const p = await setupPending(app, prisma);
    await ageOrder(prisma, p.orderId, 20);
    fetchSpy.mockResolvedValue([
      capturedPayment(p, { razorpayOrderId: `order_test_${randomUUID()}` }),
    ]);

    await reconciliation.reconcile();

    expect(
      (await prisma.order.findUniqueOrThrow({ where: { id: p.orderId } }))
        .status,
    ).toBe('PENDING_PAYMENT');
  });

  it('does NOT mark PAID for a non-captured (created / failed) Razorpay payment', async () => {
    const p = await setupPending(app, prisma);
    await ageOrder(prisma, p.orderId, 20);
    fetchSpy.mockResolvedValue([
      capturedPayment(p, { status: 'failed', captured: false }),
    ]);

    await reconciliation.reconcile();

    expect(
      (await prisma.order.findUniqueOrThrow({ where: { id: p.orderId } }))
        .status,
    ).toBe('PENDING_PAYMENT');
  });

  it('does NOT mark PAID or FAILED for an authorized-but-not-captured payment', async () => {
    const p = await setupPending(app, prisma);
    await ageOrder(prisma, p.orderId, 200); // old enough to fail, if it were unpaid
    fetchSpy.mockResolvedValue([
      capturedPayment(p, { status: 'authorized', captured: false }),
    ]);

    await reconciliation.reconcile();

    expect(
      (await prisma.order.findUniqueOrThrow({ where: { id: p.orderId } }))
        .status,
    ).toBe('PENDING_PAYMENT');
  });

  // ─── Already terminal ─────────────────────────────────────────────────

  it('skips an order that is already PAID (no duplicate effects)', async () => {
    const p = await setupPending(app, prisma);
    // Drive it to PAID via a normal webhook first.
    const body = buildWebhookBody('payment.captured', {
      id: `pay_${randomUUID()}`,
      order_id: p.razorpayOrderId,
      amount: Number(p.amountPaise),
      status: 'captured',
    });
    await http(app)
      .post(apiPath('/payments/webhook'))
      .set('Content-Type', 'application/json')
      .set('x-razorpay-signature', signWebhookPayload(body))
      .set('x-razorpay-event-id', `evt_${randomUUID()}`)
      .send(body)
      .expect(200);
    await webhookProcessor.processReceivedWebhooks();
    await ageOrder(prisma, p.orderId, 20);

    fetchSpy.mockResolvedValue([capturedPayment(p)]);
    await reconciliation.reconcile();

    // fetchOrderPayments should not even be called: the order has a
    // CAPTURED attempt so it's excluded from the candidate query.
    expect(fetchSpy).not.toHaveBeenCalled();
    const history = await prisma.orderStatusHistory.findMany({
      where: { orderId: p.orderId, toStatus: 'PAID' },
    });
    expect(history).toHaveLength(1);
  });

  // ─── Stale unpaid → PAYMENT_FAILED ────────────────────────────────────

  it('leaves a fresh pending order alone (inside the reconcile-after grace window)', async () => {
    const p = await setupPending(app, prisma);
    await ageOrder(prisma, p.orderId, 5); // < RECONCILE_AFTER (15m)
    fetchSpy.mockResolvedValue([]);

    await reconciliation.reconcile();

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(
      (await prisma.order.findUniqueOrThrow({ where: { id: p.orderId } }))
        .status,
    ).toBe('PENDING_PAYMENT');
  });

  it('transitions a genuinely stale unpaid order to PAYMENT_FAILED after the give-up threshold', async () => {
    const p = await setupPending(app, prisma);
    await ageOrder(prisma, p.orderId, 200); // > FAIL_STALE_AFTER (180m)
    fetchSpy.mockResolvedValue([]); // Razorpay: no payment at all

    await reconciliation.reconcile();

    const order = await prisma.order.findUniqueOrThrow({
      where: { id: p.orderId },
    });
    expect(order.status).toBe('PAYMENT_FAILED');
    const attempt = await prisma.paymentAttempt.findFirstOrThrow({
      where: { orderId: p.orderId },
    });
    expect(attempt.status).toBe('ABANDONED');
    const history = await prisma.orderStatusHistory.findMany({
      where: { orderId: p.orderId, toStatus: 'PAYMENT_FAILED' },
    });
    expect(history).toHaveLength(1);
  });

  it('does NOT fail a stale order that Razorpay later reports as captured — it recovers to PAID instead', async () => {
    const p = await setupPending(app, prisma);
    await ageOrder(prisma, p.orderId, 200);
    fetchSpy.mockResolvedValue([capturedPayment(p)]);

    await reconciliation.reconcile();

    expect(
      (await prisma.order.findUniqueOrThrow({ where: { id: p.orderId } }))
        .status,
    ).toBe('PAID');
  });

  it('fails a stale order that never got a Razorpay order at all — no API call needed', async () => {
    const user = await registerUser(app, 'norzp');
    const { productId } = await createProduct(prisma, { basePrice: '150.00' });
    await addCartItem(app, user, { productId, quantity: 1 });
    const res = await http(app)
      .post(apiPath('/checkout/orders'))
      .set(...authHeader(user))
      .set('Idempotency-Key', `norzp-${randomUUID()}`)
      .send(shippingFields())
      .expect(201);
    const orderId = res.body.data.id as string;
    await prisma.order.update({
      where: { id: orderId },
      data: { createdAt: new Date(Date.now() - 200 * 60_000) },
    });

    await reconciliation.reconcile();

    expect(
      (await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).status,
    ).toBe('PAYMENT_FAILED');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // ─── Webhook + reconciliation race ───────────────────────────────────

  it('webhook and reconciliation discovering the SAME captured payment converge to one PAID state', async () => {
    const p = await setupPending(app, prisma);
    await ageOrder(prisma, p.orderId, 20);
    const paymentId = `pay_${randomUUID()}`;
    const rp = capturedPayment(p, { id: paymentId });
    fetchSpy.mockResolvedValue([rp]);

    const webhookBody = buildWebhookBody('payment.captured', {
      id: paymentId,
      order_id: p.razorpayOrderId,
      amount: Number(p.amountPaise),
      status: 'captured',
    });
    await http(app)
      .post(apiPath('/payments/webhook'))
      .set('Content-Type', 'application/json')
      .set('x-razorpay-signature', signWebhookPayload(webhookBody))
      .set('x-razorpay-event-id', `evt_${randomUUID()}`)
      .send(webhookBody)
      .expect(200);

    // Both racing on the same INITIATED attempt / same order row.
    await Promise.all([
      webhookProcessor.processReceivedWebhooks(),
      reconciliation.reconcile(),
    ]);

    const order = await prisma.order.findUniqueOrThrow({
      where: { id: p.orderId },
    });
    expect(order.status).toBe('PAID');

    expect(
      await prisma.paymentAttempt.count({
        where: { orderId: p.orderId, status: 'CAPTURED' },
      }),
    ).toBe(1);
    expect(
      await prisma.orderStatusHistory.count({
        where: { orderId: p.orderId, toStatus: 'PAID' },
      }),
    ).toBe(1);
    expect(
      await prisma.outboxEvent.count({
        where: { eventType: 'ORDER_PAID', aggregateId: p.orderId },
      }),
    ).toBe(1);
  });

  it('a Razorpay API failure during reconciliation transitions nothing', async () => {
    const p = await setupPending(app, prisma);
    await ageOrder(prisma, p.orderId, 200);
    fetchSpy.mockRejectedValue(new Error('Razorpay 503'));

    await reconciliation.reconcile();

    expect(
      (await prisma.order.findUniqueOrThrow({ where: { id: p.orderId } }))
        .status,
    ).toBe('PENDING_PAYMENT');
  });
});
