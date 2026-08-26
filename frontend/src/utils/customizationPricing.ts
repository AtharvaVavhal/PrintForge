import type { CustomizationField, CustomizationFieldType } from '@/types/catalog'

const FILE_FIELD_TYPES: ReadonlySet<CustomizationFieldType> = new Set([
  'LOGO_UPLOAD',
  'IMAGE_UPLOAD',
  'DESIGN_FILE_UPLOAD',
])

export function isFileFieldType(type: CustomizationFieldType): boolean {
  return FILE_FIELD_TYPES.has(type)
}

/**
 * Client-side preview only — mirrors backend/src/products/customizations/
 * customization-validation.util.ts's computeSurchargePaise, in rupees
 * (number) instead of paise (bigint). The server recomputes canonically
 * on every cart read/mutation (§11); nothing here is ever the amount
 * actually charged.
 */
export function computeFieldSurcharge(
  field: CustomizationField,
  textValue: string | undefined,
): number {
  const amount = Number(field.surchargeAmount)
  switch (field.surchargeType) {
    case 'NONE':
      return 0
    case 'FLAT':
      return amount
    case 'PER_CHARACTER':
      return amount * (textValue?.length ?? 0)
    default:
      return 0
  }
}

/** Sums every field's surcharge for the current form values. File fields
 * pass `undefined` as their text value — none carry a surcharge in the
 * current schema/data, but the general PER_CHARACTER case is guarded
 * rather than assumed away. */
export function computeCustomizationsSurcharge(
  fields: CustomizationField[],
  values: Record<string, string | undefined>,
): number {
  return fields.reduce((total, field) => {
    const textValue = isFileFieldType(field.type) ? undefined : values[field.id]
    return total + computeFieldSurcharge(field, textValue)
  }, 0)
}
