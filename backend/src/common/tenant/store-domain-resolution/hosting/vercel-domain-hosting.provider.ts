import { Injectable, Logger } from '@nestjs/common';
import {
  DomainCertificateState,
  DomainHostingError,
  DomainHostingProvider,
  DomainHostingStatus,
} from './domain-hosting-provider';

/**
 * Phase 9 — the real hosting adapter (spec §7.1–§7.3; ⚖️ P9-D3 Vercel-managed
 * TLS, no proxy, no Cloudflare). PrintForge never terminates storefront TLS:
 * this class only attaches/detaches a hostname on the Vercel project and
 * MIRRORS what Vercel reports back into `tlsStatus`.
 *
 * 🔎 **S-8 surface.** Exactly three Vercel operations are used — project-domain
 * add, get and remove — plus the domain-config read that says whether DNS
 * actually points at Vercel. Nothing else about Vercel is modelled, so a
 * different provider is a new class rather than a refactor.
 *
 *   POST   /v10/projects/{projectId}/domains          { name }
 *   GET    /v9/projects/{projectId}/domains/{domain}
 *   GET    /v6/domains/{domain}/config
 *   DELETE /v9/projects/{projectId}/domains/{domain}
 *
 * ⚠️ **Field semantics still to be confirmed against live Vercel before the
 * ops cutover (S-8 explicitly defers this to implementation time, and this
 * code was written without live API access).** The mapping below is
 * deliberately the CONSERVATIVE reading of Vercel's documented behaviour: a
 * hostname counts as carrying a working certificate only when Vercel reports
 * the project domain `verified` AND the domain config NOT `misconfigured` —
 * the same pair the Vercel dashboard shows as "Valid Configuration", and the
 * state in which Vercel has provisioned the certificate. Anything else maps to
 * `pending`, never `issued`. Because `ISSUED` is half of the §4.3 serving gate,
 * every uncertainty here resolves to "not served" rather than "served".
 *
 * SECRETS. The API token is read from configuration and used only as a bearer
 * header. It is never logged, never returned, and never included in an error
 * message — failures log the error NAME or the HTTP status only, following
 * `PostalLookupService`'s existing discipline.
 */
export const VERCEL_API_BASE_URL = 'https://api.vercel.com';

/** Bounded like every other outbound call in this codebase. */
export const VERCEL_API_TIMEOUT_MS = 10_000;

export interface VercelHostingConfig {
  apiToken: string;
  projectId: string;
  /** Only required for a team-owned project; appended as `?teamId=`. */
  teamId: string | null;
  baseUrl?: string;
}

interface VercelProjectDomain {
  name?: string;
  verified?: boolean;
}

interface VercelDomainConfig {
  misconfigured?: boolean;
  /** Vercel sometimes suggests a CNAME; informational only (§7.3). */
  recommendedCNAME?: string | { value?: string }[] | null;
}

@Injectable()
export class VercelDomainHostingProvider implements DomainHostingProvider {
  private readonly logger = new Logger(VercelDomainHostingProvider.name);
  private readonly baseUrl: string;

  constructor(private readonly config: VercelHostingConfig) {
    this.baseUrl = (config.baseUrl ?? VERCEL_API_BASE_URL).replace(/\/+$/, '');
  }

  /**
   * Attach `hostname` to the project. Treated as IDEMPOTENT: Vercel answers
   * 409 (or a `domain_already_in_use`-style code) when the domain is already
   * on this project, which is a success for our purposes — the caller may
   * retry a verification, and re-attaching must not fail the flow.
   */
  async addDomain(hostname: string): Promise<DomainHostingStatus> {
    const res = await this.call(
      'POST',
      `/v10/projects/${encodeURIComponent(this.config.projectId)}/domains`,
      { name: hostname },
    );
    if (!res.ok && res.status !== 409) {
      this.fail('addDomain', hostname, res.status);
    }
    // Attaching says nothing about DNS or the certificate — ask.
    return this.getDomainStatus(hostname);
  }

  async getDomainStatus(hostname: string): Promise<DomainHostingStatus> {
    const domainRes = await this.call(
      'GET',
      `/v9/projects/${encodeURIComponent(this.config.projectId)}/domains/${encodeURIComponent(hostname)}`,
    );
    if (domainRes.status === 404) {
      // Not attached to the project at all: honestly unconfigured, and
      // `mapCertificateToTlsStatus` turns this into PENDING (not served).
      return { configured: false, certificate: 'pending', cnameTarget: null };
    }
    if (!domainRes.ok) {
      this.fail('getDomainStatus', hostname, domainRes.status);
    }
    const domain = (await this.json<VercelProjectDomain>(domainRes)) ?? {};

    const configRes = await this.call(
      'GET',
      `/v6/domains/${encodeURIComponent(hostname)}/config`,
    );
    // A config read that fails is NOT fatal — it only costs us the ability to
    // claim "issued", which is the fail-closed direction.
    const domainConfig = configRes.ok
      ? ((await this.json<VercelDomainConfig>(configRes)) ?? {})
      : null;

    const verified = domain.verified === true;
    const misconfigured = domainConfig?.misconfigured === true;
    const configured = verified && domainConfig !== null && !misconfigured;
    const certificate: DomainCertificateState = configured
      ? 'issued'
      : 'pending';

    return {
      configured,
      certificate,
      cnameTarget: this.readRecommendedCname(domainConfig),
    };
  }

  /** Detach. A 404 is a success — the end state is what was asked for. */
  async removeDomain(hostname: string): Promise<void> {
    const res = await this.call(
      'DELETE',
      `/v9/projects/${encodeURIComponent(this.config.projectId)}/domains/${encodeURIComponent(hostname)}`,
    );
    if (!res.ok && res.status !== 404) {
      this.fail('removeDomain', hostname, res.status);
    }
  }

  // ─── internals ─────────────────────────────────────────────────────────

  private async call(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    body?: unknown,
  ): Promise<Response> {
    const url = `${this.baseUrl}${path}${
      this.config.teamId
        ? `${path.includes('?') ? '&' : '?'}teamId=${encodeURIComponent(this.config.teamId)}`
        : ''
    }`;
    try {
      return await fetch(url, {
        method,
        headers: {
          // Never logged, never echoed.
          Authorization: `Bearer ${this.config.apiToken}`,
          Accept: 'application/json',
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(VERCEL_API_TIMEOUT_MS),
      });
    } catch (err) {
      // DNS / TLS / connection refused / timeout. Log the error NAME only —
      // never the URL (it carries the project id) and never the raw error.
      const name = err instanceof Error ? err.name : typeof err;
      this.logger.warn(`Vercel API unreachable (${method}): ${name}`);
      throw new DomainHostingError('hosting provider unreachable');
    }
  }

  private async json<T>(res: Response): Promise<T | null> {
    try {
      return (await res.json()) as T;
    } catch {
      this.logger.warn('Vercel API returned an unparseable body');
      return null;
    }
  }

  /** Status only — never the response body, which can echo project data. */
  private fail(op: string, hostname: string, status: number): never {
    this.logger.warn(`Vercel ${op} for '${hostname}' returned HTTP ${status}`);
    throw new DomainHostingError(
      `hosting provider rejected ${op} (HTTP ${status})`,
    );
  }

  private readRecommendedCname(
    config: VercelDomainConfig | null,
  ): string | null {
    const raw = config?.recommendedCNAME;
    if (typeof raw === 'string' && raw.trim().length > 0) {
      return raw.trim();
    }
    if (Array.isArray(raw)) {
      const first = raw.find((e) => typeof e?.value === 'string');
      return first?.value?.trim() ?? null;
    }
    return null;
  }
}
