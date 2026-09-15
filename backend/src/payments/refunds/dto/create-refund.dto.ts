import { IsNumberString, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * P8-11 — `POST /admin/payment-attempts/:id/refund`. `amountPaise` is a
 * client-supplied bigint-paise STRING (never a JS `number` — same
 * precision discipline as every other paise field in this codebase),
 * deliberately optional: omitted means "refund the full remaining
 * refundable balance" (§ RefundsService.resolveRequestedAmount). Digits
 * only (`no_symbols`) — no sign, no decimal point; a refund amount is
 * always a non-negative integer number of paise, validated positive
 * (never zero/negative) by the service, not this DTO, since "positive"
 * depends on nothing this DTO alone can express.
 */
export class CreateRefundDto {
  @IsOptional()
  @IsNumberString({ no_symbols: true })
  amountPaise?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
