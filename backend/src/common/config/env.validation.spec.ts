import 'reflect-metadata';
import { PRODUCTION_REQUIRED_KEYS, validateEnv } from './env.validation';

/**
 * Base config with the always-required variables set and every integration
 * secret deliberately unset — the shape local dev and CI actually run with.
 */
const BASE = {
  NODE_ENV: 'development',
  PORT: '4000',
  DATABASE_URL:
    'postgresql://user:pass@localhost:5432/printforge?schema=public',
  JWT_ACCESS_SECRET: 'dev-access-secret',
  REFRESH_TOKEN_SECRET: 'dev-refresh-secret',
};

/** Placeholder (non-secret) values for every production-required key. */
const PROD_INTEGRATION: Record<string, string> = {
  RAZORPAY_KEY_ID: 'rzp_live_placeholder',
  RAZORPAY_KEY_SECRET: 'placeholder',
  RAZORPAY_WEBHOOK_SECRET: 'placeholder',
  CLOUDINARY_CLOUD_NAME: 'printforge',
  CLOUDINARY_API_KEY: 'placeholder',
  CLOUDINARY_API_SECRET: 'placeholder',
  RESEND_API_KEY: 're_placeholder',
  EMAIL_FROM_ADDRESS: 'no-reply@printforge.in',
  FRONTEND_URL: 'https://www.printforge.in',
  BACKEND_URL: 'https://api.printforge.in',
};

describe('validateEnv', () => {
  it('accepts a development config with every integration secret unset', () => {
    expect(() => validateEnv({ ...BASE })).not.toThrow();
  });

  it('accepts a test config with every integration secret unset', () => {
    expect(() => validateEnv({ ...BASE, NODE_ENV: 'test' })).not.toThrow();
  });

  it('rejects any environment when an always-required secret is blank', () => {
    expect(() => validateEnv({ ...BASE, JWT_ACCESS_SECRET: '' })).toThrow(
      /JWT_ACCESS_SECRET/,
    );
  });

  it('rejects a production boot when integration variables are unset', () => {
    expect(() => validateEnv({ ...BASE, NODE_ENV: 'production' })).toThrow(
      /is required in production/,
    );
  });

  it('names every missing production variable', () => {
    let message = '';
    try {
      validateEnv({ ...BASE, NODE_ENV: 'production' });
    } catch (error) {
      message = (error as Error).message;
    }
    for (const key of PRODUCTION_REQUIRED_KEYS) {
      expect(message).toContain(`${key} is required in production`);
    }
  });

  it('never echoes a provided value back in the error message', () => {
    let message = '';
    try {
      validateEnv({
        ...BASE,
        NODE_ENV: 'production',
        RAZORPAY_KEY_SECRET: 'super-secret-do-not-log',
      });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).not.toContain('super-secret-do-not-log');
    // The one key that WAS supplied must not be reported as missing.
    expect(message).not.toContain('RAZORPAY_KEY_SECRET is required');
  });

  it('treats a whitespace-only production value as missing', () => {
    expect(() =>
      validateEnv({
        ...BASE,
        NODE_ENV: 'production',
        ...PROD_INTEGRATION,
        RESEND_API_KEY: '   ',
      }),
    ).toThrow(/RESEND_API_KEY is required in production/);
  });

  it('accepts a fully-configured production boot', () => {
    expect(() =>
      validateEnv({ ...BASE, NODE_ENV: 'production', ...PROD_INTEGRATION }),
    ).not.toThrow();
  });
});
