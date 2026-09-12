import { PrismaClient } from '@prisma/client';
import { PERSISTENT_PERIOD } from '../../src/usage/usage-period';

/**
 * Phase 6 W8 — persistent `Usage` reconciliation for `products`,
 * `team_members`, and `storage_mb` (the three PERSISTENT-classified limit
 * keys with a real, existing resource model to count against today).
 *
 * Why this is needed: `Usage` rows are only ever written going forward, at
 * the moment `LimitEnforcementService.assertLimit`/`releaseLimit` run
 * (Phase 6 W5, wired into `ProductsService.createProduct`,
 * `TeamService.inviteMember`/`suspendMember`, `UploadsService.create`).
 * Any `Product`/`TenantMembership`/`UploadedFile` row created BEFORE that
 * wiring existed (or by any path that bypasses it, e.g. a direct-Prisma
 * fixture/seed) has no corresponding `Usage` increment — this script
 * reconciles `Usage.count` to the real, current row counts so it reflects
 * ground truth rather than "only what happened after Phase 6 W5 went
 * live."
 *
 * NOT covered here, deliberately:
 *   - `orders_per_month` — BILLING_PERIOD; there is no resolvable period
 *     identifier to reconcile against (P6-D3 Part B, an explicit,
 *     unresolved Phase 7 dependency). Inventing one here would be exactly
 *     the "derive a billing period locally" the W8 authorization forbids.
 *   - `custom_domains` — no real domain-creation workflow exists anywhere
 *     in this codebase (`StoreDomain` rows are only ever READ for tenant
 *     resolution, never created by any application code — confirmed by a
 *     full-repository grep). Reconciling a resource that is never created
 *     would be inventing fake usage.
 *
 * Idempotent by construction: every write is an `upsert` on `Usage`'s own
 * `(tenantId, limitKey, period)` unique constraint, and it always SETS
 * `count` to the freshly counted real value — running it any number of
 * times converges to the same correct state, never drifts, never
 * double-counts. Tenant-scoped throughout (every count is a `WHERE
 * tenantId = ...` query, never a global aggregate). This is a one-time
 * (or as-needed) reconciliation tool, not the recurring Phase 11
 * reconciliation job — no scheduling, no locking, no queue is introduced
 * here.
 *
 * Read-only against every table except `Usage` itself — never creates,
 * updates, or deletes a `Product`/`TenantMembership`/`UploadedFile` row.
 *
 * Per the W8 authorization's own production-safety rule: this script is
 * NOT run against production during this wave. It carries no hardcoded
 * environment lock (matching this repository's own established backfill
 * convention — `phase6-w1-plan-backfill.ts`/`w4-backfill.ts` are real,
 * reusable tools eventually run against production under separate,
 * explicit authorization, not permanently local-only scripts) — running
 * it anywhere beyond the local dev/test database is a separate decision
 * for a separate, explicitly-authorized turn.
 *
 * Usage:
 *   npx ts-node prisma/backfill/phase6-w8-usage-backfill.ts
 */

export interface UsageBackfillResult {
  tenantsProcessed: number;
  products: { tenantId: string; count: number }[];
  teamMembers: { tenantId: string; count: number }[];
  storageMb: { tenantId: string; count: number }[];
}

const BYTES_PER_MIB = 1_048_576;

async function upsertUsage(
  prisma: PrismaClient,
  tenantId: string,
  limitKey: string,
  count: number,
): Promise<void> {
  await prisma.usage.upsert({
    where: {
      tenantId_limitKey_period: {
        tenantId,
        limitKey,
        period: PERSISTENT_PERIOD,
      },
    },
    update: { count },
    create: { tenantId, limitKey, period: PERSISTENT_PERIOD, count },
  });
}

export async function backfillUsageCounts(
  prisma: PrismaClient,
  log: (line: string) => void = () => {},
): Promise<UsageBackfillResult> {
  const tenants = await prisma.tenant.findMany({ select: { id: true } });
  const result: UsageBackfillResult = {
    tenantsProcessed: tenants.length,
    products: [],
    teamMembers: [],
    storageMb: [],
  };

  for (const { id: tenantId } of tenants) {
    const productCount = await prisma.product.count({ where: { tenantId } });
    await upsertUsage(prisma, tenantId, 'products', productCount);
    result.products.push({ tenantId, count: productCount });

    // Ratified semantics (Phase 6 W5/W8): ACTIVE + INVITED count,
    // SUSPENDED excluded — exactly TeamService's own increment/decrement
    // rule, just computed from current row state instead of incrementally.
    const teamMemberCount = await prisma.tenantMembership.count({
      where: { tenantId, status: { in: ['ACTIVE', 'INVITED'] } },
    });
    await upsertUsage(prisma, tenantId, 'team_members', teamMemberCount);
    result.teamMembers.push({ tenantId, count: teamMemberCount });

    // Ratified storage semantics (P6-D4): 1 MiB = 1,048,576 bytes,
    // ceil(bytes / 1,048,576) per file, summed — the exact same
    // calculation UploadsService.create performs per upload, applied here
    // to every existing UploadedFile row for the tenant.
    const files = await prisma.uploadedFile.findMany({
      where: { tenantId },
      select: { bytes: true },
    });
    const storageMiB = files.reduce(
      (sum, f) => sum + Math.ceil(f.bytes / BYTES_PER_MIB),
      0,
    );
    await upsertUsage(prisma, tenantId, 'storage_mb', storageMiB);
    result.storageMb.push({ tenantId, count: storageMiB });

    log(
      `tenant ${tenantId}: products=${productCount} team_members=${teamMemberCount} storage_mb=${storageMiB}`,
    );
  }

  return result;
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const result = await backfillUsageCounts(prisma, (line) =>
      console.log(line),
    );
    console.log('');
    console.log('Phase 6 W8 usage backfill complete:');
    console.log(`  tenants processed: ${result.tenantsProcessed}`);
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
