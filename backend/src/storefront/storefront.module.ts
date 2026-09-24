import { Module } from '@nestjs/common';
import { StoreDomainResolutionModule } from '../common/tenant/store-domain-resolution/store-domain-resolution.module';
import { StorefrontContextController } from './storefront-context.controller';
import { StorefrontContextService } from './storefront-context.service';

/**
 * Phase 9 W4 — the storefront bootstrap surface (`GET /storefront/context`).
 * Base-layer: depends only on the W3 resolution module and the globally
 * provided `PrismaService`. The `/storefront/auth/*` family that P2-D6
 * reserved under this same prefix is Phase 12 (P9-D1) and is NOT here.
 */
@Module({
  imports: [StoreDomainResolutionModule],
  controllers: [StorefrontContextController],
  providers: [StorefrontContextService],
})
export class StorefrontModule {}
