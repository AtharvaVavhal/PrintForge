import { Module } from '@nestjs/common';
import { AuditModule } from '../common/audit/audit.module';
import { SupportSessionController } from './support-session.controller';
import { SupportSessionService } from './support-session.service';

/**
 * SupportSession lifecycle (SaaS Master Plan §11; Phase 5 W6) — base-layer,
 * same tier as `PlatformModule`: depends only on `AuditModule` (W2) and the
 * globally-provided `PrismaService`, and nothing else depends on it yet.
 * Physically separate from `PlatformModule` (each Phase 5 concern gets its
 * own module, mirroring this repo's existing convention of one module per
 * bounded concern — reviews/coupons/app-setting are each their own
 * top-level module too) — this module never imports `PlatformModule`/
 * `AdminModule` and vice versa.
 */
@Module({
  imports: [AuditModule],
  controllers: [SupportSessionController],
  providers: [SupportSessionService],
})
export class SupportSessionModule {}
