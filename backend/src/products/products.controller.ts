import { Controller } from '@nestjs/common';
import { ProductsService } from './products.service';

/**
 * Owns (§20): GET /products, GET /products/:slug (Public); admin CRUD for
 * products, categories, variants, customization-fields (Admin).
 *
 * TODO(products): implement once DTOs for §8/§9 are finalized.
 */
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}
}
