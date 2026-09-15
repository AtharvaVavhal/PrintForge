import { PaymentAccountMode, PaymentProviderType } from '@prisma/client';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

/**
 * POST /admin/payment-accounts (P8-4). `storeId` is OPTIONAL — when
 * omitted, the tenant's primary store is resolved server-side via the
 * existing `resolvePrimaryStoreId()` helper (D11 ownership model), the
 * same v1-baseline "exactly one primary store per tenant" assumption
 * `checkout.service.ts` already relies on. When supplied, it is validated
 * server-side against the caller's own `TenantContext.tenantId` before
 * use (`PaymentAccountsService.assertStoreInTenant`) — never trusted
 * as-is.
 *
 * No `tenantId` field — the target tenant is exclusively the caller's
 * server-derived `TenantContext.tenantId` (the global ValidationPipe's
 * `forbidNonWhitelisted` rejects any attempt to add one), same discipline
 * `InviteTeamMemberDto` already establishes.
 *
 * No `credentialsEncrypted`/credential field of any kind (P8-4 scope:
 * schema + lifecycle only — no encryption utility or credential-attachment
 * flow exists yet; see `PaymentAccount`'s own schema comment).
 */
export class CreatePaymentAccountDto {
  @IsOptional()
  @IsUUID()
  storeId?: string;

  @IsEnum(PaymentProviderType)
  provider: PaymentProviderType;

  @IsEnum(PaymentAccountMode)
  mode: PaymentAccountMode;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  displayName?: string;
}
