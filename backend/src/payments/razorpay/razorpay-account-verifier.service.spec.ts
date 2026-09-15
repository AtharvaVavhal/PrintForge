import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Razorpay from 'razorpay';
import { CredentialEncryptionService } from '../crypto/credential-encryption.service';
import {
  RazorpayAccountVerificationError,
  RazorpayAccountVerifierService,
} from './razorpay-account-verifier.service';

/**
 * P8-5. Mocks the whole `razorpay` SDK module (task instruction: "Mock
 * Razorpay API calls in unit tests. Do NOT require real Razorpay
 * credentials for tests.") — no network call is ever reachable from this
 * file. `CredentialEncryptionService` is instantiated for real (not
 * mocked) so the "stored credentials" path exercises a genuine
 * encrypt/decrypt round trip, the same way `payments.service.spec.ts`-style
 * tests in this repo prefer real collaborators over mocks wherever no
 * network/DB boundary is crossed.
 */
jest.mock('razorpay');

const MockedRazorpay = Razorpay as jest.MockedClass<typeof Razorpay>;
const VALID_MASTER_KEY = Buffer.alloc(32, 3).toString('base64');

function buildCredentialEncryption(): CredentialEncryptionService {
  const config = {
    get: () => ({ masterKey: VALID_MASTER_KEY }),
  } as unknown as ConfigService;
  return new CredentialEncryptionService(config as never);
}

describe('RazorpayAccountVerifierService', () => {
  let ordersAll: jest.Mock;

  beforeEach(() => {
    ordersAll = jest.fn();
    MockedRazorpay.mockImplementation(
      () =>
        ({
          orders: { all: ordersAll },
        }) as unknown as Razorpay,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('verifyCredentials (fresh submission)', () => {
    it('resolves when the minimal safe orders.all call succeeds', async () => {
      ordersAll.mockResolvedValue({ entity: 'collection', count: 0, items: [] });
      const service = new RazorpayAccountVerifierService(
        buildCredentialEncryption(),
      );

      await expect(
        service.verifyCredentials({
          keyId: 'rzp_test_key',
          keySecret: 'rzp_test_secret',
        }),
      ).resolves.toBeUndefined();
    });

    it('instantiates the Razorpay client with exactly the given credentials, and never creates an order/payment/refund', async () => {
      ordersAll.mockResolvedValue({ entity: 'collection', count: 0, items: [] });
      const service = new RazorpayAccountVerifierService(
        buildCredentialEncryption(),
      );

      await service.verifyCredentials({
        keyId: 'rzp_test_key_x',
        keySecret: 'rzp_test_secret_x',
      });

      expect(MockedRazorpay).toHaveBeenCalledWith({
        key_id: 'rzp_test_key_x',
        key_secret: 'rzp_test_secret_x',
      });
      expect(ordersAll).toHaveBeenCalledWith({ count: 1 });
    });

    it('throws a fixed, generic error on an authentication failure — never the raw provider error', async () => {
      ordersAll.mockRejectedValue({
        statusCode: 401,
        error: {
          code: 'BAD_REQUEST_ERROR',
          description: 'Authentication failed — key_secret is invalid',
        },
      });
      const service = new RazorpayAccountVerifierService(
        buildCredentialEncryption(),
      );

      const err = await service
        .verifyCredentials({ keyId: 'rzp_test_bad', keySecret: 'wrong' })
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(RazorpayAccountVerificationError);
      const message = (err as Error).message;
      expect(message).not.toContain('key_secret is invalid');
      expect(message).not.toContain('wrong');
      expect(message).not.toContain('rzp_test_bad');
    });

    it('throws the same fixed error on a transport failure (no response)', async () => {
      ordersAll.mockRejectedValue(new TypeError("Cannot read properties of undefined (reading 'status')"));
      const service = new RazorpayAccountVerifierService(
        buildCredentialEncryption(),
      );

      await expect(
        service.verifyCredentials({ keyId: 'k', keySecret: 's' }),
      ).rejects.toBeInstanceOf(RazorpayAccountVerificationError);
    });

    it('never logs the key secret', async () => {
      ordersAll.mockRejectedValue({ statusCode: 401 });
      const logSpy = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);
      const service = new RazorpayAccountVerifierService(
        buildCredentialEncryption(),
      );

      await service
        .verifyCredentials({
          keyId: 'rzp_test_visible',
          keySecret: 'must-never-appear-in-logs',
        })
        .catch(() => undefined);

      const loggedText = logSpy.mock.calls.map((c) => String(c)).join(' ');
      expect(loggedText).not.toContain('must-never-appear-in-logs');
      logSpy.mockRestore();
    });
  });

  describe('verifyStoredCredentials (test connection, no resubmission)', () => {
    it('decrypts the stored blob and verifies successfully', async () => {
      ordersAll.mockResolvedValue({ entity: 'collection', count: 0, items: [] });
      const credentialEncryption = buildCredentialEncryption();
      const service = new RazorpayAccountVerifierService(credentialEncryption);
      const blob = credentialEncryption.encrypt(
        JSON.stringify({ keyId: 'rzp_stored_key', keySecret: 'rzp_stored_secret' }),
      );

      await expect(service.verifyStoredCredentials(blob)).resolves.toBeUndefined();
      expect(MockedRazorpay).toHaveBeenCalledWith({
        key_id: 'rzp_stored_key',
        key_secret: 'rzp_stored_secret',
      });
    });

    it('propagates a verification failure for correctly-decrypted-but-invalid stored credentials', async () => {
      ordersAll.mockRejectedValue({ statusCode: 401 });
      const credentialEncryption = buildCredentialEncryption();
      const service = new RazorpayAccountVerifierService(credentialEncryption);
      const blob = credentialEncryption.encrypt(
        JSON.stringify({ keyId: 'rzp_bad', keySecret: 'rzp_bad_secret' }),
      );

      await expect(service.verifyStoredCredentials(blob)).rejects.toBeInstanceOf(
        RazorpayAccountVerificationError,
      );
    });

    it('fails closed (generic error, no crash, no leak) on a corrupted/tampered blob', async () => {
      const credentialEncryption = buildCredentialEncryption();
      const service = new RazorpayAccountVerifierService(credentialEncryption);
      const blob = credentialEncryption.encrypt(
        JSON.stringify({ keyId: 'rzp_x', keySecret: 'rzp_secret_x' }),
      );
      const tampered = Buffer.from(blob);
      tampered[tampered.length - 1] ^= 0xff;

      const err = await service
        .verifyStoredCredentials(tampered)
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(RazorpayAccountVerificationError);
      expect((err as Error).message).not.toContain('rzp_secret_x');
      // Never actually reached Razorpay with garbage.
      expect(MockedRazorpay).not.toHaveBeenCalled();
    });

    it('fails closed on a malformed stored payload (valid ciphertext, wrong shape)', async () => {
      const credentialEncryption = buildCredentialEncryption();
      const service = new RazorpayAccountVerifierService(credentialEncryption);
      const blob = credentialEncryption.encrypt(JSON.stringify({ notCredentials: true }));

      await expect(service.verifyStoredCredentials(blob)).rejects.toBeInstanceOf(
        RazorpayAccountVerificationError,
      );
      expect(MockedRazorpay).not.toHaveBeenCalled();
    });
  });
});
