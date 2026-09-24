import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import {
  DomainVerificationStatus,
  StoreDomainType,
  TlsStatus,
} from '@prisma/client';

/**
 * GET /platform/domains (Phase 9 W6; spec §6.4 "List / filter (by
 * `verificationStatus`, `tlsStatus`, `type`, tenant)"). Pagination mirrors
 * `ListPlatformTenantsQueryDto`'s convention exactly — same defaults and
 * bounds — kept local for the same reason that file gives.
 */
export const DEFAULT_PAGE = 1;
export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

export class ListPlatformDomainsQueryDto {
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
  @IsEnum(DomainVerificationStatus)
  verificationStatus?: DomainVerificationStatus;

  @IsOptional()
  @IsEnum(TlsStatus)
  tlsStatus?: TlsStatus;

  @IsOptional()
  @IsEnum(StoreDomainType)
  type?: StoreDomainType;

  @IsOptional()
  @IsUUID()
  tenantId?: string;
}
