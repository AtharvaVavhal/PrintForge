/**
 * Phase 6 W3 — `UsageService`'s public contract. Never HTTP-flavored (no
 * status code, no "upgrade required" message) — W5 owns turning a
 * `LIMIT_EXCEEDED` outcome into whatever application-level response makes
 * sense for the resource being gated.
 */
export interface UsageReadResult {
  count: number;
}

/**
 * `reserve()`'s result. A `LIMIT_EXCEEDED` outcome is a normal, expected,
 * non-exceptional business result (the reservation legitimately did not
 * happen) — never thrown. Invalid CALLER INPUT (a negative/non-integer
 * amount, an unrecognized limit key, an invalid limit, an empty period) is
 * a distinct, exceptional, thrown-error class of problem — see
 * `InvalidUsageAmountError`/`InvalidUsageLimitError`/`InvalidUsagePeriodError`
 * below.
 */
export type ReservationOutcome =
  | { status: 'RESERVED'; count: number }
  | { status: 'LIMIT_EXCEEDED'; count: number; limit: number };

/** Thrown for a negative or non-integer `amount` passed to `reserve()`/
 * `decrement()` — caller misuse, never a normal business outcome. */
export class InvalidUsageAmountError extends Error {
  constructor(amount: number) {
    super(`Invalid usage amount: ${amount} (must be a non-negative integer)`);
    this.name = 'InvalidUsageAmountError';
  }
}

/** Thrown for a `limit` that is neither `null` (unlimited) nor a
 * non-negative integer, passed to `reserve()`. */
export class InvalidUsageLimitError extends Error {
  constructor(limit: unknown) {
    super(
      `Invalid usage limit: ${String(limit)} (must be null or a non-negative integer)`,
    );
    this.name = 'InvalidUsageLimitError';
  }
}

/** Thrown for an empty/non-string `period`. */
export class InvalidUsagePeriodError extends Error {
  constructor(period: unknown) {
    super(
      `Invalid usage period: ${String(period)} (must be a non-empty string)`,
    );
    this.name = 'InvalidUsagePeriodError';
  }
}

/** Thrown for a `limitKey` outside the ratified catalogue
 * (`platform-plans/catalogue.constants.ts#LIMIT_KEYS`). */
export class InvalidUsageLimitKeyError extends Error {
  constructor(limitKey: string) {
    super(`Invalid usage limit key: "${limitKey}"`);
    this.name = 'InvalidUsageLimitKeyError';
  }
}
