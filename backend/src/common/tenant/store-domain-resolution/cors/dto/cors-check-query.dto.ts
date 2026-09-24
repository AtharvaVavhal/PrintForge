import { IsString, MaxLength, MinLength } from 'class-validator';

/**
 * `GET /platform/config/cors-check?origin=<origin>` (Phase 9 W7; spec §9).
 * Bounds the raw input only — every syntax rule that matters is the
 * predicate's own (`parseStorefrontOrigin`), and the whole point of the
 * dry-run is to observe the predicate's verdict on a MALFORMED origin too, so
 * this DTO must not pre-reject one.
 */
export class CorsCheckQueryDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2048)
  origin: string;
}
