import { IsInt, Min, ValidateIf } from 'class-validator';

/**
 * PATCH /platform/plans/:id/limits/:limitKey. `limitKey` is a route param,
 * validated against the code-defined catalogue by the service.
 * `period` is never client-supplied — the service derives it from the
 * ratified `LIMIT_KEY_PERIODS` table for the given `limitKey`, so a
 * limit's period classification can never drift per-plan.
 *
 * `limitValue` is REQUIRED but may be the literal `null` — never
 * `undefined` — to mean "unlimited" (the same NULL-is-unlimited
 * convention `PlanLimit.limitValue` and `TenantEntitlementOverride
 * .intValue` both already use). `@ValidateIf` rather than `@IsOptional`
 * because this field must always be explicitly present in the body; a
 * caller cannot omit it and get a default.
 */
export class SetPlanLimitDto {
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(0)
  limitValue: number | null;
}
