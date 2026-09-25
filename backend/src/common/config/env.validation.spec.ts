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
  RAZORPAY_SAAS_KEY_ID: 'rzp_live_saas_placeholder',
  RAZORPAY_SAAS_KEY_SECRET: 'placeholder',
  RAZORPAY_SAAS_WEBHOOK_SECRET: 'placeholder',
  // 32 random bytes, base64 — a validly-SHAPED placeholder (not a real
  // secret; this exact value is also not used anywhere outside this test
  // file/`.env.test`, see ENVIRONMENT.md's own note on that distinction).
  PAYMENT_CREDENTIALS_MASTER_KEY:
    'MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MDE=',
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

  // ─── PAYMENT_CREDENTIALS_MASTER_KEY (P8-D6) ─────────────────────────

  // ─── Phase 9 (spec §5.2 / §7.3) — storefront domain variables ──────────

  describe('PLATFORM_STOREFRONT_DOMAIN / PLATFORM_CUSTOM_DOMAIN_CNAME_TARGET', () => {
    it.each([
      'PLATFORM_STOREFRONT_DOMAIN',
      'PLATFORM_CUSTOM_DOMAIN_CNAME_TARGET',
    ])('accepts a bare hostname for %s', (key) => {
      expect(() =>
        validateEnv({ ...BASE, [key]: 'stores.printforge.world' }),
      ).not.toThrow();
    });

    it('accepts a trailing dot (configuration.ts strips it)', () => {
      expect(() =>
        validateEnv({
          ...BASE,
          PLATFORM_STOREFRONT_DOMAIN: 'Stores.PrintForge.World.',
        }),
      ).not.toThrow();
    });

    it('stays optional in every environment when unset or blank', () => {
      for (const value of [undefined, '', '   ']) {
        expect(() =>
          validateEnv({ ...BASE, PLATFORM_STOREFRONT_DOMAIN: value }),
        ).not.toThrow();
      }
    });

    it.each([
      ['a scheme', 'https://stores.printforge.world'],
      ['a trailing path', 'stores.printforge.world/'],
      ['a wildcard', '*.stores.printforge.world'],
      ['a port', 'stores.printforge.world:443'],
      ['a single label', 'localhost'],
      ['an underscore', 'under_score.example'],
    ])('rejects %s', (_label, value) => {
      expect(() =>
        validateEnv({ ...BASE, PLATFORM_STOREFRONT_DOMAIN: value }),
      ).toThrow(/PLATFORM_STOREFRONT_DOMAIN must be a bare hostname/);
    });

    it('never echoes the offending value into the message (secret hygiene)', () => {
      let message = '';
      try {
        validateEnv({
          ...BASE,
          PLATFORM_STOREFRONT_DOMAIN: 'https://secret-host.example/path',
        });
      } catch (err) {
        message = (err as Error).message;
      }
      expect(message).toContain('PLATFORM_STOREFRONT_DOMAIN');
      expect(message).not.toContain('secret-host.example');
    });

    it('is deliberately NOT production-required yet — the §17.1 ops checklist gates that flip', () => {
      expect(PRODUCTION_REQUIRED_KEYS).not.toContain(
        'PLATFORM_STOREFRONT_DOMAIN',
      );
      expect(() =>
        validateEnv({ ...BASE, ...PROD_INTEGRATION, NODE_ENV: 'production' }),
      ).not.toThrow();
    });

    it('a malformed value still fails a PRODUCTION boot (format applies in every environment)', () => {
      expect(() =>
        validateEnv({
          ...BASE,
          ...PROD_INTEGRATION,
          NODE_ENV: 'production',
          PLATFORM_STOREFRONT_DOMAIN: 'https://stores.printforge.world',
        }),
      ).toThrow(/must be a bare hostname/);
    });
  });

  // ─── Phase 9 §7.3 — Vercel project-domain credentials ──────────────────

  describe('VERCEL_API_TOKEN / VERCEL_PROJECT_ID / VERCEL_TEAM_ID', () => {
    const PROD = { ...BASE, ...PROD_INTEGRATION, NODE_ENV: 'production' };
    const VERCEL = {
      VERCEL_API_TOKEN: 'token-placeholder-not-a-secret',
      VERCEL_PROJECT_ID: 'prj_placeholder',
    };

    it('stay optional in production while PLATFORM_STOREFRONT_DOMAIN is unset', () => {
      expect(() => validateEnv({ ...PROD })).not.toThrow();
    });

    it('become required in production once PLATFORM_STOREFRONT_DOMAIN is set', () => {
      expect(() =>
        validateEnv({
          ...PROD,
          PLATFORM_STOREFRONT_DOMAIN: 'stores.example.com',
        }),
      ).toThrow(
        /VERCEL_API_TOKEN is required in production when PLATFORM_STOREFRONT_DOMAIN is set/,
      );
    });

    it('names every missing one', () => {
      let message = '';
      try {
        validateEnv({
          ...PROD,
          PLATFORM_STOREFRONT_DOMAIN: 'stores.example.com',
        });
      } catch (err) {
        message = (err as Error).message;
      }
      expect(message).toContain('VERCEL_API_TOKEN');
      expect(message).toContain('VERCEL_PROJECT_ID');
    });

    it('accepts production with the platform domain AND the credentials set', () => {
      expect(() =>
        validateEnv({
          ...PROD,
          PLATFORM_STOREFRONT_DOMAIN: 'stores.example.com',
          ...VERCEL,
        }),
      ).not.toThrow();
    });

    it('VERCEL_TEAM_ID stays optional — it only applies to a team-owned project', () => {
      expect(() =>
        validateEnv({
          ...PROD,
          PLATFORM_STOREFRONT_DOMAIN: 'stores.example.com',
          ...VERCEL,
        }),
      ).not.toThrow();
      expect(PRODUCTION_REQUIRED_KEYS).not.toContain('VERCEL_TEAM_ID');
    });

    it('a whitespace-only credential counts as missing', () => {
      expect(() =>
        validateEnv({
          ...PROD,
          PLATFORM_STOREFRONT_DOMAIN: 'stores.example.com',
          VERCEL_API_TOKEN: '   ',
          VERCEL_PROJECT_ID: 'prj_placeholder',
        }),
      ).toThrow(/VERCEL_API_TOKEN is required in production/);
    });

    it('never echoes a credential value into the message', () => {
      let message = '';
      try {
        validateEnv({
          ...PROD,
          PLATFORM_STOREFRONT_DOMAIN: 'stores.example.com',
          VERCEL_PROJECT_ID: 'prj_super_secret_value',
        });
      } catch (err) {
        message = (err as Error).message;
      }
      expect(message).toContain('VERCEL_API_TOKEN');
      expect(message).not.toContain('prj_super_secret_value');
    });

    it('are not enforced outside production', () => {
      expect(() =>
        validateEnv({
          ...BASE,
          PLATFORM_STOREFRONT_DOMAIN: 'stores.example.com',
        }),
      ).not.toThrow();
    });
  });

  describe('PAYMENT_CREDENTIALS_MASTER_KEY', () => {
    it('does not require it outside production', () => {
      expect(() => validateEnv({ ...BASE })).not.toThrow();
      expect(() => validateEnv({ ...BASE, NODE_ENV: 'test' })).not.toThrow();
    });

    it('rejects a production boot when it is unset — no dev/default fallback', () => {
      expect(() =>
        validateEnv({
          ...BASE,
          NODE_ENV: 'production',
          ...PROD_INTEGRATION,
          PAYMENT_CREDENTIALS_MASTER_KEY: undefined,
        }),
      ).toThrow(/PAYMENT_CREDENTIALS_MASTER_KEY is required in production/);
    });

    it('rejects a production boot when it is present but the wrong length', () => {
      expect(() =>
        validateEnv({
          ...BASE,
          NODE_ENV: 'production',
          ...PROD_INTEGRATION,
          PAYMENT_CREDENTIALS_MASTER_KEY:
            Buffer.from('too-short').toString('base64'),
        }),
      ).toThrow(/PAYMENT_CREDENTIALS_MASTER_KEY is not a valid AES-256 key/);
    });

    it('rejects a production boot when it is not valid base64', () => {
      expect(() =>
        validateEnv({
          ...BASE,
          NODE_ENV: 'production',
          ...PROD_INTEGRATION,
          PAYMENT_CREDENTIALS_MASTER_KEY: 'not base64 at all !!! ***',
        }),
      ).toThrow(/PAYMENT_CREDENTIALS_MASTER_KEY is not a valid AES-256 key/);
    });

    it('never echoes the invalid value back in the error message', () => {
      let message = '';
      try {
        validateEnv({
          ...BASE,
          NODE_ENV: 'production',
          ...PROD_INTEGRATION,
          PAYMENT_CREDENTIALS_MASTER_KEY: 'super-secret-do-not-log',
        });
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message).not.toContain('super-secret-do-not-log');
    });
  });
});
