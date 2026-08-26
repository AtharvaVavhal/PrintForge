import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Only the single MVP address fields + phone — never email, role,
 * isActive, tokenVersion, or any password/reset field (§15/§20/§32: no
 * standalone address endpoints, single address only, address management
 * folded into this profile update). The global ValidationPipe
 * (whitelist:true, forbidNonWhitelisted:true — main.ts) rejects any field
 * not listed here with a 400, rather than silently stripping it.
 *
 * Every field is independently optional — a PATCH updates only what's
 * provided, per field, matching a normal partial-update semantics rather
 * than requiring the full address on every call.
 *
 * Length limits mirror checkout's CreateOrderDto shipping fields
 * (src/checkout/dto/create-order.dto.ts) for consistency, since both are
 * the same postal-address shape.
 */
export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  addressLine1?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  addressLine2?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  state?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  postalCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  country?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;
}
