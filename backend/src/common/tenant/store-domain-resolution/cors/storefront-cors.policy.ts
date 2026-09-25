import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DomainVerificationStatus,
  StoreDomainType,
  TlsStatus,
} from '@prisma/client';
import { StorefrontResolutionModeService } from '../../../../platform/platform-config/storefront-resolution-mode.service';
import type { AppConfig } from '../../../config/configuration';
import { parseStorefrontOrigin } from '../host-normalisation';
import { StoreDomainResolver } from '../store-domain-resolver.service';

/**
 * Why an origin was or was not admitted. Machine codes, stable, no host
 * echoed back — they are the body of the `@PlatformOnly()` dry-run route and
 * a server-log field, never anything a browser sees (live CORS communicates
 * a denial only by the ABSENCE of `Access-Control-Allow-Origin`).
 */
export type CorsDecisionReason =
  // allowed
  | 'no_origin'
  | 'platform_admin_origin'
  | 'platform_subdomain'
  | 'custom_domain_served'
  // denied
  | 'legacy_mode_only_frontend_url'
  | 'malformed_origin'
  | 'port_not_allowed_in_production'
  | 'platform_subdomain_too_deep'
  | 'unknown_host'
  | 'custom_domain_not_served'
  | 'mode_unavailable';

export interface CorsDecision {
  allowed: boolean;
  reason: CorsDecisionReason;
}

const ORIGIN_WITH_PORT = /^https?:\/\/[^/?#]*:\d{1,5}$/i;

/**
 * Phase 9 W7 — the CORS origin predicate (spec §9; ⚖️ S-9 mode-coupled).
 *
 * Replaces `main.ts`'s single static origin string. The allow-list is:
 *
 *   | `FRONTEND_URL` (platform admin origin)        | always              |
 *   | `<one-label>.{PLATFORM_STOREFRONT_DOMAIN}`    | always (always-on)  |
 *   | any other host                                | only a `StoreDomain`
 *   |                                               | row `type=CUSTOM`,
 *   |                                               | `VERIFIED` + `ISSUED`|
 *
 * ⚖️ **S-9 MODE COUPLING.** In `legacy_single_store` mode this admits ONLY the
 * `FRONTEND_URL` origin — byte-identical to pre-Phase-9 behaviour — and the
 * two dynamic rows above are not consulted at all. The dynamic allow-list
 * activates only in `host_resolution`, in the same TTL window as the resolver
 * flip. That coupling is the point: with the allow-list live while the
 * resolver was still in legacy mode, a request from
 * `x.stores.printforge.world` would be CORS-admitted and then answered by the
 * legacy resolver with Tenant #1's data — the §15 KEY RISKS *domain
 * misrouting* (Critical), manufactured for a testability benefit.
 *
 * **CORS IS NOT AUTHORIZATION.** This predicate decides only whether a
 * BROWSER may read a response. It grants nothing: `JwtAuthGuard`,
 * `TenantContextGuard`, `PermissionsGuard` and `PlatformGuard` are untouched
 * by it, an admitted `Origin` confers no tenant and no permission, and the
 * resolver still applies the full ordered §4.1.2 trust checks to the same
 * value (§4.1.4 — a forged `Origin` is not a boundary violation because it is
 * never a boundary). Conversely a DENIED origin is not a security control
 * either: a non-browser client can always omit `Origin`, which is exactly why
 * the serving gate — not this predicate — is what protects store data.
 *
 * NEVER returns `*` and never reflects an arbitrary origin: the `cors`
 * package echoes the request origin only when this predicate returns true,
 * and always adds `Vary: Origin`.
 */
@Injectable()
export class StorefrontCorsPolicy {
  private readonly logger = new Logger(StorefrontCorsPolicy.name);
  private readonly frontendOrigin: string;
  private readonly platformStorefrontDomain: string | null;
  private readonly allowLoopback: boolean;
  private readonly requireHttps: boolean;

  constructor(
    private readonly modeService: StorefrontResolutionModeService,
    private readonly resolver: StoreDomainResolver,
    configService: ConfigService<AppConfig, true>,
  ) {
    this.frontendOrigin = normaliseOrigin(
      configService.get('frontendUrl', { infer: true }),
    );
    this.platformStorefrontDomain = configService.get('storefrontDomains', {
      infer: true,
    }).platformStorefrontDomain;
    // Same environment policy as `StoreContextService` — one definition of
    // "is this a production-grade origin", not two.
    const env = configService.get('nodeEnv', { infer: true });
    const nonProduction = env === 'test' || env === 'development';
    this.allowLoopback = nonProduction;
    this.requireHttps = !nonProduction;
  }

  /**
   * The LIVE predicate `main.ts` installs. Mode-coupled (S-9).
   *
   * A mode that cannot be read fails to the NARROWEST allow-list — the
   * platform admin origin only — rather than to a guessed mode (S-13/P9-S14:
   * never silently pick a mode). Denying even the admin origin would lock an
   * operator out of the console they need in order to fix the flag, so that
   * one always-allowed entry is deliberate and is not mode-dependent anyway.
   */
  async evaluate(origin: string | undefined): Promise<CorsDecision> {
    const early = this.evaluateOriginIndependentOfMode(origin);
    if (early) {
      return early;
    }

    let mode: string;
    try {
      mode = (await this.modeService.getMode()).mode;
    } catch (err) {
      this.logger.error(
        `storefront resolution mode is unreadable — CORS is admitting only the platform admin origin until it is fixed: ${
          err instanceof Error ? err.message : 'unknown error'
        }`,
      );
      return { allowed: false, reason: 'mode_unavailable' };
    }

    if (mode !== 'host_resolution') {
      return { allowed: false, reason: 'legacy_mode_only_frontend_url' };
    }
    return this.evaluateStorefrontOrigin(origin);
  }

  /**
   * The FULL `host_resolution` verdict regardless of the mode in force —
   * spec §9 "Pre-flip verification without opening CORS" / §14.4. Read-only:
   * it changes no state and emits no CORS header, so W8 step 5 can verify the
   * allow-list in production while live CORS is still legacy-restricted.
   */
  async evaluateAsHostResolution(
    origin: string | undefined,
  ): Promise<CorsDecision> {
    return (
      this.evaluateOriginIndependentOfMode(origin) ??
      this.evaluateStorefrontOrigin(origin)
    );
  }

  /** The two verdicts that hold in BOTH modes; `null` = keep evaluating. */
  private evaluateOriginIndependentOfMode(
    origin: string | undefined,
  ): CorsDecision | null {
    if (origin === undefined || origin === null || origin === '') {
      // Not a cross-origin browser request at all — there is nothing for
      // CORS to permit or forbid. Never treated as an allow-list entry.
      return { allowed: true, reason: 'no_origin' };
    }
    if (normaliseOrigin(origin) === this.frontendOrigin) {
      return { allowed: true, reason: 'platform_admin_origin' };
    }
    return null;
  }

  private async evaluateStorefrontOrigin(
    origin: string | undefined,
  ): Promise<CorsDecision> {
    // Same parse as the storefront-host signal (§4.1.2 step 1, §9 "one
    // validation, two consumers"): rejects a missing/`null`/malformed value,
    // a non-http(s) scheme, and http where https is required.
    const parsed = parseStorefrontOrigin(origin, {
      allowLoopback: this.allowLoopback,
      requireHttps: this.requireHttps,
    });
    if (parsed === null) {
      return { allowed: false, reason: 'malformed_origin' };
    }
    // §9: "port is matched only in non-production". `parseStorefrontOrigin`
    // accepts and discards a port, which is right for a dev origin like
    // `http://localhost:5173` but would otherwise let
    // `https://shop.example:8443` inherit `shop.example`'s admission in
    // production. Fail closed there.
    if (
      this.requireHttps &&
      origin !== undefined &&
      ORIGIN_WITH_PORT.test(origin)
    ) {
      return { allowed: false, reason: 'port_not_allowed_in_production' };
    }

    const platformVerdict = this.evaluatePlatformSubdomain(parsed.host);
    if (platformVerdict) {
      return platformVerdict;
    }

    // The SAME cached row the resolver serves from (§4.6) — no second
    // lookup, no second source of truth, and a revoke/TLS change is
    // reflected here within the same TTL (bust-on-write).
    const row = await this.resolver.lookupCachedRow(parsed.host);
    if (row === null) {
      return { allowed: false, reason: 'unknown_host' };
    }
    // `type IS NULL` reads as CUSTOM — fail-closed (spec §3.2).
    if (
      (row.type ?? StoreDomainType.CUSTOM) ===
      StoreDomainType.PLATFORM_SUBDOMAIN
    ) {
      return { allowed: true, reason: 'platform_subdomain' };
    }
    const served =
      row.verificationStatus === DomainVerificationStatus.VERIFIED &&
      (row.tlsStatus ?? TlsStatus.PENDING) === TlsStatus.ISSUED;
    return served
      ? { allowed: true, reason: 'custom_domain_served' }
      : { allowed: false, reason: 'custom_domain_not_served' };
  }

  /**
   * `<label>.{PLATFORM_STOREFRONT_DOMAIN}`, EXACTLY one label deep (§9), with
   * no database read: platform subdomains are always-on, and the wildcard
   * certificate covers exactly one level — `a.b.stores.<platform>` is not a
   * store host and is denied. The apex itself is not a store host either, so
   * it falls through to the `StoreDomain` lookup (where it is `unknown_host`
   * unless a row genuinely exists for it).
   */
  private evaluatePlatformSubdomain(host: string): CorsDecision | null {
    if (this.platformStorefrontDomain === null) {
      return null;
    }
    const suffix = `.${this.platformStorefrontDomain}`;
    if (!host.endsWith(suffix)) {
      return null;
    }
    const label = host.slice(0, -suffix.length);
    if (label.length === 0) {
      return null;
    }
    return label.includes('.')
      ? { allowed: false, reason: 'platform_subdomain_too_deep' }
      : { allowed: true, reason: 'platform_subdomain' };
  }
}

/** Lower-cased, trailing slash stripped — the one comparable origin form. */
function normaliseOrigin(origin: string): string {
  return origin.trim().toLowerCase().replace(/\/+$/, '');
}
