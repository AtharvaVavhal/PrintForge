import { describe, expect, it } from 'vitest'
import { STATIC_PUBLIC_PATHS, buildRobotsTxt, buildSitemapXml } from './seoFiles'

describe('buildRobotsTxt', () => {
  const txt = buildRobotsTxt('https://www.printforge.in/')

  it('allows crawling and points at the sitemap on the given origin', () => {
    expect(txt).toContain('User-agent: *')
    expect(txt).toContain('Allow: /')
    expect(txt).toContain('Sitemap: https://www.printforge.in/sitemap.xml')
  })

  it('disallows every private / utility path', () => {
    for (const path of ['/cart', '/checkout', '/account', '/orders', '/login', '/register', '/admin', '/forbidden']) {
      expect(txt).toContain(`Disallow: ${path}`)
    }
  })

  it('never disallows the public storefront roots', () => {
    expect(txt).not.toMatch(/Disallow: \/products\b/)
    expect(txt).not.toMatch(/Disallow: \/\s*$/m)
    expect(txt).not.toContain('Disallow: /about')
  })
})

describe('buildSitemapXml', () => {
  const xml = buildSitemapXml('https://www.printforge.in')

  it('is well-formed XML with a urlset', () => {
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true)
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')
    expect(xml.trimEnd().endsWith('</urlset>')).toBe(true)
  })

  it('lists exactly the known static public URLs, absolute on the origin', () => {
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])
    expect(locs).toEqual([
      'https://www.printforge.in/',
      'https://www.printforge.in/products',
      'https://www.printforge.in/about',
      'https://www.printforge.in/contact',
      'https://www.printforge.in/privacy',
      'https://www.printforge.in/terms',
      'https://www.printforge.in/refund-policy',
    ])
  })

  it('never includes a private, admin, or dynamic catalog URL', () => {
    for (const path of ['/cart', '/checkout', '/account', '/orders', '/admin', '/login', '/invoice']) {
      expect(xml).not.toContain(`${path}<`)
      expect(xml).not.toContain(`${path}/`)
    }
    // No fabricated product / category slugs.
    expect(xml).not.toMatch(/\/products\/[a-z]/)
  })

  it('honours a custom origin (staging / preview deploys)', () => {
    const staged = buildSitemapXml('https://preview.example.com/')
    expect(staged).toContain('<loc>https://preview.example.com/about</loc>')
  })

  it('STATIC_PUBLIC_PATHS are all root-relative', () => {
    for (const path of STATIC_PUBLIC_PATHS) {
      expect(path.startsWith('/')).toBe(true)
    }
  })
})
