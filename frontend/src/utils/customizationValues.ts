import type { CustomizationField } from '@/types/catalog'
import type { CustomizationValueDto } from '@/types/customization'
import { isFileFieldType } from './customizationPricing'

/**
 * Maps the form's flat {fieldId: string} state into exactly the shape
 * AddCartItemDto.customizations expects (backend/src/cart/dto/
 * customization-value.dto.ts): textValue vs uploadedFileId, chosen by
 * field type. An optional field the customer left blank is omitted
 * entirely rather than submitted as an empty string — matches
 * validateCustomizationFieldShape treating "no text and no file" as
 * "not answered," not "answered with nothing."
 */
export function toCustomizationValueDtos(
  fields: CustomizationField[],
  values: Record<string, string | undefined>,
): CustomizationValueDto[] {
  return fields.reduce<CustomizationValueDto[]>((result, field) => {
    const value = values[field.id]?.trim()
    if (!value) {
      return result
    }
    result.push(
      isFileFieldType(field.type)
        ? { fieldId: field.id, uploadedFileId: value }
        : { fieldId: field.id, textValue: value },
    )
    return result
  }, [])
}
