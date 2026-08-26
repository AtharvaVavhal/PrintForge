import { describe, expect, it } from 'vitest'
import type { CustomizationField } from '@/types/catalog'
import { toCustomizationValueDtos } from './customizationValues'

function buildField(overrides: Partial<CustomizationField> = {}): CustomizationField {
  return {
    id: 'field-1',
    productId: 'prod-1',
    label: 'Field',
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

describe('toCustomizationValueDtos', () => {
  it('maps a text-bearing field to textValue and a file field to uploadedFileId', () => {
    const fields = [
      buildField({ id: 'caption', type: 'TEXT' }),
      buildField({ id: 'logo', type: 'LOGO_UPLOAD' }),
    ]
    const values = { caption: 'Happy Birthday', logo: 'uploaded-file-id-1' }

    expect(toCustomizationValueDtos(fields, values)).toEqual([
      { fieldId: 'caption', textValue: 'Happy Birthday' },
      { fieldId: 'logo', uploadedFileId: 'uploaded-file-id-1' },
    ])
  })

  it('omits a field entirely when its value is blank or whitespace-only, ' +
    'rather than submitting textValue: ""', () => {
    const fields = [
      buildField({ id: 'optional-note', isRequired: false }),
      buildField({ id: 'blank-spaces', isRequired: false }),
    ]
    const values = { 'optional-note': '', 'blank-spaces': '   ' }

    expect(toCustomizationValueDtos(fields, values)).toEqual([])
  })

  it('trims whitespace from submitted text values', () => {
    const fields = [buildField({ id: 'slogan' })]
    const values = { slogan: '  Best Mug Ever  ' }

    expect(toCustomizationValueDtos(fields, values)).toEqual([
      { fieldId: 'slogan', textValue: 'Best Mug Ever' },
    ])
  })

  it('tolerates undefined values (useWatch\'s type before a field is touched)', () => {
    const fields = [buildField({ id: 'untouched' })]

    expect(toCustomizationValueDtos(fields, {})).toEqual([])
  })
})
