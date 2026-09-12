import { UsageService } from './usage.service';
import {
  InvalidUsageAmountError,
  InvalidUsageLimitError,
  InvalidUsageLimitKeyError,
  InvalidUsagePeriodError,
} from './usage.types';
import { PERSISTENT_PERIOD } from './usage-period';

/**
 * Phase 6 W3. Unit tests against a mocked Prisma client — scripted
 * `$executeRaw`/`$queryRaw` responses per scenario (the same "mock returns
 * whatever this test configures" convention every other spec file in this
 * repo uses), NOT a bespoke in-memory SQL simulator. Genuine concurrency
 * (§17 of the W3 authorization) is proven exclusively against real
 * Postgres in `test/e2e/usage-engine.e2e-spec.ts` — mocks cannot prove a
 * race is actually race-free, only that the business-logic branches
 * (limit exceeded vs. reserved, unlimited, validation) are correct.
 */
describe('UsageService', () => {
  const TENANT_ID = 'tenant-a';

  function makeClient(opts: {
    /** Rows `$queryRaw` should return for the CAS UPDATE call. */
    casRows?: Array<{ count: number }>;
    /** Count `getUsage`'s own findUnique-equivalent should report when
     * called after a LIMIT_EXCEEDED result (reporting-only read). */
    currentCountAfterExceeded?: number;
  }) {
    const executeRaw = jest.fn().mockResolvedValue(undefined);
    const queryRaw = jest.fn();
    // First call within reserve()/decrement() is always the CAS UPDATE
    // itself; a second call (only on LIMIT_EXCEEDED) is the reporting read
    // via getUsage(), which internally uses `usage.findUnique`, not
    // `$queryRaw` — so we mock that delegate separately.
    queryRaw.mockResolvedValueOnce(opts.casRows ?? []);
    const findUnique = jest
      .fn()
      .mockResolvedValue(
        opts.currentCountAfterExceeded === undefined
          ? null
          : { count: opts.currentCountAfterExceeded },
      );
    const client = {
      $executeRaw: executeRaw,
      $queryRaw: queryRaw,
      usage: { findUnique },
    };
    return { client, executeRaw, queryRaw, findUnique };
  }

  const service = new UsageService({} as never);

  // ─── A: missing usage → 0 ───────────────────────────────────────────────

  it('getUsage returns count: 0 when no row exists, and never creates one', async () => {
    const findUnique = jest.fn().mockResolvedValue(null);
    const client = { usage: { findUnique } } as never;

    const result = await service.getUsage(
      client,
      TENANT_ID,
      'products',
      PERSISTENT_PERIOD,
    );

    expect(result).toEqual({ count: 0 });
    expect(findUnique).toHaveBeenCalledWith({
      where: {
        tenantId_limitKey_period: {
          tenantId: TENANT_ID,
          limitKey: 'products',
          period: PERSISTENT_PERIOD,
        },
      },
      select: { count: true },
    });
  });

  it('getUsage returns the real count when a row exists', async () => {
    const findUnique = jest.fn().mockResolvedValue({ count: 7 });
    const client = { usage: { findUnique } } as never;

    const result = await service.getUsage(
      client,
      TENANT_ID,
      'products',
      PERSISTENT_PERIOD,
    );

    expect(result).toEqual({ count: 7 });
  });

  // ─── B/C: first / subsequent reservation ────────────────────────────────

  it('a first reservation ensures the row exists (step 1) then performs the CAS increment (step 2)', async () => {
    const { client, executeRaw, queryRaw } = makeClient({
      casRows: [{ count: 1 }],
    });

    const result = await service.reserve(
      client as never,
      TENANT_ID,
      'products',
      PERSISTENT_PERIOD,
      1,
      10,
    );

    expect(executeRaw).toHaveBeenCalledTimes(1); // the ensure-row-exists step
    expect(queryRaw).toHaveBeenCalledTimes(1); // the atomic CAS update
    expect(result).toEqual({ status: 'RESERVED', count: 1 });
  });

  it('a subsequent reservation increments correctly', async () => {
    const { client } = makeClient({ casRows: [{ count: 6 }] });

    const result = await service.reserve(
      client as never,
      TENANT_ID,
      'products',
      PERSISTENT_PERIOD,
      1,
      10,
    );

    expect(result).toEqual({ status: 'RESERVED', count: 6 });
  });

  // ─── D: exact-limit reservation ─────────────────────────────────────────

  it('a reservation that lands exactly on the limit succeeds', async () => {
    const { client } = makeClient({ casRows: [{ count: 10 }] });

    const result = await service.reserve(
      client as never,
      TENANT_ID,
      'products',
      PERSISTENT_PERIOD,
      1,
      10,
    );

    expect(result).toEqual({ status: 'RESERVED', count: 10 });
  });

  // ─── E: reservation over limit ──────────────────────────────────────────

  it('a reservation that would exceed the limit is denied and reports the current count/limit', async () => {
    const { client } = makeClient({
      casRows: [], // WHERE failed — zero rows affected
      currentCountAfterExceeded: 10,
    });

    const result = await service.reserve(
      client as never,
      TENANT_ID,
      'products',
      PERSISTENT_PERIOD,
      1,
      10,
    );

    expect(result).toEqual({ status: 'LIMIT_EXCEEDED', count: 10, limit: 10 });
  });

  // ─── F: limit = 0 ───────────────────────────────────────────────────────

  it('limit = 0 denies any positive-amount reservation', async () => {
    const { client } = makeClient({
      casRows: [],
      currentCountAfterExceeded: 0,
    });

    const result = await service.reserve(
      client as never,
      TENANT_ID,
      'products',
      PERSISTENT_PERIOD,
      1,
      0,
    );

    expect(result).toEqual({ status: 'LIMIT_EXCEEDED', count: 0, limit: 0 });
  });

  it('limit = 0 with amount = 0 succeeds (a true no-op reservation)', async () => {
    const { client } = makeClient({ casRows: [{ count: 0 }] });

    const result = await service.reserve(
      client as never,
      TENANT_ID,
      'products',
      PERSISTENT_PERIOD,
      0,
      0,
    );

    expect(result).toEqual({ status: 'RESERVED', count: 0 });
  });

  // ─── G: unlimited limit ─────────────────────────────────────────────────

  it('limit = null (unlimited) always reserves, using the unconditional UPDATE branch', async () => {
    const { client, queryRaw } = makeClient({ casRows: [{ count: 5000 }] });

    const result = await service.reserve(
      client as never,
      TENANT_ID,
      'products',
      PERSISTENT_PERIOD,
      1,
      null,
    );

    expect(result).toEqual({ status: 'RESERVED', count: 5000 });
    // The unlimited branch's query never mentions a limit comparison —
    // asserted structurally via call count (exactly one $queryRaw call,
    // same as the finite-limit branch) since the two branches are
    // otherwise indistinguishable from the outside without SQL-text
    // inspection.
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });

  // ─── H: amount > 1 ──────────────────────────────────────────────────────

  it('amount > 1 is passed through and reflected in the reserved count', async () => {
    const { client } = makeClient({ casRows: [{ count: 50 }] });

    const result = await service.reserve(
      client as never,
      TENANT_ID,
      'storage_mb',
      PERSISTENT_PERIOD,
      50,
      100,
    );

    expect(result).toEqual({ status: 'RESERVED', count: 50 });
  });

  // ─── I: amount = 0 ──────────────────────────────────────────────────────

  it('amount = 0 is valid and treated as a genuine (trivial) reservation', async () => {
    const { client } = makeClient({ casRows: [{ count: 3 }] });

    const result = await service.reserve(
      client as never,
      TENANT_ID,
      'products',
      PERSISTENT_PERIOD,
      0,
      10,
    );

    expect(result).toEqual({ status: 'RESERVED', count: 3 });
  });

  // ─── J: negative amount rejected ────────────────────────────────────────

  it('a negative amount throws InvalidUsageAmountError before touching the database', async () => {
    const { client, executeRaw, queryRaw } = makeClient({});

    await expect(
      service.reserve(
        client as never,
        TENANT_ID,
        'products',
        PERSISTENT_PERIOD,
        -1,
        10,
      ),
    ).rejects.toThrow(InvalidUsageAmountError);
    expect(executeRaw).not.toHaveBeenCalled();
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it('a non-integer amount throws InvalidUsageAmountError', async () => {
    const { client } = makeClient({});
    await expect(
      service.reserve(
        client as never,
        TENANT_ID,
        'products',
        PERSISTENT_PERIOD,
        1.5,
        10,
      ),
    ).rejects.toThrow(InvalidUsageAmountError);
  });

  it('a negative limit throws InvalidUsageLimitError', async () => {
    const { client } = makeClient({});
    await expect(
      service.reserve(
        client as never,
        TENANT_ID,
        'products',
        PERSISTENT_PERIOD,
        1,
        -5,
      ),
    ).rejects.toThrow(InvalidUsageLimitError);
  });

  it('an unrecognized limitKey throws InvalidUsageLimitKeyError', async () => {
    const { client } = makeClient({});
    await expect(
      service.reserve(
        client as never,
        TENANT_ID,
        'not_a_real_key' as never,
        PERSISTENT_PERIOD,
        1,
        10,
      ),
    ).rejects.toThrow(InvalidUsageLimitKeyError);
  });

  it('an empty period throws InvalidUsagePeriodError', async () => {
    const { client } = makeClient({});
    await expect(
      service.reserve(client as never, TENANT_ID, 'products', '', 1, 10),
    ).rejects.toThrow(InvalidUsagePeriodError);
  });

  // ─── K/L: decrement ─────────────────────────────────────────────────────

  it('decrement reduces the count by amount', async () => {
    const queryRaw = jest.fn().mockResolvedValue([{ count: 4 }]);
    const client = { $queryRaw: queryRaw } as never;

    const result = await service.decrement(
      client,
      TENANT_ID,
      'team_members',
      PERSISTENT_PERIOD,
      1,
    );

    expect(result).toEqual({ count: 4 });
  });

  it('decrement below zero clamps to 0, never negative', async () => {
    // The SQL itself does the clamping (GREATEST(count-amount,0)); this
    // test proves the service surfaces exactly what the DB returns.
    const queryRaw = jest.fn().mockResolvedValue([{ count: 0 }]);
    const client = { $queryRaw: queryRaw } as never;

    const result = await service.decrement(
      client,
      TENANT_ID,
      'team_members',
      PERSISTENT_PERIOD,
      100,
    );

    expect(result).toEqual({ count: 0 });
  });

  it('decrementing a missing row is a deterministic no-op (count: 0), never creates a row', async () => {
    const queryRaw = jest.fn().mockResolvedValue([]);
    const client = { $queryRaw: queryRaw } as never;

    const result = await service.decrement(
      client,
      TENANT_ID,
      'team_members',
      PERSISTENT_PERIOD,
      1,
    );

    expect(result).toEqual({ count: 0 });
  });

  it('a negative decrement amount throws InvalidUsageAmountError', async () => {
    const client = { $queryRaw: jest.fn() } as never;
    await expect(
      service.decrement(
        client,
        TENANT_ID,
        'team_members',
        PERSISTENT_PERIOD,
        -1,
      ),
    ).rejects.toThrow(InvalidUsageAmountError);
  });

  // ─── M/N/O: isolation (structural — real cross-tenant/period/key proof is e2e) ──

  it('reserve scopes the CAS query to the exact tenantId/limitKey/period supplied', async () => {
    const { client, queryRaw } = makeClient({ casRows: [{ count: 1 }] });

    await service.reserve(
      client as never,
      'tenant-x',
      'orders_per_month',
      '2026-09',
      1,
      10,
    );

    // Prisma tagged-template calls pass (strings, ...values) — the values
    // array carries the actual bound parameters in call order.
    const callArgs = queryRaw.mock.calls[0] as unknown[];
    expect(callArgs).toEqual(
      expect.arrayContaining([
        'tenant-x',
        'orders_per_month',
        '2026-09',
        1,
        10,
      ]),
    );
  });

  // ─── T: deterministic errors ────────────────────────────────────────────

  it('the same invalid input always throws the same error type, deterministically', async () => {
    const { client } = makeClient({});
    await expect(
      service.reserve(
        client as never,
        TENANT_ID,
        'products',
        PERSISTENT_PERIOD,
        -1,
        10,
      ),
    ).rejects.toThrow(InvalidUsageAmountError);
    await expect(
      service.reserve(
        client as never,
        TENANT_ID,
        'products',
        PERSISTENT_PERIOD,
        -1,
        10,
      ),
    ).rejects.toThrow(InvalidUsageAmountError);
  });
});
