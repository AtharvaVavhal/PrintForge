import { Module } from '@nestjs/common';
import { AuditModule } from '../../common/audit/audit.module';
import { DomainHostingModule } from '../../common/tenant/store-domain-resolution/hosting/domain-hosting.module';
import { StoreDomainResolutionModule } from '../../common/tenant/store-domain-resolution/store-domain-resolution.module';
import { StoreDomainVerificationModule } from '../../store-domains/store-domain-verification.module';
import { PlatformDomainsController } from './platform-domains.controller';
import { PlatformDomainsService } from './platform-domains.service';

/**
 * Phase 9 W5 + W6 — the Platform Control Plane's store-domain surface:
 * list / inspect / revoke / override / re-verify / remove (spec §6.4;
 * ⚖️ P9-D5, ⚖️ P9-S7). Composed into `PlatformModule`
 * exactly as `PlatformPlansModule` / `PlatformConfigModule` are, so the whole
 * Platform Control Plane stays one composition root.
 *
 * Imports the shared `StoreDomainVerificationModule` (the ONE verification
 * primitive, so the platform re-verify applies the identical rule as the
 * merchant verify) and W3's `StoreDomainResolutionModule` for
 * `StoreDomainLookupCache` — a revoke must bust the host→row cache or the
 * domain would keep serving for up to one TTL (spec §4.6, test R-11).
 * It does NOT import `StoreDomainsModule`: the two control planes never
 * import each other (Master Plan §11).
 */
@Module({
  imports: [
    AuditModule,
    StoreDomainVerificationModule,
    StoreDomainResolutionModule,
    DomainHostingModule,
  ],
  controllers: [PlatformDomainsController],
  providers: [PlatformDomainsService],
})
export class PlatformDomainsModule {}
