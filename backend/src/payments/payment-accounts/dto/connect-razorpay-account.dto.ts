import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * POST /admin/payment-accounts/:id/connect (P8-5). All fields optional —
 * `PaymentAccountConnectionService` supports two request shapes from this
 * one DTO, so "submit credentials" and "test/verify the connection" (task
 * scope item 6) stay one cohesive endpoint rather than two:
 *  - `keyId` + `keySecret` (+ optional `webhookSecret`) present: submit
 *    new credentials, verify them against Razorpay, and persist + activate
 *    ONLY on success.
 *  - all three omitted: re-verify the already-stored credentials ("test
 *    connection"), no new persistence.
 * A request with only ONE of `keyId`/`keySecret` is rejected (400) by
 * `PaymentAccountConnectionService` — class-validator alone can't express
 * "both or neither" cleanly here without a custom validator that would be
 * more code than the two-line runtime check it replaces.
 *
 * Never logged, never echoed back into any response or audit-log metadata
 * (see `PaymentAccountConnectionService`, `RazorpayAccountVerifierService`,
 * `PaymentAccountsService.configureCredentials`). The global
 * `ValidationPipe`'s `forbidNonWhitelisted` (main.ts) rejects any field not
 * declared here.
 */
export class ConnectRazorpayAccountDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  keyId?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  keySecret?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  webhookSecret?: string;
}
