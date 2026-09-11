import { PrismaService } from '../database/prisma.service';
import {
  getTenantScopedClient,
  TenantScopedPrismaClient,
} from './tenant-prisma';

/**
 * Phase 5 W5 — SupportSession scoped-client extension (SaaS Master Plan
 * §11; decisions P5-D4 / P5-D8, docs/saas/DECISIONS.md).
 *
 * This is infrastructure ONLY: it establishes the one reusable mechanism a
 * future SupportSession flow (Phase 5 W6 — not built yet) will use to turn
 * an already-validated, server-derived tenant id into a tenant-scoped
 * Prisma client. It does not implement SupportSession itself — there is no
 * SupportSession Prisma model, controller, service, token/session
 * issuance, or audit event anywhere in this file or introduced by it.
 *
 * Expected security model (P5-D8):
 *
 *   SUPER_ADMIN -> SupportSession (W6, future) -> server-derived tenant
 *     identity -> getSupportSessionScopedClient() (this file) -> tenant-
 *     scoped data access (D4's existing tenant-prisma.ts mechanism)
 *
 *   NEVER: SUPER_ADMIN -> global Prisma -> arbitrary tenant data.
 *
 * Why a separate, named entry point instead of W6 calling
 * `getTenantScopedClient` directly:
 *   - `getTenantScopedClient` takes a bare `tenantId: string` — correct for
 *     the D4 tenant-membership path, where `TenantContextGuard` is the
 *     sole, already-audited producer of that string. A future
 *     SupportSession flow is a DIFFERENT trust path (platform-initiated,
 *     not membership-based), so it gets its own, differently-typed entry
 *     point: `identity` is a structured object carrying an explicit
 *     `source: 'support-session'` discriminant, not a bare string — a
 *     caller cannot pass an arbitrary id without deliberately constructing
 *     this shape (the same discriminant convention `TenantContext.source`
 *     already uses).
 *   - This function is the one place a future static test can pin "every
 *     call site of the support-scoped client is inside SupportSession-
 *     gated code" — the same enumeration-test convention
 *     `platform.guard.spec.ts` already uses for `@PlatformOnly()`. As of
 *     W5, this file has ZERO callers anywhere in `src/` (see
 *     `support-session-scoped-client.spec.ts`) — it ships dormant, exactly
 *     as `@PlatformOnly()`/`PlatformGuard` shipped dormant in Phase 2a
 *     before Phase 5 W3 became their first real consumer.
 *   - It fails closed (throws synchronously) on a missing/empty tenantId
 *     rather than ever producing an unscoped client — no default tenant,
 *     no "most recent tenant" fallback, no platform-wide fallback.
 *
 * What this file deliberately does NOT do (W6's job, not W5's):
 *   - It does not look up, validate, expire, or authorize a SupportSession.
 *     The caller must already hold a validated, server-derived tenantId
 *     before calling this function — exactly as `TenantContextGuard`
 *     already validates a membership-derived tenantId before
 *     `TenantLifecycleGuard`/`PermissionsGuard` ever see it.
 *   - It carries no notion of a permission ceiling. Data isolation (which
 *     rows are reachable — this file) and permission authorization (which
 *     operations are allowed — `PermissionsGuard`, and, in W6, whatever
 *     checks the granted SupportSession scope) are deliberately kept
 *     separate per P5-D8; combining them into one mechanism is exactly the
 *     "unrestricted SUPER_ADMIN bypass" shape that decision rejects. Any
 *     future permission-ceiling check belongs beside `PermissionsGuard`,
 *     not inside this data-access primitive.
 *   - It does not touch `TenantContext` (`tenant-context.ts`). Adding a
 *     `'support-session'` member to that union's `source` field is not
 *     needed for this primitive's type safety — this file defines its own,
 *     separate identity type instead — and doing so today would add a
 *     union member with zero real producer or consumer until W6 builds the
 *     guard that resolves one (see the W5 implementation report for the
 *     full reasoning).
 *
 * Data-access mechanism: delegates entirely to `getTenantScopedClient`
 * (`tenant-prisma.ts`) — the same D4 primary isolation mechanism already
 * scoping `Tenant`/`Store`/`StoreDomain`/`TenantMembership`/`Subscription`/
 * `Customer`. No new scoping logic and no direct Prisma model delegate call
 * of its own — this file therefore needs no new entry in
 * `tenant-data-access-guard.spec.ts`'s allowlist (it never matches that
 * guard's detection pattern, on the same grounds `tenant-prisma.ts` itself
 * is already excluded there: generic, names no tenancy model literally).
 */

/**
 * Structured, server-derived tenant identity for the support-session
 * category of caller. Deliberately NOT the real `TenantContext` type (see
 * file header) — a minimal, purpose-built shape carrying only what this
 * primitive needs: which tenant, and an explicit tag proving the caller
 * means to invoke the support-session path rather than passing an
 * arbitrary, easily-mistaken-for-unrelated string.
 */
export interface SupportSessionTenantIdentity {
  readonly tenantId: string;
  readonly source: 'support-session';
}

/**
 * Produces a tenant-scoped Prisma client for the support-session category
 * of caller. `identity.tenantId` MUST already be server-derived and
 * validated by the caller (in W6: resolved from a real, unexpired
 * SupportSession row, never from a request body/query/header or from the
 * caller's platform role alone) — this function performs no lookup or
 * validation of its own beyond the fail-closed check below; it exists
 * purely to name and gate the one legitimate place that trust hand-off
 * happens, and to route it through the existing D4 scoping mechanism.
 *
 * Fails closed: throws synchronously if no tenantId is present on the
 * given identity, rather than ever falling back to an unscoped or
 * platform-wide client.
 */
export function getSupportSessionScopedClient(
  prisma: PrismaService,
  identity: SupportSessionTenantIdentity,
): TenantScopedPrismaClient {
  if (!identity?.tenantId) {
    throw new Error(
      'getSupportSessionScopedClient: no tenantId on the provided identity — refusing to create an unscoped client',
    );
  }
  return getTenantScopedClient(prisma, identity.tenantId);
}
