import { Module } from '@nestjs/common';
import { AuditService } from './audit.service';

/**
 * Base-layer domain module (SaaS Master Plan §11; Phase 5 decision P5-D3) —
 * owns only the WRITE path for the two frozen audit models
 * (`PlatformAuditLog`, `TenantAuditLog`). Read endpoints belong to the
 * platform/tenant control planes that consume them (Phase 5 W3/W8), not
 * this module — mirrors how `NotificationsModule` owns only the outbox
 * INSERT helper, never a read surface.
 */
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
