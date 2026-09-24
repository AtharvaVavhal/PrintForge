import { ServiceUnavailableException } from '@nestjs/common';

/**
 * Phase 9 W2 — the fail-closed outcome of P9-S14 / S-13 (spec §15 "Failure
 * mode on read error" and "Invalid stored value"): the storefront domain-
 * resolution mode could not be read (DB error) or holds a value outside
 * `STOREFRONT_RESOLUTION_MODES`, AND no last-known valid mode exists in
 * this process to serve instead. The request fails with HTTP 503 rather
 * than guessing a mode — `legacy_single_store` is NEVER selected
 * implicitly on error (P9-S14 point 6).
 *
 * Rendered by `HttpExceptionFilter` in the frozen envelope
 * `{ success: false, error: { code: 'SERVICE_UNAVAILABLE', message } }`.
 */
export class StorefrontResolutionModeUnavailableException extends ServiceUnavailableException {
  constructor() {
    super(
      'Storefront domain-resolution mode is unavailable — the platform configuration is invalid or unreadable and no last-known valid mode exists',
    );
  }
}
