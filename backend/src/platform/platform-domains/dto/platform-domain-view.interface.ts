import type { StoreDomainView } from '../../../store-domains/store-domain-view.interface';

/**
 * Platform-side projections (Phase 9 W6; spec §6.4). Both extend the merchant
 * `StoreDomainView` with the owning tenant/store metadata a platform operator
 * needs to act — and with nothing else. In particular `verificationToken` is
 * never included: it is a merchant secret, and nothing on the platform surface
 * needs it (a platform operator overrides or re-verifies, never impersonates
 * the DNS proof).
 */
export interface PlatformDomainSummaryView extends StoreDomainView {
  tenantId: string;
  tenantSlug: string;
  storeId: string;
  storeSlug: string;
  storeName: string;
}

/** GET /platform/domains/:id — adds the LIVE provider read (spec §6.4). */
export interface PlatformDomainDetailView extends PlatformDomainSummaryView {
  /**
   * What the hosting provider says right now (§7.1 `getDomainStatus`), which
   * may legitimately disagree with the stored `tlsStatus` — that is the whole
   * point of Inspect, since nothing polls (⚖️ P9-D7). `null` for a
   * `PLATFORM_SUBDOMAIN` (the wildcard covers it — §7.2 — so the provider is
   * not asked) or when the provider call itself failed.
   */
  providerStatus: {
    configured: boolean;
    certificate: 'pending' | 'issued' | 'error';
    cnameTarget: string | null;
  } | null;
  /** Set when the live provider read failed, instead of `providerStatus`. */
  providerError: string | null;
}
