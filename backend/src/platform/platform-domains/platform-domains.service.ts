import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  DomainVerificationStatus,
  Prisma,
  StoreDomain,
  StoreDomainType,
} from '@prisma/client';
import { AuditService } from '../../common/audit/audit.service';
import { PrismaService } from '../../common/database/prisma.service';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import {
  DOMAIN_HOSTING_PROVIDER,
  DomainHostingError,
} from '../../common/tenant/store-domain-resolution/hosting/domain-hosting-provider';
import type {
  DomainHostingProvider,
  DomainHostingStatus,
} from '../../common/tenant/store-domain-resolution/hosting/domain-hosting-provider';
import { StoreDomainLookupCache } from '../../common/tenant/store-domain-resolution/store-domain-lookup.cache';
import { withPlatformRlsBypass } from '../../common/tenant/tenant-rls';
import { StoreDomainVerificationCheck } from '../../store-domains/store-domain-verification-check.service';
import type { VerificationFailureReason } from '../../store-domains/store-domain-verification';
import type {
  LastVerificationFailure,
  StoreDomainView,
} from '../../store-domains/store-domain-view.interface';
import { STORE_DOMAIN_AUDIT } from '../../store-domains/store-domain-audit.constants';
import { PaginatedResult } from '../../common/types/api-response.interface';
import { ListPlatformDomainsQueryDto } from './dto/list-platform-domains-query.dto';
import type {
  PlatformDomainDetailView,
  PlatformDomainSummaryView,
} from './dto/platform-domain-view.interface';

/** `PlatformAuditLog` actions for this surface (spec §6.4). */
export const PLATFORM_DOMAIN_AUDIT = {
  revoked: 'platform.domain.revoked',
  restored: 'platform.domain.restored',
  verificationOverridden: 'platform.domain.verification_overridden',
  reverified: 'platform.domain.reverified',
  // Phase 9 W6 (spec §6.4)
  removed: 'platform.domain.removed',
} as const;

/** Spec §6.3: the advisory lock is held across the bounded DNS lookup. */
const VERIFY_TX_OPTIONS = { timeout: 15_000, maxWait: 5_000 };

export interface PlatformDomainActionView {
  domain: StoreDomainView;
  /** Present only when a platform re-verify check failed. */
  reason?: VerificationFailureReason;
}

/**
 * Phase 9 W5 — the Platform Control Plane half of the approved `StoreDomain`
 * verification flow (spec §6.3 transition table, §6.4; ⚖️ P9-S7). Exactly the
 * three transitions the merchant may never perform:
 *
 *   VERIFIED --revoke--------> FAILED    `platform.domain.revoked`
 *   PENDING  --override------> VERIFIED  `platform.domain.verification_overridden`
 *   FAILED   --override------> VERIFIED  `platform.domain.restored`
 *   PENDING  --re-verify pass-> VERIFIED `platform.domain.reverified`
 *   PENDING  --re-verify fail-> PENDING  (S-6: reason retained, not on the row)
 *   FAILED   --re-verify pass-> VERIFIED `platform.domain.reverified`   (restore)
 *   FAILED   --re-verify fail-> FAILED   (stays revoked — sticky)
 *
 * P9-S7 STICKINESS. `FAILED` is entered ONLY here (a failed merchant check
 * keeps `PENDING` — S-6), and it is left ONLY here. `StoreDomainsService
 * .verify()` refuses a `FAILED` row before any DNS call and without any state
 * change; there is no merchant escape hatch anywhere in the codebase.
 *
 * AUTHORIZATION. `PlatformGuard` / `@PlatformOnly()` on
 * `platform-domains.controller.ts` restricts every route this service backs
 * to an authenticated `SUPER_ADMIN` before any method here runs — this class
 * never re-checks `platformRole` and holds no tenant permission of any kind
 * (frozen invariant 4: `PlatformGuard` and `PermissionsGuard` stay fully
 * independent, so `store-domain:manage` grants nothing here and being a
 * `SUPER_ADMIN` grants nothing on `/admin/store-domains`).
 *
 * CROSS-TENANT ACCESS. A platform admin addresses a `StoreDomain` by id with
 * no tenant of their own, so the row is reached through
 * `withPlatformRlsBypass` (its own doc comment names this as call site 5) and
 * `platform-domains.service.ts` is allowlisted in
 * `tenant-data-access-guard.spec.ts` under the same "platform admin" category
 * as `platform.service.ts`. Touches `StoreDomain` and nothing else — no
 * business/commerce row, no other tenancy model.
 *
 * W6 adds the read + removal half of §6.4: list/filter, inspect (with a LIVE
 * provider read), and remove-any-tenant.
 *
 * NOT here: the resolution-mode routes (W2's `PlatformConfigController` owns
 * those) and the real `VercelDomainHostingProvider` (a later wave binds it to
 * the same `DOMAIN_HOSTING_PROVIDER` token with no change in this file).
 */
@Injectable()
export class PlatformDomainsService {
  private readonly logger = new Logger(PlatformDomainsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly verificationCheck: StoreDomainVerificationCheck,
    private readonly cache: StoreDomainLookupCache,
    @Inject(DOMAIN_HOSTING_PROVIDER)
    private readonly hosting: DomainHostingProvider,
  ) {}

  /**
   * `VERIFIED → FAILED` (P9-S7). The one path into `FAILED` in Phase 9, and
   * the reason the resolver stops serving the host within one cache TTL
   * (busted here, so: immediately).
   */
  async revoke(
    actor: AuthenticatedUser,
    domainId: string,
    justification: string,
    ip: string,
  ): Promise<PlatformDomainActionView> {
    const row = await withPlatformRlsBypass(this.prisma, async (tx) => {
      const existing = await this.loadCustomDomain(tx, domainId);
      if (existing.verificationStatus !== DomainVerificationStatus.VERIFIED) {
        throw new ConflictException(
          `Domain is not VERIFIED (current status: ${existing.verificationStatus}) — only a VERIFIED domain can be revoked`,
        );
      }
      return this.transition(tx, {
        actor,
        row: existing,
        to: DomainVerificationStatus.FAILED,
        action: PLATFORM_DOMAIN_AUDIT.revoked,
        justification,
        ip,
        metadata: {},
      });
    });
    this.cache.bust(row.hostname);
    this.logger.warn(
      `store domain '${row.hostname}' (tenant ${row.tenantId}) REVOKED by platform actor ${actor.id}`,
    );
    return { domain: toView(row) };
  }

  /**
   * Manual approval without a DNS check: `PENDING → VERIFIED` (audited
   * `platform.domain.verification_overridden`) or `FAILED → VERIFIED`
   * (audited `platform.domain.restored` — the P9-S7 restore path). Both
   * require an explicit platform justification.
   */
  async override(
    actor: AuthenticatedUser,
    domainId: string,
    justification: string,
    ip: string,
  ): Promise<PlatformDomainActionView> {
    const row = await withPlatformRlsBypass(this.prisma, async (tx) => {
      const existing = await this.loadCustomDomain(tx, domainId);
      if (existing.verificationStatus === DomainVerificationStatus.VERIFIED) {
        throw new ConflictException('This domain is already verified');
      }
      const restoring =
        existing.verificationStatus === DomainVerificationStatus.FAILED;
      return this.transition(tx, {
        actor,
        row: existing,
        to: DomainVerificationStatus.VERIFIED,
        action: restoring
          ? PLATFORM_DOMAIN_AUDIT.restored
          : PLATFORM_DOMAIN_AUDIT.verificationOverridden,
        justification,
        ip,
        metadata: { override: true },
      });
    });
    this.cache.bust(row.hostname);
    return { domain: toView(row) };
  }

  /**
   * Force re-verify — the IDENTICAL on-demand check the merchant path runs
   * (`StoreDomainVerificationCheck`, spec §6.3), but permitted on a `FAILED`
   * row: a passing platform re-verify is the second approved restore path
   * (`platform.domain.reverified`), and a failing one leaves `FAILED`
   * exactly as it was (sticky — never downgraded to `PENDING`).
   */
  async reverify(
    actor: AuthenticatedUser,
    domainId: string,
    justification: string,
    ip: string,
  ): Promise<PlatformDomainActionView> {
    const result = await withPlatformRlsBypass(
      this.prisma,
      async (tx) => {
        const [{ locked }] = await tx.$queryRaw<{ locked: boolean }[]>`
          SELECT pg_try_advisory_xact_lock(hashtext(${domainId})) AS locked
        `;
        if (!locked) {
          throw new ConflictException(
            'A verification for this domain is already in progress',
          );
        }
        const existing = await this.loadCustomDomain(tx, domainId);
        if (existing.verificationStatus === DomainVerificationStatus.VERIFIED) {
          throw new ConflictException('This domain is already verified');
        }
        const wasRevoked =
          existing.verificationStatus === DomainVerificationStatus.FAILED;

        const outcome = await this.verificationCheck.check(existing);
        const checkedAt = new Date();

        if (outcome.passed) {
          const updated = await tx.storeDomain.update({
            where: { id: existing.id },
            data: {
              verificationStatus: DomainVerificationStatus.VERIFIED,
              verifiedAt: checkedAt,
              lastCheckedAt: checkedAt,
            },
          });
          await this.auditService.logPlatformAction(tx, {
            actorUserId: actor.id,
            action: PLATFORM_DOMAIN_AUDIT.reverified,
            targetType: 'StoreDomain',
            targetId: existing.id,
            tenantId: existing.tenantId,
            justification,
            metadata: {
              hostname: existing.hostname,
              fromStatus: existing.verificationStatus,
              toStatus: DomainVerificationStatus.VERIFIED,
              restored: wasRevoked,
              checkedAt: checkedAt.toISOString(),
            },
            ip,
          });
          return { row: updated, reason: undefined };
        }

        // Failed. S-6/P9-S7: `lastCheckedAt` is the ONLY column that moves —
        // a PENDING row stays PENDING and a revoked FAILED row stays FAILED.
        const updated = await tx.storeDomain.update({
          where: { id: existing.id },
          data: { lastCheckedAt: checkedAt },
        });
        await this.auditService.logPlatformAction(tx, {
          actorUserId: actor.id,
          action: PLATFORM_DOMAIN_AUDIT.reverified,
          targetType: 'StoreDomain',
          targetId: existing.id,
          tenantId: existing.tenantId,
          justification,
          metadata: {
            hostname: existing.hostname,
            fromStatus: existing.verificationStatus,
            toStatus: existing.verificationStatus,
            reason: outcome.reason,
            checkedAt: checkedAt.toISOString(),
          },
          ip,
        });
        return {
          row: updated,
          reason: outcome.reason as VerificationFailureReason | undefined,
        };
      },
      VERIFY_TX_OPTIONS,
    );

    this.cache.bust(result.row.hostname);
    if (result.reason) {
      this.logger.warn(
        `store domain '${result.row.hostname}' (tenant ${result.row.tenantId}) platform re-verification failed: ${result.reason}`,
      );
    }
    return {
      domain: toView(result.row),
      ...(result.reason ? { reason: result.reason } : {}),
    };
  }

  // ─── W6: list / inspect / remove (spec §6.4) ───────────────────────────

  /**
   * Cross-tenant domain list with the four ratified filters (spec §6.4).
   * A read of tenant METADATA — the domain row plus its owning tenant/store
   * identifiers — never a business row, which is the invariant the platform
   * control plane is allowed to operate under.
   */
  async list(
    query: ListPlatformDomainsQueryDto,
  ): Promise<PaginatedResult<PlatformDomainSummaryView>> {
    const where: Prisma.StoreDomainWhereInput = {
      ...(query.verificationStatus
        ? { verificationStatus: query.verificationStatus }
        : {}),
      ...(query.tlsStatus ? { tlsStatus: query.tlsStatus } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.tenantId ? { tenantId: query.tenantId } : {}),
    };

    const { rows, total } = await withPlatformRlsBypass(
      this.prisma,
      async (tx) => {
        const [found, count] = await Promise.all([
          tx.storeDomain.findMany({
            where,
            include: DOMAIN_OWNER_INCLUDE,
            orderBy: [{ createdAt: 'desc' }],
            skip: (query.page - 1) * query.limit,
            take: query.limit,
          }),
          tx.storeDomain.count({ where }),
        ]);
        return { rows: found, total: count };
      },
    );

    return {
      items: rows.map((row) => toSummaryView(row)),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.limit)),
      },
    };
  }

  /**
   * Inspect one domain (spec §6.4): the row, the last verification failure,
   * and a LIVE provider read. Nothing polls in Phase 9 (⚖️ P9-D7), so Inspect
   * is where an operator finds out that the stored `tlsStatus` is stale — the
   * live value is reported ALONGSIDE the stored one and deliberately does not
   * overwrite it, because a read should not mutate tenant state.
   */
  async inspect(domainId: string): Promise<PlatformDomainDetailView> {
    const row = await withPlatformRlsBypass(this.prisma, (tx) =>
      tx.storeDomain.findUnique({
        where: { id: domainId },
        include: DOMAIN_OWNER_INCLUDE,
      }),
    );
    if (!row) {
      throw new NotFoundException('Domain not found');
    }

    const lastVerificationFailure = await this.latestFailure(
      row.tenantId,
      row.id,
    );

    // §7.2: the wildcard covers PLATFORM_SUBDOMAIN rows, so the provider is
    // not asked about them at all.
    let providerStatus: DomainHostingStatus | null = null;
    let providerError: string | null = null;
    if ((row.type ?? StoreDomainType.CUSTOM) === StoreDomainType.CUSTOM) {
      try {
        providerStatus = await this.hosting.getDomainStatus(row.hostname);
      } catch (err) {
        if (!(err instanceof DomainHostingError)) {
          throw err;
        }
        providerError = err.message;
        this.logger.warn(
          `platform inspect: hosting provider could not report '${row.hostname}': ${err.message}`,
        );
      }
    }

    return {
      ...toSummaryView(row),
      lastVerificationFailure,
      providerStatus,
      providerError,
    };
  }

  /**
   * Remove any tenant's CUSTOM domain (spec §6.4 "Remove | As merchant
   * remove, any tenant"), so the rules are deliberately the merchant's:
   * `PLATFORM_SUBDOMAIN` rows are not removable, a removed primary is
   * replaced by the store's platform subdomain, and the provider detach
   * happens before the row is deleted (§7.2).
   *
   * A store is never left with zero primary domains: if the row is primary
   * and no platform subdomain exists to promote, the removal is refused —
   * the same refusal the merchant path gives, for the same reason.
   */
  async remove(
    actor: AuthenticatedUser,
    domainId: string,
    justification: string,
    ip: string,
  ): Promise<{
    removed: true;
    hostname: string;
    newPrimaryHostname: string | null;
  }> {
    const plan = await withPlatformRlsBypass(this.prisma, async (tx) => {
      const row = await this.loadCustomDomain(tx, domainId);
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
          "This is the store's only primary domain and it has no platform subdomain to fall back to — removing it would leave the store with no canonical domain",
        );
      }
      const hostnames = await tx.storeDomain.findMany({
        where: { storeId: row.storeId },
        select: { hostname: true },
      });
      return {
        row,
        fallbackId: fallback?.id ?? null,
        hostnames: hostnames.map((h) => h.hostname),
      };
    });

    try {
      await this.hosting.removeDomain(plan.row.hostname);
    } catch (err) {
      if (err instanceof DomainHostingError) {
        this.logger.error(
          `hosting provider refused to detach '${plan.row.hostname}': ${err.message}`,
        );
        throw new ServiceUnavailableException(
          'The hosting provider could not release this domain right now — nothing was changed; try again',
        );
      }
      throw err;
    }

    const newPrimaryHostname = await withPlatformRlsBypass(
      this.prisma,
      async (tx) => {
        const still = await tx.storeDomain.findUnique({
          where: { id: domainId },
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

        await this.auditService.logPlatformAction(tx, {
          actorUserId: actor.id,
          action: PLATFORM_DOMAIN_AUDIT.removed,
          targetType: 'StoreDomain',
          targetId: domainId,
          tenantId: still.tenantId,
          justification,
          metadata: {
            hostname: still.hostname,
            wasPrimary: still.isPrimary,
            newPrimaryHostname: promoted?.hostname ?? null,
          },
          ip,
        });
        return promoted?.hostname ?? null;
      },
    );

    for (const hostname of plan.hostnames) {
      this.cache.bust(hostname);
    }
    this.logger.warn(
      `store domain '${plan.row.hostname}' (tenant ${plan.row.tenantId}) REMOVED by platform actor ${actor.id}`,
    );
    return { removed: true, hostname: plan.row.hostname, newPrimaryHostname };
  }

  // ─── Helpers ─────────────────────────────────────────────────────────

  /**
   * The latest `store_domain.verification_failed` row for one domain — S-6
   * retention point 2, which spec §6.3 explicitly routes to "the platform
   * 'Inspect' view (§6.4)" as well as the merchant's list.
   *
   * ⚠️ This is the ONE place the platform control plane reads
   * `TenantAuditLog`, and it is narrow by construction: one action, one
   * `targetId`, scoped to that domain's OWN tenant, projected to a reason code
   * and a timestamp. P5-D3 keeps the two audit logs' READ SURFACES separate
   * (`GET /platform/audit` reads `PlatformAuditLog` only, and
   * `platform.service.ts` names no `TenantAuditLog` anywhere) — that stays
   * true; this is not a second audit read surface, it is the retrieval of the
   * failure reason S-6 deliberately chose not to store as a column. Widening
   * it into a general tenant-audit read from the platform plane would need its
   * own decision.
   */
  private async latestFailure(
    tenantId: string,
    domainId: string,
  ): Promise<LastVerificationFailure | null> {
    const row = await this.prisma.tenantAuditLog.findFirst({
      where: {
        tenantId,
        action: STORE_DOMAIN_AUDIT.verificationFailed,
        targetType: 'StoreDomain',
        targetId: domainId,
      },
      orderBy: { createdAt: 'desc' },
      select: { metadata: true, createdAt: true },
    });
    if (!row) {
      return null;
    }
    const meta = row.metadata as { reason?: string; checkedAt?: string };
    if (typeof meta.reason !== 'string') {
      return null;
    }
    return {
      reason: meta.reason as VerificationFailureReason,
      checkedAt: meta.checkedAt ? new Date(meta.checkedAt) : row.createdAt,
    };
  }

  /**
   * Loads a `StoreDomain` by id across every tenant. A `PLATFORM_SUBDOMAIN`
   * row is rejected for the same reason the merchant path rejects it: those
   * rows are always-on and never verification-gated (spec §4.3/§7.2), so
   * there is no verification state on them to revoke, override or re-check.
   * `type IS NULL` reads as `CUSTOM` (fail-closed, spec §3.2).
   */
  private async loadCustomDomain(
    tx: Prisma.TransactionClient,
    domainId: string,
  ): Promise<StoreDomain> {
    const row = await tx.storeDomain.findUnique({ where: { id: domainId } });
    if (!row) {
      throw new NotFoundException('Domain not found');
    }
    if ((row.type ?? StoreDomainType.CUSTOM) !== StoreDomainType.CUSTOM) {
      throw new ConflictException(
        'Platform subdomains are always-on and carry no verification state',
      );
    }
    return row;
  }

  /**
   * CAS status change + `PlatformAuditLog` row, in the caller's transaction.
   * Losing the race throws (same rationale as
   * `PlatformService.transitionTenantStatus`: a rare, deliberate,
   * single-actor platform action must surface a conflict, never silently
   * no-op). `verifiedAt` is deliberately left untouched by a revoke — it
   * records when the domain WAS verified, and no approved schema field
   * marks a revoke (P9-S7).
   */
  private async transition(
    tx: Prisma.TransactionClient,
    input: {
      actor: AuthenticatedUser;
      row: StoreDomain;
      to: DomainVerificationStatus;
      action: string;
      justification: string;
      ip: string;
      metadata: Record<string, string | boolean>;
    },
  ): Promise<StoreDomain> {
    const from = input.row.verificationStatus;
    const cas = await tx.storeDomain.updateMany({
      where: { id: input.row.id, verificationStatus: from },
      data: {
        verificationStatus: input.to,
        ...(input.to === DomainVerificationStatus.VERIFIED
          ? { verifiedAt: new Date() }
          : {}),
      },
    });
    if (cas.count !== 1) {
      throw new ConflictException(
        'Domain verification status changed concurrently — retry',
      );
    }
    await this.auditService.logPlatformAction(tx, {
      actorUserId: input.actor.id,
      action: input.action,
      targetType: 'StoreDomain',
      targetId: input.row.id,
      tenantId: input.row.tenantId,
      justification: input.justification,
      metadata: {
        ...input.metadata,
        hostname: input.row.hostname,
        fromStatus: from,
        toStatus: input.to,
      },
      ip: input.ip,
    });
    return tx.storeDomain.findUniqueOrThrow({ where: { id: input.row.id } });
  }
}

/**
 * The owning tenant/store METADATA every platform view carries — ids, slugs
 * and the store name, and nothing else. No business/commerce relation is
 * selected anywhere on this surface.
 */
const DOMAIN_OWNER_INCLUDE = {
  tenant: { select: { slug: true } },
  store: { select: { slug: true, name: true } },
} satisfies Prisma.StoreDomainInclude;

type DomainWithOwner = Prisma.StoreDomainGetPayload<{
  include: typeof DOMAIN_OWNER_INCLUDE;
}>;

/**
 * The same safe projection the merchant surface returns (`StoreDomainView`).
 * `lastVerificationFailure` is `null` here: the mutation responses on this
 * surface report what the platform actor just did, and the failure reason is
 * filled in only by `inspect()` (spec §6.4), which fetches it explicitly.
 * Never exposes `verificationToken`.
 */
function toView(row: StoreDomain): StoreDomainView {
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
    lastVerificationFailure: null,
  };
}

/** `toView` plus the owning tenant/store metadata (spec §6.4 list/inspect). */
function toSummaryView(row: DomainWithOwner): PlatformDomainSummaryView {
  return {
    ...toView(row),
    tenantId: row.tenantId,
    tenantSlug: row.tenant.slug,
    storeId: row.storeId,
    storeSlug: row.store.slug,
    storeName: row.store.name,
  };
}
