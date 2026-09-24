import { IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { STOREFRONT_RESOLUTION_MODES } from '../storefront-resolution-mode.constants';
import type { StorefrontResolutionMode } from '../storefront-resolution-mode.constants';

/**
 * PUT /platform/config/storefront-domain-resolution (Phase 9 W2; spec §15
 * "Who may flip"). `mode` is constrained to the two valid values here so
 * an invalid value is a 400 at the edge (spec §14.3: "the platform write
 * route rejects an invalid value with 400") — the only way the stored row
 * can become invalid is a direct database edit. `justification` is
 * required, matching `SuspendTenantDto`: flipping the storefront resolver
 * is exactly the class of deliberate, audited platform action a bare
 * audit row would fail to explain.
 */
export class SetStorefrontResolutionModeDto {
  @IsIn(STOREFRONT_RESOLUTION_MODES)
  mode: StorefrontResolutionMode;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  justification: string;
}
