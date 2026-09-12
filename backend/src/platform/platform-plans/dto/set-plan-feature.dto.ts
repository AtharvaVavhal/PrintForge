import { IsBoolean } from 'class-validator';

/** PATCH /platform/plans/:id/features/:featureKey. `featureKey` itself is
 * a route param, validated against the code-defined catalogue by the
 * service — never part of the body, never free-text here. */
export class SetPlanFeatureDto {
  @IsBoolean()
  enabled: boolean;
}
