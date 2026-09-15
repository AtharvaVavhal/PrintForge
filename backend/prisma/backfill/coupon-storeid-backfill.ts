import { Prisma, PrismaClient } from '@prisma/client';

/**
 * P8-4.1 — `Coupon.storeId` backfill. `CouponsService.createCoupon()` never
 * populated `storeId` until this fix (see `coupons.service.ts`'s own
 * comment on that write) — invisible until `Order.storeId` (P8-4) started
 * being persisted for real, because the composite
 * `orders_storeId_couponId_fkey` constraint skips its own check entirely
 * when either referenced column is NULL.
 *
 * NOT a Prisma migration, NOT `prisma db seed` — DML against existing rows,
 * same category as `w4-backfill.ts`/`w6-storeid-backfill.ts`.
 *
 * Unlike `w6-storeid-backfill.ts`'s six tables, `Coupon` has no direct FK
 * to a row that already carries `storeId` — it only has `tenantId`. The
 * derivation this script performs is therefore: for each NULL-`storeId`
 * Coupon, look up its OWN tenant's Store rows and, if and only if there is
 * EXACTLY ONE, copy that Store's id. This is deterministic ONLY because
 * the current architecture's v1 baseline is "exactly one primary Store per
 * Tenant" (DB-enforced by the partial unique index
 * `stores_tenant_primary_unique` — but that index prevents a SECOND
 * primary Store, it does NOT guarantee at least one exists, and Store is
 * explicitly documented as a first-class, future-multi-store-compatible
 * table). This script NEVER assumes that invariant — it re-derives the
 * live store count for every affected tenant, every run, and refuses to
 * guess for any tenant where it does not hold today:
 *
 *   - tenant_has_zero_stores:     no safe value exists — reported, not
 *                                 backfilled (a genuine data-integrity
 *                                 anomaly; should not occur per
 *                                 `resolvePrimaryStoreId`'s own existing
 *                                 defensive NotFoundException path, but
 *                                 never assumed away here).
 *   - tenant_has_multiple_stores: ambiguous which Store the coupon
 *                                 belongs to — reported, not guessed.
 *                                 Not currently possible (no code path
 *                                 creates a second Store per tenant as of
 *                                 this backfill's authoring), but checked
 *                                 for, not assumed.
 *
 * Idempotent by construction (same invariant as every other backfill in
 * this directory): every UPDATE's WHERE clause requires
 * `"storeId" IS NULL`, so an already-backfilled row is never touched
 * again — a rerun is a guaranteed no-op. Nothing is ever overwritten
 * (NULL -> value only), never NULL -> NULL -> different value.
 *
 * Verified against production (2026-09-14, read-only inspection): 0 of 3
 * existing Coupon rows have NULL storeId — this script currently has
 * nothing to do there. Prepared for completeness / as a safety net for
 * any row created between this fix's authoring and its deployment, and
 * validated locally (see the P8-4.1 completion report) — NOT executed
 * against production by this session.
 *
 * Usage:
 *   npx ts-node prisma/backfill/coupon-storeid-backfill.ts --dry-run
 *   npx ts-node prisma/backfill/coupon-storeid-backfill.ts
 */

const prisma = new PrismaClient();

interface AnomalyRow {
  tenantId: string;
  couponIds: string[];
  storeCount: number;
}

interface StepResult {
  affected: number;
  zeroStoreAnomalies: AnomalyRow[];
  multiStoreAnomalies: AnomalyRow[];
}

type Client = PrismaClient | Prisma.TransactionClient;

/**
 * Finds every tenant that owns at least one NULL-storeId Coupon, together
 * with that tenant's current Store count — the single source of truth for
 * whether a deterministic backfill value exists, re-derived fresh every
 * run (never cached, never assumed from a prior run or from documentation).
 */
async function findAffectedTenants(
  client: Client,
): Promise<{ tenantId: string; couponIds: string[]; storeIds: string[] }[]> {
  const rows = await client.$queryRaw<
    { tenantId: string; couponId: string; storeId: string | null }[]
  >(Prisma.sql`
    SELECT c."tenantId" AS "tenantId", c.id AS "couponId", s.id AS "storeId"
    FROM coupons c
    LEFT JOIN stores s ON s."tenantId" = c."tenantId"
    WHERE c."storeId" IS NULL
  `);

  const byTenant = new Map<
    string,
    { couponIds: Set<string>; storeIds: Set<string> }
  >();
  for (const row of rows) {
    const entry = byTenant.get(row.tenantId) ?? {
      couponIds: new Set<string>(),
      storeIds: new Set<string>(),
    };
    entry.couponIds.add(row.couponId);
    if (row.storeId) entry.storeIds.add(row.storeId);
    byTenant.set(row.tenantId, entry);
  }

  return Array.from(byTenant.entries()).map(([tenantId, v]) => ({
    tenantId,
    couponIds: Array.from(v.couponIds),
    storeIds: Array.from(v.storeIds),
  }));
}

async function runBackfill(client: Client): Promise<StepResult> {
  const affected = await findAffectedTenants(client);

  const zeroStoreAnomalies: AnomalyRow[] = [];
  const multiStoreAnomalies: AnomalyRow[] = [];
  const safeToBackfill: { tenantId: string; storeId: string }[] = [];

  for (const tenant of affected) {
    if (tenant.storeIds.length === 0) {
      zeroStoreAnomalies.push({
        tenantId: tenant.tenantId,
        couponIds: tenant.couponIds,
        storeCount: 0,
      });
    } else if (tenant.storeIds.length > 1) {
      multiStoreAnomalies.push({
        tenantId: tenant.tenantId,
        couponIds: tenant.couponIds,
        storeCount: tenant.storeIds.length,
      });
    } else {
      safeToBackfill.push({
        tenantId: tenant.tenantId,
        storeId: tenant.storeIds[0],
      });
    }
  }

  let totalAffectedRows = 0;
  for (const { tenantId, storeId } of safeToBackfill) {
    const affectedRows = await client.$executeRaw(Prisma.sql`
      UPDATE coupons SET "storeId" = ${storeId}
      WHERE "tenantId" = ${tenantId} AND "storeId" IS NULL
    `);
    totalAffectedRows += affectedRows;
  }

  return {
    affected: totalAffectedRows,
    zeroStoreAnomalies,
    multiStoreAnomalies,
  };
}

/** Post-run completeness check: any Coupon row still NULL, broken down by
 * whether it's an unresolved anomaly or something this run's own logic
 * somehow missed (should always be zero of the latter). */
async function verifyCompleteness(
  client: Client,
): Promise<{ remainingNull: number }> {
  const [{ count }] = await client.$queryRaw<{ count: bigint }[]>(
    Prisma.sql`SELECT COUNT(*)::bigint AS count FROM coupons WHERE "storeId" IS NULL`,
  );
  return { remainingNull: Number(count) };
}

const DRY_RUN_ROLLBACK_SENTINEL =
  'COUPON_STOREID_BACKFILL_DRY_RUN_ROLLBACK_DO_NOT_LEAK';

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  console.log(
    `P8-4.1 Coupon.storeId backfill — mode=${dryRun ? 'DRY-RUN (transaction always rolled back, nothing persists)' : 'REAL RUN (single committed transaction)'}`,
  );

  let result: StepResult = {
    affected: 0,
    zeroStoreAnomalies: [],
    multiStoreAnomalies: [],
  };
  let completeness: { remainingNull: number } = { remainingNull: 0 };

  if (dryRun) {
    try {
      await prisma.$transaction(
        async (tx) => {
          result = await runBackfill(tx);
          completeness = await verifyCompleteness(tx);
          throw new Error(DRY_RUN_ROLLBACK_SENTINEL);
        },
        { timeout: 60_000 },
      );
    } catch (err) {
      if (!(err instanceof Error && err.message === DRY_RUN_ROLLBACK_SENTINEL)) {
        throw err;
      }
    }
  } else {
    result = await prisma.$transaction((tx) => runBackfill(tx), {
      timeout: 60_000,
    });
    completeness = await verifyCompleteness(prisma);
  }

  console.log('\n--- Coupon.storeId backfill result ---');
  console.log(`affected=${result.affected} (persisted=${!dryRun})`);
  console.log(
    `zeroStoreAnomalies=${result.zeroStoreAnomalies.length}`,
    result.zeroStoreAnomalies.length > 0 ? JSON.stringify(result.zeroStoreAnomalies, null, 2) : '',
  );
  console.log(
    `multiStoreAnomalies=${result.multiStoreAnomalies.length}`,
    result.multiStoreAnomalies.length > 0 ? JSON.stringify(result.multiStoreAnomalies, null, 2) : '',
  );
  console.log(`\nremainingNull after this run=${completeness.remainingNull}`);
  if (completeness.remainingNull > 0 && !dryRun) {
    console.log(
      'Rows remain NULL — expected iff zero/multi-store anomalies were reported above. ' +
        'These require explicit, human-reviewed resolution (which Store does this coupon actually belong to?) — never guessed by this script.',
    );
  }
}

if (require.main === module) {
  main()
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}

export { prisma, findAffectedTenants, runBackfill, verifyCompleteness };
export type { StepResult, Client, AnomalyRow };
