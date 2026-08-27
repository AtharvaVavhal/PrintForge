import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Author-only edit (PATCH /reviews/:id) — no `status` field here, ever.
 * Moderation is a separate, admin-only surface (UpdateReviewStatusDto);
 * whitelist:true, forbidNonWhitelisted:true (main.ts) rejects a `status`
 * key in this body with a 400, the same way UpdateProfileDto rejects
 * `email`.
 */
export class UpdateReviewDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  bodyText?: string;
}
