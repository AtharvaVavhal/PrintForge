import { Controller } from '@nestjs/common';
import { OrdersService } from './orders.service';

/**
 * Owns (§20): GET /orders, GET /orders/:id — Auth (owner only).
 * Admin order routes live in the admin module (§19), not here.
 *
 * TODO(orders): implement.
 */
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}
}
