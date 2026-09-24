import { Module } from '@nestjs/common';
import { AuditModule } from '../common/audit/audit.module';
import { StoreDomainResolutionModule } from '../common/tenant/store-domain-resolution/store-domain-resolution.module';
import { AppSettingController } from './app-setting.controller';
import { AppSettingService } from './app-setting.service';

@Module({
  // StoreDomainResolutionModule: Phase 9 W3 — the public GET /settings*
  // routes resolve their storefront scope through `StoreContextService`
  // (never from a client-supplied id). Phase 5 W9 declared
  // `StorefrontTenantResolver` directly in each consuming module; W3
  // centralises both strategies behind one exported module.
  imports: [AuditModule, StoreDomainResolutionModule],
  controllers: [AppSettingController],
  providers: [AppSettingService],
  exports: [AppSettingService],
})
export class AppSettingModule {}
