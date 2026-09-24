import { Injectable } from '@nestjs/common';
import {
  DomainCertificateState,
  DomainHostingError,
  DomainHostingProvider,
  DomainHostingStatus,
} from './domain-hosting-provider';

/**
 * Phase 9 W6 — the dev/test `DomainHostingProvider` (spec §7.1's
 * `FakeDomainHostingProvider`, mirroring `FakeBillingProvider`, ⚖️ P7-D2
 * Part G). In-memory, no network.
 *
 * SAFETY: a newly attached domain is `certificate: 'pending'`, NEVER
 * `'issued'`. Nothing in this class promotes a domain to `issued` on its own
 * — only an explicit `markIssued()` from a test does. That matters because
 * `ISSUED` is the second half of the §4.3 serving gate for `CUSTOM` rows: a
 * fake that optimistically reported `issued` would make an unverifiable
 * certificate look serveable. This class is bound only outside production
 * (`domain-hosting.module.ts`); production binds
 * `UnprovisionedDomainHostingProvider`.
 */
@Injectable()
export class FakeDomainHostingProvider implements DomainHostingProvider {
  /** Every provider call, in order — lets tests assert real interactions. */
  readonly calls: { op: 'add' | 'status' | 'remove'; hostname: string }[] = [];

  private readonly domains = new Map<string, DomainCertificateState>();
  private readonly failures = new Set<string>();

  /** The target `getDomainStatus` reports; tests may override it. */
  cnameTarget: string | null = 'cname.fake-hosting.test';

  // ─── test controls ─────────────────────────────────────────────────────

  /** Promote an attached domain to a real certificate (→ `ISSUED`). */
  markIssued(hostname: string): void {
    this.domains.set(hostname, 'issued');
  }

  /** Provider reports a broken certificate (→ `ERROR`). */
  markCertificateError(hostname: string): void {
    this.domains.set(hostname, 'error');
  }

  /** Make every call for `hostname` throw, as a real adapter would. */
  failFor(hostname: string): void {
    this.failures.add(hostname);
  }

  isAttached(hostname: string): boolean {
    return this.domains.has(hostname);
  }

  reset(): void {
    this.calls.length = 0;
    this.domains.clear();
    this.failures.clear();
    this.cnameTarget = 'cname.fake-hosting.test';
  }

  // ─── DomainHostingProvider ─────────────────────────────────────────────

  async addDomain(hostname: string): Promise<DomainHostingStatus> {
    this.calls.push({ op: 'add', hostname });
    await Promise.resolve();
    this.throwIfFailing(hostname);
    // Attach only — never issue. See the class comment.
    if (!this.domains.has(hostname)) {
      this.domains.set(hostname, 'pending');
    }
    return this.statusOf(hostname);
  }

  async getDomainStatus(hostname: string): Promise<DomainHostingStatus> {
    this.calls.push({ op: 'status', hostname });
    await Promise.resolve();
    this.throwIfFailing(hostname);
    return this.statusOf(hostname);
  }

  async removeDomain(hostname: string): Promise<void> {
    this.calls.push({ op: 'remove', hostname });
    await Promise.resolve();
    this.throwIfFailing(hostname);
    // Idempotent: removing an unattached hostname is a success (§7.1).
    this.domains.delete(hostname);
  }

  private statusOf(hostname: string): DomainHostingStatus {
    const certificate = this.domains.get(hostname);
    return {
      configured: certificate !== undefined,
      certificate: certificate ?? 'pending',
      cnameTarget: this.cnameTarget,
    };
  }

  private throwIfFailing(hostname: string): void {
    if (this.failures.has(hostname)) {
      throw new DomainHostingError(`fake hosting provider failure (FAKE)`);
    }
  }
}
