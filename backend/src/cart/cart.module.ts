import { Module } from '@nestjs/common';
import { ProductsModule } from '../products/products.module';
import { UploadsModule } from '../uploads/uploads.module';
import { StoreDomainResolutionModule } from '../common/tenant/store-domain-resolution/store-domain-resolution.module';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';

/**
 * Depends on: products (variant/price lookups), uploads (customization file
 * ownership re-check). Cart is always server-side — no guest cart, no
 * client-side cart context (§10/§17).
 */
@Module({
  imports: [ProductsModule, UploadsModule, StoreDomainResolutionModule],
  controllers: [CartController],
  providers: [CartService],
  exports: [CartService],
})
export class CartModule {}
