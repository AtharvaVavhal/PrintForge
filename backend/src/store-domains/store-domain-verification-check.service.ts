import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DomainVerificationMethod } from '@prisma/client';
import type { AppConfig } from '../common/config/configuration';
import { DnsLookupError, DOMAIN_DNS_RESOLVER } from './dns/domain-dns-resolver';
import type { DomainDnsResolver } from './dns/domain-dns-resolver';
import {
  evaluateCname,
  evaluateTxt,
  txtRecordName,
  VerificationOutcome,
} from './store-domain-verification';

export interface VerifiableDomain {
  hostname: string;
  verificationMethod: DomainVerificationMethod | null;
  verificationToken: string | null;
}

/**
 * Phase 9 W5 — runs ONE on-demand verification check (spec §6.3; P9-D7:
 * on demand only, no scheduler) and returns the outcome. Shared by the
 * merchant verify path and the platform re-verify path so both apply the
 * identical rule. Never touches the database; the caller owns the state
 * transition and the audit row.
 */
@Injectable()
export class StoreDomainVerificationCheck {
  private readonly cnameTarget: string | null;

  constructor(
    @Inject(DOMAIN_DNS_RESOLVER) private readonly dns: DomainDnsResolver,
    configService: ConfigService<AppConfig, true>,
  ) {
    this.cnameTarget = configService.get('storefrontDomains', {
      infer: true,
    }).customDomainCnameTarget;
  }

  /** The configured hosting-provider CNAME target, or `null` when unset. */
  get customDomainCnameTarget(): string | null {
    return this.cnameTarget;
  }

  async check(domain: VerifiableDomain): Promise<VerificationOutcome> {
    try {
      if (domain.verificationMethod === DomainVerificationMethod.CNAME) {
        if (this.cnameTarget === null) {
          return { passed: false, reason: 'CNAME_TARGET_NOT_CONFIGURED' };
        }
        const records = await this.dns.resolveCname(domain.hostname);
        return evaluateCname(records, this.cnameTarget);
      }
      // DNS_TXT (also the fail-safe reading of a null method: a row cannot
      // pass a TXT check without the token it was issued with).
      const records = await this.dns.resolveTxt(txtRecordName(domain.hostname));
      return evaluateTxt(records, domain.verificationToken ?? '');
    } catch (err) {
      if (err instanceof DnsLookupError) {
        return {
          passed: false,
          reason: err.kind === 'timeout' ? 'DNS_TIMEOUT' : 'DNS_ERROR',
        };
      }
      throw err;
    }
  }
}
