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
| `RESEND_API_KEY` | ⬜ | ⬜ | ✅ | Resend API key for transactional email dispatch (outbox poller). | `re_XXXXXXXX` (secret) | Render service env (secret) |
| `EMAIL_FROM_ADDRESS` | ⬜ | ⬜ | ✅ | `From:` address for all transactional email. Must be on a Resend-verified domain in production. | `no-reply@printforge.in` | Render service env |
| `CLOUDINARY_CLOUD_NAME` | ⬜ | ⬜ | ✅ | Cloudinary account cloud name (product image storage/delivery). | `printforge` | Render service env |
| `CLOUDINARY_API_KEY` | ⬜ | ⬜ | ✅ | Cloudinary API key. | numeric string | Render service env |
| `CLOUDINARY_API_SECRET` | ⬜ | ⬜ | ✅ | Cloudinary API secret (signs upload/delete). | opaque string (secret) | Render service env (secret) |
| `FRONTEND_URL` | ✅** | ✅** | ✅ | Exact storefront origin. Sole CORS allowed origin (`credentials: true`, never a wildcard). | `https://www.printforge.in` | Render service env |
| `BACKEND_URL` | ✅** | ✅** | ✅ | Public API origin. Used for absolute links and the Razorpay webhook URL. | `https://api.printforge.in` | Render service env |
| `SENTRY_DSN` | — | — | ⬜ recommended | Error tracking. `Sentry.init` is a **no-op when unset** — intentionally *not* enforced so error reporting can never block boot. | `https://xxx@oyyy.ingest.sentry.io/zzz` | Render service env |

Legend: ✅ required · ⬜ optional (has a safe empty default) · — not applicable / has a hard-coded default
\* CI's generated `.env.test` **does** set `RAZORPAY_KEY_SECRET` and `RAZORPAY_WEBHOOK_SECRET` to dummy values because `payments-race.e2e-spec.ts` exercises the real local HMAC path (no network call).
\** `FRONTEND_URL` / `BACKEND_URL` have `localhost` defaults in `configuration.ts` for dev convenience; they are Tier-2 (production-enforced) so a prod deploy cannot silently fall back to `localhost` CORS.

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
| `VITE_SITE_URL` | — | ⬜ | Public site origin for SEO canonical URLs, `og:url`, JSON-LD, `robots.txt`, `sitemap.xml`. Defaults to `https://www.printforge.in` when unset. Set for staging/preview hosts. | `https://printforge-staging.example.com` |
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
