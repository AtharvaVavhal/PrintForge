import { DEFAULT_SITE_URL, SITE_NAME } from './siteConfig.constants'

/**
 * Single source of truth for SEO-facing site identity.
 *
 * The production frontend origin is `https://www.printforge.in` — established
 * by the frozen architecture docs (docs/architecture/BLUEPRINT-v1.2.md §23,
 * docs/architecture/ARCHITECTURE-FREEZE.md), not guessed here. DNS cutover is
 * still pending (Readme.md "Project Status"), so it is overridable per deploy
 * via the `VITE_SITE_URL` env var (see .env.example) for preview/staging
 * environments that live on a different hostname.
 */
export { SITE_NAME, DEFAULT_SITE_URL }

function resolveSiteUrl(): string {
  const configured = import.meta.env.VITE_SITE_URL?.trim()
  const raw = configured && configured.length > 0 ? configured : DEFAULT_SITE_URL
  return raw.replace(/\/+$/, '')
}

export const SITE_URL = resolveSiteUrl()

/** Join a root-relative path onto the site origin. Query strings are kept;
 * a hash is dropped (never part of a canonical URL). */
export function absoluteUrl(pathAndQuery: string): string {
  const path = pathAndQuery.split('#')[0]
  return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`
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
