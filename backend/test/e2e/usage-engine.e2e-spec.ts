import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { resetDatabase } from './support/db';
import { UsageService } from '../../src/usage/usage.service';
import { PERSISTENT_PERIOD } from '../../src/usage/usage-period';
import { PrismaService } from '../../src/common/database/prisma.service';

/**
 * Phase 6 W3 — the usage/CAS engine, exercised against REAL Postgres. No
 * Nest app / HTTP surface (W3 builds no controller). This file exists
 * specifically to prove what mocks cannot: genuine concurrent-transaction
 * races are correctly serialized by the atomic CAS primitive, with no lost
 * update and no possibility of exceeding a finite limit.
 */
describe('Phase 6 W3 — UsageService (real Postgres, concurrency-critical)', () => {
  const prisma = new PrismaClient();
  const service = new UsageService(prisma as unknown as PrismaService);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  async function makeTenant() {
    return prisma.tenant.create({
      data: { slug: `usage-test-${randomUUID()}`, status: 'ACTIVE' },
    });
  }

  async function seedUsage(
    tenantId: string,
    limitKey: string,
    period: string,
    count: number,
  ) {
    await prisma.usage.create({
      data: { tenantId, limitKey, period, count },
    });
  }

  async function reserveInTransaction(
    tenantId: string,
    limitKey: string,
    period: string,
    amount: number,
    limit: number | null,
  ) {
    return prisma.$transaction((tx) =>
      service.reserve(tx, tenantId, limitKey as never, period, amount, limit),
    );
  }

  // ─── Basic real end-to-end behavior ──────────────────────────────────────

  it('a first reservation creates the row and increments to the reserved amount', async () => {
    const tenant = await makeTenant();

    const result = await reserveInTransaction(
      tenant.id,
      'products',
      PERSISTENT_PERIOD,
      3,
      10,
    );

    expect(result).toEqual({ status: 'RESERVED', count: 3 });
    const row = await prisma.usage.findUnique({
      where: {
        tenantId_limitKey_period: {
          tenantId: tenant.id,
          limitKey: 'products',
          period: PERSISTENT_PERIOD,
        },
      },
    });
    expect(row?.count).toBe(3);
  });

  it('an unlimited (limit: null) reservation always succeeds and still persists real usage', async () => {
    const tenant = await makeTenant();

    const result = await reserveInTransaction(
      tenant.id,
      'products',
      PERSISTENT_PERIOD,
      1000,
      null,
    );

    expect(result).toEqual({ status: 'RESERVED', count: 1000 });
  });

  // P6-D3 — formally ratified: unlimited (PlanLimit exists with
  // limitValue: NULL) still tracks Usage; it is never "skip tracking".
  // This test starts from a large PRE-EXISTING count (not zero, unlike the
  // test above) specifically to make "no artificial limit rejection"
  // unmistakable — an unlimited reservation must succeed regardless of how
  // large the count already is, and the result must be exactly
  // existingCount + amount.
  it('P6-D3: unlimited tracking — reserving on top of a large pre-existing count still succeeds and accumulates exactly (never rejected, never skipped)', async () => {
    const tenant = await makeTenant();
    const EXISTING_COUNT = 999_999;
    await seedUsage(tenant.id, 'products', PERSISTENT_PERIOD, EXISTING_COUNT);

    const result = await reserveInTransaction(
      tenant.id,
      'products',
      PERSISTENT_PERIOD,
      42,
      null,
    );

    expect(result).toEqual({
      status: 'RESERVED',
      count: EXISTING_COUNT + 42,
    });
    const usage = await service.getUsage(
      prisma,
      tenant.id,
      'products',
      PERSISTENT_PERIOD,
    );
    expect(usage.count).toBe(EXISTING_COUNT + 42);
  });

  it('decrement clamps at zero in real Postgres', async () => {
    const tenant = await makeTenant();
    await seedUsage(tenant.id, 'team_members', PERSISTENT_PERIOD, 2);

    const result = await prisma.$transaction((tx) =>
      service.decrement(tx, tenant.id, 'team_members', PERSISTENT_PERIOD, 5),
    );

    expect(result).toEqual({ count: 0 });
  });

  // ─── Period / tenant / limit-key isolation (§16) ────────────────────────

  it('PERSISTENT usage keeps the same period identity across repeated calls (never creates a new period)', async () => {
    const tenant = await makeTenant();

    await reserveInTransaction(tenant.id, 'products', PERSISTENT_PERIOD, 1, 10);
    await reserveInTransaction(tenant.id, 'products', PERSISTENT_PERIOD, 1, 10);

    const rows = await prisma.usage.findMany({
      where: { tenantId: tenant.id, limitKey: 'products' },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].count).toBe(2);
  });

  it('different billing-period strings never share a counter — old-period usage remains historical, not overwritten', async () => {
    const tenant = await makeTenant();
    await seedUsage(tenant.id, 'orders_per_month', '2026-08', 50);

    const result = await reserveInTransaction(
      tenant.id,
      'orders_per_month',
      '2026-09',
      1,
      100,
    );

    expect(result).toEqual({ status: 'RESERVED', count: 1 });
    const oldPeriodRow = await prisma.usage.findUnique({
      where: {
        tenantId_limitKey_period: {
          tenantId: tenant.id,
          limitKey: 'orders_per_month',
          period: '2026-08',
        },
      },
    });
    expect(oldPeriodRow?.count).toBe(50); // untouched
    const rows = await prisma.usage.findMany({
      where: { tenantId: tenant.id, limitKey: 'orders_per_month' },
    });
    expect(rows).toHaveLength(2); // both periods coexist independently
  });

  it("tenant A cannot read or affect tenant B's usage for the identical limitKey/period", async () => {
    const tenantA = await makeTenant();
    const tenantB = await makeTenant();
    await seedUsage(tenantA.id, 'products', PERSISTENT_PERIOD, 5);
    await seedUsage(tenantB.id, 'products', PERSISTENT_PERIOD, 5);

    await reserveInTransaction(
      tenantA.id,
      'products',
      PERSISTENT_PERIOD,
      1,
      100,
    );

    const usageA = await service.getUsage(
      prisma,
      tenantA.id,
      'products',
      PERSISTENT_PERIOD,
    );
    const usageB = await service.getUsage(
      prisma,
      tenantB.id,
      'products',
      PERSISTENT_PERIOD,
    );
    expect(usageA.count).toBe(6);
    expect(usageB.count).toBe(5); // completely unaffected by A's reservation
  });

  it('two different limitKeys for the same tenant/period never collide', async () => {
    const tenant = await makeTenant();

    await reserveInTransaction(
      tenant.id,
      'products',
      PERSISTENT_PERIOD,
      3,
      100,
    );
    await reserveInTransaction(
      tenant.id,
      'team_members',
      PERSISTENT_PERIOD,
      7,
      100,
    );

    const products = await service.getUsage(
      prisma,
      tenant.id,
      'products',
      PERSISTENT_PERIOD,
    );
    const teamMembers = await service.getUsage(
      prisma,
      tenant.id,
      'team_members',
      PERSISTENT_PERIOD,
    );
    expect(products.count).toBe(3);
    expect(teamMembers.count).toBe(7);
  });

  // ─── Transaction rollback (§18) ──────────────────────────────────────────

  it('a successful reservation inside a transaction that later fails is fully rolled back — Usage count unchanged', async () => {
    const tenant = await makeTenant();

    await expect(
      prisma.$transaction(async (tx) => {
        const result = await service.reserve(
          tx,
          tenant.id,
          'products',
          PERSISTENT_PERIOD,
          5,
          10,
        );
        expect(result.status).toBe('RESERVED');
        throw new Error(
          'simulated downstream failure (e.g. resource creation failed)',
        );
      }),
    ).rejects.toThrow('simulated downstream failure');

    const usage = await service.getUsage(
      prisma,
      tenant.id,
      'products',
      PERSISTENT_PERIOD,
    );
    expect(usage.count).toBe(0); // the reservation never happened, from the DB's perspective
    const row = await prisma.usage.findUnique({
      where: {
        tenantId_limitKey_period: {
          tenantId: tenant.id,
          limitKey: 'products',
          period: PERSISTENT_PERIOD,
        },
      },
    });
    expect(row).toBeNull(); // even the "ensure row exists" step 1 was rolled back
  });

  // ─── Real concurrency proofs (§17) — the critical requirement ───────────

  it('CONCURRENCY: limit=10, current=9, two concurrent +1 reservations — exactly one succeeds, one fails, final=10', async () => {
    const tenant = await makeTenant();
    await seedUsage(tenant.id, 'products', PERSISTENT_PERIOD, 9);

    const [r1, r2] = await Promise.all([
      reserveInTransaction(tenant.id, 'products', PERSISTENT_PERIOD, 1, 10),
      reserveInTransaction(tenant.id, 'products', PERSISTENT_PERIOD, 1, 10),
    ]);

    const outcomes = [r1.status, r2.status];
    expect(outcomes.filter((s) => s === 'RESERVED')).toHaveLength(1);
    expect(outcomes.filter((s) => s === 'LIMIT_EXCEEDED')).toHaveLength(1);

    const finalUsage = await service.getUsage(
      prisma,
      tenant.id,
      'products',
      PERSISTENT_PERIOD,
    );
    expect(finalUsage.count).toBe(10);
  });

  it('CONCURRENCY: limit=10, current=8, three concurrent +1 reservations — exactly two succeed, one fails, final=10', async () => {
    const tenant = await makeTenant();
    await seedUsage(tenant.id, 'products', PERSISTENT_PERIOD, 8);

    const results = await Promise.all([
      reserveInTransaction(tenant.id, 'products', PERSISTENT_PERIOD, 1, 10),
      reserveInTransaction(tenant.id, 'products', PERSISTENT_PERIOD, 1, 10),
      reserveInTransaction(tenant.id, 'products', PERSISTENT_PERIOD, 1, 10),
    ]);

    const outcomes = results.map((r) => r.status);
    expect(outcomes.filter((s) => s === 'RESERVED')).toHaveLength(2);
    expect(outcomes.filter((s) => s === 'LIMIT_EXCEEDED')).toHaveLength(1);

    const finalUsage = await service.getUsage(
      prisma,
      tenant.id,
      'products',
      PERSISTENT_PERIOD,
    );
    expect(finalUsage.count).toBe(10);
  });

  it('CONCURRENCY: limit=10, current=8, two concurrent +2 reservations (amount > 1) — exactly one succeeds, one fails, final=10', async () => {
    const tenant = await makeTenant();
    await seedUsage(tenant.id, 'products', PERSISTENT_PERIOD, 8);

    const [r1, r2] = await Promise.all([
      reserveInTransaction(tenant.id, 'products', PERSISTENT_PERIOD, 2, 10),
      reserveInTransaction(tenant.id, 'products', PERSISTENT_PERIOD, 2, 10),
    ]);

    const outcomes = [r1.status, r2.status];
    expect(outcomes.filter((s) => s === 'RESERVED')).toHaveLength(1);
    expect(outcomes.filter((s) => s === 'LIMIT_EXCEEDED')).toHaveLength(1);

    const finalUsage = await service.getUsage(
      prisma,
      tenant.id,
      'products',
      PERSISTENT_PERIOD,
    );
    expect(finalUsage.count).toBe(10);
  });

  it('CONCURRENCY: concurrent FIRST-ever reservations for a brand-new (tenant, limitKey, period) — no lost update, no double-insert race', async () => {
    const tenant = await makeTenant();
    // No seed row at all — both transactions race to create it.

    const [r1, r2] = await Promise.all([
      reserveInTransaction(tenant.id, 'products', PERSISTENT_PERIOD, 3, 5),
      reserveInTransaction(tenant.id, 'products', PERSISTENT_PERIOD, 3, 5),
    ]);

    const outcomes = [r1.status, r2.status];
    expect(outcomes.filter((s) => s === 'RESERVED')).toHaveLength(1);
    expect(outcomes.filter((s) => s === 'LIMIT_EXCEEDED')).toHaveLength(1);

    const rows = await prisma.usage.findMany({
      where: {
        tenantId: tenant.id,
        limitKey: 'products',
        period: PERSISTENT_PERIOD,
      },
    });
    expect(rows).toHaveLength(1); // exactly one row, never a duplicate-key error
    expect(rows[0].count).toBe(3);
  });

  it('CONCURRENCY: many concurrent increments comfortably within the limit all succeed, final count is exact (no lost updates)', async () => {
    const tenant = await makeTenant();
    const CONCURRENT_CALLS = 10;

    const results = await Promise.all(
      Array.from({ length: CONCURRENT_CALLS }, () =>
        reserveInTransaction(tenant.id, 'products', PERSISTENT_PERIOD, 1, 1000),
      ),
    );

    expect(results.every((r) => r.status === 'RESERVED')).toBe(true);
    const finalUsage = await service.getUsage(
      prisma,
      tenant.id,
      'products',
      PERSISTENT_PERIOD,
    );
    expect(finalUsage.count).toBe(CONCURRENT_CALLS); // no lost update
  });
});
