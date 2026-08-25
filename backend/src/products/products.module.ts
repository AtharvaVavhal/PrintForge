import { Module } from '@nestjs/common';
import { UploadsModule } from '../uploads/uploads.module';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';

/**
 * Depends on: uploads (product images reference uploaded_files). Categories,
 * variants and customization-fields are sub-concerns of the products
 * aggregate (§8/§9), not separate top-level modules — kept as subfolders.
 */
@Module({
  imports: [UploadsModule],
  controllers: [ProductsController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
