import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import * as Sentry from '@sentry/node';
import { AuditService } from '../../common/audit/audit.service';
import { PrismaService } from '../../common/database/prisma.service';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import {
  DEFAULT_STOREFRONT_RESOLUTION_MODE,
  EffectiveStorefrontResolutionMode,
  isStorefrontResolutionMode,
  STOREFRONT_RESOLUTION_MODE_CACHE_TTL_MS,
  STOREFRONT_RESOLUTION_MODE_CHANGED_ACTION,
  STOREFRONT_RESOLUTION_MODE_KEY,
  StorefrontResolutionMode,
} from './storefront-resolution-mode.constants';
import { StorefrontResolutionModeUnavailableException } from './storefront-resolution-mode-unavailable.exception';

interface CachedRead {
  value: EffectiveStorefrontResolutionMode;
  expiresAt: number;
}

/**
 * Phase 9 W2 — the P9-D8 runtime kill-switch (spec §15), shipped BEFORE any
 * resolver behaviour changes (W3) so the rollback control exists first.
 *
 * READ PATH (`getMode`), exactly per spec §15 rows "Read path", "Failure
 * mode on read error", "Invalid stored value" (P9-S14):
 *
 *   - One `platform_config` read per TTL window (10 s) per process, not per
 *     request. A successful read — row absent (→ `legacy_single_store`,
 *     source `default`) or row holding a valid value (source `row`) — is
 *     cached for the TTL AND recorded as the "last-known valid" mode.
 *   - A FAILED read — the DB threw, or the row holds a value outside
 *     `STOREFRONT_RESOLUTION_MODES` — is handled FAIL-CLOSED: (1) error
 *     log, (2) Sentry, (3) treated as a failure, (4) the last-known valid
 *     mode is served if this process has ever seen one (source
 *     `last_known_valid`), (5) otherwise the request fails with 503
 *     (`StorefrontResolutionModeUnavailableException`), and (6) NEVER a
 *     silent fallback to `legacy_single_store`. The invalid value is never
 *     cached as valid. The failure itself is negatively cached for one TTL
 *     so a corrupt row costs one DB read + one Sentry event per window per
 *     process, not one per request.
 *
 * WRITE PATH (`setMode`), per spec §15 "Who may flip": callers are
 * `SUPER_ADMIN` only (the controller is `@PlatformOnly()`); the upsert and
 * the `PlatformAuditLog` row (`metadata: { from, to }`, justification
 * required) commit in ONE transaction — the same "audit inside the caller's
 * transaction or not at all" discipline `PlatformService.transitionTenant
 * Status` uses — then the in-process cache is busted so the flip is
 * observed by the next request in this process without a redeploy (other
 * instances observe it within one TTL — spec §15 "Multi-instance").
 *
 * `PlatformConfig` is platform-owned (no `tenantId`, not RLS-enabled, spec
 * §3.3) and is not in `tenant-data-access-guard.spec.ts`'s tenancy-model
 * list — the direct `prisma.platformConfig` delegate is the intended
 * access path, exactly like `plans`.
 *
 * Nothing in this service consumes the mode yet — W3 wires the resolver.
 */
@Injectable()
export class StorefrontResolutionModeService {
  private readonly logger = new Logger(StorefrontResolutionModeService.name);

  /** Fresh, successful read (absent-default or valid row), valid for one TTL. */
  private cached: CachedRead | null = null;
  /** Negative cache: a failed/invalid read, suppressed for one TTL. */
  private failureUntil: number | null = null;
  /** Last value ever observed valid in this process — never set from an invalid row. */
  private lastKnownValid: EffectiveStorefrontResolutionMode | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async getMode(): Promise<EffectiveStorefrontResolutionMode> {
    const now = Date.now();
    if (this.cached && this.cached.expiresAt > now) {
      return this.cached.value;
    }
    if (this.failureUntil !== null && this.failureUntil > now) {
      return this.serveDegraded();
    }

    let stored: { value: string } | null;
    try {
      stored = await this.prisma.platformConfig.findUnique({
        where: { key: STOREFRONT_RESOLUTION_MODE_KEY },
        select: { value: true },
      });
    } catch (err) {
      this.recordFailure('read_error', err);
      return this.serveDegraded();
    }

    if (stored === null) {
      return this.accept(
        { mode: DEFAULT_STOREFRONT_RESOLUTION_MODE, source: 'default' },
        now,
      );
    }
    if (isStorefrontResolutionMode(stored.value)) {
      return this.accept({ mode: stored.value, source: 'row' }, now);
    }
    this.recordFailure('invalid_value', undefined, stored.value);
    return this.serveDegraded();
  }

  /**
   * Spec §15 "Who may flip". `to` is validated by the DTO (400 on anything
   * outside the two modes) and re-checked here so no other caller can
   * write an invalid value through this path — the only way an invalid
   * value can reach the row is a direct database edit (spec §14.3).
   */
  async setMode(
    actor: AuthenticatedUser,
    to: StorefrontResolutionMode,
    justification: string,
    ip: string,
  ): Promise<EffectiveStorefrontResolutionMode> {
    if (!isStorefrontResolutionMode(to)) {
      throw new BadRequestException(
        'mode must be one of legacy_single_store, host_resolution',
      );
    }
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.platformConfig.findUnique({
        where: { key: STOREFRONT_RESOLUTION_MODE_KEY },
        select: { value: true },
      });
      await tx.platformConfig.upsert({
        where: { key: STOREFRONT_RESOLUTION_MODE_KEY },
        create: {
          key: STOREFRONT_RESOLUTION_MODE_KEY,
          value: to,
          updatedByUserId: actor.id,
        },
        update: { value: to, updatedByUserId: actor.id },
      });
      await this.auditService.logPlatformAction(tx, {
        actorUserId: actor.id,
        action: STOREFRONT_RESOLUTION_MODE_CHANGED_ACTION,
        targetType: 'PlatformConfig',
        targetId: STOREFRONT_RESOLUTION_MODE_KEY,
        justification,
        // `from` is the raw prior value (may be null when the row did not
        // exist, or an invalid string when an operator is repairing a
        // corrupt row) — recorded as-is for forensics.
        metadata: { from: existing?.value ?? null, to },
        ip,
      });
    });
    this.bust();
    return { mode: to, source: 'row' };
  }

  /**
   * Drop the fresh cache and any negative cache so the next `getMode()`
   * re-reads the row. `lastKnownValid` is deliberately retained — it is
   * the P9-S14 point-4 safety net, not a cache.
   */
  bust(): void {
    this.cached = null;
    this.failureUntil = null;
  }

  private accept(
    value: EffectiveStorefrontResolutionMode,
    now: number,
  ): EffectiveStorefrontResolutionMode {
    this.cached = {
      value,
      expiresAt: now + STOREFRONT_RESOLUTION_MODE_CACHE_TTL_MS,
    };
    this.failureUntil = null;
    this.lastKnownValid = value;
    return value;
  }

  private serveDegraded(): EffectiveStorefrontResolutionMode {
    if (this.lastKnownValid) {
      return { mode: this.lastKnownValid.mode, source: 'last_known_valid' };
    }
    throw new StorefrontResolutionModeUnavailableException();
  }

  private recordFailure(
    kind: 'read_error' | 'invalid_value',
    err?: unknown,
    rawValue?: string,
  ): void {
    this.cached = null;
    this.failureUntil = Date.now() + STOREFRONT_RESOLUTION_MODE_CACHE_TTL_MS;

    const fallback = this.lastKnownValid
      ? `serving last-known valid mode '${this.lastKnownValid.mode}'`
      : 'no last-known valid mode — requests will receive 503';
    const detail =
      kind === 'invalid_value'
        ? `row holds invalid value ${JSON.stringify(rawValue ?? '')}`
        : `read failed: ${err instanceof Error ? err.message : String(err)}`;
    this.logger.error(
      `platform_config '${STOREFRONT_RESOLUTION_MODE_KEY}' ${detail}; ${fallback} (P9-S14 fail-closed)`,
    );

    // P9-S14 point 2 / S-13. A no-op when SENTRY_DSN is unset (main.ts
    // guards Sentry.init), exactly like every other Sentry call in src/.
    Sentry.captureMessage(
      'Storefront domain-resolution mode unavailable (P9-S14 fail-closed)',
      {
        level: 'error',
        tags: { kind, key: STOREFRONT_RESOLUTION_MODE_KEY },
        extra: {
          rawValue: kind === 'invalid_value' ? (rawValue ?? '') : undefined,
          readError:
            kind === 'read_error' && err instanceof Error
              ? err.message
              : undefined,
          lastKnownValidMode: this.lastKnownValid?.mode ?? null,
        },
      },
    );
  }
}
