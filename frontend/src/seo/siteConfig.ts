import { SITE_NAME } from './siteConfig.constants'

/**
 * SEO-facing site identity.
 *
 * Phase 9 W7 (spec §10.1): the site origin is a **runtime** value, not a
 * build-time constant. One shared frontend deployment serves every store on
 * its own hostname (D8, invariant 11), so there is no single "the site origin"
 * to freeze — a hard-coded `https://www.printforge.in` would have emitted one
 * tenant's domain as the canonical URL of every other tenant's pages.
 *
 * Precedence, highest first:
 *   1. `canonicalOrigin` from `GET /storefront/context` — the SERVER's answer
 *      to "what is this store's canonical origin?". Authoritative because on a
 *      non-primary served host it names the PRIMARY host, which is exactly
 *      what a canonical URL must point at (§11, S-10).
 *   2. `VITE_SITE_URL` — a dev/preview override only (§15 FRONTEND IMPACT),
 *      for a preview deployment that wants to pin an origin.
 *   3. `window.location.origin` — the served host. The right default: in
 *      `legacy_single_store` mode the backend reports `canonicalOrigin: null`,
 *      and the host the browser is on IS the site.
 *
 * `absoluteUrl` takes the origin explicitly instead of closing over a module
 * constant, so these helpers stay pure and a component renders the correct
 * host even before the bootstrap resolves (and re-renders once it does).
 */
export { SITE_NAME }

/**
 * Resolve the origin to build absolute SEO URLs from. Pure: everything it
 * reads is passed in or is ambient browser/build state.
 */
export function resolveSiteOrigin(canonicalOrigin: string | null): string {
  const candidates = [
    canonicalOrigin,
    import.meta.env.VITE_SITE_URL,
    typeof window === 'undefined' ? undefined : window.location.origin,
  ]
  for (const candidate of candidates) {
    const trimmed = candidate?.trim()
    if (trimmed && trimmed.length > 0) {
      return trimmed.replace(/\/+$/, '')
    }
  }
  // Only reachable outside a browser with no override configured (e.g. a
  // non-jsdom unit test). Relative URLs are the honest answer — never a
  // guessed hostname.
  return ''
}

/** Join a root-relative path onto the given site origin. Query strings are
 * kept; a hash is dropped (never part of a canonical URL). */
export function absoluteUrl(pathAndQuery: string, origin: string): string {
  const path = pathAndQuery.split('#')[0]
  return `${origin}${path.startsWith('/') ? path : `/${path}`}`
}

/** `<title>` text: "<page> | PrintForge", or just "PrintForge" for the home
 * page (passing an empty string). */
export function pageTitle(page?: string): string {
  return page && page.trim().length > 0 ? `${page.trim()} | ${SITE_NAME}` : SITE_NAME
}

/** Collapse whitespace/newlines and hard-cap length so a description built
 * from real page or product copy never becomes an unbounded blob (§3). */
export function clampDescription(text: string, max = 160): string {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (normalized.length <= max) return normalized
  return `${normalized.slice(0, max - 1).trimEnd()}…`
}
