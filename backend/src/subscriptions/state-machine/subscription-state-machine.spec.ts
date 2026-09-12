import { ConflictException } from '@nestjs/common';
import { SubscriptionStatus } from '@prisma/client';
import {
  assertSubscriptionTransitionAllowed,
  isSubscriptionTransitionAllowed,
  SUBSCRIPTION_STATE_TRANSITIONS,
} from './subscription-state-machine';

const ALL_STATUSES: SubscriptionStatus[] = [
  'PENDING',
  'TRIALING',
  'ACTIVE',
  'PAST_DUE',
  'PAUSED',
  'CANCELLED',
  'EXPIRED',
];

/** Every edge the ratification gate's own Step 5 explicitly lists as
 * "at minimum" (P7-D1), PLUS `ACTIVE -> CANCELLED` (P7-D2 Part B's
 * ratified amendment, Phase 7 Stage 2) — the single source of truth this
 * spec verifies against. */
const RATIFIED_ALLOWED_EDGES: [SubscriptionStatus, SubscriptionStatus][] = [
  ['PENDING', 'TRIALING'],
  ['PENDING', 'ACTIVE'],
  ['TRIALING', 'ACTIVE'],
  ['TRIALING', 'PAST_DUE'],
  ['ACTIVE', 'ACTIVE'],
  ['ACTIVE', 'PAST_DUE'],
  ['ACTIVE', 'CANCELLED'],
  ['PAST_DUE', 'ACTIVE'],
  ['PAST_DUE', 'PAUSED'],
  ['PAST_DUE', 'CANCELLED'],
  ['PAUSED', 'ACTIVE'],
  ['PAUSED', 'CANCELLED'],
  ['PAUSED', 'EXPIRED'],
  ['CANCELLED', 'ACTIVE'],
  ['CANCELLED', 'EXPIRED'],
];

describe('SUBSCRIPTION_STATE_TRANSITIONS / isSubscriptionTransitionAllowed (Phase 7 Stage 1, P7-D1)', () => {
  it.each(RATIFIED_ALLOWED_EDGES)('allows %s -> %s (ratified)', (from, to) => {
    expect(isSubscriptionTransitionAllowed(from, to)).toBe(true);
  });

  it('allows EXACTLY the ratified edges — no more, no less', () => {
    const actualEdges: [SubscriptionStatus, SubscriptionStatus][] = [];
    for (const from of ALL_STATUSES) {
      for (const to of ALL_STATUSES) {
        if (isSubscriptionTransitionAllowed(from, to)) {
          actualEdges.push([from, to]);
        }
      }
    }
    const sortKey = (e: [string, string]) => `${e[0]}->${e[1]}`;
    expect(
      actualEdges.sort((a, b) => sortKey(a).localeCompare(sortKey(b))),
    ).toEqual(
      [...RATIFIED_ALLOWED_EDGES].sort((a, b) =>
        sortKey(a).localeCompare(sortKey(b)),
      ),
    );
  });

  // The exact edges Step 4 asks to be individually investigated —
  // TRIALING -> ACTIVE / PAST_DUE, ACTIVE -> PAST_DUE, PAST_DUE ->
  // ACTIVE/PAUSED, PAUSED -> ACTIVE — are all already covered one-by-one
  // by the `RATIFIED_ALLOWED_EDGES` parameterization above; the exhaustive
  // "no more, no less" test below additionally proves nothing beyond that
  // exact set is reachable from any of them.

  it('rejects every transition out of EXPIRED (terminal)', () => {
    for (const to of ALL_STATUSES) {
      expect(isSubscriptionTransitionAllowed('EXPIRED', to)).toBe(false);
    }
    expect(SUBSCRIPTION_STATE_TRANSITIONS.EXPIRED).toEqual([]);
  });

  it('rejects transitions never listed for a given source (e.g. PENDING -> PAST_DUE, ACTIVE -> EXPIRED, TRIALING -> CANCELLED)', () => {
    expect(isSubscriptionTransitionAllowed('PENDING', 'PAST_DUE')).toBe(false);
    expect(isSubscriptionTransitionAllowed('ACTIVE', 'EXPIRED')).toBe(false);
    expect(isSubscriptionTransitionAllowed('TRIALING', 'CANCELLED')).toBe(
      false,
    );
    expect(isSubscriptionTransitionAllowed('CANCELLED', 'PAUSED')).toBe(false);
  });

  // ACTIVE -> CANCELLED moved from "rejected" to "ratified" in Phase 7
  // Stage 2 (P7-D2 Part B) — see the RATIFIED_ALLOWED_EDGES
  // parameterization above, which now covers it explicitly.

  it('rejects a same-state transition for a status with no self-loop (e.g. PENDING -> PENDING)', () => {
    expect(isSubscriptionTransitionAllowed('PENDING', 'PENDING')).toBe(false);
  });
});

describe('assertSubscriptionTransitionAllowed', () => {
  it('does not throw for a ratified edge', () => {
    expect(() =>
      assertSubscriptionTransitionAllowed('PENDING', 'ACTIVE'),
    ).not.toThrow();
  });

  it('throws ConflictException (409) for an illegal edge', () => {
    expect(() =>
      assertSubscriptionTransitionAllowed('EXPIRED', 'ACTIVE'),
    ).toThrow(ConflictException);
    expect(() =>
      // TRIALING -> CANCELLED remains illegal even after P7-D2 Part B
      // (which ratified only ACTIVE -> CANCELLED, no other new edge).
      assertSubscriptionTransitionAllowed('TRIALING', 'CANCELLED'),
    ).toThrow('Illegal subscription transition: TRIALING -> CANCELLED');
  });

  it('does not throw for the P7-D2 Part B amendment edge (ACTIVE -> CANCELLED)', () => {
    expect(() =>
      assertSubscriptionTransitionAllowed('ACTIVE', 'CANCELLED'),
    ).not.toThrow();
  });
});
