import { Prisma, PrismaClient } from '@prisma/client';

/**
 * Phase 4, wave W6-C — `storeId` backfill for the 6 tables that gained a
 * nullable `storeId` column in the W6-B migration
 * (`20260909024023_w6_add_storeid_columns`): ProductImage, ProductVariant,
 * CustomizationField, CartItem, CartItemCustomization, OrderItem. Decision
 * P4-D4 (docs/saas/DECISIONS.md), Option A — these 6 derived tables get a
 * REAL `storeId` copied from their existing parent, never a tenantId
 * stand-in.
 *
 * NOT a Prisma migration, NOT `prisma db seed` — DML against existing rows,
 * same category as `w4-backfill.ts` (docs/saas/PHASE-4-START-GATE-AND-
 * IMPLEMENTATION-SPEC.md §8).
 *
 * Parent chosen for each table is the EXACT SAME parent `w4-backfill.ts`
 * already uses to copy `tenantId` for that table (see its `runAllSteps`) —
 * this is an established, already-audited ownership relationship, not a
 * new one invented for storeId:
 *
 *   product_images            <- products            (via productId)
 *   product_variants          <- products            (via productId)
 *   customization_fields      <- products            (via productId)
 *   cart_items                <- carts               (via cartId)
 *   cart_item_customizations  <- cart_items           (via cartItemId)
 *   order_items               <- orders               (via orderId)
 *
 * All six FK columns (productId, cartId, cartItemId, orderId) are NON-
 * NULLABLE on their respective tables, so every row has exactly one parent
 * to copy from — no "no parent" completeness gap is possible by
 * construction (verified against schema.prisma).
 *
 * Idempotent by construction (same invariant as w4-backfill.ts): every
 * UPDATE's WHERE clause requires "storeId IS NULL", so an already-
 * backfilled row is never touched again — a rerun is a guaranteed no-op.
 * Nothing is ever overwritten (NULL -> value only), never NULL -> NULL ->
 * different value.
 *
 * Usage:
 *   npx ts-node prisma/backfill/w6-storeid-backfill.ts --dry-run
 *   npx ts-node prisma/backfill/w6-storeid-backfill.ts
 */

const prisma = new PrismaClient();

interface StepResult {
  step: string;
  table: string;
  column: string;
  affected: number;
  anomalies?: Record<string, number>;
  detail?: string;
}

type Client = PrismaClient | Prisma.TransactionClient;

interface CopyStoreSpec {
  table: string;
  fkColumn: string;
  parentTable: string;
}

const COPY_STORE_SPECS: CopyStoreSpec[] = [
  { table: 'product_images', fkColumn: 'productId', parentTable: 'products' },
  { table: 'product_variants', fkColumn: 'productId', parentTable: 'products' },
  { table: 'customization_fields', fkColumn: 'productId', parentTable: 'products' },
  { table: 'cart_items', fkColumn: 'cartId', parentTable: 'carts' },
  { table: 'cart_item_customizations', fkColumn: 'cartItemId', parentTable: 'cart_items' },
  { table: 'order_items', fkColumn: 'orderId', parentTable: 'orders' },
];

/**
 * Copies `storeId` from `parentTable` into `table` via `fkColumn = parent.id`.
 * Also reports (never auto-repairs) two anomaly classes:
 *   - orphan_fk: child row's FK doesn't match any parent row at all (should
 *     be 0 — every FK here is a real, enforced foreign key already).
 *   - parent_storeId_null: parent row exists but its OWN storeId is still
 *     NULL (should be 0 post-W4/W5 — surfaced, not guessed at).
 */
async function copyStoreFromParent(
  client: Client,
  { table, fkColumn, parentTable }: CopyStoreSpec,
): Promise<StepResult> {
  const t = Prisma.raw(`"${table}"`);
  const fk = Prisma.raw(`"${fkColumn}"`);
  const p = Prisma.raw(`"${parentTable}"`);

  const [{ count: orphanCount }] = await client.$queryRaw<{ count: bigint }[]>(
    Prisma.sql`
      SELECT COUNT(*)::bigint AS count
      FROM ${t} c
      WHERE c."storeId" IS NULL
        AND NOT EXISTS (SELECT 1 FROM ${p} par WHERE par.id = c.${fk})
    `,
  );
  const [{ count: parentNullCount }] = await client.$queryRaw<
    { count: bigint }[]
  >(
    Prisma.sql`
      SELECT COUNT(*)::bigint AS count
      FROM ${t} c
      JOIN ${p} par ON par.id = c.${fk}
      WHERE c."storeId" IS NULL AND par."storeId" IS NULL
    `,
  );

  const affected = await client.$executeRaw(
    Prisma.sql`
      UPDATE ${t} c SET "storeId" = par."storeId"
      FROM ${p} par
      WHERE c.${fk} = par.id AND c."storeId" IS NULL AND par."storeId" IS NOT NULL
    `,
  );

  const anomalies: Record<string, number> = {};
  if (orphanCount > 0n) anomalies.orphan_fk = Number(orphanCount);
  if (parentNullCount > 0n) anomalies.parent_storeId_null = Number(parentNullCount);

  return {
    step: `${table}.storeId (<- ${parentTable}.${fkColumn})`,
    table,
    column: 'storeId',
    affected,
    anomalies: Object.keys(anomalies).length > 0 ? anomalies : undefined,
  };
}

async function runAllSteps(client: Client): Promise<StepResult[]> {
  const results: StepResult[] = [];
  // Dependency order matters for cart_item_customizations, which copies
  // from cart_items (itself backfilled from carts in the prior step within
  // the same transaction/run) — mirrors w4-backfill.ts's ordering
  // discipline for the identical chain.
  for (const spec of COPY_STORE_SPECS) {
    results.push(await copyStoreFromParent(client, spec));
  }
  return results;
}

/** Post-run completeness check: any row in the 6 tables still NULL. */
async function verifyCompleteness(
  client: Client,
): Promise<{ table: string; remainingNull: number }[]> {
  const out: { table: string; remainingNull: number }[] = [];
  for (const { table } of COPY_STORE_SPECS) {
    const t = Prisma.raw(`"${table}"`);
    const [{ count }] = await client.$queryRaw<{ count: bigint }[]>(
      Prisma.sql`SELECT COUNT(*)::bigint AS count FROM ${t} WHERE "storeId" IS NULL`,
    );
    out.push({ table, remainingNull: Number(count) });
  }
  return out;
}

const DRY_RUN_ROLLBACK_SENTINEL = 'W6_STOREID_BACKFILL_DRY_RUN_ROLLBACK_DO_NOT_LEAK';

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  console.log(
    `Phase 4 W6-C storeId backfill — mode=${dryRun ? 'DRY-RUN (transaction always rolled back, nothing persists)' : 'REAL RUN (per-step committed transactions)'}`,
  );

  let results: StepResult[] = [];
  let completeness: { table: string; remainingNull: number }[] = [];

  if (dryRun) {
    try {
      await prisma.$transaction(
        async (tx) => {
          results = await runAllSteps(tx);
          completeness = await verifyCompleteness(tx);
          throw new Error(DRY_RUN_ROLLBACK_SENTINEL);
        },
        { timeout: 120_000 },
      );
    } catch (err) {
      if (!(err instanceof Error && err.message === DRY_RUN_ROLLBACK_SENTINEL)) {
        throw err;
      }
    }
  } else {
    const step = async <T>(fn: (tx: Client) => Promise<T>): Promise<T> =>
      prisma.$transaction((tx) => fn(tx), { timeout: 60_000 });
    for (const spec of COPY_STORE_SPECS) {
      results.push(await step((c) => copyStoreFromParent(c, spec)));
    }
    completeness = await verifyCompleteness(prisma);
  }

  console.log('\n--- W6-C storeId backfill step results ---');
  let totalAffected = 0;
  const allAnomalies: Record<string, number> = {};
  for (const r of results) {
    totalAffected += r.affected;
    console.log(
      `${r.step.padEnd(56)} affected=${r.affected}` +
        (r.anomalies ? `  ANOMALIES=${JSON.stringify(r.anomalies)}` : ''),
    );
    if (r.anomalies) {
      for (const [k, v] of Object.entries(r.anomalies)) {
        allAnomalies[k] = (allAnomalies[k] ?? 0) + v;
      }
    }
  }
  console.log('\n--- Completeness (rows still NULL after this run) ---');
  for (const c of completeness) {
    console.log(`${c.table.padEnd(28)} remainingNull=${c.remainingNull}`);
  }
  console.log('\n--- Totals ---');
  console.log(`totalAffected=${totalAffected} (persisted=${!dryRun})`);
  console.log(`anomalies=${JSON.stringify(allAnomalies)}`);
  console.log(
    JSON.stringify(
      {
        mode: dryRun ? 'dry-run (rolled back)' : 'real-run (committed)',
        results,
        completeness,
        totalAffected,
        anomalies: allAnomalies,
      },
      null,
      2,
    ),
  );
}

if (require.main === module) {
  main()
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}

export {
  prisma,
  copyStoreFromParent,
  runAllSteps,
  verifyCompleteness,
  COPY_STORE_SPECS,
};
export type { StepResult, Client, CopyStoreSpec };
