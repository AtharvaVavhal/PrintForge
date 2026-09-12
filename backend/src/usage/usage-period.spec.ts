import {
  deriveBillingPeriodIdentifier,
  PERSISTENT_PERIOD,
} from './usage-period';

/**
 * Phase 7 Stage 1 (docs/saas/DECISIONS.md P7-D1, Part E). Proves the
 * canonical `orders_per_month` `Usage.period` stamp: the ISO-8601
 * timestamp of a provider-confirmed `Subscription.currentPeriodStart` —
 * never calendar/timezone/`createdAt`-derived. This does NOT wire
 * `orders_per_month` enforcement itself (out of Stage 1 scope) — it only
 * proves the stamp-generation function P7-D1 ratifies.
 */
describe('deriveBillingPeriodIdentifier (Phase 7 Stage 1 — orders_per_month stamp)', () => {
  it('returns the exact ISO-8601 string of the given currentPeriodStart', () => {
    const start = new Date('2026-03-01T00:00:00.000Z');

    expect(deriveBillingPeriodIdentifier(start)).toBe(
      '2026-03-01T00:00:00.000Z',
    );
  });

  it('two different confirmed period starts produce two different identifiers', () => {
    const a = deriveBillingPeriodIdentifier(
      new Date('2026-03-01T00:00:00.000Z'),
    );
    const b = deriveBillingPeriodIdentifier(
      new Date('2026-04-01T00:00:00.000Z'),
    );

    expect(a).not.toBe(b);
  });

  it('the SAME confirmed period start always produces the SAME identifier (stable, re-derivable for historical rows)', () => {
    const start = new Date('2026-03-01T12:34:56.789Z');

    expect(deriveBillingPeriodIdentifier(start)).toBe(
      deriveBillingPeriodIdentifier(new Date(start.getTime())),
    );
  });

  it('never equals the fixed PERSISTENT sentinel — the two period concepts remain distinct', () => {
    const stamp = deriveBillingPeriodIdentifier(
      new Date('2026-03-01T00:00:00.000Z'),
    );

    expect(stamp).not.toBe(PERSISTENT_PERIOD);
  });
});
