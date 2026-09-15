import { PaymentAccountMode, PaymentAccountStatus, PaymentProviderType } from '@prisma/client';
import { PaymentProviderAdapter } from '../providers/payment-provider-adapter.interface';
import {
  InactivePaymentAccountError,
  NoActivePaymentAccountError,
  PaymentAccountTenantMismatchError,
  StoreNotFoundError,
  UnknownPaymentAccountError,
  UnsupportedPaymentProviderError,
} from './payment-account-resolution.errors';
import { PaymentAccountResolutionService } from './payment-account-resolution.service';

/**
 * P8-6. Same mocking convention `payment-accounts.service.spec.ts`
 * already established: `getTenantScopedClient` is mocked directly (a fake
 * `{ store: {...} }` client), the plain `PrismaService` is a hand-built
 * jest-fn object — no DB, no HTTP, no Nest testing module.
 */
const mockStoreClient = {
  findUnique: jest.fn(),
};

jest.mock('../../common/tenant/tenant-prisma', () => ({
  getTenantScopedClient: jest.fn(() => ({ store: mockStoreClient })),
}));

describe('PaymentAccountResolutionService', () => {
  // P8-8 extended `PaymentProviderAdapter` with real capability methods
  // (createOrder/verifyPaymentSignature/fetchOrderPayments/createRefund) —
  // this resolution service never calls any of them (it only resolves
  // WHICH adapter, never invokes a provider operation), so the fake below
  // wires each to a failing stub purely to satisfy the type. A test below
  // (§ "never calls any provider adapter method") asserts they are indeed
  // never invoked.
  function unexpectedCall(name: string) {
    return () => {
      throw new Error(`unexpected call: ${name} — resolution service must never invoke provider adapter methods`);
    };
  }

  const razorpayAdapter: PaymentProviderAdapter = {
    provider: PaymentProviderType.RAZORPAY,
    getPublicKeyId: jest.fn(unexpectedCall('getPublicKeyId')),
    createOrder: jest.fn(unexpectedCall('createOrder')),
    verifyPaymentSignature: jest.fn(unexpectedCall('verifyPaymentSignature')),
    verifyWebhookSignature: jest.fn(unexpectedCall('verifyWebhookSignature')),
    fetchOrderPayments: jest.fn(unexpectedCall('fetchOrderPayments')),
    createRefund: jest.fn(unexpectedCall('createRefund')),
  };

  const activeAccount = {
    id: 'pa-1',
    tenantId: 'tenant-a',
    storeId: 'store-a',
    provider: PaymentProviderType.RAZORPAY,
    status: PaymentAccountStatus.ACTIVE,
    mode: PaymentAccountMode.LIVE,
    displayName: null,
    credentialsEncrypted: Buffer.from('opaque-ciphertext-should-never-appear'),
    credentialsUpdatedAt: new Date(),
    connectedAt: new Date(),
    disabledAt: null,
    disabledReason: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  function makePrisma(findUniqueResult: Record<string, unknown> | null) {
    return {
      paymentAccount: {
        findUnique: jest.fn().mockResolvedValue(findUniqueResult),
      },
    };
  }

  function makeRegistry(adapter: PaymentProviderAdapter | Error = razorpayAdapter) {
    return {
      get: jest.fn((_provider: PaymentProviderType) => {
        if (adapter instanceof Error) {
          throw adapter;
        }
        return adapter;
      }),
    };
  }

  beforeEach(() => {
    mockStoreClient.findUnique.mockReset();
  });

  // ─── resolveForStore: happy path ────────────────────────────────────

  describe('resolveForStore', () => {
    it('resolves an ACTIVE account to its provider adapter', async () => {
      mockStoreClient.findUnique.mockResolvedValue({ id: 'store-a' });
      const prisma = makePrisma(activeAccount);
      const registry = makeRegistry();
      const service = new PaymentAccountResolutionService(
        prisma as never,
        registry as never,
      );

      const result = await service.resolveForStore(
        'tenant-a',
        'store-a',
        PaymentProviderType.RAZORPAY,
      );

      expect(result).toEqual({
        paymentAccountId: 'pa-1',
        provider: PaymentProviderType.RAZORPAY,
        adapter: razorpayAdapter,
      });
    });

    it('resolves the correct provider adapter via the registry, keyed by the account\'s own provider', async () => {
      mockStoreClient.findUnique.mockResolvedValue({ id: 'store-a' });
      const prisma = makePrisma(activeAccount);
      const registry = makeRegistry();
      const service = new PaymentAccountResolutionService(
        prisma as never,
        registry as never,
      );

      await service.resolveForStore('tenant-a', 'store-a', PaymentProviderType.RAZORPAY);

      expect(registry.get).toHaveBeenCalledWith(PaymentProviderType.RAZORPAY);
    });

    it('looks up the account via the (storeId, provider) unique key — deterministic, never a findMany/pick-one', async () => {
      mockStoreClient.findUnique.mockResolvedValue({ id: 'store-a' });
      const prisma = makePrisma(activeAccount);
      const service = new PaymentAccountResolutionService(
        prisma as never,
        makeRegistry() as never,
      );

      await service.resolveForStore('tenant-a', 'store-a', PaymentProviderType.RAZORPAY);

      expect(prisma.paymentAccount.findUnique).toHaveBeenCalledTimes(1);
      expect(prisma.paymentAccount.findUnique).toHaveBeenCalledWith({
        where: {
          storeId_provider: {
            storeId: 'store-a',
            provider: PaymentProviderType.RAZORPAY,
          },
        },
      });
    });

    it('never leaks credential material — the resolved object carries no ciphertext', async () => {
      mockStoreClient.findUnique.mockResolvedValue({ id: 'store-a' });
      const prisma = makePrisma(activeAccount);
      const service = new PaymentAccountResolutionService(
        prisma as never,
        makeRegistry() as never,
      );

      const result = await service.resolveForStore(
        'tenant-a',
        'store-a',
        PaymentProviderType.RAZORPAY,
      );

      expect(Object.keys(result).sort()).toEqual([
        'adapter',
        'paymentAccountId',
        'provider',
      ]);
      expect(JSON.stringify(result)).not.toContain('opaque-ciphertext');
    });

    // ─── failure modes ─────────────────────────────────────────────────

    it('throws StoreNotFoundError when the store does not belong to the tenant', async () => {
      mockStoreClient.findUnique.mockResolvedValue(null); // cross-tenant / nonexistent
      const prisma = makePrisma(activeAccount);
      const service = new PaymentAccountResolutionService(
        prisma as never,
        makeRegistry() as never,
      );

      await expect(
        service.resolveForStore('tenant-a', 'store-of-tenant-b', PaymentProviderType.RAZORPAY),
      ).rejects.toBeInstanceOf(StoreNotFoundError);
      // Never even looks up a PaymentAccount for a store it can't confirm.
      expect(prisma.paymentAccount.findUnique).not.toHaveBeenCalled();
    });

    it('throws NoActivePaymentAccountError when no account exists for (storeId, provider)', async () => {
      mockStoreClient.findUnique.mockResolvedValue({ id: 'store-a' });
      const prisma = makePrisma(null);
      const service = new PaymentAccountResolutionService(
        prisma as never,
        makeRegistry() as never,
      );

      await expect(
        service.resolveForStore('tenant-a', 'store-a', PaymentProviderType.RAZORPAY),
      ).rejects.toBeInstanceOf(NoActivePaymentAccountError);
    });

    it('throws InactivePaymentAccountError for a PENDING account', async () => {
      mockStoreClient.findUnique.mockResolvedValue({ id: 'store-a' });
      const prisma = makePrisma({
        ...activeAccount,
        status: PaymentAccountStatus.PENDING,
      });
      const service = new PaymentAccountResolutionService(
        prisma as never,
        makeRegistry() as never,
      );

      const err = await service
        .resolveForStore('tenant-a', 'store-a', PaymentProviderType.RAZORPAY)
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(InactivePaymentAccountError);
      expect((err as InactivePaymentAccountError).status).toBe(
        PaymentAccountStatus.PENDING,
      );
    });

    it('throws InactivePaymentAccountError for a DISABLED account', async () => {
      mockStoreClient.findUnique.mockResolvedValue({ id: 'store-a' });
      const prisma = makePrisma({
        ...activeAccount,
        status: PaymentAccountStatus.DISABLED,
      });
      const service = new PaymentAccountResolutionService(
        prisma as never,
        makeRegistry() as never,
      );

      const err = await service
        .resolveForStore('tenant-a', 'store-a', PaymentProviderType.RAZORPAY)
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(InactivePaymentAccountError);
      expect((err as InactivePaymentAccountError).status).toBe(
        PaymentAccountStatus.DISABLED,
      );
    });

    it('throws PaymentAccountTenantMismatchError (defense in depth) when the found row disagrees on tenantId', async () => {
      mockStoreClient.findUnique.mockResolvedValue({ id: 'store-a' });
      const prisma = makePrisma({ ...activeAccount, tenantId: 'tenant-b' });
      const service = new PaymentAccountResolutionService(
        prisma as never,
        makeRegistry() as never,
      );

      await expect(
        service.resolveForStore('tenant-a', 'store-a', PaymentProviderType.RAZORPAY),
      ).rejects.toBeInstanceOf(PaymentAccountTenantMismatchError);
    });

    it('throws UnsupportedPaymentProviderError when the registry has no adapter for the account\'s provider', async () => {
      mockStoreClient.findUnique.mockResolvedValue({ id: 'store-a' });
      const prisma = makePrisma(activeAccount);
      const registry = makeRegistry(
        new UnsupportedPaymentProviderError(PaymentProviderType.RAZORPAY),
      );
      const service = new PaymentAccountResolutionService(
        prisma as never,
        registry as never,
      );

      await expect(
        service.resolveForStore('tenant-a', 'store-a', PaymentProviderType.RAZORPAY),
      ).rejects.toBeInstanceOf(UnsupportedPaymentProviderError);
    });
  });

  // ─── resolveForBoundAccount: re-hydration, no re-derivation ─────────

  describe('resolveForBoundAccount', () => {
    it('resolves directly by id — never touches the Store/tenant-scoped client', async () => {
      const prisma = makePrisma(activeAccount);
      const service = new PaymentAccountResolutionService(
        prisma as never,
        makeRegistry() as never,
      );

      const result = await service.resolveForBoundAccount('tenant-a', 'pa-1');

      expect(result.paymentAccountId).toBe('pa-1');
      expect(result.adapter.provider).toBe(PaymentProviderType.RAZORPAY);
      expect(mockStoreClient.findUnique).not.toHaveBeenCalled();
      expect(prisma.paymentAccount.findUnique).toHaveBeenCalledWith({
        where: { id: 'pa-1' },
      });
    });

    it('returns the exact bound account even when it is DISABLED — a historical record stays resolvable, not an error', async () => {
      const prisma = makePrisma({
        ...activeAccount,
        status: PaymentAccountStatus.DISABLED,
      });
      const service = new PaymentAccountResolutionService(
        prisma as never,
        makeRegistry() as never,
      );

      await expect(
        service.resolveForBoundAccount('tenant-a', 'pa-1'),
      ).resolves.toMatchObject({ paymentAccountId: 'pa-1' });
    });

    it('is not silently re-resolved to whatever the store currently considers active — it returns THIS id even if a different account exists for the same store/provider', async () => {
      // A second, newer, currently-ACTIVE account for the same store now
      // exists — but this order/record is bound to the OLD one (`pa-1`,
      // now DISABLED). resolveForBoundAccount must still return pa-1, not
      // silently swap to whatever findActiveAccountForStore-style lookup
      // would currently pick.
      const oldBoundAccount = {
        ...activeAccount,
        id: 'pa-1',
        status: PaymentAccountStatus.DISABLED,
      };
      const prisma = {
        paymentAccount: {
          findUnique: jest.fn((args: { where: { id?: string } }) => {
            // Only ever queried by id in this method — proves no
            // storeId/provider re-derivation path exists.
            expect(args.where.id).toBe('pa-1');
            return Promise.resolve(oldBoundAccount);
          }),
        },
      };
      const service = new PaymentAccountResolutionService(
        prisma as never,
        makeRegistry() as never,
      );

      const result = await service.resolveForBoundAccount('tenant-a', 'pa-1');
      expect(result.paymentAccountId).toBe('pa-1');
    });

    it('throws PaymentAccountTenantMismatchError for a nonexistent id', async () => {
      const prisma = makePrisma(null);
      const service = new PaymentAccountResolutionService(
        prisma as never,
        makeRegistry() as never,
      );

      await expect(
        service.resolveForBoundAccount('tenant-a', 'nope'),
      ).rejects.toBeInstanceOf(PaymentAccountTenantMismatchError);
    });

    it('throws PaymentAccountTenantMismatchError (never 403-shaped) for a cross-tenant id — tenant isolation', async () => {
      const prisma = makePrisma({ ...activeAccount, tenantId: 'tenant-b' });
      const service = new PaymentAccountResolutionService(
        prisma as never,
        makeRegistry() as never,
      );

      await expect(
        service.resolveForBoundAccount('tenant-a', 'pa-1'),
      ).rejects.toBeInstanceOf(PaymentAccountTenantMismatchError);
    });

    it('never leaks credential material', async () => {
      const prisma = makePrisma(activeAccount);
      const service = new PaymentAccountResolutionService(
        prisma as never,
        makeRegistry() as never,
      );

      const result = await service.resolveForBoundAccount('tenant-a', 'pa-1');
      expect(JSON.stringify(result)).not.toContain('opaque-ciphertext');
    });

    it('never calls any provider adapter capability method — this service only resolves WHICH adapter, never invokes a provider operation', async () => {
      const prisma = makePrisma(activeAccount);
      const service = new PaymentAccountResolutionService(
        prisma as never,
        makeRegistry() as never,
      );

      await service.resolveForBoundAccount('tenant-a', 'pa-1');

      expect(razorpayAdapter.getPublicKeyId).not.toHaveBeenCalled();
      expect(razorpayAdapter.createOrder).not.toHaveBeenCalled();
      expect(razorpayAdapter.verifyPaymentSignature).not.toHaveBeenCalled();
      expect(razorpayAdapter.verifyWebhookSignature).not.toHaveBeenCalled();
      expect(razorpayAdapter.fetchOrderPayments).not.toHaveBeenCalled();
      expect(razorpayAdapter.createRefund).not.toHaveBeenCalled();
    });
  });

  // ─── resolveForWebhook (P8-10) ──────────────────────────────────────

  describe('resolveForWebhook', () => {
    it('resolves an id to its provider adapter AND its own tenantId — the one path where tenantId is not already known to the caller', async () => {
      const prisma = makePrisma(activeAccount);
      const service = new PaymentAccountResolutionService(
        prisma as never,
        makeRegistry() as never,
      );

      const result = await service.resolveForWebhook('pa-1');

      expect(result).toEqual({
        paymentAccountId: 'pa-1',
        tenantId: 'tenant-a',
        provider: PaymentProviderType.RAZORPAY,
        adapter: razorpayAdapter,
      });
    });

    it('throws UnknownPaymentAccountError for an id with no matching row — never a distinguishable existence signal', async () => {
      const prisma = makePrisma(null);
      const service = new PaymentAccountResolutionService(
        prisma as never,
        makeRegistry() as never,
      );

      await expect(service.resolveForWebhook('nope')).rejects.toBeInstanceOf(
        UnknownPaymentAccountError,
      );
    });

    it('does NOT require ACTIVE status — a DISABLED account still resolves (historical/in-flight webhooks remain valid)', async () => {
      const prisma = makePrisma({
        ...activeAccount,
        status: PaymentAccountStatus.DISABLED,
      });
      const service = new PaymentAccountResolutionService(
        prisma as never,
        makeRegistry() as never,
      );

      await expect(service.resolveForWebhook('pa-1')).resolves.toMatchObject({
        paymentAccountId: 'pa-1',
      });
    });

    it('does NOT require ACTIVE status — a PENDING account also resolves', async () => {
      const prisma = makePrisma({
        ...activeAccount,
        status: PaymentAccountStatus.PENDING,
      });
      const service = new PaymentAccountResolutionService(
        prisma as never,
        makeRegistry() as never,
      );

      await expect(service.resolveForWebhook('pa-1')).resolves.toMatchObject({
        paymentAccountId: 'pa-1',
      });
    });

    it('never leaks credential material', async () => {
      const prisma = makePrisma(activeAccount);
      const service = new PaymentAccountResolutionService(
        prisma as never,
        makeRegistry() as never,
      );

      const result = await service.resolveForWebhook('pa-1');

      expect(JSON.stringify(result)).not.toContain('opaque-ciphertext');
    });

    it('never calls any provider adapter capability method — only resolves WHICH adapter', async () => {
      const prisma = makePrisma(activeAccount);
      const service = new PaymentAccountResolutionService(
        prisma as never,
        makeRegistry() as never,
      );

      await service.resolveForWebhook('pa-1');

      expect(razorpayAdapter.verifyWebhookSignature).not.toHaveBeenCalled();
    });
  });
});
