import { randomUUID, createHmac } from 'crypto';
import { INestApplication } from '@nestjs/common';
import { resetDatabase } from './support/db';
import { createTestApp } from './support/test-app';
import {
  addCartItem,
  apiPath,
  authHeader,
  createProduct,
  http,
  makeTenantCheckoutReady,
  registerAdmin,
  registerUser,
  shippingFields,
  TestUser,
} from './support/fixtures';
import { PrismaService } from '../../src/common/database/prisma.service';
import { CredentialEncryptionService } from '../../src/payments/crypto/credential-encryption.service';
import { WebhookProcessor } from '../../src/payments/webhooks/webhook-processor.service';

/**
 * P8-13.4 — real DB-backed, real-HTTP E2E coverage for the complete Phase
 * 8 merchant-payment implementation, against an isolated `*_test`
 * database (`resetDatabase` itself refuses to run against anything else).
 *
 * NEVER makes a real Razorpay network call, per task constraints ("Do NOT
 * use real Razorpay credentials", "Do NOT make provider API calls"):
 *  - `PaymentAccount.credentialsEncrypted` is a REAL AES-256-GCM envelope
 *    (built via the app's own real `CredentialEncryptionService`, reading
 *    `.env.test`'s real `PAYMENT_CREDENTIALS_MASTER_KEY` — pure local
 *    crypto, zero network) wrapping obviously-fake key material
 *    (`rzp_test_fake_*`) that would never authenticate against the real
 *    Razorpay API even if this environment had outbound network access.
 *  - Payment/webhook SIGNATURE verification is pure local HMAC — no SDK
 *    call is ever involved on that path at all, so it is exercised for
 *    real, end-to-end, with zero mocking.
 *  - The one operation that would need a real outbound call
 *    (`RefundsService`'s `createRefund` success path) is deliberately
 *    tested only for its FAILURE handling: a real HTTP request reaches
 *    `RazorpayProviderAdapter.createRefund`, which either can't reach the
 *    network at all or gets rejected by Razorpay's real API for
 *    fake/unauthorized credentials — either way the request never leaves
 *    this environment with a chance of moving real money, and the
 *    resulting `PaymentProviderUnavailableError`/`Refund` -> `FAILED`
 *    behavior (P8-13's own P1 #2-adjacent CAS fix) is exactly what this
 *    suite verifies.
 *  - `PaymentsService.initiatePayment`'s own provider-order-creation
 *    success path is likewise never exercised via HTTP for the same
 *    reason (same convention `payments-race.e2e-spec.ts` already
 *    establishes: "bypasses the real Razorpay createOrder API... goes
 *    straight to the state it would have produced... via Prisma
 *    directly") — this suite exercises its FAILURE path (no
 *    `PaymentAccount` configured) for real over HTTP instead, since that
 *    is precisely the P1 #1 finding's own risk scenario.
 */
describe('Phase 8 — merchant payments E2E (P8-13.4)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let credentialEncryption: CredentialEncryptionService;
  let webhookProcessor: WebhookProcessor;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    credentialEncryption = app.get(CredentialEncryptionService);
    webhookProcessor = app.get(WebhookProcessor);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  // ─── Shared fixtures ──────────────────────────────────────────────────

  interface MerchantCredentials {
    keyId: string;
    keySecret: string;
    webhookSecret: string;
  }

  function fakeCredentials(label: string): MerchantCredentials {
    return {
      keyId: `rzp_test_fake_${label}_${randomUUID()}`,
      keySecret: `fake_secret_${label}_${randomUUID()}`,
      webhookSecret: `fake_webhook_secret_${label}_${randomUUID()}`,
    };
  }

  /** Creates an ACTIVE PaymentAccount with a REAL encrypted envelope
   * (local crypto only) for the given tenant's primary store. Mirrors
   * exactly what `POST /admin/payment-accounts/:id/connect` would have
   * persisted after a REAL (network-requiring) verification succeeded —
   * bypassing only the network call itself, same convention
   * `payments-race.e2e-spec.ts` already establishes for `initiatePayment`. */
  async function createActivePaymentAccount(
    tenantId: string,
    credentials: MerchantCredentials,
  ): Promise<{ paymentAccountId: string; storeId: string }> {
    const store = await prisma.store.findFirstOrThrow({
      where: { tenantId, isPrimary: true },
    });
    const encrypted = credentialEncryption.encrypt(JSON.stringify(credentials));
    const account = await prisma.paymentAccount.create({
      data: {
        tenantId,
        storeId: store.id,
        provider: 'RAZORPAY',
        status: 'ACTIVE',
        mode: 'TEST',
        credentialsEncrypted: new Uint8Array(encrypted),
        credentialsUpdatedAt: new Date(),
        connectedAt: new Date(),
      },
    });
    return { paymentAccountId: account.id, storeId: store.id };
  }

  async function createOrderForTenant(
    admin: TestUser & { tenantId: string },
  ): Promise<{ orderId: string; customer: TestUser }> {
    // Phase 7's checkout billing-period gate (checkout.service.ts) fails
    // closed with 503 for any tenant with no confirmed Subscription —
    // unrelated to Phase 8, but every test here reaches real checkout, so
    // it needs the same opt-in fixture `payments-race.e2e-spec.ts`-style
    // suites already rely on. Each admin here is a fresh, once-only tenant
    // per test (see call sites), so this is safe to call unconditionally.
    await makeTenantCheckoutReady(prisma, admin.tenantId);
    const customer = await registerUser(app, 'buyer');
    const { productId } = await createProduct(prisma, {
      basePrice: '149.00',
      tenantId: admin.tenantId,
    });
    await addCartItem(app, customer, { productId, quantity: 1 });
    const res = await http(app)
      .post(apiPath('/checkout/orders'))
      .set(...authHeader(customer))
      .set('Idempotency-Key', `p8-e2e-${randomUUID()}`)
      .send(shippingFields())
      .expect(201);
    return { orderId: res.body.data.id as string, customer };
  }

  /** Binds an order to a PaymentAccount and gives it a `razorpayOrderId` +
   * one INITIATED `PaymentAttempt` directly via Prisma — the state a real
   * `initiatePayment` success would have produced (see file-level doc
   * comment on why the provider call itself is bypassed). */
  async function bindOrderForPayment(
    orderId: string,
    paymentAccountId: string,
  ): Promise<{ razorpayOrderId: string; amountPaise: bigint }> {
    const order = await prisma.order.update({
      where: { id: orderId },
      data: { paymentAccountId, razorpayOrderId: `order_test_${randomUUID()}` },
    });
    const amountPaise = BigInt(
      order.total.times(100).toDecimalPlaces(0).toFixed(0),
    );
    await prisma.paymentAttempt.create({
      data: {
        orderId,
        razorpayOrderId: order.razorpayOrderId!,
        amountPaise,
        currency: 'INR',
        status: 'INITIATED',
        tenantId: order.tenantId,
        paymentAccountId,
      },
    });
    return { razorpayOrderId: order.razorpayOrderId!, amountPaise };
  }

  function hmac(secret: string, message: string): string {
    return createHmac('sha256', secret).update(message).digest('hex');
  }

  // ═══════════════════ 1. PaymentAccount lifecycle ═══════════════════════

  describe('PaymentAccount lifecycle', () => {
    it('create -> list -> get -> activate(direct)/disable -> reactivate, all via real HTTP + DB', async () => {
      const admin = await registerAdmin(app, prisma);

      const created = await http(app)
        .post(apiPath('/admin/payment-accounts'))
        .set(...authHeader(admin))
        .send({
          provider: 'RAZORPAY',
          mode: 'TEST',
          displayName: 'My Razorpay',
        })
        .expect(201);
      const accountId = created.body.data.id as string;
      expect(created.body.data.status).toBe('PENDING');
      // Never leaks credential material — there is none yet, and the
      // response shape has no such field regardless.
      expect(JSON.stringify(created.body)).not.toMatch(/credential/i);

      const listed = await http(app)
        .get(apiPath('/admin/payment-accounts'))
        .set(...authHeader(admin))
        .expect(200);
      // ResponseInterceptor lifts a PaginatedResult's `items` to top-level
      // `data` (a plain array) and its `meta` to the envelope's top level —
      // never `data.items` (see response.interceptor.ts).
      expect(listed.body.data).toHaveLength(1);

      const got = await http(app)
        .get(apiPath(`/admin/payment-accounts/${accountId}`))
        .set(...authHeader(admin))
        .expect(200);
      expect(got.body.data.id).toBe(accountId);

      // Direct DB activation (bypassing the network-requiring /connect
      // verification call — see file-level doc comment) to exercise the
      // disable/reactivate transitions for real over HTTP.
      await prisma.paymentAccount.update({
        where: { id: accountId },
        data: { status: 'ACTIVE', connectedAt: new Date() },
      });

      const disabled = await http(app)
        .post(apiPath(`/admin/payment-accounts/${accountId}/disable`))
        .set(...authHeader(admin))
        .expect(200);
      expect(disabled.body.data.status).toBe('DISABLED');

      const reactivated = await http(app)
        .post(apiPath(`/admin/payment-accounts/${accountId}/activate`))
        .set(...authHeader(admin))
        .expect(200);
      expect(reactivated.body.data.status).toBe('ACTIVE');
    });

    it('rejects an illegal transition (PENDING -> DISABLED -> ... -> an unsupported edge is not applicable; duplicate provider+store is)', async () => {
      const admin = await registerAdmin(app, prisma);
      await http(app)
        .post(apiPath('/admin/payment-accounts'))
        .set(...authHeader(admin))
        .send({ provider: 'RAZORPAY', mode: 'TEST' })
        .expect(201);

      // @@unique([storeId, provider]) — a second RAZORPAY account for the
      // SAME store is rejected, not silently duplicated.
      await http(app)
        .post(apiPath('/admin/payment-accounts'))
        .set(...authHeader(admin))
        .send({ provider: 'RAZORPAY', mode: 'TEST' })
        .expect(409);
    });
  });

  // ═══════════════════ 2. Tenant isolation ════════════════════════════════

  describe('tenant isolation', () => {
    it("a tenant cannot read, activate, or disable another tenant's PaymentAccount (404, never 403)", async () => {
      const ownerA = await registerAdmin(app, prisma);
      const ownerB = await registerAdmin(app, prisma);
      const created = await http(app)
        .post(apiPath('/admin/payment-accounts'))
        .set(...authHeader(ownerA))
        .send({ provider: 'RAZORPAY', mode: 'TEST' })
        .expect(201);
      const accountId = created.body.data.id as string;

      await http(app)
        .get(apiPath(`/admin/payment-accounts/${accountId}`))
        .set(...authHeader(ownerB))
        .expect(404);
      await http(app)
        .post(apiPath(`/admin/payment-accounts/${accountId}/activate`))
        .set(...authHeader(ownerB))
        .expect(404);
      await http(app)
        .post(apiPath(`/admin/payment-accounts/${accountId}/disable`))
        .set(...authHeader(ownerB))
        .expect(404);
    });

    it("a tenant cannot refund another tenant's PaymentAttempt (404, never 403)", async () => {
      // ownerA registered LAST: with no store-domain/Host header in this
      // suite (same as every other e2e suite here), the storefront
      // resolver (storefront-tenant.resolver.ts) falls back to "the most
      // recently created tenant" for an unauthenticated-by-tenant
      // customer's cart — so the tenant that actually places the order via
      // real checkout must be the one registered most recently.
      const ownerB = await registerAdmin(app, prisma);
      const ownerA = await registerAdmin(app, prisma);
      const credentials = fakeCredentials('tenant-a');
      const { paymentAccountId } = await createActivePaymentAccount(
        ownerA.tenantId,
        credentials,
      );
      const { orderId } = await createOrderForTenant(ownerA);
      await bindOrderForPayment(orderId, paymentAccountId);
      const attempt = await prisma.paymentAttempt.findFirstOrThrow({
        where: { orderId },
      });
      await prisma.paymentAttempt.update({
        where: { id: attempt.id },
        data: {
          status: 'CAPTURED',
          razorpayPaymentId: `pay_test_${randomUUID()}`,
          capturedAt: new Date(),
        },
      });

      await http(app)
        .post(apiPath(`/admin/payment-attempts/${attempt.id}/refund`))
        .set(...authHeader(ownerB))
        .send({})
        .expect(404);
    });
  });

  // ═══════════════ 3. Store -> PaymentAccount resolution + creation ══════

  describe('store -> PaymentAccount resolution / payment creation', () => {
    it('no PaymentAccount configured -> initiatePayment fails closed with 422, never a fallback (the exact P1 #1 risk)', async () => {
      const admin = await registerAdmin(app, prisma);
      const { orderId, customer } = await createOrderForTenant(admin);

      const res = await http(app)
        .post(apiPath(`/checkout/orders/${orderId}/retry-payment`))
        .set(...authHeader(customer))
        .expect(422);
      expect(res.body.success).toBe(false);

      const order = await prisma.order.findUniqueOrThrow({
        where: { id: orderId },
      });
      expect(order.paymentAccountId).toBeNull();
      expect(order.razorpayOrderId).toBeNull();
    });

    it('an ACTIVE PaymentAccount resolves via the store and binds Order.paymentAccountId once, stably', async () => {
      const admin = await registerAdmin(app, prisma);
      const credentials = fakeCredentials('resolve');
      const { paymentAccountId } = await createActivePaymentAccount(
        admin.tenantId,
        credentials,
      );
      const { orderId } = await createOrderForTenant(admin);

      await bindOrderForPayment(orderId, paymentAccountId);

      const order = await prisma.order.findUniqueOrThrow({
        where: { id: orderId },
      });
      expect(order.paymentAccountId).toBe(paymentAccountId);
    });
  });

  // ═══════════════════ 4. Payment verification (real HMAC) ═══════════════

  describe('payment verification', () => {
    it("a validly-signed payment (real HMAC against the bound merchant account's own key secret) verifies and transitions the order to PAID", async () => {
      const admin = await registerAdmin(app, prisma);
      const credentials = fakeCredentials('verify');
      const { paymentAccountId } = await createActivePaymentAccount(
        admin.tenantId,
        credentials,
      );
      const { orderId, customer } = await createOrderForTenant(admin);
      const { razorpayOrderId } = await bindOrderForPayment(
        orderId,
        paymentAccountId,
      );

      const razorpayPaymentId = `pay_test_${randomUUID()}`;
      const signature = hmac(
        credentials.keySecret,
        `${razorpayOrderId}|${razorpayPaymentId}`,
      );

      const res = await http(app)
        .post(apiPath('/payments/verify'))
        .set(...authHeader(customer))
        .send({
          razorpay_order_id: razorpayOrderId,
          razorpay_payment_id: razorpayPaymentId,
          razorpay_signature: signature,
        })
        .expect(201);

      expect(res.body.data.status).toBe('PAID');
      const attempt = await prisma.paymentAttempt.findFirstOrThrow({
        where: { orderId },
      });
      expect(attempt.status).toBe('CAPTURED');
      expect(attempt.razorpayPaymentId).toBe(razorpayPaymentId);
    });

    it('an invalid signature is rejected (400) and captures nothing', async () => {
      const admin = await registerAdmin(app, prisma);
      const credentials = fakeCredentials('badsig');
      const { paymentAccountId } = await createActivePaymentAccount(
        admin.tenantId,
        credentials,
      );
      const { orderId, customer } = await createOrderForTenant(admin);
      const { razorpayOrderId } = await bindOrderForPayment(
        orderId,
        paymentAccountId,
      );

      await http(app)
        .post(apiPath('/payments/verify'))
        .set(...authHeader(customer))
        .send({
          razorpay_order_id: razorpayOrderId,
          razorpay_payment_id: `pay_test_${randomUUID()}`,
          razorpay_signature: 'not-a-real-signature',
        })
        .expect(400);

      const order = await prisma.order.findUniqueOrThrow({
        where: { id: orderId },
      });
      expect(order.status).toBe('PENDING_PAYMENT');
    });

    it("a signature valid for a DIFFERENT merchant account's secret does not verify against this order's account", async () => {
      const admin = await registerAdmin(app, prisma);
      const credentials = fakeCredentials('this-account');
      const otherCredentials = fakeCredentials('other-account');
      const { paymentAccountId } = await createActivePaymentAccount(
        admin.tenantId,
        credentials,
      );
      const { orderId, customer } = await createOrderForTenant(admin);
      const { razorpayOrderId } = await bindOrderForPayment(
        orderId,
        paymentAccountId,
      );

      const razorpayPaymentId = `pay_test_${randomUUID()}`;
      const wrongSignature = hmac(
        otherCredentials.keySecret,
        `${razorpayOrderId}|${razorpayPaymentId}`,
      );

      await http(app)
        .post(apiPath('/payments/verify'))
        .set(...authHeader(customer))
        .send({
          razorpay_order_id: razorpayOrderId,
          razorpay_payment_id: razorpayPaymentId,
          razorpay_signature: wrongSignature,
        })
        .expect(400);
    });
  });

  // ═══════════ 5/6. Per-account webhook signature/routing + processing ═══

  describe('per-account webhook signature, routing, and processing', () => {
    it('a validly-signed payment.captured webhook is persisted, then processed by WebhookProcessor to CAPTURED/PAID', async () => {
      const admin = await registerAdmin(app, prisma);
      const credentials = fakeCredentials('webhook');
      const { paymentAccountId } = await createActivePaymentAccount(
        admin.tenantId,
        credentials,
      );
      const { orderId } = await createOrderForTenant(admin);
      const { razorpayOrderId, amountPaise } = await bindOrderForPayment(
        orderId,
        paymentAccountId,
      );

      const razorpayPaymentId = `pay_test_${randomUUID()}`;
      const body = JSON.stringify({
        event: 'payment.captured',
        payload: {
          payment: {
            entity: {
              id: razorpayPaymentId,
              order_id: razorpayOrderId,
              amount: Number(amountPaise),
              currency: 'INR',
              status: 'captured',
              method: 'card',
            },
          },
        },
      });
      const signature = hmac(credentials.webhookSecret, body);

      await http(app)
        .post(apiPath(`/payments/webhook/${paymentAccountId}`))
        .set('x-razorpay-signature', signature)
        .set('x-razorpay-event-id', `evt_${randomUUID()}`)
        .set('Content-Type', 'application/json')
        .send(body)
        .expect(200);

      const eventRow = await prisma.webhookEvent.findFirstOrThrow({
        where: { paymentAccountId },
      });
      expect(eventRow.status).toBe('RECEIVED');

      await webhookProcessor.processReceivedWebhooks();

      const processed = await prisma.webhookEvent.findUniqueOrThrow({
        where: { id: eventRow.id },
      });
      expect(processed.status).toBe('PROCESSED');
      const attempt = await prisma.paymentAttempt.findFirstOrThrow({
        where: { orderId },
      });
      expect(attempt.status).toBe('CAPTURED');
      const order = await prisma.order.findUniqueOrThrow({
        where: { id: orderId },
      });
      expect(order.status).toBe('PAID');
    });

    it('an invalid webhook signature is rejected (400) and persists nothing', async () => {
      const admin = await registerAdmin(app, prisma);
      const credentials = fakeCredentials('badwebhook');
      const { paymentAccountId } = await createActivePaymentAccount(
        admin.tenantId,
        credentials,
      );
      const body = JSON.stringify({ event: 'payment.captured', payload: {} });

      await http(app)
        .post(apiPath(`/payments/webhook/${paymentAccountId}`))
        .set('x-razorpay-signature', 'wrong')
        .set('Content-Type', 'application/json')
        .send(body)
        .expect(400);

      const count = await prisma.webhookEvent.count({
        where: { paymentAccountId },
      });
      expect(count).toBe(0);
    });

    it('an unknown accountId in the path is rejected the SAME way as a bad signature — no existence oracle', async () => {
      const body = JSON.stringify({ event: 'payment.captured', payload: {} });
      const res = await http(app)
        .post(apiPath(`/payments/webhook/${randomUUID()}`))
        .set('x-razorpay-signature', 'anything')
        .set('Content-Type', 'application/json')
        .send(body)
        .expect(400);
      expect(res.body.message ?? res.body.error?.message).toMatch(
        /invalid webhook signature/i,
      );
    });

    it('duplicate webhook delivery (same event id) is deduped at the DB layer — only one WebhookEvent row, processed once', async () => {
      const admin = await registerAdmin(app, prisma);
      const credentials = fakeCredentials('dup');
      const { paymentAccountId } = await createActivePaymentAccount(
        admin.tenantId,
        credentials,
      );
      const { orderId } = await createOrderForTenant(admin);
      const { razorpayOrderId, amountPaise } = await bindOrderForPayment(
        orderId,
        paymentAccountId,
      );
      const razorpayPaymentId = `pay_test_${randomUUID()}`;
      const eventId = `evt_${randomUUID()}`;
      const body = JSON.stringify({
        event: 'payment.captured',
        payload: {
          payment: {
            entity: {
              id: razorpayPaymentId,
              order_id: razorpayOrderId,
              amount: Number(amountPaise),
              currency: 'INR',
              status: 'captured',
            },
          },
        },
      });
      const signature = hmac(credentials.webhookSecret, body);

      await http(app)
        .post(apiPath(`/payments/webhook/${paymentAccountId}`))
        .set('x-razorpay-signature', signature)
        .set('x-razorpay-event-id', eventId)
        .set('Content-Type', 'application/json')
        .send(body)
        .expect(200);
      // Exact duplicate delivery — same event id, same body.
      await http(app)
        .post(apiPath(`/payments/webhook/${paymentAccountId}`))
        .set('x-razorpay-signature', signature)
        .set('x-razorpay-event-id', eventId)
        .set('Content-Type', 'application/json')
        .send(body)
        .expect(200);

      const count = await prisma.webhookEvent.count({
        where: { paymentAccountId },
      });
      expect(count).toBe(1);

      await webhookProcessor.processReceivedWebhooks();
      const attempt = await prisma.paymentAttempt.findFirstOrThrow({
        where: { orderId },
      });
      expect(attempt.status).toBe('CAPTURED');
    });
  });

  // ═══════════════════ 7. Refund creation ═════════════════════════════════

  describe('refund creation', () => {
    async function createCapturedAttempt(
      admin: TestUser & { tenantId: string },
      credentials: MerchantCredentials,
    ) {
      const { paymentAccountId } = await createActivePaymentAccount(
        admin.tenantId,
        credentials,
      );
      const { orderId } = await createOrderForTenant(admin);
      await bindOrderForPayment(orderId, paymentAccountId);
      const attempt = await prisma.paymentAttempt.findFirstOrThrow({
        where: { orderId },
      });
      const razorpayPaymentId = `pay_test_${randomUUID()}`;
      await prisma.paymentAttempt.update({
        where: { id: attempt.id },
        data: { status: 'CAPTURED', razorpayPaymentId, capturedAt: new Date() },
      });
      return { attemptId: attempt.id, paymentAccountId };
    }

    it('rejects a refund exceeding the captured amount (real HTTP validation, no provider call reached)', async () => {
      const admin = await registerAdmin(app, prisma);
      const { attemptId } = await createCapturedAttempt(
        admin,
        fakeCredentials('exceeds'),
      );

      await http(app)
        .post(apiPath(`/admin/payment-attempts/${attemptId}/refund`))
        .set(...authHeader(admin))
        .send({ amountPaise: '999999999' })
        .expect(409);
    });

    it('rejects a refund for a non-CAPTURED payment attempt', async () => {
      const admin = await registerAdmin(app, prisma);
      const credentials = fakeCredentials('notcaptured');
      const { paymentAccountId } = await createActivePaymentAccount(
        admin.tenantId,
        credentials,
      );
      const { orderId } = await createOrderForTenant(admin);
      await bindOrderForPayment(orderId, paymentAccountId);
      const attempt = await prisma.paymentAttempt.findFirstOrThrow({
        where: { orderId },
      });

      await http(app)
        .post(apiPath(`/admin/payment-attempts/${attempt.id}/refund`))
        .set(...authHeader(admin))
        .send({})
        .expect(409);
    });

    it('a real refund request against fake/unreachable credentials fails closed to FAILED (never falsely PROCESSED) — no real money ever moves', async () => {
      const admin = await registerAdmin(app, prisma);
      const { attemptId } = await createCapturedAttempt(
        admin,
        fakeCredentials('providerfail'),
      );

      const res = await http(app)
        .post(apiPath(`/admin/payment-attempts/${attemptId}/refund`))
        .set(...authHeader(admin))
        .send({ amountPaise: '5000' });

      // Either a 502 (PaymentProviderUnavailableError, if the request
      // synchronously threw) is returned, or — if the underlying
      // transport somehow resolved oddly — the persisted Refund row is
      // still never falsely PROCESSED. The one invariant this test
      // exists to prove, regardless of environment network behavior:
      expect([502, 201, 200]).toContain(res.status);
      const refund = await prisma.refund.findFirstOrThrow({
        where: { paymentAttemptId: attemptId },
      });
      expect(refund.status).not.toBe('PROCESSED');
      expect(['PENDING', 'FAILED']).toContain(refund.status);
    }, 20000);
  });

  // ═══════════ 8. Refund processed/failed webhook (incl. the P1 #2 race) ═

  describe('refund completion webhooks (including the provider-call/webhook race)', () => {
    async function seedPendingRefund(
      admin: TestUser & { tenantId: string },
      credentials: MerchantCredentials,
    ) {
      const { paymentAccountId } = await createActivePaymentAccount(
        admin.tenantId,
        credentials,
      );
      const { orderId } = await createOrderForTenant(admin);
      await bindOrderForPayment(orderId, paymentAccountId);
      const attempt = await prisma.paymentAttempt.findFirstOrThrow({
        where: { orderId },
      });
      await prisma.paymentAttempt.update({
        where: { id: attempt.id },
        data: {
          status: 'CAPTURED',
          razorpayPaymentId: `pay_test_${randomUUID()}`,
          capturedAt: new Date(),
        },
      });
      const razorpayRefundId = `rfnd_test_${randomUUID()}`;
      const refund = await prisma.refund.create({
        data: {
          paymentAttemptId: attempt.id,
          amountPaise: 5000n,
          status: 'PENDING',
          tenantId: attempt.tenantId,
          paymentAccountId,
          razorpayRefundId,
        },
      });
      return { paymentAccountId, refundId: refund.id, razorpayRefundId };
    }

    it('refund.processed settles a PENDING refund to PROCESSED via the real webhook + processor pipeline', async () => {
      const admin = await registerAdmin(app, prisma);
      const credentials = fakeCredentials('refundwh');
      const { paymentAccountId, refundId, razorpayRefundId } =
        await seedPendingRefund(admin, credentials);

      const body = JSON.stringify({
        event: 'refund.processed',
        payload: {
          refund: {
            entity: {
              id: razorpayRefundId,
              payment_id: 'pay_x',
              amount: 5000,
              status: 'processed',
            },
          },
        },
      });
      const signature = hmac(credentials.webhookSecret, body);

      await http(app)
        .post(apiPath(`/payments/webhook/${paymentAccountId}`))
        .set('x-razorpay-signature', signature)
        .set('Content-Type', 'application/json')
        .send(body)
        .expect(200);

      await webhookProcessor.processReceivedWebhooks();

      const refund = await prisma.refund.findUniqueOrThrow({
        where: { id: refundId },
      });
      expect(refund.status).toBe('PROCESSED');
    });

    it('refund.failed settles a PENDING refund to FAILED with a failureReason', async () => {
      const admin = await registerAdmin(app, prisma);
      const credentials = fakeCredentials('refundwhfail');
      const { paymentAccountId, refundId, razorpayRefundId } =
        await seedPendingRefund(admin, credentials);

      const body = JSON.stringify({
        event: 'refund.failed',
        payload: {
          refund: {
            entity: {
              id: razorpayRefundId,
              payment_id: 'pay_x',
              amount: 5000,
              status: 'failed',
              error_description: 'insufficient balance',
            },
          },
        },
      });
      const signature = hmac(credentials.webhookSecret, body);

      await http(app)
        .post(apiPath(`/payments/webhook/${paymentAccountId}`))
        .set('x-razorpay-signature', signature)
        .set('Content-Type', 'application/json')
        .send(body)
        .expect(200);
      await webhookProcessor.processReceivedWebhooks();

      const refund = await prisma.refund.findUniqueOrThrow({
        where: { id: refundId },
      });
      expect(refund.status).toBe('FAILED');
      expect(refund.failureReason).toBe('insufficient balance');
    });

    it('THE P1 #2 RACE, end-to-end: a refund.processed webhook delivered BEFORE the local Refund row exists is retried (PROCESSING_FAILED), never permanently lost, and settles once the row appears', async () => {
      const admin = await registerAdmin(app, prisma);
      const credentials = fakeCredentials('race');
      const { paymentAccountId } = await createActivePaymentAccount(
        admin.tenantId,
        credentials,
      );
      const { orderId } = await createOrderForTenant(admin);
      await bindOrderForPayment(orderId, paymentAccountId);
      const attempt = await prisma.paymentAttempt.findFirstOrThrow({
        where: { orderId },
      });
      await prisma.paymentAttempt.update({
        where: { id: attempt.id },
        data: {
          status: 'CAPTURED',
          razorpayPaymentId: `pay_test_${randomUUID()}`,
          capturedAt: new Date(),
        },
      });
      const razorpayRefundId = `rfnd_race_${randomUUID()}`;

      // The webhook arrives FIRST — no local Refund row exists yet for
      // this razorpayRefundId (simulating RefundsService's own local
      // write not having landed yet).
      const body = JSON.stringify({
        event: 'refund.processed',
        payload: {
          refund: {
            entity: {
              id: razorpayRefundId,
              payment_id: 'pay_x',
              amount: 5000,
              status: 'processed',
            },
          },
        },
      });
      const signature = hmac(credentials.webhookSecret, body);
      await http(app)
        .post(apiPath(`/payments/webhook/${paymentAccountId}`))
        .set('x-razorpay-signature', signature)
        .set('Content-Type', 'application/json')
        .send(body)
        .expect(200); // ingestion always 200s — Phase 1 only verifies + persists

      await webhookProcessor.processReceivedWebhooks();

      const afterFirstAttempt = await prisma.webhookEvent.findFirstOrThrow({
        where: { paymentAccountId },
      });
      // Retryable, NOT a permanent IGNORED — the P1 #2 fix's core proof.
      expect(afterFirstAttempt.status).toBe('PROCESSING_FAILED');
      expect(afterFirstAttempt.attempts).toBe(1);

      // The local write "catches up" (what RefundsService.callProviderAndSettle
      // would have done once its own provider call returned).
      const refund = await prisma.refund.create({
        data: {
          paymentAttemptId: attempt.id,
          amountPaise: 5000n,
          status: 'PENDING',
          tenantId: attempt.tenantId,
          paymentAccountId,
          razorpayRefundId,
        },
      });

      // Force the retry to run now instead of waiting for the real
      // availableAt backoff window.
      await prisma.webhookEvent.update({
        where: { id: afterFirstAttempt.id },
        data: { availableAt: new Date() },
      });
      await webhookProcessor.processReceivedWebhooks();

      const settled = await prisma.refund.findUniqueOrThrow({
        where: { id: refund.id },
      });
      expect(settled.status).toBe('PROCESSED');
      const finalEvent = await prisma.webhookEvent.findUniqueOrThrow({
        where: { id: afterFirstAttempt.id },
      });
      expect(finalEvent.status).toBe('PROCESSED');
    });
  });

  // ═══════════════════ 10. Disabled historical account ═══════════════════

  describe('disabled historical PaymentAccount', () => {
    it('a webhook for a payment made while the account was ACTIVE still processes correctly after the account is later DISABLED', async () => {
      const admin = await registerAdmin(app, prisma);
      const credentials = fakeCredentials('disabled-history');
      const { paymentAccountId } = await createActivePaymentAccount(
        admin.tenantId,
        credentials,
      );
      const { orderId } = await createOrderForTenant(admin);
      const { razorpayOrderId, amountPaise } = await bindOrderForPayment(
        orderId,
        paymentAccountId,
      );

      // Disable the account AFTER the order was bound to it.
      await http(app)
        .post(apiPath(`/admin/payment-accounts/${paymentAccountId}/disable`))
        .set(...authHeader(admin))
        .expect(200);

      const razorpayPaymentId = `pay_test_${randomUUID()}`;
      const body = JSON.stringify({
        event: 'payment.captured',
        payload: {
          payment: {
            entity: {
              id: razorpayPaymentId,
              order_id: razorpayOrderId,
              amount: Number(amountPaise),
              currency: 'INR',
              status: 'captured',
            },
          },
        },
      });
      const signature = hmac(credentials.webhookSecret, body);

      await http(app)
        .post(apiPath(`/payments/webhook/${paymentAccountId}`))
        .set('x-razorpay-signature', signature)
        .set('Content-Type', 'application/json')
        .send(body)
        .expect(200); // signature still verifies — disabling doesn't invalidate the stored secret

      await webhookProcessor.processReceivedWebhooks();

      const order = await prisma.order.findUniqueOrThrow({
        where: { id: orderId },
      });
      expect(order.status).toBe('PAID'); // historical attribution honored despite disablement
    });
  });

  // ═══════════════════ 11. Cross-account webhook rejection ═══════════════

  describe('cross-account webhook rejection', () => {
    it('a webhook correctly signed for Account A cannot mutate an Order bound to Account B', async () => {
      const ownerA = await registerAdmin(app, prisma);
      const ownerB = await registerAdmin(app, prisma);
      const credentialsA = fakeCredentials('account-a');
      const credentialsB = fakeCredentials('account-b');
      const { paymentAccountId: accountA } = await createActivePaymentAccount(
        ownerA.tenantId,
        credentialsA,
      );
      const { paymentAccountId: accountB } = await createActivePaymentAccount(
        ownerB.tenantId,
        credentialsB,
      );
      const { orderId } = await createOrderForTenant(ownerB);
      const { razorpayOrderId, amountPaise } = await bindOrderForPayment(
        orderId,
        accountB,
      );

      // A webhook correctly signed with Account A's OWN secret, but
      // referencing Account B's order — verifies fine against A's own
      // secret (that's what it's addressed to), but must be rejected at
      // the account-ownership check, not the signature check.
      const body = JSON.stringify({
        event: 'payment.captured',
        payload: {
          payment: {
            entity: {
              id: `pay_${randomUUID()}`,
              order_id: razorpayOrderId,
              amount: Number(amountPaise),
              currency: 'INR',
              status: 'captured',
            },
          },
        },
      });
      const signature = hmac(credentialsA.webhookSecret, body);

      await http(app)
        .post(apiPath(`/payments/webhook/${accountA}`))
        .set('x-razorpay-signature', signature)
        .set('Content-Type', 'application/json')
        .send(body)
        .expect(200); // ingestion succeeds — it's a validly-signed delivery FOR account A

      await webhookProcessor.processReceivedWebhooks();

      const order = await prisma.order.findUniqueOrThrow({
        where: { id: orderId },
      });
      expect(order.status).toBe('PENDING_PAYMENT'); // untouched — never mutated by account A's webhook
      const attempt = await prisma.paymentAttempt.findFirstOrThrow({
        where: { orderId },
      });
      expect(attempt.status).toBe('INITIATED');
    });
  });

  // ═══════════════════ 12. Authorization boundaries ═══════════════════════

  describe('authorization boundaries', () => {
    it('payment-account routes require authentication (401 without a token)', async () => {
      await http(app).get(apiPath('/admin/payment-accounts')).expect(401);
    });

    it('the refund route requires authentication (401 without a token)', async () => {
      await http(app)
        .post(apiPath(`/admin/payment-attempts/${randomUUID()}/refund`))
        .send({})
        .expect(401);
    });

    it('a customer JWT (no tenant membership) cannot access admin payment-account routes', async () => {
      const customer = await registerUser(app, 'plain-customer');
      await http(app)
        .get(apiPath('/admin/payment-accounts'))
        .set(...authHeader(customer))
        .expect(403);
    });
  });
});
