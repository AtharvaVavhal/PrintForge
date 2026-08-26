import { randomBytes } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { PrismaClient } from '@prisma/client';

/**
 * Repeatable production catalog seeder — populates real test data via the
 * REAL public/admin HTTP API against a running deployment (BLUEPRINT-v1.2.md
 * §20/§21), not direct Prisma writes for content. The one exception is the
 * initial admin-role promotion: there is no self-promotion API endpoint by
 * design (§23 — role escalation is never a client-reachable action), so
 * that one step connects to Postgres directly via Prisma, exactly as
 * prisma/seed.ts (the local-dev seeder) would.
 *
 * Everything this script creates is idempotent by natural key (category
 * slug, product slug, variant label, customization-field label) — safe to
 * re-run; existing rows are detected via the public GET endpoints and
 * skipped rather than duplicated or erroring on a 409.
 *
 * Usage — every credential is env-var-driven, nothing is hardcoded or
 * committed:
 *
 *   DATABASE_URL='<production Postgres connection string>' \
 *     npx ts-node prisma/seed-production.ts
 *
 * Optional overrides:
 *   SEED_API_BASE_URL     (default: the deployed production API)
 *   SEED_ADMIN_EMAIL      (default: a fixed seed-admin address)
 *   SEED_ADMIN_PASSWORD   (default: freshly generated and printed once —
 *                          export it yourself for a truly repeatable
 *                          re-run across machines/sessions)
 *
 * Refuses to run — see assertNotLocalDatabase — if DATABASE_URL looks like
 * it points at printforge_dev or printforge_test, as a last-resort guard
 * against fat-fingering this against a local database. This script never
 * logs DATABASE_URL's value, only the database name it parsed out of it.
 */

const API_BASE_URL =
  process.env.SEED_API_BASE_URL ?? 'https://printforge-8c9m.onrender.com/api/v1';

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'catalog-seed-admin@printforge.internal';

// ─── Safety guard ──────────────────────────────────────────────────────

function assertNotLocalDatabase(databaseUrl: string): void {
  const dbName = databaseUrl.split('/').pop()?.split('?')[0] ?? '';
  if (dbName === 'printforge_dev' || dbName === 'printforge_test') {
    throw new Error(
      `Refusing to run: DATABASE_URL points at "${dbName}", a local dev/test ` +
        'database — this script is for seeding the production catalog only. ' +
        'If this really is intentional, this guard needs to be removed by hand.',
    );
  }
  console.log(`DATABASE_URL target confirmed: database name "${dbName}" (not dev/test).`);
}

// ─── Minimal PNG placeholder-image generator (no new dependencies) ─────
// Hand-rolled: PNG signature + IHDR + zlib-deflated IDAT (8-bit RGB, no
// filtering) + IEND, with a tiny embedded 3x5 bitmap font so the product
// name is actually legible pixels on the image, not just metadata.

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buf) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData), 0);
  return Buffer.concat([length, typeAndData, crc]);
}

type RGB = [number, number, number];

const FONT_3X5: Record<string, string[]> = {
  ' ': ['000', '000', '000', '000', '000'],
  A: ['010', '101', '111', '101', '101'],
  C: ['011', '100', '100', '100', '011'],
  D: ['110', '101', '101', '101', '110'],
  E: ['111', '100', '110', '100', '111'],
  F: ['111', '100', '110', '100', '100'],
  G: ['011', '100', '101', '101', '011'],
  H: ['101', '101', '111', '101', '101'],
  I: ['111', '010', '010', '010', '111'],
  L: ['100', '100', '100', '100', '111'],
  M: ['101', '111', '111', '101', '101'],
  N: ['101', '111', '111', '111', '101'],
  O: ['010', '101', '101', '101', '010'],
  P: ['110', '101', '110', '100', '100'],
  R: ['110', '101', '110', '101', '101'],
  S: ['011', '100', '010', '001', '110'],
  T: ['111', '010', '010', '010', '010'],
  U: ['101', '101', '101', '101', '011'],
  V: ['101', '101', '101', '101', '010'],
  W: ['101', '101', '111', '111', '101'],
  X: ['101', '101', '010', '101', '101'],
};

function wrapWords(text: string, maxCharsPerLine: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxCharsPerLine && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/** Solid background color + the product name rendered as real pixels
 * (centered, word-wrapped), encoded as an actual 8-bit RGB PNG. */
function generatePlaceholderPng(productName: string, background: RGB): Buffer {
  const width = 480;
  const height = 480;
  const scale = 6;
  const glyphAdvance = 4 * scale; // 3px glyph + 1px gap, scaled
  const lineHeight = 7 * scale; // 5px glyph + 2px gap, scaled
  const maxCharsPerLine = Math.floor(width / glyphAdvance) - 2;

  const pixels: RGB[][] = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => background),
  );

  const brightness = (background[0] * 299 + background[1] * 587 + background[2] * 114) / 1000;
  const textColor: RGB = brightness > 140 ? [20, 20, 20] : [245, 245, 245];

  const lines = wrapWords(productName.toUpperCase(), maxCharsPerLine);
  const blockHeight = lines.length * lineHeight;
  const startY = Math.round((height - blockHeight) / 2);

  lines.forEach((line, lineIndex) => {
    const glyphs = line.split('').map((ch) => FONT_3X5[ch] ?? FONT_3X5[' ']);
    const lineWidth = glyphs.length * glyphAdvance - scale;
    const startX = Math.round((width - lineWidth) / 2);
    const lineY = startY + lineIndex * lineHeight;

    glyphs.forEach((glyph, charIndex) => {
      const gx = startX + charIndex * glyphAdvance;
      for (let row = 0; row < 5; row++) {
        for (let col = 0; col < 3; col++) {
          if (glyph[row][col] !== '1') continue;
          for (let sy = 0; sy < scale; sy++) {
            for (let sx = 0; sx < scale; sx++) {
              const px = gx + col * scale + sx;
              const py = lineY + row * scale + sy;
              if (px >= 0 && px < width && py >= 0 && py < height) {
                pixels[py][px] = textColor;
              }
            }
          }
        }
      }
    });
  });

  const raw = Buffer.alloc(height * (1 + width * 3));
  let offset = 0;
  for (let y = 0; y < height; y++) {
    raw[offset++] = 0; // filter type: none
    for (let x = 0; x < width; x++) {
      const [r, g, b] = pixels[y][x];
      raw[offset++] = r;
      raw[offset++] = g;
      raw[offset++] = b;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: RGB
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ─── Tiny API client (native fetch — no axios dependency needed here) ──

interface ApiSuccess<T> {
  success: true;
  data: T;
  meta?: Record<string, unknown>;
}
interface ApiError {
  success: false;
  error: { code: string; message: string; details: unknown[] };
}

async function apiRequest<T>(
  method: 'GET' | 'POST',
  path: string,
  options: { token?: string; json?: unknown; form?: FormData } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  let body: BodyInit | undefined;
  if (options.json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.json);
  } else if (options.form) {
    body = options.form;
  }

  const res = await fetch(`${API_BASE_URL}${path}`, { method, headers, body });
  const payload = (await res.json()) as ApiSuccess<T> | ApiError;
  if (!payload.success) {
    throw new Error(
      `${method} ${path} -> ${res.status} ${payload.error.code}: ${payload.error.message}`,
    );
  }
  return payload.data;
}

function isConflict(err: unknown): boolean {
  return err instanceof Error && /-> 409\b/.test(err.message);
}

// ─── Catalog content ────────────────────────────────────────────────────

interface VariantSeed {
  label: string;
  priceDelta?: number;
  isAvailable?: boolean;
}

interface CustomizationFieldSeed {
  label: string;
  type:
    | 'TEXT'
    | 'LOGO_UPLOAD'
    | 'IMAGE_UPLOAD'
    | 'DESIGN_FILE_UPLOAD'
    | 'COLOR_SELECT'
    | 'INSTRUCTIONS';
  isRequired?: boolean;
  helpText?: string;
  constraints?: Record<string, unknown>;
  surchargeType?: 'NONE' | 'FLAT' | 'PER_CHARACTER';
  surchargeAmount?: number;
}

interface ProductSeed {
  categorySlug: string;
  name: string;
  slug: string;
  basePrice: number;
  minQuantity: number;
  maxQuantity?: number;
  imageBackground: RGB;
  variants: VariantSeed[];
  customizationFields: CustomizationFieldSeed[];
}

const CATEGORIES: { name: string; slug: string }[] = [
  { name: 'Mugs', slug: 'mugs' },
  { name: 'T-Shirts', slug: 't-shirts' },
  { name: 'Photo Frames', slug: 'photo-frames' },
];

// A mix of every CustomizationFieldType across products, per-field
// constraints matching what customization-validation.util.ts actually
// reads (maxLength/options for text types, allowedFormats/maxFileSizeMb
// for file types) — realistic enough for Phase 3's dynamic form to render
// against.
const PRODUCTS: ProductSeed[] = [
  {
    categorySlug: 'mugs',
    name: 'Classic Ceramic Mug',
    slug: 'classic-ceramic-mug',
    basePrice: 299,
    minQuantity: 1,
    maxQuantity: 50,
    imageBackground: [216, 69, 44],
    variants: [
      { label: '11oz', priceDelta: 0 },
      { label: '15oz', priceDelta: 60 },
    ],
    customizationFields: [
      {
        label: 'Logo',
        type: 'LOGO_UPLOAD',
        isRequired: true,
        helpText: 'PNG or JPEG, at least 1000x1000px for a crisp print.',
        constraints: { allowedFormats: ['png', 'jpeg'], maxFileSizeMb: 5 },
        surchargeType: 'NONE',
      },
      {
        label: 'Mug Color',
        type: 'COLOR_SELECT',
        isRequired: true,
        constraints: { options: ['White', 'Black', 'Red'] },
      },
    ],
  },
  {
    categorySlug: 'mugs',
    name: 'Photo Collage Mug',
    slug: 'photo-collage-mug',
    basePrice: 349,
    minQuantity: 1,
    imageBackground: [58, 122, 168],
    variants: [{ label: 'Standard 11oz', priceDelta: 0 }],
    customizationFields: [
      {
        label: 'Photo',
        type: 'IMAGE_UPLOAD',
        isRequired: true,
        constraints: { allowedFormats: ['png', 'jpeg'], maxFileSizeMb: 8 },
      },
      {
        label: 'Caption',
        type: 'TEXT',
        isRequired: false,
        constraints: { maxLength: 40 },
        surchargeType: 'PER_CHARACTER',
        surchargeAmount: 1,
      },
    ],
  },
  {
    categorySlug: 't-shirts',
    name: 'Custom Print T-Shirt',
    slug: 'custom-print-t-shirt',
    basePrice: 499,
    minQuantity: 1,
    maxQuantity: 100,
    imageBackground: [44, 130, 90],
    variants: [
      { label: 'S', priceDelta: 0 },
      { label: 'M', priceDelta: 0 },
      { label: 'L', priceDelta: 0 },
      { label: 'XL', priceDelta: 40 },
    ],
    customizationFields: [
      {
        label: 'Print Design',
        type: 'DESIGN_FILE_UPLOAD',
        isRequired: true,
        helpText: 'Vector or high-res raster artwork for the front print.',
        constraints: { allowedFormats: ['png', 'jpeg', 'pdf'], maxFileSizeMb: 10 },
        surchargeType: 'FLAT',
        surchargeAmount: 75,
      },
      {
        label: 'Shirt Color',
        type: 'COLOR_SELECT',
        isRequired: true,
        constraints: { options: ['White', 'Black', 'Navy', 'Grey'] },
      },
    ],
  },
  {
    categorySlug: 't-shirts',
    name: 'Text Slogan T-Shirt',
    slug: 'text-slogan-t-shirt',
    basePrice: 449,
    minQuantity: 1,
    imageBackground: [180, 140, 30],
    variants: [
      { label: 'S', priceDelta: 0 },
      { label: 'M', priceDelta: 0 },
      { label: 'L', priceDelta: 0 },
    ],
    customizationFields: [
      {
        label: 'Slogan Text',
        type: 'TEXT',
        isRequired: true,
        constraints: { maxLength: 60 },
        surchargeType: 'NONE',
      },
      {
        label: 'Text Color',
        type: 'COLOR_SELECT',
        isRequired: true,
        constraints: { options: ['White', 'Black', 'Gold'] },
      },
    ],
  },
  {
    categorySlug: 'photo-frames',
    name: 'Wooden Photo Frame',
    slug: 'wooden-photo-frame',
    basePrice: 599,
    minQuantity: 1,
    maxQuantity: 20,
    imageBackground: [120, 84, 51],
    variants: [
      { label: '4x6"', priceDelta: 0 },
      { label: '5x7"', priceDelta: 150 },
      { label: '8x10"', priceDelta: 400 },
    ],
    customizationFields: [
      {
        label: 'Photo',
        type: 'IMAGE_UPLOAD',
        isRequired: true,
        constraints: { allowedFormats: ['png', 'jpeg'], maxFileSizeMb: 8 },
      },
      {
        label: 'Special Instructions',
        type: 'INSTRUCTIONS',
        isRequired: false,
        helpText: 'Cropping notes, orientation, anything the printer should know.',
        constraints: { maxLength: 200 },
      },
    ],
  },
  {
    categorySlug: 'photo-frames',
    name: 'Engraved Photo Frame',
    slug: 'engraved-photo-frame',
    basePrice: 799,
    minQuantity: 1,
    imageBackground: [90, 90, 98],
    variants: [
      { label: 'Small', priceDelta: 0 },
      { label: 'Large', priceDelta: 250 },
    ],
    customizationFields: [
      {
        label: 'Photo',
        type: 'IMAGE_UPLOAD',
        isRequired: true,
        constraints: { allowedFormats: ['png', 'jpeg'], maxFileSizeMb: 8 },
      },
      {
        label: 'Engraving Text',
        type: 'TEXT',
        isRequired: true,
        constraints: { maxLength: 25 },
        surchargeType: 'FLAT',
        surchargeAmount: 99,
      },
    ],
  },
];

// ─── Idempotent "ensure" steps ──────────────────────────────────────────

interface CategoryView {
  id: string;
  slug: string;
}
interface VariantView {
  id: string;
  label: string;
}
interface CustomizationFieldView {
  id: string;
  label: string;
}
interface ProductImageView {
  id: string;
  url: string;
}
interface ProductView {
  id: string;
  slug: string;
  variants: VariantView[];
  customizationFields: CustomizationFieldView[];
  images: ProductImageView[];
}

async function ensureCategory(token: string, name: string, slug: string): Promise<string> {
  const existing = await apiRequest<CategoryView[]>('GET', '/categories');
  const found = existing.find((c) => c.slug === slug);
  if (found) {
    console.log(`  category "${slug}" already exists — reusing.`);
    return found.id;
  }
  const created = await apiRequest<CategoryView>('POST', '/categories', {
    token,
    json: { name, slug },
  });
  console.log(`  created category "${slug}".`);
  return created.id;
}

async function fetchProductBySlug(slug: string): Promise<ProductView | null> {
  try {
    return await apiRequest<ProductView>('GET', `/products/${slug}`);
  } catch (err) {
    if (isConflict(err)) throw err;
    return null; // 404 — doesn't exist yet
  }
}

async function ensureProduct(token: string, categoryId: string, seed: ProductSeed): Promise<ProductView> {
  const existing = await fetchProductBySlug(seed.slug);
  if (existing) {
    console.log(`  product "${seed.slug}" already exists — reusing.`);
    return existing;
  }
  await apiRequest('POST', '/products', {
    token,
    json: {
      categoryId,
      name: seed.name,
      slug: seed.slug,
      basePrice: seed.basePrice,
      minQuantity: seed.minQuantity,
      ...(seed.maxQuantity ? { maxQuantity: seed.maxQuantity } : {}),
    },
  });
  console.log(`  created product "${seed.slug}".`);
  const created = await fetchProductBySlug(seed.slug);
  if (!created) throw new Error(`Product "${seed.slug}" vanished immediately after creation`);
  return created;
}

async function ensureVariants(
  token: string,
  product: ProductView,
  variants: VariantSeed[],
): Promise<void> {
  for (const variant of variants) {
    if (product.variants.some((v) => v.label === variant.label)) {
      continue;
    }
    await apiRequest('POST', `/products/${product.id}/variants`, {
      token,
      json: {
        label: variant.label,
        priceDelta: variant.priceDelta ?? 0,
        isAvailable: variant.isAvailable ?? true,
      },
    });
    console.log(`    + variant "${variant.label}"`);
  }
}

async function ensureCustomizationFields(
  token: string,
  product: ProductView,
  fields: CustomizationFieldSeed[],
): Promise<void> {
  for (const field of fields) {
    if (product.customizationFields.some((f) => f.label === field.label)) {
      continue;
    }
    await apiRequest('POST', `/products/${product.id}/customization-fields`, {
      token,
      json: {
        label: field.label,
        type: field.type,
        isRequired: field.isRequired ?? false,
        ...(field.helpText ? { helpText: field.helpText } : {}),
        ...(field.constraints ? { constraints: field.constraints } : {}),
        ...(field.surchargeType ? { surchargeType: field.surchargeType } : {}),
        ...(field.surchargeAmount !== undefined
          ? { surchargeAmount: field.surchargeAmount }
          : {}),
      },
    });
    console.log(`    + customization field "${field.label}" (${field.type})`);
  }
}

async function ensureProductImage(
  token: string,
  product: ProductView,
  productName: string,
  background: RGB,
): Promise<void> {
  if (product.images.length > 0) {
    console.log(`    image already attached — reusing (${product.images[0].url}).`);
    return;
  }

  const png = generatePlaceholderPng(productName, background);
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(png)], { type: 'image/png' }), `${product.slug}.png`);

  const uploaded = await apiRequest<{ id: string; url: string }>('POST', '/uploads', {
    token,
    form,
  });
  const attached = await apiRequest<ProductImageView>(
    'POST',
    `/products/${product.id}/images`,
    { token, json: { uploadedFileId: uploaded.id, isPrimary: true } },
  );
  console.log(`    + image uploaded and attached: ${attached.url}`);
}

// ─── Admin bootstrap ─────────────────────────────────────────────────────

async function registerOrLoginAdmin(): Promise<{ userId: string; token: string; password: string }> {
  const generatedPassword = `Seed-${randomBytes(12).toString('base64url')}`;
  const password = process.env.SEED_ADMIN_PASSWORD ?? generatedPassword;
  const generated = !process.env.SEED_ADMIN_PASSWORD;

  try {
    const result = await apiRequest<{ accessToken: string; user: { id: string } }>(
      'POST',
      '/auth/register',
      { json: { email: ADMIN_EMAIL, password } },
    );
    console.log(`Registered new seed-admin account: ${ADMIN_EMAIL}`);
    if (generated) {
      console.log(
        `  Generated password (not stored anywhere else — save it if you need it): ${password}`,
      );
    }
    return { userId: result.user.id, token: result.accessToken, password };
  } catch (err) {
    if (!isConflict(err)) throw err;
    console.log(`Seed-admin account already exists: ${ADMIN_EMAIL} — logging in.`);
    if (generated) {
      throw new Error(
        'Account already exists but no SEED_ADMIN_PASSWORD was provided to log back in with. ' +
          'Export the password from the original run as SEED_ADMIN_PASSWORD and re-run.',
      );
    }
    const result = await apiRequest<{ accessToken: string; user: { id: string } }>(
      'POST',
      '/auth/login',
      { json: { email: ADMIN_EMAIL, password } },
    );
    return { userId: result.user.id, token: result.accessToken, password };
  }
}

// ─── Main ────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set. This script refuses to guess a default.');
  }
  assertNotLocalDatabase(databaseUrl);
  console.log(`Seeding via API: ${API_BASE_URL}`);

  const { userId, token } = await registerOrLoginAdmin();

  // The only direct-DB step — no self-promotion API endpoint exists by
  // design (§23). Connects explicitly to the DATABASE_URL passed in via
  // env, never an auto-loaded .env file, so there is no ambiguity about
  // which database this touches.
  const prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  try {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.role !== 'ADMIN') {
      await prisma.user.update({ where: { id: userId }, data: { role: 'ADMIN' } });
      console.log(`Promoted ${ADMIN_EMAIL} to ADMIN in the database.`);
    } else {
      console.log(`${ADMIN_EMAIL} is already ADMIN.`);
    }
  } finally {
    await prisma.$disconnect();
  }

  // JwtStrategy re-reads role live from the DB on every request (see
  // jwt.strategy.ts) — the token issued above, still tagged role=CUSTOMER
  // in its own payload, works for admin routes immediately, no re-login.

  const categoryIds = new Map<string, string>();
  console.log('\nCategories:');
  for (const category of CATEGORIES) {
    const id = await ensureCategory(token, category.name, category.slug);
    categoryIds.set(category.slug, id);
  }

  console.log('\nProducts:');
  for (const seed of PRODUCTS) {
    const categoryId = categoryIds.get(seed.categorySlug);
    if (!categoryId) throw new Error(`Unknown category slug in seed data: ${seed.categorySlug}`);

    console.log(`- ${seed.name} (${seed.slug})`);
    const product = await ensureProduct(token, categoryId, seed);
    await ensureVariants(token, product, seed.variants);
    await ensureCustomizationFields(token, product, seed.customizationFields);
    await ensureProductImage(token, product, seed.name, seed.imageBackground);
  }

  console.log(
    `\nDone: ${CATEGORIES.length} categories, ${PRODUCTS.length} products (idempotent — re-running skips what already exists).`,
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
