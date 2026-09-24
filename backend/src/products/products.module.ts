import { Module } from '@nestjs/common';
import { StoreDomainResolutionModule } from '../common/tenant/store-domain-resolution/store-domain-resolution.module';
import { AuditModule } from '../common/audit/audit.module';
import { LimitEnforcementModule } from '../limits/limit-enforcement.module';
import { UploadsModule } from '../uploads/uploads.module';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { CategoriesController } from './categories/categories.controller';
import { CustomizationValidationService } from './customizations/customization-validation.service';

/**
 * Depends on: uploads (product images reference uploaded_files;
 * CustomizationValidationService reuses UploadsService for the file-owner
 * check on file-type customization fields, §9). Categories, variants and
 * customization-fields are sub-concerns of the products aggregate (§8/§9),
 * not separate top-level modules — kept as subfolders. CategoriesController
 * is one of those subfolder concerns but still needs its own @Controller
 * since `/categories` is a distinct top-level path from `/products`; it
 * shares ProductsService rather than getting its own.
 *
 * CustomizationValidationService is exported (not routed to any HTTP
 * endpoint) so Cart (Phase 4) can import ProductsModule and call it when a
 * customer adds a customized item — this module owns the field-definition
 * CRUD and per-value validation/surcharge math; Cart owns applying it to a
 * cart line and the checkout-level pricing rollup (§11/§17).
 */
@Module({
  // Phase 9 W4: public catalog reads take their store scope from
  // `StoreDomainResolutionModule`'s `StoreContextService`.
  imports: [
    UploadsModule,
    AuditModule,
    LimitEnforcementModule,
    StoreDomainResolutionModule,
  ],
  controllers: [ProductsController, CategoriesController],
  providers: [ProductsService, CustomizationValidationService],
  exports: [ProductsService, CustomizationValidationService],
})
export class ProductsModule {}
