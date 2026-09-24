/**
 * Plain constants with no `import.meta.env` access, so this module is safe
 * to import from both browser code (via siteConfig.ts) and the Vite config
 * (Node context, where import.meta.env doesn't exist).
 *
 * Phase 9 W7 (spec §10.1) removed `DEFAULT_SITE_URL` from this file. The site
 * ORIGIN is no longer a build-time constant at all — it is a runtime value
 * derived from the served host (`resolveSiteOrigin` in `siteConfig.ts`),
 * because one shared frontend deployment serves every store on its own
 * hostname. A hard-coded origin here would have made every store's canonical
 * URL point at one tenant's domain.
 *
 * `SITE_NAME` is the PLATFORM name and stays a constant: it is the
 * `og:site_name` / `<title>` suffix, not a host. The per-store display name is
 * separate — see `useStoreName` / `StorefrontContext.storeName`.
 */
export const SITE_NAME = 'PrintForge'
