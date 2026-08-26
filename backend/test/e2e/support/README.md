# e2e test support

Phase 11 (§29) — the §27 release suite runs supertest against a real Nest
app and a real Postgres database, not mocks. This directory holds the
shared plumbing every `*.e2e-spec.ts` file uses.

## Setup

1. A `printforge_test` Postgres database must exist and be migrated:
   ```
   createdb printforge_test
   DATABASE_URL=postgresql://<user>@localhost:5432/printforge_test?schema=public \
     npx prisma migrate deploy
   ```
2. `backend/.env.test` holds the e2e environment (gitignored — see
   `.env.example` for the shape). It is loaded by `env.setup.ts` via
   `test/jest-e2e.json`'s `setupFiles`, before any test module — including
   `AppModule` — is imported, so `ConfigModule`'s own dotenv call inside
   Nest's bootstrap is a no-op for every var already set here (dotenv's
   default `override: false`).
3. Run with `npm run test:e2e`.

## Files

- `env.setup.ts` — loads `.env.test`.
- `test-app.ts` — builds one real Nest app per spec file (`createTestApp`),
  wired the same way `main.ts` does, with `CloudinaryService` swapped for
  `fake-cloudinary.service.ts` (network-free) and `ThrottlerGuard` stubbed
  out (irrelevant to §27, and every request here originates from loopback).
- `db.ts` — `resetDatabase` truncates every table between tests. Guarded to
  only ever run against a database whose name ends in `_test`, so a
  misconfigured `DATABASE_URL` can never truncate `printforge_dev`.
- `fixtures.ts` — registration/login, catalog fixtures, cart helpers, money
  conversion — shared across spec files.
- `razorpay-signing.ts` — signs webhook/verify payloads with the real HMAC
  the app itself uses, so payment tests exercise the real signature-check
  code path without calling the live Razorpay API.

## Conventions

- No hand-crafted JWTs — every token in the suite comes from a real
  `POST /auth/register`.
- `maxWorkers: 1` (`test/jest-e2e.json`) — these tests share one database,
  so files run serially. Within a file, genuinely concurrent requests use
  `Promise.all` against the same running app.
