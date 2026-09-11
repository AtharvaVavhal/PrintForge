import { Module } from '@nestjs/common';
import { AuditModule } from '../common/audit/audit.module';
import { PlatformController } from './platform.controller';
import { PlatformService } from './platform.service';

/**
 * Platform Control Plane (SaaS Master Plan §11; Phase 5 W3) — base-layer,
 * same tier as `NotificationsModule`/`AppSettingModule` in `app.module.ts`'s
 * dependency graph: depends only on `AuditModule` (W2) and the globally-
 * provided `PrismaService`, and nothing else depends on it yet. Sits
 * alongside `AdminModule` (the Tenant Control Plane) as its physically
 * separate platform-side counterpart — this module never imports
 * `AdminModule` and vice versa.
 */
@Module({
  imports: [AuditModule],
  controllers: [PlatformController],
  providers: [PlatformService],
})
export class PlatformModule {}
