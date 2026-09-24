import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

/**
 * Transaction-local RLS session variables (SaaS Master Plan §9; decision
 * D4 — RLS defense-in-depth, docs/saas/DECISIONS.md). Set via
 * `set_config(..., true)` — the `true` third argument makes the value
 * transaction-local (`SET LOCAL` semantics), matching P3-D2's empirically
 * verified connection behavior: it does not leak to any other transaction
 * or connection, and correctly reverts on `COMMIT`/`ROLLBACK`.
 *
 * `set_config()` is used (a normal parameterized query) rather than a
 * literal `SET LOCAL app.tenant_id = '<value>'` string, so the tenant id
 * is passed as a bound parameter — never interpolated into SQL text.
 */
const TENANT_ID_SETTING = 'app.tenant_id';
const BYPASS_SETTING = 'app.bypass_tenant_rls';

/**
 * Runs `fn` inside a transaction with the RLS tenant-id GUC set for its
 * duration — the normal path for any write that must be visible under RLS
 * as belonging to `tenantId`. Reads through the app-layer scoped client
 * (`tenant-prisma.ts`) already carry the correct `WHERE`/`data` values;
 * this additionally satisfies the RLS policy at the database layer.
 */
export async function withTenantRlsContext<T>(
  prisma: PrismaService,
  tenantId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  // Phase 9 W5: an on-demand domain verification holds its row-level
  // advisory lock across a bounded (≤ 5 s) DNS lookup inside this
  // transaction, so it needs a longer interactive-transaction budget than
  // Prisma's 5 s default. Every other caller keeps the default.
  options?: { timeout?: number; maxWait?: number },
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config(${TENANT_ID_SETTING}, ${tenantId}, true)`;
    return fn(tx);
  }, options);
}

/**
 * Runs `fn` inside a transaction with the RLS bypass GUC set for its
 * duration. Reserved for the small, explicitly named set of legitimately
 * cross-tenant, platform-scoped operations (Master Plan §9) — currently
 * exactly five call sites:
 *
 *  1. `JwtStrategy.validate()` — loading a User's own memberships across
 *     whichever tenants they hold, before any tenant is selected.
 *  2. `TenantContextGuard`'s host/domain lookup — resolving a tenant from a
 *     hostname, before a tenant is known.
 *  3. (Phase 4 W7, decision P4-D2's create-path fix) `StorefrontTenant
 *     Resolver`'s identical host/domain lookup for the storefront/customer
 *     path, which has no `TenantMembership` to cross-check against and
 *     therefore no other way to resolve a tenant before one is known.
 *  4. (Phase 9 W3, spec §3.6/§4.3) `StoreDomainResolver`'s hostname lookup
 *     and its LIVE Store/Tenant liveness reads — the same "resolve a tenant
 *     FROM a hostname" category as 2 and 3, for the `host_resolution`
 *     pipeline.
 *  5. (Phase 9 W5, spec §6.4) `PlatformDomainsService` — the `@PlatformOnly()`
 *     revoke / override / re-verify surface P9-S7 makes the ONLY exit from
 *     `FAILED`. A platform super-admin acts on a `StoreDomain` identified by
 *     id across every tenant, so there is no caller tenant to scope the
 *     transaction to; `store_domains` is RLS-enabled and FORCEd, so without
 *     the bypass the row would simply be invisible and a revoke would
 *     silently affect zero rows. Gated entirely by `PlatformGuard` upstream
 *     (`platform-domains.controller.ts`) and audited to `PlatformAuditLog`
 *     on every mutation.
 *
 * Do not add a new caller without updating this comment and the migration's
 * own header — this is the one door around RLS's fail-closed default, and it
 * must stay small and auditable.
 */
export async function withPlatformRlsBypass<T>(
  prisma: PrismaService,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  // Phase 9 W5: the platform re-verify path holds its row-level advisory
  // lock across a bounded (<= 5 s) DNS lookup inside this transaction, for
  // the same reason `withTenantRlsContext` above takes this option — the
  // merchant and platform verify paths apply the identical rule, including
  // the "at most one in-flight verification per domain" guarantee. Every
  // other caller keeps Prisma's default budget.
  options?: { timeout?: number; maxWait?: number },
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config(${BYPASS_SETTING}, 'true', true)`;
    return fn(tx);
  }, options);
}
