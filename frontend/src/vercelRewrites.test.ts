import { describe, expect, it } from 'vitest'
import vercelConfig from '../vercel.json'

/**
 * Phase 9 §12.2 / §10.5 — the edge rewrites that make the per-store crawler
 * files reachable. Asserted here rather than left to review because two
 * properties are silently breakable:
 *
 *  1. ORDER. Vercel applies the first matching rewrite, so the SPA catch-all
 *     `/(.*)` must stay LAST. Moved above these two and every `/robots.txt`
 *     request would be answered with `index.html` instead — the storefront
 *     would still look fine while its SEO files quietly disappeared.
 *  2. HOST CAPTURE. A crawler sends no `Origin`, so the matched host is the
 *     only signal the backend can resolve a store from (§12.2). Drop the
 *     capture and every store would get the generic fallback.
 *  3. API ORIGIN. The destination is an absolute cross-origin URL, and Vercel
 *     does not interpolate env vars into `vercel.json`, so this literal cannot
 *     read `VITE_API_BASE_URL`. It must therefore be kept in step with the real
 *     production API origin by hand. ⚖️ P9-D10 (2026-09-25) corrected it from
 *     `api.printforge.in`, which has never resolved (NXDOMAIN) — both SEO
 *     rewrites pointed at a dead host, so every store's crawler files would
 *     have failed and exit criterion `E-5` could not have passed.
 */
interface Rewrite {
  source: string
  destination: string
  has?: { type: string; value: string }[]
}

const rewrites = (vercelConfig as { rewrites: Rewrite[] }).rewrites

describe('vercel.json storefront SEO rewrites (Phase 9 §12.2)', () => {
  it.each(['/robots.txt', '/sitemap.xml'])(
    'rewrites %s to the backend SEO route, carrying the matched host',
    (source) => {
      const rule = rewrites.find((r) => r.source === source)
      expect(rule).toBeDefined()
      expect(rule!.destination).toContain('/storefront/seo/')
      expect(rule!.destination).toContain(source.replace('/', ''))
      // §12.2: the matched host travels as ?host=<captured>.
      expect(rule!.destination).toMatch(/\?host=:storehost$/)
      expect(rule!.has).toEqual([
        { type: 'host', value: '(?<storehost>.*)' },
      ])
    },
  )

  it('keeps the SPA catch-all LAST, after both SEO rewrites', () => {
    const catchAll = rewrites.findIndex((r) => r.source === '/(.*)')
    expect(catchAll).toBe(rewrites.length - 1)
    expect(rewrites.findIndex((r) => r.source === '/robots.txt')).toBeLessThan(
      catchAll,
    )
    expect(rewrites.findIndex((r) => r.source === '/sitemap.xml')).toBeLessThan(
      catchAll,
    )
  })

  it('sends both SEO rewrites to ONE absolute https API origin (⚖️ P9-D10)', () => {
    const origins = ['/robots.txt', '/sitemap.xml'].map((source) => {
      const rule = rewrites.find((r) => r.source === source)
      expect(rule).toBeDefined()
      return new URL(rule!.destination).origin
    })
    // One origin for both, or a crawler could get two different backends.
    expect(new Set(origins).size).toBe(1)
    expect(origins[0]).toMatch(/^https:\/\//)
    // `api.printforge.in` has never been delegated; it must never come back
    // as the destination (see the header note).
    expect(origins[0]).not.toContain('printforge.in')
  })

  it('still serves the SPA for ordinary routes', () => {
    const catchAll = rewrites[rewrites.length - 1]
    expect(catchAll).toMatchObject({
      source: '/(.*)',
      destination: '/index.html',
    })
  })
})
