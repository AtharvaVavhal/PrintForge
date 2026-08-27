import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * `productId` identifies which product this review is for — `orderItemId`
 * is deliberately NOT a client-supplied field here. The verified-purchase
 * anchor is resolved server-side (OrdersService.findDeliveredOrderItemForProduct)
 * from the caller's own id + this productId, never trusted from the
 * request (§24 invariant 12 — every client-supplied reference is
 * re-validated server-side, not just checked for existence; here there's
 * no client-supplied reference at all to re-validate).
 */
export class CreateReviewDto {
  @IsUUID()
  productId: string;

  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  bodyText?: string;
}
