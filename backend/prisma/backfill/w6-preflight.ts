import { Prisma, PrismaClient } from '@prisma/client';

/**
 * Phase 4, wave W6-D/W6-E — READ-ONLY preflight for the 19 composite FKs
 * (docs/saas/PHASE-4-W6-DECISION-DOCKET.md §4.1/§7) and 6 composite uniques
 * (§4.2/§6). Never writes, never repairs — a non-empty result for any check
 * is a genuine data problem to report for manual review, not something this
 * script fixes.
 *
 * FK preflight pattern (§7):
 *   SELECT c.id, c."<localScopeCol>", c."<fkCol>" FROM "<child>" c
 *   WHERE c."<fkCol>" IS NOT NULL
 *     AND NOT EXISTS (
 *       SELECT 1 FROM "<parent>" p
 *       WHERE p."<parentScopeCol>" = c."<localScopeCol>" AND p.id = c."<fkCol>"
 *     );
 *
 * Unique preflight pattern (§6):
 *   SELECT "<scopeCol>", "<valueCol>", COUNT(*) AS n FROM "<table>"
 *   GROUP BY "<scopeCol>", "<valueCol>" HAVING COUNT(*) > 1;
 *
 * Usage: npx ts-node prisma/backfill/w6-preflight.ts
 */

const prisma = new PrismaClient();

interface FkCheck {
  name: string; // matches the eventual constraint name (§4.1)
  child: string;
  scopeCol: 'tenantId' | 'storeId';
  fkCol: string;
  parent: string;
}

// The exact 19 FKs from §4.1, same table/column data as
// backend/src/migration-safety.spec.ts's W6_APPROVED_COMPOSITE_FKS.
const FK_CHECKS: FkCheck[] = [
  { name: 'categories_storeId_parentCategoryId_fkey', child: 'categories', scopeCol: 'storeId', fkCol: 'parentCategoryId', parent: 'categories' },
  { name: 'products_storeId_categoryId_fkey', child: 'products', scopeCol: 'storeId', fkCol: 'categoryId', parent: 'categories' },
  { name: 'product_images_storeId_productId_fkey', child: 'product_images', scopeCol: 'storeId', fkCol: 'productId', parent: 'products' },
  { name: 'product_variants_storeId_productId_fkey', child: 'product_variants', scopeCol: 'storeId', fkCol: 'productId', parent: 'products' },
  { name: 'customization_fields_storeId_productId_fkey', child: 'customization_fields', scopeCol: 'storeId', fkCol: 'productId', parent: 'products' },
  { name: 'cart_items_storeId_productId_fkey', child: 'cart_items', scopeCol: 'storeId', fkCol: 'productId', parent: 'products' },
  { name: 'cart_items_storeId_variantId_fkey', child: 'cart_items', scopeCol: 'storeId', fkCol: 'variantId', parent: 'product_variants' },
  { name: 'cart_item_customizations_storeId_customizationFieldId_fkey', child: 'cart_item_customizations', scopeCol: 'storeId', fkCol: 'customizationFieldId', parent: 'customization_fields' },
  { name: 'orders_storeId_couponId_fkey', child: 'orders', scopeCol: 'storeId', fkCol: 'couponId', parent: 'coupons' },
  { name: 'order_items_storeId_productId_fkey', child: 'order_items', scopeCol: 'storeId', fkCol: 'productId', parent: 'products' },
  { name: 'invoices_tenantId_orderId_fkey', child: 'invoices', scopeCol: 'tenantId', fkCol: 'orderId', parent: 'orders' },
  { name: 'payment_attempts_tenantId_orderId_fkey', child: 'payment_attempts', scopeCol: 'tenantId', fkCol: 'orderId', parent: 'orders' },
  { name: 'refunds_tenantId_paymentAttemptId_fkey', child: 'refunds', scopeCol: 'tenantId', fkCol: 'paymentAttemptId', parent: 'payment_attempts' },
  { name: 'order_status_history_tenantId_orderId_fkey', child: 'order_status_history', scopeCol: 'tenantId', fkCol: 'orderId', parent: 'orders' },
  { name: 'coupons_storeId_categoryId_fkey', child: 'coupons', scopeCol: 'storeId', fkCol: 'categoryId', parent: 'categories' },
  { name: 'coupon_usages_storeId_couponId_fkey', child: 'coupon_usages', scopeCol: 'storeId', fkCol: 'couponId', parent: 'coupons' },
  { name: 'coupon_usages_tenantId_orderId_fkey', child: 'coupon_usages', scopeCol: 'tenantId', fkCol: 'orderId', parent: 'orders' },
  { name: 'reviews_storeId_productId_fkey', child: 'reviews', scopeCol: 'storeId', fkCol: 'productId', parent: 'products' },
  { name: 'reviews_storeId_orderItemId_fkey', child: 'reviews', scopeCol: 'storeId', fkCol: 'orderItemId', parent: 'order_items' },
];

interface UniqueCheck {
  table: string;
  scopeCol: 'tenantId' | 'storeId';
  valueCols: string[]; // 1 or 2 value columns (product_variants has 2)
}

// The exact 6 composite uniques from §4.2.
const UNIQUE_CHECKS: UniqueCheck[] = [
  { table: 'products', scopeCol: 'storeId', valueCols: ['slug'] },
  { table: 'categories', scopeCol: 'storeId', valueCols: ['slug'] },
  { table: 'coupons', scopeCol: 'storeId', valueCols: ['code'] },
  { table: 'orders', scopeCol: 'tenantId', valueCols: ['orderNumber'] },
  { table: 'invoices', scopeCol: 'tenantId', valueCols: ['invoiceNumber'] },
  { table: 'product_variants', scopeCol: 'storeId', valueCols: ['productId', 'label'] },
];

interface FkPreflightResult {
  name: string;
  violationCount: number;
  sampleRows: Record<string, unknown>[];
}

interface UniquePreflightResult {
  table: string;
  duplicateGroupCount: number;
  sampleGroups: Record<string, unknown>[];
}

async function runFkPreflight(check: FkCheck): Promise<FkPreflightResult> {
  const c = Prisma.raw(`"${check.child}"`);
  const p = Prisma.raw(`"${check.parent}"`);
  const scopeCol = Prisma.raw(`"${check.scopeCol}"`);
  const fkCol = Prisma.raw(`"${check.fkCol}"`);
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>(
    Prisma.sql`
      SELECT c.id, c.${scopeCol} AS "localScope", c.${fkCol} AS "fkValue"
      FROM ${c} c
      WHERE c.${fkCol} IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM ${p} p
          WHERE p.${scopeCol} = c.${scopeCol} AND p.id = c.${fkCol}
        )
      LIMIT 20
    `,
  );
  return { name: check.name, violationCount: rows.length, sampleRows: rows };
}

async function runUniquePreflight(
  check: UniqueCheck,
): Promise<UniquePreflightResult> {
  const t = Prisma.raw(`"${check.table}"`);
  const scopeCol = Prisma.raw(`"${check.scopeCol}"`);
  const valueColsSelect = Prisma.raw(
    check.valueCols.map((c) => `"${c}"`).join(', '),
  );
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>(
    Prisma.sql`
      SELECT ${scopeCol} AS "scope", ${valueColsSelect}, COUNT(*)::int AS n
      FROM ${t}
      GROUP BY ${scopeCol}, ${valueColsSelect}
      HAVING COUNT(*) > 1
      LIMIT 20
    `,
  );
  return {
    table: check.table,
    duplicateGroupCount: rows.length,
    sampleGroups: rows,
  };
}

async function main(): Promise<void> {
  console.log('Phase 4 W6-D/E preflight — read-only, zero writes.\n');

  console.log('--- FK preflight (19 checks) ---');
  const fkResults: FkPreflightResult[] = [];
  for (const check of FK_CHECKS) {
    const r = await runFkPreflight(check);
    fkResults.push(r);
    console.log(`${r.name.padEnd(62)} violations=${r.violationCount}`);
    if (r.violationCount > 0) {
      console.log('  SAMPLE:', JSON.stringify(r.sampleRows));
    }
  }

  console.log('\n--- Unique preflight (6 checks) ---');
  const uniqueResults: UniquePreflightResult[] = [];
  for (const check of UNIQUE_CHECKS) {
    const r = await runUniquePreflight(check);
    uniqueResults.push(r);
    console.log(`${r.table.padEnd(20)} duplicateGroups=${r.duplicateGroupCount}`);
    if (r.duplicateGroupCount > 0) {
      console.log('  SAMPLE:', JSON.stringify(r.sampleGroups));
    }
  }

  const fkFailures = fkResults.filter((r) => r.violationCount > 0);
  const uniqueFailures = uniqueResults.filter((r) => r.duplicateGroupCount > 0);

  console.log('\n--- Summary ---');
  console.log(`FK preflight: ${fkResults.length - fkFailures.length}/${fkResults.length} passed (zero violations)`);
  console.log(`Unique preflight: ${uniqueResults.length - uniqueFailures.length}/${uniqueResults.length} passed (zero duplicate groups)`);
  console.log(
    JSON.stringify({ fkResults, uniqueResults, fkFailures, uniqueFailures }, null, 2),
  );

  if (fkFailures.length > 0 || uniqueFailures.length > 0) {
    console.error(
      '\nPREFLIGHT FAILED — STOP. Do not proceed to the FK/unique migration. Report the above rows for manual review.',
    );
    process.exitCode = 1;
  } else {
    console.log('\nPREFLIGHT PASSED — all 19 FK checks and 6 unique checks returned zero rows.');
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

export { FK_CHECKS, UNIQUE_CHECKS, runFkPreflight, runUniquePreflight };
export type { FkCheck, UniqueCheck, FkPreflightResult, UniquePreflightResult };
