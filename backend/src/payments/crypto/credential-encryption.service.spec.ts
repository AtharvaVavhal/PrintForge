import { ConfigService } from '@nestjs/config';
import {
  CredentialDecryptionError,
  CredentialEncryptionService,
} from './credential-encryption.service';

/**
 * P8-5 / P8-D6. `ConfigService` is a plain stub returning
 * `{ masterKey }` for the `paymentCredentials` key — the same
 * `configService.get('<block>', {infer:true})` shape `RazorpayService`'s
 * own spec already establishes (`razorpay.service.spec.ts`). No NestJS
 * testing module / DI container needed for a class this small.
 */
const VALID_KEY = Buffer.alloc(32, 7).toString('base64'); // 32 bytes, valid

function buildService(masterKey: string | undefined): CredentialEncryptionService {
  const config = {
    get: () => ({ masterKey }),
  } as unknown as ConfigService;
  return new CredentialEncryptionService(config as never);
}

describe('CredentialEncryptionService', () => {
  describe('round trip', () => {
    it('decrypts exactly what was encrypted', () => {
      const service = buildService(VALID_KEY);
      const plaintext = JSON.stringify({
        keyId: 'rzp_test_abc123',
        keySecret: 'super-secret-value',
      });

      const envelope = service.encrypt(plaintext);
      expect(service.decrypt(envelope)).toBe(plaintext);
    });

    it('round-trips an empty string', () => {
      const service = buildService(VALID_KEY);
      const envelope = service.encrypt('');
      expect(service.decrypt(envelope)).toBe('');
    });

    it('round-trips unicode content', () => {
      const service = buildService(VALID_KEY);
      const plaintext = 'rzp_live_🔒_密钥_सीक्रेट';
      const envelope = service.encrypt(plaintext);
      expect(service.decrypt(envelope)).toBe(plaintext);
    });
  });

  describe('random IV', () => {
    it('produces different ciphertext for the same plaintext on every call', () => {
      const service = buildService(VALID_KEY);
      const plaintext = 'rzp_test_same_input_every_time';

      const a = service.encrypt(plaintext);
      const b = service.encrypt(plaintext);

      expect(a.equals(b)).toBe(false);
      // Both still decrypt back to the same original plaintext.
      expect(service.decrypt(a)).toBe(plaintext);
      expect(service.decrypt(b)).toBe(plaintext);
    });

    it('never reuses the same IV bytes across two encryptions', () => {
      const service = buildService(VALID_KEY);
      const a = service.encrypt('x');
      const b = service.encrypt('x');
      // version(1) + iv(12) — bytes 1..13.
      const ivA = a.subarray(1, 13);
      const ivB = b.subarray(1, 13);
      expect(ivA.equals(ivB)).toBe(false);
    });
  });

  describe('envelope format', () => {
    it('stamps the leading byte with the envelope version', () => {
      const service = buildService(VALID_KEY);
      const envelope = service.encrypt('anything');
      expect(envelope[0]).toBe(1);
    });

    it('preserves a 16-byte GCM authentication tag', () => {
      const service = buildService(VALID_KEY);
      const envelope = service.encrypt('anything');
      // version(1) + iv(12) + authTag(16) = 29 bytes minimum before ciphertext.
      expect(envelope.length).toBeGreaterThanOrEqual(29);
    });
  });

  describe('tamper / malformed ciphertext — fail closed', () => {
    it('rejects ciphertext with a flipped byte (auth tag mismatch)', () => {
      const service = buildService(VALID_KEY);
      const envelope = service.encrypt('rzp_test_tamper_check');
      const tampered = Buffer.from(envelope);
      tampered[tampered.length - 1] ^= 0xff; // flip the last ciphertext byte

      expect(() => service.decrypt(tampered)).toThrow(
        CredentialDecryptionError,
      );
    });

    it('rejects a tampered authentication tag', () => {
      const service = buildService(VALID_KEY);
      const envelope = service.encrypt('rzp_test_tag_tamper');
      const tampered = Buffer.from(envelope);
      tampered[15] ^= 0xff; // inside the auth-tag range (bytes 13..29)

      expect(() => service.decrypt(tampered)).toThrow(
        CredentialDecryptionError,
      );
    });

    it('rejects a truncated/too-short buffer', () => {
      const service = buildService(VALID_KEY);
      expect(() => service.decrypt(Buffer.from([1, 2, 3]))).toThrow(
        CredentialDecryptionError,
      );
    });

    it('rejects an unsupported envelope version byte', () => {
      const service = buildService(VALID_KEY);
      const envelope = service.encrypt('rzp_test_version_check');
      const tampered = Buffer.from(envelope);
      tampered[0] = 99;

      expect(() => service.decrypt(tampered)).toThrow(
        CredentialDecryptionError,
      );
    });

    it('never includes the plaintext or ciphertext in a thrown error message', () => {
      const service = buildService(VALID_KEY);
      const envelope = service.encrypt('rzp_test_should_not_leak');
      const tampered = Buffer.from(envelope);
      tampered[tampered.length - 1] ^= 0xff;

      let message = '';
      try {
        service.decrypt(tampered);
      } catch (err) {
        message = (err as Error).message;
      }
      expect(message).not.toContain('rzp_test_should_not_leak');
    });
  });

  describe('missing/invalid master key — fails safely, no fallback', () => {
    it('throws on encrypt when the master key is unset', () => {
      const service = buildService(undefined);
      expect(() => service.encrypt('anything')).toThrow(
        /PAYMENT_CREDENTIALS_MASTER_KEY/,
      );
    });

    it('throws on decrypt when the master key is unset', () => {
      const service = buildService(undefined);
      const validEnvelope = buildService(VALID_KEY).encrypt('anything');
      expect(() => service.decrypt(validEnvelope)).toThrow(
        /PAYMENT_CREDENTIALS_MASTER_KEY/,
      );
    });

    it('throws when the key is the wrong byte length', () => {
      const shortKey = Buffer.alloc(16, 1).toString('base64'); // 16 bytes, not 32
      const service = buildService(shortKey);
      expect(() => service.encrypt('anything')).toThrow(
        /32 bytes/,
      );
    });

    it('throws when the key is not valid base64', () => {
      const service = buildService('not-base64-!!!***');
      expect(() => service.encrypt('anything')).toThrow(
        /PAYMENT_CREDENTIALS_MASTER_KEY/,
      );
    });

    it('never falls back to a hardcoded key — two "unconfigured" services never produce compatible output by accident', () => {
      // If a hardcoded fallback key existed, this would silently succeed
      // instead of throwing.
      expect(() => buildService(undefined).encrypt('x')).toThrow();
      expect(() => buildService('').encrypt('x')).toThrow();
      expect(() => buildService('   ').encrypt('x')).toThrow();
    });
  });
});
