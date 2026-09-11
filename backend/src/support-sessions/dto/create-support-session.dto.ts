import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { PERMISSIONS, Permission } from '../../auth/permissions/permission';

/**
 * POST /platform/support-sessions (Phase 5 W6). `justification` mirrors
 * `SuspendTenantDto`'s exact convention (required, not merely optional —
 * §11 SECURITY IMPACT ties a justification to any action reaching into a
 * specific tenant's context). No field here has a default: the target
 * tenant, expiration, and granted scope must always be explicit — never
 * silently chosen (P5-D8).
 */
export class CreateSupportSessionDto {
  @IsUUID()
  tenantId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  justification: string;

  /**
   * ISO-8601 timestamp. Validated as strictly in the future by
   * `SupportSessionService` (a shape check alone cannot express "future" —
   * class-validator has no built-in future-date validator, and inventing a
   * custom one for this single call site was not worth the indirection).
   */
  @IsDateString()
  expiresAt: string;

  /**
   * The permission CEILING granted to this session (P5-D8) — every value
   * must already exist in the ratified `PERMISSIONS` catalogue
   * (`auth/permissions/permission.ts`); no unknown/arbitrary string is
   * accepted, and there is no second permission catalogue anywhere in this
   * file or the service that consumes it.
   */
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsIn(PERMISSIONS, { each: true })
  grantedPermissions: Permission[];
}
