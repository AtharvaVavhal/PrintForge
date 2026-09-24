import {
  DomainVerificationStatus,
  Prisma,
  StoreDomainType,
} from '@prisma/client';
import { normaliseHost } from '../common/tenant/store-domain-resolution/host-normalisation';

/**
 * Phase 9 W6 — platform-subdomain provisioning (spec §5; ⚖️ P9-D6, 🔎 S-5).
 *
 * Every `Store` gets exactly one `PLATFORM_SUBDOMAIN` row,
 * `hostname = "{store.slug}.{PLATFORM_STOREFRONT_DOMAIN}"`, created in the
 * SAME transaction as the store (§5 creation point (b)). These rows are
 * always-on: `verificationStatus = VERIFIED` at creation because the platform
 * controls that DNS zone, `verificationMethod = null` (nothing to prove), and
 * `tlsStatus = null` because the wildcard certificate covers them and §7.2
 * says it is never consulted for this type.
 *
 * 🔎 S-5. `Store.slug` is NOT globally unique (making it so is explicitly out
 * of scope — it would be a constraint change on an existing table, outside
 * G-19), so two tenants can pick the same slug and derive the same hostname.
 * `ensurePlatformSubdomain` therefore does a PRE-INSERT check on the derived
 * hostname and fails loudly with `PlatformSubdomainCollisionError` rather than
 * silently suffixing — the `hostname @unique` constraint is only the database
 * backstop. Choosing a collision policy (suffix / global-unique slug) is
 * explicitly deferred to whichever change introduces self-service store
 * creation or slug mutation; §5 does not pre-decide it, and neither does this.
 *
 * Slug immutability (§5): no runtime code creates or updates a `Store` today
 * — the only store-creation path is `prisma/seed-tenant-bootstrap.ts` — so
 * this is a creation-time helper, not a re-derivation service. If slugs ever
 * become mutable, re-deriving (or refusing) is a separate, decided change.
 *
 * The §16 B-1/B-2/B-4 backfill for Stores that ALREADY exist is deliberately
 * NOT authored here and remains unresolved carry-forward.
 */
export class PlatformSubdomainCollisionError extends Error {
  constructor(readonly hostname: string) {
    super(
      `Platform subdomain "${hostname}" is already taken by another store — refusing to create a second store under the same derived hostname (Phase 9 spec S-5). Choose a different store slug.`,
    );
    this.name = 'PlatformSubdomainCollisionError';
  }
}

export class PlatformSubdomainInvalidError extends Error {
  constructor(readonly hostname: string) {
    super(
      `Derived platform subdomain "${hostname}" is not a valid hostname — check the store slug and PLATFORM_STOREFRONT_DOMAIN.`,
    );
    this.name = 'PlatformSubdomainInvalidError';
  }
}

/**
 * `{slug}.{platformStorefrontDomain}`, normalised to the ONE lookup key the
 * resolver keys on (`normaliseHost`), or `null` when the result is not a
 * syntactically valid hostname. `allowLoopback: false`: a platform storefront
 * domain is always a real, multi-label domain, in every environment.
 */
export function derivePlatformSubdomain(
  storeSlug: string,
  platformStorefrontDomain: string,
): string | null {
  return normaliseHost(`${storeSlug}.${platformStorefrontDomain}`, {
    allowLoopback: false,
  });
}

export type EnsurePlatformSubdomainResult =
  | { outcome: 'created'; hostname: string; storeDomainId: string }
  /** The store already has this exact row — re-running is a safe no-op. */
  | { outcome: 'existing'; hostname: string; storeDomainId: string }
  /** `PLATFORM_STOREFRONT_DOMAIN` is unset; nothing can be derived (§5.2). */
  | { outcome: 'skipped'; reason: 'platform_storefront_domain_not_configured' };

/**
 * Idempotently ensures the store's `PLATFORM_SUBDOMAIN` row exists. Runs
 * inside the CALLER's transaction — the same convention `AuditService` uses —
 * so the row commits atomically with the store it belongs to, or not at all.
 *
 * `isPrimary` is set only when the store has NO primary domain yet (§5
 * "`isPrimary = true` unless the store already has a primary domain"); the
 * partial unique index `store_domains_store_primary_unique` is the backstop.
 */
export async function ensurePlatformSubdomain(
  tx: Prisma.TransactionClient,
  input: {
    storeId: string;
    tenantId: string;
    storeSlug: string;
    platformStorefrontDomain: string | null;
  },
): Promise<EnsurePlatformSubdomainResult> {
  if (
    input.platformStorefrontDomain === null ||
    input.platformStorefrontDomain.length === 0
  ) {
    return {
      outcome: 'skipped',
      reason: 'platform_storefront_domain_not_configured',
    };
  }

  const hostname = derivePlatformSubdomain(
    input.storeSlug,
    input.platformStorefrontDomain,
  );
  if (hostname === null) {
    throw new PlatformSubdomainInvalidError(
      `${input.storeSlug}.${input.platformStorefrontDomain}`,
    );
  }

  // S-5 pre-insert check. A row for THIS store is the idempotent re-run case;
  // a row for any other store is a genuine collision and must fail loudly.
  const existing = await tx.storeDomain.findUnique({ where: { hostname } });
  if (existing) {
    if (existing.storeId !== input.storeId) {
      throw new PlatformSubdomainCollisionError(hostname);
    }
    return { outcome: 'existing', hostname, storeDomainId: existing.id };
  }

  const currentPrimary = await tx.storeDomain.findFirst({
    where: { storeId: input.storeId, isPrimary: true },
    select: { id: true },
  });

  const created = await tx.storeDomain.create({
    data: {
      storeId: input.storeId,
      tenantId: input.tenantId,
      hostname,
      type: StoreDomainType.PLATFORM_SUBDOMAIN,
      // The platform owns this DNS zone — there is nothing for a merchant to
      // prove, so the row is VERIFIED at creation (§5).
      verificationStatus: DomainVerificationStatus.VERIFIED,
      verificationMethod: null,
      verificationToken: null,
      verifiedAt: new Date(),
      // Never consulted for this type — the wildcard certificate covers it
      // (§7.2). Deliberately null, not PENDING.
      tlsStatus: null,
      isPrimary: currentPrimary === null,
    },
  });
  return { outcome: 'created', hostname, storeDomainId: created.id };
}
