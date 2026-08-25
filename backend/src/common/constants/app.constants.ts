/**
 * Cross-module constants. Values that are genuinely per-environment config
 * belong in common/config, not here.
 */
export const API_PREFIX = 'api/v1';

export const IDEMPOTENCY_KEY_HEADER = 'Idempotency-Key';

export const REFRESH_TOKEN_COOKIE_NAME = 'pf_refresh_token';
export const REFRESH_TOKEN_COOKIE_PATH = '/api/v1/auth/refresh';

/** TODO(auth): finalize progressive login-delay curve constants — see BLUEPRINT-v1.2.md §23/§37. */
export const LOGIN_DELAY_CURVE_MS: readonly number[] = [
  0, 0, 0, 1000, 4000, 10000,
];

export const UPLOAD_MAX_BYTES = 10 * 1024 * 1024; // 10MB — stream-limited, see §22
export const UPLOAD_ALLOWED_MIME_TYPES: readonly string[] = [
  'image/png',
  'image/jpeg',
  'application/pdf',
];
