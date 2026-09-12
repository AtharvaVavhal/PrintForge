import { Module } from '@nestjs/common';
import { AuditModule } from '../../common/audit/audit.module';
import { PlatformPlansController } from './platform-plans.controller';
import { PlatformPlansService } from './platform-plans.service';

/**
 * Phase 6 (W1) — Platform Control Plane catalogue CRUD sub-module. Same
 * dependency tier as `PlatformModule` itself: depends only on `AuditModule`
 * and the globally-provided `PrismaService`. Imported by `PlatformModule`
 * (not `app.module.ts` directly) so the whole Platform Control Plane stays
 * one composition root.
 */
@Module({
  imports: [AuditModule],
  controllers: [PlatformPlansController],
  providers: [PlatformPlansService],
})
export class PlatformPlansModule {}
