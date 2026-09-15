import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PaymentAccountMode, PaymentAccountStatus, PaymentProviderType } from '@prisma/client';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { TenantContext } from '../../common/tenant/tenant-context';
import { RazorpayAccountVerificationError } from '../razorpay/razorpay-account-verifier.service';
import { PaymentAccountConnectionService } from './payment-account-connection.service';

/**
 * P8-5. Every collaborator (`PaymentAccountsService`,
 * `CredentialEncryptionService`, `RazorpayAccountVerifierService`) is a
 * plain jest mock — this suite is purely about the orchestration logic
 * (which branch runs, what gets persisted/activated, what a failure must
 * NOT touch), not about re-proving encryption or the Razorpay SDK call
 * (covered by their own dedicated spec files). No network, no DB.
 */
describe('PaymentAccountConnectionService', () => {
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

  function makeView(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      id: 'pa-1',
      storeId: 'store-a',
      provider: PaymentProviderType.RAZORPAY,
      status: PaymentAccountStatus.PENDING,
      mode: PaymentAccountMode.TEST,
      displayName: null,
      connectedAt: null,
      disabledAt: null,
      disabledReason: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
  }

  function makeCollaborators() {
    const paymentAccountsService = {
      getOne: jest.fn(),
      configureCredentials: jest.fn().mockResolvedValue(undefined),
      getEncryptedCredentials: jest.fn(),
      activate: jest.fn(),
    };
    const credentialEncryption = {
      encrypt: jest.fn().mockReturnValue(Buffer.from('encrypted-blob')),
      decrypt: jest.fn(),
    };
    const razorpayAccountVerifier = {
      verifyCredentials: jest.fn().mockResolvedValue(undefined),
      verifyStoredCredentials: jest.fn().mockResolvedValue(undefined),
    };
    return { paymentAccountsService, credentialEncryption, razorpayAccountVerifier };
  }

  function makeService(collaborators: ReturnType<typeof makeCollaborators>) {
    return new PaymentAccountConnectionService(
      collaborators.paymentAccountsService as never,
      collaborators.credentialEncryption as never,
      collaborators.razorpayAccountVerifier as never,
    );
  }

  // ─── fresh-credential submission ────────────────────────────────────

  describe('submitting fresh credentials', () => {
    it('verifies, persists (encrypted), and activates a PENDING account on success', async () => {
      const c = makeCollaborators();
      c.paymentAccountsService.getOne
        .mockResolvedValueOnce(makeView({ status: PaymentAccountStatus.PENDING }))
        .mockResolvedValueOnce(makeView({ status: PaymentAccountStatus.ACTIVE }));
      const service = makeService(c);

      const result = await service.connect(tenantContextA, actor, 'pa-1', {
        keyId: 'rzp_test_key',
        keySecret: 'rzp_test_secret',
      });

      expect(c.razorpayAccountVerifier.verifyCredentials).toHaveBeenCalledWith({
        keyId: 'rzp_test_key',
        keySecret: 'rzp_test_secret',
        webhookSecret: undefined,
      });
      expect(c.credentialEncryption.encrypt).toHaveBeenCalledWith(
        JSON.stringify({
          keyId: 'rzp_test_key',
          keySecret: 'rzp_test_secret',
          webhookSecret: undefined,
        }),
      );
      expect(c.paymentAccountsService.configureCredentials).toHaveBeenCalledWith(
        tenantContextA,
        actor,
        'pa-1',
        Buffer.from('encrypted-blob'),
      );
      expect(c.paymentAccountsService.activate).toHaveBeenCalledWith(
        tenantContextA,
        actor,
        'pa-1',
      );
      expect(result.status).toBe(PaymentAccountStatus.ACTIVE);
    });

    it('does NOT persist or activate when verification fails', async () => {
      const c = makeCollaborators();
      c.paymentAccountsService.getOne.mockResolvedValue(
        makeView({ status: PaymentAccountStatus.PENDING }),
      );
      c.razorpayAccountVerifier.verifyCredentials.mockRejectedValue(
        new RazorpayAccountVerificationError('Razorpay credential verification failed — check the key id and secret.'),
      );
      const service = makeService(c);

      await expect(
        service.connect(tenantContextA, actor, 'pa-1', {
          keyId: 'rzp_test_key',
          keySecret: 'wrong-secret',
        }),
      ).rejects.toThrow(
        'Razorpay credential verification failed — check the key id and secret.',
      );

      expect(c.paymentAccountsService.configureCredentials).not.toHaveBeenCalled();
      expect(c.paymentAccountsService.activate).not.toHaveBeenCalled();
    });

    it('never leaks the raw verification error message', async () => {
      const c = makeCollaborators();
      c.paymentAccountsService.getOne.mockResolvedValue(makeView());
      c.razorpayAccountVerifier.verifyCredentials.mockRejectedValue(
        new RazorpayAccountVerificationError(
          'Razorpay credential verification failed — check the key id and secret.',
        ),
      );
      const service = makeService(c);

      const err = await service
        .connect(tenantContextA, actor, 'pa-1', {
          keyId: 'rzp_test_key',
          keySecret: 'super-secret-value',
        })
        .catch((e: unknown) => e);

      expect((err as Error).message).not.toContain('super-secret-value');
    });

    it('rejects a request with only keyId and no keySecret (400, no calls made)', async () => {
      const c = makeCollaborators();
      c.paymentAccountsService.getOne.mockResolvedValue(makeView());
      const service = makeService(c);

      await expect(
        service.connect(tenantContextA, actor, 'pa-1', { keyId: 'rzp_test_key' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(c.razorpayAccountVerifier.verifyCredentials).not.toHaveBeenCalled();
      expect(c.paymentAccountsService.configureCredentials).not.toHaveBeenCalled();
    });

    it('reconfigures credentials on an already-ACTIVE account WITHOUT re-transitioning it (no ACTIVE->ACTIVE call)', async () => {
      const c = makeCollaborators();
      c.paymentAccountsService.getOne.mockResolvedValue(
        makeView({ status: PaymentAccountStatus.ACTIVE }),
      );
      const service = makeService(c);

      const result = await service.connect(tenantContextA, actor, 'pa-1', {
        keyId: 'rzp_test_key',
        keySecret: 'rzp_test_secret',
      });

      expect(c.paymentAccountsService.configureCredentials).toHaveBeenCalled();
      expect(c.paymentAccountsService.activate).not.toHaveBeenCalled();
      expect(result.status).toBe(PaymentAccountStatus.ACTIVE);
    });
  });

  // ─── "test connection" (no resubmission) ────────────────────────────

  describe('re-verifying stored credentials (test connection)', () => {
    it('activates a DISABLED account when the stored credentials still verify', async () => {
      const c = makeCollaborators();
      c.paymentAccountsService.getOne
        .mockResolvedValueOnce(makeView({ status: PaymentAccountStatus.DISABLED }))
        .mockResolvedValueOnce(makeView({ status: PaymentAccountStatus.ACTIVE }));
      c.paymentAccountsService.getEncryptedCredentials.mockResolvedValue(
        Buffer.from('stored-blob'),
      );
      const service = makeService(c);

      const result = await service.connect(tenantContextA, actor, 'pa-1', {});

      expect(c.razorpayAccountVerifier.verifyStoredCredentials).toHaveBeenCalledWith(
        Buffer.from('stored-blob'),
      );
      expect(c.paymentAccountsService.configureCredentials).not.toHaveBeenCalled();
      expect(c.paymentAccountsService.activate).toHaveBeenCalledWith(
        tenantContextA,
        actor,
        'pa-1',
      );
      expect(result.status).toBe(PaymentAccountStatus.ACTIVE);
    });

    it('rejects with 400 when there are no stored credentials to re-verify', async () => {
      const c = makeCollaborators();
      c.paymentAccountsService.getOne.mockResolvedValue(
        makeView({ status: PaymentAccountStatus.PENDING }),
      );
      c.paymentAccountsService.getEncryptedCredentials.mockResolvedValue(null);
      const service = makeService(c);

      await expect(
        service.connect(tenantContextA, actor, 'pa-1', {}),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(c.razorpayAccountVerifier.verifyStoredCredentials).not.toHaveBeenCalled();
      expect(c.paymentAccountsService.activate).not.toHaveBeenCalled();
    });

    it('does not activate when re-verification fails', async () => {
      const c = makeCollaborators();
      c.paymentAccountsService.getOne.mockResolvedValue(
        makeView({ status: PaymentAccountStatus.DISABLED }),
      );
      c.paymentAccountsService.getEncryptedCredentials.mockResolvedValue(
        Buffer.from('stored-blob'),
      );
      c.razorpayAccountVerifier.verifyStoredCredentials.mockRejectedValue(
        new RazorpayAccountVerificationError(
          'Razorpay credential verification failed — check the key id and secret.',
        ),
      );
      const service = makeService(c);

      await expect(
        service.connect(tenantContextA, actor, 'pa-1', {}),
      ).rejects.toThrow(/verification failed/);
      expect(c.paymentAccountsService.activate).not.toHaveBeenCalled();
    });
  });

  // ─── tenant isolation ────────────────────────────────────────────────

  describe('tenant isolation', () => {
    it('propagates 404 (never 403) for a cross-tenant account id, before any verification is attempted', async () => {
      const c = makeCollaborators();
      c.paymentAccountsService.getOne.mockRejectedValue(new NotFoundException());
      const service = makeService(c);

      await expect(
        service.connect(tenantContextA, actor, 'pa-other-tenant', {
          keyId: 'k',
          keySecret: 's',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(c.razorpayAccountVerifier.verifyCredentials).not.toHaveBeenCalled();
    });
  });

  // ─── response shape ──────────────────────────────────────────────────

  describe('response shape', () => {
    it('never includes credentialsEncrypted/credentialsUpdatedAt in the returned view', async () => {
      const c = makeCollaborators();
      const view = makeView({ status: PaymentAccountStatus.ACTIVE });
      c.paymentAccountsService.getOne.mockResolvedValue(view);
      const service = makeService(c);

      const result = await service.connect(tenantContextA, actor, 'pa-1', {
        keyId: 'rzp_test_key',
        keySecret: 'rzp_test_secret',
      });

      expect(result).not.toHaveProperty('credentialsEncrypted');
      expect(result).not.toHaveProperty('credentialsUpdatedAt');
    });
  });
});
