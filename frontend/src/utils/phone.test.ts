import { describe, expect, it } from 'vitest'
import { isNormalizableIndianMobile, normalizeIndianMobile } from './phone'

describe('normalizeIndianMobile', () => {
  it('normalises a bare 10-digit number to E.164', () => {
    expect(normalizeIndianMobile('9876543210')).toBe('+919876543210')
  })

  it('keeps an already-canonical value', () => {
    expect(normalizeIndianMobile('+919876543210')).toBe('+919876543210')
  })

  it('strips spaces and dashes', () => {
    expect(normalizeIndianMobile('+91 98765 43210')).toBe('+919876543210')
    expect(normalizeIndianMobile('098765-43210')).toBe('+919876543210')
  })

  it('accepts a 91-prefixed 12-digit number', () => {
    expect(normalizeIndianMobile('919876543210')).toBe('+919876543210')
  })

  it('rejects a number that is too short', () => {
    expect(normalizeIndianMobile('98765')).toBeNull()
  })

  it('rejects a 10-digit number that does not start 6-9', () => {
    expect(normalizeIndianMobile('1234567890')).toBeNull()
    expect(normalizeIndianMobile('5234567890')).toBeNull()
  })

  it('rejects a non-Indian country code', () => {
    expect(normalizeIndianMobile('+12025550123')).toBeNull()
  })

  it('rejects an empty / whitespace value', () => {
    expect(normalizeIndianMobile('')).toBeNull()
    expect(normalizeIndianMobile('   ')).toBeNull()
  })

  it('rejects letters', () => {
    expect(normalizeIndianMobile('98765abcde')).toBeNull()
  })
})

describe('isNormalizableIndianMobile', () => {
  it('is true for accepted shapes, false otherwise', () => {
    expect(isNormalizableIndianMobile('9876543210')).toBe(true)
    expect(isNormalizableIndianMobile('+91 9876543210')).toBe(true)
    expect(isNormalizableIndianMobile('12345')).toBe(false)
  })
})
