import { Module } from '@nestjs/common';
import { UsageService } from './usage.service';

/**
 * Phase 6 W3 — the usage engine module. Exports `UsageService` for a later
 * wave to consume: W5 will compose `reserve()`/`decrement()` with
 * resource-creation transactions (Product/TeamMembership/Order/
 * UploadedFile), the same way `AdminModule` already imports
 * `CouponsModule`/`ReviewsModule`/etc. for their own services. Deliberately
 * NOT imported anywhere yet (including `app.module.ts`) — W3 builds no
 * controller, no route, and wires no application-resource creation path;
 * nothing in the running application needs this module today. No
 * providers beyond the service itself — depends only on the
 * globally-provided `PrismaService`.
 */
@Module({
  providers: [UsageService],
  exports: [UsageService],
})
export class UsageModule {}
