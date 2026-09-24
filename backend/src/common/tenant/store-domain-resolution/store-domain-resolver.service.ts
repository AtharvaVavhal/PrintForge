import { Injectable, Logger } from '@nestjs/common';
import {
  DomainVerificationStatus,
  StoreDomainType,
  StoreStatus,
  SubscriptionStatus,
  TenantStatus,
  TlsStatus,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { withPlatformRlsBypass } from '../tenant-rls';
import { StoreContext } from './store-context';
import {
  StoreDomainLookupCache,
  StoreDomainLookupRow,
} from './store-domain-lookup.cache';
import {
  StoreNotFoundException,
  StoreUnavailableException,
} from './store-resolution.exceptions';

/**
 * Phase 9 W3 — the `host_resolution` pipeline (spec §4.3), steps 3–5 of the
 * S-1 validation sequence (§4.1.2): row existence → serving gate →
 * liveness → `StoreContext`. Steps 1–2 (syntax, admission) happen in
 * `StoreContextService` before this class is reached; this class only
 * ever receives an already-normalised hostname and treats it as an
 * UNTRUSTED LOOKUP KEY — never as an identifier, never as proof of
 * anything (§4.1.1 trust model).
 *
 *   normalise(host)
 *     → StoreDomain by hostname (platform-scoped lookup, cached)
 *         none                                          → STORE_NOT_FOUND (404)
 *         CUSTOM & (≠VERIFIED | tlsStatus≠ISSUED)       → NOT_SERVED      (404, same body)
 *         PLATFORM_SUBDOMAIN                            → serve (verification/TLS not consulted)
 *     → Store   status≠ACTIVE                           → STORE_UNAVAILABLE (503)
 *     → Tenant  status≠ACTIVE                           → STORE_UNAVAILABLE (503)
 *               subscription EXPIRED                    → STORE_UNAVAILABLE (503)
 *     → RESOLVED { storeId, tenantId, storeDomainId, isPrimary, canonicalOrigin }
 *       (isPrimary=false is RESOLVED, not a redirect — the API never 301s)
 *
 * Application-level reading rules for the W1 nullable columns (spec §3.2,
 * P6-D1 pattern): `type IS NULL` reads as CUSTOM (fail-closed);
 * `tlsStatus IS NULL` reads as PENDING for CUSTOM rows and is not
 * consulted for PLATFORM_SUBDOMAIN rows.
 *
 * The three direct `tx.storeDomain` / `tx.store` / `tx.tenant` delegate
 * calls below are platform-scoped by design — a store/tenant is being
 * resolved FROM a hostname, so no tenant is known yet — the same category
 * `tenant-context.guard.ts` and `storefront-tenant.resolver.ts` already
 * occupy in `tenant-data-access-guard.spec.ts`'s allowlist; this file is
 * the ONLY file in the W3 module that touches a tenancy model. No fallback
 * of any kind exists here: an unresolvable host is a 404, never the
 * most-recent tenant, never Tenant #1, never any store (§4.3).
 */
@Injectable()
export class StoreDomainResolver {
  private readonly logger = new Logger(StoreDomainResolver.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: StoreDomainLookupCache,
  ) {}

  /**
   * @param host   an already-normalised hostname (`normaliseHost` output)
   * @param scheme the scheme to build `canonicalOrigin` with (`https` in
   *               production; the request's own scheme in dev/test)
   */
  async resolveHost(
    host: string,
    scheme: 'http' | 'https',
  ): Promise<StoreContext> {
    const row = await this.lookup(host);
    if (row === null) {
      throw new StoreNotFoundException();
    }

    // Serving gate (§4.3). `type` null → CUSTOM (fail-closed).
    const type = row.type ?? StoreDomainType.CUSTOM;
    if (type === StoreDomainType.CUSTOM) {
      const verified =
        row.verificationStatus === DomainVerificationStatus.VERIFIED;
      const issued = (row.tlsStatus ?? TlsStatus.PENDING) === TlsStatus.ISSUED;
      if (!verified || !issued) {
        // NOT_SERVED — byte-identical to STORE_NOT_FOUND (S-4).
        throw new StoreNotFoundException();
      }
    }

    // Liveness (§4.3) — LIVE reads, never from the cache (§4.6).
    await this.assertLive(row);

    return {
      storeId: row.storeId,
      tenantId: row.tenantId,
      storeDomainId: row.id,
      isPrimary: row.isPrimary,
      canonicalOrigin: `${scheme}://${row.primaryHostname ?? row.hostname}`,
      resolvedBy: 'origin',
    };
  }

  /**
   * The cached `normalisedHost → StoreDomain` read (spec §4.6). Public
   * because W7's CORS predicate consumes THIS lookup rather than growing a
   * second one (spec §9: "via the same cached lookup as §4.6"; §9 again:
   * "one validation, two consumers"). It deliberately performs no liveness
   * check: a suspended store's origin must still be CORS-admitted, or the
   * browser would surface an opaque CORS error instead of the resolver's
   * own 503 (§4.3). Liveness stays in `resolveHost` below.
   */
  async lookupCachedRow(host: string): Promise<StoreDomainLookupRow | null> {
    return this.lookup(host);
  }

  private async lookup(host: string): Promise<StoreDomainLookupRow | null> {
    const cached = this.cache.get(host);
    if (cached !== undefined) {
      return cached;
    }
    // Cross-tenant by design (resolving a tenant FROM a hostname — no
    // tenant is known yet): a named platform-scoped operation, exactly as
    // tenant-context.guard.ts / storefront-tenant.resolver.ts do.
    const found = await withPlatformRlsBypass(this.prisma, (tx) =>
      tx.storeDomain.findUnique({
        where: { hostname: host },
        select: {
          id: true,
          hostname: true,
          storeId: true,
          tenantId: true,
          type: true,
          verificationStatus: true,
          tlsStatus: true,
          isPrimary: true,
          store: {
            select: {
              domains: {
                where: { isPrimary: true },
                select: { hostname: true },
                take: 1,
              },
            },
          },
        },
      }),
    );
    const row: StoreDomainLookupRow | null = found
      ? {
          id: found.id,
          hostname: found.hostname,
          storeId: found.storeId,
          tenantId: found.tenantId,
          type: found.type,
          verificationStatus: found.verificationStatus,
          tlsStatus: found.tlsStatus,
          isPrimary: found.isPrimary,
          primaryHostname: found.store.domains[0]?.hostname ?? null,
        }
      : null;
    this.cache.set(host, row);
    return row;
  }

  private async assertLive(row: StoreDomainLookupRow): Promise<void> {
    const live = await withPlatformRlsBypass(this.prisma, async (tx) => {
      const store = await tx.store.findUnique({
        where: { id: row.storeId },
        select: { status: true },
      });
      const tenant = await tx.tenant.findUnique({
        where: { id: row.tenantId },
        select: { status: true, subscription: { select: { status: true } } },
      });
      return { store, tenant };
    });

    let reason: string | null = null;
    if (!live.store || live.store.status !== StoreStatus.ACTIVE) {
      reason = `store ${row.storeId} status=${live.store?.status ?? 'missing'}`;
    } else if (!live.tenant || live.tenant.status !== TenantStatus.ACTIVE) {
      reason = `tenant ${row.tenantId} status=${live.tenant?.status ?? 'missing'}`;
    } else if (
      live.tenant.subscription?.status === SubscriptionStatus.EXPIRED
    ) {
      reason = `tenant ${row.tenantId} subscription=EXPIRED`;
    }
    if (reason !== null) {
      // The reason is logged with the tenant id, never exposed (§4.3).
      this.logger.warn(
        `storefront host '${row.hostname}' (tenant ${row.tenantId}) resolved but unavailable: ${reason}`,
      );
      throw new StoreUnavailableException();
    }
  }
}
