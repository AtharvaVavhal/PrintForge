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
  createTextCustomizationField,
  createVariant,
  http,
  registerAdmin,
  registerUser,
  shippingFields,
  TestUser,
} from './support/fixtures';
import { PrismaService } from '../../src/common/database/prisma.service';

/**
 * Phase 5 W10 — Tenant Control Plane isolation hardening.
 *
 * W8/W9 discovered (but explicitly deferred, as out of scope for those
 * packages) a pre-existing tenant-isolation gap: `/admin/orders*`,
 * `/admin/coupons*` read/update, `/admin/customers*`, and several
 * product/category "update-family" operations performed their object
 * lookups with no tenant filter at all — any tenant admin could read or
 * mutate ANY OTHER tenant's data by object id (or, for list endpoints,
 * without even knowing an id). This suite:
 *
 *   1. Proves each of those paths is now correctly tenant-scoped, using
 *      REAL cross-tenant object ids (never just "the current tenant's own
 *      list stays empty" — that alone would not catch a missing `where`
 *      clause the way a genuine second tenant's real row does).
 *   2. Doubles as the regression test the fix itself requires: each `it`
 *      block below reproduces the exact vulnerable call shape that,
 *      before this hardening, returned 200/succeeded across tenants.
 */
describe('Tenant Control Plane isolation (Phase 5 W10 hardening)', () => {
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

  async function twoTenants() {
    const adminA = await registerAdmin(app, prisma);
    const adminB = await registerAdmin(app, prisma);
    return { adminA, adminB };
  }

  // ─── Orders ─────────────────────────────────────────────────────────────

  describe('orders', () => {
    async function makeOrderForTenant(
      tenantId: string,
    ): Promise<{ orderId: string; user: TestUser }> {
      const user = await registerUser(app, 'buyer');
      const { productId } = await createProduct(prisma, { tenantId });
      await addCartItem(app, user, { productId, quantity: 1 });
      const res = await http(app)
        .post(apiPath('/checkout/orders'))
        .set(...authHeader(user))
        .set('Idempotency-Key', `w10-${randomUUID()}`)
        .send(shippingFields())
        .expect(201);
      return { orderId: res.body.data.id as string, user };
    }

    it("GET /admin/orders never returns another tenant's orders (P0 regression)", async () => {
      const { adminA, adminB } = await twoTenants();
      const { orderId: orderB } = await makeOrderForTenant(adminB.tenantId);

      const res = await http(app)
        .get(apiPath('/admin/orders'))
        .set(...authHeader(adminA))
        .expect(200);

      const ids = (res.body.data as Array<{ id: string }>).map((o) => o.id);
      expect(ids).not.toContain(orderB);
    });

    it("GET /admin/orders/:id 404s for another tenant's real order id (P0 regression)", async () => {
      const { adminA, adminB } = await twoTenants();
      const { orderId: orderB } = await makeOrderForTenant(adminB.tenantId);

      await http(app)
        .get(apiPath(`/admin/orders/${orderB}`))
        .set(...authHeader(adminA))
        .expect(404);
    });

    it("GET /admin/orders/:id/invoice 404s for another tenant's order (P0 regression)", async () => {
      const { adminA, adminB } = await twoTenants();
      const { orderId: orderB } = await makeOrderForTenant(adminB.tenantId);

      await http(app)
        .get(apiPath(`/admin/orders/${orderB}/invoice`))
        .set(...authHeader(adminA))
        .expect(404);
    });

    it("PATCH /admin/orders/:id/status 404s for another tenant's order and never mutates it (P0 regression — was a cross-tenant WRITE)", async () => {
      const { adminA, adminB } = await twoTenants();
      const { orderId: orderB } = await makeOrderForTenant(adminB.tenantId);

      await http(app)
        .patch(apiPath(`/admin/orders/${orderB}/status`))
        .set(...authHeader(adminA))
        .send({ status: 'CANCELLED' })
        .expect(404);

      const order = await prisma.order.findUniqueOrThrow({
        where: { id: orderB },
      });
      expect(order.status).toBe('PENDING_PAYMENT');
    });

    it("GET /admin/dashboard never counts/sums/lists another tenant's orders (P0 regression)", async () => {
      const { adminA, adminB } = await twoTenants();
      const { orderId: orderB } = await makeOrderForTenant(adminB.tenantId);

      const res = await http(app)
        .get(apiPath('/admin/dashboard'))
        .set(...authHeader(adminA))
        .expect(200);

      expect(res.body.data.totalOrders).toBe(0);
      const recentIds = (
        res.body.data.recentOrders as Array<{ id: string }>
      ).map((o) => o.id);
      expect(recentIds).not.toContain(orderB);
    });
  });

  // ─── Coupons ────────────────────────────────────────────────────────────

  describe('coupons', () => {
    it("GET /admin/coupons never returns another tenant's coupons (P0 regression)", async () => {
      const { adminA, adminB } = await twoTenants();
      const couponB = await createCoupon(prisma, adminB.id, {
        tenantId: adminB.tenantId,
      });

      const res = await http(app)
        .get(apiPath('/admin/coupons'))
        .set(...authHeader(adminA))
        .expect(200);

      const codes = (res.body.data as Array<{ code: string }>).map(
        (c) => c.code,
      );
      expect(codes).not.toContain(couponB.code);
    });

    it("GET /admin/coupons/:id 404s for another tenant's coupon (P0 regression)", async () => {
      const { adminA, adminB } = await twoTenants();
      const couponB = await createCoupon(prisma, adminB.id, {
        tenantId: adminB.tenantId,
      });

      await http(app)
        .get(apiPath(`/admin/coupons/${couponB.id}`))
        .set(...authHeader(adminA))
        .expect(404);
    });

    it("PATCH /admin/coupons/:id 404s for another tenant's coupon and never mutates it (P0 regression — was a cross-tenant WRITE)", async () => {
      const { adminA, adminB } = await twoTenants();
      const couponB = await createCoupon(prisma, adminB.id, {
        tenantId: adminB.tenantId,
        usageLimitTotal: 100,
      });

      await http(app)
        .patch(apiPath(`/admin/coupons/${couponB.id}`))
        .set(...authHeader(adminA))
        .send({ usageLimitTotal: 1 })
        .expect(404);

      const coupon = await prisma.coupon.findUniqueOrThrow({
        where: { id: couponB.id },
      });
      expect(coupon.usageLimitTotal).toBe(100);
    });

    it("POST /admin/coupons rejects a CATEGORY scope pointing at another tenant's category (P0 regression)", async () => {
      const { adminA, adminB } = await twoTenants();
      const { categoryId: categoryB } = await createProduct(prisma, {
        tenantId: adminB.tenantId,
      });

      await http(app)
        .post(apiPath('/admin/coupons'))
        .set(...authHeader(adminA))
        .send({
          code: `CROSS${randomUUID().slice(0, 6).toUpperCase()}`,
          type: 'PERCENTAGE',
          percentageOff: 10,
          scopeType: 'CATEGORY',
          categoryId: categoryB,
        })
        .expect(400);

      const created = await prisma.coupon.findFirst({
        where: { categoryId: categoryB },
      });
      expect(created).toBeNull();
    });

    it("a customer cannot redeem another tenant's coupon code at checkout (P0 regression)", async () => {
      // Ordering matters here: `addCartItem` resolves the shopper's cart
      // tenant via `StorefrontTenantResolver`'s "most recently created
      // tenant" fallback (no real per-tenant hostname in this test
      // harness), fixed for good the first time their cart is created.
      // Tenant A — and the shopper's own cart/product — must exist (and
      // the cart must already be created) BEFORE tenant B is registered,
      // or the cart would ambiently resolve to B instead of A, and this
      // test would not actually exercise a cross-tenant redemption at all.
      const adminA = await registerAdmin(app, prisma);
      const shopper = await registerUser(app, 'cross-tenant-shopper');
      const { productId } = await createProduct(prisma, {
        tenantId: adminA.tenantId,
        basePrice: '100.00',
      });
      await addCartItem(app, shopper, { productId, quantity: 1 });

      const adminB = await registerAdmin(app, prisma);
      const couponB = await createCoupon(prisma, adminB.id, {
        tenantId: adminB.tenantId,
        percentageOff: 50,
      });

      await http(app)
        .post(apiPath('/checkout/orders'))
        .set(...authHeader(shopper))
        .set('Idempotency-Key', `w10-coupon-${randomUUID()}`)
        .send({ ...shippingFields(), couponCode: couponB.code })
        .expect(400);

      const usedCoupon = await prisma.coupon.findUniqueOrThrow({
        where: { id: couponB.id },
      });
      expect(usedCoupon.usedCount).toBe(0);
    });
  });

  // ─── Customers ──────────────────────────────────────────────────────────

  describe('customers', () => {
    it('GET /admin/customers never lists a customer who has only ordered from another tenant (P0 regression)', async () => {
      const { adminA, adminB } = await twoTenants();
      const shopperB = await registerUser(app, 'shopper-b');
      const { productId } = await createProduct(prisma, {
        tenantId: adminB.tenantId,
      });
      await addCartItem(app, shopperB, { productId, quantity: 1 });
      await http(app)
        .post(apiPath('/checkout/orders'))
        .set(...authHeader(shopperB))
        .set('Idempotency-Key', `w10-cust-${randomUUID()}`)
        .send(shippingFields())
        .expect(201);

      const res = await http(app)
        .get(apiPath('/admin/customers'))
        .set(...authHeader(adminA))
        .expect(200);

      const ids = (res.body.data as Array<{ id: string }>).map((c) => c.id);
      expect(ids).not.toContain(shopperB.id);
    });

    it("GET /admin/customers/:id 404s for a customer who has never ordered from the caller's tenant (P0 regression)", async () => {
      const { adminA, adminB } = await twoTenants();
      const shopperB = await registerUser(app, 'shopper-b2');
      const { productId } = await createProduct(prisma, {
        tenantId: adminB.tenantId,
      });
      await addCartItem(app, shopperB, { productId, quantity: 1 });
      await http(app)
        .post(apiPath('/checkout/orders'))
        .set(...authHeader(shopperB))
        .set('Idempotency-Key', `w10-cust2-${randomUUID()}`)
        .send(shippingFields())
        .expect(201);

      await http(app)
        .get(apiPath(`/admin/customers/${shopperB.id}`))
        .set(...authHeader(adminA))
        .expect(404);
    });
  });

  // ─── Products / variants / customization fields / images ───────────────

  describe('products, categories, variants, customization fields', () => {
    it("GET /products/admin never returns another tenant's products (P0 regression)", async () => {
      const { adminA, adminB } = await twoTenants();
      const { productId: productB } = await createProduct(prisma, {
        tenantId: adminB.tenantId,
      });

      const res = await http(app)
        .get(apiPath('/products/admin'))
        .set(...authHeader(adminA))
        .expect(200);

      const ids = (res.body.data as Array<{ id: string }>).map((p) => p.id);
      expect(ids).not.toContain(productB);
    });

    it("GET /products/admin/:id 404s for another tenant's product (P0 regression)", async () => {
      const { adminA, adminB } = await twoTenants();
      const { productId: productB } = await createProduct(prisma, {
        tenantId: adminB.tenantId,
      });

      await http(app)
        .get(apiPath(`/products/admin/${productB}`))
        .set(...authHeader(adminA))
        .expect(404);
    });

    it("PATCH /products/:id 404s for another tenant's product and never mutates it (P0 regression — was a cross-tenant WRITE)", async () => {
      const { adminA, adminB } = await twoTenants();
      const { productId: productB } = await createProduct(prisma, {
        tenantId: adminB.tenantId,
        name: 'Original Name',
      });

      await http(app)
        .patch(apiPath(`/products/${productB}`))
        .set(...authHeader(adminA))
        .send({ name: 'Hijacked' })
        .expect(404);

      const product = await prisma.product.findUniqueOrThrow({
        where: { id: productB },
      });
      expect(product.name).toBe('Original Name');
    });

    it("DELETE /products/:id (deactivate) 404s for another tenant's product (P0 regression)", async () => {
      const { adminA, adminB } = await twoTenants();
      const { productId: productB } = await createProduct(prisma, {
        tenantId: adminB.tenantId,
        isActive: true,
      });

      await http(app)
        .delete(apiPath(`/products/${productB}`))
        .set(...authHeader(adminA))
        .expect(404);

      const product = await prisma.product.findUniqueOrThrow({
        where: { id: productB },
      });
      expect(product.isActive).toBe(true);
    });

    it("PATCH /products/:id/variants/:variantId 404s for another tenant's product+variant (P0 regression)", async () => {
      const { adminA, adminB } = await twoTenants();
      const { productId: productB } = await createProduct(prisma, {
        tenantId: adminB.tenantId,
      });
      const variantB = await createVariant(
        prisma,
        productB,
        '10.00',
        true,
        adminB.tenantId,
      );

      await http(app)
        .patch(apiPath(`/products/${productB}/variants/${variantB}`))
        .set(...authHeader(adminA))
        .send({ priceDelta: 999.0 })
        .expect(404);

      const variant = await prisma.productVariant.findUniqueOrThrow({
        where: { id: variantB },
      });
      expect(variant.priceDelta.toFixed(2)).toBe('10.00');
    });

    it("PATCH /products/:id/customization-fields/:fieldId 404s for another tenant's product+field (P0 regression)", async () => {
      const { adminA, adminB } = await twoTenants();
      const { productId: productB } = await createProduct(prisma, {
        tenantId: adminB.tenantId,
      });
      const fieldB = await createTextCustomizationField(prisma, productB, {
        tenantId: adminB.tenantId,
      });

      await http(app)
        .patch(apiPath(`/products/${productB}/customization-fields/${fieldB}`))
        .set(...authHeader(adminA))
        .send({ label: 'Hijacked label' })
        .expect(404);
    });

    it("DELETE /products/:id/images/:imageId 404s for another tenant's product+image (P0 regression)", async () => {
      const { adminA, adminB } = await twoTenants();
      const { productId: productB } = await createProduct(prisma, {
        tenantId: adminB.tenantId,
      });
      const image = await prisma.productImage.create({
        data: {
          productId: productB,
          cloudinaryPublicId: `fixture/${randomUUID()}`,
          resourceType: 'image',
          deliveryType: 'public',
          tenantId: adminB.tenantId,
        },
      });

      await http(app)
        .delete(apiPath(`/products/${productB}/images/${image.id}`))
        .set(...authHeader(adminA))
        .expect(404);

      expect(
        await prisma.productImage.findUnique({ where: { id: image.id } }),
      ).not.toBeNull();
    });

    it("GET /categories/admin never returns another tenant's categories (P0 regression)", async () => {
      const { adminA, adminB } = await twoTenants();
      const { categoryId: categoryB } = await createProduct(prisma, {
        tenantId: adminB.tenantId,
      });

      const res = await http(app)
        .get(apiPath('/categories/admin'))
        .set(...authHeader(adminA))
        .expect(200);

      const ids = (res.body.data as Array<{ id: string }>).map((c) => c.id);
      expect(ids).not.toContain(categoryB);
    });

    it("PATCH /categories/:id 404s for another tenant's category and never mutates it (P0 regression — was a cross-tenant WRITE)", async () => {
      const { adminA, adminB } = await twoTenants();
      const { categoryId: categoryB } = await createProduct(prisma, {
        tenantId: adminB.tenantId,
      });
      const before = await prisma.category.findUniqueOrThrow({
        where: { id: categoryB },
      });

      await http(app)
        .patch(apiPath(`/categories/${categoryB}`))
        .set(...authHeader(adminA))
        .send({ name: 'Hijacked Category' })
        .expect(404);

      const after = await prisma.category.findUniqueOrThrow({
        where: { id: categoryB },
      });
      expect(after.name).toBe(before.name);
    });

    it("DELETE /categories/:id (deactivate) 404s for another tenant's category (P0 regression)", async () => {
      const { adminA, adminB } = await twoTenants();
      const { categoryId: categoryB } = await createProduct(prisma, {
        tenantId: adminB.tenantId,
      });

      await http(app)
        .delete(apiPath(`/categories/${categoryB}`))
        .set(...authHeader(adminA))
        .expect(404);

      const category = await prisma.category.findUniqueOrThrow({
        where: { id: categoryB },
      });
      expect(category.isActive).toBe(true);
    });

    it("a category cannot be re-parented under another tenant's category (P0 regression)", async () => {
      const { adminA, adminB } = await twoTenants();
      const { categoryId: categoryB } = await createProduct(prisma, {
        tenantId: adminB.tenantId,
      });
      const categoryA = await prisma.category.create({
        data: {
          name: `Own Category ${randomUUID()}`,
          slug: `own-cat-${randomUUID()}`,
          tenantId: adminA.tenantId,
        },
      });

      await http(app)
        .patch(apiPath(`/categories/${categoryA.id}`))
        .set(...authHeader(adminA))
        .send({ parentCategoryId: categoryB })
        .expect(404);

      const after = await prisma.category.findUniqueOrThrow({
        where: { id: categoryA.id },
      });
      expect(after.parentCategoryId).toBeNull();
    });
  });

  // ─── Reviews ────────────────────────────────────────────────────────────

  describe('reviews', () => {
    it("PATCH /admin/reviews/:id/status 404s for another tenant's review (P0 regression)", async () => {
      const { adminA, adminB } = await twoTenants();

      const shopperB = await registerUser(app, 'reviewer-b');
      const { productId: productB } = await createProduct(prisma, {
        tenantId: adminB.tenantId,
      });
      await addCartItem(app, shopperB, { productId: productB, quantity: 1 });
      const checkoutRes = await http(app)
        .post(apiPath('/checkout/orders'))
        .set(...authHeader(shopperB))
        .set('Idempotency-Key', `w10-review-${randomUUID()}`)
        .send(shippingFields())
        .expect(201);
      const orderItem = await prisma.orderItem.findFirstOrThrow({
        where: { orderId: checkoutRes.body.data.id as string },
      });
      const review = await prisma.review.create({
        data: {
          productId: productB,
          userId: shopperB.id,
          orderItemId: orderItem.id,
          rating: 5,
          status: 'PUBLISHED',
          tenantId: adminB.tenantId,
        },
      });

      await http(app)
        .patch(apiPath(`/admin/reviews/${review.id}/status`))
        .set(...authHeader(adminA))
        .send({ status: 'REJECTED' })
        .expect(404);

      const after = await prisma.review.findUniqueOrThrow({
        where: { id: review.id },
      });
      expect(after.status).toBe('PUBLISHED');
    });
  });
});
