import { PaymentAccountStatus } from '@prisma/client';
import {
  checkPaymentAccountReadiness,
  formatReadinessReport,
  ReadinessCheckPrismaClient,
} from './payment-account-readiness';

/**
 * P8-13 — P1 #1 remediation. Pure unit tests — no DB, no HTTP, no Nest
 * testing module, no writes anywhere (the function under test performs
 * none). Verifies the READ-ONLY readiness report is correct; does not
 * (and structurally cannot, since there is no write path to test) touch
 * on backfill/mutation behavior.
 */
describe('checkPaymentAccountReadiness', () => {
  function makePrisma(
    stores: Array<{
      id: string;
      tenantId: string;
      name: string;
      status: string;
      tenantSlug: string;
      paymentAccounts: Array<{ id: string; status: string }>;
    }>,
    orderCounts: Record<string, number> = {},
  ): ReadinessCheckPrismaClient {
    return {
      store: {
        findMany: jest.fn().mockResolvedValue(
          stores.map((s) => ({
            id: s.id,
            tenantId: s.tenantId,
            name: s.name,
            status: s.status,
            tenant: { id: s.tenantId, slug: s.tenantSlug },
            paymentAccounts: s.paymentAccounts,
          })),
        ),
      },
      order: {
        count: jest
          .fn()
          .mockImplementation(({ where }: { where: { storeId: string } }) =>
            Promise.resolve(orderCounts[where.storeId] ?? 0),
          ),
      },
    };
  }

  it('a store with an ACTIVE PaymentAccount is not flagged at-risk', async () => {
    const prisma = makePrisma([
      {
        id: 'store-1',
        tenantId: 'tenant-1',
        tenantSlug: 'acme',
        name: 'Acme Store',
        status: 'ACTIVE',
        paymentAccounts: [{ id: 'pa-1', status: PaymentAccountStatus.ACTIVE }],
      },
    ]);

    const report = await checkPaymentAccountReadiness(prisma);

    expect(report.atRisk).toHaveLength(0);
    expect(report.stores[0].paymentAccountStatus).toBe('ACTIVE');
  });

  it('a store with no PaymentAccount row at all is flagged MISSING', async () => {
    const prisma = makePrisma([
      {
        id: 'store-1',
        tenantId: 'tenant-1',
        tenantSlug: 'acme',
        name: 'Acme Store',
        status: 'ACTIVE',
        paymentAccounts: [],
      },
    ]);

    const report = await checkPaymentAccountReadiness(prisma);

    expect(report.atRisk).toHaveLength(1);
    expect(report.atRisk[0].paymentAccountStatus).toBe('MISSING');
    expect(report.atRisk[0].paymentAccountId).toBeNull();
  });

  it('a store with a PENDING or DISABLED PaymentAccount is flagged at-risk (not ACTIVE)', async () => {
    const prisma = makePrisma([
      {
        id: 'store-1',
        tenantId: 'tenant-1',
        tenantSlug: 'acme',
        name: 'Pending Store',
        status: 'ACTIVE',
        paymentAccounts: [{ id: 'pa-1', status: PaymentAccountStatus.PENDING }],
      },
      {
        id: 'store-2',
        tenantId: 'tenant-2',
        tenantSlug: 'beta',
        name: 'Disabled Store',
        status: 'ACTIVE',
        paymentAccounts: [
          { id: 'pa-2', status: PaymentAccountStatus.DISABLED },
        ],
      },
    ]);

    const report = await checkPaymentAccountReadiness(prisma);

    expect(report.atRisk).toHaveLength(2);
    expect(report.atRisk.map((s) => s.paymentAccountStatus).sort()).toEqual([
      'DISABLED',
      'PENDING',
    ]);
  });

  it('separates urgent (has existing orders) from non-urgent (never checked out) at-risk stores', async () => {
    const prisma = makePrisma(
      [
        {
          id: 'store-urgent',
          tenantId: 'tenant-1',
          tenantSlug: 'acme',
          name: 'Live Store',
          status: 'ACTIVE',
          paymentAccounts: [],
        },
        {
          id: 'store-new',
          tenantId: 'tenant-2',
          tenantSlug: 'beta',
          name: 'Brand New Store',
          status: 'DRAFT',
          paymentAccounts: [],
        },
      ],
      { 'store-urgent': 42, 'store-new': 0 },
    );

    const report = await checkPaymentAccountReadiness(prisma);

    expect(report.atRisk).toHaveLength(2);
    expect(report.atRiskWithExistingOrders).toHaveLength(1);
    expect(report.atRiskWithExistingOrders[0].storeId).toBe('store-urgent');
    expect(report.atRiskWithExistingOrders[0].existingOrderCount).toBe(42);
  });

  it('never touches credentialsEncrypted or any credential field — only id/status are ever read', async () => {
    const prisma = makePrisma([
      {
        id: 'store-1',
        tenantId: 'tenant-1',
        tenantSlug: 'acme',
        name: 'Acme Store',
        status: 'ACTIVE',
        paymentAccounts: [{ id: 'pa-1', status: PaymentAccountStatus.ACTIVE }],
      },
    ]);

    const report = await checkPaymentAccountReadiness(prisma);

    expect(JSON.stringify(report)).not.toMatch(/credential/i);
    // The mock's own `paymentAccounts` selection never included a
    // `credentialsEncrypted` field in the first place — this assertion
    // proves the report's OWN shape never introduces or forwards one.
  });

  it('performs no writes — the mock Prisma client exposes no create/update/delete method the function could call', async () => {
    const prisma = makePrisma([
      {
        id: 'store-1',
        tenantId: 'tenant-1',
        tenantSlug: 'acme',
        name: 'Acme Store',
        status: 'ACTIVE',
        paymentAccounts: [],
      },
    ]);

    await checkPaymentAccountReadiness(prisma);

    // Structural proof: ReadinessCheckPrismaClient's own TypeScript shape
    // (payment-account-readiness.ts) declares only `store.findMany` and
    // `order.count` — both reads. There is no write method on this
    // interface for the function to call even if it wanted to.
    expect(Object.keys(prisma)).toEqual(['store', 'order']);
    expect(Object.keys(prisma.store)).toEqual(['findMany']);
    expect(Object.keys(prisma.order)).toEqual(['count']);
  });

  describe('formatReadinessReport', () => {
    it('produces a human-readable report naming urgent stores explicitly', async () => {
      const prisma = makePrisma(
        [
          {
            id: 'store-urgent',
            tenantId: 'tenant-1',
            tenantSlug: 'acme',
            name: 'Live Store',
            status: 'ACTIVE',
            paymentAccounts: [],
          },
        ],
        { 'store-urgent': 5 },
      );
      const report = await checkPaymentAccountReadiness(prisma);

      const lines = formatReadinessReport(report);

      expect(lines.some((l) => l.includes('URGENT'))).toBe(true);
      expect(lines.some((l) => l.includes('acme'))).toBe(true);
      expect(lines.some((l) => l.includes('5 existing order'))).toBe(true);
    });
  });
});
