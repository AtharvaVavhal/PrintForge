import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

/**
 * Matches CustomizationSubmission (products/customizations/customization-
 * validation.util.ts) plus fieldId to identify which CustomizationField
 * this value is for — the shape CustomizationValidationService.validate()
 * expects, unchanged.
 */
export class CustomizationValueDto {
  @IsUUID()
  fieldId: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  textValue?: string;

  @IsOptional()
  @IsUUID()
  uploadedFileId?: string;
}
