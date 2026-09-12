import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

/**
 * POST /platform/tenants/:tenantId/overrides. `tenantId` is a route
 * param, never part of the body (the caller never chooses which tenant an
 * override applies to via a body field). Exactly one of `featureKey`/
 * `limitKey` must be present — enforced here at the DTO layer (a clean
 * 400) AND, as the actual authority, by the database `CHECK` constraint —
 * the service performs the same check a third time before the write, so
 * no layer silently trusts the one before it.
 *
 * A feature override carries `boolValue` only; a limit override carries
 * `intValue` only (`null` = unlimited, the "REQUIRED but may be null"
 * shape from `SetPlanLimitDto`, same reasoning). Supplying the wrong
 * value field for the given key type (e.g. `intValue` on a feature
 * override) is rejected by the service, not merely ignored.
 */
export class CreateEntitlementOverrideDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  featureKey?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  limitKey?: string;

  @IsOptional()
  @IsBoolean()
  boolValue?: boolean;

  @ValidateIf(
    (o: CreateEntitlementOverrideDto) =>
      o.intValue !== undefined && o.intValue !== null,
  )
  @IsInt()
  @Min(0)
  intValue?: number | null;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;
}
