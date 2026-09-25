# Environment Variables

Authoritative list of every environment variable PrintForge reads, and when
each is required.

- **Boot enforcement:** `backend/src/common/config/env.validation.ts`.
  - Tier 1 (always): fails boot in **every** environment if missing/blank.
  - Tier 2 (`PRODUCTION_REQUIRED_KEYS`): fails boot **only when `NODE_ENV=production`**.
- Development and test (`NODE_ENV` = `development` / `test`) run fine with all
  Tier-2 variables unset — no Razorpay / Cloudinary / Resend network call is
  reachable in those environments (see `.github/workflows/ci.yml` and
  `backend/test/e2e/support/`).
- Validation error messages name the **variable only**, never a value.
- **Never commit real values.** `backend/.env`, `frontend/.env`, and any
  `.env.*` (except `*.env.example`) are git-ignored.

---

## Backend

| Variable | Dev | Test | Prod | Purpose | Example format | Provisioned in |
|---|:---:|:---:|:---:|---|---|---|
| `NODE_ENV` | ✅ | ✅ | ✅ | Runtime mode. Must be `development`, `test`, or `production`. Gates Tier-2 validation, throttler skip, Sentry environment tag. | `production` | Render service env |
| `PORT` | ✅ | ✅ | ✅ | HTTP listen port. Integer 1–65535. | `4000` | Render (injected) |
| `DATABASE_URL` | ✅ | ✅ | ✅ | PostgreSQL connection string. | `postgresql://USER:PASS@HOST:5432/DB?schema=public` | Render PostgreSQL add-on |
| `JWT_ACCESS_SECRET` | ✅ | ✅ | ✅ | HMAC secret for short-lived access tokens. Use a long random string. | 32+ random bytes, base64/hex | Render service env (secret) |
| `JWT_ACCESS_EXPIRES_IN` | — | — | — | Access-token TTL. Defaults to `15m`. | `15m` | Render service env (optional) |
| `REFRESH_TOKEN_SECRET` | ✅ | ✅ | ✅ | Secret associated with the opaque DB-backed refresh token. Distinct from the access secret. | 32+ random bytes | Render service env (secret) |
| `REFRESH_TOKEN_EXPIRES_IN` | — | — | — | Refresh-token / cookie lifetime. Defaults to `30d`. | `30d` | Render service env (optional) |
| `RAZORPAY_KEY_ID` | ⬜ | ⬜ | ✅ | Razorpay API key id. `rzp_test_*` in dev, `rzp_live_*` in production. Also returned to the browser per checkout. | `rzp_live_XXXXXXXXXXXXXX` | Render service env |
| `RAZORPAY_KEY_SECRET` | ⬜ | ⬜* | ✅ | Razorpay API key secret. Signs/verifies payment HMAC. | opaque string (secret) | Render service env (secret) |
| `RAZORPAY_WEBHOOK_SECRET` | ⬜ | ⬜* | ✅ | Verifies the `X-Razorpay-Signature` header on `POST /api/v1/payments/webhook`. | opaque string (secret) | Render service env (secret) **and** Razorpay dashboard webhook config |
| `RAZORPAY_SAAS_KEY_ID` | ⬜ | ⬜ | ✅ | Razorpay API key id for PrintForge's **own SaaS subscription billing** (Merchant → PrintForge → Razorpay Subscriptions) — a distinct account/key pair from the merchant-commerce `RAZORPAY_KEY_ID` above, never reused between the two. `rzp_test_*` in dev, `rzp_live_*` in production. | `rzp_live_XXXXXXXXXXXXXX` | Render service env |
| `RAZORPAY_SAAS_KEY_SECRET` | ⬜ | ⬜ | ✅ | Razorpay API key secret for SaaS subscription billing. Signs/verifies SaaS billing API requests. Distinct from `RAZORPAY_KEY_SECRET` (merchant commerce) — never reused. | opaque string (secret) | Render service env (secret) |
| `RAZORPAY_SAAS_WEBHOOK_SECRET` | ⬜ | ⬜ | ✅ | Verifies the `X-Razorpay-Signature` header on `POST /api/v1/webhooks/billing` (SaaS subscription billing webhooks only). Distinct from `RAZORPAY_WEBHOOK_SECRET` (merchant commerce, `POST /api/v1/payments/webhook`) — never reused. | opaque string (secret) | Render service env (secret) **and** Razorpay dashboard webhook config (SaaS account) |
| `PAYMENT_CREDENTIALS_MASTER_KEY` | ⬜*** | ✅*** | ✅ | Phase 8 (`docs/saas/DECISIONS.md` P8-D6): single platform-wide AES-256-GCM master key. Encrypts/decrypts every merchant `PaymentAccount.credentialsEncrypted` blob (`CredentialEncryptionService`). Base64, must decode to exactly 32 bytes. No default — missing/malformed fails boot in production (`env.validation.ts`) and fails closed at use-time everywhere else. Never a per-merchant key; no external KMS. | base64 of 32 random bytes, e.g. output of `openssl rand -base64 32` | Render service env (secret) |
| `RESEND_API_KEY` | ⬜ | ⬜ | ✅ | Resend API key for transactional email dispatch (outbox poller). | `re_XXXXXXXX` (secret) | Render service env (secret) |
| `EMAIL_FROM_ADDRESS` | ⬜ | ⬜ | ✅ | `From:` address for all transactional email. Must be on a Resend-verified domain in production. | `no-reply@printforge.in` | Render service env |
| `CLOUDINARY_CLOUD_NAME` | ⬜ | ⬜ | ✅ | Cloudinary account cloud name (product image storage/delivery). | `printforge` | Render service env |
| `CLOUDINARY_API_KEY` | ⬜ | ⬜ | ✅ | Cloudinary API key. | numeric string | Render service env |
| `CLOUDINARY_API_SECRET` | ⬜ | ⬜ | ✅ | Cloudinary API secret (signs upload/delete). | opaque string (secret) | Render service env (secret) |
| `FRONTEND_URL` | ✅** | ✅** | ✅ | The platform/admin console origin, and the CORS platform-admin origin — admitted in **both** resolution modes, and the **sole** allowed origin in `legacy_single_store` (🔎 S-9). ⚖️ **P9-D11:** it is **not** a customer-facing storefront hostname and gets **no** `StoreDomain` row, so under `host_resolution` storefront requests to it intentionally return the generic 404 while still receiving their CORS header — admission does not imply resolution (spec §4.1.3a). Customer storefronts are reached on `{store.slug}.stores.printforge.world` or a `VERIFIED`+`ISSUED` custom host. | `https://www.printforge.in` | Render service env |
| `BACKEND_URL` | ✅** | ✅** | ✅ | Public API origin. Used for absolute links and the Razorpay webhook URL. | `https://api.printforge.in` | Render service env |
| `PLATFORM_STOREFRONT_DOMAIN` | ⬜† | ⬜† | ⬜† **→ required at the Phase 9 ops cutover** | Phase 9 (`DECISIONS.md` P9-D6; spec §5.2). Base domain every store's always-on `PLATFORM_SUBDOMAIN` hostname is derived under: `{store-slug}.{this}`. Read by the host→store resolver's reserved-hostname check, by the merchant add-domain validation (a merchant may not claim a hostname under it), and by store provisioning. **Bare hostname only** — no scheme, port, path or wildcard (`env.validation.ts` rejects those in every environment). No default anywhere. | `stores.printforge.world` | Render service env |
| `PLATFORM_CUSTOM_DOMAIN_CNAME_TARGET` | ⬜ | ⬜ | ⬜ | Phase 9 (spec §6.3, §7.3). The CNAME target merchants are told to point a custom domain at, set by ops to the value the hosting provider defines — so no provider DNS name is ever hard-coded in the app. When unset, `CNAME` verification is refused at add time with a clear error and only `DNS_TXT` is offered; same bare-hostname rule as above. | `cname.vercel-dns.com` | Render service env |
| `SENTRY_DSN` | — | — | ⬜ recommended | Error tracking. `Sentry.init` is a **no-op when unset** — intentionally *not* enforced so error reporting can never block boot. | `https://xxx@oyyy.ingest.sentry.io/zzz` | Render service env |

Legend: ✅ required · ⬜ optional (has a safe empty default) · — not applicable / has a hard-coded default
\* CI's generated `.env.test` **does** set `RAZORPAY_KEY_SECRET` and `RAZORPAY_WEBHOOK_SECRET` to dummy values because `payments-race.e2e-spec.ts` exercises the real local HMAC path (no network call).
\** `FRONTEND_URL` / `BACKEND_URL` have `localhost` defaults in `configuration.ts` for dev convenience; they are Tier-2 (production-enforced) so a prod deploy cannot silently fall back to `localhost` CORS.
† `PLATFORM_STOREFRONT_DOMAIN` is **not** in `PRODUCTION_REQUIRED_KEYS` yet, deliberately. Spec §5.2 classes it Tier-2, but the four §17.1 ops-checklist items that provision it (registrar ownership of the domain, `*.<domain>` wildcard DNS, hosting-project configuration, API configuration) are still **unconfirmed** — promoting it to Tier-2 today would make the next production boot fail until ops sets it. The flip belongs to the ops-cutover wave, together with the checklist. Until then an unset value is a **documented, fail-closed degradation**, not a silent one: no `PLATFORM_SUBDOMAIN` row is provisioned for a new store (the bootstrap seed prints `subdomain SKIPPED` and says why), and a store with no such row simply does not resolve under `host_resolution`. A **present but malformed** value fails boot in every environment, including production.

‡ **`printforge.in` examples are the intended target, not current production.** `FRONTEND_URL`, `BACKEND_URL` and `VITE_API_BASE_URL` above show `www.printforge.in` / `api.printforge.in`. As of 2026-09-25 that cutover has **not** happened — `printforge.in` is registered but not delegated (`NXDOMAIN`), and production runs on the platform-provided Vercel and Render origins. The cutover remains a launch prerequisite: see `PRODUCTION-SMOKE-TEST.md` checks **D1–D3**, which also record why it matters for the `SameSite=Strict` refresh cookie. ⚖️ **P9-D10** moved Phase 9's Tenant #1 custom-domain canary to `www.printforge.world` and does **not** satisfy D1.

\*** `PAYMENT_CREDENTIALS_MASTER_KEY` is optional in dev (unset just means any `CredentialEncryptionService.encrypt`/`decrypt` call throws at that call site — nothing at boot) but a real, explicit test key IS committed in `backend/.env.test` (not a secret — test-only, never used outside the test/CI environment) because the P8-5 credential-encryption and payment-account-connection unit tests exercise real AES-256-GCM round trips. There is no dev/default fallback value baked into the app itself in either case.

### Master-key custody note (P8-D6, operational — not yet a formal runbook)

Restrict access to `PAYMENT_CREDENTIALS_MASTER_KEY` in Render exactly as
tightly as `JWT_ACCESS_SECRET` — its compromise exposes every merchant's
stored Razorpay credentials (the same blast-radius shape this application
already accepts for its other platform-wide secrets, not a new risk
category). Rotating it requires re-encrypting every `PaymentAccount` row —
a deliberate, controlled operation, not automatic (P8-D6 Part E); no such
rotation tooling exists yet.

### Not environment-configurable

- Throttler limits (`20 req / 60 s`) are static in `app.module.ts`.
- Cron cadence is fixed in each `@Cron` decorator.
- Cookie name/path (`pf_refresh_token`, `/api/v1/auth/refresh`) are constants.

---

## Frontend

Vite inlines `VITE_*` variables at **build time**. They are baked into the
static bundle — never put a secret in one.

| Variable | Dev | Prod build | Purpose | Example |
|---|:---:|:---:|---|---|
| `VITE_API_BASE_URL` | ✅ | ✅ | Base URL of the backend API (includes `/api/v1`). | `https://api.printforge.in/api/v1` |
| `VITE_SITE_URL` | — | ⬜ | Public site origin for SEO canonical URLs, `og:url`, JSON-LD. **No production default** — Phase 9 §10.1 removed `DEFAULT_SITE_URL`; when unset the origin is resolved at runtime from the served host (`canonicalOrigin`, else `window.location.origin`), because one deployment serves every store. `robots.txt`/`sitemap.xml` are served per-host by the backend (§12), not built from this. Set for staging/preview hosts. | `https://printforge-staging.example.com` |
| `VITE_RAZORPAY_KEY_ID` | ⬜ | ⬜ | Public Razorpay key id. **Currently not read** by the app — checkout uses the `razorpayKeyId` returned per `retry-payment` call. Kept for future use. | `rzp_live_XXXXXXXXXXXXXX` |

Provisioned in the Vercel project's Environment Variables (Production /
Preview / Development scopes).

---

## Pending business configuration (not env vars — admin settings)

These are stored in `app_settings` and edited via the admin **Store settings**
page, not the environment. They ship blank on purpose and must be supplied by
the business before GST-compliant operation. See
[`../architecture/`](../architecture/) and the Tax & GST section of the root
`Readme.md`.

| Setting key | Meaning | State |
|---|---|---|
| `tax.enabled` | Master GST switch | `false` |
| `tax.ratePercent` | Combined GST rate | blank — **pending client/accountant** |
| `tax.pricingMode` | INCLUSIVE (locked; EXCLUSIVE rejected server-side) | `INCLUSIVE` |
| `invoice.numberPrefix` | Invoice number prefix / statutory format | `INV-` — pending confirmation |
| `invoice.sellerLegalName` | Registered business name on invoices | blank — pending |
| `invoice.sellerAddress` | Registered business address | blank — pending |
| `invoice.sellerGstin` | Business GSTIN | blank — pending |
| `invoice.sellerState` | Place-of-supply state | blank — pending |

CGST/SGST/IGST split (`Order.taxBreakdown`) stays `null` until place-of-supply
rules are confirmed. **Do not enable GST with guessed values.**
