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
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config(${TENANT_ID_SETTING}, ${tenantId}, true)`;
    return fn(tx);
  });
}

/**
 * Runs `fn` inside a transaction with the RLS bypass GUC set for its
 * duration. Reserved for the small, explicitly named set of legitimately
 * cross-tenant, platform-scoped operations (Master Plan §9) — currently
 * exactly three call sites: `JwtStrategy.validate()` (loading a User's own
 * memberships across whichever tenants they hold, before any tenant is
 * selected), `TenantContextGuard`'s host/domain lookup (resolving a
 * tenant from a hostname, before a tenant is known), and (Phase 4 W7,
 * decision P4-D2's create-path fix) `StorefrontTenantResolver`'s identical
 * host/domain lookup for the storefront/customer path, which has no
 * `TenantMembership` to cross-check against and therefore no other way to
 * resolve a tenant before one is known. Do not add a new caller without
 * updating this comment and the migration's own header — this is the one
 * door around RLS's fail-closed default, and it must stay small and
 * auditable.
 */
export async function withPlatformRlsBypass<T>(
  prisma: PrismaService,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config(${BYPASS_SETTING}, 'true', true)`;
    return fn(tx);
  });
}
