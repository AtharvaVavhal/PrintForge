import { Module } from '@nestjs/common';
import { EntitlementService } from './entitlement.service';

/**
 * Phase 6 W2 — the entitlement engine module. Exports `EntitlementService`
 * for a later, separately-authorized wave to consume: W6 owns `GET
 * /admin/subscription|usage|entitlements` and will import this module into
 * `AdminModule` the same way `AdminModule` already imports `CouponsModule`/
 * `ReviewsModule`/etc. for their own services. Deliberately NOT imported
 * anywhere yet (including `app.module.ts`) — W2 builds no controller and no
 * route, so nothing in the running application needs this module wired in
 * today; it exists purely so `EntitlementService` is composable once W6
 * needs it. No providers beyond the service itself — no controller, no
 * dependency on `AuditModule`/`PlatformModule`/`AdminModule` (this module
 * depends only on the globally-provided `PrismaService`).
 */
@Module({
  providers: [EntitlementService],
  exports: [EntitlementService],
})
export class EntitlementModule {}
