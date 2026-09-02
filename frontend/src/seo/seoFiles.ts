/**
 * Pure builders for the two static crawler files emitted at build time by
 * the `seoFiles` Vite plugin (vite.config.ts). Kept dependency-free and
 * side-effect-free so they're trivially testable and safe to import from
 * the Vite config.
 */

/** Root-relative paths that are genuinely public, indexable, and known at
 * build time without any API access. Product and category URLs are NOT
 * here — they're dynamic and the SPA build has no safe way to enumerate
 * them (see the phase report's limitations). */
export const STATIC_PUBLIC_PATHS = [
  '/',
  '/products',
  '/about',
  '/contact',
  '/privacy',
  '/terms',
  '/refund-policy',
] as const

/** Paths crawlers should not index — mirrors the `noindex` routes in the
 * app's route/security model (§5/§6). */
const DISALLOW = [
  '/cart',
  '/checkout',
  '/account',
  '/orders',
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/forbidden',
  '/admin',
]

export function buildRobotsTxt(siteUrl: string): string {
  const origin = siteUrl.replace(/\/+$/, '')
  return [
    'User-agent: *',
    'Allow: /',
    ...DISALLOW.map((path) => `Disallow: ${path}`),
    '',
    `Sitemap: ${origin}/sitemap.xml`,
    '',
  ].join('\n')
}

export function buildSitemapXml(
  siteUrl: string,
  paths: readonly string[] = STATIC_PUBLIC_PATHS,
): string {
  const origin = siteUrl.replace(/\/+$/, '')
  const urls = paths
    .map((path) => `  <url>\n    <loc>${escapeXml(`${origin}${path}`)}</loc>\n  </url>`)
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}
