import { Module } from '@nestjs/common';
import { UploadsModule } from '../uploads/uploads.module';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { CategoriesController } from './categories/categories.controller';

/**
 * Depends on: uploads (product images reference uploaded_files). Categories,
 * variants and customization-fields are sub-concerns of the products
 * aggregate (§8/§9), not separate top-level modules — kept as subfolders.
 * CategoriesController is one of those subfolder concerns but still needs
 * its own @Controller since `/categories` is a distinct top-level path
 * from `/products`; it shares ProductsService rather than getting its own.
 */
@Module({
  imports: [UploadsModule],
  controllers: [ProductsController, CategoriesController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
