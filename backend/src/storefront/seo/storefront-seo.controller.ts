import { Controller, Get, Query, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { StoreContextService } from '../../common/tenant/store-domain-resolution/store-context.service';
import type { StorefrontRequest } from '../../common/tenant/store-domain-resolution/store-context.service';
import {
  buildFallbackRobotsTxt,
  SEO_CACHE_CONTROL,
} from './storefront-seo.content';
import { StorefrontSeoService } from './storefront-seo.service';

/**
 * Phase 9 §12.1 — the two per-store crawler files.
 *
 *   GET /storefront/seo/robots.txt
 *   GET /storefront/seo/sitemap.xml
 *
 * `@Public()` (the `HealthController` pattern): a crawler has no session, and
 * both bodies are public information about a public storefront.
 *
 * REACHED VIA THE EDGE. `vercel.json` rewrites `/robots.txt` and
 * `/sitemap.xml` on every storefront host to these routes, carrying the
 * matched host as `?host=` (§12.2) — a crawler sends no `Origin`, so without
 * that capture there would be no signal at all. The captured value is treated
 * exactly like `Origin`: normalised, looked up against `StoreDomain`, and run
 * through the §4.3 serving gate (see `StoreContextService.resolveForSeo`).
 *
 * NON-PRIMARY HOST → 301 (§11). This is **the one server-side redirect in
 * Phase 9**, and it exists only for crawlers: a page request is canonicalised
 * client-side by the SPA instead, because a 301 on a cross-origin fetch would
 * send the browser to the API's own `/api/v1/...` path.
 *
 * FALLBACKS (§12.1) differ per file, deliberately:
 *   robots.txt  → a static permissive body (§15 ROLLBACK: "degrades to a
 *                 static permissive robots.txt — no data risk"). Serving a
 *                 404 here, or a blanket disallow, could de-index a live store
 *                 over a transient resolution failure.
 *   sitemap.xml → 404 (🔎 S-11: a crawler should not index an unknown host).
 *
 * `@Res()` without passthrough: these are `text/plain` and `application/xml`
 * bodies, so they must bypass the global `{success, data}` envelope the
 * `ResponseInterceptor` applies to every JSON route.
 */
@Controller('storefront/seo')
export class StorefrontSeoController {
  constructor(
    private readonly storeContext: StoreContextService,
    private readonly seo: StorefrontSeoService,
  ) {}

  @Public()
  @Get('robots.txt')
  async robotsTxt(
    @Req() request: StorefrontRequest,
    @Query('host') host: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    res.setHeader('Cache-Control', SEO_CACHE_CONTROL);
    res.type('text/plain');

    let context;
    try {
      context = await this.storeContext.resolveForSeo(request, host);
    } catch {
      // Unknown host, unserved domain, or an unavailable store: degrade, do
      // not fail. Nothing about which hostnames exist is revealed.
      res.status(200).send(buildFallbackRobotsTxt());
      return;
    }

    const redirect = this.canonicalRedirect(context, '/robots.txt');
    if (redirect) {
      res.redirect(301, redirect);
      return;
    }
    res.status(200).send(this.seo.robotsTxt(context));
  }

  @Public()
  @Get('sitemap.xml')
  async sitemapXml(
    @Req() request: StorefrontRequest,
    @Query('host') host: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    // Resolution failures propagate here (S-11): an unknown host gets the
    // resolver's own generic 404, identical to every other unresolved
    // storefront read, so it leaks nothing either.
    const context = await this.storeContext.resolveForSeo(request, host);

    const redirect = this.canonicalRedirect(context, '/sitemap.xml');
    if (redirect) {
      res.redirect(301, redirect);
      return;
    }

    const body = await this.seo.sitemapXml(context);
    res.setHeader('Cache-Control', SEO_CACHE_CONTROL);
    res.type('application/xml');
    res.status(200).send(body);
  }

  /**
   * §11: a crawler that reached a non-primary served host is sent to the same
   * path on the canonical origin. Returns `null` when the host already IS
   * canonical, or when no canonical origin is known (legacy mode) — never a
   * redirect loop.
   */
  private canonicalRedirect(
    context: { isPrimary: boolean; canonicalOrigin: string | null },
    path: string,
  ): string | null {
    if (context.isPrimary || context.canonicalOrigin === null) {
      return null;
    }
    return `${context.canonicalOrigin.replace(/\/+$/, '')}${path}`;
  }
}
