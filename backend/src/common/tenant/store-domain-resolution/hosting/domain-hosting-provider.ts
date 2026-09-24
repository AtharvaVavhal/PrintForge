import { TlsStatus } from '@prisma/client';

/**
 * Phase 9 W6 — the provider-neutral hosting seam (spec §7.1; ⚖️ P9-D3).
 *
 * PrintForge never terminates storefront TLS (§7.2): the hosting provider
 * owns the certificate, and this interface is the ONLY place the rest of the
 * codebase talks to it. `tlsStatus` on a `StoreDomain` row is a MIRROR of
 * what the provider reported at the last `addDomain` / `getDomainStatus`
 * call — never something PrintForge decides for itself.
 *
 * Exactly the three operations §7.1 fixes, and no more: the adapter surface
 * is deliberately small enough that a non-Vercel provider is a new class
 * rather than a refactor. `VercelDomainHostingProvider` is NOT part of this
 * wave (the §17.1 ops checklist items 1/3/4 — domain ownership, wildcard
 * DNS, Vercel project configuration — are still unconfirmed and no API
 * credential exists, so a real adapter could not be verified end to end);
 * it is a later wave that binds to this same token with no change here.
 */
export const DOMAIN_HOSTING_PROVIDER = Symbol('DOMAIN_HOSTING_PROVIDER');

/** The provider's own certificate vocabulary (§7.1), not PrintForge's. */
export type DomainCertificateState = 'pending' | 'issued' | 'error';

export interface DomainHostingStatus {
  /** Does the provider consider this hostname attached and pointed at it? */
  configured: boolean;
  certificate: DomainCertificateState;
  /** The CNAME target the provider wants merchants to point at, if it says. */
  cnameTarget: string | null;
}

export interface DomainHostingProvider {
  /** Attach `hostname` to the hosting project. Called once, on VERIFIED. */
  addDomain(hostname: string): Promise<DomainHostingStatus>;
  /** Current provider-side state. Backs "Refresh TLS status" and Inspect. */
  getDomainStatus(hostname: string): Promise<DomainHostingStatus>;
  /** Detach `hostname`. Must succeed idempotently if it is already gone. */
  removeDomain(hostname: string): Promise<void>;
}

/** Thrown by an adapter for any provider-side failure (§7.2 → `ERROR`). */
export class DomainHostingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DomainHostingError';
  }
}

/**
 * §7.2's `tlsStatus` mapping, in one place so the merchant refresh path, the
 * post-verification attach and the platform Inspect view cannot drift:
 *
 *   configured AND certificate issued  → ISSUED   (the ONLY serveable state)
 *   certificate error                  → ERROR
 *   anything else                      → PENDING
 *
 * Fail-closed by construction: a provider that answers "issued" while the
 * domain is not actually configured does NOT yield `ISSUED`, and every
 * unrecognised combination lands on `PENDING`, which the §4.3 serving gate
 * refuses to serve.
 */
export function mapCertificateToTlsStatus(
  status: DomainHostingStatus,
): TlsStatus {
  if (status.certificate === 'error') {
    return TlsStatus.ERROR;
  }
  if (status.configured && status.certificate === 'issued') {
    return TlsStatus.ISSUED;
  }
  return TlsStatus.PENDING;
}
