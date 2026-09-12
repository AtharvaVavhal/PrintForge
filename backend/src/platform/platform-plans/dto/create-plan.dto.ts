import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * POST /platform/plans. `key` is immutable after creation (same convention
 * as `Coupon.code`/`Coupon.type` — UpdateCouponDto excludes them entirely
 * rather than merely ignoring an attempt to change them), so it lives only
 * here, never on `UpdatePlanDto`. Lowercase-slug-shaped by convention
 * (matches the existing seeded `free` key) — enforced so a plan key can
 * never collide case-insensitively with another or contain characters an
 * `EntitlementService` (Phase 6 W2) importer would need to escape.
 */
export class CreatePlanDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  @Matches(/^[a-z][a-z0-9_]*$/, {
    message:
      'key must be lowercase alphanumeric/underscore, starting with a letter',
  })
  key: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isEnterpriseCustom?: boolean;
}
