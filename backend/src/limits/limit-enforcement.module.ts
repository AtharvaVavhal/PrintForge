import { Module } from '@nestjs/common';
import { EntitlementModule } from '../entitlements/entitlement.module';
import { UsageModule } from '../usage/usage.module';
import { LimitEnforcementService } from './limit-enforcement.service';

/**
 * Phase 6 W5 — composes `EntitlementModule` (W2) + `UsageModule` (W3) into
 * the one limit-enforcement primitive resource services depend on.
 * Imported by `ProductsModule`/`TeamModule` (this wave's two real
 * integration points) the same way any other cross-cutting service module
 * is imported elsewhere in this codebase (`AuditModule` into nearly every
 * domain module).
 */
@Module({
  imports: [EntitlementModule, UsageModule],
  providers: [LimitEnforcementService],
  exports: [LimitEnforcementService],
})
export class LimitEnforcementModule {}
