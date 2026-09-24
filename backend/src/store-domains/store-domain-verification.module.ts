import { Module } from '@nestjs/common';
import {
  DOMAIN_DNS_RESOLVER,
  NodeDnsResolver,
} from './dns/domain-dns-resolver';
import { StoreDomainVerificationCheck } from './store-domain-verification-check.service';

/**
 * Phase 9 W5 — the ONE on-demand verification primitive (spec §6.3; P9-D7),
 * packaged on its own so BOTH control planes can apply the identical rule
 * without either importing the other:
 *
 *   `StoreDomainsModule`        (Tenant Control Plane, /admin/store-domains)
 *   `PlatformDomainsModule`     (Platform Control Plane, /platform/domains)
 *
 * The SaaS Master Plan §11 separation ("neither control plane imports the
 * other" — `app.module.ts`, `platform.module.ts`) is why this is a third,
 * shared, controller-less module rather than the merchant module exporting
 * its own check to the platform module.
 *
 * `DOMAIN_DNS_RESOLVER` is a token, not a class dependency, so the e2e
 * suite swaps in `FakeDnsResolver` (test support) exactly as
 * `BILLING_PROVIDER`/`CloudinaryService` are swapped — that is what lets
 * P9-S7's "no DNS call was made" assertion be a real, observed fact.
 */
@Module({
  providers: [
    { provide: DOMAIN_DNS_RESOLVER, useClass: NodeDnsResolver },
    StoreDomainVerificationCheck,
  ],
  exports: [StoreDomainVerificationCheck],
})
export class StoreDomainVerificationModule {}
