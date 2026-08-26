import { PrismaClient } from '@prisma/client';

/**
 * Every @@map'd table in prisma/schema.prisma (kept in sync manually —
 * there's no dev-time signal if a new model is added and this list isn't
 * updated, so a new model shows up as leftover rows between tests rather
 * than a hard failure). TRUNCATE...CASCADE means listing every table is
 * belt-and-suspenders, not strictly required for FK ordering, but it's
 * what actually gets emptied between tests, so completeness matters.
 */
const ALL_TABLES = [
  'users',
  'refresh_tokens',
  'categories',
  'products',
  'product_images',
  'product_variants',
  'customization_fields',
  'uploaded_files',
  'carts',
  'cart_items',
  'cart_item_customizations',
  'orders',
  'order_items',
  'order_item_customizations',
  'payment_attempts',
  'refunds',
  'order_status_history',
  'webhook_events',
  'idempotency_keys',
  'outbox_events',
  'app_settings',
];

/**
 * Full-truncate isolation between tests (§29/§27 — this repo has no other
 * established e2e reset pattern; app.e2e-spec.ts's /health test never
 * touches the database). RESTART IDENTITY CASCADE resets every table in
 * one statement regardless of FK direction — safe because every table here
 * uses a uuid default, not a serial, so nothing actually depends on the
 * identity reset; it's just cheap insurance.
 *
 * Guarded to only ever run against a database whose name ends in `_test`,
 * so a misconfigured DATABASE_URL can never truncate printforge_dev's real
 * data — see test/e2e/support/README.md.
 */
export async function resetDatabase(prisma: PrismaClient): Promise<void> {
  const url = process.env.DATABASE_URL ?? '';
  const dbName = url.split('/').pop()?.split('?')[0] ?? '';
  if (!dbName.endsWith('_test')) {
    throw new Error(
      `Refusing to truncate database "${dbName}" — DATABASE_URL must point at a *_test database for e2e tests. Check .env.test is being loaded (test/e2e/support/env.setup.ts).`,
    );
  }
  const tableList = ALL_TABLES.map((t) => `"${t}"`).join(', ');
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE`,
  );
}
