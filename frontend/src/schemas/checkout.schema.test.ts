import { describe, expect, it } from 'vitest'
import { shippingSchema } from './checkout.schema'

const VALID = {
  shippingRecipientName: 'Jane Doe',
  shippingPhone: '9876543210',
  shippingAddressLine1: '123 MG Road',
  shippingAddressLine2: '',
  shippingCity: 'Pune',
  shippingState: 'Maharashtra',
  shippingPostalCode: '411046',
  shippingCountry: 'India',
}

function fieldError(result: ReturnType<typeof shippingSchema.safeParse>, path: string) {
  if (result.success) return undefined
  return result.error.issues.find((i) => i.path[0] === path)?.message
}

describe('shippingSchema', () => {
  it('accepts a well-formed shipping address', () => {
    expect(shippingSchema.safeParse(VALID).success).toBe(true)
  })

  describe('shippingPhone', () => {
    it.each(['9876543210', '+919876543210', '+91 98765 43210'])(
      'accepts %s',
      (shippingPhone) => {
        expect(shippingSchema.safeParse({ ...VALID, shippingPhone }).success).toBe(true)
      },
    )

    it.each(['12345', '1234567890', '+12025550123', 'not-a-number'])(
      'rejects %s',
      (shippingPhone) => {
        const result = shippingSchema.safeParse({ ...VALID, shippingPhone })
        expect(result.success).toBe(false)
        expect(fieldError(result, 'shippingPhone')).toMatch(/valid Indian mobile number/)
      },
    )

    it('requires a value', () => {
      const result = shippingSchema.safeParse({ ...VALID, shippingPhone: '' })
      expect(fieldError(result, 'shippingPhone')).toBe('Phone number is required')
    })
  })

  describe('shippingPostalCode', () => {
    it('accepts exactly six digits', () => {
      expect(
        shippingSchema.safeParse({ ...VALID, shippingPostalCode: '560001' }).success,
      ).toBe(true)
    })

    it('trims whitespace', () => {
      const result = shippingSchema.safeParse({ ...VALID, shippingPostalCode: ' 411046 ' })
      expect(result.success).toBe(true)
      if (result.success) expect(result.data.shippingPostalCode).toBe('411046')
    })

    it.each(['4110', '4110461', '41104a', 'abcdef'])('rejects %s', (shippingPostalCode) => {
      const result = shippingSchema.safeParse({ ...VALID, shippingPostalCode })
      expect(result.success).toBe(false)
      expect(fieldError(result, 'shippingPostalCode')).toBe('Enter a valid 6-digit PIN code.')
    })
  })
})
