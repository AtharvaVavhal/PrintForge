import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import type { StoreContext } from '../../common/tenant/store-domain-resolution/store-context';
import {
  buildRobotsTxt,
  buildSitemapXml,
  SITEMAP_STATIC_PATHS,
  type SitemapEntry,
} from './storefront-seo.content';

/**
 * Phase 9 §12.1 — assembles the per-store crawler files from the resolved
 * `StoreContext`.
 *
 * TENANT ISOLATION. `tenantId` is placed in the QUERY itself, from the
 * SERVER-resolved `StoreContext` — never a client value — which is exactly how
 * W4 scopes the other public catalog reads (`ProductsService.listCategories`,
 * `listProducts`, …). It deliberately does NOT go through
 * `getTenantScopedClient`: that extension scopes only the six D4 TENANCY
 * models, so `Product` and `Category` would pass through it UNSCOPED. An
 * earlier draft of this file made that mistake and the cross-tenant e2e case
 * below caught it — hence the explicit filter and the test that proves it.
 *
 * The output names no tenant id, store id or domain-row id.
 */
@Injectable()
export class StorefrontSeoService {
  constructor(private readonly prisma: PrismaService) {}

  robotsTxt(context: StoreContext): string {
    return buildRobotsTxt(this.canonicalOrigin(context));
  }

  async sitemapXml(context: StoreContext): Promise<string> {
    const origin = this.canonicalOrigin(context);
    const tenantId = context.tenantId;

    // ACTIVE products and active categories only (§12.1) — an unpublished
    // product must not be advertised to a crawler.
    const [products, categories] = await Promise.all([
      this.prisma.product.findMany({
        where: { tenantId, isActive: true },
        select: { slug: true, updatedAt: true },
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.category.findMany({
        where: { tenantId, isActive: true },
        select: { id: true, updatedAt: true },
        orderBy: { updatedAt: 'desc' },
      }),
    ]);

    const entries: SitemapEntry[] = [
      ...SITEMAP_STATIC_PATHS.map((path) => ({ path })),
      ...categories.map((c) => ({
        path: `/products?categoryId=${encodeURIComponent(c.id)}`,
        lastModified: c.updatedAt,
      })),
      ...products.map((p) => ({
        path: `/products/${encodeURIComponent(p.slug)}`,
        lastModified: p.updatedAt,
      })),
    ];

    return buildSitemapXml(origin, entries);
  }

  /**
   * In `legacy_single_store` mode the resolver reports no canonical origin
   * (there is no per-store canonical host in that mode), so the request's own
   * origin is the site — the same precedence the W7 frontend applies.
   */
  private canonicalOrigin(context: StoreContext): string {
    return (context.canonicalOrigin ?? '').replace(/\/+$/, '');
  }
}
