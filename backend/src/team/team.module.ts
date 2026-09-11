import { Module } from '@nestjs/common';
import { AuditModule } from '../common/audit/audit.module';
import { TeamController } from './team.controller';
import { TeamService } from './team.service';

/**
 * Tenant Control Plane — Team Management (SaaS Master Plan §11; Phase 5
 * W7) — base-layer, same tier as `PlatformModule`/`SupportSessionModule`:
 * depends only on `AuditModule` (W2) and the globally-provided
 * `PrismaService`. Kept as its own module rather than folded into
 * `AdminModule`/`AdminController`, mirroring this repo's established
 * one-module-per-bounded-concern convention (reviews/coupons/app-setting/
 * platform/support-sessions are each separate top-level modules too) —
 * `AdminModule`/`AdminController`/`AdminService` are untouched by W7.
 */
@Module({
  imports: [AuditModule],
  controllers: [TeamController],
  providers: [TeamService],
})
export class TeamModule {}
