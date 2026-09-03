/**
 * Shared format rules + normalizers for the India-focused checkout address
 * fields (Phase: Checkout Contact & PIN Validation).
 *
 * These live in `common/` — not `checkout/` — deliberately: the current
 * default market is India, but nothing here is baked into the domain model
 * (Order.shippingPhone / .shippingPostalCode / .shippingCountry stay plain
 * strings). A future country-aware layer would add a `country` parameter
 * here and dispatch on it; callers already pass the value through a single
 * normalize function rather than inlining a regex.
 *
 * Mirrored on the frontend by src/utils/phone.ts and the postal regex in
 * src/schemas/checkout.schema.ts — same "UX convenience, server is the
 * source of truth" split the auth password policy already uses. Keep them
 * in sync.
 */

/** Exactly six digits. Format only — says nothing about whether the PIN
 * actually exists (that is the postal-lookup provider's job). */
export const PIN_CODE_REGEX = /^\d{6}$/;

/** Canonical stored/submitted mobile form: E.164 India, `+91` + a 10-digit
 * subscriber number that starts 6-9 (the only valid Indian mobile
 * prefixes). */
export const INDIAN_MOBILE_E164_REGEX = /^\+91[6-9]\d{9}$/;

/**
 * Collapses the accepted input shapes onto one canonical E.164 value:
 *
 *   9876543210        -> +919876543210
 *   +919876543210     -> +919876543210
 *   +91 9876543210    -> +919876543210
 *   091-98765 43210   -> +919876543210
 *
 * Returns `null` for anything that is not a recognisable Indian mobile
 * number, so a caller can turn that into a validation error with a clear
 * message rather than storing a malformed value.
 */
export function normalizeIndianMobile(raw: string): string | null {
  if (typeof raw !== 'string') {
    return null;
  }
  // Drop everything a human might type as a separator.
  const compact = raw.replace(/[\s\-().]/g, '');
  if (compact === '') {
    return null;
  }

  let digits: string;
  if (compact.startsWith('+91')) {
    digits = compact.slice(3);
  } else if (compact.startsWith('91') && compact.length === 12) {
    digits = compact.slice(2);
  } else if (compact.startsWith('0') && compact.length === 11) {
    digits = compact.slice(1);
  } else {
    digits = compact;
  }

  if (!/^[6-9]\d{9}$/.test(digits)) {
    return null;
  }
  return `+91${digits}`;
}

/** True when `raw` can be normalised to a valid Indian mobile number. */
export function isNormalizableIndianMobile(raw: string): boolean {
  return normalizeIndianMobile(raw) !== null;
}
