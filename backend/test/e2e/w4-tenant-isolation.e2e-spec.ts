import { randomUUID } from 'crypto';
import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../../src/common/database/prisma.service';
import { StoreDomainLookupCache } from '../../src/common/tenant/store-domain-resolution/store-domain-lookup.cache';
import { StorefrontResolutionModeService } from '../../src/platform/platform-config/storefront-resolution-mode.service';
import { resetDatabase } from './support/db';
import {
  apiPath,
  authHeader,
  createCoupon,
  createFileCustomizationField,
  createProduct,
  createTextCustomizationField,
  createUploadedFile,
  createVariant,
  http,
  registerAdmin,
  registerSuperAdmin,
  registerUser,
  TestUser,
} from './support/fixtures';
import { createTestApp } from './support/test-app';

/**
 * Phase 9 W4 — tenant anchoring of client-supplied foreign ids (spec §4.4),
 * public catalog scoping (§2 W4 exit gate; §13 I-1 / I-2 / I-3), R-14
 * (§14.1), and the `GET /storefront/context` bootstrap (§10.4). Two
 * tenants A and B, each with its own platform subdomain, category,
 * product, variant, customization fields, coupon and an uploaded file.
 *
 * Threat model under test (§4.1.4): a valid UUID is not authorization and
 * "exists somewhere in PostgreSQL" is not authorization. Every foreign id
 * must belong to the resolved store / the parent row's tenant, the lookup
 * is scoped IN THE QUERY, and a foreign id is byte-identical to a
 * nonexistent one in every response — no existence leak, no silent
 * substitution, no fallback to another tenant.
 */
describe('Phase 9 W4 — tenant isolation of client-supplied foreign ids (spec §4.4 / §13 / R-14)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let cache: StoreDomainLookupCache;
  let modeService: StorefrontResolutionModeService;

  const CART_ITEMS = apiPath('/cart/items');
  const CART = apiPath('/cart');
  const MODE_ROUTE = apiPath('/platform/config/storefront-domain-resolution');
  const CONTEXT = apiPath('/storefront/context');

  interface Store {
    tenantId: string;
    storeId: string;
    host: string;
    origin: string;
    productId: string;
    slug: string;
    categoryId: string;
    variantId: string;
    textFieldId: string;
    fileFieldId: string;
    coupon: { id: string; code: string };
    admin: TestUser & { tenantId: string };
  }

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    cache = app.get(StoreDomainLookupCache);
    modeService = app.get(StorefrontResolutionModeService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    cache.bust();
    modeService.bust();
    const superAdmin = await registerSuperAdmin(app, prisma);
    await http(app)
      .put(MODE_ROUTE)
      .set(...authHeader(superAdmin))
      .send({ mode: 'host_resolution', justification: 'W4 e2e' })
      .expect(200);
  });

  /**
   * A tenant + primary store + platform subdomain row + a full catalog
   * fixture set, all explicitly under that tenant (never the fixtures'
   * "most-recent tenant" default — W4 is precisely about two tenants).
   */
  async function makeStore(label: string): Promise<Store> {
    const admin = await registerAdmin(app, prisma); // creates tenant + primary store + OWNER
    const tenantId = admin.tenantId;
    const store = await prisma.store.findFirstOrThrow({
      where: { tenantId, isPrimary: true },
    });
    const host = `${label}-${randomUUID().slice(0, 8)}.stores.printforge.test`;
    await prisma.storeDomain.create({
      data: {
        storeId: store.id,
        tenantId,
        hostname: host,
        type: 'PLATFORM_SUBDOMAIN',
        verificationStatus: 'VERIFIED',
        isPrimary: true,
      },
    });
    const product = await createProduct(prisma, {
      name: `Product ${label}`,
      tenantId,
    });
    const variantId = await createVariant(
      prisma,
      product.productId,
      '0.00',
      true,
      tenantId,
    );
    const textFieldId = await createTextCustomizationField(
      prisma,
      product.productId,
      {
        tenantId,
      },
    );
    const fileFieldId = await createFileCustomizationField(
      prisma,
      product.productId,
      false,
      tenantId,
    );
    const coupon = await createCoupon(prisma, admin.id, { tenantId });
    cache.bust();
    return {
      tenantId,
      storeId: store.id,
      host,
      origin: `http://${host}`,
      productId: product.productId,
      slug: product.slug,
      categoryId: product.categoryId,
      variantId,
      textFieldId,
      fileFieldId,
      coupon,
      admin,
    };
  }

  async function makeStores(): Promise<{ a: Store; b: Store }> {
    const a = await makeStore('a');
    const b = await makeStore('b');
    return { a, b };
  }

  function post(path: string, user: TestUser, origin: string) {
    return http(app)
      .post(path)
      .set('Origin', origin)
      .set(...authHeader(user));
  }

  describe('foreign-id anchoring on the cart write path (§4.4)', () => {
    it('#1 / R-14: productId from store B on store A → 404, identical to a nonexistent product; no cart_items row', async () => {
      const { a, b } = await makeStores();
      const shopper = await registerUser(app);
      const foreign = await post(CART_ITEMS, shopper, a.origin)
        .send({ productId: b.productId, quantity: 1 })
        .expect(404);
      const missing = await post(CART_ITEMS, shopper, a.origin)
        .send({ productId: randomUUID(), quantity: 1 })
        .expect(404);
      expect(foreign.body).toEqual(missing.body);
      expect(await prisma.cartItem.count()).toBe(0);
    });

    it("R-14: forged Origin B with a cart already in A — neither A's nor B's product can be added; nothing written", async () => {
      const { a, b } = await makeStores();
      const shopper = await registerUser(app);
      await http(app)
        .get(CART)
        .set('Origin', a.origin)
        .set(...authHeader(shopper))
        .expect(200); // cart now exists in A
      await post(CART_ITEMS, shopper, b.origin)
        .send({ productId: a.productId, quantity: 1 })
        .expect(404);
      await post(CART_ITEMS, shopper, b.origin)
        .send({ productId: b.productId, quantity: 1 })
        .expect(404);
      expect(await prisma.cartItem.count()).toBe(0);
      const cart = await prisma.cart.findUniqueOrThrow({
        where: { userId: shopper.id },
      });
      expect(cart.tenantId).toBe(a.tenantId);
    });

    it("#2: variantId from store B submitted with store A's product → 404, identical to a nonexistent variant", async () => {
      const { a, b } = await makeStores();
      const shopper = await registerUser(app);
      const foreign = await post(CART_ITEMS, shopper, a.origin)
        .send({ productId: a.productId, variantId: b.variantId, quantity: 1 })
        .expect(404);
      const missing = await post(CART_ITEMS, shopper, a.origin)
        .send({ productId: a.productId, variantId: randomUUID(), quantity: 1 })
        .expect(404);
      expect(foreign.body).toEqual(missing.body);
      expect(await prisma.cartItem.count()).toBe(0);
    });

    it("#3: customizationFieldId from store B submitted against store A's product → rejected, identical to an unknown field", async () => {
      const { a, b } = await makeStores();
      const shopper = await registerUser(app);
      const foreign = await post(CART_ITEMS, shopper, a.origin)
        .send({
          productId: a.productId,
          quantity: 1,
          customizations: [{ fieldId: b.textFieldId, textValue: 'x' }],
        })
        .expect(400);
      const missing = await post(CART_ITEMS, shopper, a.origin)
        .send({
          productId: a.productId,
          quantity: 1,
          customizations: [{ fieldId: randomUUID(), textValue: 'x' }],
        })
        .expect(400);
      // Same error class and same message shape — the foreign id is never
      // distinguishable from a typo.
      expect(foreign.body.error.code).toBe(missing.body.error.code);
      expect(
        String(foreign.body.error.message).replace(b.textFieldId, 'ID'),
      ).toBe(String(missing.body.error.message).replace(/[0-9a-f-]{36}/, 'ID'));
      expect(await prisma.cartItem.count()).toBe(0);
    });

    it("#4: uploadedFileId belonging to tenant B (even when owned by the same shopper) on store A's file field → rejected, identical to a nonexistent file", async () => {
      const { a, b } = await makeStores();
      const shopper = await registerUser(app);
      const fileInB = await createUploadedFile(prisma, shopper.id, b.tenantId);
      const foreign = await post(CART_ITEMS, shopper, a.origin)
        .send({
          productId: a.productId,
          quantity: 1,
          customizations: [{ fieldId: a.fileFieldId, uploadedFileId: fileInB }],
        })
        .expect(400);
      const missing = await post(CART_ITEMS, shopper, a.origin)
        .send({
          productId: a.productId,
          quantity: 1,
          customizations: [
            { fieldId: a.fileFieldId, uploadedFileId: randomUUID() },
          ],
        })
        .expect(400);
      expect(foreign.body).toEqual(missing.body);
      expect(await prisma.cartItem.count()).toBe(0);
    });

    it("#7 / #8: same-store product + variant + text field + own same-tenant file all succeed; the row carries the cart's tenant", async () => {
      const { a } = await makeStores();
      const shopper = await registerUser(app);
      const fileInA = await createUploadedFile(prisma, shopper.id, a.tenantId);
      await post(CART_ITEMS, shopper, a.origin)
        .send({
          productId: a.productId,
          variantId: a.variantId,
          quantity: 1,
          customizations: [
            { fieldId: a.textFieldId, textValue: 'hello' },
            { fieldId: a.fileFieldId, uploadedFileId: fileInA },
          ],
        })
        .expect(201);
      const item = await prisma.cartItem.findFirstOrThrow({
        include: { customizations: true },
      });
      expect(item.tenantId).toBe(a.tenantId);
      expect(item.productId).toBe(a.productId);
      expect(item.variantId).toBe(a.variantId);
      expect(item.customizations).toHaveLength(2);
      expect(item.customizations.every((c) => c.tenantId === a.tenantId)).toBe(
        true,
      );
    });
  });

  describe('coupon (§4.4 "checkout (coupon code)")', () => {
    it("#5: a coupon code from store B used on store A's cart → rejected, identical to a nonexistent code", async () => {
      const { a, b } = await makeStores();
      const shopper = await registerUser(app);
      await post(CART_ITEMS, shopper, a.origin)
        .send({ productId: a.productId, quantity: 1 })
        .expect(201);
      const foreign = await post(
        apiPath('/checkout/validate'),
        shopper,
        a.origin,
      )
        .send({ couponCode: b.coupon.code })
        .expect(400);
      const missing = await post(
        apiPath('/checkout/validate'),
        shopper,
        a.origin,
      )
        .send({ couponCode: 'NOPE-NOT-A-CODE' })
        .expect(400);
      expect(foreign.body).toEqual(missing.body);
      // and A's own coupon still validates on A's cart
      await post(apiPath('/checkout/validate'), shopper, a.origin)
        .send({ couponCode: a.coupon.code })
        .expect(201);
    });
  });

  describe('reviews (§4.4 "reviews (productId)")', () => {
    it("#6: POST /reviews with store B's productId (never bought there) → rejected exactly like a nonexistent product; nothing written", async () => {
      const { a, b } = await makeStores();
      const shopper = await registerUser(app);
      const foreign = await post(apiPath('/reviews'), shopper, a.origin)
        .send({ productId: b.productId, rating: 5 })
        .expect(409);
      const missing = await post(apiPath('/reviews'), shopper, a.origin)
        .send({ productId: randomUUID(), rating: 5 })
        .expect(409);
      expect(foreign.body).toEqual(missing.body);
      expect(await prisma.review.count()).toBe(0);
    });

    it("#6 (public list): GET /products/:id/reviews for store B's product from store A's origin → 404 identical to a nonexistent product; from B's origin → 200", async () => {
      const { a, b } = await makeStores();
      const foreign = await http(app)
        .get(apiPath(`/products/${b.productId}/reviews`))
        .set('Origin', a.origin)
        .expect(404);
      const missing = await http(app)
        .get(apiPath(`/products/${randomUUID()}/reviews`))
        .set('Origin', a.origin)
        .expect(404);
      expect(foreign.body).toEqual(missing.body);
      await http(app)
        .get(apiPath(`/products/${b.productId}/reviews`))
        .set('Origin', b.origin)
        .expect(200);
    });
  });

  describe('public catalog scoping (§13 I-1 / I-2; spec §2 W4 exit gate)', () => {
    it("I-1: GET /products under store A's origin lists only A's products; under B only B's", async () => {
      const { a, b } = await makeStores();
      const listA = await http(app)
        .get(apiPath('/products'))
        .set('Origin', a.origin)
        .expect(200);
      const idsA = (listA.body.data as Array<{ id: string }>).map((p) => p.id);
      expect(idsA).toContain(a.productId);
      expect(idsA).not.toContain(b.productId);
      const listB = await http(app)
        .get(apiPath('/products'))
        .set('Origin', b.origin)
        .expect(200);
      const idsB = (listB.body.data as Array<{ id: string }>).map((p) => p.id);
      expect(idsB).toContain(b.productId);
      expect(idsB).not.toContain(a.productId);
    });

    it("I-2: GET /products/:slug for B's product from A's origin → 404 identical to an unknown slug; a categoryId filter from B matches nothing on A", async () => {
      const { a, b } = await makeStores();
      const foreign = await http(app)
        .get(apiPath(`/products/${b.slug}`))
        .set('Origin', a.origin)
        .expect(404);
      const missing = await http(app)
        .get(apiPath(`/products/no-such-slug-${randomUUID()}`))
        .set('Origin', a.origin)
        .expect(404);
      expect(foreign.body).toEqual(missing.body);
      await http(app)
        .get(apiPath(`/products/${b.slug}`))
        .set('Origin', b.origin)
        .expect(200);

      const filtered = await http(app)
        .get(apiPath(`/products?categoryId=${b.categoryId}`))
        .set('Origin', a.origin)
        .expect(200);
      expect(filtered.body.data).toEqual([]);
    });

    it('I-2 (categories): GET /categories and /categories/tree are scoped to the resolved store', async () => {
      const { a, b } = await makeStores();
      const cats = await http(app)
        .get(apiPath('/categories'))
        .set('Origin', a.origin)
        .expect(200);
      const ids = (cats.body.data as Array<{ id: string }>).map((c) => c.id);
      expect(ids).toContain(a.categoryId);
      expect(ids).not.toContain(b.categoryId);
      const tree = await http(app)
        .get(apiPath('/categories/tree'))
        .set('Origin', b.origin)
        .expect(200);
      const treeIds = JSON.stringify(tree.body.data);
      expect(treeIds).toContain(b.categoryId);
      expect(treeIds).not.toContain(a.categoryId);
    });

    it('public catalog reads with no resolvable store → 404 (no store, no catalog); merchant/platform routes unaffected', async () => {
      const { a } = await makeStores();
      await http(app).get(apiPath('/products')).expect(404); // absent Origin
      await http(app)
        .get(apiPath('/products'))
        .set('Origin', 'http://unknown.example')
        .expect(404);
      await http(app)
        .get(apiPath('/products/admin'))
        .set('Origin', 'http://unknown.example')
        .set(...authHeader(a.admin))
        .expect(200);
    });
  });

  describe('S-1 threat model (§4.1.4) — the three consumer kinds', () => {
    it('#11 / #12: a forged Origin selects only public data; shopper-owned rows stay userId-scoped', async () => {
      const { a, b } = await makeStores();
      const victim = await registerUser(app, 'victim');
      await post(CART_ITEMS, victim, b.origin)
        .send({ productId: b.productId, quantity: 2 })
        .expect(201);
      const attacker = await registerUser(app, 'attacker');
      const res = await http(app)
        .get(CART)
        .set('Origin', b.origin)
        .set(...authHeader(attacker))
        .expect(200);
      expect(JSON.stringify(res.body)).not.toContain(b.productId); // attacker's own, empty cart
      expect(a.tenantId).not.toBe(b.tenantId);
    });

    it("#13: merchant authority is membership-based — an OWNER of A forging B's Origin lists A's admin catalog, never B's", async () => {
      const { a, b } = await makeStores();
      const res = await http(app)
        .get(apiPath('/products/admin'))
        .set('Origin', b.origin)
        .set(...authHeader(a.admin))
        .expect(200);
      const ids = JSON.stringify(res.body);
      expect(ids).toContain(a.productId);
      expect(ids).not.toContain(b.productId);
    });
  });

  describe('GET /storefront/context (§10.4 bootstrap)', () => {
    it("returns the resolved store's bootstrap view; a non-primary host reports isPrimary=false with the primary canonicalOrigin (200, never 3xx)", async () => {
      const { a } = await makeStores();
      const res = await http(app)
        .get(CONTEXT)
        .set('Origin', a.origin)
        .expect(200);
      expect(res.body.data).toEqual({
        storeId: a.storeId,
        storeName: 'Test Store',
        storeStatus: 'ACTIVE',
        canonicalOrigin: a.origin,
        isPrimary: true,
        resolvedBy: 'origin',
      });
      expect(JSON.stringify(res.body)).not.toContain(a.tenantId);

      await prisma.storeDomain.create({
        data: {
          storeId: a.storeId,
          tenantId: a.tenantId,
          hostname: 'alias-a.example',
          type: 'CUSTOM',
          verificationStatus: 'VERIFIED',
          tlsStatus: 'ISSUED',
          isPrimary: false,
        },
      });
      cache.bust();
      const alias = await http(app)
        .get(CONTEXT)
        .set('Origin', 'http://alias-a.example')
        .expect(200);
      expect(alias.headers.location).toBeUndefined();
      expect(alias.body.data).toMatchObject({
        storeId: a.storeId,
        isPrimary: false,
        canonicalOrigin: a.origin,
      });
    });

    it('unknown host → 404; in legacy_single_store mode it reports resolvedBy "legacy" with no canonicalOrigin', async () => {
      await makeStores();
      await http(app)
        .get(CONTEXT)
        .set('Origin', 'http://unknown.example')
        .expect(404);
      const superAdmin = await registerSuperAdmin(app, prisma);
      await http(app)
        .put(MODE_ROUTE)
        .set(...authHeader(superAdmin))
        .send({ mode: 'legacy_single_store', justification: 'W4 e2e' })
        .expect(200);
      const legacy = await http(app).get(CONTEXT).expect(200);
      expect(legacy.body.data).toMatchObject({
        resolvedBy: 'legacy',
        canonicalOrigin: null,
        isPrimary: true,
      });
      expect(legacy.body.data.storeId).toEqual(expect.any(String));
    });
  });
});
