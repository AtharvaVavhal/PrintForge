import { Controller } from '@nestjs/common';
import { CartService } from './cart.service';

/**
 * Owns (§20): GET /cart, POST/PATCH/DELETE /cart/items[/:id] — Auth always
 * required, row-locked, no guest cart.
 *
 * TODO(cart): implement — every price/subtotal is server-computed, never
 * trusted from the client (§24 invariant 1).
 */
@Controller('cart')
export class CartController {
  constructor(private readonly cartService: CartService) {}
}
