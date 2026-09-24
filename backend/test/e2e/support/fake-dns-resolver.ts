import {
  DnsLookupError,
  DomainDnsResolver,
} from '../../../src/store-domains/dns/domain-dns-resolver';

/**
 * Phase 9 W5 — network-free `DomainDnsResolver` for the e2e suite, swapped in
 * through the `DOMAIN_DNS_RESOLVER` token exactly as `FakeBillingProvider` /
 * `FakeCloudinaryService` are (spec §6.3's own note; §14.2).
 *
 * `calls` is the reason this exists rather than a `jest.mock`: P9-S7 requires
 * proving that a merchant verify against a platform-revoked (`FAILED`) row
 * makes NO DNS call at all, which is only observable by counting real
 * invocations of the seam the production code would have used.
 */
export class FakeDnsResolver implements DomainDnsResolver {
  /** Every lookup this resolver was asked to perform, in order. */
  readonly calls: { kind: 'txt' | 'cname'; name: string }[] = [];

  private txt = new Map<string, string[]>();
  private cname = new Map<string, string[]>();
  private failures = new Map<string, 'timeout' | 'error'>();

  setTxt(name: string, records: string[]): void {
    this.txt.set(name, records);
  }

  setCname(name: string, records: string[]): void {
    this.cname.set(name, records);
  }

  /** Make any lookup for `name` throw, as a real resolver would. */
  setFailure(name: string, kind: 'timeout' | 'error'): void {
    this.failures.set(name, kind);
  }

  reset(): void {
    this.calls.length = 0;
    this.txt.clear();
    this.cname.clear();
    this.failures.clear();
  }

  // `await Promise.resolve()` keeps these genuinely async: a programmed
  // failure then REJECTS the returned promise rather than throwing
  // synchronously, so the production code's own try/catch around the awaited
  // call is what handles it — exactly as a real resolver behaves.
  async resolveTxt(name: string): Promise<string[]> {
    this.calls.push({ kind: 'txt', name });
    await Promise.resolve();
    this.throwIfFailing(name);
    return this.txt.get(name) ?? [];
  }

  async resolveCname(name: string): Promise<string[]> {
    this.calls.push({ kind: 'cname', name });
    await Promise.resolve();
    this.throwIfFailing(name);
    return this.cname.get(name) ?? [];
  }

  private throwIfFailing(name: string): void {
    const kind = this.failures.get(name);
    if (kind) {
      throw new DnsLookupError(
        kind,
        kind === 'timeout'
          ? 'DNS lookup timed out'
          : 'DNS lookup failed (FAKE)',
      );
    }
  }
}
