import { PrismaClient } from '@prisma/client';
import {
  checkPaymentAccountReadiness,
  formatReadinessReport,
} from '../../src/payments/payment-accounts/payment-account-readiness';

/**
 * P8-13 — P1 #1 remediation (docs/saas/PHASE-8-SECURITY-AUDIT.md §17/§18/
 * §19). READ-ONLY. Not a backfill, not a migration, not `prisma db seed` —
 * same category distinction `prisma/backfill/coupon-storeid-backfill.ts`'s
 * own doc comment draws for ITS category, except this script performs NO
 * writes at all, ever: it never creates, activates, or modifies a
 * `PaymentAccount` row, and never touches `credentialsEncrypted`.
 *
 * Purpose: report exactly which `(Tenant, Store)` pairs have no `ACTIVE`
 * `PaymentAccount` for Razorpay — the set that would see
 * `PaymentsService.initiatePayment` fail closed
 * (`MerchantPaymentUnavailableError`) for every checkout once Phase 8
 * payment code (P8-9 onward) is live for them, since that code has NO
 * fallback to the legacy global-credential path. A true automatic
 * backfill is impossible by design: per the ratified Direct Merchant-
 * Owned Razorpay Account model (P8-D3), a `PaymentAccount`'s credentials
 * are the MERCHANT'S OWN Razorpay key id/secret, which only the merchant
 * (via `POST /admin/payment-accounts/:id/connect`, P8-5) can legitimately
 * supply — see `payment-account-readiness.ts`'s own doc comment for the
 * full reasoning, and docs/ops/PHASE-8-PAYMENT-ACCOUNT-READINESS.md for
 * the operational runbook this script exists to support.
 *
 * Exit code: 0 if every store either has an ACTIVE PaymentAccount or has
 * never taken a real order yet; 1 if any store WITH existing order
 * history lacks one — suitable as a pre-deploy gate in CI/ops tooling
 * without needing to parse output.
 *
 * Usage:
 *   npx ts-node prisma/ops/payment-account-readiness-check.ts
 *
 * Never run by this session against production — see the completion
 * report for the exact (not-yet-executed) production verification step.
 */

const prisma = new PrismaClient();

async function main(): Promise<number> {
  const report = await checkPaymentAccountReadiness(prisma);
  for (const line of formatReadinessReport(report)) {
    console.log(line);
  }
  return report.atRiskWithExistingOrders.length > 0 ? 1 : 0;
}

main()
  .then((exitCode) => {
    process.exitCode = exitCode;
  })
  .catch((err: unknown) => {
    console.error('payment-account-readiness-check failed:', err);
    process.exitCode = 2;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
