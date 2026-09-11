import { Prisma } from '@prisma/client';
import { TenantContext } from '../tenant/tenant-context';
import { AuthenticatedUser } from '../decorators/current-user.decorator';

/**
 * Phase 5 W8 (Tenant Control Plane audit wiring). Resolves the correct
 * `TenantAuditLogInput` actor fields for a tenant-admin mutation —
 * extracted from the exact logic `TeamService` (Phase 5 W7) already
 * established for this purpose, now shared by every W8-audited service so
 * it is proven once and never duplicated or reimplemented slightly
 * differently at a new call site.
 *
 * Ordinary tenant actor: the caller's own `TenantMembership` row for the
 * current tenant is looked up fresh, INSIDE the caller's own transaction
 * (never trusted from a client-supplied id, never cached) — `id` becomes
 * `actorMembershipId`.
 *
 * SupportSession actor (Phase 5 W6): a SUPER_ADMIN acting via a support
 * session structurally has NO real `TenantMembership` row for this tenant
 * (frozen invariant 4) — `actorMembership` resolves to `null`,
 * `actorMembershipId` is correctly left `undefined` (never fabricated),
 * and `viaSupportSessionId` identifies the session instead.
 *
 * `actorCustomerId` is never set here — no existing W8-audited operation
 * is ever initiated by a `Customer` identity (that axis is a distinct,
 * unauthenticated-storefront concern; see `object-auth.ts`'s own scope
 * note). A future operation that genuinely needs it would set it
 * explicitly at its own call site, not through this helper.
 */
export async function resolveTenantAuditActor(
  tx: Prisma.TransactionClient,
  tenantContext: TenantContext,
  actor: AuthenticatedUser,
): Promise<{ actorMembershipId?: string; viaSupportSessionId?: string }> {
  if (tenantContext.source === 'support-session') {
    return { viaSupportSessionId: tenantContext.supportSession?.id };
  }

  const actorMembership = await tx.tenantMembership.findUnique({
    where: {
      userId_tenantId: { userId: actor.id, tenantId: tenantContext.tenantId },
    },
    select: { id: true },
  });

  return { actorMembershipId: actorMembership?.id };
}
