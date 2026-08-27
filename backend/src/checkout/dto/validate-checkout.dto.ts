import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

/** POST /checkout/validate (§2.2) — read-only preview against the
 * caller's current cart, no Idempotency-Key (nothing is created). */
export class ValidateCheckoutDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  @Matches(/^[A-Za-z0-9_-]+$/, {
    message:
      'couponCode must contain only letters, numbers, hyphens, and underscores',
  })
  couponCode?: string;
}
