import { PrismaClient } from '@prisma/client';
import { getSettingOwnership } from '../../src/app-setting/app-setting.constants';

/**
 * Phase 5 (W9) — AppSetting tenant/store ownership backfill (decision D11).
 * NOT a Prisma migration, NOT `prisma db seed` (same reasoning
 * `prisma/backfill/w4-backfill.ts`'s own header documents: this is DML
 * against existing rows — `migration-safety.spec.ts`'s additive-only guard
 * has no exemption for INSERT/UPDATE in a tracked migration file at all).
 *
 * Copies the pre-existing GLOBAL `app_settings` rows for the frozen D11
 * key set onto exactly ONE explicitly-named Tenant and Store — same
 * "never guesses or auto-discovers a target" discipline `w4-backfill.ts`
 * already established for `--tenant-id`/`--store-id`. This script does
 * NOT scan the database to decide who owns the legacy values; the
 * operator states it explicitly, and this script only VALIDATES that
 * choice against the real schema (tenant exists, store exists, store
 * belongs to that tenant) before writing anything.
 *
 * Idempotent by construction: every write is an `upsert` with an EMPTY
 * `update` clause — a `TenantSetting`/`StoreSetting` row that already
 * exists for a given (scope, key) is never touched again, so a rerun is a
 * guaranteed no-op for every key it already migrated (mirrors
 * `w4-backfill.ts`'s own "never overwrite an existing value" safety
 * property).
 *
 * Explicitly OUT OF SCOPE (see the W9 implementation report):
 *   - `order_number_counter` — a deliberately platform-scoped counter by
 *     original design, not part of the D11 classification at all.
 *   - `invoice_number_counter` — retired in favor of the already-existing
 *     `TenantCounter` row Phase 4 W4's own backfill seeded (decision D10);
 *     this script does not touch it — see `InvoiceNumberService`.
 * Neither key is copied into `TenantSetting`/`StoreSetting` by this
 * script; both are left exactly where they are in `app_settings`.
 *
 * Usage:
 *   npx ts-node prisma/backfill/w9-app-setting-backfill.ts --tenant-id=<uuid> --store-id=<uuid>
 */

export interface BackfillResult {
  tenantMigrated: number;
  storeMigrated: number;
  tenantSkippedExisting: number;
  storeSkippedExisting: number;
  unclassified: string[];
}

const OUT_OF_SCOPE_COUNTER_KEYS = new Set([
  'order_number_counter',
  'invoice_number_counter',
]);

/** The exact, testable migration logic — the CLI `main()` below is a thin
 * argument-parsing + connection wrapper around this. */
export async function backfillAppSettings(
  prisma: PrismaClient,
  tenantId: string,
  storeId: string,
  log: (line: string) => void = () => {},
): Promise<BackfillResult> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) {
    throw new Error(`No tenant found with id "${tenantId}"`);
  }
  const store = await prisma.store.findUnique({ where: { id: storeId } });
  if (!store) {
    throw new Error(`No store found with id "${storeId}"`);
  }
  if (store.tenantId !== tenantId) {
    throw new Error(
      `Store "${storeId}" belongs to tenant "${store.tenantId}", not the given "${tenantId}" — refusing to guess.`,
    );
  }

  const rows = await prisma.appSetting.findMany();
  log(`Found ${rows.length} row(s) in the legacy global app_settings table.`);

  const result: BackfillResult = {
    tenantMigrated: 0,
    storeMigrated: 0,
    tenantSkippedExisting: 0,
    storeSkippedExisting: 0,
    unclassified: [],
  };

  for (const row of rows) {
    if (OUT_OF_SCOPE_COUNTER_KEYS.has(row.key)) {
      log(
        `  SKIP  "${row.key}" — deliberately out of scope (see script header)`,
      );
      continue;
    }

    const ownership = getSettingOwnership(row.key);

    if (ownership === 'TENANT') {
      const existing = await prisma.tenantSetting.findUnique({
        where: { tenantId_key: { tenantId, key: row.key } },
      });
      await prisma.tenantSetting.upsert({
        where: { tenantId_key: { tenantId, key: row.key } },
        update: {},
        create: { tenantId, key: row.key, value: row.value },
      });
      log(
        `  ${existing ? 'SKIP (exists)' : 'TENANT       '} "${row.key}" -> tenant ${tenantId}`,
      );
      if (existing) {
        result.tenantSkippedExisting++;
      } else {
        result.tenantMigrated++;
      }
    } else if (ownership === 'STORE') {
      const existing = await prisma.storeSetting.findUnique({
        where: { storeId_key: { storeId, key: row.key } },
      });
      await prisma.storeSetting.upsert({
        where: { storeId_key: { storeId, key: row.key } },
        update: {},
        create: { tenantId, storeId, key: row.key, value: row.value },
      });
      log(
        `  ${existing ? 'SKIP (exists)' : 'STORE        '} "${row.key}" -> store ${storeId}`,
      );
      if (existing) {
        result.storeSkippedExisting++;
      } else {
        result.storeMigrated++;
      }
    } else {
      // Unknown key — not in the frozen D11 classification, and not one
      // of the two explicitly-named counter keys above. Preserve it: do
      // NOT delete, do NOT guess an ownership, just report it.
      result.unclassified.push(row.key);
      log(
        `  UNKNOWN "${row.key}" — preserved in app_settings, not migrated (see report)`,
      );
    }
  }

  return result;
}

function parseArg(name: string): string {
  const prefix = `--${name}=`;
  const arg = process.argv.find((a) => a.startsWith(prefix));
  if (!arg) {
    throw new Error(`Missing required argument: ${prefix}<value>`);
  }
  return arg.slice(prefix.length);
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const tenantId = parseArg('tenant-id');
    const storeId = parseArg('store-id');
    const result = await backfillAppSettings(
      prisma,
      tenantId,
      storeId,
      (line) => console.log(line),
    );
    console.log('');
    console.log('Phase 5 W9 backfill complete:');
    console.log(
      `  tenant-owned settings created: ${result.tenantMigrated} (already existed: ${result.tenantSkippedExisting})`,
    );
    console.log(
      `  store-owned settings created:  ${result.storeMigrated} (already existed: ${result.storeSkippedExisting})`,
    );
    if (result.unclassified.length > 0) {
      console.log(
        `  UNCLASSIFIED keys (preserved, not migrated): ${result.unclassified.join(', ')}`,
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
