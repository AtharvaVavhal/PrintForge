import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Min, Max } from 'class-validator';
import { TenantStatus } from '@prisma/client';

/** Mirrors admin/dto/list-admin-orders-query.dto.ts's pagination
 * convention exactly (same defaults/bounds) — kept local rather than
 * imported cross-module, since `platform` has no dependency on `admin`. */
export const DEFAULT_PAGE = 1;
export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

export class ListPlatformTenantsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = DEFAULT_PAGE;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_LIMIT)
  limit: number = DEFAULT_LIMIT;

  @IsOptional()
  @IsEnum(TenantStatus)
  status?: TenantStatus;
}
