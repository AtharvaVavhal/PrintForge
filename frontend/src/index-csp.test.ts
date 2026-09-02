import { describe, expect, it } from 'vitest'
import html from '../index.html?raw'

/**
 * The app's Content-Security-Policy lives in one place — the
 * `<meta http-equiv="Content-Security-Policy">` in index.html. Razorpay
 * Checkout needs specific, explicitly-listed origins to run: this test
 * pins them so a future edit can't silently drop one (breaking checkout)
 * or paper over a problem with `unsafe-eval` / a wildcard source.
 */
const cspMatch = html.match(
  /<meta[^>]*http-equiv="Content-Security-Policy"[^>]*content="([^"]*)"/i,
)
const policy = cspMatch?.[1] ?? ''

function directive(name: string): string[] {
  const found = policy
    .split(';')
    .map((d: string) => d.trim())
    .find(
      (d: string) =>
        d.toLowerCase() === name || d.toLowerCase().startsWith(`${name} `),
    )
  return found ? found.split(/\s+/).slice(1) : []
}

describe('index.html Content-Security-Policy', () => {
  it('has a CSP meta tag', () => {
    expect(cspMatch).not.toBeNull()
  })

  it('allows the Razorpay Checkout script origins (explicit, no wildcard)', () => {
    const scriptSrc = directive('script-src')
    expect(scriptSrc).toContain("'self'")
    expect(scriptSrc).toContain('https://checkout.razorpay.com')
    expect(scriptSrc).toContain('https://cdn.razorpay.com')
  })

  it('allows the Razorpay Checkout iframe origins (explicit, no wildcard)', () => {
    const frameSrc = directive('frame-src')
    expect(frameSrc).toContain('https://checkout.razorpay.com')
    expect(frameSrc).toContain('https://api.razorpay.com')
  })

  it('never uses unsafe-eval or a bare wildcard in script/frame/default-src', () => {
    expect(policy).not.toContain("'unsafe-eval'")
    for (const name of ['script-src', 'frame-src', 'default-src']) {
      expect(directive(name)).not.toContain('*')
    }
  })

  it('keeps the baseline restrictions intact', () => {
    expect(directive('default-src')).toEqual(["'self'"])
    expect(directive('font-src')).toEqual(["'self'"])
    // Razorpay origins were added ONLY to script-src / frame-src.
    expect(directive('style-src')).not.toContain('https://cdn.razorpay.com')
    expect(directive('style-src')).not.toContain('https://api.razorpay.com')
  })
})
