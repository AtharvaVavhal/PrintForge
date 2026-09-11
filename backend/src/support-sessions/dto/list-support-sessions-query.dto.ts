import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsUUID, Min, Max } from 'class-validator';

/** Mirrors `ListPlatformAuditQueryDto`'s exact pagination + single-filter
 * convention — deliberately minimal, no date-range/actor filtering. */
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export type SupportSessionStatusFilter = 'ACTIVE' | 'REVOKED' | 'EXPIRED';

export class ListSupportSessionsQueryDto {
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
  @IsUUID()
  tenantId?: string;

  /** Computed, not stored (see `SupportSession`'s own schema comment) —
   * filtered in application code after the page is loaded is NOT how this
   * is implemented (that would break pagination); instead the service
   * translates this into the equivalent `revokedAt`/`expiresAt` `WHERE`
   * clause. */
  @IsOptional()
  @IsEnum(['ACTIVE', 'REVOKED', 'EXPIRED'])
  status?: SupportSessionStatusFilter;
}
