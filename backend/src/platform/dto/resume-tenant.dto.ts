import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/** POST /platform/tenants/:id/resume — same rationale as SuspendTenantDto. */
export class ResumeTenantDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  justification: string;
}
