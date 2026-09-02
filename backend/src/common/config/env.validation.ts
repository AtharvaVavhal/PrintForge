import { plainToInstance } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsString,
  Max,
  Min,
  validateSync,
} from 'class-validator';

/**
 * Fails fast at boot if required environment variables are missing or malformed,
 * instead of surfacing as an obscure runtime error later.
 *
 * Two tiers:
 *   1. `EnvironmentVariables` below — validated in every environment
 *      (development, test, production). These have no safe default.
 *   2. `PRODUCTION_REQUIRED_KEYS` — integration config that `configuration.ts`
 *      deliberately defaults to `''` so local dev and the test/CI environment
 *      run without real Razorpay / Cloudinary / Resend credentials (no such
 *      network call is reachable there — see `.github/workflows/ci.yml` and
 *      `test/e2e/support/`). Without this second tier a misconfigured
 *      production boot *succeeds* and only fails later in subtle ways: an
 *      empty-string webhook-secret HMAC compare, a `localhost` CORS origin,
 *      a broken upload or email call. Enforced only when `NODE_ENV=production`.
 *
 * Error messages name the variable only — never a value — so a secret can
 * never land in a boot log or crash report.
 *
 * See docs/ops/ENVIRONMENT.md for the full per-variable matrix.
 */
class EnvironmentVariables {
  @IsIn(['development', 'production', 'test'])
  NODE_ENV: string;

  @IsInt()
  @Min(1)
  @Max(65535)
  PORT: number;

  @IsString()
  @IsNotEmpty()
  DATABASE_URL: string;

  @IsString()
  @IsNotEmpty()
  JWT_ACCESS_SECRET: string;

  @IsString()
  @IsNotEmpty()
  REFRESH_TOKEN_SECRET: string;
}

/**
 * Required when — and only when — `NODE_ENV=production`.
 *
 * `SENTRY_DSN` is intentionally absent: `Sentry.init` in `main.ts` is guarded
 * by it and is a no-op when unset (§30). It is *recommended* in production but
 * not load-bearing, so it stays optional to avoid a hard boot failure over
 * error reporting. `PORT` / `DATABASE_URL` / the JWT secrets are already
 * enforced in every environment above and are not repeated here.
 */
export const PRODUCTION_REQUIRED_KEYS = [
  'RAZORPAY_KEY_ID',
  'RAZORPAY_KEY_SECRET',
  'RAZORPAY_WEBHOOK_SECRET',
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
  'RESEND_API_KEY',
  'EMAIL_FROM_ADDRESS',
  'FRONTEND_URL',
  'BACKEND_URL',
] as const;

/**
 * Returns a safe (value-free) message for every production-required key that
 * is missing or blank. A whitespace-only value counts as missing.
 */
function missingProductionKeys(config: Record<string, unknown>): string[] {
  return PRODUCTION_REQUIRED_KEYS.filter((key) => {
    const value = config[key];
    return typeof value !== 'string' || value.trim() === '';
  }).map((key) => `${key} is required in production`);
}

export function validateEnv(
  config: Record<string, unknown>,
): EnvironmentVariables {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  const messages = errors.map((e) =>
    Object.values(e.constraints ?? {}).join(', '),
  );

  if (validatedConfig.NODE_ENV === 'production') {
    messages.push(...missingProductionKeys(config));
  }

  if (messages.length > 0) {
    throw new Error(`Environment validation failed:\n${messages.join('\n')}`);
  }

  return validatedConfig;
}
