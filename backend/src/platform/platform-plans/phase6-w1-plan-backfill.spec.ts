import { backfillPlanDefaults } from '../../../prisma/backfill/phase6-w1-plan-backfill';

/**
 * P6-D1 corrective fix — regression tests for
 * `prisma/backfill/phase6-w1-plan-backfill.ts`. Deliberately colocated
 * under `src/platform/platform-plans/` rather than next to the script
 * itself: `package.json`'s jest config sets `rootDir: "src"`, so nothing
 * under `prisma/` is ever discovered by `npx jest` (consistent with every
 * other backfill script in this repo — none has a colocated `.spec.ts`
 * either). The backfill module is imported here via relative path;
 * `rootDir`/module resolution only gate *test discovery*, not what a
 * discovered test may import.
 *
 * Mocks a minimal `PrismaClient`-shaped object (`plan.findMany`/`.update`)
 * — same convention as every other service spec in this repo.
 */
describe('backfillPlanDefaults (Phase 6 W1 backfill)', () => {
  function makePrisma(rows: unknown[]) {
    return {
      plan: {
        findMany: jest.fn().mockResolvedValue(rows),
        update: jest.fn().mockResolvedValue(undefined),
      },
    };
  }

  it('backfills a fully-NULL row to the documented defaults (true / 0 / false)', async () => {
    const prisma = makePrisma([
      {
        id: 'p1',
        key: 'free',
        isActive: null,
        sortOrder: null,
        isEnterpriseCustom: null,
      },
    ]);

    const result = await backfillPlanDefaults(prisma as never);

    expect(prisma.plan.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { isActive: true, sortOrder: 0, isEnterpriseCustom: false },
    });
    expect(result).toEqual({
      totalPlans: 1,
      backfilled: 1,
      alreadyComplete: 0,
    });
  });

  it('a PARTIALLY-null row only has its NULL fields backfilled — an already-set field is preserved, not overwritten', async () => {
    // isActive is explicitly false (non-null) — must survive the backfill
    // unchanged, even though this row still needs an update for the other
    // two NULL fields.
    const prisma = makePrisma([
      {
        id: 'p2',
        key: 'legacy-disabled',
        isActive: false,
        sortOrder: null,
        isEnterpriseCustom: null,
      },
    ]);

    await backfillPlanDefaults(prisma as never);

    expect(prisma.plan.update).toHaveBeenCalledWith({
      where: { id: 'p2' },
      data: { isActive: false, sortOrder: 0, isEnterpriseCustom: false },
    });
  });

  it('a fully non-null row is left completely untouched — no update() call at all', async () => {
    const prisma = makePrisma([
      {
        id: 'p3',
        key: 'growth',
        isActive: true,
        sortOrder: 5,
        isEnterpriseCustom: true,
      },
    ]);

    const result = await backfillPlanDefaults(prisma as never);

    expect(prisma.plan.update).not.toHaveBeenCalled();
    expect(result).toEqual({
      totalPlans: 1,
      backfilled: 0,
      alreadyComplete: 1,
    });
  });

  it('is idempotent: running it a second time against the already-backfilled result makes zero further writes', async () => {
    const prisma = makePrisma([
      {
        id: 'p1',
        key: 'free',
        isActive: null,
        sortOrder: null,
        isEnterpriseCustom: null,
      },
    ]);

    const first = await backfillPlanDefaults(prisma as never);
    expect(first).toEqual({ totalPlans: 1, backfilled: 1, alreadyComplete: 0 });

    // Simulate the real row's post-update state (what a second real
    // findMany() would now return) and run again against the same mock.
    prisma.plan.findMany.mockResolvedValue([
      {
        id: 'p1',
        key: 'free',
        isActive: true,
        sortOrder: 0,
        isEnterpriseCustom: false,
      },
    ]);
    prisma.plan.update.mockClear();

    const second = await backfillPlanDefaults(prisma as never);

    expect(prisma.plan.update).not.toHaveBeenCalled();
    expect(second).toEqual({
      totalPlans: 1,
      backfilled: 0,
      alreadyComplete: 1,
    });
  });

  it('handles a mix of already-complete and NULL rows in the same run, touching only the NULL one', async () => {
    const prisma = makePrisma([
      {
        id: 'p1',
        key: 'free',
        isActive: true,
        sortOrder: 0,
        isEnterpriseCustom: false,
      },
      {
        id: 'p2',
        key: 'enterprise',
        isActive: null,
        sortOrder: null,
        isEnterpriseCustom: null,
      },
    ]);

    const result = await backfillPlanDefaults(prisma as never);

    expect(prisma.plan.update).toHaveBeenCalledTimes(1);
    expect(prisma.plan.update).toHaveBeenCalledWith({
      where: { id: 'p2' },
      data: { isActive: true, sortOrder: 0, isEnterpriseCustom: false },
    });
    expect(result).toEqual({
      totalPlans: 2,
      backfilled: 1,
      alreadyComplete: 1,
    });
  });

  it('zero rows is a safe no-op', async () => {
    const prisma = makePrisma([]);
    const result = await backfillPlanDefaults(prisma as never);
    expect(prisma.plan.update).not.toHaveBeenCalled();
    expect(result).toEqual({
      totalPlans: 0,
      backfilled: 0,
      alreadyComplete: 0,
    });
  });
});
