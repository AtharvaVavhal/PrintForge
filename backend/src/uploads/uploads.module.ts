import { Module } from '@nestjs/common';
import { StorefrontTenantResolver } from '../common/tenant/storefront-tenant.resolver';
import { LimitEnforcementModule } from '../limits/limit-enforcement.module';
import { UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';
import { CloudinaryService } from './cloudinary/cloudinary.service';

/**
 * Base-layer domain module — depends on no other domain module besides
 * Phase 6 W5's `LimitEnforcementModule` (`storage_mb` enforcement, P6-D4).
 * Backend-proxied uploads only (no unsigned direct-to-Cloudinary) — §22.
 */
@Module({
  imports: [LimitEnforcementModule],
  controllers: [UploadsController],
  providers: [UploadsService, CloudinaryService, StorefrontTenantResolver],
  exports: [UploadsService],
})
export class UploadsModule {}
