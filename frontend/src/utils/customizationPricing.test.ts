import { describe, expect, it } from 'vitest'
import type { CustomizationField } from '@/types/catalog'
import {
  computeCustomizationsSurcharge,
  computeFieldSurcharge,
  isFileFieldType,
} from './customizationPricing'

function buildField(overrides: Partial<CustomizationField> = {}): CustomizationField {
  return {
    id: 'field-1',
    productId: 'prod-1',
    label: 'Caption',
    type: 'TEXT',
    isRequired: false,
    sortOrder: 0,
    helpText: null,
    constraints: null,
    surchargeType: 'NONE',
    surchargeAmount: '0',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('isFileFieldType', () => {
  it('is true for the three upload field types and false otherwise', () => {
    expect(isFileFieldType('LOGO_UPLOAD')).toBe(true)
    expect(isFileFieldType('IMAGE_UPLOAD')).toBe(true)
    expect(isFileFieldType('DESIGN_FILE_UPLOAD')).toBe(true)
    expect(isFileFieldType('TEXT')).toBe(false)
    expect(isFileFieldType('COLOR_SELECT')).toBe(false)
    expect(isFileFieldType('INSTRUCTIONS')).toBe(false)
  })
})

describe('computeFieldSurcharge', () => {
  it('returns 0 for NONE regardless of text length', () => {
    const field = buildField({ surchargeType: 'NONE', surchargeAmount: '5' })
    expect(computeFieldSurcharge(field, 'a long caption')).toBe(0)
  })

  it('returns the flat amount regardless of text length', () => {
    const field = buildField({ surchargeType: 'FLAT', surchargeAmount: '75' })
    expect(computeFieldSurcharge(field, 'x')).toBe(75)
    expect(computeFieldSurcharge(field, undefined)).toBe(75)
  })

  it('multiplies the per-character amount by the text length — matches ' +
    'backend computeSurchargePaise\'s rounding-free integer multiplication', () => {
    const field = buildField({ surchargeType: 'PER_CHARACTER', surchargeAmount: '1' })
    expect(computeFieldSurcharge(field, 'Happy Birthday')).toBe(14)
    expect(computeFieldSurcharge(field, undefined)).toBe(0)
    expect(computeFieldSurcharge(field, '')).toBe(0)
  })
})

describe('computeCustomizationsSurcharge', () => {
  it('sums surcharges across fields, ignoring file fields\' text values', () => {
    const fields = [
      buildField({ id: 'caption', surchargeType: 'PER_CHARACTER', surchargeAmount: '1' }),
      buildField({ id: 'logo', type: 'LOGO_UPLOAD', surchargeType: 'NONE' }),
      buildField({ id: 'engraving', surchargeType: 'FLAT', surchargeAmount: '99' }),
    ]
    const values = {
      caption: 'Hi!',
      // A file field's "value" is an uploadedFileId, not text — passing
      // it here must never be misread as a 3-character surcharge.
      logo: 'a1b2c3d4-uploaded-file-id',
      engraving: 'Congrats',
    }

    expect(computeCustomizationsSurcharge(fields, values)).toBe(3 + 0 + 99)
  })
})
