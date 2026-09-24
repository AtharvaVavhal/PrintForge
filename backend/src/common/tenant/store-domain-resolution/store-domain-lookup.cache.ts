import { Injectable } from '@nestjs/common';
import type {
  DomainVerificationStatus,
  StoreDomainType,
  TlsStatus,
} from '@prisma/client';

/**
 * The slice of a `StoreDomain` row the §4.3 pipeline needs, plus the
 * store's primary hostname (for `canonicalOrigin`). This — and ONLY this —
 * is what the cache holds (spec §4.6): `Store.status`, `Tenant.status` and
 * the subscription state are read LIVE on every resolution, never cached
 * ("disabled-store check is on the live Store row, not cached").
 */
export interface StoreDomainLookupRow {
  id: string;
  hostname: string;
  storeId: string;
  tenantId: string;
  type: StoreDomainType | null;
  verificationStatus: DomainVerificationStatus;
  tlsStatus: TlsStatus | null;
  isPrimary: boolean;
  /** Hostname of the store's `isPrimary` row, if one exists. */
  primaryHostname: string | null;
}

/** Spec §4.6: TTL 15 s. */
export const STORE_DOMAIN_LOOKUP_CACHE_TTL_MS = 15_000;

interface Entry {
  row: StoreDomainLookupRow | null;
  expiresAt: number;
}

/**
 * Phase 9 W3 — in-process `normalisedHost → StoreDomain row` cache (spec
 * §4.6). Misses (`null`) are cached too, so an attacker probing random
 * hostnames costs one DB read per host per TTL, not one per request.
 * `bust()` is the explicit invalidation every `StoreDomain` write path
 * (W5/W6) and every platform domain operation must call; the TTL bounds
 * staleness across instances (Render is single-instance today — D8).
 */
@Injectable()
export class StoreDomainLookupCache {
  private readonly entries = new Map<string, Entry>();

  /** `undefined` = not cached; `null` = cached miss. */
  get(host: string): StoreDomainLookupRow | null | undefined {
    const entry = this.entries.get(host);
    if (!entry) {
      return undefined;
    }
    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(host);
      return undefined;
    }
    return entry.row;
  }

  set(host: string, row: StoreDomainLookupRow | null): void {
    this.entries.set(host, {
      row,
      expiresAt: Date.now() + STORE_DOMAIN_LOOKUP_CACHE_TTL_MS,
    });
  }

  /** Bust one host, or everything when called with no argument. */
  bust(host?: string): void {
    if (host === undefined) {
      this.entries.clear();
    } else {
      this.entries.delete(host);
    }
  }
}
