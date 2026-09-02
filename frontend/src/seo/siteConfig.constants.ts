/**
 * Plain constants with no `import.meta.env` access, so this module is safe
 * to import from both browser code (via siteConfig.ts) and the Vite config
 * (Node context, where import.meta.env doesn't exist).
 */
export const SITE_NAME = 'PrintForge'

/**
 * Production frontend origin, per the frozen architecture docs
 * (docs/architecture/BLUEPRINT-v1.2.md §23, ARCHITECTURE-FREEZE.md). Not a
 * guess. Overridable per deploy with VITE_SITE_URL.
 */
export const DEFAULT_SITE_URL = 'https://www.printforge.in'
