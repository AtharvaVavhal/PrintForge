import { CustomizationFieldType, SurchargeType } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * `constraints` is descriptive-only jsonb (§9/§15) — maxLength,
 * allowedFormats, maxFileSizeMb, options[], interpreted by
 * customization-validation.util.ts. Not schema-validated field-by-field
 * here since its shape varies by `type`.
 */
export class CreateCustomizationFieldDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  label: string;

  @IsEnum(CustomizationFieldType)
  type: CustomizationFieldType;

  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  helpText?: string;

  @IsOptional()
  @IsObject()
  constraints?: Record<string, unknown>;

  @IsOptional()
  @IsEnum(SurchargeType)
  surchargeType?: SurchargeType;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  surchargeAmount?: number;
}
