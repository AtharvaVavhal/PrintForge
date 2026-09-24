import { IsIn, IsString, MaxLength } from 'class-validator';
import type { DomainVerificationMethod } from '@prisma/client';

/**
 * POST /admin/store-domains (Phase 9 W5; spec §6.1 "Add hostname"). The
 * hostname is validated for syntax/policy in the service (spec §6.2) after
 * normalisation — the DTO only bounds the raw input. `verificationMethod`
 * is one of the two P9-D2-ratified methods.
 */
export class AddStoreDomainDto {
  @IsString()
  @MaxLength(253)
  hostname: string;

  @IsIn(['DNS_TXT', 'CNAME'])
  verificationMethod: DomainVerificationMethod;
}
