import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { CouponScopeType, CouponType } from '@prisma/client';

/**
 * `code`/`type`/`percentageOff`/`flatAmountOff`/`scopeType`/`categoryId`
 * are the coupon's fixed identity — set once here, never editable via
 * UpdateCouponDto (PHASE-10-PROPOSAL.md §2.1/§2.2), same "exactly one
 * path changes this" discipline as `orderNumber`. `code` is validated as
 * typed (any case accepted) — CouponsService normalizes to uppercase
 * before storage/lookup, mirroring how email is lowercased in
 * AuthService rather than forced by a DTO regex.
 *
 * Cross-field rules (percentageOff required iff type=PERCENTAGE,
 * categoryId required iff scopeType=CATEGORY, etc.) are validated in
 * CouponsService.createCoupon, not here via @ValidateIf — centralizes
 * that business logic in one testable place, same as
 * CheckoutService.assertItemsCheckoutable.
 */
export class CreateCouponDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  @Matches(/^[A-Za-z0-9_-]+$/, {
    message:
      'code must contain only letters, numbers, hyphens, and underscores',
  })
  code: string;

  @IsEnum(CouponType)
  type: CouponType;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  percentageOff?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  flatAmountOff?: number;

  @IsEnum(CouponScopeType)
  scopeType: CouponScopeType;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

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
  @IsString()
  @MaxLength(500)
  description?: string;
}
