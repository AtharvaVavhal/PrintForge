import { Module } from '@nestjs/common';
import { PlatformConfigModule } from '../../../platform/platform-config/platform-config.module';
import { StorefrontTenantResolver } from '../storefront-tenant.resolver';
import { StoreContextService } from './store-context.service';
import { StoreDomainLookupCache } from './store-domain-lookup.cache';
import { StoreDomainResolver } from './store-domain-resolver.service';

/**
 * Phase 9 W3 — storefront domain resolution (spec §4, §4.7). Composes the
 * two strategies behind one façade (`StoreContextService`):
 * `StoreDomainResolver` (the `host_resolution` pipeline, §4.3) and the
 * pre-Phase-9 `StorefrontTenantResolver` (the `legacy_single_store`
 * strategy, §4.5 — previously provided separately by the cart, uploads
 * and app-setting modules; now provided once here). Mode comes from the
 * W2 kill-switch (`PlatformConfigModule`).
 *
 * `StoreDomainLookupCache` and `StoreDomainResolver` are exported so the
 * W5/W6 `StoreDomain` write paths can bust the cache and the W4 public
 * reads can resolve without going through the request façade.
 */
@Module({
  imports: [PlatformConfigModule],
  providers: [
    StoreDomainLookupCache,
    StoreDomainResolver,
    StorefrontTenantResolver,
    StoreContextService,
  ],
  exports: [StoreContextService, StoreDomainLookupCache, StoreDomainResolver],
})
export class StoreDomainResolutionModule {}
