import { Prisma, PrismaClient } from '@prisma/client';

/**
 * Phase 4, wave W7 — READ-ONLY preflight for the tenantId NOT NULL
 * contract step (decision P4-D2, docs/saas/DECISIONS.md; backend/src/
 * migration-safety.spec.ts). Never writes, never repairs — a non-zero
 * result for any check is a genuine data or schema-drift problem to
 * report for manual review, not something this script fixes.
 *
 * Three checks, mirroring the discipline of w6-preflight.ts:
 *   1. `tenantId` NULL count = 0 for each of the 20 W7-approved tables
 *      (`SELECT COUNT(*) FROM "<table>" WHERE "tenantId" IS NULL`).
 *      `outbox_events` is deliberately absent — its `tenantId` stays
 *      nullable forever (PHASE-4-START-GATE-AND-IMPLEMENTATION-SPEC.md
 *      §3.6) and is never checked here.
 *   2. The 5 legacy single-column uniques this wave drops must currently
 *      exist (proves there is something to drop, and that no earlier,
 *      unrelated change already removed them).
 *   3. The 5 W6 composite uniques that supersede them must currently
 *      exist (proves W6 actually landed on this database before W7 runs
 *      — dropping the legacy uniques is only safe once their composite
 *      replacements are already live).
 *
 * IMPORTANT — verified against a real database, not assumed: Prisma's
 * `@unique` scalar attribute compiles to a plain `CREATE UNIQUE INDEX`,
 * never a named table CONSTRAINT (confirmed: zero rows in `pg_constraint`
 * for any of the 5 legacy names; all 5 present in `pg_indexes` instead —
 * same for the 5 W6 composite uniques). Both existence checks below query
 * `pg_indexes`, not `pg_constraint`.
 *
 * Usage: npx ts-node prisma/backfill/w7-preflight.ts
 */

const prisma = new PrismaClient();

// The exact 20 tables from W7_APPROVED_TENANT_NOT_NULL_COLUMNS
// (backend/src/migration-safety.spec.ts) — tenantId only, outbox_events
// excluded, storeId/customerId out of scope.
const NOT_NULL_TABLES: string[] = [
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
  'invoices',
  'order_items',
  'order_item_customizations',
  'payment_attempts',
  'refunds',
  'order_status_history',
  'idempotency_keys',
  'reviews',
  'coupons',
  'coupon_usages',
];

// The exact 5 legacy unique indexes W7 drops.
const LEGACY_UNIQUE_INDEXES: string[] = [
  'categories_slug_key',
  'products_slug_key',
  'coupons_code_key',
  'orders_orderNumber_key',
  'invoices_invoiceNumber_key',
];

// The exact 5 W6 composite unique indexes that supersede them — must
// already exist (proves W6 has landed) and must NOT be touched by W7.
const W6_COMPOSITE_UNIQUE_INDEXES: string[] = [
  'products_storeId_slug_key',
  'categories_storeId_slug_key',
  'coupons_storeId_code_key',
  'orders_tenantId_orderNumber_key',
  'invoices_tenantId_invoiceNumber_key',
];

interface NullCheckResult {
  table: string;
  nullCount: number;
}

interface IndexExistsResult {
  name: string;
  exists: boolean;
}

async function checkTenantIdNulls(table: string): Promise<NullCheckResult> {
  const t = Prisma.raw(`"${table}"`);
  const rows = await prisma.$queryRaw<{ n: bigint }[]>(
    Prisma.sql`SELECT COUNT(*)::bigint AS n FROM ${t} WHERE "tenantId" IS NULL`,
  );
  return { table, nullCount: Number(rows[0]?.n ?? 0) };
}

async function checkIndexesExist(
  names: string[],
): Promise<IndexExistsResult[]> {
  const rows = await prisma.$queryRaw<{ indexname: string }[]>(
    Prisma.sql`SELECT indexname FROM pg_indexes WHERE indexname IN (${Prisma.join(
      names,
    )})`,
  );
  const found = new Set(rows.map((r) => r.indexname));
  return names.map((name) => ({ name, exists: found.has(name) }));
}

async function main(): Promise<void> {
  console.log('Phase 4 W7 preflight — read-only, zero writes.\n');

  console.log(`--- tenantId NULL check (${NOT_NULL_TABLES.length} tables) ---`);
  const nullResults: NullCheckResult[] = [];
  for (const table of NOT_NULL_TABLES) {
    const r = await checkTenantIdNulls(table);
    nullResults.push(r);
    console.log(`${r.table.padEnd(28)} nulls=${r.nullCount}`);
  }

  console.log(
    `\n--- Legacy unique index existence check (${LEGACY_UNIQUE_INDEXES.length} indexes, must all exist) ---`,
  );
  const legacyResults = await checkIndexesExist(LEGACY_UNIQUE_INDEXES);
  for (const r of legacyResults) {
    console.log(`${r.name.padEnd(30)} exists=${r.exists}`);
  }

  console.log(
    `\n--- W6 composite unique index existence check (${W6_COMPOSITE_UNIQUE_INDEXES.length} indexes, must all exist) ---`,
  );
  const w6Results = await checkIndexesExist(W6_COMPOSITE_UNIQUE_INDEXES);
  for (const r of w6Results) {
    console.log(`${r.name.padEnd(38)} exists=${r.exists}`);
  }

  const nullFailures = nullResults.filter((r) => r.nullCount > 0);
  const legacyMissing = legacyResults.filter((r) => !r.exists);
  const w6Missing = w6Results.filter((r) => !r.exists);

  console.log('\n--- Summary ---');
  console.log(
    `tenantId NULL check: ${nullResults.length - nullFailures.length}/${nullResults.length} passed (zero nulls)`,
  );
  console.log(
    `Legacy unique existence: ${legacyResults.length - legacyMissing.length}/${legacyResults.length} passed (present)`,
  );
  console.log(
    `W6 composite unique existence: ${w6Results.length - w6Missing.length}/${w6Results.length} passed (present)`,
  );
  console.log(
    JSON.stringify(
      { nullResults, legacyResults, w6Results, nullFailures, legacyMissing, w6Missing },
      null,
      2,
    ),
  );

  if (nullFailures.length > 0 || legacyMissing.length > 0 || w6Missing.length > 0) {
    console.error(
      '\nPREFLIGHT FAILED — STOP. Do not proceed to the W7 migration. Report the above rows for manual review.',
    );
    process.exitCode = 1;
  } else {
    console.log(
      '\nPREFLIGHT PASSED — zero tenantId nulls across all 20 tables; all 5 legacy unique indexes present; all 5 W6 composite unique indexes present.',
    );
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

export {
  NOT_NULL_TABLES,
  LEGACY_UNIQUE_INDEXES,
  W6_COMPOSITE_UNIQUE_INDEXES,
  checkTenantIdNulls,
  checkIndexesExist,
};
export type { NullCheckResult, IndexExistsResult };
