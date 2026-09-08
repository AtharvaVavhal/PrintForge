import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { Prisma, PrismaClient } from '@prisma/client';
import { parseTrailingNumber, COUNTER_SPECS } from './w4-backfill';

/**
 * Phase 4 W4/W5 backfill — reconciliation (spec §10; Master Plan §25/§26).
 * Read-only. Never writes.
 *
 * Two modes:
 *   --snapshot-out=<file>   capture the current state to a JSON file (run
 *                           this BEFORE the backfill, per Step 5/6 of the
 *                           preparation task, to get a real baseline —
 *                           historical D8-era counts are reference only,
 *                           never trusted as the live baseline).
 *   --compare=<file>        compare the CURRENT live state against a
 *                           previously captured snapshot and print a
 *                           PASS/FAIL line per check.
 *
 * Both modes also always print the "post-only" checks that don't need a
 * baseline (ownership completeness, customerId-mapping cross-check,
 * Tenant/Store resolution, TenantCounter-vs-actual-MAX drift — see
 * `tenantCounterDriftChecks`) — these are meaningful on their own.
 *
 * `parseTrailingNumber`/`COUNTER_SPECS` are imported from `w4-backfill.ts`
 * rather than reimplemented here — one canonical number-parsing
 * implementation, not two that could quietly drift apart (P2 fix, W4
 * independent audit).
 */

const prisma = new PrismaClient();

const AFFECTED_TABLES = [
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
  'outbox_events',
  'coupons',
  'coupon_usages',
  'reviews',
] as const;

/** Tables where tenantId is expected to be NOT NULL on every row post-backfill (all except outbox_events — nullable forever by design, spec §3.6). */
const TENANT_ID_MUST_BE_COMPLETE = AFFECTED_TABLES.filter(
  (t) => t !== 'outbox_events',
);

/** table -> userId-family column, for tables whose customerId should reconcile against role=CUSTOMER users (P4-D1's exact criterion). */
const CUSTOMER_ID_TABLES: Record<string, { userCol: string; custCol: string }> = {
  carts: { userCol: 'userId', custCol: 'customerId' },
  orders: { userCol: 'userId', custCol: 'customerId' },
  reviews: { userCol: 'userId', custCol: 'customerId' },
  coupon_usages: { userCol: 'userId', custCol: 'customerId' },
  idempotency_keys: { userCol: 'userId', custCol: 'customerId' },
  uploaded_files: { userCol: 'uploadedByUserId', custCol: 'uploadedByCustomerId' },
  order_status_history: { userCol: 'changedByUserId', custCol: 'changedByCustomerId' },
};

interface Snapshot {
  capturedAt: string;
  rowCounts: Record<string, number>;
  orderTotalSum: string;
  paymentCapturedSum: string;
  refundSum: string;
  orderNumberSetHash: string;
  invoiceNumberSetHash: string;
  userIdPairHashes: Record<string, string>;
}

async function rowCount(table: string): Promise<number> {
  const t = Prisma.raw(`"${table}"`);
  const [{ count }] = await prisma.$queryRaw<{ count: bigint }[]>(
    Prisma.sql`SELECT COUNT(*)::bigint AS count FROM ${t}`,
  );
  return Number(count);
}

function hashOf(values: string[]): string {
  const h = createHash('sha256');
  for (const v of [...values].sort()) h.update(v).update('\n');
  return h.digest('hex');
}

async function captureSnapshot(): Promise<Snapshot> {
  const rowCounts: Record<string, number> = {};
  for (const t of AFFECTED_TABLES) {
    rowCounts[t] = await rowCount(t);
  }
  rowCounts['tenant_counters'] = await rowCount('tenant_counters');

  const [{ sum: orderTotalSum }] = await prisma.$queryRaw<{ sum: string | null }[]>(
    Prisma.sql`SELECT COALESCE(SUM(total), 0)::text AS sum FROM orders`,
  );
  const [{ sum: paymentCapturedSum }] = await prisma.$queryRaw<
    { sum: string | null }[]
  >(
    Prisma.sql`SELECT COALESCE(SUM("amountPaise"), 0)::text AS sum FROM payment_attempts WHERE status = 'CAPTURED'`,
  );
  const [{ sum: refundSum }] = await prisma.$queryRaw<{ sum: string | null }[]>(
    Prisma.sql`SELECT COALESCE(SUM("amountPaise"), 0)::text AS sum FROM refunds`,
  );

  const orderNumbers = await prisma.$queryRaw<{ orderNumber: string }[]>(
    Prisma.sql`SELECT "orderNumber" FROM orders`,
  );
  const invoiceNumbers = await prisma.$queryRaw<{ invoiceNumber: string }[]>(
    Prisma.sql`SELECT "invoiceNumber" FROM invoices`,
  );

  const userIdPairHashes: Record<string, string> = {};
  for (const [table, userCol] of [
    ['carts', 'userId'],
    ['orders', 'userId'],
    ['reviews', 'userId'],
    ['coupon_usages', 'userId'],
    ['idempotency_keys', 'userId'],
  ] as const) {
    const t = Prisma.raw(`"${table}"`);
    const uc = Prisma.raw(`"${userCol}"`);
    const rows = await prisma.$queryRaw<{ pair: string }[]>(
      Prisma.sql`SELECT id || ':' || ${uc} AS pair FROM ${t}`,
    );
    userIdPairHashes[table] = hashOf(rows.map((r) => r.pair));
  }

  return {
    capturedAt: new Date().toISOString(),
    rowCounts,
    orderTotalSum: orderTotalSum ?? '0',
    paymentCapturedSum: paymentCapturedSum ?? '0',
    refundSum: refundSum ?? '0',
    orderNumberSetHash: hashOf(orderNumbers.map((r) => r.orderNumber)),
    invoiceNumberSetHash: hashOf(invoiceNumbers.map((r) => r.invoiceNumber)),
    userIdPairHashes,
  };
}

interface CheckResult {
  check: string;
  pass: boolean;
  detail?: string;
}

/**
 * tenant_counters is the ONE table this backfill is expected to INSERT into
 * (the two seeded counters, D10) — every other affected table is UPDATE-only
 * and must show byte-for-byte unchanged row counts (spec §10: "no
 * INSERT/DELETE of business rows"). Growth is bounded to [0,2]: the two
 * known keys (order_number_counter, invoice_number_counter), never more.
 */
const EXPECTED_TO_GROW: Record<string, number> = { tenant_counters: 2 };

function compareSnapshots(before: Snapshot, after: Snapshot): CheckResult[] {
  const checks: CheckResult[] = [];
  for (const t of Object.keys(before.rowCounts)) {
    const b = before.rowCounts[t];
    const a = after.rowCounts[t] ?? -1;
    const maxGrowth = EXPECTED_TO_GROW[t];
    if (maxGrowth !== undefined) {
      checks.push({
        check: `row count grew by an expected, bounded amount: ${t}`,
        pass: a >= b && a <= b + maxGrowth,
        detail: `before=${b} after=${a} (expected growth 0-${maxGrowth})`,
      });
      continue;
    }
    checks.push({
      check: `row count unchanged: ${t}`,
      pass: b === a,
      detail: `before=${b} after=${a}`,
    });
  }
  checks.push({
    check: 'order total sum unchanged',
    pass: before.orderTotalSum === after.orderTotalSum,
    detail: `before=${before.orderTotalSum} after=${after.orderTotalSum}`,
  });
  checks.push({
    check: 'payment CAPTURED sum unchanged',
    pass: before.paymentCapturedSum === after.paymentCapturedSum,
    detail: `before=${before.paymentCapturedSum} after=${after.paymentCapturedSum}`,
  });
  checks.push({
    check: 'refund sum unchanged',
    pass: before.refundSum === after.refundSum,
    detail: `before=${before.refundSum} after=${after.refundSum}`,
  });
  checks.push({
    check: 'order number set unchanged (no rewrites)',
    pass: before.orderNumberSetHash === after.orderNumberSetHash,
  });
  checks.push({
    check: 'invoice number set unchanged (no rewrites)',
    pass: before.invoiceNumberSetHash === after.invoiceNumberSetHash,
  });
  for (const t of Object.keys(before.userIdPairHashes)) {
    checks.push({
      check: `userId relationships unchanged: ${t}`,
      pass: before.userIdPairHashes[t] === after.userIdPairHashes[t],
    });
  }
  return checks;
}

async function postOnlyChecks(tenantId?: string, storeId?: string): Promise<CheckResult[]> {
  const checks: CheckResult[] = [];

  if (tenantId) {
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    checks.push({ check: 'Tenant #1 resolves', pass: !!tenant, detail: tenant?.slug });
  }
  if (storeId) {
    const store = await prisma.store.findUnique({ where: { id: storeId } });
    checks.push({
      check: 'Store #1 resolves and is primary',
      pass: !!store && store.isPrimary && store.tenantId === tenantId,
      detail: store ? `slug=${store.slug} isPrimary=${store.isPrimary}` : 'not found',
    });
  }

  for (const table of TENANT_ID_MUST_BE_COMPLETE) {
    const t = Prisma.raw(`"${table}"`);
    const [{ count }] = await prisma.$queryRaw<{ count: bigint }[]>(
      Prisma.sql`SELECT COUNT(*)::bigint AS count FROM ${t} WHERE "tenantId" IS NULL`,
    );
    checks.push({
      check: `ownership completeness (tenantId IS NULL == 0): ${table}`,
      pass: Number(count) === 0,
      detail: `${count} rows still NULL`,
    });
  }

  // customerId mapping cross-check (P4-D1's exact criterion).
  for (const [table, { userCol, custCol }] of Object.entries(CUSTOMER_ID_TABLES)) {
    const t = Prisma.raw(`"${table}"`);
    const uc = Prisma.raw(`"${userCol}"`);
    const cc = Prisma.raw(`"${custCol}"`);
    const [{ count: setCount }] = await prisma.$queryRaw<{ count: bigint }[]>(
      Prisma.sql`SELECT COUNT(*)::bigint AS count FROM ${t} WHERE ${cc} IS NOT NULL`,
    );
    const [{ count: expectedCount }] = await prisma.$queryRaw<
      { count: bigint }[]
    >(
      Prisma.sql`
        SELECT COUNT(*)::bigint AS count FROM ${t} x
        JOIN users u ON u.id = x.${uc}
        WHERE u.role = 'CUSTOMER' AND x.${uc} IS NOT NULL
      `,
    );
    checks.push({
      check: `customerId mapping count matches role=CUSTOMER count: ${table}.${custCol}`,
      pass: Number(setCount) === Number(expectedCount),
      detail: `set=${setCount} expected(role=CUSTOMER)=${expectedCount}`,
    });
  }

  // No orphaned ownership: every child's tenantId equals its direct parent's.
  const parentPairs: [string, string, string][] = [
    ['product_images', 'productId', 'products'],
    ['product_variants', 'productId', 'products'],
    ['customization_fields', 'productId', 'products'],
    ['cart_items', 'cartId', 'carts'],
    ['order_items', 'orderId', 'orders'],
    ['invoices', 'orderId', 'orders'],
    ['payment_attempts', 'orderId', 'orders'],
    ['order_status_history', 'orderId', 'orders'],
    ['coupon_usages', 'orderId', 'orders'],
  ];
  for (const [child, fk, parent] of parentPairs) {
    const c = Prisma.raw(`"${child}"`);
    const fkc = Prisma.raw(`"${fk}"`);
    const p = Prisma.raw(`"${parent}"`);
    const [{ count }] = await prisma.$queryRaw<{ count: bigint }[]>(
      Prisma.sql`
        SELECT COUNT(*)::bigint AS count
        FROM ${c} x JOIN ${p} par ON x.${fkc} = par.id
        WHERE x."tenantId" IS DISTINCT FROM par."tenantId"
      `,
    );
    checks.push({
      check: `no orphaned ownership (tenantId matches parent): ${child} -> ${parent}`,
      pass: Number(count) === 0,
      detail: `${count} mismatched rows`,
    });
  }

  // TenantCounter drift (P2 fix, W4 independent audit): for every seeded
  // counter, its stored value must exactly equal the real MAX(<numberColumn>)
  // in its business table — never below (a collision risk) and never above
  // (a silently-skipped number). This is an independent, post-hoc check of
  // whatever is ALREADY in tenant_counters — a defense-in-depth companion
  // to the seeding-time gate in w4-backfill.ts's seedTenantCounters, not a
  // replacement for it (that gate is what actually prevents an unsafe row
  // from being created in the first place).
  if (tenantId) {
    for (const { key, table, column } of COUNTER_SPECS) {
      const counterRows = await prisma.$queryRaw<{ value: number }[]>(
        Prisma.sql`SELECT value FROM tenant_counters WHERE "tenantId" = ${tenantId} AND key = ${key}`,
      );
      if (counterRows.length === 0) {
        // Not seeded (yet, or deliberately refused by the safety gate) —
        // nothing to check here; seedTenantCounters' own step result is
        // where a refusal is reported.
        continue;
      }
      const counterValue = counterRows[0].value;

      const col = Prisma.raw(`"${column}"`);
      const t = Prisma.raw(`"${table}"`);
      const numberRows = await prisma.$queryRaw<{ v: string }[]>(
        Prisma.sql`SELECT ${col} AS v FROM ${t}`,
      );
      let actualMax = 0;
      let malformedCount = 0;
      for (const r of numberRows) {
        const n = parseTrailingNumber(r.v);
        if (n === null) {
          malformedCount++;
          continue;
        }
        if (n > actualMax) actualMax = n;
      }

      checks.push({
        check: `TenantCounter matches actual MAX (no drift): ${key}`,
        pass: malformedCount === 0 && counterValue === actualMax,
        detail:
          malformedCount > 0
            ? `${malformedCount} unparseable "${column}" value(s) in "${table}"`
            : `tenant_counters.value=${counterValue} actual MAX("${column}")=${actualMax}`,
      });
    }
  }

  return checks;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const get = (name: string): string | undefined => {
    const a = argv.find((x) => x.startsWith(`--${name}=`));
    return a ? a.slice(`--${name}=`.length) : undefined;
  };
  const snapshotOut = get('snapshot-out');
  const compareFile = get('compare');
  const tenantId = get('tenant-id');
  const storeId = get('store-id');

  const snapshot = await captureSnapshot();
  let allComparePass = true;

  if (snapshotOut) {
    writeFileSync(snapshotOut, JSON.stringify(snapshot, null, 2));
    console.log(`Snapshot written to ${snapshotOut}`);
  }

  if (compareFile) {
    const before: Snapshot = JSON.parse(readFileSync(compareFile, 'utf8'));
    const checks = compareSnapshots(before, snapshot);
    console.log('\n--- Baseline comparison ---');
    for (const c of checks) {
      if (!c.pass) allComparePass = false;
      console.log(`[${c.pass ? 'PASS' : 'FAIL'}] ${c.check}${c.detail ? ` (${c.detail})` : ''}`);
    }
    console.log(`\nBaseline comparison: ${allComparePass ? 'PASS' : 'FAIL'}`);
  }

  const postChecks = await postOnlyChecks(tenantId, storeId);
  console.log('\n--- Post-state checks ---');
  let allPostPass = true;
  for (const c of postChecks) {
    if (!c.pass) allPostPass = false;
    console.log(`[${c.pass ? 'PASS' : 'FAIL'}] ${c.check}${c.detail ? ` (${c.detail})` : ''}`);
  }
  console.log(`\nPost-state checks: ${allPostPass ? 'PASS' : 'FAIL'}`);

  if (!snapshotOut && !compareFile) {
    console.log('\n--- Snapshot (no --snapshot-out given, printing to stdout) ---');
    console.log(JSON.stringify(snapshot, null, 2));
  }

  if (!allComparePass || !allPostPass) {
    process.exitCode = 1;
  }
}

// Only run when executed directly — NOT when imported by
// test/e2e/phase4-w4-backfill.e2e-spec.ts (same guard as w4-backfill.ts).
if (require.main === module) {
  main()
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}

export { prisma, captureSnapshot, compareSnapshots, postOnlyChecks };
export type { Snapshot, CheckResult };
