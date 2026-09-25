import {
  buildFallbackRobotsTxt,
  buildRobotsTxt,
  buildSitemapXml,
  ROBOTS_DISALLOW_PATHS,
  SEO_CACHE_CONTROL,
  SITEMAP_STATIC_PATHS,
} from './storefront-seo.content';

/**
 * Phase 9 §12.1 — the exact bytes a crawler receives. Pure functions, so the
 * content contract is pinned here and the e2e suite only has to prove the
 * routing, resolution and isolation around them.
 */
const ORIGIN = 'https://shop.example';

describe('Phase 9 §12.1 — storefront SEO content', () => {
  describe('robots.txt', () => {
    const body = buildRobotsTxt(ORIGIN);

    it('allows the site and disallows the console and purchase funnel', () => {
      expect(body).toContain('User-agent: *');
      expect(body).toContain('Allow: /');
      for (const path of ROBOTS_DISALLOW_PATHS) {
        expect(body).toContain(`Disallow: ${path}`);
      }
      expect(ROBOTS_DISALLOW_PATHS).toEqual([
        '/admin',
        '/account',
        '/checkout',
        '/cart',
      ]);
    });

    it('carries a Sitemap: line on the CANONICAL origin (§18.1 canary check)', () => {
      expect(body).toContain(`Sitemap: ${ORIGIN}/sitemap.xml`);
    });

    it('never emits a blanket disallow', () => {
      expect(body).not.toMatch(/^Disallow: \/$/m);
    });

    it('differs per store, because the origin is the only variable', () => {
      expect(buildRobotsTxt('https://a.example')).not.toBe(
        buildRobotsTxt('https://b.example'),
      );
    });
  });

  describe('robots.txt fallback (unresolved host)', () => {
    const body = buildFallbackRobotsTxt();

    it('is permissive — a transient resolution failure must not de-index a store', () => {
      expect(body).toContain('Allow: /');
      expect(body).not.toMatch(/^Disallow: \/$/m);
    });

    it('names no store and carries no Sitemap line, so it leaks nothing', () => {
      expect(body).not.toContain('Sitemap:');
      expect(body).not.toContain('example');
    });

    it('still protects the console and funnel', () => {
      for (const path of ROBOTS_DISALLOW_PATHS) {
        expect(body).toContain(`Disallow: ${path}`);
      }
    });
  });

  describe('sitemap.xml', () => {
    it('emits a well-formed urlset with absolute canonical-origin locs', () => {
      const xml = buildSitemapXml(ORIGIN, [
        { path: '/' },
        { path: '/products' },
      ]);
      expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(
        true,
      );
      expect(xml).toContain(
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      );
      expect(xml).toContain(`<loc>${ORIGIN}/</loc>`);
      expect(xml).toContain(`<loc>${ORIGIN}/products</loc>`);
      expect(xml.trimEnd().endsWith('</urlset>')).toBe(true);
    });

    it('includes a lastmod date only when one is supplied', () => {
      const xml = buildSitemapXml(ORIGIN, [
        { path: '/a', lastModified: new Date('2026-03-04T05:06:07Z') },
        { path: '/b' },
      ]);
      expect(xml).toContain('<lastmod>2026-03-04</lastmod>');
      expect(xml.match(/<lastmod>/g)).toHaveLength(1);
    });

    it('XML-escapes a query string so `&` cannot break the document', () => {
      const xml = buildSitemapXml(ORIGIN, [
        { path: '/products?categoryId=c1&page=2' },
      ]);
      expect(xml).toContain('categoryId=c1&amp;page=2');
      expect(xml).not.toContain('c1&page');
    });

    it('escapes angle brackets and quotes, so a slug cannot inject markup', () => {
      const xml = buildSitemapXml(ORIGIN, [{ path: '/products/<script>"x"' }]);
      expect(xml).not.toContain('<script>');
      expect(xml).toContain('&lt;script&gt;');
      expect(xml).toContain('&quot;x&quot;');
    });

    it('enumerates the static public routes but NOT the legal pages (§12.1)', () => {
      expect(SITEMAP_STATIC_PATHS).toEqual([
        '/',
        '/products',
        '/about',
        '/contact',
      ]);
      for (const legal of ['/privacy', '/terms', '/refund-policy']) {
        expect(SITEMAP_STATIC_PATHS as readonly string[]).not.toContain(legal);
      }
    });
  });

  it('both files are cacheable for an hour (§12.1)', () => {
    expect(SEO_CACHE_CONTROL).toBe('public, max-age=3600');
  });
});
