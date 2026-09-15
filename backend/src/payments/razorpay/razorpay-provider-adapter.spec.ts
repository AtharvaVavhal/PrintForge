import { createHmac } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentProviderType } from '@prisma/client';
import Razorpay from 'razorpay';
import { CredentialEncryptionService } from '../crypto/credential-encryption.service';
import {
  PaymentProviderApiError,
  PaymentProviderCredentialError,
} from '../providers/payment-provider.errors';
import { RazorpayProviderAdapter } from './razorpay-provider-adapter';

/**
 * P8-8. Mocks the whole `razorpay` SDK module — no network call is ever
 * reachable from this file, no real Razorpay credentials are used
 * anywhere (task testing requirement). `CredentialEncryptionService` is
 * instantiated for real (not mocked) so every test exercises a genuine
 * encrypt/decrypt round trip through the actual P8-D6 envelope format —
 * same convention `razorpay-account-verifier.service.spec.ts` already
 * establishes for this identical need.
 */
jest.mock('razorpay');

const MockedRazorpay = Razorpay as jest.MockedClass<typeof Razorpay>;
const VALID_MASTER_KEY = Buffer.alloc(32, 7).toString('base64');

function buildCredentialEncryption(): CredentialEncryptionService {
  const config = {
    get: () => ({ masterKey: VALID_MASTER_KEY }),
  } as unknown as ConfigService;
  return new CredentialEncryptionService(config as never);
}

function encryptMerchantCredentials(
  enc: CredentialEncryptionService,
  keyId: string,
  keySecret: string,
  webhookSecret?: string,
): Buffer {
  return enc.encrypt(JSON.stringify({ keyId, keySecret, webhookSecret }));
}

describe('RazorpayProviderAdapter', () => {
  let credentialEncryption: CredentialEncryptionService;
  let adapter: RazorpayProviderAdapter;

  beforeEach(() => {
    credentialEncryption = buildCredentialEncryption();
    adapter = new RazorpayProviderAdapter(credentialEncryption);
    MockedRazorpay.mockReset();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('carries the RAZORPAY provider tag', () => {
    expect(adapter.provider).toBe(PaymentProviderType.RAZORPAY);
  });

  describe('merchant credential usage / per-call client construction', () => {
    it('constructs the Razorpay client from exactly the given account\'s decrypted credentials — never a global/env credential', async () => {
      const create = jest.fn().mockResolvedValue({ id: 'order_A' });
      MockedRazorpay.mockImplementation(
        () => ({ orders: { create } }) as unknown as Razorpay,
      );
      const blob = encryptMerchantCredentials(
        credentialEncryption,
        'rzp_merchant_store_a',
        'secret_store_a',
      );

      await adapter.createOrder(blob, {
        amountPaise: 10000n,
        currency: 'INR',
        receipt: 'r1',
      });

      expect(MockedRazorpay).toHaveBeenCalledTimes(1);
      expect(MockedRazorpay).toHaveBeenCalledWith({
        key_id: 'rzp_merchant_store_a',
        key_secret: 'secret_store_a',
      });
    });

    it('tenant/account isolation — two calls for two different PaymentAccounts each build their OWN client from their OWN credentials, never mixed or cached across calls', async () => {
      const createA = jest.fn().mockResolvedValue({ id: 'order_A' });
      const createB = jest.fn().mockResolvedValue({ id: 'order_B' });
      let call = 0;
      MockedRazorpay.mockImplementation(() => {
        call += 1;
        return ({
          orders: { create: call === 1 ? createA : createB },
        }) as unknown as Razorpay;
      });
      const blobStoreA = encryptMerchantCredentials(
        credentialEncryption,
        'rzp_store_a',
        'secret_store_a',
      );
      const blobStoreB = encryptMerchantCredentials(
        credentialEncryption,
        'rzp_store_b',
        'secret_store_b',
      );

      const resultA = await adapter.createOrder(blobStoreA, {
        amountPaise: 100n,
        currency: 'INR',
        receipt: 'ra',
      });
      const resultB = await adapter.createOrder(blobStoreB, {
        amountPaise: 200n,
        currency: 'INR',
        receipt: 'rb',
      });

      expect(MockedRazorpay).toHaveBeenNthCalledWith(1, {
        key_id: 'rzp_store_a',
        key_secret: 'secret_store_a',
      });
      expect(MockedRazorpay).toHaveBeenNthCalledWith(2, {
        key_id: 'rzp_store_b',
        key_secret: 'secret_store_b',
      });
      expect(resultA.providerOrderId).toBe('order_A');
      expect(resultB.providerOrderId).toBe('order_B');
      // No cross-store credential use: store B's client was never built
      // with store A's key id.
      expect(MockedRazorpay).not.toHaveBeenCalledWith({
        key_id: 'rzp_store_a',
        key_secret: 'secret_store_b',
      });
    });

    it('the adapter source never IMPORTS app-wide/SaaS Razorpay config — SaaS billing credentials cannot be reached by this class', () => {
      const source = readFileSync(
        join(__dirname, 'razorpay-provider-adapter.ts'),
        'utf8',
      );
      const importLines = source
        .split('\n')
        .filter((line) => /^\s*import\b/.test(line))
        .join('\n');

      expect(importLines).not.toMatch(/@nestjs\/config/);
      expect(importLines).not.toMatch(/ConfigService/);
      expect(importLines).not.toMatch(/AppConfig/);
      expect(importLines).not.toMatch(/from '\.\.\/razorpay\.service'/);
      expect(importLines).not.toMatch(/RazorpayBillingProvider/);
      // No process-level env access of any kind, SaaS or otherwise —
      // credentials only ever arrive as a per-call argument.
      expect(source).not.toMatch(/process\.env/);
    });
  });

  describe('getPublicKeyId', () => {
    it('returns the account\'s own key id, decrypted from its own blob', () => {
      const blob = encryptMerchantCredentials(
        credentialEncryption,
        'rzp_store_public_key',
        'secret_never_returned',
      );

      const keyId = adapter.getPublicKeyId(blob);

      expect(keyId).toBe('rzp_store_public_key');
    });

    it('never returns the key secret', () => {
      const blob = encryptMerchantCredentials(
        credentialEncryption,
        'rzp_key',
        'must_never_be_returned',
      );

      const keyId = adapter.getPublicKeyId(blob);

      expect(keyId).not.toContain('must_never_be_returned');
    });

    it('fails closed with PaymentProviderCredentialError on a tampered blob, never reaching Razorpay', () => {
      const blob = encryptMerchantCredentials(
        credentialEncryption,
        'rzp_key',
        'secret',
      );
      const tampered = Buffer.from(blob);
      tampered[tampered.length - 1] ^= 0xff;

      expect(() => adapter.getPublicKeyId(tampered)).toThrow(
        PaymentProviderCredentialError,
      );
      expect(MockedRazorpay).not.toHaveBeenCalled();
    });
  });

  describe('createOrder (merchant order creation)', () => {
    it('returns the provider order id on success', async () => {
      const create = jest.fn().mockResolvedValue({ id: 'order_123' });
      MockedRazorpay.mockImplementation(
        () => ({ orders: { create } }) as unknown as Razorpay,
      );
      const blob = encryptMerchantCredentials(
        credentialEncryption,
        'rzp_key',
        'rzp_secret',
      );

      const result = await adapter.createOrder(blob, {
        amountPaise: 14900n,
        currency: 'INR',
        receipt: 'order-receipt-1',
      });

      expect(result).toEqual({ providerOrderId: 'order_123' });
    });

    it('passes amount as a decimal string, never a number (bigint precision discipline)', async () => {
      const create = jest.fn().mockResolvedValue({ id: 'order_123' });
      MockedRazorpay.mockImplementation(
        () => ({ orders: { create } }) as unknown as Razorpay,
      );
      const blob = encryptMerchantCredentials(
        credentialEncryption,
        'rzp_key',
        'rzp_secret',
      );

      await adapter.createOrder(blob, {
        amountPaise: 14900n,
        currency: 'INR',
        receipt: 'r',
      });

      expect(create).toHaveBeenCalledWith({
        amount: '14900',
        currency: 'INR',
        receipt: 'r',
      });
    });

    it('rejects when the SDK resolves without an order id', async () => {
      const create = jest.fn().mockResolvedValue({});
      MockedRazorpay.mockImplementation(
        () => ({ orders: { create } }) as unknown as Razorpay,
      );
      const blob = encryptMerchantCredentials(
        credentialEncryption,
        'rzp_key',
        'rzp_secret',
      );

      await expect(
        adapter.createOrder(blob, {
          amountPaise: 100n,
          currency: 'INR',
          receipt: 'r',
        }),
      ).rejects.toBeInstanceOf(PaymentProviderApiError);
    });
  });

  describe('verifyPaymentSignature (payment verification adapter operation)', () => {
    it('returns true for a signature computed with the account\'s own key secret', () => {
      const blob = encryptMerchantCredentials(
        credentialEncryption,
        'rzp_key',
        'the_key_secret',
      );
      const providerOrderId = 'order_abc';
      const providerPaymentId = 'pay_xyz';
      const validSignature = createHmac('sha256', 'the_key_secret')
        .update(`${providerOrderId}|${providerPaymentId}`)
        .digest('hex');

      const ok = adapter.verifyPaymentSignature(blob, {
        providerOrderId,
        providerPaymentId,
        providerSignature: validSignature,
      });

      expect(ok).toBe(true);
    });

    it('returns false for a signature computed with the WRONG key secret (e.g. another store\'s account)', () => {
      const blob = encryptMerchantCredentials(
        credentialEncryption,
        'rzp_key',
        'the_key_secret',
      );
      const providerOrderId = 'order_abc';
      const providerPaymentId = 'pay_xyz';
      const signatureFromAnotherAccount = createHmac(
        'sha256',
        'a_different_stores_secret',
      )
        .update(`${providerOrderId}|${providerPaymentId}`)
        .digest('hex');

      const ok = adapter.verifyPaymentSignature(blob, {
        providerOrderId,
        providerPaymentId,
        providerSignature: signatureFromAnotherAccount,
      });

      expect(ok).toBe(false);
    });

    it('returns false (never throws) for a malformed/mismatched-length signature', () => {
      const blob = encryptMerchantCredentials(
        credentialEncryption,
        'rzp_key',
        'the_key_secret',
      );

      const ok = adapter.verifyPaymentSignature(blob, {
        providerOrderId: 'order_abc',
        providerPaymentId: 'pay_xyz',
        providerSignature: 'not-a-real-signature',
      });

      expect(ok).toBe(false);
    });

    it('never calls the Razorpay SDK — signature verification is local HMAC only', () => {
      const blob = encryptMerchantCredentials(
        credentialEncryption,
        'rzp_key',
        'the_key_secret',
      );

      adapter.verifyPaymentSignature(blob, {
        providerOrderId: 'order_abc',
        providerPaymentId: 'pay_xyz',
        providerSignature: 'irrelevant',
      });

      expect(MockedRazorpay).not.toHaveBeenCalled();
    });
  });

  describe('verifyWebhookSignature (P8-10)', () => {
    it('returns true for a signature computed with the account\'s own webhook secret', () => {
      const rawBody = '{"event":"payment.captured"}';
      const blob = encryptMerchantCredentials(
        credentialEncryption,
        'rzp_key',
        'rzp_secret',
        'the_webhook_secret',
      );
      const validSignature = createHmac('sha256', 'the_webhook_secret')
        .update(rawBody)
        .digest('hex');

      const ok = adapter.verifyWebhookSignature(blob, rawBody, validSignature);

      expect(ok).toBe(true);
    });

    it('returns false for a signature computed with the WRONG webhook secret (e.g. another store\'s account)', () => {
      const rawBody = '{"event":"payment.captured"}';
      const blob = encryptMerchantCredentials(
        credentialEncryption,
        'rzp_key',
        'rzp_secret',
        'the_webhook_secret',
      );
      const signatureFromAnotherAccount = createHmac(
        'sha256',
        'a_different_stores_webhook_secret',
      )
        .update(rawBody)
        .digest('hex');

      const ok = adapter.verifyWebhookSignature(
        blob,
        rawBody,
        signatureFromAnotherAccount,
      );

      expect(ok).toBe(false);
    });

    it('fails closed (returns false, never throws) when the account has no webhookSecret configured', () => {
      const rawBody = '{"event":"payment.captured"}';
      const blob = encryptMerchantCredentials(
        credentialEncryption,
        'rzp_key',
        'rzp_secret',
        // no webhookSecret
      );

      const ok = adapter.verifyWebhookSignature(blob, rawBody, 'anything');

      expect(ok).toBe(false);
    });

    it('returns false for a malformed/mismatched-length signature, never throws', () => {
      const blob = encryptMerchantCredentials(
        credentialEncryption,
        'rzp_key',
        'rzp_secret',
        'the_webhook_secret',
      );

      const ok = adapter.verifyWebhookSignature(blob, 'body', 'not-a-real-signature');

      expect(ok).toBe(false);
    });

    it('never calls the Razorpay SDK — webhook signature verification is local HMAC only', () => {
      const blob = encryptMerchantCredentials(
        credentialEncryption,
        'rzp_key',
        'rzp_secret',
        'the_webhook_secret',
      );

      adapter.verifyWebhookSignature(blob, 'body', 'irrelevant');

      expect(MockedRazorpay).not.toHaveBeenCalled();
    });

    it('never leaks the webhook secret in any observable way', () => {
      const rawBody = 'body';
      const blob = encryptMerchantCredentials(
        credentialEncryption,
        'rzp_key',
        'rzp_secret',
        'must-never-leak-this-webhook-secret',
      );

      const ok = adapter.verifyWebhookSignature(blob, rawBody, 'wrong-sig');

      expect(ok).toBe(false);
      // Nothing about the call ever returns/throws the secret itself.
    });

    it('fails closed with PaymentProviderCredentialError on a tampered blob, never reaching Razorpay', () => {
      const blob = encryptMerchantCredentials(
        credentialEncryption,
        'rzp_key',
        'rzp_secret',
        'the_webhook_secret',
      );
      const tampered = Buffer.from(blob);
      tampered[tampered.length - 1] ^= 0xff;

      expect(() => adapter.verifyWebhookSignature(tampered, 'body', 'sig')).toThrow(
        PaymentProviderCredentialError,
      );
      expect(MockedRazorpay).not.toHaveBeenCalled();
    });
  });

  describe('fetchOrderPayments', () => {
    it('normalizes provider payments to bigint paise, camelCase fields', async () => {
      const fetchPayments = jest.fn().mockResolvedValue({
        entity: 'collection',
        count: 1,
        items: [
          {
            id: 'pay_1',
            order_id: 'order_1',
            amount: 14900,
            currency: 'INR',
            status: 'captured',
            captured: true,
            method: 'card',
          },
        ],
      });
      MockedRazorpay.mockImplementation(
        () => ({ orders: { fetchPayments } }) as unknown as Razorpay,
      );
      const blob = encryptMerchantCredentials(
        credentialEncryption,
        'rzp_key',
        'rzp_secret',
      );

      const result = await adapter.fetchOrderPayments(blob, 'order_1');

      expect(result).toEqual([
        {
          providerPaymentId: 'pay_1',
          providerOrderId: 'order_1',
          amountPaise: 14900n,
          currency: 'INR',
          status: 'captured',
          captured: true,
          method: 'card',
        },
      ]);
    });

    it('returns an empty array when the SDK returns no items', async () => {
      const fetchPayments = jest.fn().mockResolvedValue({});
      MockedRazorpay.mockImplementation(
        () => ({ orders: { fetchPayments } }) as unknown as Razorpay,
      );
      const blob = encryptMerchantCredentials(
        credentialEncryption,
        'rzp_key',
        'rzp_secret',
      );

      await expect(
        adapter.fetchOrderPayments(blob, 'order_1'),
      ).resolves.toEqual([]);
    });
  });

  describe('createRefund (adapter-level capability only, unused until P8-11)', () => {
    it('returns the provider refund id and status on success', async () => {
      const refund = jest
        .fn()
        .mockResolvedValue({ id: 'rfnd_1', status: 'processed' });
      MockedRazorpay.mockImplementation(
        () => ({ payments: { refund } }) as unknown as Razorpay,
      );
      const blob = encryptMerchantCredentials(
        credentialEncryption,
        'rzp_key',
        'rzp_secret',
      );

      const result = await adapter.createRefund(blob, {
        providerPaymentId: 'pay_1',
        amountPaise: 14900n,
        reason: 'customer request',
      });

      expect(result).toEqual({ providerRefundId: 'rfnd_1', status: 'processed' });
      expect(refund).toHaveBeenCalledWith('pay_1', {
        amount: 14900,
        notes: { reason: 'customer request' },
      });
    });

    it('rejects amounts exceeding safe integer precision without ever calling the SDK', async () => {
      const refund = jest.fn();
      MockedRazorpay.mockImplementation(
        () => ({ payments: { refund } }) as unknown as Razorpay,
      );
      const blob = encryptMerchantCredentials(
        credentialEncryption,
        'rzp_key',
        'rzp_secret',
      );

      await expect(
        adapter.createRefund(blob, {
          providerPaymentId: 'pay_1',
          amountPaise: BigInt(Number.MAX_SAFE_INTEGER) + 1n,
        }),
      ).rejects.toBeInstanceOf(PaymentProviderApiError);
      expect(refund).not.toHaveBeenCalled();
    });
  });

  describe('provider error translation', () => {
    it('translates a real Razorpay API error into PaymentProviderApiError, preserving status/code, never the raw SDK object', async () => {
      const create = jest.fn().mockRejectedValue({
        statusCode: 400,
        error: { code: 'BAD_REQUEST_ERROR', description: 'amount must be at least 100' },
      });
      MockedRazorpay.mockImplementation(
        () => ({ orders: { create } }) as unknown as Razorpay,
      );
      const blob = encryptMerchantCredentials(
        credentialEncryption,
        'rzp_key',
        'rzp_secret',
      );

      const err = await adapter
        .createOrder(blob, { amountPaise: 1n, currency: 'INR', receipt: 'r' })
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(PaymentProviderApiError);
      const apiErr = err as PaymentProviderApiError;
      expect(apiErr.statusCode).toBe(400);
      expect(apiErr.code).toBe('BAD_REQUEST_ERROR');
      expect(apiErr.transport).toBe(false);
      expect(apiErr.provider).toBe(PaymentProviderType.RAZORPAY);
      expect(apiErr.message).toContain('amount must be at least 100');
    });

    it('translates the SDK\'s mangled transport TypeError into a clear transport error, never leaking a bare TypeError', async () => {
      const create = jest
        .fn()
        .mockRejectedValue(
          new TypeError("Cannot read properties of undefined (reading 'status')"),
        );
      MockedRazorpay.mockImplementation(
        () => ({ orders: { create } }) as unknown as Razorpay,
      );
      const blob = encryptMerchantCredentials(
        credentialEncryption,
        'rzp_key',
        'rzp_secret',
      );

      const err = await adapter
        .createOrder(blob, { amountPaise: 100n, currency: 'INR', receipt: 'r' })
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(PaymentProviderApiError);
      expect(err).not.toBeInstanceOf(TypeError);
      expect((err as PaymentProviderApiError).transport).toBe(true);
      expect((err as PaymentProviderApiError).message).toMatch(
        /could not reach Razorpay/i,
      );
    });

    it('never converts a provider error into an HTTP exception inside the adapter', async () => {
      const create = jest.fn().mockRejectedValue({ statusCode: 500 });
      MockedRazorpay.mockImplementation(
        () => ({ orders: { create } }) as unknown as Razorpay,
      );
      const blob = encryptMerchantCredentials(
        credentialEncryption,
        'rzp_key',
        'rzp_secret',
      );

      const err = await adapter
        .createOrder(blob, { amountPaise: 100n, currency: 'INR', receipt: 'r' })
        .catch((e: unknown) => e);

      // A plain domain Error, never a NestJS HttpException/its subclasses
      // (which all carry a `getStatus`/`getResponse` method this does not).
      expect(typeof (err as { getStatus?: unknown }).getStatus).toBe(
        'undefined',
      );
    });
  });

  describe('credential leakage prevention', () => {
    it('never includes the key secret in a thrown API error message', async () => {
      const create = jest.fn().mockRejectedValue({
        statusCode: 401,
        error: { code: 'AUTH', description: 'authentication failed' },
      });
      MockedRazorpay.mockImplementation(
        () => ({ orders: { create } }) as unknown as Razorpay,
      );
      const blob = encryptMerchantCredentials(
        credentialEncryption,
        'rzp_visible_key',
        'must-never-leak-this-secret',
      );

      const err = await adapter
        .createOrder(blob, { amountPaise: 100n, currency: 'INR', receipt: 'r' })
        .catch((e: unknown) => e);

      expect((err as Error).message).not.toContain('must-never-leak-this-secret');
    });

    it('never logs the key secret on an API error', async () => {
      const logSpy = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);
      const create = jest.fn().mockRejectedValue({ statusCode: 401 });
      MockedRazorpay.mockImplementation(
        () => ({ orders: { create } }) as unknown as Razorpay,
      );
      const blob = encryptMerchantCredentials(
        credentialEncryption,
        'rzp_visible_key',
        'must-never-appear-in-logs',
      );

      await adapter
        .createOrder(blob, { amountPaise: 100n, currency: 'INR', receipt: 'r' })
        .catch(() => undefined);

      const loggedText = logSpy.mock.calls.map((c) => String(c)).join(' ');
      expect(loggedText).not.toContain('must-never-appear-in-logs');
      logSpy.mockRestore();
    });

    it('fails closed with PaymentProviderCredentialError on a corrupted/tampered ciphertext, without leaking plaintext or reaching Razorpay', async () => {
      const blob = encryptMerchantCredentials(
        credentialEncryption,
        'rzp_key',
        'rzp_secret_to_protect',
      );
      const tampered = Buffer.from(blob);
      tampered[tampered.length - 1] ^= 0xff;

      const err = await adapter
        .createOrder(tampered, {
          amountPaise: 100n,
          currency: 'INR',
          receipt: 'r',
        })
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(PaymentProviderCredentialError);
      expect((err as Error).message).not.toContain('rzp_secret_to_protect');
      expect(MockedRazorpay).not.toHaveBeenCalled();
    });

    it('fails closed with PaymentProviderCredentialError on a malformed stored payload (valid ciphertext, wrong shape)', async () => {
      const blob = credentialEncryption.encrypt(
        JSON.stringify({ notCredentials: true }),
      );

      const err = await adapter
        .createOrder(blob, { amountPaise: 100n, currency: 'INR', receipt: 'r' })
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(PaymentProviderCredentialError);
      expect(MockedRazorpay).not.toHaveBeenCalled();
    });

    it('never returns credentials from any method', async () => {
      const create = jest.fn().mockResolvedValue({ id: 'order_1' });
      MockedRazorpay.mockImplementation(
        () => ({ orders: { create } }) as unknown as Razorpay,
      );
      const blob = encryptMerchantCredentials(
        credentialEncryption,
        'rzp_key',
        'rzp_secret',
      );

      const result = await adapter.createOrder(blob, {
        amountPaise: 100n,
        currency: 'INR',
        receipt: 'r',
      });

      expect(JSON.stringify(result)).not.toContain('rzp_secret');
      expect(JSON.stringify(result)).not.toContain('rzp_key');
    });
  });
});
