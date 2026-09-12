import { PrismaClient } from '@prisma/client';

/**
 * Phase 6 (W1) — backfills the three new nullable `Plan` columns
 * (`isActive`, `sortOrder`, `isEnterpriseCustom`) on every EXISTING row to
 * their documented application-level defaults (`true`, `0`, `false`) —
 * the same "nullable column + separate backfill script, never INSERT/
 * UPDATE inside a tracked migration.sql" convention every prior backfill
 * in this repo already establishes (migration-safety.spec.ts forbids
 * UPDATE of existing rows in a migration file outright, no exemption).
 *
 * Idempotent by construction: only ever touches a row where the target
 * column is currently NULL — a row already backfilled (or created fresh
 * by the W1 platform service, which never leaves these columns blank) is
 * never re-written. Safe to re-run any number of times.
 *
 * Usage:
 *   npx ts-node prisma/backfill/phase6-w1-plan-backfill.ts
 *
 * No CLI arguments — unlike w4/w6/w9's tenant/store-targeted backfills,
 * this one is genuinely global-by-design: `Plan` is platform-owned
 * catalogue data, not tenant-owned, so there is no tenant/store ambiguity
 * to resolve or guess.
 */

export interface PlanBackfillResult {
  totalPlans: number;
  backfilled: number;
  alreadyComplete: number;
}

export async function backfillPlanDefaults(
  prisma: PrismaClient,
  log: (line: string) => void = () => {},
): Promise<PlanBackfillResult> {
  const plans = await prisma.plan.findMany();
  log(`Found ${plans.length} plan row(s).`);

  let backfilled = 0;
  let alreadyComplete = 0;

  for (const plan of plans) {
    const needsBackfill =
      plan.isActive === null ||
      plan.sortOrder === null ||
      plan.isEnterpriseCustom === null;

    if (!needsBackfill) {
      alreadyComplete++;
      log(`  SKIP  "${plan.key}" — already fully backfilled`);
      continue;
    }

    await prisma.plan.update({
      where: { id: plan.id },
      data: {
        isActive: plan.isActive ?? true,
        sortOrder: plan.sortOrder ?? 0,
        isEnterpriseCustom: plan.isEnterpriseCustom ?? false,
      },
    });
    backfilled++;
    log(`  BACKFILLED "${plan.key}" -> isActive=true, sortOrder=0, isEnterpriseCustom=false (only the NULL fields were set — an already-non-null field on this row, if any, is preserved as-is)`);
  }

  return { totalPlans: plans.length, backfilled, alreadyComplete };
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const result = await backfillPlanDefaults(prisma, (line) =>
      console.log(line),
    );
    console.log('');
    console.log('Phase 6 W1 plan backfill complete:');
    console.log(`  total plans:      ${result.totalPlans}`);
    console.log(`  backfilled:       ${result.backfilled}`);
    console.log(`  already complete: ${result.alreadyComplete}`);
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
