import { ConflictException, NotFoundException } from '@nestjs/common';
import {
  PaymentAccountMode,
  PaymentAccountStatus,
  PaymentProviderType,
  Prisma,
} from '@prisma/client';
import type { TenantAuditLogInput } from '../../common/audit/audit.service';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { TenantContext } from '../../common/tenant/tenant-context';
import { PaymentAccountsService } from './payment-accounts.service';

/**
 * P8-4. Unit tests against a mocked `PrismaService` whose `$transaction`
 * invokes the callback with a fake `tx` — the same mocking-shape
 * convention `team.service.spec.ts` already established. `tenant-prisma`'s
 * `getTenantScopedClient` is mocked directly (a fake `{ store: {...} }`
 * client) rather than faked at the Prisma `$extends` level — the same
 * "mock the one dependency this service actually calls" discipline, and
 * it transparently covers `resolvePrimaryStoreId` too (real, unmocked
 * function; it calls the mocked `getTenantScopedClient` itself).
 * `tenant-actor-attribution`'s `resolveTenantAuditActor` is mocked
 * directly — its own correctness is proven in that module's own tests,
 * not this service's concern.
 */
const mockStoreClient = {
  findUnique: jest.fn(),
  findFirst: jest.fn(),
};

jest.mock('../../common/tenant/tenant-prisma', () => ({
  getTenantScopedClient: jest.fn(() => ({ store: mockStoreClient })),
}));

jest.mock('../../common/audit/tenant-actor-attribution', () => ({
  resolveTenantAuditActor: jest
    .fn()
    .mockResolvedValue({ actorMembershipId: 'membership-owner-1' }),
}));

describe('PaymentAccountsService', () => {
  const actor: AuthenticatedUser = {
    id: 'owner-user-1',
    email: 'owner@example.test',
    role: 'ADMIN',
    platformRole: null,
    memberships: [{ tenantId: 'tenant-a', role: 'OWNER' }],
  };

  const tenantContextA: TenantContext = {
    tenantId: 'tenant-a',
    source: 'membership-default',
    membership: { role: 'OWNER' },
  };

  const primaryStoreA = { id: 'store-a-primary', isPrimary: true };

  function makeAudit() {
    return {
      logTenantAction: jest
        .fn<Promise<void>, [unknown, TenantAuditLogInput]>()
        .mockResolvedValue(undefined),
    };
  }

  function makePrisma(options: {
    existingByStoreProvider?: Record<string, unknown> | null;
    createResult?: Record<string, unknown>;
    findUniqueResult?: Record<string, unknown> | null;
    findManyResult?: Record<string, unknown>[];
    countResult?: number;
    transitionTarget?: Record<string, unknown> | null;
    casCount?: number;
    updatedAfterTransition?: Record<string, unknown>;
    createThrows?: unknown;
    configureCredentialsTarget?: Record<string, unknown> | null;
  }) {
    const tx = {
      paymentAccount: {
        create: options.createThrows
          ? jest.fn().mockRejectedValue(options.createThrows)
          : jest.fn().mockResolvedValue(
              options.createResult ?? {
                id: 'pa-new-1',
                tenantId: 'tenant-a',
                storeId: primaryStoreA.id,
                provider: PaymentProviderType.RAZORPAY,
                status: PaymentAccountStatus.PENDING,
                mode: PaymentAccountMode.TEST,
                displayName: null,
                connectedAt: null,
                disabledAt: null,
                disabledReason: null,
                createdAt: new Date(),
                updatedAt: new Date(),
              },
            ),
        findUnique: jest
          .fn()
          .mockResolvedValue(
            options.configureCredentialsTarget !== undefined
              ? options.configureCredentialsTarget
              : (options.transitionTarget ?? null),
          ),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest
          .fn()
          .mockResolvedValue({ count: options.casCount ?? 1 }),
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValue(options.updatedAfterTransition ?? {}),
      },
    };

    return {
      paymentAccount: {
        findUnique: jest
          .fn()
          .mockResolvedValue(
            options.existingByStoreProvider !== undefined
              ? options.existingByStoreProvider
              : (options.findUniqueResult ?? null),
          ),
        findMany: jest.fn().mockResolvedValue(options.findManyResult ?? []),
        count: jest.fn().mockResolvedValue(options.countResult ?? 0),
      },
      $transaction: jest.fn(
        // Parameter deliberately NOT named `tx` — `(tx: typeof tx) => ...`
        // would make the annotation self-referential (TS2502): the
        // parameter's own name shadows the outer `const tx` inside its
        // own type position.
        async (cb: (t: typeof tx) => Promise<unknown>) => cb(tx),
      ),
      _tx: tx,
    };
  }

  beforeEach(() => {
    mockStoreClient.findUnique.mockReset();
    mockStoreClient.findFirst.mockReset();
  });

  // ─── create ─────────────────────────────────────────────────────────

  describe('create', () => {
    it('resolves the primary store and creates a PENDING account when storeId is omitted', async () => {
      mockStoreClient.findFirst.mockResolvedValue(primaryStoreA);
      const prisma = makePrisma({ existingByStoreProvider: null });
      const service = new PaymentAccountsService(
        prisma as never,
        makeAudit() as never,
      );

      const result = await service.create(tenantContextA, actor, {
        provider: PaymentProviderType.RAZORPAY,
        mode: PaymentAccountMode.TEST,
      });

      expect(result.status).toBe(PaymentAccountStatus.PENDING);
      expect(result.storeId).toBe(primaryStoreA.id);
      expect(prisma._tx.paymentAccount.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: 'tenant-a',
            storeId: primaryStoreA.id,
            provider: PaymentProviderType.RAZORPAY,
          }),
        }),
      );
    });

    it('never includes credentialsEncrypted in the returned view', async () => {
      mockStoreClient.findFirst.mockResolvedValue(primaryStoreA);
      const prisma = makePrisma({ existingByStoreProvider: null });
      const service = new PaymentAccountsService(
        prisma as never,
        makeAudit() as never,
      );

      const result = await service.create(tenantContextA, actor, {
        provider: PaymentProviderType.RAZORPAY,
        mode: PaymentAccountMode.TEST,
      });

      expect(result).not.toHaveProperty('credentialsEncrypted');
      expect(result).not.toHaveProperty('credentialsUpdatedAt');
    });

    it('rejects an explicit storeId that does not belong to the caller tenant (store/tenant mismatch)', async () => {
      mockStoreClient.findUnique.mockResolvedValue(null); // tenant-scoped client found nothing
      const prisma = makePrisma({});
      const service = new PaymentAccountsService(
        prisma as never,
        makeAudit() as never,
      );

      await expect(
        service.create(tenantContextA, actor, {
          storeId: 'store-belongs-to-tenant-b',
          provider: PaymentProviderType.RAZORPAY,
          mode: PaymentAccountMode.TEST,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma._tx.paymentAccount.create).not.toHaveBeenCalled();
    });

    it('rejects a duplicate (storeId, provider) via the pre-check', async () => {
      mockStoreClient.findFirst.mockResolvedValue(primaryStoreA);
      const prisma = makePrisma({
        existingByStoreProvider: { id: 'pa-existing' },
      });
      const service = new PaymentAccountsService(
        prisma as never,
        makeAudit() as never,
      );

      await expect(
        service.create(tenantContextA, actor, {
          provider: PaymentProviderType.RAZORPAY,
          mode: PaymentAccountMode.TEST,
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma._tx.paymentAccount.create).not.toHaveBeenCalled();
    });

    it('rejects a duplicate (storeId, provider) via the P2002 backstop (race)', async () => {
      mockStoreClient.findFirst.mockResolvedValue(primaryStoreA);
      const p2002 = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed',
        { code: 'P2002', clientVersion: 'test' },
      );
      const prisma = makePrisma({
        existingByStoreProvider: null,
        createThrows: p2002,
      });
      const service = new PaymentAccountsService(
        prisma as never,
        makeAudit() as never,
      );

      await expect(
        service.create(tenantContextA, actor, {
          provider: PaymentProviderType.RAZORPAY,
          mode: PaymentAccountMode.TEST,
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('writes a TenantAuditLog row on successful create', async () => {
      mockStoreClient.findFirst.mockResolvedValue(primaryStoreA);
      const prisma = makePrisma({ existingByStoreProvider: null });
      const audit = makeAudit();
      const service = new PaymentAccountsService(prisma as never, audit as never);

      await service.create(tenantContextA, actor, {
        provider: PaymentProviderType.RAZORPAY,
        mode: PaymentAccountMode.TEST,
      });

      expect(audit.logTenantAction).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          tenantId: 'tenant-a',
          action: 'payment_account.create',
          targetType: 'PaymentAccount',
        }),
      );
    });
  });

  // ─── tenant isolation (getOne) ──────────────────────────────────────

  describe('getOne — tenant isolation', () => {
    it('returns the account when it belongs to the caller tenant', async () => {
      const row = {
        id: 'pa-1',
        tenantId: 'tenant-a',
        storeId: primaryStoreA.id,
        provider: PaymentProviderType.RAZORPAY,
        status: PaymentAccountStatus.PENDING,
        mode: PaymentAccountMode.TEST,
        displayName: null,
        connectedAt: null,
        disabledAt: null,
        disabledReason: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const prisma = makePrisma({ findUniqueResult: row });
      const service = new PaymentAccountsService(
        prisma as never,
        makeAudit() as never,
      );

      const result = await service.getOne('tenant-a', 'pa-1');
      expect(result.id).toBe('pa-1');
    });

    it('throws 404 (never 403) for a row belonging to a different tenant', async () => {
      const row = {
        id: 'pa-1',
        tenantId: 'tenant-b',
        storeId: 'store-b',
        provider: PaymentProviderType.RAZORPAY,
        status: PaymentAccountStatus.PENDING,
        mode: PaymentAccountMode.TEST,
      };
      const prisma = makePrisma({ findUniqueResult: row });
      const service = new PaymentAccountsService(
        prisma as never,
        makeAudit() as never,
      );

      await expect(service.getOne('tenant-a', 'pa-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws 404 for a nonexistent id', async () => {
      const prisma = makePrisma({ findUniqueResult: null });
      const service = new PaymentAccountsService(
        prisma as never,
        makeAudit() as never,
      );

      await expect(service.getOne('tenant-a', 'nope')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  // ─── lifecycle transitions ──────────────────────────────────────────

  describe('lifecycle transitions', () => {
    const baseAccount = {
      id: 'pa-1',
      tenantId: 'tenant-a',
      storeId: primaryStoreA.id,
      provider: PaymentProviderType.RAZORPAY,
      mode: PaymentAccountMode.TEST,
      displayName: null,
      disabledReason: null,
    };

    it('activates a PENDING account', async () => {
      const prisma = makePrisma({
        transitionTarget: { ...baseAccount, status: PaymentAccountStatus.PENDING },
        updatedAfterTransition: {
          ...baseAccount,
          status: PaymentAccountStatus.ACTIVE,
          connectedAt: new Date(),
          disabledAt: null,
        },
      });
      const service = new PaymentAccountsService(
        prisma as never,
        makeAudit() as never,
      );

      const result = await service.activate(tenantContextA, actor, 'pa-1');
      expect(result.status).toBe(PaymentAccountStatus.ACTIVE);
    });

    it('reactivates a DISABLED account (DISABLED -> ACTIVE)', async () => {
      const prisma = makePrisma({
        transitionTarget: { ...baseAccount, status: PaymentAccountStatus.DISABLED },
        updatedAfterTransition: {
          ...baseAccount,
          status: PaymentAccountStatus.ACTIVE,
        },
      });
      const service = new PaymentAccountsService(
        prisma as never,
        makeAudit() as never,
      );

      const result = await service.activate(tenantContextA, actor, 'pa-1');
      expect(result.status).toBe(PaymentAccountStatus.ACTIVE);
    });

    it('disables an ACTIVE account', async () => {
      const prisma = makePrisma({
        transitionTarget: { ...baseAccount, status: PaymentAccountStatus.ACTIVE },
        updatedAfterTransition: {
          ...baseAccount,
          status: PaymentAccountStatus.DISABLED,
        },
      });
      const service = new PaymentAccountsService(
        prisma as never,
        makeAudit() as never,
      );

      const result = await service.disable(tenantContextA, actor, 'pa-1');
      expect(result.status).toBe(PaymentAccountStatus.DISABLED);
    });

    it('rejects activating an already-ACTIVE account (no same-state no-op)', async () => {
      const prisma = makePrisma({
        transitionTarget: { ...baseAccount, status: PaymentAccountStatus.ACTIVE },
      });
      const service = new PaymentAccountsService(
        prisma as never,
        makeAudit() as never,
      );

      await expect(
        service.activate(tenantContextA, actor, 'pa-1'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects disabling an already-DISABLED account (no same-state no-op)', async () => {
      const prisma = makePrisma({
        transitionTarget: { ...baseAccount, status: PaymentAccountStatus.DISABLED },
      });
      const service = new PaymentAccountsService(
        prisma as never,
        makeAudit() as never,
      );

      await expect(
        service.disable(tenantContextA, actor, 'pa-1'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('throws 404 (never 403) when transitioning a row belonging to a different tenant', async () => {
      const prisma = makePrisma({
        transitionTarget: {
          ...baseAccount,
          tenantId: 'tenant-b',
          status: PaymentAccountStatus.PENDING,
        },
      });
      const service = new PaymentAccountsService(
        prisma as never,
        makeAudit() as never,
      );

      await expect(
        service.activate(tenantContextA, actor, 'pa-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects a concurrent status change (CAS loss)', async () => {
      const prisma = makePrisma({
        transitionTarget: { ...baseAccount, status: PaymentAccountStatus.PENDING },
        casCount: 0,
      });
      const service = new PaymentAccountsService(
        prisma as never,
        makeAudit() as never,
      );

      await expect(
        service.activate(tenantContextA, actor, 'pa-1'),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  // ─── P8-5: configureCredentials / getEncryptedCredentials ──────────
  //
  // These two methods only ever handle an opaque Buffer — the encrypt/
  // decrypt round trip itself is covered by
  // `crypto/credential-encryption.service.spec.ts`, and Razorpay
  // verification by `razorpay/razorpay-account-verifier.service.spec.ts`.
  // This block only proves persistence/tenant-isolation behavior.

  describe('configureCredentials', () => {
    const target = {
      id: 'pa-1',
      tenantId: 'tenant-a',
      storeId: primaryStoreA.id,
      status: PaymentAccountStatus.PENDING,
    };

    it('replaces the encrypted blob and stamps credentialsUpdatedAt atomically', async () => {
      const prisma = makePrisma({ configureCredentialsTarget: target });
      const service = new PaymentAccountsService(
        prisma as never,
        makeAudit() as never,
      );
      const blob = Buffer.from('opaque-ciphertext');

      await service.configureCredentials(tenantContextA, actor, 'pa-1', blob);

      expect(prisma._tx.paymentAccount.update).toHaveBeenCalledWith({
        where: { id: 'pa-1' },
        data: {
          credentialsEncrypted: blob,
          credentialsUpdatedAt: expect.any(Date),
        },
      });
    });

    it('writes a TenantAuditLog row with no credential material in metadata', async () => {
      const prisma = makePrisma({ configureCredentialsTarget: target });
      const audit = makeAudit();
      const service = new PaymentAccountsService(prisma as never, audit as never);

      await service.configureCredentials(
        tenantContextA,
        actor,
        'pa-1',
        Buffer.from('super-secret-plaintext-derived-ciphertext'),
      );

      expect(audit.logTenantAction).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          tenantId: 'tenant-a',
          action: 'payment_account.credentials_configured',
          targetType: 'PaymentAccount',
          metadata: {},
        }),
      );
    });

    it('throws 404 (never 403) for a row belonging to a different tenant', async () => {
      const prisma = makePrisma({
        configureCredentialsTarget: { ...target, tenantId: 'tenant-b' },
      });
      const service = new PaymentAccountsService(
        prisma as never,
        makeAudit() as never,
      );

      await expect(
        service.configureCredentials(
          tenantContextA,
          actor,
          'pa-1',
          Buffer.from('x'),
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma._tx.paymentAccount.update).not.toHaveBeenCalled();
    });

    it('throws 404 for a nonexistent id', async () => {
      const prisma = makePrisma({ configureCredentialsTarget: null });
      const service = new PaymentAccountsService(
        prisma as never,
        makeAudit() as never,
      );

      await expect(
        service.configureCredentials(
          tenantContextA,
          actor,
          'nope',
          Buffer.from('x'),
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('getEncryptedCredentials', () => {
    it('returns the raw Buffer for a row belonging to the caller tenant', async () => {
      const blob = Buffer.from('opaque-ciphertext');
      const prisma = makePrisma({
        findUniqueResult: {
          id: 'pa-1',
          tenantId: 'tenant-a',
          credentialsEncrypted: blob,
        },
      });
      const service = new PaymentAccountsService(
        prisma as never,
        makeAudit() as never,
      );

      const result = await service.getEncryptedCredentials('tenant-a', 'pa-1');
      expect(result).toEqual(blob);
    });

    it('returns null when no credentials are configured yet', async () => {
      const prisma = makePrisma({
        findUniqueResult: {
          id: 'pa-1',
          tenantId: 'tenant-a',
          credentialsEncrypted: null,
        },
      });
      const service = new PaymentAccountsService(
        prisma as never,
        makeAudit() as never,
      );

      const result = await service.getEncryptedCredentials('tenant-a', 'pa-1');
      expect(result).toBeNull();
    });

    it('throws 404 (never 403) for a row belonging to a different tenant', async () => {
      const prisma = makePrisma({
        findUniqueResult: {
          id: 'pa-1',
          tenantId: 'tenant-b',
          credentialsEncrypted: Buffer.from('x'),
        },
      });
      const service = new PaymentAccountsService(
        prisma as never,
        makeAudit() as never,
      );

      await expect(
        service.getEncryptedCredentials('tenant-a', 'pa-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ─── disabled account cannot be used as active account ─────────────

  describe('findActiveAccountForStore', () => {
    it('returns the account when it is ACTIVE and belongs to the tenant', async () => {
      const prisma = makePrisma({
        findUniqueResult: {
          id: 'pa-1',
          tenantId: 'tenant-a',
          storeId: primaryStoreA.id,
          provider: PaymentProviderType.RAZORPAY,
          status: PaymentAccountStatus.ACTIVE,
          mode: PaymentAccountMode.LIVE,
          displayName: null,
          connectedAt: new Date(),
          disabledAt: null,
          disabledReason: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
      const service = new PaymentAccountsService(
        prisma as never,
        makeAudit() as never,
      );

      const result = await service.findActiveAccountForStore(
        'tenant-a',
        primaryStoreA.id,
        PaymentProviderType.RAZORPAY,
      );
      expect(result).not.toBeNull();
      expect(result?.status).toBe(PaymentAccountStatus.ACTIVE);
    });

    it('returns null for a DISABLED account — never usable as an active one', async () => {
      const prisma = makePrisma({
        findUniqueResult: {
          id: 'pa-1',
          tenantId: 'tenant-a',
          storeId: primaryStoreA.id,
          provider: PaymentProviderType.RAZORPAY,
          status: PaymentAccountStatus.DISABLED,
          mode: PaymentAccountMode.LIVE,
        },
      });
      const service = new PaymentAccountsService(
        prisma as never,
        makeAudit() as never,
      );

      const result = await service.findActiveAccountForStore(
        'tenant-a',
        primaryStoreA.id,
        PaymentProviderType.RAZORPAY,
      );
      expect(result).toBeNull();
    });

    it('returns null for a PENDING account — never usable as an active one', async () => {
      const prisma = makePrisma({
        findUniqueResult: {
          id: 'pa-1',
          tenantId: 'tenant-a',
          storeId: primaryStoreA.id,
          provider: PaymentProviderType.RAZORPAY,
          status: PaymentAccountStatus.PENDING,
          mode: PaymentAccountMode.LIVE,
        },
      });
      const service = new PaymentAccountsService(
        prisma as never,
        makeAudit() as never,
      );

      const result = await service.findActiveAccountForStore(
        'tenant-a',
        primaryStoreA.id,
        PaymentProviderType.RAZORPAY,
      );
      expect(result).toBeNull();
    });

    it('returns null for an ACTIVE account belonging to a different tenant', async () => {
      const prisma = makePrisma({
        findUniqueResult: {
          id: 'pa-1',
          tenantId: 'tenant-b',
          storeId: primaryStoreA.id,
          provider: PaymentProviderType.RAZORPAY,
          status: PaymentAccountStatus.ACTIVE,
          mode: PaymentAccountMode.LIVE,
        },
      });
      const service = new PaymentAccountsService(
        prisma as never,
        makeAudit() as never,
      );

      const result = await service.findActiveAccountForStore(
        'tenant-a',
        primaryStoreA.id,
        PaymentProviderType.RAZORPAY,
      );
      expect(result).toBeNull();
    });
  });
});
