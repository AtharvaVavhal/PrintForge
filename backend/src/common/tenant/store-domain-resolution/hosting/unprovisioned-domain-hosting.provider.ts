import { Injectable, Logger } from '@nestjs/common';
import {
  DomainHostingProvider,
  DomainHostingStatus,
} from './domain-hosting-provider';

/**
 * Phase 9 W6 — the provider bound in production until the real Vercel adapter
 * ships (spec §7.1/§7.3; the §17.1 ops checklist items 1/3/4 and the
 * `VERCEL_*` credential are all still open, so there is nothing for an
 * adapter to talk to yet).
 *
 * It is deliberately NOT the dev `FakeDomainHostingProvider`: a fake bound in
 * production is how a domain with no certificate ends up looking serveable.
 * This class instead reports the honest state — "not configured, certificate
 * pending" — which `mapCertificateToTlsStatus` turns into `PENDING`, which
 * the §4.3 serving gate refuses for a `CUSTOM` row. So the end-to-end
 * behaviour in production today is: a merchant can add and verify a custom
 * domain, and it stays unserved until real TLS provisioning exists. That is
 * the fail-closed outcome, not a silent one — every call logs.
 *
 * `removeDomain` succeeds: there is no provider-side attachment to detach, so
 * a merchant must not be blocked from removing their own domain by the
 * absence of a hosting integration.
 */
@Injectable()
export class UnprovisionedDomainHostingProvider implements DomainHostingProvider {
  private readonly logger = new Logger(UnprovisionedDomainHostingProvider.name);

  async addDomain(hostname: string): Promise<DomainHostingStatus> {
    await Promise.resolve();
    this.logger.warn(
      `no hosting provider is configured — cannot attach '${hostname}'; TLS stays PENDING and the domain will not be served`,
    );
    return this.unconfigured();
  }

  async getDomainStatus(hostname: string): Promise<DomainHostingStatus> {
    await Promise.resolve();
    this.logger.warn(
      `no hosting provider is configured — reporting '${hostname}' as unconfigured`,
    );
    return this.unconfigured();
  }

  async removeDomain(hostname: string): Promise<void> {
    await Promise.resolve();
    this.logger.log(
      `no hosting provider is configured — nothing to detach for '${hostname}'`,
    );
  }

  private unconfigured(): DomainHostingStatus {
    return { configured: false, certificate: 'pending', cnameTarget: null };
  }
}
