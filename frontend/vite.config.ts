import path from 'node:path'
import react from '@vitejs/plugin-react'
/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config'

/**
 * Phase 9 §10.3 — the build-time `robots.txt` / `sitemap.xml` plugin has been
 * RETIRED, together with `src/seo/seoFiles.ts`, now that its two stated
 * preconditions actually hold: the per-store backend routes exist
 * (`GET /storefront/seo/robots.txt`, `GET /storefront/seo/sitemap.xml`, §12.1)
 * and `vercel.json` rewrites both paths to them on every storefront host
 * (§12.2).
 *
 * Keeping it would have been worse than useless: the edge rewrites intercept
 * those two paths before the static build output is ever consulted, so the
 * emitted files could never be served — while still implying that one
 * build-time origin was the right answer for every store. A shared frontend
 * serving many storefront hostnames has no single correct build-time sitemap;
 * that is the whole reason the enumeration moved server-side.
 *
 * Nothing replaces it here. The last `printforge.in` literal in the frontend
 * left with it (§10.1/§14.6), and the fallback for an unresolved host is the
 * backend's own static permissive `robots.txt` (§15 ROLLBACK).
 */
// https://vite.dev/config/
export default defineConfig(() => {
  return {
    plugins: [react()],
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
