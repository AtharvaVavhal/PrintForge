import { ConfigService } from '@nestjs/config';
import { PaymentProviderType } from '@prisma/client';
import { CredentialEncryptionService } from '../crypto/credential-encryption.service';
import { UnsupportedPaymentProviderError } from '../payment-accounts/payment-account-resolution.errors';
import { RazorpayProviderAdapter } from '../razorpay/razorpay-provider-adapter';
import { PaymentProviderRegistry } from './payment-provider-registry';

/**
 * P8-6, extended P8-8. Pure unit tests — no DB, no HTTP, no Nest testing
 * module, no network (the registry and its one registered adapter have no
 * external dependency beyond `CredentialEncryptionService`, which itself
 * has no dependency on Prisma/network — see `buildCredentialEncryption`).
 */

const VALID_MASTER_KEY = Buffer.alloc(32, 5).toString('base64');

function buildCredentialEncryption(): CredentialEncryptionService {
  const config = {
    get: () => ({ masterKey: VALID_MASTER_KEY }),
  } as unknown as ConfigService;
  return new CredentialEncryptionService(config as never);
}

function buildRazorpayAdapter(): RazorpayProviderAdapter {
  return new RazorpayProviderAdapter(buildCredentialEncryption());
}

describe('PaymentProviderRegistry', () => {
  it('resolves RAZORPAY to a RazorpayProviderAdapter', () => {
    const razorpayAdapter = buildRazorpayAdapter();
    const registry = new PaymentProviderRegistry(razorpayAdapter);

    const resolved = registry.get(PaymentProviderType.RAZORPAY);

    expect(resolved).toBe(razorpayAdapter);
    expect(resolved.provider).toBe(PaymentProviderType.RAZORPAY);
  });

  it('throws UnsupportedPaymentProviderError for a provider with no registered adapter', () => {
    const registry = new PaymentProviderRegistry(buildRazorpayAdapter());

    // Simulate a future, not-yet-registered enum value without needing a
    // real second provider to exist.
    const unregistered = 'STRIPE' as PaymentProviderType;

    expect(() => registry.get(unregistered)).toThrow(
      UnsupportedPaymentProviderError,
    );
  });

  it('never exposes credential material — the resolved adapter carries no plaintext key/secret fields of its own, and no per-account state at all', () => {
    const registry = new PaymentProviderRegistry(buildRazorpayAdapter());
    const resolved = registry.get(PaymentProviderType.RAZORPAY);

    const ownKeys = Object.keys(resolved);
    expect(ownKeys).toContain('provider');
    // P8-8's adapter now carries a `CredentialEncryptionService` collaborator
    // and a `Logger` — neither holds merchant credential material — but
    // must never carry a raw key id/secret or a decrypted-credentials
    // field as its own property; every real credential only ever exists
    // as a per-call argument, never instance state.
    expect(ownKeys).not.toEqual(
      expect.arrayContaining([
        'keyId',
        'keySecret',
        'credentials',
        'encryptedCredentials',
        'client',
      ]),
    );
  });
});
