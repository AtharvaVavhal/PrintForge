import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Deliberately excludes `code`, `type`, `percentageOff`, `flatAmountOff`,
 * `scopeType`, `categoryId` — the coupon's fixed identity, immutable
 * after creation (CreateCouponDto's own doc comment). Only limits, the
 * date window, the active flag, and the admin-internal description are
 * editable. whitelist:true + forbidNonWhitelisted:true (main.ts) rejects
 * any of those excluded fields with a 400, the same way UpdateProfileDto
 * rejects `email`.
 */
export class UpdateCouponDto {
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  minOrderValue?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  usageLimitTotal?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  usageLimitPerUser?: number;

  @IsOptional()
  @IsBoolean()
  firstOrderOnly?: boolean;

  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}
