import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  MaxLength,
} from 'class-validator';

/**
 * PATCH /platform/plans/:id. Deliberately excludes `key` (immutable — see
 * CreatePlanDto) and `isActive` (archive/restore are their own dedicated
 * routes, same reasoning `ProductsController`'s `DELETE`/`reactivate`
 * pair already establishes for `Product.isActive` rather than folding a
 * lifecycle flip into a generic PATCH body).
 */
export class UpdatePlanDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string;

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
