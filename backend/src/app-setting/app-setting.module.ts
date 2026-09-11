import { Module } from '@nestjs/common';
import { AuditModule } from '../common/audit/audit.module';
import { StorefrontTenantResolver } from '../common/tenant/storefront-tenant.resolver';
import { AppSettingController } from './app-setting.controller';
import { AppSettingService } from './app-setting.service';

@Module({
  imports: [AuditModule],
  controllers: [AppSettingController],
  // StorefrontTenantResolver: Phase 5 W9 — the public GET /settings* routes
  // now resolve tenant identity themselves (never from the request),
  // mirroring CartModule/UploadsModule's own convention of declaring this
  // resolver directly in each consuming module rather than via a shared
  // exported module.
  providers: [AppSettingService, StorefrontTenantResolver],
  exports: [AppSettingService],
})
export class AppSettingModule {}
