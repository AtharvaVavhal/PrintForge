import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/**
 * POST /platform/tenants/:id/suspend. The frozen Phase 5 plan does not
 * pin an exact request DTO for this route — `justification` is required
 * here (not merely optional) because suspending a tenant is exactly the
 * class of "action that reaches into a specific tenant's context" §11's
 * SECURITY IMPACT section ties a justification to, and because a bare,
 * unexplained suspend/resume audit row would defeat the point of auditing
 * it in the first place.
 */
export class SuspendTenantDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  justification: string;
}
