import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { getTenantScopedClient } from './tenant-prisma';

/**
 * Phase 5 W9 (decision D11). Resolves the ONE primary Store for a
 * server-derived tenantId — the "→ primary/current Store" step the D11
 * ownership model requires whenever a Store-owned setting needs to be
 * reached from a caller that only has a `tenantId` (checkout/tax read a
 * cart's own `tenantId`, never a `storeId` — `Cart.storeId` is never
 * populated by any code path today, confirmed by inspection; the public
 * storefront settings read has only a resolved tenantId too).
 *
 * Deliberately goes through `getTenantScopedClient` (D4's PRIMARY
 * isolation mechanism for `Store`) rather than a raw `prisma.store.*`
 * call — this is a genuine, correct consumer of that mechanism, and (per
 * `tenant-prisma.ts`'s own exemption) needs no new
 * `tenant-data-access-guard.spec.ts` allowlist entry, since it never
 * names the `store` model directly as `(this.)?(prisma|tx).store.`.
 *
 * `stores_tenant_primary_unique` (this schema's own pre-existing partial
 * unique index, `Store`'s own doc comment) already guarantees at most one
 * primary Store per tenant at the database level — this never has more
 * than one row to choose between.
 *
 * Fails closed: throws (never silently falls back to "any store", "the
 * most recent store", or a different tenant's store) if the tenant
 * genuinely has no primary Store configured — this should not happen for
 * any tenant created through the established bootstrap path
 * (`seed-tenant-bootstrap.ts`), but this helper never assumes it.
 */
export async function resolvePrimaryStoreId(
  prisma: PrismaService,
  tenantId: string,
): Promise<string> {
  const scoped = getTenantScopedClient(prisma, tenantId);
  const store = await scoped.store.findFirst({ where: { isPrimary: true } });
  if (!store) {
    throw new NotFoundException('This tenant has no primary store configured');
  }
  return store.id;
}
