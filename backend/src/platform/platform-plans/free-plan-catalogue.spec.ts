import {
  seedFreePlanCatalogue,
  FREE_PLAN_FEATURES,
  FREE_PLAN_LIMITS,
} from '../../../prisma/free-plan-catalogue';
import { LIMIT_KEY_PERIODS } from './catalogue.constants';

/**
 * Phase 6 W5 — regression tests for `prisma/free-plan-catalogue.ts`.
 * Deliberately colocated under `src/platform/platform-plans/` rather than
 * next to the script itself — same reasoning, and the same precedent, as
 * `phase6-w1-plan-backfill.spec.ts`: `package.json`'s jest config sets
 * `rootDir: "src"`, so nothing under `prisma/` is ever discovered by
 * `npx jest`. The module is imported here via relative path; `rootDir`
 * only gates *test discovery*, not what a discovered test may import.
 *
 * Mocks a minimal `PrismaClient`-shaped object (`planFeature.upsert`/
 * `planLimit.upsert`) — same convention as every other service spec in
 * this repo. Real-Postgres proof of row-count idempotency and real
 * `EntitlementService.resolve()` output lives in
 * `test/e2e/free-plan-catalogue.e2e-spec.ts`.
 */
describe('seedFreePlanCatalogue (Phase 6 W5 — Free plan catalogue)', () => {
  const PLAN_ID = 'plan-free-1';

  function makePrisma() {
    return {
      planFeature: { upsert: jest.fn().mockResolvedValue(undefined) },
      planLimit: { upsert: jest.fn().mockResolvedValue(undefined) },
    };
  }

  it('upserts exactly the 7 approved features with their approved enabled value', async () => {
    const prisma = makePrisma();

    const result = await seedFreePlanCatalogue(prisma as never, PLAN_ID);

    expect(prisma.planFeature.upsert).toHaveBeenCalledTimes(7);
    for (const [featureKey, enabled] of Object.entries(FREE_PLAN_FEATURES)) {
      expect(prisma.planFeature.upsert).toHaveBeenCalledWith({
        where: { planId_featureKey: { planId: PLAN_ID, featureKey } },
        update: { enabled },
        create: { planId: PLAN_ID, featureKey, enabled },
      });
    }
    expect(result.featuresWritten).toBe(7);
  });

  it('upserts exactly the 5 approved limits with their approved value and ratified period', async () => {
    const prisma = makePrisma();

    const result = await seedFreePlanCatalogue(prisma as never, PLAN_ID);

    expect(prisma.planLimit.upsert).toHaveBeenCalledTimes(5);
    for (const [limitKey, limitValue] of Object.entries(FREE_PLAN_LIMITS)) {
      const period =
        LIMIT_KEY_PERIODS[limitKey as keyof typeof LIMIT_KEY_PERIODS];
      expect(prisma.planLimit.upsert).toHaveBeenCalledWith({
        where: { planId_limitKey: { planId: PLAN_ID, limitKey } },
        update: { limitValue, period },
        create: { planId: PLAN_ID, limitKey, limitValue, period },
      });
    }
    expect(result.limitsWritten).toBe(5);
  });

  // ─── Exact approved values, named individually (per-key sign-off proof) ──

  it('coupons and team_members are enabled; every other feature is disabled', () => {
    expect(FREE_PLAN_FEATURES.coupons).toBe(true);
    expect(FREE_PLAN_FEATURES.team_members).toBe(true);
    expect(FREE_PLAN_FEATURES.custom_domain).toBe(false);
    expect(FREE_PLAN_FEATURES.custom_storefront).toBe(false);
    expect(FREE_PLAN_FEATURES.custom_branding).toBe(false);
    expect(FREE_PLAN_FEATURES.advanced_analytics).toBe(false);
    expect(FREE_PLAN_FEATURES.api_access).toBe(false);
  });

  it('products = 100, team_members = 2, orders_per_month = 100, storage_mb = 1024, custom_domains = 0', () => {
    expect(FREE_PLAN_LIMITS.products).toBe(100);
    expect(FREE_PLAN_LIMITS.team_members).toBe(2);
    expect(FREE_PLAN_LIMITS.orders_per_month).toBe(100);
    expect(FREE_PLAN_LIMITS.storage_mb).toBe(1024);
    expect(FREE_PLAN_LIMITS.custom_domains).toBe(0);
  });

  it('orders_per_month is BILLING_PERIOD; every other approved limit is PERSISTENT', () => {
    expect(LIMIT_KEY_PERIODS.orders_per_month).toBe('BILLING_PERIOD');
    expect(LIMIT_KEY_PERIODS.products).toBe('PERSISTENT');
    expect(LIMIT_KEY_PERIODS.team_members).toBe('PERSISTENT');
    expect(LIMIT_KEY_PERIODS.storage_mb).toBe('PERSISTENT');
    expect(LIMIT_KEY_PERIODS.custom_domains).toBe('PERSISTENT');
  });

  // ─── Idempotency: every write is an upsert, never a bare create ─────────

  it('is idempotent by construction: a second call issues the SAME 12 upsert calls again, never a create()/createMany() that could duplicate a row', async () => {
    const prisma = makePrisma();

    await seedFreePlanCatalogue(prisma as never, PLAN_ID);
    expect(prisma.planFeature.upsert).toHaveBeenCalledTimes(7);
    expect(prisma.planLimit.upsert).toHaveBeenCalledTimes(5);

    prisma.planFeature.upsert.mockClear();
    prisma.planLimit.upsert.mockClear();

    const second = await seedFreePlanCatalogue(prisma as never, PLAN_ID);

    // Same call shapes on the second run — each upsert is keyed on the
    // model's own (planId, featureKey)/(planId, limitKey) unique
    // constraint, so Prisma/Postgres itself can never duplicate a row
    // even under concurrent invocation; this proves the CALLER never
    // asks for anything but an upsert.
    expect(prisma.planFeature.upsert).toHaveBeenCalledTimes(7);
    expect(prisma.planLimit.upsert).toHaveBeenCalledTimes(5);
    expect(second).toEqual({ featuresWritten: 7, limitsWritten: 5 });
  });

  it('never writes a row for any plan other than the one passed in', async () => {
    const prisma = makePrisma();

    await seedFreePlanCatalogue(prisma as never, 'some-other-plan-id');

    const featureCalls = prisma.planFeature.upsert.mock.calls as {
      where: { planId_featureKey: { planId: string } };
    }[][];
    for (const [args] of featureCalls) {
      expect(args.where.planId_featureKey.planId).toBe('some-other-plan-id');
    }
    const limitCalls = prisma.planLimit.upsert.mock.calls as {
      where: { planId_limitKey: { planId: string } };
    }[][];
    for (const [args] of limitCalls) {
      expect(args.where.planId_limitKey.planId).toBe('some-other-plan-id');
    }
  });
});
