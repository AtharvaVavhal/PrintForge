/**
 * Phase 9 §12.1 — the robots/sitemap bodies, as pure functions. No I/O and no
 * Nest here, so the exact bytes a crawler receives are unit-testable and the
 * controller stays a thin transport shell.
 */

/**
 * Public, indexable SPA routes. Legal pages (`/privacy`, `/terms`,
 * `/refund-policy`) are deliberately NOT enumerated — §12.1 defers them to
 * Phase 13 (§20).
 */
export const SITEMAP_STATIC_PATHS = [
  '/',
  '/products',
  '/about',
  '/contact',
] as const;

/**
 * Paths a crawler must not index: the merchant console and everything that is
 * per-session or mid-purchase. This is the `STATIC_PUBLIC_PATHS` intent §12.1
 * points at, expressed as the disallow side.
 */
export const ROBOTS_DISALLOW_PATHS = [
  '/admin',
  '/account',
  '/checkout',
  '/cart',
] as const;

/** §12.1: responses are cacheable for an hour. */
export const SEO_CACHE_CONTROL = 'public, max-age=3600';

export interface SitemapEntry {
  /** Root-relative path; joined onto the canonical origin. */
  path: string;
  lastModified?: Date | null;
}

/**
 * The store-specific `robots.txt`. The `Sitemap:` line points at the CANONICAL
 * origin, never at the host this request happened to arrive on — a crawler
 * that reached a non-primary host is redirected (§11) before it ever gets
 * here, and a canonical origin in the body keeps the two files consistent.
 */
export function buildRobotsTxt(canonicalOrigin: string): string {
  const lines = [
    'User-agent: *',
    'Allow: /',
    ...ROBOTS_DISALLOW_PATHS.map((p) => `Disallow: ${p}`),
    '',
    `Sitemap: ${canonicalOrigin}/sitemap.xml`,
    '',
  ];
  return lines.join('\n');
}

/**
 * The fallback body for a host that resolved to no store (§12.1 / §15
 * ROLLBACK: "degrades to a static permissive robots.txt — no data risk").
 *
 * Permissive rather than `Disallow: /`: this route is also what a crawler hits
 * if the resolver is momentarily unavailable, and a blanket disallow served by
 * accident can de-index a live storefront. It still carries no `Sitemap:` line
 * and names no store, so it leaks nothing about which hostnames exist.
 */
export function buildFallbackRobotsTxt(): string {
  return [
    'User-agent: *',
    'Allow: /',
    ...ROBOTS_DISALLOW_PATHS.map((p) => `Disallow: ${p}`),
    '',
  ].join('\n');
}

/** XML-escapes a URL for inclusion in a `<loc>` element. */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * The store-specific `sitemap.xml`. Every `<loc>` is absolute against the
 * canonical origin — the enumeration the build-time Vite plugin explicitly
 * could not do, because it has no way to know a store's catalogue.
 */
export function buildSitemapXml(
  canonicalOrigin: string,
  entries: SitemapEntry[],
): string {
  const urls = entries
    .map(({ path, lastModified }) => {
      const loc = escapeXml(
        `${canonicalOrigin}${path.startsWith('/') ? path : `/${path}`}`,
      );
      const lastmod = lastModified
        ? `\n    <lastmod>${lastModified.toISOString().slice(0, 10)}</lastmod>`
        : '';
      return `  <url>\n    <loc>${loc}</loc>${lastmod}\n  </url>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}
