import { Module } from '@nestjs/common';
import { PlatformConfigModule } from '../../../../platform/platform-config/platform-config.module';
import { StoreDomainResolutionModule } from '../store-domain-resolution.module';
import { StorefrontCorsController } from './storefront-cors.controller';
import { StorefrontCorsPolicy } from './storefront-cors.policy';

/**
 * Phase 9 W7 — the CORS predicate and its `@PlatformOnly()` dry-run route
 * (spec §9). Imports the W2 kill-switch (for S-9 mode coupling) and the W3
 * resolution module (for the shared `§4.6` cached lookup) — it introduces no
 * host-resolution logic of its own.
 *
 * Exported so `main.ts` can pull `StorefrontCorsPolicy` out of the container
 * after `NestFactory.create` and hand it to `enableCors`.
 */
@Module({
  imports: [PlatformConfigModule, StoreDomainResolutionModule],
  controllers: [StorefrontCorsController],
  providers: [StorefrontCorsPolicy],
  exports: [StorefrontCorsPolicy],
})
export class StorefrontCorsModule {}
