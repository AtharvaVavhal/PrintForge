import { Module } from '@nestjs/common';
import { AuditModule } from '../common/audit/audit.module';
import { DomainHostingModule } from '../common/tenant/store-domain-resolution/hosting/domain-hosting.module';
import { StoreDomainResolutionModule } from '../common/tenant/store-domain-resolution/store-domain-resolution.module';
import { StoreDomainVerificationModule } from './store-domain-verification.module';
import { StoreDomainsController } from './store-domains.controller';
import { StoreDomainsService } from './store-domains.service';

/**
 * Phase 9 W5 + W6 — merchant custom-domain onboarding, on-demand
 * verification, set-primary, remove and TLS refresh (spec §6.1–§6.3, §7). Tenant Control Plane, same tier as
 * `PaymentAccountsModule` / `TeamModule`: depends on `AuditModule` (the
 * append-only `TenantAuditLog` write path), the W5
 * `StoreDomainVerificationModule` (the shared DNS check), and W3's
 * `StoreDomainResolutionModule` (only for `StoreDomainLookupCache`, so
 * every write busts the host→row cache — spec §4.6), and W6's
 * `DomainHostingModule` (the provider-neutral TLS seam, §7.1). It imports no
 * platform module and no platform module imports it (Master Plan §11).
 */
@Module({
  imports: [
    AuditModule,
    StoreDomainVerificationModule,
    StoreDomainResolutionModule,
    DomainHostingModule,
  ],
  controllers: [StoreDomainsController],
  providers: [StoreDomainsService],
})
export class StoreDomainsModule {}
