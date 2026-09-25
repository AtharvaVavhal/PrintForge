import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StorefrontResolutionModeService } from '../../../platform/platform-config/storefront-resolution-mode.service';
import type { AppConfig } from '../../config/configuration';
import { PrismaService } from '../../database/prisma.service';
import { resolvePrimaryStoreId } from '../primary-store';
import { StorefrontTenantResolver } from '../storefront-tenant.resolver';
import type { TenantContext } from '../tenant-context';
import { normaliseHost, parseStorefrontOrigin } from './host-normalisation';
import { RequestWithStoreContext, StoreContext } from './store-context';
import { StoreDomainResolver } from './store-domain-resolver.service';
import { StoreNotFoundException } from './store-resolution.exceptions';

/**
 * The request shape the storefront consumers hand in: Express's `hostname`
 * (used ONLY by the legacy strategy), the raw `Origin` header (the
 * `host_resolution` signal, §4.1), the merchant `tenantContext` (read by
 * `resolveActiveTenantId` only — never written here) and the memoised
 * `storeContext`.
 */
/**
 * Phase 9 W4 — the tenant/store a public catalog read is scoped to in
 * `host_resolution` mode. `tenantId` is the scoping column (NOT NULL on
 * every catalog table since Phase 4 W7; one primary store per tenant in
 * v1 — D11). `storeId` is carried for consumers that already filter by it.
 */
export interface PublicReadScope {
  tenantId: string;
  storeId: string | null;
}

export interface StorefrontRequest extends RequestWithStoreContext {
  hostname?: string;
  headers: {
    origin?: string | string[];
    /** §12.2 / S-12 fallback signal for the two crawler routes only. */
    'x-forwarded-host'?: string | string[];
  };
  tenantContext?: TenantContext;
}

/**
 * Phase 9 W3 — the façade every storefront consumer calls (spec §4.4):
 * `cart`, `uploads`, `app-setting` (and, from W4, the public catalog reads
 * and `GET /storefront/context`). It is invoked LAZILY at exactly the call
 * sites that invoked `StorefrontTenantResolver` before W3 (§4.4 "the exact
 * hook point mirrors where StorefrontTenantResolver is called today"),
 * memoising the result on `request.storeContext` — deliberately NOT a
 * global guard, which in `host_resolution` mode would 404 every
 * `@Public()` route that has no storefront scope (health, auth, webhooks;
 * §4.1.3 says those are unaffected). Runs after `JwtAuthGuard` by
 * construction (it is called from route handlers) and never sets,
 * overrides or consults `request.tenantContext` for resolution (§4.4
 * binding rule) — the only read of `tenantContext` is the merchant-
 * preference shortcut in `resolveActiveTenantId`, unchanged from before.
 *
 * Mode selection is the W2 kill-switch (P9-D8, spec §15), read per request
 * through its own 10 s cache; its fail-closed semantics (P9-S14) are NOT
 * duplicated or altered here — an unreadable/invalid mode surfaces as the
 * 503 the mode service throws.
 *
 *   legacy_single_store  → §4.5: the pre-Phase-9 `StorefrontTenantResolver`
 *                          verbatim (host lookup, else most-recent tenant),
 *                          then that tenant's primary Store via
 *                          `resolvePrimaryStoreId`. No 404/503/301 outcomes
 *                          of the new pipeline are produced in this mode.
 *   host_resolution      → §4.1.2 steps 1–2 here (Origin syntax; scheme
 *                          policy), then `StoreDomainResolver` for steps
 *                          3–5. Absent / `null` / malformed `Origin` → 404
 *                          generic (§4.1.3). NO fallback: never the
 *                          most-recent tenant, never Tenant #1.
 *
 * `Host` is never consulted in `host_resolution` mode: for a cross-origin
 * API call it is the API host, not the store (S-1, §4.1).
 */
@Injectable()
export class StoreContextService {
  private readonly allowLoopback: boolean;
  private readonly requireHttps: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly modeService: StorefrontResolutionModeService,
    private readonly domainResolver: StoreDomainResolver,
    private readonly legacyResolver: StorefrontTenantResolver,
    configService: ConfigService<AppConfig, true>,
  ) {
    const env = configService.get('nodeEnv', { infer: true });
    const nonProduction = env === 'test' || env === 'development';
    this.allowLoopback = nonProduction;
    this.requireHttps = !nonProduction;
  }

  /** Resolve (once per request) the storefront scope; throws per §4.3. */
  async resolve(request: StorefrontRequest): Promise<StoreContext> {
    if (request.storeContext) {
      return request.storeContext;
    }
    const { mode } = await this.modeService.getMode();
    const context =
      mode === 'host_resolution'
        ? await this.resolveByOrigin(request)
        : await this.resolveLegacy(request);
    request.storeContext = context;
    return context;
  }

  /**
   * Drop-in replacement for `StorefrontTenantResolver.resolveActiveTenantId`
   * at the three pre-W3 call sites: a caller that already carries a
   * merchant `tenantContext` (set by `TenantContextGuard` from a
   * `TenantMembership`, D6) keeps using it — the same preference those
   * controllers have always had — and a plain shopper is resolved through
   * `resolve()`.
   */
  async resolveActiveTenantId(request: StorefrontRequest): Promise<string> {
    if (request.tenantContext) {
      return request.tenantContext.tenantId;
    }
    return (await this.resolve(request)).tenantId;
  }

  /**
   * Phase 9 W4 — the scope for `@Public()` catalog reads (`GET /products`,
   * `GET /products/:slug`, `GET /categories*`, `GET /products/:id/reviews`).
   * Spec §2 W4 exit gate: "public catalog/settings reads scoped by resolved
   * store in `host_resolution` mode" — so in `legacy_single_store` mode
   * these reads stay exactly as they were before Phase 9 (unscoped, and
   * the legacy resolver is NOT invoked for them: a public catalog read must
   * not acquire the lifecycle/no-tenant failure modes of the storefront
   * write path). In `host_resolution` mode the full §4.3 pipeline runs and
   * its 404/503 outcomes apply. Returns `undefined` = unscoped (legacy).
   */
  async resolvePublicScope(
    request: StorefrontRequest,
  ): Promise<PublicReadScope | undefined> {
    const { mode } = await this.modeService.getMode();
    if (mode !== 'host_resolution') {
      return undefined;
    }
    const context = await this.resolve(request);
    return { tenantId: context.tenantId, storeId: context.storeId };
  }

  /**
   * Phase 9 §12.1 — the storefront scope for the two crawler routes
   * (`/storefront/seo/robots.txt`, `/storefront/seo/sitemap.xml`).
   *
   * Those routes are reached through a Vercel edge rewrite that carries the
   * matched storefront host as a query parameter (§12.2), because a crawler's
   * request has no `Origin` header at all — so for them, and only for them,
   * the signal order is: edge-captured host, else `x-forwarded-host`, else
   * `Origin`, else unresolved.
   *
   * 🔎 **S-12 contingency, implemented.** The `x-forwarded-host` step is the
   * documented fallback for the case where Vercel's host-capture rewrite
   * syntax is unavailable: a rewrite without capture still arrives with the
   * originally-requested host in that header. It is trusted exactly as much as
   * `?host=` — which is to say not at all beyond being a lookup key.
   *
   * The captured host gets exactly the same treatment as every other signal
   * (§4.1 trust model): normalised, then looked up against `StoreDomain` and
   * run through the §4.3 serving gate and liveness checks. It is an UNTRUSTED
   * LOOKUP KEY, never an identifier — a forged `?host=` can only ever select a
   * store whose PUBLIC robots/sitemap content it could have fetched by asking
   * that host directly, and it grants nothing else.
   *
   * Mode-coupled like every other consumer (§15 lists the SEO routes
   * explicitly): in `legacy_single_store` the pre-Phase-9 resolver answers, so
   * these routes behave as a single-store site until the W8 flip.
   */
  async resolveForSeo(
    request: StorefrontRequest,
    hostParam?: string,
  ): Promise<StoreContext> {
    const { mode } = await this.modeService.getMode();
    if (mode !== 'host_resolution') {
      return this.resolveLegacy(request);
    }

    const forwarded = request.headers['x-forwarded-host'];
    for (const candidate of [
      hostParam,
      Array.isArray(forwarded) ? forwarded[0] : forwarded,
    ]) {
      const host = normaliseHost(candidate, {
        allowLoopback: this.allowLoopback,
      });
      if (host !== null) {
        return this.domainResolver.resolveHost(
          host,
          this.requireHttps ? 'https' : 'http',
        );
      }
    }
    // No usable captured host — fall back to the `Origin` signal, which is
    // the same path every other storefront read takes.
    return this.resolveByOrigin(request);
  }

  private async resolveByOrigin(
    request: StorefrontRequest,
  ): Promise<StoreContext> {
    const raw = request.headers.origin;
    const origin = Array.isArray(raw) ? raw[0] : raw;
    const parsed = parseStorefrontOrigin(origin, {
      allowLoopback: this.allowLoopback,
      requireHttps: this.requireHttps,
    });
    if (parsed === null) {
      // Absent / `null` / malformed / wrong scheme: no store scope can be
      // derived (§4.1.3). Same generic body as an unknown host.
      throw new StoreNotFoundException();
    }
    return this.domainResolver.resolveHost(parsed.host, parsed.scheme);
  }

  private async resolveLegacy(
    request: StorefrontRequest,
  ): Promise<StoreContext> {
    const tenantId = await this.legacyResolver.resolveTenantId(
      request.hostname,
    );
    // Best-effort: the pre-Phase-9 path only ever resolved a TENANT. A
    // tenant with no primary store (possible in dev/test fixtures; never
    // in production, D11) still resolves exactly as before W3 — §4.5's
    // "no 404/503/301 outcomes in this mode" takes precedence over
    // carrying a storeId.
    let storeId: string | null;
    try {
      storeId = await resolvePrimaryStoreId(this.prisma, tenantId);
    } catch (err) {
      if (!(err instanceof NotFoundException)) {
        throw err;
      }
      storeId = null;
    }
    return {
      storeId,
      tenantId,
      storeDomainId: null,
      isPrimary: true,
      canonicalOrigin: null,
      resolvedBy: 'legacy',
    };
  }
}
