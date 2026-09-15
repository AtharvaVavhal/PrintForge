/**
 * Pure helper for resolving/validating the Phase 8 merchant-credential
 * encryption master key (docs/saas/DECISIONS.md P8-D6 Part B) — a single,
 * platform-wide, base64-encoded 32-byte AES-256 key held as one Render
 * environment secret (`PAYMENT_CREDENTIALS_MASTER_KEY`).
 *
 * `env.validation.ts` (production-only format check) and
 * `CredentialEncryptionService` (actual per-call key resolution) both call
 * this exact function, so the two can never disagree about what counts as a
 * valid key. There is no fallback/default value anywhere in this file —
 * missing or malformed input always throws, never silently substitutes a
 * hardcoded key (P8-D6 Part B/F: no dev/default key, ever).
 */
const MASTER_KEY_BYTES = 32; // AES-256
const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;

export class InvalidPaymentCredentialsMasterKeyError extends Error {}

export function resolvePaymentCredentialsMasterKey(
  raw: string | undefined,
): Buffer {
  const value = (raw ?? '').trim();
  if (value === '') {
    throw new InvalidPaymentCredentialsMasterKeyError(
      'PAYMENT_CREDENTIALS_MASTER_KEY is not configured',
    );
  }
  if (!BASE64_PATTERN.test(value)) {
    throw new InvalidPaymentCredentialsMasterKeyError(
      'PAYMENT_CREDENTIALS_MASTER_KEY must be base64-encoded',
    );
  }
  const key = Buffer.from(value, 'base64');
  if (key.length !== MASTER_KEY_BYTES) {
    throw new InvalidPaymentCredentialsMasterKeyError(
      `PAYMENT_CREDENTIALS_MASTER_KEY must decode to ${MASTER_KEY_BYTES} bytes for AES-256-GCM`,
    );
  }
  return key;
}
