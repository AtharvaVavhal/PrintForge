# Production Smoke Test

Run after every production deploy, and in full after any restore or
infrastructure change.

**Marking:**
- **Automated** — covered by CI (`backend` unit + e2e, `frontend` unit) against a real Postgres / jsdom. Green CI ⇒ this behaviour is exercised, though not against production infra.
- **Manual** — a human must perform it against the live environment.
- **Not yet verified** — has never been done against production from this repo.

As of Phase 15.0 every **Manual** item below is **Not yet verified** in
production. CI status covers the **Automated** column only.

---

## Infrastructure

| # | Check | How | Marking |
|---|---|---|---|
| I1 | Frontend loads | `GET {FRONTEND_URL}/` → `200`, SPA renders | Manual |
| I2 | Backend process up | `GET {BACKEND_URL}/api/v1/health` → `200 {"status":"ok"}` | Manual (endpoint: Automated e2e `health.e2e-spec.ts`) |
| I3 | Backend DB reachable | `GET {BACKEND_URL}/api/v1/health/deep` → `200` | Manual (endpoint: Automated e2e) |
| I4 | Env validation active | Confirm boot logs show no validation error; a deliberately-missing var in staging exits with `... is required in production` | Manual (logic: Automated `env.validation.spec.ts`) |

## Authentication

| # | Check | Marking |
|---|---|---|
| A1 | Register a new customer → `201`, session established | Manual · Automated (`auth-security.e2e-spec.ts`) |
| A2 | Log in with those credentials → access token + refresh cookie set | Manual · Automated |
| A3 | Refresh: call `POST /api/v1/auth/refresh` with the cookie → new access token, cookie rotated | Manual · Automated |
| A4 | Logout → refresh cookie cleared; the old refresh token no longer works | Manual · Automated |
| A5 | Refresh cookie attributes in the browser: `HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/api/v1/auth/refresh` | Manual — see [DNS/cookie audit](#dns--cookie--cors) |

## Commerce

| # | Check | Marking |
|---|---|---|
| C1 | Product browsing: catalog list renders with live products | Manual · Automated (`product-search.e2e-spec.ts`) |
| C2 | Product detail: variants, customization fields, images render | Manual · Automated |
| C3 | Add to cart; cart persists across reload (same session) | Manual · Automated (`client.cart-concurrency.test.tsx`, checkout e2e) |
| C4 | Checkout validate: `POST /api/v1/checkout/validate` re-prices server-side | Manual · Automated (`checkout-security`, `checkout-concurrency`) |
| C5 | Checkout create: `POST /api/v1/checkout/orders` with `Idempotency-Key` → order in `PENDING_PAYMENT`; replay returns the same order | Manual · Automated |
| C6 | Coupon: apply a valid coupon, see discount; usage limit enforced | Manual · Automated (coupon specs) |

## Payment

**Gate:** only if live Razorpay credentials are configured **and** the
business owner has approved a real transaction.

| # | Check | Marking |
|---|---|---|
| P1 | Checkout → Razorpay live checkout opens with the correct amount | Manual — **Not yet verified** |
| P2 | Complete a small real payment | Manual — **Not yet verified** |
| P3 | `POST /api/v1/payments/verify` succeeds (HMAC) → order `PAID` | Manual · Automated HMAC path (`payments-race.e2e-spec.ts`) |
| P4 | Razorpay webhook delivered to `{BACKEND_URL}/api/v1/payments/webhook`; `webhook_events` row → `PROCESSED`/`IGNORED` | Manual · Automated (`webhook-retry.e2e-spec.ts`) |
| P5 | `payment_attempts` has exactly one `CAPTURED` row for the order | Manual · Automated (partial-unique-index tests) |
| P6 | Invoice generated (`GET /api/v1/orders/:id/invoice` or admin) with correct totals; `sellerSnapshot` reflects current settings | Manual · Automated (`tax-and-invoicing.e2e-spec.ts`) |
| P7 | Reconciliation cron does not double-process (check logs over one 5-min cycle) | Manual · Automated (`payment-reconciliation.e2e-spec.ts`) |

If P1/P2 are not performed, record in the deploy notes:
`LIVE PAYMENT SMOKE TEST: NOT PERFORMED — reason: <...>`

## Email

| # | Check | Marking |
|---|---|---|
| E1 | Order confirmation email received at the customer address | Manual — **Not yet verified** |
| E2 | `outbox_events` row for the order reaches `SENT` | Manual · Automated (outbox specs) |
| E3 | `From:` is `EMAIL_FROM_ADDRESS` on the verified Resend domain; not flagged as spam | Manual — **Not yet verified** |
| E4 | Password-reset email flow delivers a working link | Manual · Automated (logic) |

## Admin

**Gate:** an admin user must exist — see [`DEPLOYMENT.md`](./DEPLOYMENT.md) §8.

| # | Check | Marking |
|---|---|---|
| M1 | Admin login; non-admin is redirected/forbidden from `/admin/*` | Manual · Automated (`admin-control-plane.e2e-spec.ts`) |
| M2 | Dashboard: totals, orders-by-status, recent orders render | Manual · Automated (frontend unit) |
| M3 | Orders list + order detail; status transition (e.g. `PAID` → `CONFIRMED`) persists and appends to history | Manual · Automated (`order-status-transitions.e2e-spec.ts`) |
| M4 | Product management: create a product, add a variant/image, deactivate | Manual · Automated (frontend unit) |
| M5 | Store settings: read all groups; save one value; confirmation appears only after the PATCH resolves | Manual · Automated (`AdminSettingsPage.test.tsx`) |
| M6 | Review moderation (embedded in product detail): publish/reject a review | Manual · Automated |

## Upload

| # | Check | Marking |
|---|---|---|
| U1 | Admin uploads a product image → stored in Cloudinary, served on the storefront | Manual — **Not yet verified** |
| U2 | Non-image / spoofed file rejected (magic-byte validation) | Manual · Automated (`upload-magic-bytes.e2e-spec.ts`) |

## Security

| # | Check | Marking |
|---|---|---|
| S1 | HTTPS enforced on both `FRONTEND_URL` and `BACKEND_URL`; HTTP redirects or is refused | Manual — **Not yet verified** |
| S2 | Refresh cookie: `HttpOnly` + `Secure` + `SameSite=Strict`; not readable from JS | Manual |
| S3 | CORS: a request from an origin other than `FRONTEND_URL` is rejected; no `Access-Control-Allow-Origin: *` | Manual · Automated (config) |
| S4 | Security headers present (`helmet()` defaults) on API responses | Manual |
| S5 | No secrets in the frontend bundle: grep the deployed JS for `rzp_live`, `re_`, `cloudinary` secret patterns → none | Manual |
| S6 | Error responses carry no stack traces / connection strings / raw DB errors | Manual · Automated (`HttpExceptionFilter`) |
| S7 | `403`/`401` on admin endpoints without an admin token | Manual · Automated |

## DNS / cookie / CORS

Verify only once the production domain is actually cut over. See
[`DEPLOYMENT.md`](./DEPLOYMENT.md) and the notes below.

| # | Check | Marking |
|---|---|---|
| D1 | `FRONTEND_URL` and `BACKEND_URL` share the registrable domain `printforge.in` (e.g. `www.printforge.in` + `api.printforge.in`) | Manual — **Not yet verified** |
| D2 | With that setup, `SameSite=Strict` refresh cookie is sent on the refresh call and rotation works cross-subdomain | Manual — **Not yet verified** |
| D3 | If frontend and backend are **not** same-site (e.g. `*.vercel.app` + `*.onrender.com`), refresh will fail — cookie not sent. This is the known reason the domain cutover is a launch prerequisite. | — |
| D4 | Razorpay dashboard webhook URL updated to the new `BACKEND_URL` after cutover | Manual — **Not yet verified** |
