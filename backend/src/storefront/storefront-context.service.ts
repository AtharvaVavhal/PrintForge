import { Injectable } from '@nestjs/common';
import type { StoreStatus } from '@prisma/client';
import { PrismaService } from '../common/database/prisma.service';
import type { StoreContext } from '../common/tenant/store-domain-resolution/store-context';
import { getTenantScopedClient } from '../common/tenant/tenant-prisma';

/**
 * The `GET /storefront/context` response (spec §10.4): the foundation the
 * W7 `StoreContextProvider` shell consumes. Deliberately excludes
 * `tenantId` and `storeDomainId` — internal resolution facts, not
 * storefront chrome.
 */
export interface StorefrontBootstrapView {
  storeId: string | null;
  storeName: string | null;
  storeStatus: StoreStatus | null;
  /** `https://<primary hostname>` in `host_resolution` mode; `null` in legacy mode. */
  canonicalOrigin: string | null;
  /** `false` when served on a non-primary host — the SPA self-canonicalises (§11). */
  isPrimary: boolean;
  resolvedBy: StoreContext['resolvedBy'];
}

@Injectable()
export class StorefrontContextService {
  constructor(private readonly prisma: PrismaService) {}

  async toBootstrapView(
    context: StoreContext,
  ): Promise<StorefrontBootstrapView> {
    // The store row is read through the tenant-scoped client (D4) using
    // the SERVER-resolved tenant — never a client value — mirroring
    // `resolvePrimaryStoreId`'s own access pattern.
    const store =
      context.storeId === null
        ? null
        : await getTenantScopedClient(
            this.prisma,
            context.tenantId,
          ).store.findFirst({
            where: { id: context.storeId },
            select: { id: true, name: true, status: true },
          });
    return {
      storeId: store?.id ?? null,
      storeName: store?.name ?? null,
      storeStatus: store?.status ?? null,
      canonicalOrigin: context.canonicalOrigin,
      isPrimary: context.isPrimary,
      resolvedBy: context.resolvedBy,
    };
  }
}
