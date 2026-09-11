import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Min, Max } from 'class-validator';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/**
 * GET /platform/audit — deliberately minimal (§ "do not invent a large
 * reporting/search system"): pagination plus one optional filter
 * (`tenantId`, the one dimension §11's VERIFICATION criteria actually
 * exercises — "SUPER_ADMIN can ... read audit logs"). No date-range/
 * action/actor filtering in W3; add only if a real need appears later.
 */
export class ListPlatformAuditQueryDto {
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
}
