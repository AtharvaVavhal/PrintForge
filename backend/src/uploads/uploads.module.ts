import { Module } from '@nestjs/common';
import { StorefrontTenantResolver } from '../common/tenant/storefront-tenant.resolver';
import { UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';
import { CloudinaryService } from './cloudinary/cloudinary.service';

/**
 * Base-layer domain module — depends on no other domain module.
 * Backend-proxied uploads only (no unsigned direct-to-Cloudinary) — §22.
 */
@Module({
  controllers: [UploadsController],
  providers: [UploadsService, CloudinaryService, StorefrontTenantResolver],
  exports: [UploadsService],
})
export class UploadsModule {}
