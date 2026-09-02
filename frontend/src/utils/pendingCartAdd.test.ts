import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clearPendingCartAdd,
  consumePendingCartAdd,
  savePendingCartAdd,
} from './pendingCartAdd'

afterEach(() => {
  window.sessionStorage.clear()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

const entry = {
  productId: 'prod-1',
  slug: 'ceramic-mug',
  variantId: 'var-1',
  quantity: 2,
  customizations: [{ fieldId: 'f1', textValue: 'Hi' }],
}

describe('pendingCartAdd', () => {
  it('round-trips a saved add for a slug', () => {
    savePendingCartAdd(entry)
    const restored = consumePendingCartAdd('ceramic-mug')
    expect(restored).toMatchObject({
      productId: 'prod-1',
      slug: 'ceramic-mug',
      variantId: 'var-1',
      quantity: 2,
      customizations: [{ fieldId: 'f1', textValue: 'Hi' }],
    })
  })

  it('consume removes the entry so a second read returns null (idempotent resume)', () => {
    savePendingCartAdd(entry)
    expect(consumePendingCartAdd('ceramic-mug')).not.toBeNull()
    expect(consumePendingCartAdd('ceramic-mug')).toBeNull()
  })

  it('does not return a pending add for a different slug', () => {
    savePendingCartAdd(entry)
    expect(consumePendingCartAdd('other-slug')).toBeNull()
  })

  it('ignores a stale entry past the TTL', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    savePendingCartAdd(entry)
    vi.setSystemTime(new Date('2026-01-01T00:31:00Z')) // 31 min later, TTL is 30
    expect(consumePendingCartAdd('ceramic-mug')).toBeNull()
  })

  it('ignores a malformed stored payload', () => {
    window.sessionStorage.setItem('pf_pending_cart_add:ceramic-mug', '{ not json')
    expect(consumePendingCartAdd('ceramic-mug')).toBeNull()
  })

  it('degrades to no-op when sessionStorage throws', () => {
    vi.spyOn(window.sessionStorage.__proto__, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceeded')
    })
    expect(() => savePendingCartAdd(entry)).not.toThrow()
  })

  it('clear removes a pending add', () => {
    savePendingCartAdd(entry)
    clearPendingCartAdd('ceramic-mug')
    expect(consumePendingCartAdd('ceramic-mug')).toBeNull()
  })
})
