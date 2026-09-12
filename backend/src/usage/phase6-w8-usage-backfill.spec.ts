import { backfillUsageCounts } from '../../prisma/backfill/phase6-w8-usage-backfill';
import { PERSISTENT_PERIOD } from './usage-period';

/**
 * Phase 6 W8 — regression tests for `prisma/backfill/phase6-w8-usage
 * -backfill.ts`. Colocated under `src/usage/` rather than next to the
 * script itself — same reasoning, and the same precedent, as
 * `phase6-w1-plan-backfill.spec.ts`: `package.json`'s jest config sets
 * `rootDir: "src"`, so nothing under `prisma/` is ever discovered by
 * `npx jest`. Real-Postgres proof of the actual counting queries lives in
 * `test/e2e/phase6-w8-usage-backfill.e2e-spec.ts`.
 *
 * Mocks a minimal `PrismaClient`-shaped object — same convention as every
 * other service/backfill spec in this repo.
 */
describe('backfillUsageCounts (Phase 6 W8 usage backfill)', () => {
  function makePrisma(opts: {
    tenants: { id: string }[];
    productCounts: Record<string, number>;
    teamMemberCounts: Record<string, number>;
    files: Record<string, { bytes: number }[]>;
  }) {
    const usageUpsert = jest.fn().mockResolvedValue(undefined);
    const prisma = {
      tenant: { findMany: jest.fn().mockResolvedValue(opts.tenants) },
      product: {
        count: jest
          .fn()
          .mockImplementation(({ where }: { where: { tenantId: string } }) =>
            Promise.resolve(opts.productCounts[where.tenantId] ?? 0),
          ),
      },
      tenantMembership: {
        count: jest
          .fn()
          .mockImplementation(({ where }: { where: { tenantId: string } }) =>
            Promise.resolve(opts.teamMemberCounts[where.tenantId] ?? 0),
          ),
      },
      uploadedFile: {
        findMany: jest
          .fn()
          .mockImplementation(({ where }: { where: { tenantId: string } }) =>
            Promise.resolve(opts.files[where.tenantId] ?? []),
          ),
      },
      usage: { upsert: usageUpsert },
    };
    return { prisma, usageUpsert };
  }

  it('reconciles products/team_members/storage_mb for a single tenant to their real current counts', async () => {
    const { prisma, usageUpsert } = makePrisma({
      tenants: [{ id: 'tenant-a' }],
      productCounts: { 'tenant-a': 42 },
      teamMemberCounts: { 'tenant-a': 3 },
      files: {
        'tenant-a': [{ bytes: 1_048_576 }, { bytes: 500 }], // 1 MiB + 1 MiB (ceil) = 2
      },
    });

    const result = await backfillUsageCounts(prisma as never);

    expect(usageUpsert).toHaveBeenCalledWith({
      where: {
        tenantId_limitKey_period: {
          tenantId: 'tenant-a',
          limitKey: 'products',
          period: PERSISTENT_PERIOD,
        },
      },
      update: { count: 42 },
      create: {
        tenantId: 'tenant-a',
        limitKey: 'products',
        period: PERSISTENT_PERIOD,
        count: 42,
      },
    });
    expect(usageUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { count: 3 } }),
    );
    expect(usageUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { count: 2 } }),
    );
    expect(result).toEqual({
      tenantsProcessed: 1,
      products: [{ tenantId: 'tenant-a', count: 42 }],
      teamMembers: [{ tenantId: 'tenant-a', count: 3 }],
      storageMb: [{ tenantId: 'tenant-a', count: 2 }],
    });
  });

  it('a zero-byte upload contributes 0 MiB, never 1 (ratified P6-D4 zero-byte semantics)', async () => {
    const { prisma } = makePrisma({
      tenants: [{ id: 'tenant-a' }],
      productCounts: {},
      teamMemberCounts: {},
      files: { 'tenant-a': [{ bytes: 0 }] },
    });

    const result = await backfillUsageCounts(prisma as never);

    expect(result.storageMb).toEqual([{ tenantId: 'tenant-a', count: 0 }]);
  });

  it("processes multiple tenants independently — one tenant's counts never leak into another's", async () => {
    const { prisma } = makePrisma({
      tenants: [{ id: 'tenant-a' }, { id: 'tenant-b' }],
      productCounts: { 'tenant-a': 5, 'tenant-b': 1 },
      teamMemberCounts: { 'tenant-a': 1, 'tenant-b': 4 },
      files: { 'tenant-a': [], 'tenant-b': [{ bytes: 2_097_152 }] },
    });

    const result = await backfillUsageCounts(prisma as never);

    expect(result.tenantsProcessed).toBe(2);
    expect(result.products).toEqual([
      { tenantId: 'tenant-a', count: 5 },
      { tenantId: 'tenant-b', count: 1 },
    ]);
    expect(result.teamMembers).toEqual([
      { tenantId: 'tenant-a', count: 1 },
      { tenantId: 'tenant-b', count: 4 },
    ]);
    expect(result.storageMb).toEqual([
      { tenantId: 'tenant-a', count: 0 },
      { tenantId: 'tenant-b', count: 2 },
    ]);
  });

  it('zero tenants is a safe no-op', async () => {
    const { prisma, usageUpsert } = makePrisma({
      tenants: [],
      productCounts: {},
      teamMemberCounts: {},
      files: {},
    });

    const result = await backfillUsageCounts(prisma as never);

    expect(usageUpsert).not.toHaveBeenCalled();
    expect(result).toEqual({
      tenantsProcessed: 0,
      products: [],
      teamMembers: [],
      storageMb: [],
    });
  });

  it('is idempotent: every write is an upsert keyed on (tenantId, limitKey, period) — running it twice issues the same calls again, never a duplicate-prone create', async () => {
    const { prisma, usageUpsert } = makePrisma({
      tenants: [{ id: 'tenant-a' }],
      productCounts: { 'tenant-a': 10 },
      teamMemberCounts: { 'tenant-a': 2 },
      files: { 'tenant-a': [] },
    });

    await backfillUsageCounts(prisma as never);
    const firstCallCount = usageUpsert.mock.calls.length;
    usageUpsert.mockClear();

    await backfillUsageCounts(prisma as never);

    expect(usageUpsert.mock.calls.length).toBe(firstCallCount);
  });
});
