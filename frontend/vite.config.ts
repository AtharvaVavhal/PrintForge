import path from 'node:path'
import react from '@vitejs/plugin-react'
import { loadEnv, type Plugin } from 'vite'
/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config'
import { buildRobotsTxt, buildSitemapXml } from './src/seo/seoFiles.ts'

/**
 * Phase 9 W7 (spec §10.1 / §14.6): the site origin is a RUNTIME value now, and
 * no `printforge.in` literal may remain under `src/seo/` — so this build-time
 * fallback lives here, in the build config, and nowhere else.
 *
 * It exists solely for the single-origin robots.txt / sitemap.xml this plugin
 * still emits. Spec §10.3 retires the plugin (and `seoFiles.ts`) in favour of
 * the per-store backend SEO routes (§12) plus the vercel.json rewrites
 * (§10.5) — explicitly "once the backend routes are live", which they are not
 * yet. Deleting the plugin before then would ship a storefront with NO
 * robots.txt or sitemap at all, so the plugin, `seoFiles.ts` and this constant
 * stay until that wave and die together with it.
 */
const BUILD_TIME_FALLBACK_SITE_URL = 'https://www.printforge.in'

/**
 * Emits robots.txt and a static, single-origin sitemap.xml into the build
 * output. Build-time only — the dev server needs neither file.
 *
 * INTERIM (see BUILD_TIME_FALLBACK_SITE_URL above): a shared frontend serving
 * many storefront hostnames cannot have one correct build-time sitemap. The
 * per-store replacement is the backend's own SEO routes (spec §12); until
 * those exist this keeps the pre-Phase-9 behaviour rather than regressing to
 * nothing.
 */
function seoFiles(siteUrl: string): Plugin {
  return {
    name: 'printforge-seo-files',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'robots.txt',
        source: buildRobotsTxt(siteUrl),
      })
      this.emitFile({
        type: 'asset',
        fileName: 'sitemap.xml',
        source: buildSitemapXml(siteUrl),
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const siteUrl = (env.VITE_SITE_URL?.trim() || BUILD_TIME_FALLBACK_SITE_URL).replace(
    /\/+$/,
    '',
  )

  return {
    plugins: [react(), seoFiles(siteUrl)],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, './src'),
      },
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      css: true,
    },
  }
})
