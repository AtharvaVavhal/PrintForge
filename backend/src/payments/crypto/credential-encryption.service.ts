import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../../common/config/configuration';
import { resolvePaymentCredentialsMasterKey } from '../../common/config/payment-credentials-master-key';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12; // 96-bit, GCM-recommended nonce size
const AUTH_TAG_BYTES = 16;
/** Envelope format version — bumping this and adding a branch in
 * `decrypt()` is how a future key-rotation/format change stays compatible
 * with rows encrypted under an earlier version, per P8-D6's own rotation
 * note (docs/saas/DECISIONS.md P8-D6 Part E). */
const ENVELOPE_VERSION = 1;
const ENVELOPE_MIN_LENGTH = 1 + IV_BYTES + AUTH_TAG_BYTES;

/** Fail-closed marker for any decrypt-time failure — malformed input,
 * unsupported version, or a tampered/corrupted auth tag. Never carries the
 * underlying Node `crypto` error (which can include buffer contents) or
 * any plaintext/ciphertext material. */
export class CredentialDecryptionError extends Error {}

/**
 * Phase 8 (P8-D6/D9, RATIFIED) — the smallest dedicated AES-256-GCM
 * envelope-encryption utility for `PaymentAccount.credentialsEncrypted`.
 * Provider-agnostic by design: this class knows nothing about Razorpay or
 * any other provider's credential shape — it encrypts/decrypts opaque
 * UTF-8 strings. Callers decide what JSON goes in.
 *
 * One platform-wide master key (env `PAYMENT_CREDENTIALS_MASTER_KEY`,
 * base64, 32 bytes) encrypts/decrypts every row — resolved fresh on every
 * call via `resolvePaymentCredentialsMasterKey` (never cached as a class
 * field, never hardcoded, never defaulted). A fresh random IV is generated
 * for every single `encrypt()` call — two encryptions of the same
 * plaintext never produce the same ciphertext.
 *
 * Envelope layout: `[version:1 byte][iv:12 bytes][authTag:16 bytes]
 * [ciphertext:N bytes]`, stored as-is in the `Bytes` column. GCM's
 * authentication tag is preserved verbatim (never stripped/ignored) and
 * checked by `decipher.setAuthTag()` — any bit-flip in the ciphertext,
 * IV, or tag makes `decipher.final()` throw, which this class turns into
 * a generic `CredentialDecryptionError` (fail closed, no crypto internals
 * leaked).
 */
@Injectable()
export class CredentialEncryptionService {
  constructor(
    private readonly configService: ConfigService<AppConfig, true>,
  ) {}

  encrypt(plaintext: string): Buffer {
    const key = this.getKey();
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();
    return Buffer.concat([
      Buffer.from([ENVELOPE_VERSION]),
      iv,
      authTag,
      ciphertext,
    ]);
  }

  decrypt(envelope: Buffer): string {
    if (!Buffer.isBuffer(envelope) || envelope.length < ENVELOPE_MIN_LENGTH) {
      throw new CredentialDecryptionError('Malformed credential ciphertext');
    }
    const version = envelope[0];
    if (version !== ENVELOPE_VERSION) {
      throw new CredentialDecryptionError(
        `Unsupported credential envelope version: ${version}`,
      );
    }

    const key = this.getKey();
    const iv = envelope.subarray(1, 1 + IV_BYTES);
    const authTag = envelope.subarray(1 + IV_BYTES, ENVELOPE_MIN_LENGTH);
    const ciphertext = envelope.subarray(ENVELOPE_MIN_LENGTH);

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    try {
      const plaintext = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ]);
      return plaintext.toString('utf8');
    } catch {
      // GCM auth-tag mismatch (tampered/corrupted ciphertext) lands here.
      throw new CredentialDecryptionError(
        'Credential ciphertext failed authentication — rejected',
      );
    }
  }

  private getKey(): Buffer {
    const config = this.configService.get('paymentCredentials', {
      infer: true,
    });
    // Throws (never returns a fallback) on missing/malformed input — the
    // exact same function env.validation.ts's production boot check uses,
    // so the two can never disagree about what counts as a valid key.
    return resolvePaymentCredentialsMasterKey(config.masterKey);
  }
}
