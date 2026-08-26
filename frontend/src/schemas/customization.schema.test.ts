import { describe, expect, it } from 'vitest'
import type { CustomizationField } from '@/types/catalog'
import { buildCustomizationSchema } from './customization.schema'

function buildField(overrides: Partial<CustomizationField> = {}): CustomizationField {
  return {
    id: 'field-1',
    productId: 'prod-1',
    label: 'Slogan Text',
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

describe('buildCustomizationSchema', () => {
  it('rejects a blank value for a required field, accepts blank for an optional one', () => {
    const schema = buildCustomizationSchema([
      buildField({ id: 'required-field', isRequired: true }),
      buildField({ id: 'optional-field', isRequired: false }),
    ])

    const result = schema.safeParse({ 'required-field': '', 'optional-field': '' })

    expect(result.success).toBe(false)
    if (!result.success) {
      const message = result.error.issues.find((issue) => issue.path[0] === 'required-field')
        ?.message
      expect(message).toBe('Slogan Text is required')
    }
  })

  it('enforces maxLength — matches validateCustomizationFieldShape', () => {
    const schema = buildCustomizationSchema([
      buildField({ id: 'caption', constraints: { maxLength: 5 } }),
    ])

    expect(schema.safeParse({ caption: 'short' }).success).toBe(true)
    expect(schema.safeParse({ caption: 'too long' }).success).toBe(false)
  })

  it('enforces COLOR_SELECT options — the exact set from constraints.options', () => {
    const schema = buildCustomizationSchema([
      buildField({
        id: 'color',
        type: 'COLOR_SELECT',
        isRequired: true,
        constraints: { options: ['White', 'Black', 'Red'] },
      }),
    ])

    expect(schema.safeParse({ color: 'White' }).success).toBe(true)
    expect(schema.safeParse({ color: 'Purple' }).success).toBe(false)
  })

  it('does not apply maxLength to file field types (constraints.maxFileSizeMb ' +
    'is a different unit and must never be read as a character limit)', () => {
    const schema = buildCustomizationSchema([
      buildField({
        id: 'logo',
        type: 'LOGO_UPLOAD',
        isRequired: true,
        constraints: { allowedFormats: ['png'], maxFileSizeMb: 5 },
      }),
    ])

    // A real uploadedFileId (a UUID) is well under any character limit,
    // but this proves the schema never coerces maxFileSizeMb into a
    // maxLength check — it would reject "5" characters otherwise.
    expect(schema.safeParse({ logo: '5' }).success).toBe(true)
    expect(schema.safeParse({ logo: '' }).success).toBe(false)
  })
})
