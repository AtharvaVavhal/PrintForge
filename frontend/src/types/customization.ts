/**
 * Mirrors backend/src/cart/dto/customization-value.dto.ts exactly — the
 * shape AddCartItemDto.customizations expects. Exactly one of
 * textValue/uploadedFileId is meaningful per entry, chosen by the
 * corresponding CustomizationField's type (see
 * customization-validation.util.ts's isFileFieldType).
 */
export interface CustomizationValueDto {
  fieldId: string
  textValue?: string
  uploadedFileId?: string
}
