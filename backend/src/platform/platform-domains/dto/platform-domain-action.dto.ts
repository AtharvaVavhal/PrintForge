import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/**
 * Body for every `POST /platform/domains/:id/*` mutation (Phase 9 W5; spec
 * §6.4 "every mutation written to `PlatformAuditLog` … with `justification`
 * required"). Identical shape and rationale to `SuspendTenantDto` — a bare,
 * unexplained revoke/restore/re-verify audit row would defeat the point of
 * auditing a platform reach-in to one tenant's domain at all (P9-S7 ties
 * both revoke AND restore to an explicit platform authorization).
 */
export class PlatformDomainActionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  justification: string;
}
