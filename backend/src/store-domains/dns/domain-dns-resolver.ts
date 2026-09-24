import { Injectable } from '@nestjs/common';
import { Resolver } from 'dns/promises';

/**
 * Phase 9 W5 — the DNS seam behind on-demand domain verification (spec
 * §6.3). One tiny provider-neutral interface so the e2e suite can swap in
 * an in-memory fake (`FakeDnsResolver`, test support) and assert "no DNS
 * call was made" for a platform-revoked row (P9-S7), exactly the way
 * `CloudinaryService` / `BILLING_PROVIDER` are swapped.
 *
 * Both methods return `[]` for "no such record" (NXDOMAIN / NODATA) and
 * throw `DnsLookupError` for anything else (timeout, SERVFAIL, refused),
 * so the verification core can turn each into a distinct, retained reason
 * code without leaking resolver internals to the merchant.
 */
export const DOMAIN_DNS_RESOLVER = Symbol('DOMAIN_DNS_RESOLVER');

export interface DomainDnsResolver {
  /** TXT records for `name`, each record joined from its character strings. */
  resolveTxt(name: string): Promise<string[]>;
  /** CNAME targets for `name` (normally 0 or 1). */
  resolveCname(name: string): Promise<string[]>;
}

export class DnsLookupError extends Error {
  constructor(
    public readonly kind: 'timeout' | 'error',
    message: string,
  ) {
    super(message);
    this.name = 'DnsLookupError';
  }
}

/** Spec §6.3: bounded by a 5 s timeout; a single attempt per check. */
export const DNS_LOOKUP_TIMEOUT_MS = 5_000;

const NO_RECORD_CODES = new Set(['ENOTFOUND', 'ENODATA']);

/**
 * Production implementation over Node's built-in resolver — no new
 * dependency (spec §6.3). Uses the system's configured nameservers.
 */
@Injectable()
export class NodeDnsResolver implements DomainDnsResolver {
  private readonly resolver = new Resolver({
    timeout: DNS_LOOKUP_TIMEOUT_MS,
    tries: 1,
  });

  async resolveTxt(name: string): Promise<string[]> {
    return this.guard(async () =>
      (await this.resolver.resolveTxt(name)).map((chunks) => chunks.join('')),
    );
  }

  async resolveCname(name: string): Promise<string[]> {
    return this.guard(() => this.resolver.resolveCname(name));
  }

  private async guard(fn: () => Promise<string[]>): Promise<string[]> {
    try {
      return await fn();
    } catch (err) {
      const code = (err as { code?: string }).code ?? '';
      if (NO_RECORD_CODES.has(code)) {
        return [];
      }
      if (code === 'ETIMEOUT') {
        throw new DnsLookupError('timeout', 'DNS lookup timed out');
      }
      throw new DnsLookupError(
        'error',
        `DNS lookup failed (${code || 'unknown'})`,
      );
    }
  }
}
