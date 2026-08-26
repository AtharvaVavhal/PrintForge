import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Shipping address is collected directly on this request, not read from
 * the user's profile — checkout owns collecting it, not validating profile
 * completeness. Snapshotted verbatim onto the Order row at creation time
 * (§11 "Immutable shipping snapshot") — a later profile edit never affects
 * an existing order.
 */
export class CreateOrderDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  shippingRecipientName: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  shippingPhone: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  shippingAddressLine1: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  shippingAddressLine2?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  shippingCity: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  shippingState: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  shippingPostalCode: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  shippingCountry: string;
}
