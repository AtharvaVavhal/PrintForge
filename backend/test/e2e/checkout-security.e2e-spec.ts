import { INestApplication } from '@nestjs/common';
import { resetDatabase } from './support/db';
import { createTestApp } from './support/test-app';
import {
  addCartItem,
  apiPath,
  authHeader,
  createCoupon,
  createFileCustomizationField,
  createProduct,
  createUploadedFile,
  createVariant,
  http,
  registerAdmin,
  registerUser,
  rupeesToPaise,
  shippingFields,
} from './support/fixtures';
import { PrismaService } from '../../src/common/database/prisma.service';

/**
 * §27 items #1, #10, #11, #12 — checkout-time server-side re-validation.
 * One shared app per file (§29's own existing pattern is per-suite, not
 * per-test — a fresh Nest app per test would multiply Prisma connect
 * overhead 4x for no isolation benefit, since resetDatabase already gives
 * every test a clean slate).
 */
describe('Checkout security & re-validation (§27 #1, #10, #11, #12)', () => {
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

  it('#1 — client-supplied price/total/discount tampering on checkout is ignored; server recomputes from catalog', async () => {
    const user = await registerUser(app);
    const { productId } = await createProduct(prisma, { basePrice: '250.00' });
    await addCartItem(app, user, { productId, quantity: 2 });

    const res = await http(app)
      .post(apiPath('/checkout/orders'))
      .set(...authHeader(user))
      .set('Idempotency-Key', `tamper-${user.id}`)
      .send({
        ...shippingFields(),
        // Not real fields on CreateOrderDto — an attacker's attempt to
        // smuggle a fake total/discount through the checkout body.
        total: '0.01',
        subtotal: '0.01',
        discount: '999.00',
        discountAmount: '999.00',
      });

    const expectedTotalPaise = rupeesToPaise('250.00') * 2n;

    if (res.status >= 400) {
      // whitelist + forbidNonWhitelisted (main.ts) rejects the unknown
      // fields outright — tampering never even reaches pricing logic.
      expect(res.status).toBe(400);
      const orders = await prisma.order.findMany({
        where: { userId: user.id },
      });
      expect(orders).toHaveLength(0);
    } else {
      // If some future DTO change ever accepted these field names, the
      // invariant that must never break is: the order's total is always
      // the server-computed catalog price, never the tampered value.
      expect(res.body.data.total).toBe(
        (Number(expectedTotalPaise) / 100).toFixed(2),
      );
      expect(res.body.data.total).not.toBe('0.01');
    }
  });

  it('#1 — a real coupon applied alongside a tampered discountAmount is ignored; server recomputes the discount from the coupon itself, never the client value', async () => {
    const admin = await registerAdmin(app, prisma);
    const user = await registerUser(app);
    const { productId } = await createProduct(prisma, { basePrice: '250.00' });
    await addCartItem(app, user, { productId, quantity: 2 });
    const coupon = await createCoupon(prisma, admin.id, { percentageOff: 20 });

    // discountAmount is not a real field on CreateOrderDto — the whitelist
    // (main.ts) rejects it outright, so the tampered value never even
    // reaches pricing logic. This is the same guarantee #1's main case
    // proves generically; here it's specifically alongside a real coupon,
    // to rule out a coupon-specific bypass of that whitelist.
    await http(app)
      .post(apiPath('/checkout/orders'))
      .set(...authHeader(user))
      .set('Idempotency-Key', `coupon-tamper-reject-${user.id}`)
      .send({
        ...shippingFields(),
        couponCode: coupon.code,
        discountAmount: '999.00',
      })
      .expect(400);
    expect(
      await prisma.order.findMany({ where: { userId: user.id } }),
    ).toHaveLength(0);

    // The only way discountAmount is ever populated is a legitimate
    // couponCode — and even then it's always the coupon's own computed
    // value (20% of the 500.00 subtotal = 100.00), never a client number.
    const res = await http(app)
      .post(apiPath('/checkout/orders'))
      .set(...authHeader(user))
      .set('Idempotency-Key', `coupon-tamper-legit-${user.id}`)
      .send({ ...shippingFields(), couponCode: coupon.code })
      .expect(201);

    expect(res.body.data.discountAmount).toBe('100.00');
    expect(res.body.data.couponCode).toBe(coupon.code);
    expect(res.body.data.total).toBe('400.00');

    const order = await prisma.order.findUniqueOrThrow({
      where: { id: res.body.data.id as string },
    });
    expect(order.discountAmount.toFixed(2)).toBe('100.00');
  });

  it('#10 — minQuantity/maxQuantity boundaries are enforced on cart-add', async () => {
    const user = await registerUser(app);
    const { productId } = await createProduct(prisma, {
      minQuantity: 5,
      maxQuantity: 10,
    });

    await http(app)
      .post(apiPath('/cart/items'))
      .set(...authHeader(user))
      .send({ productId, quantity: 4 })
      .expect(400);

    await http(app)
      .post(apiPath('/cart/items'))
      .set(...authHeader(user))
      .send({ productId, quantity: 11 })
      .expect(400);

    await http(app)
      .post(apiPath('/cart/items'))
      .set(...authHeader(user))
      .send({ productId, quantity: 5 })
      .expect(201);
  });

  it('#10 — minQuantity/maxQuantity boundaries are re-enforced at checkout time (product bounds tightened after cart-add)', async () => {
    const user = await registerUser(app);
    const { productId } = await createProduct(prisma, {
      minQuantity: 1,
      maxQuantity: 10,
    });
    await addCartItem(app, user, { productId, quantity: 5 });

    // Admin tightens the bounds after the item is already in the cart —
    // no admin API call needed here (out of scope), a direct write is
    // exactly what an admin PATCH would have produced.
    await prisma.product.update({
      where: { id: productId },
      data: { minQuantity: 6, maxQuantity: 10 },
    });

    const res = await http(app)
      .post(apiPath('/checkout/orders'))
      .set(...authHeader(user))
      .set('Idempotency-Key', `qty-recheck-${user.id}`)
      .send(shippingFields())
      .expect(400);

    expect(res.body.error.message).toMatch(/quantity/i);
    const orders = await prisma.order.findMany({ where: { userId: user.id } });
    expect(orders).toHaveLength(0);
  });

  it('#11 — a product deactivated between cart-view and checkout-submit is caught inside the checkout transaction', async () => {
    const user = await registerUser(app);
    const { productId } = await createProduct(prisma);
    await addCartItem(app, user, { productId, quantity: 1 });

    await prisma.product.update({
      where: { id: productId },
      data: { isActive: false },
    });

    const res = await http(app)
      .post(apiPath('/checkout/orders'))
      .set(...authHeader(user))
      .set('Idempotency-Key', `deactivated-product-${user.id}`)
      .send(shippingFields())
      .expect(409);

    expect(res.body.error.message).toMatch(/no longer available/i);
    const orders = await prisma.order.findMany({ where: { userId: user.id } });
    expect(orders).toHaveLength(0);
    // Cart must be left intact — the transaction rolled back entirely.
    const cartItems = await prisma.cartItem.findMany({
      where: { cart: { userId: user.id } },
    });
    expect(cartItems).toHaveLength(1);
  });

  it('#11 — a variant deactivated between cart-view and checkout-submit is caught inside the checkout transaction', async () => {
    const user = await registerUser(app);
    const { productId } = await createProduct(prisma);
    const variantId = await createVariant(prisma, productId, '20.00');
    await addCartItem(app, user, { productId, variantId, quantity: 1 });

    await prisma.productVariant.update({
      where: { id: variantId },
      data: { isAvailable: false },
    });

    const res = await http(app)
      .post(apiPath('/checkout/orders'))
      .set(...authHeader(user))
      .set('Idempotency-Key', `deactivated-variant-${user.id}`)
      .send(shippingFields())
      .expect(409);

    expect(res.body.error.message).toMatch(/no longer available/i);
    const orders = await prisma.order.findMany({ where: { userId: user.id } });
    expect(orders).toHaveLength(0);
  });

  it('#12 — an uploadedFileId belonging to another user is rejected when referenced in a cart-item write', async () => {
    const owner = await registerUser(app, 'owner');
    const attacker = await registerUser(app, 'attacker');
    const fileId = await createUploadedFile(prisma, owner.id);

    const { productId } = await createProduct(prisma);
    const fieldId = await createFileCustomizationField(prisma, productId);

    const res = await http(app)
      .post(apiPath('/cart/items'))
      .set(...authHeader(attacker))
      .send({
        productId,
        quantity: 1,
        customizations: [{ fieldId, uploadedFileId: fileId }],
      })
      .expect(400);

    expect(res.body.error.message).toMatch(/do not own/i);

    const cartItems = await prisma.cartItem.findMany({
      where: { cart: { userId: attacker.id } },
    });
    expect(cartItems).toHaveLength(0);
  });

  it('#12 — the actual owner CAN reference their own uploadedFileId in a cart-item write', async () => {
    const owner = await registerUser(app, 'owner2');
    const fileId = await createUploadedFile(prisma, owner.id);

    const { productId } = await createProduct(prisma);
    const fieldId = await createFileCustomizationField(prisma, productId);

    await http(app)
      .post(apiPath('/cart/items'))
      .set(...authHeader(owner))
      .send({
        productId,
        quantity: 1,
        customizations: [{ fieldId, uploadedFileId: fileId }],
      })
      .expect(201);
  });
});
