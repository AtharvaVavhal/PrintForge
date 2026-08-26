import { IsInt, Min } from 'class-validator';

/** Quantity is the only mutable field on a cart line (§20). */
export class UpdateCartItemDto {
  @IsInt()
  @Min(1)
  quantity: number;
}
