import { randomUUID } from 'crypto';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../src/common/database/prisma.service';
import { API_PREFIX } from '../../../src/common/constants/app.constants';

export function apiPath(p: string): string {
  return `/${API_PREFIX}${p}`;
}

export function http(app: INestApplication): ReturnType<typeof request> {
  return request(app.getHttpServer());
}

/** Passes PasswordPolicyConstraint (not numeric-only, not on the blocklist). */
export const TEST_PASSWORD = 'CorrectHorseBattery9!';

export function uniqueEmail(prefix = 'user'): string {
  return `${prefix}-${randomUUID()}@example.test`;
}

export interface TestUser {
  id: string;
  email: string;
  accessToken: string;
}

export async function registerUser(
  app: INestApplication,
  emailPrefix = 'user',
): Promise<TestUser> {
  const email = uniqueEmail(emailPrefix);
  const res = await http(app)
    .post(apiPath('/auth/register'))
    .send({ email, password: TEST_PASSWORD })
    .expect(201);
  return {
    id: res.body.data.user.id as string,
    email,
    accessToken: res.body.data.accessToken as string,
  };
}

/**
 * Promotes an already-registered user to ADMIN directly via Prisma, then
 * reuses their existing access token — JwtStrategy.validate() re-reads the
 * role live from the users table on every request (see jwt.strategy.ts),
 * so the already-issued token (whose payload still says role=CUSTOMER)
 * picks up the new role without re-login. No hand-crafted JWTs anywhere in
 * this suite — every token here came from a real POST /auth/register.
 */
export async function promoteToAdmin(
  prisma: PrismaService,
  userId: string,
): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { role: 'ADMIN' } });
}

/**
 * Phase 5 (decision P2-D1/G-12; W3). Promotes an already-registered user
 * to platform `SUPER_ADMIN` directly via Prisma, the same "update, then
 * reuse the existing access token" pattern as `promoteToAdmin` —
 * `JwtStrategy.validate()` re-reads `platformRole` fresh from the DB on
 * every request, so no re-login is needed. Deliberately independent of
 * `promoteToAdmin`/`grantOwnerMembership`: a SUPER_ADMIN in production is
 * never automatically a tenant OWNER (frozen invariant 4), and this
 * fixture mirrors that — call `grantOwnerMembership` too, separately, only
 * if a specific test genuinely needs both.
 */
export async function promoteToSuperAdmin(
  prisma: PrismaService,
  userId: string,
): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { platformRole: 'SUPER_ADMIN' },
  });
}

export async function registerSuperAdmin(
  app: INestApplication,
  prisma: PrismaService,
): Promise<TestUser> {
  const user = await registerUser(app, 'platform-admin');
  await promoteToSuperAdmin(prisma, user.id);
  return user;
}

/**
 * Phase 3 (decisions P2-D9, G-13, G-20): `/admin/*` is gated by
 * `PermissionsGuard`, which reads `TenantContext.membership.role` — the
 * legacy `role='ADMIN'` column alone (above) is no longer sufficient,
 * exactly mirroring what the real Phase 2b production backfill did
 * (`role='ADMIN'` User -> `OWNER` `TenantMembership`, see
 * docs/saas/PHASE-2B-IMPLEMENTATION-REPORT.md). This gives every
 * `registerAdmin()` caller a Tenant + `ACTIVE` `OWNER` membership, so
 * `TenantContextGuard`'s single-membership convenience default resolves a
 * tenant with no `X-Active-Tenant` header needed — existing tests that
 * call `registerAdmin()` and hit `/admin/*` continue to work unchanged.
 */
/**
 * Phase 5 W9 (decision D11) — every real tenant has exactly one primary
 * Store from the moment it exists (`prisma/seed-tenant-bootstrap.ts`
 * creates Tenant + Store together; the same pairing every W9-touched
 * runtime path now depends on: `resolvePrimaryStoreId` throws
 * `NotFoundException` for a tenant with none, and checkout's shipping-fee
 * lookup — STORE-owned as of W9 — calls it unconditionally). Test fixtures
 * that mint a throwaway tenant must pair it with a primary Store the same
 * way, or every checkout-touching e2e test for that tenant would 404
 * despite having done nothing wrong. Centralized here so `grantOwner
 * Membership` and `ensureTenantId` (the two fixture call sites that create
 * a brand-new Tenant row) can't drift out of sync with each other.
 */
async function createPrimaryStore(
  prisma: PrismaService,
  tenantId: string,
): Promise<string> {
  const store = await prisma.store.create({
    data: {
      tenantId,
      slug: `store-${randomUUID()}`,
      name: 'Test Store',
      status: 'ACTIVE',
      isPrimary: true,
    },
  });
  return store.id;
}

export async function grantOwnerMembership(
  prisma: PrismaService,
  userId: string,
): Promise<{ tenantId: string }> {
  const tenant = await prisma.tenant.create({
    data: { slug: `test-tenant-${randomUUID()}` },
  });
  await createPrimaryStore(prisma, tenant.id);
  await prisma.tenantMembership.create({
    data: {
      userId,
      tenantId: tenant.id,
      role: 'OWNER',
      status: 'ACTIVE',
    },
  });
  return { tenantId: tenant.id };
}

/**
 * Phase 5 W4 — generalizes `grantOwnerMembership` for a role other than
 * `OWNER`, on an EXISTING tenant (rather than minting a new one), so a
 * test can put multiple differently-roled members on the SAME tenant
 * (e.g. proving OWNER/ADMIN/STAFF/VIEWER are each independently blocked
 * on one suspended tenant).
 */
export async function grantMembership(
  prisma: PrismaService,
  userId: string,
  tenantId: string,
  role: 'OWNER' | 'ADMIN' | 'STAFF' | 'VIEWER',
): Promise<void> {
  await prisma.tenantMembership.create({
    data: { userId, tenantId, role, status: 'ACTIVE' },
  });
}

export async function registerAdmin(
  app: INestApplication,
  prisma: PrismaService,
): Promise<TestUser & { tenantId: string }> {
  const user = await registerUser(app, 'admin');
  await promoteToAdmin(prisma, user.id);
  const { tenantId } = await grantOwnerMembership(prisma, user.id);
  return { ...user, tenantId };
}

export function authHeader(user: TestUser): [string, string] {
  return ['Authorization', `Bearer ${user.accessToken}`];
}

/**
 * Phase 4 W7 (decision P4-D2's create-path fix) — `tenantId` is required at
 * the DB layer as of W7 (20 tables, `backend/src/migration-safety.spec.ts`);
 * these Prisma-direct fixture builders now need one too. Rather than force
 * every one of this suite's ~47 call sites to supply an explicit tenant
 * (most of them test feature behavior, not multi-tenancy, and don't care
 * which tenant a fixture row belongs to), `tenantId` is an OPTIONAL
 * parameter on every builder below — omit it and a fresh throwaway tenant
 * is created for that one fixture; pass one explicitly when a test's own
 * assertions actually depend on tenant identity/isolation.
 */
async function ensureTenantId(
  prisma: PrismaService,
  tenantId?: string,
): Promise<string> {
  if (tenantId) {
    return tenantId;
  }
  // Reuse the most recently created tenant in this (post-`resetDatabase`)
  // test's own data if one already exists — e.g. a `registerAdmin()` call
  // earlier in the same test — rather than unconditionally minting a new
  // one. Keeps ambient fixture rows (a product added to a cart, a coupon
  // applied at checkout) under the SAME tenant as that test's admin/
  // storefront context by default, matching real single-tenant behavior;
  // a test that genuinely needs two distinct tenants passes `tenantId`
  // explicitly for at least the second one, same as it must already name
  // which tenant a `TenantMembership` belongs to.
  const existing = await prisma.tenant.findFirst({
    orderBy: { createdAt: 'desc' },
  });
  if (existing) {
    return existing.id;
  }
  const tenant = await prisma.tenant.create({
    data: { slug: `fixture-tenant-${randomUUID()}` },
  });
  // Phase 5 W9 — pair every freshly-minted tenant with a primary Store
  // (see createPrimaryStore's own comment on grantOwnerMembership above).
  await createPrimaryStore(prisma, tenant.id);
  return tenant.id;
}

export interface ProductFixtureOptions {
  name?: string;
  basePrice?: string;
  minQuantity?: number;
  maxQuantity?: number | null;
  isActive?: boolean;
  tenantId?: string;
}

export interface ProductFixture {
  categoryId: string;
  productId: string;
  slug: string;
  basePrice: string;
}

/** Direct-via-Prisma catalog fixtures — catalog admin CRUD (Phase 2/3) is
 * out of scope for this phase, so tests build their own minimal, exact
 * catalog state instead of going through the admin API. */
export async function createProduct(
  prisma: PrismaService,
  options: ProductFixtureOptions = {},
): Promise<ProductFixture> {
  const tenantId = await ensureTenantId(prisma, options.tenantId);
  const category = await prisma.category.create({
    data: {
      name: `Test Category ${randomUUID()}`,
      slug: `cat-${randomUUID()}`,
      tenantId,
    },
  });
  const slug = `prod-${randomUUID()}`;
  const basePrice = options.basePrice ?? '100.00';
  const product = await prisma.product.create({
    data: {
      categoryId: category.id,
      name: options.name ?? `Test Product ${randomUUID()}`,
      slug,
      basePrice,
      minQuantity: options.minQuantity ?? 1,
      maxQuantity:
        options.maxQuantity === undefined ? 100 : options.maxQuantity,
      isActive: options.isActive ?? true,
      tenantId,
    },
  });
  return { categoryId: category.id, productId: product.id, slug, basePrice };
}

export async function createVariant(
  prisma: PrismaService,
  productId: string,
  priceDelta = '0.00',
  isAvailable = true,
  tenantId?: string,
): Promise<string> {
  const resolvedTenantId = await ensureTenantId(prisma, tenantId);
  const variant = await prisma.productVariant.create({
    data: {
      productId,
      label: `Variant ${randomUUID()}`,
      priceDelta,
      isAvailable,
      tenantId: resolvedTenantId,
    },
  });
  return variant.id;
}

export async function createTextCustomizationField(
  prisma: PrismaService,
  productId: string,
  options: {
    isRequired?: boolean;
    surchargeType?: 'NONE' | 'FLAT' | 'PER_CHARACTER';
    surchargeAmount?: string;
    tenantId?: string;
  } = {},
): Promise<string> {
  const tenantId = await ensureTenantId(prisma, options.tenantId);
  const field = await prisma.customizationField.create({
    data: {
      productId,
      label: `Engraving text ${randomUUID()}`,
      type: 'TEXT',
      isRequired: options.isRequired ?? false,
      surchargeType: options.surchargeType ?? 'NONE',
      surchargeAmount: options.surchargeAmount ?? '0.00',
      tenantId,
    },
  });
  return field.id;
}

export async function createFileCustomizationField(
  prisma: PrismaService,
  productId: string,
  isRequired = false,
  tenantId?: string,
): Promise<string> {
  const resolvedTenantId = await ensureTenantId(prisma, tenantId);
  const field = await prisma.customizationField.create({
    data: {
      productId,
      label: `Logo upload ${randomUUID()}`,
      type: 'LOGO_UPLOAD',
      isRequired,
      tenantId: resolvedTenantId,
    },
  });
  return field.id;
}

/** Direct-via-Prisma "already uploaded" fixture — bypasses the real upload
 * pipeline (Cloudinary is stubbed anyway, see fake-cloudinary.service.ts)
 * for tests that only need an existing uploaded_files row owned by a
 * specific user, not the upload flow itself. */
export async function createUploadedFile(
  prisma: PrismaService,
  userId: string,
  tenantId?: string,
): Promise<string> {
  const resolvedTenantId = await ensureTenantId(prisma, tenantId);
  const file = await prisma.uploadedFile.create({
    data: {
      cloudinaryPublicId: `fake/fixture/${randomUUID()}`,
      uploadedByUserId: userId,
      format: 'png',
      bytes: 1024,
      resourceType: 'image',
      deliveryType: 'authenticated',
      tenantId: resolvedTenantId,
    },
  });
  return file.id;
}

/** Adds one item to `user`'s cart via the real API (exercises the real
 * cart-write path, not a Prisma shortcut) and returns the created item id. */
export async function addCartItem(
  app: INestApplication,
  user: TestUser,
  body: Record<string, unknown>,
): Promise<{ id: string }> {
  const res = await http(app)
    .post(apiPath('/cart/items'))
    .set(...authHeader(user))
    .send(body)
    .expect(201);
  return res.body.data as { id: string };
}

export interface CouponFixtureOptions {
  type?: 'PERCENTAGE' | 'FLAT_AMOUNT' | 'FREE_SHIPPING';
  percentageOff?: number;
  flatAmountOff?: string;
  scopeType?: 'STORE_WIDE' | 'CATEGORY';
  categoryId?: string;
  usageLimitTotal?: number;
  usageLimitPerUser?: number;
  firstOrderOnly?: boolean;
  minOrderValue?: string;
  tenantId?: string;
}

/** Direct-via-Prisma, same rationale as createProduct — admin coupon CRUD
 * (Coupons, PR #32) is not the flow under test here, so tests build their
 * own exact coupon state instead of going through the admin API. */
export async function createCoupon(
  prisma: PrismaService,
  createdByAdminId: string,
  options: CouponFixtureOptions = {},
): Promise<{ id: string; code: string }> {
  const type = options.type ?? 'PERCENTAGE';
  const tenantId = await ensureTenantId(prisma, options.tenantId);
  const coupon = await prisma.coupon.create({
    data: {
      code: `TEST${randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase()}`,
      type,
      percentageOff:
        type === 'PERCENTAGE' ? (options.percentageOff ?? 10) : null,
      flatAmountOff:
        type === 'FLAT_AMOUNT' ? (options.flatAmountOff ?? '5.00') : null,
      scopeType: options.scopeType ?? 'STORE_WIDE',
      categoryId: options.categoryId ?? null,
      usageLimitTotal: options.usageLimitTotal,
      usageLimitPerUser: options.usageLimitPerUser ?? 1,
      firstOrderOnly: options.firstOrderOnly ?? false,
      minOrderValue: options.minOrderValue,
      createdByAdminId,
      tenantId,
    },
  });
  return { id: coupon.id, code: coupon.code };
}

/**
 * Direct-via-Prisma store-scoped Customer fixture (SaaS Phase 2a; spec §C.1
 * item 10 — "dev/test seed/fixture able to create a Customer under Tenant #1's
 * primary store"). There is NO customer auth API in Phase 2a (decision P2-D7:
 * customer auth is Phase 9/12), so tests build Customer rows directly. The
 * caller supplies an existing store + tenant (e.g. from a bootstrapped
 * Tenant #1 or an ad-hoc tenancy fixture).
 */
export async function createCustomer(
  prisma: PrismaService,
  args: {
    storeId: string;
    tenantId: string;
    email?: string;
    isActive?: boolean;
  },
): Promise<{ id: string; email: string }> {
  const email = args.email ?? uniqueEmail('customer');
  const customer = await prisma.customer.create({
    data: {
      storeId: args.storeId,
      tenantId: args.tenantId,
      email,
      // A non-usable hash — Phase 2a has no login path for a Customer.
      passwordHash: `disabled-${randomUUID()}`,
      isActive: args.isActive ?? true,
    },
  });
  return { id: customer.id, email: customer.email };
}

export function shippingFields(): Record<string, string> {
  return {
    shippingRecipientName: 'Test Recipient',
    shippingPhone: '9999999999',
    shippingAddressLine1: '123 Test Street',
    shippingCity: 'Pune',
    shippingState: 'Maharashtra',
    shippingPostalCode: '411001',
    shippingCountry: 'India',
  };
}

/** Minor-unit-safe: matches the app's own decimalToPaise/paiseToDecimalString
 * round trip (money.util.ts) rather than doing float arithmetic here. */
export function rupeesToPaise(rupees: string): bigint {
  return BigInt(
    new Prisma.Decimal(rupees).times(100).toDecimalPlaces(0).toFixed(0),
  );
}
