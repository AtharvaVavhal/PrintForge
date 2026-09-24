import { Module } from '@nestjs/common';
import { AuditModule } from '../common/audit/audit.module';
import { PlatformController } from './platform.controller';
import { PlatformService } from './platform.service';
import { PlatformConfigModule } from './platform-config/platform-config.module';
import { PlatformDomainsModule } from './platform-domains/platform-domains.module';
import { PlatformPlansModule } from './platform-plans/platform-plans.module';

/**
 * Platform Control Plane (SaaS Master Plan §11; Phase 5 W3) — base-layer,
 * same tier as `NotificationsModule`/`AppSettingModule` in `app.module.ts`'s
 * dependency graph: depends only on `AuditModule` (W2) and the globally-
 * provided `PrismaService`, and nothing else depends on it yet. Sits
 * alongside `AdminModule` (the Tenant Control Plane) as its physically
 * separate platform-side counterpart — this module never imports
 * `AdminModule` and vice versa.
 *
 * `PlatformPlansModule` (Phase 6 W1) is imported here rather than directly
 * by `app.module.ts` so the whole Platform Control Plane — tenant
 * suspend/resume/audit (`PlatformController`) plus catalogue CRUD
 * (`PlatformPlansController`) — stays one composition root.
 * `PlatformConfigModule` (Phase 9 W2 — the P9-D8 storefront domain-
 * resolution kill-switch, `PlatformConfigController`) and
 * `PlatformDomainsModule` (Phase 9 W5 — the P9-S7 store-domain revoke/
 * override/re-verify surface, `PlatformDomainsController`) are composed here
 * for the same reason.
 */
@Module({
  imports: [
    AuditModule,
    PlatformPlansModule,
    PlatformConfigModule,
    PlatformDomainsModule,
  ],
  controllers: [PlatformController],
  providers: [PlatformService],
})
export class PlatformModule {}
