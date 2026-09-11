import { ForbiddenException } from '@nestjs/common';
import { Prisma, TenantStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

/**
 * Phase 5 W4 (SaaS Master Plan §11) — the single, authoritative "is this
 * tenant usable right now" check. Formalizes what `TenantStatus.ACTIVE`/
 * `SUSPENDED` actually mean operationally: a SUSPENDED tenant's merchant/
 * admin operations and storefront commerce are blocked; nothing about the
 * tenant's data, memberships, orders, or audit trail is touched — W4
 * mutates nothing, it only gates.
 *
 * Kept in exactly one place, called directly (no DI wiring) — the same
 * free-function convention `tenant-rls.ts` already established for
 * cross-cutting tenant utilities, used as-is by `jwt.strategy.ts`,
 * `tenant-context.guard.ts`, and `storefront-tenant.resolver.ts`. Three
 * call sites for this function:
 *   - `TenantLifecycleGuard` (merchant/admin path, runs after
 *     `TenantContextGuard` has resolved `request.tenantContext`)
 *   - `StorefrontTenantResolver.resolveTenantId` (storefront cart/uploads
 *     — a shopper never gets a `TenantContext`, so the guard above never
 *     sees them; this is the actual resolution point for that path)
 *   - `CheckoutService` (order creation + preview — reads an
 *     already-loaded cart's own `tenantId` directly, bypassing the
 *     resolver entirely, per that resolver's own header comment)
 *
 * Only ever blocks on `SUSPENDED` — `PENDING_DELETION`/`DELETED` are out
 * of scope for this phase (W4 implements `ACTIVE<->SUSPENDED` only, this
 * session's ratified decision), so this function cannot accidentally
 * start enforcing a lifecycle stage W4 was never asked to implement.
 */
export async function assertTenantActive(
  prisma: PrismaService | Prisma.TransactionClient,
  tenantId: string,
  message: string,
): Promise<void> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { status: true },
  });
  if (tenant?.status === TenantStatus.SUSPENDED) {
    throw new ForbiddenException(message);
  }
}
