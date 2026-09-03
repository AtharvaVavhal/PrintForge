/**
 * Indian mobile-number normalisation for the checkout contact field.
 *
 * Mirrors backend/src/common/validation/indian-address.util.ts exactly
 * (same accepted shapes, same canonical output) — a UX convenience so the
 * form shows the same verdict the server will. The server re-normalises
 * and re-validates independently and is the source of truth. Keep the two
 * in sync.
 *
 * The current default market is India; this is intentionally a single
 * function callers route through (rather than an inline regex) so a future
 * country-aware layer only has to change here.
 */

/** Canonical stored/submitted form: E.164 India — `+91` + a 10-digit
 * subscriber number starting 6-9. */
export const INDIAN_MOBILE_E164_REGEX = /^\+91[6-9]\d{9}$/

/**
 * Collapses the accepted input shapes onto one canonical E.164 value:
 *
 *   9876543210      -> +919876543210
 *   +919876543210   -> +919876543210
 *   +91 9876543210  -> +919876543210
 *   098765-43210    -> +919876543210
 *
 * Returns `null` for anything that is not a recognisable Indian mobile
 * number.
 */
export function normalizeIndianMobile(raw: string): string | null {
  if (typeof raw !== 'string') return null
  const compact = raw.replace(/[\s\-().]/g, '')
  if (compact === '') return null

  let digits: string
  if (compact.startsWith('+91')) {
    digits = compact.slice(3)
  } else if (compact.startsWith('91') && compact.length === 12) {
    digits = compact.slice(2)
  } else if (compact.startsWith('0') && compact.length === 11) {
    digits = compact.slice(1)
  } else {
    digits = compact
  }

  return /^[6-9]\d{9}$/.test(digits) ? `+91${digits}` : null
}

/** True when `raw` can be normalised to a valid Indian mobile number. */
export function isNormalizableIndianMobile(raw: string): boolean {
  return normalizeIndianMobile(raw) !== null
}
