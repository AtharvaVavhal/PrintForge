import { randomBytes } from 'crypto';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DomainVerificationMethod,
  DomainVerificationStatus,
  Prisma,
  StoreDomain,
  StoreDomainType,
  TlsStatus,
} from '@prisma/client';
import { AuditService } from '../common/audit/audit.service';
import { resolveTenantAuditActor } from '../common/audit/tenant-actor-attribution';
import type { AppConfig } from '../common/config/configuration';
import { PrismaService } from '../common/database/prisma.service';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { normaliseHost } from '../common/tenant/store-domain-resolution/host-normalisation';
import {
  DOMAIN_HOSTING_PROVIDER,
  DomainHostingError,
  mapCertificateToTlsStatus,
} from '../common/tenant/store-domain-resolution/hosting/domain-hosting-provider';
import type { DomainHostingProvider } from '../common/tenant/store-domain-resolution/hosting/domain-hosting-provider';
import { StoreDomainLookupCache } from '../common/tenant/store-domain-resolution/store-domain-lookup.cache';
import { resolvePrimaryStoreId } from '../common/tenant/primary-store';
import type { TenantContext } from '../common/tenant/tenant-context';
import { withTenantRlsContext } from '../common/tenant/tenant-rls';
import { AddStoreDomainDto } from './dto/add-store-domain.dto';
import { STORE_DOMAIN_AUDIT } from './store-domain-audit.constants';
import { StoreDomainVerificationCheck } from './store-domain-verification-check.service';
import {
  VerificationFailureReason,
  verificationInstructions,
} from './store-domain-verification';
import {
  AddStoreDomainView,
  LastVerificationFailure,
  StoreDomainView,
  VerifyStoreDomainView,
} from './store-domain-view.interface';

/** Spec §6.3: at most one in-flight verification per domain. */
const VERIFY_TX_OPTIONS = { timeout: 15_000, maxWait: 5_000 };

/**
 * Phase 9 W5 — merchant custom-domain onboarding + on-demand verification
 * (spec §6.1 "Add hostname" / "Verify", §6.2, §6.3), gated upstream by
 * `PermissionsGuard` + `@RequirePermission('store-domain:manage')`
 * (P9-S2, OWNER-only) on `StoreDomainsController`.
 *
 * TENANT ISOLATION. Every read and write here carries the SERVER-derived
 * `tenantContext.tenantId` in the query itself (`WHERE id = ? AND tenantId
 * = ?`), inside `withTenantRlsContext` so the D4 RLS policy on
 * `store_domains` sees the same tenant. A domain belonging to another
 * tenant is indistinguishable from a nonexistent one (404 `Domain not
 * found`). The direct `tx.storeDomain` delegate calls are allowlisted in
 * `tenant-data-access-guard.spec.ts` under the same "tenant admin"
 * category as `team.service.ts`.
 *
 * STATE MACHINE (spec §6.3, P9-S7 sticky revoke, S-6):
 *   PENDING  --verify pass--> VERIFIED      (+ verifiedAt, lastCheckedAt)
 *   PENDING  --verify fail--> PENDING       (lastCheckedAt only; reason
 *                                            retained in the response and
 *                                            in TenantAuditLog — never a
 *                                            StoreDomain column, S-6)
 *   FAILED   --merchant verify--> REFUSED   (no DNS call, no state change,
 *                                            audited; only the platform
 *                                            can restore — P9-S7)
 *   VERIFIED --merchant verify--> 409       (not re-checked in Phase 9)
 * A merchant never writes FAILED. `VERIFYING` does not exist (P9-D2).
 *
 * NOT here (spec-W6): TLS provisioning after VERIFIED (the Vercel adapter
 * — `tlsStatus` stays PENDING, so a merely-verified CUSTOM domain is still
 * NOT SERVED by the §4.3 gate until W6 issues it), set-primary, remove,
 * refresh-TLS, and the platform approve/inspect list.
 */
@Injectable()
export class StoreDomainsService {
  private readonly logger = new Logger(StoreDomainsService.name);
  private readonly platformStorefrontDomain: string | null;
  private readonly reservedHosts: Set<string>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly verificationCheck: StoreDomainVerificationCheck,
    private readonly cache: StoreDomainLookupCache,
    @Inject(DOMAIN_HOSTING_PROVIDER)
    private readonly hosting: DomainHostingProvider,
    configService: ConfigService<AppConfig, true>,
  ) {
    this.platformStorefrontDomain = configService.get('storefrontDomains', {
      infer: true,
    }).platformStorefrontDomain;
    // Spec §6.2: a merchant may never claim the platform admin origin or the
    // API host as a CUSTOM domain (B-3's platform-side registration of the
    // production origin, when it happens, is a platform action — W8).
    this.reservedHosts = new Set(
      [
        configService.get('frontendUrl', { infer: true }),
        configService.get('backendUrl', { infer: true }),
      ]
        .map((url) => {
          try {
            return new URL(url).hostname.toLowerCase();
          } catch {
            return null;
          }
        })
        .filter((h): h is string => h !== null),
    );
  }

  async list(tenantContext: TenantContext): Promise<StoreDomainView[]> {
    const tenantId = tenantContext.tenantId;
    const rows = await withTenantRlsContext(this.prisma, tenantId, (tx) =>
      tx.storeDomain.findMany({
        where: { tenantId },
        orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
      }),
    );
    const failures = await this.latestFailures(
      tenantId,
      rows.map((r) => r.id),
    );
    return rows.map((row) => this.toView(row, failures.get(row.id) ?? null));
  }

  async add(
    tenantContext: TenantContext,
    actor: AuthenticatedUser,
    dto: AddStoreDomainDto,
  ): Promise<AddStoreDomainView> {
    const tenantId = tenantContext.tenantId;
    const hostname = this.validateNewHostname(dto.hostname);
    const method = dto.verificationMethod;
    if (
      method === DomainVerificationMethod.CNAME &&
      this.verificationCheck.customDomainCnameTarget === null
    ) {
      throw new BadRequestException(
        'CNAME verification is not available on this platform — use DNS_TXT',
      );
    }
    const storeId = await resolvePrimaryStoreId(this.prisma, tenantId);
    const verificationToken = randomBytes(32).toString('hex');

    let created: StoreDomain;
    try {
      created = await withTenantRlsContext(
        this.prisma,
        tenantId,
        async (tx) => {
          const row = await tx.storeDomain.create({
            data: {
              storeId,
              tenantId,
              hostname,
              type: StoreDomainType.CUSTOM,
              verificationStatus: DomainVerificationStatus.PENDING,
              verificationMethod: method,
              verificationToken,
              tlsStatus: TlsStatus.PENDING,
              isPrimary: false,
            },
          });
          const attribution = await resolveTenantAuditActor(
            tx,
            tenantContext,
            actor,
          );
          await this.auditService.logTenantAction(tx, {
            tenantId,
            ...attribution,
            action: STORE_DOMAIN_AUDIT.added,
            targetType: 'StoreDomain',
            targetId: row.id,
            metadata: { hostname, verificationMethod: method },
          });
          return row;
        },
      );
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        // Global `hostname @unique` (§6.2): a hostname resolves to exactly
        // one store platform-wide.
        throw new ConflictException('This hostname is already in use');
      }
      throw err;
    }
    this.cache.bust(hostname);
    return {
      domain: this.toView(created, null),
      verificationToken,
      instructions: verificationInstructions(
        hostname,
        method,
        verificationToken,
        this.verificationCheck.customDomainCnameTarget,
      ),
    };
  }

  /**
   * On-demand verification (P9-D7 — no scheduler). Holds a row-level
   * advisory lock for the whole check (spec §6.3 "at most one in-flight
   * verification per domain") inside one tenant-scoped transaction.
   */
  async verify(
    tenantContext: TenantContext,
    actor: AuthenticatedUser,
    domainId: string,
  ): Promise<VerifyStoreDomainView> {
    const tenantId = tenantContext.tenantId;
    const result = await withTenantRlsContext(
      this.prisma,
      tenantId,
      async (tx) => {
        const [{ locked }] = await tx.$queryRaw<{ locked: boolean }[]>`
          SELECT pg_try_advisory_xact_lock(hashtext(${domainId})) AS locked
        `;
        if (!locked) {
          throw new ConflictException(
            'A verification for this domain is already in progress',
          );
        }

        // Scoped in the query: another tenant's domain id is a 404.
        const row = await tx.storeDomain.findFirst({
          where: { id: domainId, tenantId },
        });
        if (!row) {
          throw new NotFoundException('Domain not found');
        }
        const attribution = await resolveTenantAuditActor(
          tx,
          tenantContext,
          actor,
        );

        if (row.type === StoreDomainType.PLATFORM_SUBDOMAIN) {
          throw new ConflictException(
            'Platform subdomains are always-on and do not require verification',
          );
        }
        if (row.verificationStatus === DomainVerificationStatus.FAILED) {
          // P9-S7 sticky revoke: refused BEFORE any DNS call, no state
          // change, audited. Only the platform restore path exits FAILED.
          //
          // The refusal is audited and then thrown AFTER this transaction
          // commits (`refusedRevoked` below), never by throwing from inside
          // it: a `ConflictException` raised here would roll the transaction
          // back and take the `store_domain.verify_refused_revoked` row with
          // it, so the refusal §14.2 requires to be recorded would silently
          // not exist. The row itself is untouched either way, so there is
          // nothing else in this transaction for the commit to expose.
          await this.auditService.logTenantAction(tx, {
            tenantId,
            ...attribution,
            action: STORE_DOMAIN_AUDIT.verifyRefusedRevoked,
            targetType: 'StoreDomain',
            targetId: row.id,
            metadata: { hostname: row.hostname },
          });
          return {
            updated: row,
            reason: undefined as VerificationFailureReason | undefined,
            refusedRevoked: true,
          };
        }
        if (row.verificationStatus === DomainVerificationStatus.VERIFIED) {
          throw new ConflictException('This domain is already verified');
        }

        const outcome = await this.verificationCheck.check(row);
        const checkedAt = new Date();

        if (outcome.passed) {
          const updated = await tx.storeDomain.update({
            where: { id: row.id },
            data: {
              verificationStatus: DomainVerificationStatus.VERIFIED,
              verifiedAt: checkedAt,
              lastCheckedAt: checkedAt,
            },
          });
          await this.auditService.logTenantAction(tx, {
            tenantId,
            ...attribution,
            action: STORE_DOMAIN_AUDIT.verified,
            targetType: 'StoreDomain',
            targetId: row.id,
            metadata: {
              hostname: row.hostname,
              method: row.verificationMethod,
              checkedAt: checkedAt.toISOString(),
            },
          });
          return {
            updated,
            reason: undefined as VerificationFailureReason | undefined,
            refusedRevoked: false,
          };
        }

        // S-6: stays PENDING; only lastCheckedAt moves; the reason is
        // retained in the response (below), in TenantAuditLog (here) and
        // in the log — never on the row.
        const updated = await tx.storeDomain.update({
          where: { id: row.id },
          data: { lastCheckedAt: checkedAt },
        });
        await this.auditService.logTenantAction(tx, {
          tenantId,
          ...attribution,
          action: STORE_DOMAIN_AUDIT.verificationFailed,
          targetType: 'StoreDomain',
          targetId: row.id,
          metadata: {
            hostname: row.hostname,
            method: row.verificationMethod,
            reason: outcome.reason,
            checkedAt: checkedAt.toISOString(),
          },
        });
        this.logger.warn(
          `store domain '${row.hostname}' (tenant ${tenantId}) verification failed: ${outcome.reason}`,
        );
        return { updated, reason: outcome.reason, refusedRevoked: false };
      },
      VERIFY_TX_OPTIONS,
    );

    if (result.refusedRevoked) {
      // Thrown only now that the audit row above is committed (P9-S7).
      throw new ConflictException(
        'DOMAIN_REVOKED_BY_PLATFORM: this domain was revoked by the platform and cannot be re-verified by the merchant — contact support',
      );
    }

    this.cache.bust(result.updated.hostname);

    // Phase 9 W6 (spec §6.3 final paragraph, §7.2): on VERIFIED, attach the
    // hostname to the hosting provider and mirror the reported certificate
    // state into `tlsStatus`. Deliberately AFTER the transaction above has
    // committed, never inside it: the provider call is network I/O (a real
    // adapter talks to Vercel), and holding a Postgres transaction — plus this
    // row's advisory lock — open across it is how a slow provider turns into
    // database lock contention. The intermediate state (VERIFIED +
    // tlsStatus=PENDING) is fail-closed: the §4.3 gate does not serve it.
    const row =
      result.updated.verificationStatus === DomainVerificationStatus.VERIFIED
        ? await this.attachToHostingProvider(tenantId, result.updated)
        : result.updated;

    const failure: LastVerificationFailure | null =
      result.reason && row.lastCheckedAt
        ? { reason: result.reason, checkedAt: row.lastCheckedAt }
        : null;
    return {
      domain: this.toView(row, failure),
      verificationStatus: row.verificationStatus,
      lastCheckedAt: row.lastCheckedAt,
      ...(result.reason ? { reason: result.reason } : {}),
    };
  }

  // ─── W6: set primary / remove / refresh TLS (spec §6.1) ────────────────

  /**
   * Makes `domainId` the store's one primary domain (spec §6.1 "Set primary").
   * Only a domain that is ACTUALLY SERVED may become primary, and the rule is
   * the §4.3 serving gate itself rather than a second, drifting copy of it:
   * a `PLATFORM_SUBDOMAIN` is always-on, a `CUSTOM` row needs VERIFIED +
   * ISSUED. Making an unserved host canonical would point every
   * `canonicalOrigin` — and the SPA's own self-redirect (§11) — at a 404.
   *
   * The previous primary is cleared and the new one set in ONE transaction,
   * old-then-new, because `store_domains_store_primary_unique` (a partial
   * unique index on `storeId WHERE isPrimary`) would reject the intermediate
   * state in the other order.
   */
  async setPrimary(
    tenantContext: TenantContext,
    actor: AuthenticatedUser,
    domainId: string,
  ): Promise<StoreDomainView> {
    const tenantId = tenantContext.tenantId;
    const { updated, affectedHostnames } = await this.asPrimaryConflict(() =>
      withTenantRlsContext(this.prisma, tenantId, async (tx) => {
        const row = await this.loadOwnDomain(tx, tenantId, domainId);
        this.assertServeable(row);
        if (row.isPrimary) {
          throw new ConflictException(
            'This domain is already the primary domain',
          );
        }

        const previous = await tx.storeDomain.findFirst({
          where: { storeId: row.storeId, isPrimary: true },
        });
        if (previous) {
          await tx.storeDomain.update({
            where: { id: previous.id },
            data: { isPrimary: false },
          });
        }
        const next = await tx.storeDomain.update({
          where: { id: row.id },
          data: { isPrimary: true },
        });

        const attribution = await resolveTenantAuditActor(
          tx,
          tenantContext,
          actor,
        );
        await this.auditService.logTenantAction(tx, {
          tenantId,
          ...attribution,
          action: STORE_DOMAIN_AUDIT.primaryChanged,
          targetType: 'StoreDomain',
          targetId: row.id,
          metadata: {
            hostname: row.hostname,
            previousHostname: previous?.hostname ?? null,
          },
        });
        return {
          updated: next,
          affectedHostnames: await this.storeHostnames(tx, row.storeId),
        };
      }),
    );

    // EVERY host of this store is affected, not just the two that changed:
    // the cached row carries `primaryHostname`, which is what
    // `canonicalOrigin` is built from (§4.6).
    this.bustAll(affectedHostnames);
    return this.toView(updated, null);
  }

  /**
   * Removes a CUSTOM domain (spec §6.1 "Remove"). `PLATFORM_SUBDOMAIN` rows
   * are never removable by a merchant (§5) — only re-pointed as non-primary.
   *
   * If the removed row was primary, the store's platform subdomain becomes
   * primary, so a store is never left with zero primary domains (and
   * therefore never without a `canonicalOrigin`). If no platform subdomain
   * exists for the store — possible only for a Store predating W6's
   * provisioning whose §16 backfill has not run — the removal is REFUSED
   * rather than silently leaving the store primary-less.
   *
   * The provider detach happens BEFORE the row is deleted (§7.2 "Row deleted
   * after provider confirms"), and outside the transaction for the same
   * reason as the attach above. A provider failure aborts the removal with
   * the row untouched, so PrintForge and the provider cannot disagree about
   * who owns the hostname.
   */
  async remove(
    tenantContext: TenantContext,
    actor: AuthenticatedUser,
    domainId: string,
  ): Promise<{
    removed: true;
    hostname: string;
    newPrimaryHostname: string | null;
  }> {
    const tenantId = tenantContext.tenantId;

    // 1. Validate, and find the fallback primary, before touching anything.
    const plan = await withTenantRlsContext(
      this.prisma,
      tenantId,
      async (tx) => {
        const row = await this.loadOwnDomain(tx, tenantId, domainId);
        this.assertCustom(row, 'Platform subdomains cannot be removed');
        const fallback = row.isPrimary
          ? await tx.storeDomain.findFirst({
              where: {
                storeId: row.storeId,
                type: StoreDomainType.PLATFORM_SUBDOMAIN,
                id: { not: row.id },
              },
            })
          : null;
        if (row.isPrimary && fallback === null) {
          throw new ConflictException(
            "This is the store's only primary domain and it has no platform subdomain to fall back to — set another verified domain as primary first",
          );
        }
        return {
          row,
          fallbackId: fallback?.id ?? null,
          hostnames: await this.storeHostnames(tx, row.storeId),
        };
      },
    );

    // 2. Detach at the provider first (§7.2).
    try {
      await this.hosting.removeDomain(plan.row.hostname);
    } catch (err) {
      if (err instanceof DomainHostingError) {
        this.logger.error(
          `hosting provider refused to detach '${plan.row.hostname}' (tenant ${tenantId}): ${err.message}`,
        );
        throw new ServiceUnavailableException(
          'The hosting provider could not release this domain right now — nothing was changed; try again',
        );
      }
      throw err;
    }

    // 3. Delete the row and promote the fallback, atomically.
    const newPrimaryHostname = await this.asPrimaryConflict(() =>
      withTenantRlsContext(this.prisma, tenantId, async (tx) => {
        // Re-scoped: the row must still be this tenant's own.
        const still = await tx.storeDomain.findFirst({
          where: { id: domainId, tenantId },
        });
        if (!still) {
          throw new NotFoundException('Domain not found');
        }
        await tx.storeDomain.delete({ where: { id: domainId } });

        let promoted: StoreDomain | null = null;
        if (plan.fallbackId !== null) {
          promoted = await tx.storeDomain.update({
            where: { id: plan.fallbackId },
            data: { isPrimary: true },
          });
        }

        const attribution = await resolveTenantAuditActor(
          tx,
          tenantContext,
          actor,
        );
        await this.auditService.logTenantAction(tx, {
          tenantId,
          ...attribution,
          action: STORE_DOMAIN_AUDIT.removed,
          targetType: 'StoreDomain',
          targetId: domainId,
          metadata: {
            hostname: still.hostname,
            wasPrimary: still.isPrimary,
            newPrimaryHostname: promoted?.hostname ?? null,
          },
        });
        return promoted?.hostname ?? null;
      }),
    );

    this.bustAll(plan.hostnames);
    return { removed: true, hostname: plan.row.hostname, newPrimaryHostname };
  }

  /**
   * "Refresh TLS status" (spec §6.1 / §7.2) — the only way `tlsStatus`
   * advances in Phase 9, since there is no polling worker (⚖️ P9-D7's spirit;
   * a scheduled refresh is Phase 11, §20). A provider error is recorded as
   * `tlsStatus = ERROR` rather than thrown: that IS the answer to "what is
   * the certificate state?", it is still fail-closed at the serving gate, and
   * the merchant can retry.
   */
  async refreshTls(
    tenantContext: TenantContext,
    actor: AuthenticatedUser,
    domainId: string,
  ): Promise<StoreDomainView> {
    const tenantId = tenantContext.tenantId;
    const row = await withTenantRlsContext(this.prisma, tenantId, (tx) =>
      this.loadOwnDomain(tx, tenantId, domainId).then((found) => {
        this.assertCustom(
          found,
          'Platform subdomains are covered by the platform wildcard certificate and have no TLS status to refresh',
        );
        return found;
      }),
    );

    const tlsStatus = await this.readProviderTlsStatus(row.hostname, tenantId);
    const updated = await this.writeTlsStatus(
      tenantContext,
      actor,
      row,
      tlsStatus,
      STORE_DOMAIN_AUDIT.tlsRefreshed,
    );
    this.cache.bust(updated.hostname);
    return this.toView(updated, null);
  }

  // ─── Helpers ─────────────────────────────────────────────────────────

  /**
   * The one tenant-scoped row load for every W6 operation. The tenantId is
   * in the QUERY, server-derived, so another tenant's domain id is
   * indistinguishable from a nonexistent one (404) — never a 403, which would
   * confirm the row exists.
   */
  private async loadOwnDomain(
    tx: Prisma.TransactionClient,
    tenantId: string,
    domainId: string,
  ): Promise<StoreDomain> {
    const row = await tx.storeDomain.findFirst({
      where: { id: domainId, tenantId },
    });
    if (!row) {
      throw new NotFoundException('Domain not found');
    }
    return row;
  }

  /** `type IS NULL` reads as CUSTOM — fail-closed (spec §3.2). */
  private isCustom(row: StoreDomain): boolean {
    return (row.type ?? StoreDomainType.CUSTOM) === StoreDomainType.CUSTOM;
  }

  private assertCustom(row: StoreDomain, message: string): void {
    if (!this.isCustom(row)) {
      throw new ConflictException(message);
    }
  }

  /**
   * The §4.3 serving gate, asked as a question instead of applied as a
   * redirect: is this row one the resolver would actually serve? Kept
   * identical to `StoreDomainResolver`'s gate on purpose — a domain that
   * cannot be served must never become the canonical one.
   */
  private assertServeable(row: StoreDomain): void {
    if (!this.isCustom(row)) {
      return; // PLATFORM_SUBDOMAIN: always-on, TLS never consulted (§7.2).
    }
    if (row.verificationStatus !== DomainVerificationStatus.VERIFIED) {
      throw new ConflictException(
        `This domain is not verified (status: ${row.verificationStatus}) — verify it before making it primary`,
      );
    }
    if ((row.tlsStatus ?? TlsStatus.PENDING) !== TlsStatus.ISSUED) {
      throw new ConflictException(
        `This domain has no issued certificate (TLS status: ${row.tlsStatus ?? TlsStatus.PENDING}) — refresh its TLS status once DNS has propagated`,
      );
    }
  }

  /**
   * Turns a lost race on `store_domains_store_primary_unique` into a clean
   * 409 instead of a 500. Both W6 paths that touch `isPrimary` read the
   * current primary and then write, so two concurrent requests (an
   * impatient double-click, say) can collide on the partial unique index.
   * The index is doing its job — a store must never have two primaries — so
   * the right answer is "retry", not an opaque server error.
   */
  private async asPrimaryConflict<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException(
          'Another domain became primary concurrently — retry',
        );
      }
      throw err;
    }
  }

  /** Every hostname of a store — the cache-bust set for any primary change. */
  private async storeHostnames(
    tx: Prisma.TransactionClient,
    storeId: string,
  ): Promise<string[]> {
    const rows = await tx.storeDomain.findMany({
      where: { storeId },
      select: { hostname: true },
    });
    return rows.map((r) => r.hostname);
  }

  private bustAll(hostnames: string[]): void {
    for (const hostname of hostnames) {
      this.cache.bust(hostname);
    }
  }

  /**
   * Asks the hosting provider for the certificate state and maps it through
   * the single §7.2 mapping. A provider failure becomes `ERROR` — the honest
   * answer, and still fail-closed at the serving gate.
   */
  private async readProviderTlsStatus(
    hostname: string,
    tenantId: string,
  ): Promise<TlsStatus> {
    try {
      return mapCertificateToTlsStatus(
        await this.hosting.getDomainStatus(hostname),
      );
    } catch (err) {
      if (err instanceof DomainHostingError) {
        this.logger.warn(
          `hosting provider could not report status for '${hostname}' (tenant ${tenantId}): ${err.message}`,
        );
        return TlsStatus.ERROR;
      }
      throw err;
    }
  }

  /** Persists a `tlsStatus` transition with its audit row, in one tx. */
  private async writeTlsStatus(
    tenantContext: TenantContext,
    actor: AuthenticatedUser,
    row: StoreDomain,
    tlsStatus: TlsStatus,
    action: string,
  ): Promise<StoreDomain> {
    const tenantId = tenantContext.tenantId;
    return withTenantRlsContext(this.prisma, tenantId, async (tx) => {
      const updated = await tx.storeDomain.update({
        where: { id: row.id },
        data: { tlsStatus },
      });
      const attribution = await resolveTenantAuditActor(
        tx,
        tenantContext,
        actor,
      );
      await this.auditService.logTenantAction(tx, {
        tenantId,
        ...attribution,
        action,
        targetType: 'StoreDomain',
        targetId: row.id,
        metadata: {
          hostname: row.hostname,
          fromTlsStatus: row.tlsStatus,
          toTlsStatus: tlsStatus,
        },
      });
      return updated;
    });
  }

  /**
   * Post-verification provider attach (spec §6.3 final paragraph). Runs after
   * the verification transaction has committed. Never throws: the domain IS
   * verified, and a provider problem must not undo that — it is recorded as
   * `tlsStatus = ERROR` (§6.3: "the row stays VERIFIED with tlsStatus=ERROR
   * and the merchant/platform can retry via Refresh TLS status").
   */
  private async attachToHostingProvider(
    tenantId: string,
    row: StoreDomain,
  ): Promise<StoreDomain> {
    let tlsStatus: TlsStatus;
    try {
      tlsStatus = mapCertificateToTlsStatus(
        await this.hosting.addDomain(row.hostname),
      );
    } catch (err) {
      if (!(err instanceof DomainHostingError)) {
        throw err;
      }
      this.logger.error(
        `hosting provider could not attach verified domain '${row.hostname}' (tenant ${tenantId}): ${err.message}`,
      );
      tlsStatus = TlsStatus.ERROR;
    }
    if (tlsStatus === row.tlsStatus) {
      return row;
    }
    const updated = await withTenantRlsContext(this.prisma, tenantId, (tx) =>
      tx.storeDomain.update({ where: { id: row.id }, data: { tlsStatus } }),
    );
    this.cache.bust(updated.hostname);
    return updated;
  }

  /** Spec §6.2 hostname validation on add. */
  private validateNewHostname(raw: string): string {
    const hostname = normaliseHost(raw, { allowLoopback: false });
    if (hostname === null) {
      throw new BadRequestException('hostname is not a valid domain name');
    }
    if (
      this.platformStorefrontDomain !== null &&
      (hostname === this.platformStorefrontDomain ||
        hostname.endsWith(`.${this.platformStorefrontDomain}`))
    ) {
      throw new BadRequestException(
        'hostname may not be under the platform storefront domain',
      );
    }
    if (this.reservedHosts.has(hostname)) {
      throw new BadRequestException('hostname is reserved');
    }
    return hostname;
  }

  /**
   * S-6 retention point 2: the latest `store_domain.verification_failed`
   * audit row per domain, surfaced as "last failure" in the merchant list.
   * Tenant-scoped by the caller's own tenantId.
   */
  private async latestFailures(
    tenantId: string,
    domainIds: string[],
  ): Promise<Map<string, LastVerificationFailure>> {
    const out = new Map<string, LastVerificationFailure>();
    if (domainIds.length === 0) {
      return out;
    }
    const rows = await this.prisma.tenantAuditLog.findMany({
      where: {
        tenantId,
        action: STORE_DOMAIN_AUDIT.verificationFailed,
        targetType: 'StoreDomain',
        targetId: { in: domainIds },
      },
      orderBy: { createdAt: 'desc' },
      select: { targetId: true, metadata: true, createdAt: true },
    });
    for (const row of rows) {
      if (out.has(row.targetId)) {
        continue;
      }
      const meta = row.metadata as { reason?: string; checkedAt?: string };
      if (typeof meta.reason === 'string') {
        out.set(row.targetId, {
          reason: meta.reason as VerificationFailureReason,
          checkedAt: meta.checkedAt ? new Date(meta.checkedAt) : row.createdAt,
        });
      }
    }
    return out;
  }

  private toView(
    row: StoreDomain,
    lastVerificationFailure: LastVerificationFailure | null,
  ): StoreDomainView {
    return {
      id: row.id,
      hostname: row.hostname,
      type: row.type,
      isPrimary: row.isPrimary,
      verificationStatus: row.verificationStatus,
      verificationMethod: row.verificationMethod,
      tlsStatus: row.tlsStatus,
      lastCheckedAt: row.lastCheckedAt,
      verifiedAt: row.verifiedAt,
      createdAt: row.createdAt,
      lastVerificationFailure,
    };
  }
}
