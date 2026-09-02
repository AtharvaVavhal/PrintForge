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
import {
  buildWebhookBody,
  signWebhookPayload,
} from './support/razorpay-signing';
import { PrismaService } from '../../src/common/database/prisma.service';
import { WebhookProcessor } from '../../src/payments/webhooks/webhook-processor.service';
import { RazorpayService } from '../../src/payments/razorpay/razorpay.service';
import { EmailService } from '../../src/notifications/email/email.service';

async function setSetting(prisma: PrismaService, key: string, value: string) {
  await prisma.appSetting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
}

async function clearTaxSettings(prisma: PrismaService) {
  await prisma.appSetting.deleteMany({
    where: {
      key: { in: ['tax.enabled', 'tax.pricingMode', 'tax.ratePercent'] },
    },
  });
}

async function checkout(
  app: INestApplication,
  prisma: PrismaService,
  user: TestUser,
  basePrice: string,
  quantity = 1,
) {
  const { productId } = await createProduct(prisma, { basePrice });
  await addCartItem(app, user, { productId, quantity });
  const res = await http(app)
    .post(apiPath('/checkout/orders'))
    .set(...authHeader(user))
    .set('Idempotency-Key', `tax-${randomUUID()}`)
    .send(shippingFields())
    .expect(201);
  return {
    orderId: res.body.data.id as string,
    body: res.body.data,
    productId,
  };
}

async function payOrder(
  app: INestApplication,
  prisma: PrismaService,
  processor: WebhookProcessor,
  orderId: string,
) {
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
  const body = buildWebhookBody('payment.captured', {
    id: `pay_${randomUUID()}`,
    order_id: razorpayOrderId,
    amount: Number(amountPaise),
    status: 'captured',
  });
  await http(app)
    .post(apiPath('/payments/webhook'))
    .set('Content-Type', 'application/json')
    .set('x-razorpay-signature', signWebhookPayload(body))
    .set('x-razorpay-event-id', `evt_${randomUUID()}`)
    .send(body)
    .expect(200);
  await processor.processReceivedWebhooks();
}

describe('Tax & invoicing (Phase 13.4)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let processor: WebhookProcessor;
  let razorpay: RazorpayService;
  let emailSpy: jest.SpyInstance;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    processor = app.get(WebhookProcessor);
    razorpay = app.get(RazorpayService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    emailSpy = jest
      .spyOn(app.get(EmailService), 'send')
      .mockResolvedValue(undefined);
  });

  afterEach(() => {
    emailSpy.mockRestore();
    jest.restoreAllMocks();
  });

  // ─── Financial totals ─────────────────────────────────────────────────

  it('tax disabled (default): total is unchanged and taxAmount is 0.00', async () => {
    const user = await registerUser(app, 'tax');
    const { orderId, body } = await checkout(app, prisma, user, '150.00');

    expect(body.total).toBe('150.00');
    expect(body.taxAmount).toBe('0.00');
    expect(body.taxableAmount).toBe('150.00');
    expect(body.taxMode).toBe('INCLUSIVE');
    expect(body.taxRatePercent).toBeNull();

    const order = await prisma.order.findUniqueOrThrow({
      where: { id: orderId },
    });
    expect(order.total.toFixed(2)).toBe('150.00');
    expect(order.taxAmount.toFixed(2)).toBe('0.00');
    expect(order.taxRateSnapshot).toBeNull();
  });

  it('tax enabled INCLUSIVE: total is unchanged; GST is extracted from within it', async () => {
    await setSetting(prisma, 'tax.enabled', 'true');
    await setSetting(prisma, 'tax.ratePercent', '18.00');

    const user = await registerUser(app, 'tax');
    const { orderId, body } = await checkout(app, prisma, user, '118.00');

    // 118.00 incl. 18% → net 100.00, tax 18.00 — customer still pays 118.00
    expect(body.total).toBe('118.00');
    expect(body.taxableAmount).toBe('100.00');
    expect(body.taxAmount).toBe('18.00');
    expect(body.taxRatePercent).toBe('18.00');

    const order = await prisma.order.findUniqueOrThrow({
      where: { id: orderId },
    });
    expect(order.total.toFixed(2)).toBe('118.00');
    expect(order.taxableAmount.plus(order.taxAmount).toFixed(2)).toBe('118.00');
    expect(order.taxRateSnapshot?.toFixed(4)).toBe('0.1800');

    await clearTaxSettings(prisma);
  });

  it('tax enabled EXCLUSIVE: GST is added on top and increases the total', async () => {
    await setSetting(prisma, 'tax.enabled', 'true');
    await setSetting(prisma, 'tax.pricingMode', 'EXCLUSIVE');
    await setSetting(prisma, 'tax.ratePercent', '18.00');

    const user = await registerUser(app, 'tax');
    const { body } = await checkout(app, prisma, user, '100.00');

    expect(body.subtotal).toBe('100.00');
    expect(body.taxableAmount).toBe('100.00');
    expect(body.taxAmount).toBe('18.00');
    expect(body.total).toBe('118.00');

    await clearTaxSettings(prisma);
  });

  it('the Razorpay order amount equals the persisted order total (tax active)', async () => {
    await setSetting(prisma, 'tax.enabled', 'true');
    await setSetting(prisma, 'tax.pricingMode', 'EXCLUSIVE');
    await setSetting(prisma, 'tax.ratePercent', '18.00');

    const createSpy = jest
      .spyOn(razorpay, 'createOrder')
      .mockResolvedValue({ id: `order_test_${randomUUID()}` });

    const user = await registerUser(app, 'tax');
    const { orderId } = await checkout(app, prisma, user, '100.00');

    await http(app)
      .post(apiPath(`/checkout/orders/${orderId}/retry-payment`))
      .set(...authHeader(user))
      .expect(201);

    const order = await prisma.order.findUniqueOrThrow({
      where: { id: orderId },
    });
    const expectedPaise = BigInt(
      order.total.times(100).toDecimalPlaces(0).toFixed(0),
    );
    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({ amountPaise: expectedPaise }),
    );
    const attempt = await prisma.paymentAttempt.findFirstOrThrow({
      where: { orderId },
    });
    expect(attempt.amountPaise).toBe(expectedPaise);

    await clearTaxSettings(prisma);
  });

  // ─── Snapshot immutability ────────────────────────────────────────────

  it('order financial snapshot survives a later product-price change', async () => {
    const user = await registerUser(app, 'tax');
    const { orderId, productId } = await checkout(app, prisma, user, '200.00');
    const before = await prisma.order.findUniqueOrThrow({
      where: { id: orderId },
    });

    await prisma.product.update({
      where: { id: productId },
      data: { basePrice: '999.00' },
    });

    const after = await prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { items: true },
    });
    expect(after.subtotal.toFixed(2)).toBe(before.subtotal.toFixed(2));
    expect(after.total.toFixed(2)).toBe(before.total.toFixed(2));
    expect(after.taxAmount.toFixed(2)).toBe(before.taxAmount.toFixed(2));
    expect(after.items[0].unitPriceSnapshot.toFixed(2)).toBe('200.00');
  });

  it('order tax snapshot survives a later tax-setting change', async () => {
    await setSetting(prisma, 'tax.enabled', 'true');
    await setSetting(prisma, 'tax.ratePercent', '18.00');

    const user = await registerUser(app, 'tax');
    const { orderId } = await checkout(app, prisma, user, '118.00');

    // Client changes the rate afterwards.
    await setSetting(prisma, 'tax.ratePercent', '5.00');

    const order = await prisma.order.findUniqueOrThrow({
      where: { id: orderId },
    });
    expect(order.taxAmount.toFixed(2)).toBe('18.00'); // frozen at 18%
    expect(order.taxRateSnapshot?.toFixed(4)).toBe('0.1800');

    await clearTaxSettings(prisma);
  });

  // ─── Invoicing ────────────────────────────────────────────────────────

  it('creates an invoice for a paid order whose totals match the order exactly', async () => {
    const user = await registerUser(app, 'inv');
    const { orderId } = await checkout(app, prisma, user, '150.00');
    await payOrder(app, prisma, processor, orderId);

    const res = await http(app)
      .get(apiPath(`/orders/${orderId}/invoice`))
      .set(...authHeader(user))
      .expect(200);

    const inv = res.body.data;
    const order = await prisma.order.findUniqueOrThrow({
      where: { id: orderId },
    });
    expect(inv.invoiceNumber).toMatch(/^INV-\d{6}$/);
    expect(inv.grandTotal).toBe(order.total.toFixed(2));
    expect(inv.subtotal).toBe(order.subtotal.toFixed(2));
    expect(inv.taxAmount).toBe(order.taxAmount.toFixed(2));
    expect(inv.seller.detailsPending).toBe(true);
    expect(inv.notes.join(' ')).toMatch(/not yet a valid tax invoice/i);
    expect(inv.lines).toHaveLength(1);

    const rows = await prisma.invoice.findMany({ where: { orderId } });
    expect(rows).toHaveLength(1);
  });

  it('invoice creation is idempotent — repeated requests return the same invoice, one row', async () => {
    const user = await registerUser(app, 'inv');
    const { orderId } = await checkout(app, prisma, user, '150.00');
    await payOrder(app, prisma, processor, orderId);

    const a = await http(app)
      .get(apiPath(`/orders/${orderId}/invoice`))
      .set(...authHeader(user))
      .expect(200);
    const b = await http(app)
      .get(apiPath(`/orders/${orderId}/invoice`))
      .set(...authHeader(user))
      .expect(200);

    expect(a.body.data.invoiceNumber).toBe(b.body.data.invoiceNumber);
    expect(await prisma.invoice.count({ where: { orderId } })).toBe(1);
  });

  it('invoice numbers come from a dedicated sequence and are unique', async () => {
    const user = await registerUser(app, 'inv');
    const first = await checkout(app, prisma, user, '100.00');
    await payOrder(app, prisma, processor, first.orderId);
    const second = await checkout(app, prisma, user, '100.00');
    await payOrder(app, prisma, processor, second.orderId);

    const n1 = (
      await http(app)
        .get(apiPath(`/orders/${first.orderId}/invoice`))
        .set(...authHeader(user))
        .expect(200)
    ).body.data.invoiceNumber as string;
    const n2 = (
      await http(app)
        .get(apiPath(`/orders/${second.orderId}/invoice`))
        .set(...authHeader(user))
        .expect(200)
    ).body.data.invoiceNumber as string;

    expect(n1).not.toBe(n2);
    expect(
      await prisma.appSetting.findUnique({
        where: { key: 'order_number_counter' },
      }),
    ).not.toBeNull();
    const invoiceCounter = await prisma.appSetting.findUnique({
      where: { key: 'invoice_number_counter' },
    });
    expect(invoiceCounter?.value).toBe('2');
  });

  it('a customer cannot read another customer’s invoice; an admin can', async () => {
    const owner = await registerUser(app, 'owner');
    const other = await registerUser(app, 'other');
    const admin = await registerAdmin(app, prisma);
    const { orderId } = await checkout(app, prisma, owner, '150.00');
    await payOrder(app, prisma, processor, orderId);

    await http(app)
      .get(apiPath(`/orders/${orderId}/invoice`))
      .set(...authHeader(other))
      .expect(404);

    await http(app)
      .get(apiPath(`/orders/${orderId}/invoice`))
      .expect(401);

    await http(app)
      .get(apiPath(`/admin/orders/${orderId}/invoice`))
      .set(...authHeader(admin))
      .expect(200);
  });

  it('no invoice for an unpaid order (409)', async () => {
    const user = await registerUser(app, 'inv');
    const { orderId } = await checkout(app, prisma, user, '150.00');

    await http(app)
      .get(apiPath(`/orders/${orderId}/invoice`))
      .set(...authHeader(user))
      .expect(409);
    expect(await prisma.invoice.count({ where: { orderId } })).toBe(0);
  });

  // ─── Admin config validation ─────────────────────────────────────────

  it('rejects an invalid tax rate via the admin settings API; non-admin is 403', async () => {
    const admin = await registerAdmin(app, prisma);
    const customer = await registerUser(app, 'cust');

    await http(app)
      .patch(apiPath('/admin/settings/tax.ratePercent'))
      .set(...authHeader(customer))
      .send({ value: '18' })
      .expect(403);

    await http(app)
      .patch(apiPath('/admin/settings/tax.ratePercent'))
      .set(...authHeader(admin))
      .send({ value: '150' })
      .expect(400);

    const ok = await http(app)
      .patch(apiPath('/admin/settings/tax.ratePercent'))
      .set(...authHeader(admin))
      .send({ value: '18' })
      .expect(200);
    expect(ok.body.data.value).toBe('18.00');

    await clearTaxSettings(prisma);
  });

  it('LOCKS tax-EXCLUSIVE mode — it cannot be activated through the admin settings API (Phase 13.4 hardening)', async () => {
    const admin = await registerAdmin(app, prisma);

    const rejected = await http(app)
      .patch(apiPath('/admin/settings/tax.pricingMode'))
      .set(...authHeader(admin))
      .send({ value: 'EXCLUSIVE' })
      .expect(400);
    expect(rejected.body.error.message).toMatch(/business confirmation/i);

    // Nothing was persisted — a later checkout stays INCLUSIVE / unchanged.
    expect(
      await prisma.appSetting.findUnique({ where: { key: 'tax.pricingMode' } }),
    ).toBeNull();

    // INCLUSIVE is still accepted, and the listing only offers INCLUSIVE.
    await http(app)
      .patch(apiPath('/admin/settings/tax.pricingMode'))
      .set(...authHeader(admin))
      .send({ value: 'INCLUSIVE' })
      .expect(200);
    const list = await http(app)
      .get(apiPath('/admin/settings'))
      .set(...authHeader(admin))
      .expect(200);
    const mode = (
      list.body.data as Array<{ key: string; options?: string[] }>
    ).find((s) => s.key === 'tax.pricingMode');
    expect(mode?.options).toEqual(['INCLUSIVE']);

    await prisma.appSetting.deleteMany({ where: { key: 'tax.pricingMode' } });
  });

  it('enabling tax while INCLUSIVE never changes the customer total or the Razorpay amount', async () => {
    await setSetting(prisma, 'tax.enabled', 'true');
    await setSetting(prisma, 'tax.pricingMode', 'INCLUSIVE');
    await setSetting(prisma, 'tax.ratePercent', '18.00');

    const createSpy = jest
      .spyOn(razorpay, 'createOrder')
      .mockResolvedValue({ id: `order_test_${randomUUID()}` });

    const user = await registerUser(app, 'tax');
    const { orderId, body } = await checkout(app, prisma, user, '150.00');

    // Customer total unchanged (GST is extracted from within it).
    expect(body.total).toBe('150.00');
    expect(Number(body.taxAmount)).toBeGreaterThan(0);

    await http(app)
      .post(apiPath(`/checkout/orders/${orderId}/retry-payment`))
      .set(...authHeader(user))
      .expect(201);

    const order = await prisma.order.findUniqueOrThrow({
      where: { id: orderId },
    });
    const expectedPaise = BigInt(
      order.total.times(100).toDecimalPlaces(0).toFixed(0),
    );
    expect(order.total.toFixed(2)).toBe('150.00');
    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({ amountPaise: expectedPaise }),
    );

    await clearTaxSettings(prisma);
  });
});
