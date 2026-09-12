import { randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/database/prisma.service';
import {
  isLimitKey,
  LimitKey,
} from '../platform/platform-plans/catalogue.constants';
import {
  InvalidUsageAmountError,
  InvalidUsageLimitError,
  InvalidUsageLimitKeyError,
  InvalidUsagePeriodError,
  ReservationOutcome,
  UsageReadResult,
} from './usage.types';

type UsageClient = PrismaService | Prisma.TransactionClient;

/**
 * Phase 6 W3 — the usage engine. Owns `Usage` persistence, period
 * handling, reads, and the atomic CAS reservation/decrement primitives W5
 * will compose with resource-creation transactions. Never mutates
 * `Subscription`/`Plan`/`PlanFeature`/`PlanLimit`/`TenantEntitlementOverride`
 * — this file only ever touches the `Usage` table. Owns none of:
 * `@RequireFeature`, `EntitlementGuard`, application-resource limit
 * enforcement (W5), tenant/platform HTTP APIs, or anything Phase 7.
 *
 * **Transaction composition.** Every method's first parameter is the
 * Prisma client to use — either the injected `PrismaService` (standalone
 * call, its own implicit transaction per statement) or a caller-supplied
 * `Prisma.TransactionClient` (so a reservation commits/rolls back
 * atomically with whatever resource-creation work the caller is doing in
 * the SAME transaction) — the same explicit-client convention
 * `common/tenant/tenant-lifecycle.ts#assertTenantActive` already
 * establishes. This class never opens its own transaction internally and
 * never calls `this.prisma.$transaction` from within a method that also
 * accepts a `client` parameter — doing so from inside an already-open
 * caller transaction would be exactly the "nested transaction that breaks
 * atomicity" the W3 authorization forbids.
 *
 * **Raw SQL, isolated and parameterized.** The atomic CAS operation cannot
 * be expressed as a plain Prisma `update()` (no `WHERE <expr involving the
 * column being set> <= value` support in Prisma's query builder) — this is
 * the one place in this file raw SQL is used, via Prisma's tagged-template
 * `$executeRaw`/`$queryRaw` (automatically parameterized — never string
 * interpolation, never `$queryRawUnsafe`/`$executeRawUnsafe`), matching
 * the same tagged-template convention `common/tenant/tenant-rls.ts`
 * already establishes elsewhere in this codebase.
 *
 * **Tenant isolation.** Every query filters by the exact `(tenantId,
 * limitKey, period)` tuple the caller supplies — never a bare `limitKey`
 * or `period` alone, and never an unscoped `Usage` read/write. `resolve()`
 * takes `tenantId` as a caller-trusted value (same posture as
 * `EntitlementService.resolve()` — no HTTP surface exists in this file at
 * all).
 */
@Injectable()
export class UsageService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Read-only. Never creates a row merely because it was read — a missing
   * row means "usage count = 0", reported as such without materializing
   * anything.
   */
  async getUsage(
    client: UsageClient,
    tenantId: string,
    limitKey: LimitKey,
    period: string,
  ): Promise<UsageReadResult> {
    this.validateKeyAndPeriod(limitKey, period);
    const row = await client.usage.findUnique({
      where: { tenantId_limitKey_period: { tenantId, limitKey, period } },
      select: { count: true },
    });
    return { count: row?.count ?? 0 };
  }

  /**
   * Atomically attempts to reserve `amount` more usage against `limit`
   * (the caller's already-resolved `PlanLimit`/entitlement value — `null`
   * = unlimited, per the P6-D2-ratified distinction between "missing"
   * (never reaches this method as `null`; a caller resolves "missing" to
   * `0` per P6-D2 before calling) and "explicitly unlimited"). Never
   * throws for a legitimate "the limit would be exceeded" outcome — that
   * is a normal, deterministic `{status:'LIMIT_EXCEEDED', ...}` result,
   * not an exception. Throws only for genuinely invalid caller input
   * (negative/non-integer `amount`, an invalid `limit`, an unrecognized
   * `limitKey`, or an empty `period`).
   *
   * **Unlimited handling (`limit === null`)** — formally ratified
   * (`docs/saas/DECISIONS.md`, record P6-D3): usage is STILL tracked (the
   * `Usage` row is still created/incremented) even when the resolved limit
   * is unlimited, rather than skipped — this is now the authoritative,
   * permanent contract, not a placeholder. Chosen so the `Usage` table
   * always reflects real resource counts regardless of which plan a tenant
   * happens to be on at the time — a later plan downgrade to a finite
   * limit sees accurate historical usage, not a gap. The increment is
   * unconditional in this branch (there is no ceiling to violate).
   */
  async reserve(
    client: UsageClient,
    tenantId: string,
    limitKey: LimitKey,
    period: string,
    amount: number,
    limit: number | null,
  ): Promise<ReservationOutcome> {
    this.validateKeyAndPeriod(limitKey, period);
    this.validateAmount(amount);
    this.validateLimit(limit);

    // Step 1 — idempotent, always-safe: guarantee a row exists at count=0.
    // Inserting 0 can never violate any non-negative limit (including
    // limit=0), so this step needs no condition at all. Concurrent callers
    // racing this step is safe by construction: Postgres's own unique
    // constraint on (tenantId, limitKey, period) means at most one of them
    // actually inserts; the rest are no-ops (`DO NOTHING`) that still
    // leave the row present for step 2.
    const id = randomUUID();
    await client.$executeRaw`
      INSERT INTO "usage" (id, "tenantId", "limitKey", period, count, "updatedAt")
      VALUES (${id}, ${tenantId}, ${limitKey}, ${period}, 0, now())
      ON CONFLICT ("tenantId", "limitKey", period) DO NOTHING
    `;

    // Step 2 — the real atomic CAS. By now the row is GUARANTEED to exist
    // (step 1), so this is always a genuine UPDATE, never an INSERT — the
    // classic, race-safe "conditional increment" pattern: Postgres takes a
    // row-level lock for the UPDATE, and under concurrent execution a
    // second transaction's WHERE clause is re-evaluated against the FIRST
    // transaction's already-committed new value once the lock is
    // released, so two concurrent callers can never both push the count
    // past `limit` — one succeeds, the other's WHERE fails and it affects
    // zero rows (never a lost update, never a race).
    const rows =
      limit === null
        ? await client.$queryRaw<{ count: number }[]>`
            UPDATE "usage"
            SET count = count + ${amount}, "updatedAt" = now()
            WHERE "tenantId" = ${tenantId} AND "limitKey" = ${limitKey} AND period = ${period}
            RETURNING count
          `
        : await client.$queryRaw<{ count: number }[]>`
            UPDATE "usage"
            SET count = count + ${amount}, "updatedAt" = now()
            WHERE "tenantId" = ${tenantId} AND "limitKey" = ${limitKey} AND period = ${period}
              AND count + ${amount} <= ${limit}
            RETURNING count
          `;

    if (rows.length === 1) {
      return { status: 'RESERVED', count: rows[0].count };
    }

    // WHERE failed (finite-limit branch only — the unlimited branch never
    // has a WHERE condition to fail, and the row is guaranteed to exist by
    // step 1, so `rows.length === 0` here can only mean the limit check
    // failed). Read the current count for the result — a plain read, not
    // itself part of the atomic decision (the decision already happened
    // atomically above; this is purely for reporting).
    const current = await this.getUsage(client, tenantId, limitKey, period);
    return {
      status: 'LIMIT_EXCEEDED',
      count: current.count,
      limit: limit as number,
    };
  }

  /**
   * Atomically decreases usage by `amount`, clamped at zero — usage can
   * never become negative (W3 authorization §14/§15), so a decrement
   * larger than the current count reduces it to exactly 0 rather than
   * rejecting or going negative. A missing row behaves deterministically
   * as a no-op (nothing to decrement from an implicit 0) and does NOT
   * materialize a new row — matching `getUsage`'s own "reads/no-ops never
   * create rows" posture.
   */
  async decrement(
    client: UsageClient,
    tenantId: string,
    limitKey: LimitKey,
    period: string,
    amount: number,
  ): Promise<UsageReadResult> {
    this.validateKeyAndPeriod(limitKey, period);
    this.validateAmount(amount);

    // GREATEST(count - amount, 0) performs the clamp atomically, inside
    // the same row-locked UPDATE — no separate read-then-write, so a
    // concurrent increment/decrement on the same row can never interleave
    // with this one and corrupt the result.
    const rows = await client.$queryRaw<{ count: number }[]>`
      UPDATE "usage"
      SET count = GREATEST(count - ${amount}, 0), "updatedAt" = now()
      WHERE "tenantId" = ${tenantId} AND "limitKey" = ${limitKey} AND period = ${period}
      RETURNING count
    `;

    if (rows.length === 1) {
      return { count: rows[0].count };
    }
    // No row exists at all — already implicitly 0; nothing to persist.
    return { count: 0 };
  }

  private validateKeyAndPeriod(limitKey: string, period: string): void {
    if (!isLimitKey(limitKey)) {
      throw new InvalidUsageLimitKeyError(limitKey);
    }
    if (typeof period !== 'string' || period.length === 0) {
      throw new InvalidUsagePeriodError(period);
    }
  }

  private validateAmount(amount: number): void {
    if (!Number.isInteger(amount) || amount < 0) {
      throw new InvalidUsageAmountError(amount);
    }
  }

  private validateLimit(limit: number | null): void {
    if (limit !== null && (!Number.isInteger(limit) || limit < 0)) {
      throw new InvalidUsageLimitError(limit);
    }
  }
}
