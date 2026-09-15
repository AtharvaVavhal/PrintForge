import { PaymentProviderType } from '@prisma/client';

/**
 * Phase 8 (P8-13, P1 #1 remediation — docs/saas/PHASE-8-SECURITY-AUDIT.md
 * §17/§18/§19): a pure, READ-ONLY readiness check, not a backfill.
 *
 * The audit's finding: P8-9 removed every fallback to the global/legacy
 * `RazorpayService` for merchant commerce payment creation and
 * verification. Any `Store` that has real checkout traffic but no
 * `ACTIVE` `PaymentAccount` for `RAZORPAY` will have `initiatePayment`
 * fail closed with `MerchantPaymentUnavailableError` for every customer —
 * a full commerce outage for that store, not a security defect.
 *
 * There is NO safe way to close this gap automatically: per the ratified
 * Direct Merchant-Owned Razorpay Account model (P8-D3, unchanged by this
 * stage), a `PaymentAccount`'s credentials are the MERCHANT'S OWN
 * Razorpay key id/secret — this codebase has no legitimate source for
 * those beyond the merchant themselves submitting them via
 * `POST /admin/payment-accounts/:id/connect` (P8-5). Fabricating
 * credentials, silently activating an unconfigured account, or copying
 * any platform/global/SaaS Razorpay credential into a `PaymentAccount`
 * row would all violate P8-D3/P8-D6's ratified model directly — none of
 * that happens here or anywhere in this module.
 *
 * What THIS module does instead: identify, mechanically and repeatably,
 * exactly which `(Tenant, Store)` pairs are NOT yet ready for the
 * Phase 8 payment code path, so that gap can be closed the only
 * legitimate way — the merchant (or an operator acting for them, with
 * the merchant's own credentials) actually connecting a `PaymentAccount`
 * before this code reaches that tenant's production traffic. This is an
 * operational onboarding prerequisite (see
 * docs/ops/PHASE-8-PAYMENT-ACCOUNT-READINESS.md), not a code defect to
 * "fix" here.
 *
 * Framework-agnostic on purpose (accepts a minimal Prisma-shaped client,
 * not `PrismaService` specifically) so both the standalone ops script
 * (`prisma/ops/payment-account-readiness-check.ts`, a plain
 * `PrismaClient`, same convention `prisma/backfill/*.ts` already
 * establishes) and this module's own unit tests (a hand-built mock) can
 * use it without pulling in Nest's DI container.
 */

export type PaymentAccountReadinessStatus =
  'ACTIVE' | 'PENDING' | 'DISABLED' | 'MISSING';

export interface StorePaymentReadiness {
  tenantId: string;
  tenantSlug: string;
  storeId: string;
  storeName: string;
  storeStatus: string;
  paymentAccountStatus: PaymentAccountReadinessStatus;
  paymentAccountId: string | null;
  /** Total `Order` rows ever placed against this store — context for how
   * urgent the gap is, never used to decide anything automatically. */
  existingOrderCount: number;
}

export interface PaymentAccountReadinessReport {
  checkedAt: Date;
  stores: StorePaymentReadiness[];
  /** Stores with no `ACTIVE` `PaymentAccount` — the set that would see
   * `initiatePayment` fail for every checkout today. */
  atRisk: StorePaymentReadiness[];
  /** Of `atRisk`, the ones that have ALREADY taken at least one order —
   * i.e. real merchants with real (at minimum historical) commerce
   * traffic, not brand-new/never-launched stores. The most urgent subset. */
  atRiskWithExistingOrders: StorePaymentReadiness[];
}

/** Minimal shape of the Prisma client surface this check needs — never
 * `PrismaService` directly, so a plain `new PrismaClient()` (the ops
 * script) and a hand-built test double both satisfy it without a Nest
 * testing module. */
export interface ReadinessCheckPrismaClient {
  store: {
    findMany(args: {
      include: {
        tenant: { select: { id: true; slug: true } };
        paymentAccounts: { where: { provider: PaymentProviderType } };
      };
    }): Promise<
      Array<{
        id: string;
        tenantId: string;
        name: string;
        status: string;
        tenant: { id: string; slug: string };
        paymentAccounts: Array<{ id: string; status: string }>;
      }>
    >;
  };
  order: {
    count(args: { where: { storeId: string } }): Promise<number>;
  };
}

/**
 * Runs the read-only readiness check. Never writes anything. Never reads
 * or decrypts `credentialsEncrypted` — a `PaymentAccount`'s mere
 * existence/status is a public-shaped fact (same information
 * `GET /admin/payment-accounts` already exposes to that tenant's own
 * admins); this function never touches credential material at all.
 */
export async function checkPaymentAccountReadiness(
  prisma: ReadinessCheckPrismaClient,
): Promise<PaymentAccountReadinessReport> {
  const storeRows = await prisma.store.findMany({
    include: {
      tenant: { select: { id: true, slug: true } },
      paymentAccounts: { where: { provider: PaymentProviderType.RAZORPAY } },
    },
  });

  const stores: StorePaymentReadiness[] = [];
  for (const store of storeRows) {
    // `@@unique([storeId, provider])` guarantees at most one row here —
    // never a "pick one of several" ambiguity.
    const account = store.paymentAccounts[0];
    const existingOrderCount = await prisma.order.count({
      where: { storeId: store.id },
    });
    stores.push({
      tenantId: store.tenantId,
      tenantSlug: store.tenant.slug,
      storeId: store.id,
      storeName: store.name,
      storeStatus: store.status,
      paymentAccountStatus:
        (account?.status as PaymentAccountReadinessStatus | undefined) ??
        'MISSING',
      paymentAccountId: account?.id ?? null,
      existingOrderCount,
    });
  }

  const atRisk = stores.filter((s) => s.paymentAccountStatus !== 'ACTIVE');
  const atRiskWithExistingOrders = atRisk.filter(
    (s) => s.existingOrderCount > 0,
  );

  return {
    checkedAt: new Date(),
    stores,
    atRisk,
    atRiskWithExistingOrders,
  };
}

/** Human-readable summary lines — shared by the ops script's console
 * output and (optionally) any future admin/platform surface, so the two
 * never drift in what they consider "at risk". */
export function formatReadinessReport(
  report: PaymentAccountReadinessReport,
): string[] {
  const lines: string[] = [];
  lines.push(
    `Phase 8 PaymentAccount readiness — checked ${report.checkedAt.toISOString()}`,
  );
  lines.push(
    `${report.stores.length} store(s) total; ${report.atRisk.length} without an ACTIVE PaymentAccount; ${report.atRiskWithExistingOrders.length} of those already have real order history.`,
  );
  for (const s of report.atRiskWithExistingOrders) {
    lines.push(
      `  URGENT: tenant=${s.tenantSlug} store="${s.storeName}" (${s.storeId}) — ` +
        `PaymentAccount ${s.paymentAccountStatus} (${s.paymentAccountId ?? 'none'}), ` +
        `${s.existingOrderCount} existing order(s). initiatePayment will fail for this store's ` +
        `checkouts under Phase 8 payment code.`,
    );
  }
  for (const s of report.atRisk.filter((s) => s.existingOrderCount === 0)) {
    lines.push(
      `  store=${s.storeId} (tenant=${s.tenantSlug}) — PaymentAccount ${s.paymentAccountStatus}, no orders yet (lower urgency).`,
    );
  }
  return lines;
}
