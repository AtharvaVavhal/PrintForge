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

export async function registerAdmin(
  app: INestApplication,
  prisma: PrismaService,
): Promise<TestUser> {
  const user = await registerUser(app, 'admin');
  await promoteToAdmin(prisma, user.id);
  return user;
}

export function authHeader(user: TestUser): [string, string] {
  return ['Authorization', `Bearer ${user.accessToken}`];
}

export interface ProductFixtureOptions {
  basePrice?: string;
  minQuantity?: number;
  maxQuantity?: number | null;
  isActive?: boolean;
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
  const category = await prisma.category.create({
    data: {
      name: `Test Category ${randomUUID()}`,
      slug: `cat-${randomUUID()}`,
    },
  });
  const slug = `prod-${randomUUID()}`;
  const basePrice = options.basePrice ?? '100.00';
  const product = await prisma.product.create({
    data: {
      categoryId: category.id,
      name: `Test Product ${randomUUID()}`,
      slug,
      basePrice,
      minQuantity: options.minQuantity ?? 1,
      maxQuantity:
        options.maxQuantity === undefined ? 100 : options.maxQuantity,
      isActive: options.isActive ?? true,
    },
  });
  return { categoryId: category.id, productId: product.id, slug, basePrice };
}

export async function createVariant(
  prisma: PrismaService,
  productId: string,
  priceDelta = '0.00',
  isAvailable = true,
): Promise<string> {
  const variant = await prisma.productVariant.create({
    data: {
      productId,
      label: `Variant ${randomUUID()}`,
      priceDelta,
      isAvailable,
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
  } = {},
): Promise<string> {
  const field = await prisma.customizationField.create({
    data: {
      productId,
      label: `Engraving text ${randomUUID()}`,
      type: 'TEXT',
      isRequired: options.isRequired ?? false,
      surchargeType: options.surchargeType ?? 'NONE',
      surchargeAmount: options.surchargeAmount ?? '0.00',
    },
  });
  return field.id;
}

export async function createFileCustomizationField(
  prisma: PrismaService,
  productId: string,
  isRequired = false,
): Promise<string> {
  const field = await prisma.customizationField.create({
    data: {
      productId,
      label: `Logo upload ${randomUUID()}`,
      type: 'LOGO_UPLOAD',
      isRequired,
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
): Promise<string> {
  const file = await prisma.uploadedFile.create({
    data: {
      cloudinaryPublicId: `fake/fixture/${randomUUID()}`,
      uploadedByUserId: userId,
      format: 'png',
      bytes: 1024,
      resourceType: 'image',
      deliveryType: 'authenticated',
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
