import { Module } from '@nestjs/common';
import { StoreDomainResolutionModule } from '../common/tenant/store-domain-resolution/store-domain-resolution.module';
import { LimitEnforcementModule } from '../limits/limit-enforcement.module';
import { UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';
import { CloudinaryService } from './cloudinary/cloudinary.service';

/**
 * Base-layer domain module — depends on no other domain module besides
 * Phase 6 W5's `LimitEnforcementModule` (`storage_mb` enforcement, P6-D4).
 * Backend-proxied uploads only (no unsigned direct-to-Cloudinary) — §22.
 * Phase 9 W3: storefront scope for a customer upload comes from
 * `StoreDomainResolutionModule`'s `StoreContextService` (spec §4.4).
 */
@Module({
  imports: [LimitEnforcementModule, StoreDomainResolutionModule],
  controllers: [UploadsController],
  providers: [UploadsService, CloudinaryService],
  exports: [UploadsService],
})
export class UploadsModule {}
