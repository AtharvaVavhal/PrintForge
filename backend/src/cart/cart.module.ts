import { Module } from '@nestjs/common';
import { ProductsModule } from '../products/products.module';
import { UploadsModule } from '../uploads/uploads.module';
import { StorefrontTenantResolver } from '../common/tenant/storefront-tenant.resolver';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';

/**
 * Depends on: products (variant/price lookups), uploads (customization file
 * ownership re-check). Cart is always server-side — no guest cart, no
 * client-side cart context (§10/§17).
 */
@Module({
  imports: [ProductsModule, UploadsModule],
  controllers: [CartController],
  providers: [CartService, StorefrontTenantResolver],
  exports: [CartService],
})
export class CartModule {}
