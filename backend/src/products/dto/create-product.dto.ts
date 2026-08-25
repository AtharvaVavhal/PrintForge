import {
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateProductDto {
  @IsUUID()
  categoryId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name: string;

  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message:
      'slug must be lowercase alphanumeric segments separated by hyphens',
  })
  slug: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  basePrice: number;

  @IsInt()
  @Min(1)
  minQuantity: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxQuantity?: number;

  @IsOptional()
  @IsObject()
  specifications?: Record<string, unknown>;
}
