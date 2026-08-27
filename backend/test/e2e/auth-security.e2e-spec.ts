import { randomUUID } from 'crypto';
import { INestApplication } from '@nestjs/common';
import { resetDatabase } from './support/db';
import { createTestApp } from './support/test-app';
import {
  addCartItem,
  apiPath,
  authHeader,
  createProduct,
  createUploadedFile,
  http,
  registerAdmin,
  registerUser,
  shippingFields,
  TEST_PASSWORD,
  TestUser,
} from './support/fixtures';
import { PrismaService } from '../../src/common/database/prisma.service';

const REFRESH_COOKIE_NAME = 'pf_refresh_token';

function extractCookie(res: { headers: Record<string, unknown> }): string {
  const raw = res.headers['set-cookie'] as string[] | undefined;
  const cookie = raw?.find((c) => c.startsWith(`${REFRESH_COOKIE_NAME}=`));
  if (!cookie) {
    throw new Error(`No ${REFRESH_COOKIE_NAME} cookie in response`);
  }
  return cookie.split(';')[0];
}

describe('Cross-user access & auth security (§27 #2, #6, #7)', () => {
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

  describe("#2 — every customer-scoped endpoint rejects access to another user's resource", () => {
    it("orders: GET /orders/:id (403) and GET /orders (never lists the other user's orders)", async () => {
      const owner = await registerUser(app, 'owner');
      const intruder = await registerUser(app, 'intruder');
      const { productId } = await createProduct(prisma, { basePrice: '30.00' });
      await addCartItem(app, owner, { productId, quantity: 1 });
      const checkoutRes = await http(app)
        .post(apiPath('/checkout/orders'))
        .set(...authHeader(owner))
        .set('Idempotency-Key', `idor-orders-${randomUUID()}`)
        .send(shippingFields())
        .expect(201);
      const orderId = checkoutRes.body.data.id as string;

      const res = await http(app)
        .get(apiPath(`/orders/${orderId}`))
        .set(...authHeader(intruder))
        .expect(403);
      expect(res.body.success).toBe(false);

      const listRes = await http(app)
        .get(apiPath('/orders'))
        .set(...authHeader(intruder))
        .expect(200);
      expect(listRes.body.data).toHaveLength(0);

      await http(app)
        .post(apiPath(`/orders/${orderId}/cancel`))
        .set(...authHeader(intruder))
        .send({})
        .expect(403);
    });

    it("cart: PATCH/DELETE another user's cart item is rejected (404 — not found for this requester's cart)", async () => {
      const owner = await registerUser(app, 'owner');
      const intruder = await registerUser(app, 'intruder');
      const { productId } = await createProduct(prisma);
      const item = await addCartItem(app, owner, { productId, quantity: 1 });

      await http(app)
        .patch(apiPath(`/cart/items/${item.id}`))
        .set(...authHeader(intruder))
        .send({ quantity: 2 })
        .expect(404);

      await http(app)
        .delete(apiPath(`/cart/items/${item.id}`))
        .set(...authHeader(intruder))
        .expect(404);

      // Owner's item is untouched.
      const ownerCart = await http(app)
        .get(apiPath('/cart'))
        .set(...authHeader(owner))
        .expect(200);
      expect(ownerCart.body.data.items).toHaveLength(1);
      expect(ownerCart.body.data.items[0].quantity).toBe(1);
    });

    it('uploads: GET /uploads/:id for a file owned by another user is rejected (403)', async () => {
      const owner = await registerUser(app, 'owner');
      const intruder = await registerUser(app, 'intruder');
      const fileId = await createUploadedFile(prisma, owner.id);

      await http(app)
        .get(apiPath(`/uploads/${fileId}`))
        .set(...authHeader(intruder))
        .expect(403);

      await http(app)
        .get(apiPath(`/uploads/${fileId}`))
        .set(...authHeader(owner))
        .expect(200);
    });

    it("users/me: a user's token only ever reads/writes their own profile, never another's", async () => {
      const userA = await registerUser(app, 'usera');
      const userB = await registerUser(app, 'userb');

      const meA = await http(app)
        .get(apiPath('/users/me'))
        .set(...authHeader(userA))
        .expect(200);
      expect(meA.body.data.email).toBe(userA.email);

      await http(app)
        .patch(apiPath('/users/me'))
        .set(...authHeader(userB))
        .send({ city: 'Mumbai' })
        .expect(200);

      const meAAfter = await http(app)
        .get(apiPath('/users/me'))
        .set(...authHeader(userA))
        .expect(200);
      // userA's profile must be unaffected by userB's own PATCH /users/me.
      expect(meAAfter.body.data.city).not.toBe('Mumbai');
    });

    it("reviews: PATCH/DELETE another user's review is rejected (403), the review itself untouched", async () => {
      const owner = await registerUser(app, 'revowner');
      const intruder = await registerUser(app, 'revintruder');
      const { productId } = await createProduct(prisma, { basePrice: '15.00' });
      await addCartItem(app, owner, { productId, quantity: 1 });
      const checkoutRes = await http(app)
        .post(apiPath('/checkout/orders'))
        .set(...authHeader(owner))
        .set('Idempotency-Key', `idor-review-${randomUUID()}`)
        .send(shippingFields())
        .expect(201);
      const orderId = checkoutRes.body.data.id as string;

      // Verified-purchase gate requires DELIVERED — no admin API call
      // needed here (out of scope), a direct write is exactly what the
      // real admin status-transition chain would have produced.
      await prisma.order.update({
        where: { id: orderId },
        data: { status: 'DELIVERED' },
      });

      const createRes = await http(app)
        .post(apiPath('/reviews'))
        .set(...authHeader(owner))
        .send({ productId, rating: 5, bodyText: 'Great product' })
        .expect(201);
      const reviewId = createRes.body.data.id as string;

      await http(app)
        .patch(apiPath(`/reviews/${reviewId}`))
        .set(...authHeader(intruder))
        .send({ rating: 1 })
        .expect(403);

      await http(app)
        .delete(apiPath(`/reviews/${reviewId}`))
        .set(...authHeader(intruder))
        .expect(403);

      const review = await prisma.review.findUniqueOrThrow({
        where: { id: reviewId },
      });
      expect(review.rating).toBe(5);
      expect(review.status).toBe('PUBLISHED');
    });
  });

  it('#6 — a replayed, already-rotated refresh token triggers full-chain revocation', async () => {
    const email = `refresh-${randomUUID()}@example.test`;
    const registerRes = await http(app)
      .post(apiPath('/auth/register'))
      .send({ email, password: TEST_PASSWORD })
      .expect(201);
    const originalAccessToken = registerRes.body.data.accessToken as string;
    const firstRefreshCookie = extractCookie(registerRes);

    // First rotation: legitimate use, succeeds and issues a new cookie.
    const rotateRes = await http(app)
      .post(apiPath('/auth/refresh'))
      .set('Cookie', firstRefreshCookie)
      .expect(200);
    const secondRefreshCookie = extractCookie(rotateRes);
    expect(secondRefreshCookie).not.toBe(firstRefreshCookie);

    // Replay of the now-rotated (revoked) first cookie: reuse detection.
    const replayRes = await http(app)
      .post(apiPath('/auth/refresh'))
      .set('Cookie', firstRefreshCookie)
      .expect(401);
    expect(replayRes.body.error.message).toMatch(/reuse detected/i);

    // Full-chain revocation means the SECOND (legitimately rotated) cookie
    // is also now dead, even though it was never itself replayed.
    await http(app)
      .post(apiPath('/auth/refresh'))
      .set('Cookie', secondRefreshCookie)
      .expect(401);

    // tokenVersion was bumped, so even the original, not-yet-expired
    // access token is instantly invalidated.
    await http(app)
      .get(apiPath('/users/me'))
      .set('Authorization', `Bearer ${originalAccessToken}`)
      .expect(401);

    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    const tokens = await prisma.refreshToken.findMany({
      where: { userId: user.id },
    });
    expect(tokens.every((t) => t.revokedAt !== null)).toBe(true);
  });

  describe('#7 — every /admin/* route rejects a valid JWT with role=CUSTOMER (403)', () => {
    let customer: TestUser;
    let admin: TestUser;
    let orderId: string;
    let customerId: string;

    beforeEach(async () => {
      customer = await registerUser(app, 'plaincustomer');
      admin = await registerAdmin(app, prisma);
      customerId = customer.id;

      const { productId } = await createProduct(prisma, { basePrice: '20.00' });
      await addCartItem(app, customer, { productId, quantity: 1 });
      const checkoutRes = await http(app)
        .post(apiPath('/checkout/orders'))
        .set(...authHeader(customer))
        .set('Idempotency-Key', `admin-rbac-${randomUUID()}`)
        .send(shippingFields())
        .expect(201);
      orderId = checkoutRes.body.data.id as string;
    });

    it('GET /admin/orders', async () => {
      await http(app)
        .get(apiPath('/admin/orders'))
        .set(...authHeader(customer))
        .expect(403);
    });

    it('GET /admin/orders/:id', async () => {
      await http(app)
        .get(apiPath(`/admin/orders/${orderId}`))
        .set(...authHeader(customer))
        .expect(403);
    });

    it('PATCH /admin/orders/:id/status', async () => {
      await http(app)
        .patch(apiPath(`/admin/orders/${orderId}/status`))
        .set(...authHeader(customer))
        .send({ status: 'CONFIRMED' })
        .expect(403);
    });

    it('GET /admin/dashboard', async () => {
      await http(app)
        .get(apiPath('/admin/dashboard'))
        .set(...authHeader(customer))
        .expect(403);
    });

    it('GET /admin/customers', async () => {
      await http(app)
        .get(apiPath('/admin/customers'))
        .set(...authHeader(customer))
        .expect(403);
    });

    it('GET /admin/customers/:id', async () => {
      await http(app)
        .get(apiPath(`/admin/customers/${customerId}`))
        .set(...authHeader(customer))
        .expect(403);
    });

    it('GET /admin/coupons', async () => {
      await http(app)
        .get(apiPath('/admin/coupons'))
        .set(...authHeader(customer))
        .expect(403);
    });

    it('sanity: the same routes succeed for an actual admin', async () => {
      await http(app)
        .get(apiPath('/admin/dashboard'))
        .set(...authHeader(admin))
        .expect(200);
      await http(app)
        .get(apiPath('/admin/orders'))
        .set(...authHeader(admin))
        .expect(200);
    });
  });
});
