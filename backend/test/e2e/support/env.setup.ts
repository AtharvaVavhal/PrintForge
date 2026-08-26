import { config } from 'dotenv';
import { resolve } from 'path';

/**
 * Jest `setupFiles` entry (test/jest-e2e.json) — runs before any test
 * module (including AppModule) is imported, so `process.env.DATABASE_URL`
 * etc. are already pointed at the isolated printforge_test database by the
 * time ConfigModule.forRoot's own dotenv call runs inside Nest's bootstrap.
 * dotenv's default `override: false` means that internal call is a no-op
 * for every var already set here — see test/e2e/support/README.md.
 */
config({ path: resolve(__dirname, '../../../.env.test') });
