import { Injectable } from '@nestjs/common';
import { PaymentAccountStatus, PaymentProviderType } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { getTenantScopedClient } from '../../common/tenant/tenant-prisma';
import { PaymentProviderAdapter } from '../providers/payment-provider-adapter.interface';
import { PaymentProviderRegistry } from '../providers/payment-provider-registry';
import {
  InactivePaymentAccountError,
  NoActivePaymentAccountError,
  PaymentAccountTenantMismatchError,
  StoreNotFoundError,
  UnknownPaymentAccountError,
} from './payment-account-resolution.errors';

export interface ResolvedPaymentAccount {
  paymentAccountId: string;
  provider: PaymentProviderType;
  adapter: PaymentProviderAdapter;
}

/** `resolveForWebhook`'s return shape — the one resolution path that also
 * hands back `tenantId`, since (unlike every other resolution method
 * here) the caller does not already know it: a webhook arrives
 * unauthenticated, before any tenant is known (see that method's own doc
 * comment). */
export interface ResolvedWebhookPaymentAccount extends ResolvedPaymentAccount {
  tenantId: string;
}

/**
 * Phase 8 (P8-6) — the authoritative server-side resolution chain: Tenant
 * -> Store -> active PaymentAccount -> PaymentProviderAdapter
 * (docs/saas/PHASE-8-ARCHITECTURE-AND-SCHEMA-SPEC.md §6). Never accepts a
 * client-supplied `paymentAccountId` as authority — every method here
 * takes only a server-derived `tenantId` plus either a server-resolved
 * `storeId` (never picked/derived by this class itself — see
 * `resolveForStore`'s own comment) or an already-persisted
 * `paymentAccountId` read off a domain row (`resolveForBoundAccount`).
 *
 * `PaymentAccount` is a commerce-domain table, not one of the six D4
 * tenancy models — same plain-`PrismaService`-with-explicit-`tenantId`-
 * filter convention `PaymentAccountsService` already establishes for this
 * exact table. Only the `Store` lookup goes through the tenant-scoped
 * client (`Store` IS a D4 model), mirroring
 * `PaymentAccountsService.assertStoreInTenant` / `resolvePrimaryStoreId`.
 *
 * Credential boundary (unchanged from P8-5): this class never touches
 * `credentialsEncrypted`, never decrypts anything, and the
 * `PaymentProviderAdapter` it returns carries no credential material — see
 * `PaymentProviderAdapter`'s own (marker-only) shape.
 */
@Injectable()
export class PaymentAccountResolutionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentProviderRegistry: PaymentProviderRegistry,
  ) {}

  /**
   * Fresh resolution for a NEW routing decision — the "resolve once" half
   * of P8-3 §6 ("resolve once, at checkout; persist the FK; never
   * re-resolve for the same order again"). `storeId` must already be
   * server-resolved by the caller (e.g. via `resolvePrimaryStoreId` —
   * this method does not pick "which store", it only verifies the given
   * one belongs to `tenantId` and looks up its `PaymentAccount`) — this is
   * deliberate: reusing whatever store-resolution mechanism already exists
   * rather than building a second, competing one (task scope item 4).
   *
   * `@@unique([storeId, provider])` guarantees `findUnique` here can never
   * return more than one candidate row — resolution is deterministic by
   * construction, not by a "pick the first/most recent" policy.
   */
  async resolveForStore(
    tenantId: string,
    storeId: string,
    provider: PaymentProviderType,
  ): Promise<ResolvedPaymentAccount> {
    await this.assertStoreInTenant(tenantId, storeId);

    const account = await this.prisma.paymentAccount.findUnique({
      where: { storeId_provider: { storeId, provider } },
    });

    if (!account) {
      throw new NoActivePaymentAccountError(storeId, provider);
    }
    // Defense in depth — structurally shouldn't happen (storeId is
    // already tenant-verified above, and the row was looked up BY that
    // same storeId), same "should never happen but never assumed" posture
    // `resolvePrimaryStoreId`'s own doc comment documents.
    if (account.tenantId !== tenantId) {
      throw new PaymentAccountTenantMismatchError(account.id);
    }
    if (account.status !== PaymentAccountStatus.ACTIVE) {
      throw new InactivePaymentAccountError(account.id, account.status);
    }

    return this.toResolved(account.id, account.provider);
  }

  /**
   * Re-hydration of an ALREADY-BOUND account (P8-3 §6 point 2): given a
   * `paymentAccountId` already persisted on a domain row (`Order.
   * paymentAccountId`, `PaymentAttempt.paymentAccountId`, etc. — none of
   * which are populated by this stage, see the P8-6 report), resolve its
   * provider adapter DIRECTLY BY ID — never by re-deriving "the store's
   * current active account" from `tenantId`/`storeId` again. This is what
   * keeps a historical record correct even if the store's configured
   * account changes later (P8-3 §6 point 2: "correct even in a
   * hypothetical future where a store's account changes after some of its
   * orders were already placed").
   *
   * Deliberately does NOT require `ACTIVE` status — an older record may
   * legitimately reference an account that has since been disabled, and
   * that is still the correct, authoritative account for that record, not
   * an error.
   */
  async resolveForBoundAccount(
    tenantId: string,
    paymentAccountId: string,
  ): Promise<ResolvedPaymentAccount> {
    const account = await this.prisma.paymentAccount.findUnique({
      where: { id: paymentAccountId },
    });
    if (!account || account.tenantId !== tenantId) {
      throw new PaymentAccountTenantMismatchError(paymentAccountId);
    }
    return this.toResolved(account.id, account.provider);
  }

  /**
   * Webhook-boundary resolution (P8-10, P8-3 §9) — the ONE legitimate case
   * where a `PaymentAccount` is resolved WITHOUT an already-known
   * `tenantId`: the request arrives unauthenticated, and the path-param
   * account id itself IS the routing identifier P8-3 §9 specifies
   * ("resolved from the path parameter, server-side, before any
   * signature-verification attempt"). This method performs no
   * authorization decision by itself — it is a lookup, nothing more; real
   * trust is established afterwards, when the caller verifies the
   * webhook signature against exactly THIS row's own secret. An id with
   * no matching row throws `UnknownPaymentAccountError`, which the caller
   * (`PaymentsService.receiveMerchantWebhook`) must translate to the
   * exact same generic rejection as a bad signature — never a
   * distinguishable 404 (no account-existence oracle on an
   * unauthenticated endpoint).
   *
   * Deliberately does NOT require `ACTIVE` status — same P8-3 §6 point 2
   * philosophy `resolveForBoundAccount` already applies: a `DISABLED`
   * account's still-decryptable credentials remain valid for verifying
   * and processing webhooks about its OWN historical/in-flight payments.
   * Disabling an account blocks NEW payment creation (P8-9); it does not
   * retroactively invalidate history.
   */
  async resolveForWebhook(
    paymentAccountId: string,
  ): Promise<ResolvedWebhookPaymentAccount> {
    const account = await this.prisma.paymentAccount.findUnique({
      where: { id: paymentAccountId },
    });
    if (!account) {
      throw new UnknownPaymentAccountError(paymentAccountId);
    }
    return {
      ...this.toResolved(account.id, account.provider),
      tenantId: account.tenantId,
    };
  }

  private toResolved(
    paymentAccountId: string,
    provider: PaymentProviderType,
  ): ResolvedPaymentAccount {
    return {
      paymentAccountId,
      provider,
      adapter: this.paymentProviderRegistry.get(provider),
    };
  }

  /** `storeId` belongs to the caller's own tenant, resolved server-side —
   * never trusted as-is (invariant 1). Same pattern
   * `PaymentAccountsService.assertStoreInTenant` / `resolvePrimaryStoreId`
   * already establish for this identical need. */
  private async assertStoreInTenant(
    tenantId: string,
    storeId: string,
  ): Promise<void> {
    const scoped = getTenantScopedClient(this.prisma, tenantId);
    const store = await scoped.store.findUnique({ where: { id: storeId } });
    if (!store) {
      throw new StoreNotFoundError(storeId);
    }
  }
}
