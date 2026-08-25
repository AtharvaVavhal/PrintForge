import {
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class UpdateVariantDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  label?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  priceDelta?: number;

  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;
}
