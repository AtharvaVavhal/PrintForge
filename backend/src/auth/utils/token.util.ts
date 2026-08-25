import { createHash, createHmac, randomBytes } from 'crypto';

/**
 * Refresh tokens and password-reset tokens are opaque, high-entropy random
 * strings — not JWTs. The DB never stores the raw value, only a
 * deterministic hash, so a lookup-by-presented-token is a plain indexed
 * equality query (§15 `refresh_tokens.tokenHash` / `users.passwordResetTokenHash`).
 */
export function generateOpaqueToken(): string {
  return randomBytes(64).toString('hex');
}

/**
 * Refresh tokens are keyed (HMAC) with REFRESH_TOKEN_SECRET rather than a
 * bare SHA-256 digest — a deliberate, low-cost defense-in-depth choice: a
 * plain hash of a 512-bit random value is already infeasible to reverse,
 * but keying it means a `refresh_tokens` row leak alone (e.g. a read-only
 * DB dump) is insufficient to forge a valid tokenHash for replay without
 * also having the app secret.
 */
export function hashRefreshToken(rawToken: string, secret: string): string {
  return createHmac('sha256', secret).update(rawToken).digest('hex');
}

/**
 * Password-reset tokens are single-use and short-lived (30 min, §23) —
 * a plain unkeyed SHA-256 digest of a 256-bit random value is standard
 * practice here and needs no additional secret.
 */
export function hashResetToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}
