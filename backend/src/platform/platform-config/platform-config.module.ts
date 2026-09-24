import { Module } from '@nestjs/common';
import { AuditModule } from '../../common/audit/audit.module';
import { PlatformConfigController } from './platform-config.controller';
import { StorefrontResolutionModeService } from './storefront-resolution-mode.service';

/**
 * Phase 9 W2 — platform runtime configuration (decision P9-D8; spec §15).
 * Composed into `PlatformModule` exactly as `PlatformPlansModule` is, so
 * the whole Platform Control Plane stays one composition root.
 * `StorefrontResolutionModeService` is exported because W3's storefront
 * resolver is its intended consumer; nothing consumes it yet.
 */
@Module({
  imports: [AuditModule],
  controllers: [PlatformConfigController],
  providers: [StorefrontResolutionModeService],
  exports: [StorefrontResolutionModeService],
})
export class PlatformConfigModule {}
