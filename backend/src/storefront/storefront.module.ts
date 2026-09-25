import { Module } from '@nestjs/common';
import { StoreDomainResolutionModule } from '../common/tenant/store-domain-resolution/store-domain-resolution.module';
import { StorefrontContextController } from './storefront-context.controller';
import { StorefrontContextService } from './storefront-context.service';
import { StorefrontSeoController } from './seo/storefront-seo.controller';
import { StorefrontSeoService } from './seo/storefront-seo.service';

/**
 * Phase 9 — the storefront surface: the W4 bootstrap
 * (`GET /storefront/context`) and the §12.1 per-store crawler files
 * (`GET /storefront/seo/robots.txt`, `GET /storefront/seo/sitemap.xml`).
 *
 * Base-layer: depends only on the W3 resolution module and the globally
 * provided `PrismaService`. The `/storefront/auth/*` family that P2-D6
 * reserved under this same prefix is Phase 12 (P9-D1) and is NOT here.
 */
@Module({
  imports: [StoreDomainResolutionModule],
  controllers: [StorefrontContextController, StorefrontSeoController],
  providers: [StorefrontContextService, StorefrontSeoService],
})
export class StorefrontModule {}
