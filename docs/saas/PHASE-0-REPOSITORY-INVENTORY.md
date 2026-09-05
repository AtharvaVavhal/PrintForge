# PrintForge SaaS Phase 0 — Repository / Schema / Data Inventory

> **Mode:** READ-ONLY analysis. No source code, Prisma schema, migration, seed,
> environment file, dependency, or deployment configuration was changed by the task
> that produced this document.
>
> **Authoritative inputs (not modified, not redesigned):**
> `PRINTFORGE-SAAS-ARCHITECTURE-v1.0` (FROZEN),
> the APPROVED PrintForge SaaS Repository Gap Audit,
> `docs/saas/PRINTFORGE-SAAS-IMPLEMENTATION-MASTER-PLAN-v1.0.md` (APPROVED).
>
> This document executes **only Phase 0** of the approved master plan. It establishes the
> current-state baseline. It does **not** begin Phase 1.

---

## Document Control

| Field | Value |
|---|---|
| Document | PrintForge SaaS Phase 0 — Repository / Schema / Data Inventory |
| Version | 1.0 |
| Status | COMPLETE (analysis only — no code) |
| Date | 2026-09-05 |
| Repository | `AtharvaVavhal/PrintForge`, branch `main`, HEAD `b20c849` |
| Method | Direct file inspection of the working tree. Every repository-specific claim below was read from the actual file cited. |
| Prisma models inventoried | 25 / 25 |
| Backend modules inspected | 19 (`*.module.ts`: 15 domain + Razorpay sub-module + Prisma + Health + root `AppModule`) |
| Frontend areas inspected | 15 |
| Ownership classifications | 25 (one per model) |
| Explicit ambiguous / REQUIRES REVIEW items | 5 |
| Migration preconditions | 14 |
| Open decisions registered | 15 (D1–D13 carried from the master plan + P0-D14, P0-D15) |
| Live production data inspected | **No — not possible from the repository.** See §15. |

---

## 1. Executive Summary

### 1.1 What the repository is

PrintForge is a **single-tenant, single-store e-commerce application**, built to a *different*
frozen architecture (`docs/architecture/BLUEPRINT-v1.2.md`, "Architecture Freeze" 25 Aug 2026).

- **Backend** (`backend/`): NestJS 11 modular monolith. 15 domain modules + Prisma + Health
  under `src/`. 133 non-test `.ts` source files. One PostgreSQL database via Prisma 6
  (`schema.prisma`, 801 lines, **25 models, 12 enums**), **9 forward-only migrations**, one
  hand-added partial unique index.
- **Frontend** (`frontend/`): React 19 + Vite 8 + React Router 7 + TanStack Query 5 + Axios +
  React Hook Form + Zod + CSS Modules. 358 `.ts`/`.tsx` files (100 test files). Single-page
  app; one axios client; module-level auth store.
- **Infrastructure**: Backend → Render (one Node web service, one instance). Frontend →
  Vercel (static). DB → Render PostgreSQL (single, "sole source of truth"). No `Dockerfile`,
  no `render.yaml`, no IaC. CI: `.github/workflows/ci.yml` (hygiene + backend-with-real-Postgres
  + frontend).

### 1.2 What it does not have (verified against `schema.prisma` and `src/`)

- **No** `Tenant`, `Store`, `StoreDomain`, `TenantMembership`, `Plan`, `PlanFeature`,
  `PlanLimit`, `Usage`, `Subscription`, `PaymentAccount`, `LegalDocument`, `AcceptanceRecord`,
  or any platform-control-plane model.
- **No `tenantId` / `storeId` column on any of the 25 tables.**
- A **two-value** role enum — `Role { CUSTOMER, ADMIN }` (`schema.prisma:18`,
  `src/common/enums/role.enum.ts`). No `SUPER_ADMIN`, no membership, no permission concept.
- A **single global admin control plane**: one `@Controller('admin') @Roles(Role.ADMIN)`
  class (`src/admin/admin.controller.ts`); `AdminService.getDashboard()` runs **unscoped**
  `prisma.order.groupBy` / `aggregate` (sees every order in the database).
- A **single global** key–value settings table (`AppSetting`); store identity, shipping fee,
  GST config, and invoice seller identity are all **global rows**.
- **One Razorpay account**, read from `process.env` (`src/common/config/configuration.ts` →
  `razorpay.keyId/keySecret/webhookSecret`). No per-merchant payment context.
- Three in-process `@nestjs/schedule` cron pollers assuming **one backend instance**
  (`src/scheduler-registration.spec.ts` pins `ScheduleModule.forRoot()` to exactly one call
  site). No queue, no worker fleet — and `BLUEPRINT-v1.2.md §2` **permanently prohibits**
  Redis / Kafka / RabbitMQ / Bull/BullMQ / background-queue infrastructure "absent a formal
  Architecture Change Request".
- A single `PrismaService extends PrismaClient` (`src/common/database/prisma.service.ts`) with
  **no** client extension, middleware, or Row-Level-Security — no seam for tenant scoping.
- **Zero tenant-isolation tests** (there is no tenant).

### 1.3 What is high-quality and reusable

Server-authoritative pricing (`bigint` paise, `src/checkout/pricing/pricing.service.ts`);
compare-and-swap order state machine (`src/orders/state-machine/`); transactional outbox
(`src/notifications/outbox/`); two-phase idempotent webhook processing
(`src/payments/webhooks/`); active payment reconciliation
(`src/payments/payment-reconciliation.service.ts`); magic-byte upload validation
(`src/uploads/utils/file-signature.util.ts`); rotated / reuse-detecting refresh tokens
(`src/auth/auth.service.ts`); immutable per-order invoice snapshots
(`src/invoices/`). **None of this is disposable.** The gap is structural (tenancy, identity,
control-plane, entitlement), not qualitative.

### 1.4 Phase 0 conclusion

Every prerequisite the master plan lists for Phase 1 has been inventoried. The single hard
blocker before Phase 4 (data migration) is **external confirmation of whether the deployed
database holds real merchant/customer data** — this **cannot** be determined from the
repository (P0-D14 / master-plan D2). Phase 0 is **COMPLETE**; Phase 1 has **not** started.

---

## 2. Repository Baseline

### 2.1 Tree shape

```
backend/    NestJS 11 modular monolith.
  src/      admin, app-setting, auth, cart, checkout (+pricing, tax, idempotency),
            coupons, invoices, notifications (+email, outbox, templates),
            orders (+state-machine), payments (+razorpay, webhooks), postal,
            products (+categories, customizations), reviews, uploads, users,
            common (config, database/prisma, guards, decorators, health, filters,
            interceptors, constants, validation, enums).
  prisma/   schema.prisma (801 lines), migrations/ (9), seed.ts (stub),
            seed-production.ts, seed-storefront-preview.ts.
  test/     e2e/ (15 *.e2e-spec.ts + support/), integration/ (.gitkeep),
            unit/ (.gitkeep).
frontend/   React 19 + Vite 8 SPA.
  src/      App.tsx, pages/ (11 groups), features/ (9), components/ (ui, admin,
            home, layout), hooks/ (~70), services/api/ (axios client + 15 per-domain
            modules), seo/, layouts/, schemas/, types/, utils/, constants/.
docs/       architecture/ (BLUEPRINT-v1.2 + ARCHITECTURE-FREEZE + PHASE-10-PROPOSAL +
            SCAFFOLD-REPORT + history/), ops/ (DEPLOYMENT, BACKUP-RESTORE, ENVIRONMENT,
            PRODUCTION-SMOKE-TEST, DEPENDENCY-ADVISORIES), saas/ (the master plan + this).
.github/    workflows/ci.yml.
```

No `Dockerfile`, no `docker-compose*`, no `render.yaml`, no `*.tf`, no container/IaC manifest
anywhere in the tree (verified by `find`). `frontend/vercel.json` is the only deploy manifest
(SPA rewrite `/(.*) → /index.html`).

### 2.2 Frozen-architecture documents present in the repo

| Doc | Status | Relevance to SaaS work |
|---|---|---|
| `docs/architecture/BLUEPRINT-v1.2.md` | FROZEN (v1.2, 25 Aug 2026) | The architecture the current code was built to. §2 **permanently prohibits** Redis/queues/microservices absent an ACR. §29 development roadmap. ACR process = "joint Atharva+Harshad review". **Conflicts with SaaS v1.0's queue/worker tier → master-plan D1.** |
| `docs/architecture/ARCHITECTURE-FREEZE.md` | FROZEN summary | "20 tables" (schema has since grown to 25). Names the stack, the 3 cron pollers, "no queue, no worker fleet". |
| `docs/architecture/PHASE-10-PROPOSAL.md` | ACR (approved) | Added Reviews + Coupons after the original freeze — precedent that the ACR process is real and used. |
| `docs/saas/PRINTFORGE-SAAS-IMPLEMENTATION-MASTER-PLAN-v1.0.md` | APPROVED | The 16-phase roadmap this Phase 0 executes step 1 of. |

---

## 3. Backend Inventory

### 3.1 Modules (NestJS `@Module` wiring — `src/app.module.ts`)

Wiring order (acyclic, one-directional): `users, notifications, uploads, coupons, app-setting,
invoices` (base layer) → `products` → `cart` → `orders` → `payments` → `checkout` →
`postal` → `reviews` → `admin`, `auth`.

| Module | Path | Purpose | Notable cross-module deps |
|---|---|---|---|
| `AuthModule` | `src/auth/` | Register/login/refresh/logout/logout-all, password reset. JWT + opaque refresh. | `UsersModule`, `NotificationsModule`, `@nestjs/jwt` |
| `UsersModule` | `src/users/` | `GET/PATCH /users/me` — profile + single embedded shipping address. Ownership implicit (`@CurrentUser().id`, no `:id` param). | — |
| `ProductsModule` | `src/products/` (+`categories/`, `customizations/`) | Catalog CRUD + public read. Soft-delete via `isActive`. Denormalized `avgRating`/`reviewCount`. Customization-field validation. | `UploadsModule` |
| `UploadsModule` | `src/uploads/` (+`cloudinary/`) | Backend-proxied upload, magic-byte validation, Cloudinary two-tier folder scheme, signed vs public delivery. | — |
| `CartModule` | `src/cart/` (+`pricing/`) | One open cart per user (`carts.userId @unique`). Live price recompute. `getOwnedItemOrThrow`. | `products` (via `money.util` only) |
| `CheckoutModule` | `src/checkout/` (+`pricing/`, `tax/`, `idempotency/`) | Cart→Order in one transaction: idempotency claim, `SELECT cart FOR UPDATE`, pricing, tax split, coupon claim, snapshot writes, cart clear. | `orders`, `coupons` |
| `OrdersModule` | `src/orders/` (+`state-machine/`) | Post-creation CAS state machine, `OrderStatusHistory` audit, `generateOrderNumber` (global counter), customer + admin order reads, cancel + record-refund. | `notifications` |
| `PaymentsModule` | `src/payments/` (+`razorpay/`, `webhooks/`) | `POST /payments/verify` (HMAC), `POST /payments/webhook` (signed, `@Public()`). Two-phase webhook. Reconciliation cron. | `orders` (state machine), `RazorpayModule` |
| `InvoicesModule` | `src/invoices/` | One immutable invoice per order. Dedicated global `invoice_number_counter`. `sellerSnapshot` from global settings. | `app-setting` |
| `CouponsModule` | `src/coupons/` | Base-layer. `code` unique, atomic-CAS `usedCount`, per-user usage ledger, scope checks. | — |
| `ReviewsModule` | `src/reviews/` | Verified-purchase gate on `orderItemId` of a `DELIVERED` order. `(productId,userId)` unique. Moderation states. | `orders` |
| `NotificationsModule` | `src/notifications/` (+`email/`, `outbox/`, `templates/`) | `enqueueOutboxEvent(tx, …)`; `OutboxPoller` cron; `EmailService` (Resend) internal — only the poller calls it. | — |
| `AppSettingModule` | `src/app-setting/` | Single global KV table. Public read allowlist + admin-write allowlist with typed normalizers. | — |
| `PostalModule` | `src/postal/` | India PIN-code lookup (external provider, public default, non-blocking). | — |
| `AdminModule` | `src/admin/` | The **only** admin control plane. `@Controller('admin') @Roles(Role.ADMIN)`. Dashboard aggregates + customer reads + delegates order/review/coupon/settings mutations. | `orders`, `reviews`, `coupons`, `app-setting`, `invoices` |
| `RazorpayModule` | `src/payments/razorpay/` | Thin SDK wrapper. Credentials from `process.env`. `bigint` paise. HMAC verify. Error-shape translation for `razorpay@2.9.x`. | — |
| `PrismaModule` | `src/common/database/` | Global. `PrismaService extends PrismaClient` — **no extension / middleware / RLS**. | — |
| `HealthModule` | `src/common/health/` | `GET /health` (process), `GET /health/deep` (`SELECT 1`). Both `@Public()`. | — |
| `AppModule` | `src/app.module.ts` | Root. Global guards + interceptor + filter. Single `ScheduleModule.forRoot()`. | — |

### 3.2 Global request pipeline (`src/app.module.ts`, `src/main.ts`)

- **`APP_GUARD` (in order):** `ThrottlerGuard` (20 req / 60 s per IP; skipped when
  `NODE_ENV=test`) → `JwtAuthGuard` (every route protected unless `@Public()`) →
  `RolesGuard` (checks `@Roles()` metadata against `user.role` string).
- **`APP_INTERCEPTOR`:** `ResponseInterceptor` (envelope shape).
- **`APP_FILTER`:** `HttpExceptionFilter` (value-free error bodies).
- `main.ts`: `helmet()`, `cookieParser()`, `enableCors({ origin: FRONTEND_URL, credentials: true })`
  (exact origin, never wildcard), global `ValidationPipe({ whitelist, forbidNonWhitelisted,
  transform })`, `rawBody: true` (webhook signature), global prefix `api/v1`, Sentry init
  guarded by `SENTRY_DSN`.

### 3.3 Scheduled jobs — see §13 (Async Inventory).

### 3.4 Security-relevant backend constants (`src/common/constants/app.constants.ts`)

`API_PREFIX = 'api/v1'`; `REFRESH_TOKEN_COOKIE_NAME = 'pf_refresh_token'`;
`REFRESH_TOKEN_COOKIE_PATH = '/api/v1/auth/refresh'`; `BCRYPT_COST = 12`;
`LOGIN_DELAY_CURVE_MS = [0,1000,2000,5000,10000]`; `PASSWORD_RESET_TOKEN_TTL_MS = 30 min`;
`UPLOAD_MAX_BYTES = 10 MiB`; `UPLOAD_ALLOWED_MIME_TYPES = [png, jpeg, pdf]`.

---

## 4. Frontend Inventory

| Area | Files | Current state (verified) | Single-store assumption |
|---|---|---|---|
| Routing | `src/App.tsx`, `src/constants/routes.ts` | `<BrowserRouter>` with two trees: storefront under `<RootLayout>` (public + `<ProtectedRoute>` group) and `/admin/*` under `<AdminRoute>` → `<AdminLayout>` (separate shell). Path constants centralized. | One route tree, one catalog, no store segment in any path. |
| Auth state | `src/services/api/authStore.ts`, `src/features/auth/AuthProvider.tsx`, `authContext.ts` | Module-level store (`accessToken` in memory only, never `localStorage`), surfaced to React via `useSyncExternalStore`. Bootstrap `POST /auth/refresh` on mount. Status: `loading|authenticated|unauthenticated`. `PublicUser` carries `{id,email,role,createdAt}`. | `role` is the only authorization datum; no membership, no active-tenant, no store. |
| API client | `src/services/api/client.ts` | One axios instance, `baseURL = import.meta.env.VITE_API_BASE_URL`, `withCredentials: true`. Single-flight `refreshSession()` promise shared with bootstrap. 401 → refresh → retry-once (`_retry` flag). | Single fixed backend origin; no host/tenant header. |
| TanStack Query | `src/services/queryClient.ts`, `src/constants/query.ts` | One `QueryClient`, `retry: 1`, **no** global `staleTime`. `CATALOG_STALE_TIME_MS = 5 min` used per-query. | — |
| Query keys | `src/hooks/*` (~70 hooks) | Ad-hoc arrays: `['products','list',params]`, `['products','detail',slug]`, `['categories','tree']`, `['cart']`, `['orders','list',params]`, `['order',id]`, `['admin','orders','list',params]`, `['admin','customers',id]`, `['admin','settings']`, `['settings','storeName']`, `['homepage','settings']`, `['invoice',orderId]`, `['invoice','admin',orderId]`, `['postal-code',code]`, … | **No store/tenant segment in any key.** A store switch would serve stale cross-store data. |
| Storefront | `src/pages/{home,catalog,cart,checkout,orders,account,static}`, `src/features/{catalog,cart,checkout,customization,orders,reviews}`, `src/components/{home,layout,ui}` | Full customer flow: browse → customize → upload → cart → coupon → checkout → Razorpay → track → review. | One store, one theme, one homepage config source (`GET /settings`). |
| Admin UI | `src/pages/admin/*` (10 pages), `src/features/admin/*`, `src/components/admin/*`, `src/layouts/AdminLayout.tsx`, `src/components/admin/AdminSidebar.tsx` | Dashboard, orders, customers, products, categories, coupons, settings. Separate shell (no storefront chrome) since Phase 14.1. | Operates on all data; no tenant scoping in UI or API calls. |
| Checkout / payment flow | `src/pages/checkout/CheckoutPage.tsx`, `src/features/checkout/{useRazorpayCheckout,ShippingForm,CouponForm,PriceBreakdown}`, `src/services/razorpay/loadRazorpayCheckout.ts`, `src/hooks/{useCreateOrder,useValidateCheckout,useRetryPayment,useVerifyPayment,useCheckoutPreview}` | `Idempotency-Key` header on order create; Razorpay Checkout.js loaded from CDN (CSP-pinned); `razorpayKeyId` taken from the per-call `retry-payment` response, **not** a `VITE_` var. | Single platform Razorpay key. |
| Account | `src/pages/account/AccountPage.tsx`, `src/features/account/ProfileForm.tsx`, `src/hooks/{useCurrentUser,useUpdateProfile}` | `GET/PATCH /users/me`. Single embedded address. | Global `User` identity; a shopper and a would-be merchant are the same table. |
| Settings (storefront-facing) | `src/hooks/{useStoreName,useHomepageSettings}`, `src/services/api/settings.ts` | `useStoreName()` reads `GET /settings` `storeName`, falls back to `'PrintForge'`. `useHomepageSettings()` → `['homepage','settings']`. | The one existing seam toward store-aware chrome — everything else is hard single-store. |
| Uploads / customization | `src/features/customization/*`, `src/hooks/useUploadFile.ts`, `src/services/api/uploads.ts` | `POST /uploads` multipart; returns `{id,url,…}`. Customization fields render per product. | No per-tenant asset namespace on the client. |
| SEO | `src/seo/{Seo.tsx,siteConfig.ts,siteConfig.constants.ts,seoFiles.ts,jsonLd.ts}` | React-19 native `<title>`/`<meta>` via `<Seo>` per route. `SITE_URL` from `VITE_SITE_URL` **or hard-coded `DEFAULT_SITE_URL = 'https://www.printforge.in'`**. `seoFiles.ts` emits `robots.txt`/`sitemap.xml` **at build time** from that single origin; `STATIC_PUBLIC_PATHS` is a hard-coded list (no product/category URLs). | Single origin, single sitemap, single robots — baked at build time. |
| Layouts | `src/layouts/{RootLayout,AdminLayout,Header,HeaderSearch,Footer}.tsx` | Storefront chrome vs admin shell fully separated at the route level. | Header/footer store name via `useStoreName()`; rest static. |
| Components | `src/components/ui/*` (~30 primitives), `home/*`, `layout/*`, `admin/*` | Shared `Button/Modal/TextField/Skeleton/EmptyState/ErrorState/FullPageLoader/Pagination/Stars/…`. CSP pinned in `index.html`, tested by `src/index-csp.test.ts`. | Design-system-level, tenant-agnostic — reusable as-is. |
| Tests | 100 `*.test.ts(x)` (Vitest + jsdom + Testing Library + `axios-mock-adapter`) | Component + hook + api-client + CSP + SEO coverage. | No multi-store / multi-tenant test anywhere. |

---

## 5. Infrastructure Inventory

### 5.1 Package files

| File | Key facts |
|---|---|
| `backend/package.json` | NestJS 11, Prisma 6.19, `@nestjs/schedule` 5, `@nestjs/throttler` 6, `@sentry/node` 10, `bcrypt` 5, `razorpay` ^2.9.5, `cloudinary` 2.5, `resend` 4, `passport-jwt` 4. Scripts: `prisma:migrate:deploy`, `prisma:seed` (stub), `prisma:seed:storefront-preview`. Jest for unit (`src/**/*.spec.ts`), separate `test/jest-e2e.json`. |
| `frontend/package.json` | React 19.2, Vite 8.2, React Router 7.18, TanStack Query 5.102, Axios ^1.19, RHF 7.86, Zod 4.4, `lucide-react`. `build = tsc -b && vite build`. `test = vitest run`. |
| `backend/package-lock.json`, `frontend/package-lock.json` | Committed; CI uses `npm ci`. |

### 5.2 CI/CD (`.github/workflows/ci.yml`)

- Triggers: `pull_request`, `push` to `develop`/`main`. Node 22 (both jobs).
- **hygiene job:** `git diff --check` for whitespace/conflict markers on the introduced diff.
- **backend job:** `postgres:16` service container (`printforge_ci_test`); `npm ci`;
  `npm audit --omit=dev` (advisory, `continue-on-error`); `prisma generate`;
  `prisma migrate deploy`; `lint`; `build`; unit `test`; generates `.env.test` (only Tier-1
  vars + two dummy Razorpay secrets); e2e `test:e2e` (serial, real Postgres).
- **frontend job:** `npm ci`; `npm audit --omit=dev --audit-level=high` (blocking);
  `lint`; `build` (`VITE_API_BASE_URL` dummy); `test`.
- **No deploy job.** **No staging deploy.** **No isolation / RBAC-negative / security suite.**

### 5.3 Deployment assumptions (`docs/ops/DEPLOYMENT.md`, `BACKUP-RESTORE.md`, `ENVIRONMENT.md`, `Readme.md`)

- Backend → **Render, one Node web service, one instance**. Frontend → Vercel static.
  DB → **Render PostgreSQL, single, "sole source of truth"**.
- Deploy = `git push` to `develop`/`main` (auto) or manual. Build: `npm ci && prisma generate
  && nest build`. Migrations: `prisma migrate deploy` (**forward-only — Prisma has no
  down-migrations**, `DEPLOYMENT.md §11`). Start: `node dist/main`.
- Boot-time env validation (`src/common/config/env.validation.ts`): Tier 1 always
  (`NODE_ENV`, `PORT`, `DATABASE_URL`, `JWT_ACCESS_SECRET`, `REFRESH_TOKEN_SECRET`); Tier 2
  when `NODE_ENV=production` (`RAZORPAY_KEY_ID/KEY_SECRET/WEBHOOK_SECRET`,
  `CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM_ADDRESS`,
  `FRONTEND_URL`, `BACKEND_URL`). `SENTRY_DSN` optional.
- Health: `GET /api/v1/health` (process), `GET /api/v1/health/deep` (DB `SELECT 1`, 503 on
  failure with value-free body).
- **No staging environment. No containers / IaC.** `SameSite=Strict` refresh cookie assumes
  frontend + backend share a registrable domain — **DNS cutover to `printforge.in` has not
  happened** (`Readme.md` "Project Status").
- **Backup/restore doc status: "DOCUMENTED — NOT VERIFIED. No restore has been performed or
  tested."** Render backup cadence/retention/PITR **unconfirmed**. RTO **undefined**.
- First admin is promoted by a manual `UPDATE users SET role='ADMIN'` (`DEPLOYMENT.md §8`).

### 5.4 Frontend deploy manifest (`frontend/vercel.json`)

`framework: vite`, `buildCommand: npm run build`, `outputDirectory: dist`, SPA rewrite
`/(.*) → /index.html`. `vite.config.ts` emits `robots.txt` + `sitemap.xml` at build time from
`VITE_SITE_URL || DEFAULT_SITE_URL`.

### 5.5 Content-Security-Policy (`frontend/index.html`, tested by `src/index-csp.test.ts`)

`default-src 'self'`; `script-src 'self' https://checkout.razorpay.com https://cdn.razorpay.com`;
`style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`; `img-src 'self' data: https:`;
`connect-src 'self' https: http://localhost:4000 http://127.0.0.1:4000`;
`font-src 'self' https://fonts.gstatic.com`; `frame-src https://checkout.razorpay.com
https://api.razorpay.com`. No `unsafe-eval`, no wildcard in script/frame/default-src.

---

## 6. Complete Prisma Model Inventory

Source: `backend/prisma/schema.prisma` (801 lines) + `migrations/20260825190725_init/migration.sql`
+ later migrations. **Target owner** is derived from the frozen architecture + the approved
master plan (§3.16); it is a planning classification, **not** an instruction to implement.

Legend for the compact columns: **T?/S?/P?** = plausibly Tenant- / Store- / Platform-owned in
the target model. **Tk?/Sk?** = does a tenant / store key exist *today*? (always **No** — no
such column exists on any table).

---

### 6.1 Identity & Auth

#### `User` — `@@map("users")`
- **Current purpose:** Global identity for every human — shoppers (`role=CUSTOMER`, the
  default) and the single operator (`role=ADMIN`). Holds password hash, `tokenVersion`,
  `failedLoginAttempts`, password-reset token fields, one embedded shipping address
  (`addressLine1..country`, `phone`), `isActive`.
- **Current owner:** none (global root). **Target owner:** **PLATFORM** (central identity) —
  **but** storefront-customer identity is store-scoped in the frozen model → **REQUIRES REVIEW**
  (see §7, P0-D15 / master-plan D5).
- **Primary relationships:** `1:1 Cart`; `1:N Order`, `RefreshToken`, `UploadedFile`
  (`uploadedByUserId`), `Review`, `IdempotencyKey`, `Coupon` (`createdByAdminId`),
  `CouponUsage`, `OrderStatusHistory` (`changedByUserId`).
- **FKs out:** none. **FKs in:** 9 relations, almost all `ON DELETE RESTRICT`
  (`orders.userId`, `refresh_tokens.userId`, `uploaded_files.uploadedByUserId`,
  `reviews.userId`, `coupons.createdByAdminId`, `coupon_usages.userId`);
  `order_status_history.changedByUserId` is `SET NULL`.
- **Tk?/Sk?:** No / No. **Unique:** `email`. **Indexes:** (PK only; `email` unique index).
- **Migration risk:** **HIGH.** Splitting merchant identity from customer identity touches
  auth, every ownership check, and the largest data backfill. Embedded address must move to a
  customer/order context.
- **Notes:** `tokenVersion` only ever increments. `JwtStrategy.validate()` re-reads the row
  live on every request — so a role change takes effect without re-login (used by the e2e
  `promoteToAdmin` fixture).

#### `RefreshToken` — `@@map("refresh_tokens")`
- **Current purpose:** Opaque session token, hashed at rest, rotated on every use,
  family-revoked on reuse detection. `revokedAt`, `replacedByTokenId`.
- **Owner:** per-`User`. **Target:** **PLATFORM** (session is global to identity).
- **Relationships:** `N:1 User` (RESTRICT). **Unique:** none. **Indexes:** `(userId)`, `(tokenHash)`.
- **Migration risk:** LOW. Token *payload* gains server-derived context in Phase 2; the table
  itself is unchanged. If a separate customer-auth table is introduced (P0-D15), a parallel
  `CustomerRefreshToken` is added rather than altering this.

---

### 6.2 Catalog

#### `Category` — `@@map("categories")`
- **Purpose:** Flat, one nesting level (`parentCategoryId` self-FK, `SET NULL`). `isActive`
  soft-delete. Public storefront shows only active.
- **Owner:** none (global). **Target:** **STORE-owned** (tenant-owned via store).
- **Relationships:** self `1:N` (`CategoryToCategory`); `1:N Product`, `Coupon`.
- **FKs:** `parentCategoryId → categories.id` `SET NULL`. **Unique:** `slug` (global).
  **Indexes:** `(parentCategoryId)`.
- **Migration risk:** **MEDIUM.** `slug` unique must become `(storeId, slug)`; self-parent FK
  must be constrained same-store; every child `Product` must inherit the same store.

#### `Product` — `@@map("products")`
- **Purpose:** Catalog item. `basePrice Decimal(10,2)`, `minQuantity`, `maxQuantity?`,
  `specifications Json?`, `isActive`. Denormalized `avgRating Decimal(3,2)?` + `reviewCount`
  (recomputed inside the review transaction, never at read time).
- **Owner:** none. **Target:** **STORE-owned.**
- **Relationships:** `N:1 Category` (RESTRICT); `1:N ProductImage`, `ProductVariant`,
  `CustomizationField`, `CartItem`, `OrderItem`, `Review`.
- **FKs:** `categoryId → categories.id` RESTRICT. **Unique:** `slug` (global).
  **Indexes:** `(categoryId)`.
- **Migration risk:** **MEDIUM.** `slug` → `(storeId, slug)`; `categoryId` FK must be a
  composite same-store FK; public product routing is by slug (frontend `['products','detail',slug]`).

#### `ProductImage` — `@@map("product_images")`
- **Purpose:** `cloudinaryPublicId`, denormalized `resourceType`/`deliveryType` (so read paths
  build a URL with no join), `sortOrder`, `isPrimary`.
- **Owner:** via `Product`. **Target:** **STORE-owned** (inherit through `productId`;
  add `tenantId`/`storeId` for index efficiency + defence-in-depth).
- **Relationships:** `N:1 Product` (RESTRICT). **Unique:** none. **Indexes:** `(productId)`.
- **Migration risk:** LOW (transitive owner).

#### `ProductVariant` — `@@map("product_variants")`
- **Purpose:** Concrete purchasable combination. `label`, `priceDelta Decimal(10,2)`,
  `isAvailable`.
- **Owner:** via `Product`. **Target:** **STORE-owned.**
- **Relationships:** `N:1 Product` (RESTRICT); `1:N CartItem`.
- **Unique:** `(productId, label)` — already tenant-safe once `productId` is. **Indexes:** `(productId)`.
- **Migration risk:** LOW.

#### `CustomizationField` — `@@map("customization_fields")`
- **Purpose:** Per-product field definition. `type` (`CustomizationFieldType`), `isRequired`,
  `sortOrder`, `helpText?`, `constraints Json?`, `surchargeType`/`surchargeAmount Decimal(10,2)`
  (pricing-critical → typed columns, not JSON).
- **Owner:** via `Product`. **Target:** **STORE-owned.**
- **Relationships:** `N:1 Product` (RESTRICT); `1:N CartItemCustomization`. **Indexes:** `(productId)`.
- **Migration risk:** LOW.

---

### 6.3 Uploads / Assets

#### `UploadedFile` — `@@map("uploaded_files")`
- **Purpose:** Metadata for one Cloudinary asset. `uploadedByUserId` **non-nullable** (login
  precedes upload). `format`, `bytes`, `resourceType`, `deliveryType` (`upload` = public CDN /
  `authenticated` = signed). No `visibility`, no `kind` (customer-original vs production-output).
- **Owner:** per-`User` uploader. **Target:** **TENANT-owned Asset** (add `tenantId`, and
  `storeId` where store-scoped; `visibility` public/private; `kind`; `uploadedByUserId` →
  nullable / `customerId`).
- **Relationships:** `N:1 User` (RESTRICT); `1:N CartItemCustomization`, `OrderItemCustomization`.
- **Unique:** `cloudinaryPublicId`. **Indexes:** `(uploadedByUserId)`.
- **Migration risk:** **MEDIUM.** Every asset must resolve to a tenant; folder scheme is
  `printforge/{NODE_ENV}/customizations/{userId}` today — a per-tenant prefix is needed;
  `OrderItemCustomization.uploadedFileId` is `RESTRICT` (referenced assets never orphan-cleaned)
  and there is **no orphan-cleanup poller** (only a `TODO(uploads): destroy()` comment).

---

### 6.4 Cart

#### `Cart` — `@@map("carts")`
- **Purpose:** One open cart per user. `userId @unique`.
- **Owner:** per-`User`. **Target:** **STORE-owned** (`(storeId, customerId)` unique — one
  open cart per customer per store).
- **Relationships:** `1:1 User` (RESTRICT); `1:N CartItem`. **Unique:** `userId`. **Indexes:** (unique only).
- **Migration risk:** **MEDIUM.** `userId @unique` → composite; `userId` → `customerId` if
  customer identity is split.

#### `CartItem` — `@@map("cart_items")`
- **Purpose:** Line. Duplicate lines allowed by design. `quantity`, optional `variantId`.
- **Owner:** via `Cart`. **Target:** **STORE-owned** (inherit; composite FKs to same-store
  product/variant).
- **Relationships:** `N:1 Cart` (RESTRICT), `Product` (RESTRICT), `ProductVariant?` (RESTRICT);
  `1:N CartItemCustomization`. **Indexes:** `(cartId)`.
- **Migration risk:** LOW–MEDIUM (composite FK work).

#### `CartItemCustomization` — `@@map("cart_item_customizations")`
- **Purpose:** One submitted customization value. `textValue?`, `uploadedFileId?`. Upload
  ownership re-verified at write time (`customization-validation.service.ts:46` —
  `file.uploadedByUserId !== requestingUserId`).
- **Owner:** via `CartItem`. **Target:** **STORE-owned** (transitive).
- **Relationships:** `N:1 CartItem` (RESTRICT), `CustomizationField` (RESTRICT),
  `UploadedFile?` (`SET NULL`). **Unique:** none. **Indexes:** none (⚠ no index on `cartItemId`).
- **Migration risk:** LOW.

---

### 6.5 Orders & Commerce

#### `Order` — `@@map("orders")`
- **Purpose:** Immutable order. `orderNumber @unique` (global `PF-000001` counter). `status`
  (`OrderStatus`, CAS-only). Money: `subtotal`, `shippingFee`, `total`, `discountAmount`
  (all `Decimal(10,2)`), `currency` default `INR`. Coupon snapshot (`couponId?`, `couponCode?`,
  `discountAmount`). Tax snapshot (`taxMode` default `INCLUSIVE`, `taxableAmount`, `taxAmount`,
  `taxRateSnapshot Decimal(5,4)?`, `taxBreakdown Json?`). `razorpayOrderId? @unique`. Immutable
  shipping snapshot (`shippingRecipientName..shippingCountry`), copied from `User` at creation.
- **Owner:** per-`User`. **Target:** **STORE-owned** (add `tenantId`+`storeId`+`customerId`;
  `orderNumber` → `(tenantId, orderNumber)` with a per-tenant counter).
- **Relationships:** `N:1 User` (RESTRICT), `Coupon?` (`SET NULL`); `1:N OrderItem`,
  `PaymentAttempt`, `OrderStatusHistory`; `0:1 Invoice`, `IdempotencyKey`, `CouponUsage`.
- **Unique:** `orderNumber`, `razorpayOrderId`. **Indexes:** `(userId)`, `(status)`, `(couponId)`.
- **Migration risk:** **HIGH.** Ownership re-point + per-tenant numbering + composite coupon FK;
  the aggregate root for most commerce data.

#### `Invoice` — `@@map("invoices")`
- **Purpose:** One immutable invoice per order (`orderId @unique` → idempotent creation).
  Every monetary field a snapshot of the order's already-immutable columns. `invoiceNumber
  @unique` from a **dedicated global** counter (`invoice_number_counter` in `app_settings`).
  `sellerSnapshot Json` frozen from **global** admin settings
  (`invoice.sellerLegalName/Address/Gstin/State`).
- **Owner:** via `Order`. **Target:** **TENANT-owned** (`invoiceNumber` → `(tenantId,
  invoiceNumber)`; per-tenant counter + prefix; `sellerSnapshot` from tenant settings).
- **Relationships:** `1:1 Order` (RESTRICT). **Unique:** `invoiceNumber`, `orderId`.
  **Indexes:** `(issuedAt)`.
- **Migration risk:** **MEDIUM–HIGH** (statutory GST numbering per jurisdiction → REQUIRES
  QUALIFIED LEGAL REVIEW, master-plan D10).

#### `OrderItem` — `@@map("order_items")`
- **Purpose:** Snapshotted line — `productNameSnapshot`, `variantLabelSnapshot?`,
  `unitPriceSnapshot`, `quantity`, `lineTotal`. `productId?` (`SET NULL`).
- **Owner:** via `Order`. **Target:** **STORE-owned** (transitive).
- **Relationships:** `N:1 Order` (RESTRICT), `Product?` (`SET NULL`); `1:N OrderItemCustomization`,
  `Review`. **Indexes:** `(orderId)`.
- **Migration risk:** LOW.

#### `OrderItemCustomization` — `@@map("order_item_customizations")`
- **Purpose:** Snapshot of the field label + `textValue?` + `uploadedFileId?` purchased.
- **Owner:** via `OrderItem`. **Target:** **STORE-owned** (transitive).
- **Relationships:** `N:1 OrderItem` (RESTRICT), `UploadedFile?` (**RESTRICT** — referenced
  assets never orphan-cleaned). **Unique/Indexes:** none (⚠ no index on `orderItemId`).
- **Migration risk:** LOW.

#### `PaymentAttempt` — `@@map("payment_attempts")`
- **Purpose:** One attempt against an order (replaces a `payments` table). `razorpayOrderId`,
  `razorpayPaymentId? @unique`, `amountPaise BigInt`, `status` (`PaymentAttemptStatus`),
  `failureCode?/failureReason?/method?`, `rawPayload Json?`, `capturedAt?`.
- **Owner:** via `Order` — **commerce payment.** **Target:** **TENANT-owned** (add `tenantId`
  + `paymentAccountId`).
- **Relationships:** `N:1 Order` (RESTRICT); `1:N Refund`. **Unique:** `razorpayPaymentId`;
  **partial unique** `payment_attempts_order_captured_unique ON ("orderId") WHERE status =
  'CAPTURED'` (hand-added SQL in the init migration — "≤1 captured attempt per order").
  **Indexes:** `(orderId)`.
- **Migration risk:** **MEDIUM.** Credentials/verification move from a global env account to a
  per-`PaymentAccount` context; the partial unique is unchanged.

#### `Refund` — `@@map("refunds")`
- **Purpose:** Records a refund against a captured `PaymentAttempt`. `razorpayRefundId?
  @unique`, `amountPaise BigInt`, `status` (`RefundStatus`), `reason?/failureReason?`.
  **Recorded, not automated** — a transition to `REFUNDED` flags a `PENDING` row; money is
  moved manually in the Razorpay dashboard.
- **Owner:** via `PaymentAttempt` — **commerce refund.** **Target:** **TENANT-owned** — must
  **never** share a path with SaaS-billing refunds (frozen invariant 6).
- **Relationships:** `N:1 PaymentAttempt` (RESTRICT). **Unique:** `razorpayRefundId`.
  **Indexes:** `(paymentAttemptId)`. Added by migration `20260826084257_add_refunds`.
- **Migration risk:** LOW–MEDIUM.

#### `OrderStatusHistory` — `@@map("order_status_history")`
- **Purpose:** Append-only order-state audit. `fromStatus?`, `toStatus`, `changedByUserId?`
  (`SET NULL`), `note?`.
- **Owner:** via `Order` — **tenant audit data** (distinct from platform audit).
  **Target:** **TENANT-owned** (add `tenantId`).
- **Relationships:** `N:1 Order` (RESTRICT), `User?` (`SET NULL`). **Indexes:** `(orderId)`.
- **Migration risk:** LOW.

---

### 6.6 Payments Infrastructure (internal-only, no REST surface)

#### `WebhookEvent` — `@@map("webhook_events")`
- **Purpose:** Durably-received / processed ledger for Razorpay webhooks. `razorpayEventId
  @unique` (idempotency), `payload Json`, `status` (`WebhookEventStatus`), retry bookkeeping
  (`attempts`, `availableAt`, `lastError`, `processedAt`).
- **Owner:** none today. **Target:** **AMBIGUOUS → REQUIRES REVIEW** (master-plan D7). Commerce
  webhooks are tenant-scoped (resolvable via `razorpayOrderId → Order → tenant`, or via
  `paymentAccountId`); a future SaaS-billing webhook stream is platform-scoped. Master-plan
  recommendation: **two tables** (`CommerceWebhookEvent` + `BillingWebhookEvent`), different
  secrets, different processors, different audit domains.
- **Relationships:** none (payload-only). **Unique:** `razorpayEventId`. **Indexes:**
  `(status, availableAt)` (was `(status)` before migration `20260901211106`).
- **Migration risk:** **MEDIUM.**

#### `IdempotencyKey` — `@@map("idempotency_keys")`
- **Purpose:** Checkout dedup. `key @unique`, `userId`, `endpoint`, `resultOrderId? @unique`,
  `expiresAt`. Claimed via `INSERT … ON CONFLICT DO NOTHING`. No cleanup poller wired
  (`IDEMPOTENCY_KEY_TTL_MS` only satisfies the non-null column).
- **Owner:** per-`User` per checkout. **Target:** **TENANT-owned** — key uniqueness can stay
  global (server-generated UUIDs) or become `(tenantId, key)` → **minor REQUIRES REVIEW**
  (decide in Phase 3). Cross-checks `userId` on lookup (`checkout.service.ts:110`).
- **Relationships:** `N:1 User` (RESTRICT), `Order?` (`SET NULL`). **Unique:** `key`,
  `resultOrderId`. **Indexes:** none beyond uniques.
- **Migration risk:** LOW.

#### `OutboxEvent` — `@@map("outbox_events")`
- **Purpose:** Transactional outbox. `eventType` (`OutboxEventType` — exactly 3 values),
  `aggregateType`, `aggregateId`, `eventKey @unique`, `payload Json` (carries `email`/`userId`
  **denormalized**, **not** a tenant id), `status` (`OutboxEventStatus`), retry bookkeeping.
  Inserted only inside the caller's transaction via `NotificationsService.enqueueOutboxEvent`.
- **Owner:** none. **Target:** **MIXED → REQUIRES REVIEW.** Tenant events must carry `tenantId`
  (frozen invariant 14 — "background jobs carry tenant context"); platform events (e.g.
  platform-admin notifications) carry none. Master-plan recommendation: nullable `tenantId` +
  a `scope` discriminator.
- **Relationships:** none. **Unique:** `eventKey`. **Indexes:** `(status, availableAt)`.
- **Migration risk:** **MEDIUM** (every enqueue site must thread tenant context).

---

### 6.7 Admin Config

#### `AppSetting` — `@@map("app_settings")`
- **Purpose:** Single global key–value table (`key @unique`, `value String`). Holds: public
  storefront config (`announcement_text`, `hero_slides`, `banners`, `showcase_categories`,
  `storeName`); admin-only config (`storeAdminName`, `shippingFeeFlat`, `tax.enabled`,
  `tax.pricingMode`, `tax.ratePercent`, `invoice.numberPrefix`, `invoice.sellerLegalName`,
  `invoice.sellerAddress`, `invoice.sellerGstin`, `invoice.sellerState`); and **internal
  counters** (`order_number_counter`, `invoice_number_counter`). Also used as the atomic
  counter substrate by `OrdersService.generateOrderNumber` and `InvoiceNumberService.allocate`.
- **Owner:** none. **Target:** **SPLIT → REQUIRES REVIEW** (master-plan D11). Every current
  business key → **tenant-** or **store-owned** (`TenantSetting` / `StoreSetting`, keyed by
  `(tenantId[, storeId], key)`); the two counters → **per-tenant** counter rows. No current
  key is genuinely platform-global; a `PlatformConfig` table would be new (Phase 5).
- **Relationships:** none. **Unique:** `key`. **Indexes:** (unique only).
- **Migration risk:** **MEDIUM** (must classify every key; counters reseeded from `MAX+1`).

---

### 6.8 Reviews

#### `Review` — `@@map("reviews")`
- **Purpose:** One review per `(product, user)`. `orderItemId` = the verified-purchase anchor
  (an `OrderItem` on a `DELIVERED` order, resolved server-side). `rating Int`, `bodyText?`,
  `status` (`ReviewStatus`, default `PUBLISHED`).
- **Owner:** per-`User`. **Target:** **STORE-owned** (`(productId, userId)` → `(storeId,
  productId, customerId)`; same-store anchor).
- **Relationships:** `N:1 Product` (RESTRICT), `User` (RESTRICT), `OrderItem` (RESTRICT).
- **Unique:** `(productId, userId)`. **Indexes:** `(productId)`, `(status)`. Added by migration
  `20260827193208_add_reviews` (also adds `products.avgRating` / `reviewCount`).
- **Migration risk:** **MEDIUM.**

---

### 6.9 Coupons

#### `Coupon` — `@@map("coupons")`
- **Purpose:** Admin-defined discount code. `code @unique` (stored uppercase), `type`
  (`CouponType`), `percentageOff?/flatAmountOff?`, `scopeType` (`CouponScopeType`),
  `categoryId?` (`SET NULL`), `minOrderValue?`, `usageLimitTotal?/usageLimitPerUser?`,
  `usedCount` (atomic-CAS), `firstOrderOnly`, `startsAt?/expiresAt?`, `isActive`,
  `createdByAdminId`. `code`/`type` immutable after creation.
- **Owner:** none (global). **Target:** **STORE-owned** (`code` → `(storeId, code)`;
  `createdByAdminId` → a `TenantMembership`/`User` in that tenant; category scope same-store).
- **Relationships:** `N:1 Category?` (`SET NULL`), `User` (`createdByAdminId`, RESTRICT);
  `1:N CouponUsage`, `Order`.
- **Unique:** `code`. **Indexes:** `(isActive)`. Added by migration `20260827204110_add_coupons`.
- **Migration risk:** **MEDIUM.**

#### `CouponUsage` — `@@map("coupon_usages")`
- **Purpose:** Per-use audit ledger backing the per-user usage-limit check. `orderId @unique`,
  `discountAppliedAmount`. Append-only.
- **Owner:** via `Coupon`/`Order`. **Target:** **STORE-owned** (add `tenantId`; `(couponId,
  userId)` → `(couponId, customerId)`).
- **Relationships:** `N:1 Coupon` (RESTRICT), `User` (RESTRICT), `Order` (RESTRICT).
- **Unique:** `orderId`. **Indexes:** `(couponId, userId)`.
- **Migration risk:** LOW.

---

### 6.10 Compact model table

| # | Model | Target owner | T? | S? | P? | Ambiguous? | Tk? / Sk? today | Key uniques | Key indexes | Migration risk |
|---|---|---|:-:|:-:|:-:|:-:|:-:|---|---|:-:|
| 1 | `User` | PLATFORM | – | – | ✅ | ✅ (customer identity) | No / No | `email` | – | HIGH |
| 2 | `RefreshToken` | PLATFORM | – | – | ✅ | – | No / No | – | `userId`, `tokenHash` | LOW |
| 3 | `Category` | STORE | ✅ | ✅ | – | – | No / No | `slug` | `parentCategoryId` | MED |
| 4 | `Product` | STORE | ✅ | ✅ | – | – | No / No | `slug` | `categoryId` | MED |
| 5 | `ProductImage` | STORE (via Product) | ✅ | ✅ | – | – | No / No | – | `productId` | LOW |
| 6 | `ProductVariant` | STORE (via Product) | ✅ | ✅ | – | – | No / No | `(productId,label)` | `productId` | LOW |
| 7 | `CustomizationField` | STORE (via Product) | ✅ | ✅ | – | – | No / No | – | `productId` | LOW |
| 8 | `UploadedFile` | TENANT (Asset) | ✅ | ~ | – | ✅ (visibility/kind/uploader) | No / No | `cloudinaryPublicId` | `uploadedByUserId` | MED |
| 9 | `Cart` | STORE | ✅ | ✅ | – | – | No / No | `userId` | – | MED |
| 10 | `CartItem` | STORE (via Cart) | ✅ | ✅ | – | – | No / No | – | `cartId` | LOW-MED |
| 11 | `CartItemCustomization` | STORE (via CartItem) | ✅ | ✅ | – | – | No / No | – | *(none)* | LOW |
| 12 | `Order` | STORE | ✅ | ✅ | – | – | No / No | `orderNumber`, `razorpayOrderId` | `userId`, `status`, `couponId` | HIGH |
| 13 | `Invoice` | TENANT (via Order) | ✅ | – | – | – | No / No | `invoiceNumber`, `orderId` | `issuedAt` | MED-HIGH |
| 14 | `OrderItem` | STORE (via Order) | ✅ | ✅ | – | – | No / No | – | `orderId` | LOW |
| 15 | `OrderItemCustomization` | STORE (via OrderItem) | ✅ | ✅ | – | – | No / No | – | *(none)* | LOW |
| 16 | `PaymentAttempt` | TENANT (commerce) | ✅ | – | – | – | No / No | `razorpayPaymentId`; partial `(orderId) WHERE CAPTURED` | `orderId` | MED |
| 17 | `Refund` | TENANT (commerce) | ✅ | – | – | – | No / No | `razorpayRefundId` | `paymentAttemptId` | LOW-MED |
| 18 | `OrderStatusHistory` | TENANT (tenant audit) | ✅ | – | – | – | No / No | – | `orderId` | LOW |
| 19 | `WebhookEvent` | **AMBIGUOUS** | ~ | – | ~ | ✅ (commerce vs billing) | No / No | `razorpayEventId` | `(status, availableAt)` | MED |
| 20 | `IdempotencyKey` | TENANT (per checkout) | ✅ | – | – | ~ (key scope) | No / No | `key`, `resultOrderId` | – | LOW |
| 21 | `OutboxEvent` | **MIXED** | ~ | – | ~ | ✅ (tenant vs platform events) | No / No | `eventKey` | `(status, availableAt)` | MED |
| 22 | `AppSetting` | **SPLIT** | ✅ | ✅ | ~ | ✅ (per-key) | No / No | `key` | – | MED |
| 23 | `Review` | STORE | ✅ | ✅ | – | – | No / No | `(productId,userId)` | `productId`, `status` | MED |
| 24 | `Coupon` | STORE | ✅ | ✅ | – | – | No / No | `code` | `isActive` | MED |
| 25 | `CouponUsage` | STORE (via Coupon/Order) | ✅ | ✅ | – | – | No / No | `orderId` | `(couponId, userId)` | LOW |

**Every model's `Tk?` (tenant key today) and `Sk?` (store key today) = No.** No table has a
`tenantId`, `storeId`, `customerId`, `membershipId`, `paymentAccountId`, or any scope column.

### 6.11 Enums (12)

| Enum | Values | Notes |
|---|---|---|
| `Role` | `CUSTOMER`, `ADMIN` | **The entire RBAC vocabulary.** No `SUPER_ADMIN`, `OWNER`, `STAFF`, `VIEWER`. |
| `CustomizationFieldType` | `TEXT`, `LOGO_UPLOAD`, `IMAGE_UPLOAD`, `DESIGN_FILE_UPLOAD`, `COLOR_SELECT`, `INSTRUCTIONS` | — |
| `SurchargeType` | `NONE`, `FLAT`, `PER_CHARACTER` | Pricing-critical. |
| `OrderStatus` | `PENDING_PAYMENT`, `PAID`, `PAYMENT_FAILED`, `CONFIRMED`, `IN_PRODUCTION`, `SHIPPED`, `DELIVERED`, `CANCELLED`, `REFUNDED` | 9 values (schema comment says "9-value graph"). CAS transitions only. |
| `PaymentAttemptStatus` | `INITIATED`, `CAPTURED`, `FAILED`, `ABANDONED` | Distinct from `OrderStatus`. |
| `WebhookEventStatus` | `RECEIVED`, `PROCESSED`, `PROCESSING_FAILED`, `IGNORED`, `FAILED` | `FAILED` = terminal dead-letter. |
| `OutboxEventType` | `ORDER_PAID`, `ORDER_STATUS_CHANGED`, `PASSWORD_RESET_REQUESTED` | Exactly 3. Any SaaS event type is new. |
| `OutboxEventStatus` | `PENDING`, `PROCESSING`, `SENT`, `FAILED` | — |
| `RefundStatus` | `PENDING`, `PROCESSED`, `FAILED` | Recorded, not automated. |
| `ReviewStatus` | `PUBLISHED`, `REJECTED`, `REMOVED` | Default `PUBLISHED` (publish-then-moderate). |
| `CouponType` | `PERCENTAGE`, `FLAT_AMOUNT`, `FREE_SHIPPING` | — |
| `CouponScopeType` | `STORE_WIDE`, `CATEGORY` | "STORE_WIDE" here means *catalog*-wide, not multi-store. |

### 6.12 Migrations (9, forward-only)

| Order | Migration | Adds |
|---|---|---|
| 1 | `20260825190725_init` | 20 tables + all base uniques/indexes/FKs + the hand-added partial unique `payment_attempts_order_captured_unique`. |
| 2 | `20260826084257_add_refunds` | `Refund` + `RefundStatus`. |
| 3 | `20260826214205_add_product_image_delivery_fields` | `product_images.resourceType`, `.deliveryType`. |
| 4 | `20260827180334_add_order_shipping_fee` | `orders.shippingFee`. |
| 5 | `20260827193208_add_reviews` | `Review` + `ReviewStatus` + `products.avgRating`/`reviewCount`. |
| 6 | `20260827204110_add_coupons` | `Coupon`, `CouponUsage` + 2 enums + `orders.couponId`/`couponCode`/`discountAmount` + `orders_couponId_idx`. |
| 7 | `20260831213237_add_category_is_active` | `categories.isActive`. |
| 8 | `20260901211106_webhook_event_bounded_retry` | `webhook_events` retry columns; index `(status)` → `(status, availableAt)`. |
| 9 | `20260902031308_order_tax_snapshot_and_invoices` | `orders` tax-snapshot columns (+ a data backfill `UPDATE`), `Invoice` table. |

`migration_lock.toml` → `postgresql`. No `_prisma_migrations` down-path (Prisma forward-only).

---

## 7. Ownership Classification

Each of the 25 models is placed in exactly one bucket. **AMBIGUOUS** items carry a
`REQUIRES REVIEW` note and are **not** forced.

### 7.1 PLATFORM (2)
- **`User`** — central identity. *Caveat below → also a REQUIRES REVIEW.*
- **`RefreshToken`** — session is global to identity.

### 7.2 TENANT (6)
- **`Invoice`**, **`PaymentAttempt`**, **`Refund`**, **`OrderStatusHistory`**,
  **`IdempotencyKey`**, **`UploadedFile`** — tenant-owned (some carry an additional
  `storeId` where store-scoped; `UploadedFile` also has a REQUIRES REVIEW note on
  visibility/kind/uploader identity).

### 7.3 STORE (12)
- **`Category`**, **`Product`**, **`ProductImage`**, **`ProductVariant`**,
  **`CustomizationField`**, **`Cart`**, **`CartItem`**, **`CartItemCustomization`**,
  **`Order`**, **`OrderItem`**, **`OrderItemCustomization`**, **`Review`**, **`Coupon`**,
  **`CouponUsage`** → *store-owned (and therefore tenant-owned transitively).*
  *(Count note: 14 store-scoped models; `Order`/`Invoice`-family straddle store+tenant —
  `Invoice`/`PaymentAttempt`/`Refund`/`OrderStatusHistory` are listed under TENANT above
  because their natural scope in the frozen model is the tenant ledger, not the storefront.)*

### 7.4 AMBIGUOUS → REQUIRES REVIEW (5)

| Model | Why ambiguous | What must be decided |
|---|---|---|
| **`User`** | The frozen model says *customer identity is store-scoped*, but today every storefront shopper is a `User` row (`role=CUSTOMER`) sharing the identity/login table with the single operator. | Whether to introduce a separate `Customer` entity keyed by `(storeId, email)` with its own auth (master-plan D5 recommendation), or keep a global `User` + per-store `Customer` profile. Drives Phase 2 + Phase 4 + Phase 12. → **P0-D15**. |
| **`WebhookEvent`** | Commerce webhooks are tenant-scoped; a future SaaS-billing webhook stream is platform-scoped. One table cannot cleanly be both. | One table with `scope` + nullable `tenantId`/`paymentAccountId`, or two tables (`CommerceWebhookEvent` + `BillingWebhookEvent`). Master-plan D7 → two tables. |
| **`OutboxEvent`** | Some events are tenant-scoped (order emails), some are platform-scoped (platform-admin notifications). Payload carries `email`/`userId`, never a tenant. | Add nullable `tenantId` + `scope`; every enqueue site must thread tenant context (frozen invariant 14). |
| **`AppSetting`** | A single global bag mixing store-facing content, tenant business config, and internal counters. | Per-key classification (master-plan D11): all current business keys → tenant/store settings; the two counters → per-tenant. |
| **`IdempotencyKey`** | Keys are server-generated UUIDs (collision-safe globally), but the frozen model wants tenant-scoped data access everywhere. | Keep `key` globally unique, or make it `(tenantId, key)`. Low-risk; decide in Phase 3. |

### 7.5 Special-attention entities the task named

| Entity | Current | Target |
|---|---|---|
| **User** | global identity, `role` string | PLATFORM identity + (REQUIRES REVIEW) store-scoped `Customer` |
| **Product / Category** | ownerless global catalog | STORE-owned |
| **Customer** | *does not exist as an entity* — it is `User` with `role=CUSTOMER` | STORE-owned `Customer` (REQUIRES REVIEW / P0-D15) |
| **Cart** | one per `User` | STORE-owned, one per `(store, customer)` |
| **Order** | per `User` | STORE-owned + tenant ledger |
| **Coupon** | global `code` unique | STORE-owned |
| **Review** | per `(product, user)` | STORE-owned |
| **Payment (`PaymentAttempt`/`Refund`)** | per order, single env Razorpay account | TENANT-owned commerce payment, per-`PaymentAccount` |
| **Invoice** | per order, global counter, global seller identity | TENANT-owned, per-tenant counter + seller |
| **UploadedFile / Asset** | per uploader `User`, folder `customizations/{userId}` | TENANT-owned Asset, per-tenant prefix, explicit visibility/kind |
| **AppSetting** | single global KV | SPLIT tenant/store settings + per-tenant counters |
| **Webhook (`WebhookEvent`)** | single table, Razorpay only | AMBIGUOUS — commerce vs billing streams |
| **Outbox (`OutboxEvent`)** | single table, no tenant in payload | MIXED — tenant + platform scopes |
| **Audit data (`OrderStatusHistory`)** | append-only per order | TENANT audit (distinct from a future PLATFORM audit log) |
| **Notifications** | outbox + `EmailService` (Resend), one transactional path | tenant-context outbox; transactional vs marketing split (Phase 11) |
| **Jobs** | 3 in-process crons, no tenant context | tenant-context jobs on a worker tier (Phase 11) |
| **Tax / settings** | India-GST engine, global config, `EXCLUSIVE` locked | per-store `TaxConfig` strategy (master-plan D12) |

---

## 8. Foreign-Key / Relationship Graph

### 8.1 Full map (current)

```
User ─1:1─ Cart ─1:N─ CartItem ─1:N─ CartItemCustomization ─?─ UploadedFile (SET NULL)
 │                        │  ├─→ Product        (RESTRICT)
 │                        │  └─→ ProductVariant (RESTRICT)
 │                        └─→ CustomizationField (RESTRICT)
 ├─1:N─ Order ─1:N─ OrderItem ─1:N─ OrderItemCustomization ─?─ UploadedFile (RESTRICT)
 │        │           └─→ Product (SET NULL)
 │        │           └─1:N─ Review ─→ Product (RESTRICT), User (RESTRICT)
 │        ├─1:N─ PaymentAttempt ─1:N─ Refund (RESTRICT)
 │        ├─1:N─ OrderStatusHistory ─?─ User (changedBy, SET NULL)
 │        ├─0:1─ Invoice (RESTRICT)
 │        ├─0:1─ IdempotencyKey (resultOrder, SET NULL)
 │        ├─0:1─ CouponUsage (RESTRICT)
 │        └─?── Coupon (SET NULL)
 ├─1:N─ UploadedFile (uploadedByUserId, RESTRICT)
 ├─1:N─ RefreshToken (RESTRICT)
 ├─1:N─ Review (RESTRICT)      [also anchored to OrderItem, RESTRICT]
 ├─1:N─ IdempotencyKey (RESTRICT)
 ├─1:N─ Coupon (createdByAdminId, RESTRICT)
 └─1:N─ CouponUsage (RESTRICT)

Category ─self(parentCategoryId, SET NULL)─ ; ─1:N─ Product ; ─1:N─ Coupon (SET NULL)
Product  ─1:N─ ProductImage / ProductVariant / CustomizationField (all RESTRICT)

Ownerless / global today: Category, Product, ProductImage, ProductVariant,
CustomizationField, AppSetting, WebhookEvent, OutboxEvent.
```

### 8.2 FK delete-policy summary

- **`ON DELETE RESTRICT`** (historical/audit immutability): `orders.userId`,
  `order_items.orderId`, `order_item_customizations.orderItemId`, `payment_attempts.orderId`,
  `refunds.paymentAttemptId`, `invoices.orderId`, `refresh_tokens.userId`,
  `uploaded_files.uploadedByUserId`, `order_item_customizations.uploadedFileId`,
  `reviews.*` (all 3), `coupons.createdByAdminId`, `coupon_usages.*` (all 3),
  catalog parent→child, `carts.userId`, `cart_items.*`, `cart_item_customizations.cartItemId`/`customizationFieldId`.
- **`ON DELETE SET NULL`** (incidental reference): `categories.parentCategoryId`,
  `orders.couponId`, `order_items.productId`, `cart_item_customizations.uploadedFileId`,
  `order_status_history.changedByUserId`, `idempotency_keys.resultOrderId`,
  `coupons.categoryId`.
- **`ON UPDATE CASCADE`** everywhere (Prisma default).

### 8.3 High fan-out models (most inbound FKs → most affected by tenantization)

| Model | Inbound FK relations | Consequence |
|---|---|---|
| **`User`** | 9 (`Cart`, `Order`, `RefreshToken`, `UploadedFile`, `Review`, `IdempotencyKey`, `Coupon`, `CouponUsage`, `OrderStatusHistory`) | Identity split (P0-D15) ripples into all 9. |
| **`Order`** | 7 (`OrderItem`, `PaymentAttempt`, `OrderStatusHistory`, `Invoice`, `IdempotencyKey`, `CouponUsage`, and self-ref from `Coupon`) | The commerce aggregate root; ownership backfill wave centres here. |
| **`Product`** | 6 (`ProductImage`, `ProductVariant`, `CustomizationField`, `CartItem`, `OrderItem`, `Review`) | Store scoping propagates transitively. |
| **`Category`** | 3 (`Product`, `Coupon`, self) | `slug` uniqueness + same-store self-parent. |
| **`UploadedFile`** | 2 (`CartItemCustomization` SET NULL, `OrderItemCustomization` RESTRICT) | Asset tenant resolution + orphan lifecycle. |
| **`PaymentAttempt`** | 1 (`Refund`) | Per-`PaymentAccount` context. |
| **`Coupon`** | 2 (`CouponUsage`, `Order`) | Store-scoped `code`. |

### 8.4 Models needing a direct `tenantId` (defence-in-depth, not just transitive)

Per the frozen model ("DB constraints complement app isolation; indexes tenant-aware"):
`Category`, `Product`, `Order`, `Cart`, `UploadedFile`, `Coupon`, `Review`, `Invoice`,
`PaymentAttempt`, `Refund`, `OrderStatusHistory`, `CouponUsage`, `IdempotencyKey`,
`OutboxEvent` (nullable) — and `storeId` additionally on the storefront-scoped subset. Child
tables (`ProductImage`, `ProductVariant`, `CustomizationField`, `CartItem`,
`CartItemCustomization`, `OrderItem`, `OrderItemCustomization`) inherit transitively but
should still carry `tenantId` for index-leading-column efficiency.

### 8.5 Relationships that could create cross-tenant access if not constrained

| Relationship | Risk | Required control |
|---|---|---|
| `products.categoryId → categories.id` | product in store A → category in store B | composite same-store FK `(storeId, categoryId) → categories(storeId, id)` |
| `categories.parentCategoryId` (self) | category tree spanning two stores | composite same-store self-FK |
| `cart_items.productId` / `variantId` | cart in store A referencing store B's product | composite same-store FK |
| `orders.couponId` | order in store A redeeming store B's coupon | composite same-store FK + validation |
| `coupons.categoryId` | coupon scoped to another store's category | composite same-store FK |
| `reviews.orderItemId` / `productId` | review anchored to a cross-store purchase | same-store validation + composite FK |
| `order_item_customizations.uploadedFileId` / `cart_item_customizations.uploadedFileId` | order/cart referencing another tenant's asset | tenant check at write (exists today as a *user* check — `customization-validation.service.ts:46`) + composite FK |
| `idempotency_keys.userId` / `resultOrderId` | key resolving to another tenant's order | tenant cross-check (user cross-check exists today) |
| `order_status_history.changedByUserId` | actor from another tenant recorded on an order | membership check in the transition path |

### 8.6 Unique constraints that conflict after tenantization

| Constraint (today) | Conflict | Target |
|---|---|---|
| `categories.slug` (global) | two stores can't both have `/mugs` | `@@unique([storeId, slug])` |
| `products.slug` (global) | two stores can't both have `/classic-tee` | `@@unique([storeId, slug])` |
| `coupons.code` (global) | two stores can't both have `WELCOME10` | `@@unique([storeId, code])` |
| `orders.orderNumber` (global `PF-…`) | shared sequence across tenants | `@@unique([tenantId, orderNumber])` + per-tenant counter |
| `invoices.invoiceNumber` (global `INV-…`) | shared statutory sequence | `@@unique([tenantId, invoiceNumber])` + per-tenant counter |
| `reviews (productId, userId)` | fine once `productId` is store-scoped, but `userId` → `customerId` | `@@unique([storeId, productId, customerId])` |
| `carts.userId` (unique) | one cart per identity, not per store | `@@unique([storeId, customerId])` |
| `users.email` (global) | **keep** for merchant `User`; a store-scoped `Customer` needs `@@unique([storeId, email])` | depends on P0-D15 |
| `uploaded_files.cloudinaryPublicId` | safe (provider-unique) but folder scheme is per-user | per-tenant folder prefix |
| `coupon_usages.orderId` (unique) | safe (order is already tenant-scoped) | add `tenantId` for indexing only |
| partial `payment_attempts (orderId) WHERE CAPTURED` | safe (order-scoped) | unchanged |

---

## 9. Auth / Role Inventory

### 9.1 Current `User` model (auth-relevant fields)

`id (uuid)`, `email (unique, lowercased)`, `passwordHash (bcrypt cost 12)`,
`role (Role, default CUSTOMER)`, `tokenVersion (Int, increments only)`,
`failedLoginAttempts`, `passwordResetTokenHash?`, `passwordResetExpiresAt?`, `isActive`,
embedded address, `createdAt`, `updatedAt`.

### 9.2 Current role model

- Enum `Role { CUSTOMER, ADMIN }` (`schema.prisma:18`; TS mirror
  `src/common/enums/role.enum.ts` — doc comment: *"MVP has exactly two roles; no per-resource
  permission system."*).
- `role` is a **column on `User`** and a **claim in the access-token payload**.
- **No** membership table, **no** permission catalogue, **no** `SUPER_ADMIN`.
- Admin is granted out-of-band: `UPDATE users SET role='ADMIN'` (`DEPLOYMENT.md §8`,
  `seed-production.ts`, e2e `promoteToAdmin` fixture). There is deliberately **no
  self-promotion endpoint** (`seed-production.ts` comment, frozen §23).

### 9.3 Current guards (all global via `APP_GUARD` in `src/app.module.ts`)

| Guard | File | Behaviour |
|---|---|---|
| `ThrottlerGuard` | `@nestjs/throttler` | 20 req / 60 s per IP; `skipIf` when `NODE_ENV=test`. |
| `JwtAuthGuard` | `src/common/guards/jwt-auth.guard.ts` | Extends `AuthGuard('jwt')`. Every route protected unless `@Public()` metadata. Delegates verification to `JwtStrategy`. |
| `RolesGuard` | `src/common/guards/roles.guard.ts` | Reads `@Roles(...)` metadata; `throw ForbiddenException` unless `requiredRoles.includes(user.role as Role)`. Doc: *"never a substitute for the per-resource ownership check individual handlers must still perform."* |

### 9.4 Current decorators

| Decorator | File | Use |
|---|---|---|
| `@Public()` | `src/common/decorators/public.decorator.ts` | `IS_PUBLIC_KEY` metadata — opt a route out of `JwtAuthGuard`. Used on: `auth` (register/login/refresh/reset ×2), `payments/webhook`, `products` public reads, `categories` public reads, `settings` (both), `product-reviews` list, `health` (both). |
| `@Roles(...Role[])` | `src/common/decorators/roles.decorator.ts` | `ROLES_KEY` metadata. Only value ever passed: `Role.ADMIN`. Sites: `admin.controller.ts` (class-level), `products.controller.ts` (×12), `categories.controller.ts` (×5). |
| `@CurrentUser()` | `src/common/decorators/current-user.decorator.ts` | Param decorator → `req.user` (`AuthenticatedUser { id, email, role }`). Doc: *"anything beyond identity/role is looked up fresh from the DB by the handler, never trusted from the token."* |

### 9.5 Current JWT / session claims

- **Access token** (`src/auth/auth.service.ts` `signAccessToken`, `src/auth/strategies/jwt.strategy.ts`):
  payload `{ sub, email, role, tokenVersion }`. TTL 15 min (`JWT_ACCESS_EXPIRES_IN`). Sent as
  `Authorization: Bearer` (never a cookie).
- **`JwtStrategy.validate()`** re-loads the `User` row on every request and rejects if
  `!user || !user.isActive || user.tokenVersion !== payload.tokenVersion`. Returns
  `{ id, email, role }`.
- **Refresh token** (`src/auth/auth.service.ts`): opaque random, HMAC-hashed at rest in
  `refresh_tokens`, rotated on every use, family-revoked + `tokenVersion++` on reuse detection.
  Cookie `pf_refresh_token`, `httpOnly`, `secure`, `sameSite: 'strict'`, `path:
  '/api/v1/auth/refresh'`, **`Domain` omitted** (depends on the pending shared registrable
  domain). `logout` revokes the presented token; `logoutAll` + password reset bump
  `tokenVersion`.

### 9.6 Current admin authorization

- One class: `@Controller('admin') @Roles(Role.ADMIN)` (`src/admin/admin.controller.ts`).
- Catalog admin lives on `products.controller.ts` / `categories.controller.ts` under
  `@Roles(Role.ADMIN)` (not on `admin/`).
- **No scoping** on admin reads: `AdminService.getDashboard()` →
  `prisma.order.groupBy({ by: ['status'] })` + `prisma.order.aggregate({ _sum: { total } })`
  over the whole table; `adminRecentOrders` → `prisma.order.findMany({ orderBy: createdAt })`
  with no `where`. `listCustomers` / `getCustomerDetail` filter `role: CUSTOMER` (so an admin
  id 404s through the customer endpoint) but not by any tenant.

### 9.7 Current frontend authorization

- `src/features/auth/AdminRoute.tsx`: `status === 'loading'` → render nothing;
  `unauthenticated` → `<Navigate to={ROUTES.LOGIN}>`; `user?.role !== 'ADMIN'` →
  `<Navigate to={ROUTES.FORBIDDEN}>`. Doc: *"Client-side UX guard only — every real check
  happens server-side."*
- `src/features/auth/ProtectedRoute.tsx`: `loading` → `<FullPageLoader />`; `unauthenticated`
  → `/login` (preserving `location`).
- `src/services/api/authStore.ts`: `AuthState { accessToken, user, status }` — `user.role` is
  the only authorization field the client holds.

### 9.8 Conceptual mapping to the frozen model (NOT implemented here)

| Current | Frozen target | Every repository location that will change |
|---|---|---|
| `Role { CUSTOMER, ADMIN }` on `User` | `PlatformRole { SUPER_ADMIN }` on `User` (platform domain) + `TenantRole { OWNER, ADMIN, STAFF, VIEWER }` on a new `TenantMembership` + a store-scoped `Customer` | `schema.prisma` (enum + `User` + new models); `src/common/enums/role.enum.ts`; `src/common/decorators/roles.decorator.ts`; `src/common/guards/roles.guard.ts` → permission guard; `src/common/decorators/current-user.decorator.ts` (`AuthenticatedUser` shape); `src/auth/strategies/jwt.strategy.ts` (payload + validate); `src/auth/auth.service.ts` (`signAccessToken`, cookie audience); every `@Roles(Role.ADMIN)` site (`admin.controller.ts`, `products.controller.ts`, `categories.controller.ts`); `src/admin/admin.service.ts` (unscoped aggregates); frontend `src/features/auth/*`, `src/services/api/authStore.ts`, `src/services/api/auth.ts`, `src/hooks/useAuth.ts`, `src/hooks/useCurrentUser.ts` |
| Role-string check (`requiredRoles.includes(user.role)`) | permission check (`can(membership, 'orders:transition')`) — role→permission map is data | `roles.guard.ts` → new `PermissionsGuard`; a permission catalogue; all controllers |
| Global `User` identity for shoppers | store-scoped `Customer` (`(storeId, email)`) with its own auth flow (**REQUIRES REVIEW — P0-D15**) | `schema.prisma`; `src/auth/*`; every `userId` ownership check (§10); frontend auth |
| Server context = `user.id` from JWT | server-derived tenant context (membership for admin; Domain→Store→Tenant for storefront) | new `TenantContext` middleware/interceptor; `PrismaService` → scoped client; every service |
| Token/session migration | accept the old payload for one refresh-TTL window; do **not** bump `tokenVersion` en masse | `jwt.strategy.ts`, `auth.service.ts` — **session/token migration risk, see §18 R3** |

### 9.9 Session / token migration risks identified

1. **Mass logout** if `tokenVersion` is bumped for every user during the Phase 2 cutover
   (`jwt.strategy.ts` rejects a payload whose `tokenVersion` ≠ the row). Mitigation: don't
   bump; widen `validate()` to accept the legacy `{sub,email,role,tokenVersion}` payload for
   one refresh-TTL window while new logins get the context-bearing payload.
2. **Customer/merchant token confusion** if a single `User` identity is split into `User` +
   `Customer` (P0-D15) — an in-flight customer access token must not authorize a merchant
   route and vice-versa. Mitigation: separate token audiences + separate guards from day one
   of the split.
3. **Refresh-cookie `Path`/`Domain`**: the cookie is `Path=/api/v1/auth/refresh`,
   `Domain` omitted. Introducing an admin subdomain (`{tenant}.admin.…`, master-plan D6)
   without a shared registrable domain + explicit `Domain` breaks refresh for the admin app.
4. **`JwtStrategy` DB round-trip per request** already exists — adding a membership/context
   lookup there is additive but must be cached to avoid an N+1 on every request (perf, §18 R?).

---

## 10. Admin Boundary Inventory

### 10.1 Current admin boundary

**One** authorization boundary: `role === 'ADMIN'`, enforced by the global `RolesGuard`
against `@Roles(Role.ADMIN)` metadata. There is exactly one admin per deployment. No tenant
scoping anywhere. Frontend admin routes are a **UX** guard only (`AdminRoute.tsx`).

### 10.2 Current admin endpoints

| Route | Handler | Data access |
|---|---|---|
| `GET /admin/orders` | `OrdersService.adminListOrders` | all orders, filter by status/userId/date only |
| `GET /admin/orders/:id` | `OrdersService.adminGetOrderDetail` | any order |
| `GET /admin/orders/:id/invoice` | `InvoicesService.getInvoiceForOrder({isAdmin:true})` | any order's invoice (lazy create) |
| `PATCH /admin/orders/:id/status` | `OrdersService.adminTransitionStatus` | CAS transition on any order; `CANCELLED`/`REFUNDED` flag a `PENDING` `Refund` |
| `GET /admin/dashboard` | `AdminService.getDashboard` | **unscoped** `order.groupBy` + `order.aggregate(_sum total)` + 10 recent orders |
| `GET /admin/customers` | `AdminService.listCustomers` | `user.findMany({ where: { role: CUSTOMER, … } })` |
| `GET /admin/customers/:id` | `AdminService.getCustomerDetail` | one `role=CUSTOMER` user + revenue agg + 5 recent orders |
| `PATCH /admin/reviews/:id/status` | `ReviewsService.adminUpdateStatus` | any review, any status→any status |
| `GET /admin/coupons` `GET /admin/coupons/:id` | `CouponsService.listCoupons` / `getCoupon` | all coupons |
| `POST /admin/coupons` `PATCH /admin/coupons/:id` | `CouponsService.createCoupon` / `updateCoupon` | create (records `createdByAdminId`), edit limits/dates/isActive/description only |
| `GET /admin/settings` `PATCH /admin/settings/:key` | `AppSettingService.listConfigurable` / `updateConfigurable` | the 12-key admin allowlist, global rows |
| `GET /products/admin`, `POST/PATCH /products…`, `POST /products/:id/images…`, `POST/PATCH /products/:id/variants…`, `POST/PATCH /products/:id/customization-fields…`, `PATCH /products/:id/deactivate|reactivate` | `ProductsService` | full catalog CRUD, all products |
| `POST/PATCH /categories…`, `PATCH /categories/:id/deactivate|reactivate` | `ProductsService` (categories) | full category CRUD |

### 10.3 Current admin service access pattern

Every admin service method takes `this.prisma` directly and queries **without any tenant/store
`where` clause**. `AdminService` additionally imports `OrdersService` for delegation. The
`admin.module.ts` dependency note: admin depends on `orders, products, users, reviews, coupons`.

### 10.4 Current frontend admin routes (`src/App.tsx`, `src/constants/routes.ts`)

`/admin` (dashboard), `/admin/orders`, `/admin/orders/:id`, `/admin/customers`,
`/admin/customers/:id`, `/admin/products`, `/admin/products/:id` (`:id` also matches literal
`new`), `/admin/categories`, `/admin/coupons`, `/admin/settings` — all under `<AdminRoute>` →
`<AdminLayout>` (dedicated shell, `AdminSidebar`, `noindex`).

### 10.5 Which capabilities belong to which control plane (target — NOT implemented)

| Capability | → PLATFORM control plane (`SUPER_ADMIN`) | → TENANT control plane (`OWNER/ADMIN/STAFF/VIEWER`) |
|---|---|---|
| Tenant lifecycle (create/suspend/delete) | ✅ | — |
| Plan CRUD, plan→feature/limit config | ✅ | — |
| Subscription management, billing, dunning | ✅ (+ tenant sees own) | tenant views/changes own plan |
| Domain approval / verification oversight | ✅ | tenant requests/configures own domains |
| Platform audit log | ✅ | — |
| Impersonation / support session (time-boxed, audited) | ✅ | — |
| Feature flags (≠ entitlements) | ✅ | — |
| Product / category / variant / customization CRUD | — | ✅ (tenant-scoped) |
| Order list / detail / status transitions | — | ✅ (tenant-scoped; `STAFF` may be limited by permission map) |
| Customer list / detail | — | ✅ (store-scoped customers) |
| Coupon CRUD | — | ✅ |
| Review moderation | — | ✅ |
| Store identity / shipping / tax / seller settings, homepage config | — | ✅ (tenant/store settings) |
| `PaymentAccount` configuration | — | ✅ (`OWNER`, maybe `ADMIN` per permission map) |
| Tenant team management (invite/remove members) | — | ✅ (`OWNER`; `ADMIN` for `STAFF`/`VIEWER`) |
| Tenant audit log | — | ✅ (read) |

**Key invariant to preserve (frozen §12, §16):** `SUPER_ADMIN` gets **no blanket
tenant-data access** — no cross-tenant bulk read/write route; tenant business data is
reachable only through a justified, time-boxed, audited support session. Today's
`AdminService.getDashboard()` unscoped aggregate is exactly the anti-pattern to remove.

---

## 11. Payment Inventory

### 11.1 Current Razorpay integration

- **`RazorpayService`** (`src/payments/razorpay/razorpay.service.ts`): thin wrapper over
  `razorpay@^2.9.5`. Client built in `onModuleInit` from `configService.get('razorpay')` =
  `RAZORPAY_KEY_ID` + `RAZORPAY_KEY_SECRET` (**single account, process env**). Missing keys →
  warn, not fatal; calls fail at use via `getClient()`. `isConfigured()` lets reconciliation
  skip cleanly.
- Methods: `createOrder({amountPaise: bigint → string, currency, receipt})`,
  `fetchOrderPayments(razorpayOrderId)` (reconciliation only, normalizes to `bigint` paise),
  `getKeyId()` (public — handed to the browser per checkout), `createRefund()` (present,
  **not currently called** — refund is record-only), `verifySignature()` (frontend callback,
  `hmac_sha256(orderId|paymentId, key_secret)`), `verifyWebhookSignature(rawBody, sig)`
  (`hmac_sha256(rawBody, webhook_secret)` — distinct secret). Constant-time compare
  (`crypto.timingSafeEqual`). `translateSdkError` unwraps the `razorpay@2.9.x` transport-error
  `TypeError` masking bug.
- **Amounts are always server-computed** in `bigint` paise (`PricingService`,
  `checkout.service.ts`); never taken from the client.

### 11.2 Payment models (see §6.5)

`PaymentAttempt` (`INITIATED/CAPTURED/FAILED/ABANDONED`, `amountPaise BigInt`, partial unique
`(orderId) WHERE CAPTURED`) ← `Order`. `Refund` (`PENDING/PROCESSED/FAILED`) ← `PaymentAttempt`,
recorded not automated.

### 11.3 Webhook model

- `POST /payments/webhook` (`@Public()`, `@HttpCode(200)`, `src/payments/payments.controller.ts`):
  reads `req.rawBody`, `x-razorpay-signature`, `x-razorpay-event-id`. Phase 1 =
  `PaymentsService.receiveWebhook` verifies HMAC + persists a `WebhookEvent` (idempotent by
  `razorpayEventId @unique`), returns `{received: true}`.
- Phase 2 = `WebhookProcessor` `@Cron(EVERY_30_SECONDS)` (`src/payments/webhooks/webhook-processor.service.ts`):
  `FOR UPDATE` re-select in a transaction → `PaymentsService.applyWebhookEvent(tx, payload)` →
  update status. Bounded retry (`MAX_ATTEMPTS = 6`, backoff `[30s,2m,10m,30m,1h,2h]`),
  terminal `FAILED` + Sentry. `PaymentMismatchError` (amount/currency/order-id mismatch) is
  **non-retryable** → immediate dead-letter. Unique-constraint race with a concurrent capture
  → marked `PROCESSED` (no-op).

### 11.4 Reconciliation

`PaymentReconciliationService` `@Cron(EVERY_5_MINUTES)`
(`src/payments/payment-reconciliation.service.ts`): for `PENDING_PAYMENT` orders aged
15 min – 7 days with no `CAPTURED` attempt, `fetchOrderPayments` from Razorpay directly →
`reconcileCapturedPayment` (CAS to `PAID` on exact amount/currency/order-id match; Sentry on
mismatch; leave alone if authorized-not-captured). Orders with no `razorpayOrderId` past
180 min → `PAYMENT_FAILED`. Bounded batch (20). Row-lock + CAS + partial-unique backstop.

### 11.5 Invoice relationships

`Invoice` ← `Order` (`orderId @unique`). Lazy idempotent creation on first
`GET /orders/:id/invoice` or `GET /admin/orders/:id/invoice` for a paid order. Monetary fields
snapshot the order; `sellerSnapshot` from **global** `invoice.seller*` settings; `invoiceNumber`
from the **global** `invoice_number_counter` row (`InvoiceNumberService.allocate`, prefix
`invoice.numberPrefix` default `INV-`). Tax is India-GST, `INCLUSIVE`, `taxAmount` stays
`0.00` until a client-confirmed rate is enabled; `EXCLUSIVE` is code-complete but admin-locked.

### 11.6 Refund relationships

`Refund` ← `PaymentAttempt`. A status transition to `REFUNDED` (or a cancellation of a
captured order) writes a `PENDING` `Refund` row for audit; **money is moved manually in the
Razorpay dashboard** (`DEPLOYMENT.md §14`, schema comment on `Refund`).

### 11.7 Environment / config dependencies

`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` (all Tier-2
production-required; CI's `.env.test` sets the two secrets to dummies because
`payments-race.e2e-spec.ts` exercises the real local HMAC path). Webhook URL configured in the
Razorpay dashboard as `{BACKEND_URL}/api/v1/payments/webhook`. Frontend `VITE_RAZORPAY_KEY_ID`
exists in `.env.example` but is **not read** — the key id comes from the per-call
`retry-payment` response.

### 11.8 Reusable for merchant commerce

**Almost all of it.** `RazorpayService` becomes a `PaymentProvider` adapter; `PaymentsService`
(`applyWebhookEvent`, `reconcileCapturedPayment`, `verifyPayment`), `WebhookProcessor`,
`PaymentReconciliationService`, the two-phase pattern, the partial-unique invariant, and the
`bigint`-paise discipline are all kept. **Refactor:** credentials resolved per-call from a
tenant's `PaymentAccount` (not `process.env`); `paymentAccountId` on `PaymentAttempt`/`Refund`;
per-account webhook secret + signature verification; tenant resolved during webhook processing.

### 11.9 What must be introduced for SaaS billing (separate, NOT designed here)

`Subscription` (7 frozen states), `SubscriptionEvent`, `SaasInvoice` (+ line items), a
`BillingProvider` abstraction, a **separate** billing-webhook stream/table, dunning/grace,
upgrade/downgrade, SaaS-refund workflow — **physically separate** from commerce
(`PaymentAttempt`/`Refund` must never share a path or table; frozen invariant 6).
**Billing provider selection = implementation/vendor decision — not chosen here.**

---

## 12. Settings Inventory

Source: `src/app-setting/app-setting.constants.ts`, `.service.ts`, `.controller.ts`;
`src/invoices/invoice-number.service.ts`; `src/orders/orders.service.ts`.

### 12.1 Every current `AppSetting` key

| Key | Read surface | Write surface | Kind | Implicit single-store assumption | Target ownership |
|---|---|---|---|---|---|
| `storeName` | **public** (`GET /settings`) + admin | admin (`normalizeStoreName`, required, ≤60) | text | "the store" = the one store | **STORE** |
| `storeAdminName` | admin only | admin (≤120) | text | one operator | **TENANT** (or store) |
| `announcement_text` | **public** + admin | admin (≤200) | text | one storefront banner | **STORE** |
| `hero_slides` | **public** | *(not in admin allowlist — seeded/managed elsewhere)* | json | one homepage | **STORE** |
| `banners` | **public** | *(seeded via `seed-storefront-preview.ts`; not admin-editable)* | json | one homepage; embeds category IDs | **STORE** |
| `showcase_categories` | **public** | *(seeded; not admin-editable)* | json | one homepage; embeds category IDs | **STORE** |
| `shippingFeeFlat` | admin only (checkout reads it server-side) | admin (`normalizeMoney`, 0–100000) | money | one flat fee for the whole store | **STORE** |
| `tax.enabled` | admin only | admin (boolean) | boolean | one tax regime | **STORE** (`TaxConfig`) |
| `tax.pricingMode` | admin only | admin (`INCLUSIVE` only; `EXCLUSIVE` locked) | enum | one pricing mode | **STORE** |
| `tax.ratePercent` | admin only | admin (0–100, pending client input) | percent | one combined GST rate; no CGST/SGST/IGST split | **STORE** |
| `invoice.numberPrefix` | admin only | admin (`^[A-Z0-9/-]{1,16}$`, pending) | text | one invoice series | **TENANT** (per-tenant counter + prefix) |
| `invoice.sellerLegalName` | admin only (frozen into `Invoice.sellerSnapshot`) | admin (≤200, pending) | text | one seller identity | **TENANT** |
| `invoice.sellerAddress` | admin only → `sellerSnapshot` | admin (≤500, pending) | text | one registered address | **TENANT** |
| `invoice.sellerGstin` | admin only → `sellerSnapshot` | admin (GSTIN format, pending) | text | one GSTIN | **TENANT** |
| `invoice.sellerState` | admin only → `sellerSnapshot` | admin (≤200, pending) | text | one place of supply | **TENANT** |
| `order_number_counter` | **internal** (never exposed; `PUBLIC_SETTING_KEYS` excludes it — tested by `admin-control-plane.e2e-spec.ts`) | `OrdersService.generateOrderNumber` (`INSERT … ON CONFLICT DO UPDATE … RETURNING`) | int-as-text | **one global order sequence** `PF-000001` | **PER-TENANT counter** |
| `invoice_number_counter` | **internal** | `InvoiceNumberService.allocate` (same atomic pattern) | int-as-text | **one global invoice sequence** `INV-000001` | **PER-TENANT counter** |

### 12.2 Read/write surfaces

- **Public read:** `GET /settings` / `GET /settings/:key` (`app-setting.controller.ts`,
  `@Public()`), filtered to `PUBLIC_SETTING_KEYS` = `[announcement_text, hero_slides, banners,
  showcase_categories, storeName]`. Unknown/internal key → `{ value: null }`. Falls back to the
  admin definition's `default` when no row exists.
- **Admin read/write:** `GET /admin/settings` / `PATCH /admin/settings/:key`
  (`admin.controller.ts` → `AppSettingService.listConfigurable` / `updateConfigurable`).
  Allowlist = the 12 `ADMIN_SETTING_DEFINITIONS`; each value passes a typed normalizer;
  unknown key → 400, never written.
- **Server-internal reads:** `checkout.service.ts` reads `shippingFeeFlat`;
  `tax.service.ts` reads `tax.*`; `invoices.service.ts` reads `invoice.*`;
  counters read/written by the two counter services.

### 12.3 Sensitive settings

- `invoice.sellerGstin` — business tax identifier (structural validation only, never fabricated).
- The `sellerSnapshot` JSON on every `Invoice` freezes seller legal identity — must come from
  the **correct tenant's** settings after migration, or invoices are mislabelled (statutory
  risk → REQUIRES QUALIFIED LEGAL REVIEW, master-plan D10).
- No credentials/secrets are stored in `AppSetting` (those are env vars).

### 12.4 Mapping

| Bucket | Keys |
|---|---|
| **PLATFORM** | *(none today)* — a `PlatformConfig` table would be new in Phase 5 if needed |
| **TENANT** | `storeAdminName`, `invoice.numberPrefix`, `invoice.sellerLegalName`, `invoice.sellerAddress`, `invoice.sellerGstin`, `invoice.sellerState`; `order_number_counter` + `invoice_number_counter` → per-tenant counter rows |
| **STORE** | `storeName`, `announcement_text`, `hero_slides`, `banners`, `showcase_categories`, `shippingFeeFlat`, `tax.enabled`, `tax.pricingMode`, `tax.ratePercent` |

The `app-setting.constants.ts` allowlist + typed-normalizer discipline is the **template** for
`TenantSetting`/`StoreSetting` (reuse the pattern, rebuild the storage).

---

## 13. Async Inventory

Every scheduled / poller / worker-like process in the backend. **All three** are discovered by
the single `ScheduleModule.forRoot()` in `src/app.module.ts` (invariant pinned by
`src/scheduler-registration.spec.ts` — a second `forRoot()` double-runs every job).

| # | Name | File | Current trigger | Current process | Current data access | Tenant context? | Idempotency? | Multi-instance safe? | Dependencies | Risk |
|---|---|---|---|---|---|:-:|:-:|:-:|---|---|
| 1 | **`OutboxPoller`** | `src/notifications/outbox/outbox.poller.ts` | `@Cron(EVERY_30_SECONDS)` | Claim up to 20 `PENDING` rows via `SELECT … FOR UPDATE SKIP LOCKED`, build email from `OutboxEventType` template, resolve recipient from `payload.email` (or `payload.userId` lookup), send via `EmailService` (Resend), mark `SENT`; bounded retry (`MAX_ATTEMPTS = 5`, backoff `[1m,5m,30m,2h]`), terminal `FAILED` + `logger.error`. | reads/writes `outbox_events`; reads `users` only for the legacy recipient fallback | **No.** Payload carries `email`/`userId`, never a tenant id. | Yes — `eventKey @unique` + status guard; sending is at-least-once (email is not transactional). | Row claim is safe (`SKIP LOCKED`), **but every instance polls** → wasted work, no leader election. | `PrismaService`, `EmailService` | **HIGH** for SaaS: no tenant tag on events; scale-out duplicates polling; marketing vs transactional not separated. |
| 2 | **`WebhookProcessor`** | `src/payments/webhooks/webhook-processor.service.ts` | `@Cron(EVERY_30_SECONDS)` | Select up to 20 `RECEIVED`/`PROCESSING_FAILED` due rows; per row, `FOR UPDATE` re-select in a txn → `PaymentsService.applyWebhookEvent(tx, payload)` → update status. Bounded retry (`MAX_ATTEMPTS = 6`, backoff `[30s,2m,10m,30m,1h,2h]`), `PaymentMismatchError` non-retryable → immediate `FAILED` + Sentry; unique-race → `PROCESSED`. | reads/writes `webhook_events`; via `PaymentsService` writes `orders`, `payment_attempts` | **No.** Tenant would be resolved from `razorpayOrderId → Order`. Single platform webhook secret. | Yes — `razorpayEventId @unique` + two-phase persist-then-process + `FOR UPDATE`. | Same as #1: safe per-row, no leader election, every instance polls. | `PrismaService`, `PaymentsService` | **HIGH** for SaaS: single webhook secret; commerce/billing streams must split (D7); needs per-`PaymentAccount` verification. |
| 3 | **`PaymentReconciliationService`** | `src/payments/payment-reconciliation.service.ts` | `@Cron(EVERY_5_MINUTES)` | Fail stale no-Razorpay-order rows; if Razorpay configured, select up to 20 `PENDING_PAYMENT` orders (15 min–7 d, no `CAPTURED`) → `fetchOrderPayments` → `reconcileCapturedPayment` (CAS to `PAID` on exact match; Sentry on mismatch) / `failStalePendingOrder` after 180 min. | reads `orders`, `payment_attempts`; writes via `PaymentsService` (row-lock + CAS) | **No.** Would resolve tenant per order / per `PaymentAccount`. Uses the single global Razorpay client. | Yes — row-lock + CAS + partial-unique `(orderId) WHERE CAPTURED` backstop. | "Two instances may both fetch; only one transition succeeds" (doc). Safe outcome, duplicate Razorpay API calls. | `PrismaService`, `RazorpayService`, `PaymentsService` | **MEDIUM–HIGH** for SaaS: per-tenant Razorpay account; per-tenant rate-limit/quota on external calls. |

**No generic queue. No Redis. No `Job` table. No cron beyond these three.**
`IdempotencyKey` has a TTL field but **no cleanup poller**. `UploadedFile` has a
`TODO(uploads): destroy()` comment for a "48h orphan-cleanup poller" that **does not exist**.

**Frozen-architecture gap:** SaaS v1.0 requires *business event → outbox → queue → worker*,
tenant context on every tenant job, retryable-vs-permanent classification with dead-letter,
and **multi-instance-safe** scheduled jobs. The current design satisfies idempotency + bounded
retry + dead-letter, but **not** tenant context, **not** an independent worker tier, **not**
leader election, and adding the queue tier **conflicts with `BLUEPRINT-v1.2.md §2`** →
master-plan D1 (ACR).

---

## 14. Frontend Store-Awareness Inventory

Where the frontend assumes exactly one global store:

| Concern | File(s) | Assumption | What multi-store needs |
|---|---|---|---|
| **API base URL** | `src/services/api/client.ts` | `baseURL = import.meta.env.VITE_API_BASE_URL` — one fixed backend origin, no `Host`/tenant header. | Backend resolves store from `Host` server-side; the SPA is served for every store domain from the same bundle. |
| **Auth state** | `src/services/api/authStore.ts`, `src/features/auth/AuthProvider.tsx` | `AuthState { accessToken, user, status }`; `user.role` is the only authz datum; bootstrap `POST /auth/refresh` assumes one identity domain. | Active-tenant (for merchant app) or store-scoped `Customer` session; a tenant switcher for multi-membership users. |
| **Query keys** | `src/hooks/*` (~70) | Every key is `['products',…]`, `['cart']`, `['orders',…]`, `['admin',…]`, `['settings','storeName']`, `['homepage','settings']`, … — **no store/tenant segment**. | Prefix every key with a store/tenant id; `queryClient.clear()` on context switch. |
| **Cached resources** | `src/services/queryClient.ts` | One `QueryClient`, `retry: 1`, catalog `staleTime` 5 min — shared across whatever store is loaded. | Per-store cache partitioning; CDN cache key must include `Host`. |
| **Store-independent public routes** | `src/App.tsx` (`/`, `/products`, `/products/:slug`, `/about`, …) | One catalog, one homepage, one set of static pages. | Same routes, resolved against the request's store. |
| **Admin routes** | `src/App.tsx` (`/admin/*`), `src/features/auth/AdminRoute.tsx` | `user?.role !== 'ADMIN'` — binary, no tenant. | Platform console (`/platform/*`, new) vs tenant console (`/admin/*`, scoped by membership). |
| **Storefront chrome** | `src/layouts/{Header,Footer}.tsx`, `src/hooks/useStoreName.ts` | `useStoreName()` → `GET /settings` `storeName`, fallback `'PrintForge'`. The one existing store-aware seam. | Full store branding (logo, theme, homepage blocks) from store config, server-resolved. |
| **Homepage config** | `src/hooks/useHomepageSettings.ts` (`['homepage','settings']`), `src/components/home/*` | One homepage built from global `hero_slides`/`banners`/`showcase_categories` (which embed global category IDs). | Per-store homepage config; per-store category IDs. |
| **SEO / canonical** | `src/seo/siteConfig.ts` | `SITE_URL = VITE_SITE_URL || 'https://www.printforge.in'` — one origin baked at build. `absoluteUrl()`, `<Seo canonicalPath>` all assume it. | Per-store origin resolved at request time (server-rendered or from `window.location`). |
| **robots.txt / sitemap.xml** | `src/seo/seoFiles.ts`, `vite.config.ts` | Emitted **at build time** from the single origin; `STATIC_PUBLIC_PATHS` hard-coded; no product/category URLs. | Per-store `robots`/`sitemap` served by the backend from store data (master plan Phase 9/12). |
| **Payment flow** | `src/features/checkout/useRazorpayCheckout.ts`, `src/services/razorpay/loadRazorpayCheckout.ts` | Single Razorpay key id (per-call, but one platform account); CSP pins `checkout.razorpay.com`. | Per-store `PaymentAccount` key id in the checkout-init response (already per-call — low change). |
| **CSP** | `frontend/index.html`, `src/index-csp.test.ts` | One static policy in `index.html`; `connect-src` hard-codes `localhost:4000`. | Fine for a shared bundle; `connect-src 'self' https:` already covers arbitrary API origins. Custom-domain storefronts need the policy re-checked. |

**Net:** the frontend is a single-store SPA with exactly one deliberate seam (`useStoreName`).
The component/UI library, forms, error/loading primitives, and route structure are
tenant-agnostic and reusable; the data layer (query keys, API client, auth store, SEO origin,
homepage config) is single-store throughout.

---

## 15. Data Availability / Ownership Inventory

### 15.1 Which database/environment is referenced

- **Repo config:** `DATABASE_URL` is read from the environment (`configuration.ts`), never
  hard-coded. `backend/.env.example` shows a `localhost` placeholder. `backend/.env.test`
  points at a local `printforge_test` database. `backend/.env` exists but is git-ignored and
  was **not inspected for secrets** (read-only task; no need to expose credentials).
- **Deployed environment:** `backend/prisma/seed-production.ts` hard-codes a default
  `SEED_API_BASE_URL = 'https://printforge-8c9m.onrender.com/api/v1'` — i.e. there **is** a
  deployed Render backend + a Render PostgreSQL instance. `Readme.md` "Project Status":
  *"Backend is live on Render, frontend is live on Vercel, both wired to real Razorpay
  test-mode credentials, Cloudinary, and a production Postgres instance."*

### 15.2 Is a data inventory possible from the repository?

**No.** The repository contains **no production database credentials**, no connection string
to the deployed instance, and no data dump. A live `SELECT` inventory (row counts, date
ranges, `role` distribution, `AppSetting` keys present, orphan checks) **cannot be run** from
here and must be executed by whoever holds the Render credentials, **read-only against a
restored copy or a read replica — never against production directly** (master plan Phase 0,
Wave W0).

### 15.3 What the repository *does* indicate about the data shape

- `backend/prisma/seed-storefront-preview.ts` header (written against a read-only audit of the
  real dev database): *"The real dev database … has **8 categories and 9 products** that are
  almost entirely QA/smoke-test fixtures (names like 'Checkout Test', 'Coupon Smoke Category',
  'Payments Mug') — **only 1 category is active with 1 product**."* This describes the **dev**
  DB, not necessarily the deployed one.
- `backend/prisma/seed.ts` is a **stub** (`TODO(prisma): implement`).
- `seed-production.ts` creates catalog through the **real HTTP API** (idempotent by natural
  key) and promotes the first admin via direct Prisma (`UPDATE users SET role='ADMIN'`).
- `Readme.md`: a full live payment smoke test, production (non-test) Razorpay keys, real
  Resend, and DNS cutover are **all still outstanding** → **not yet a launched product**.

### 15.4 Existing merchant / store identity

There is **no `Tenant`, `Store`, or merchant entity** in the schema. "The store" is an
implicit singleton expressed only through: the `storeName` / `storeAdminName` settings, the
global catalog, and the single `role=ADMIN` user. Whether the existing catalog + admin should
become **Tenant #1** (master-plan D3) is a decision, not a fact in the repo.

### 15.5 Existing users / admin ownership

- Every human is a `User`. Shoppers = `role=CUSTOMER` (default on register). The operator =
  `role=ADMIN`, promoted by manual SQL. No `User` has any explicit link to a tenant/store —
  ownership of data is **inferred**, never declared: `orders.userId`, `carts.userId`,
  `uploaded_files.uploadedByUserId`, `coupons.createdByAdminId`, `reviews.userId`, etc.

### 15.6 Is data ownership explicit or inferred?

**Entirely inferred.** Every ownership relationship is a plain FK to `users.id` (or a
transitive FK through `Order`/`Product`/`Cart`). There is no ownership metadata, no tenant
column, no store column, no `ownerId` distinct from `userId`. This is the core Phase 4
challenge: ownership must be **made explicit and verified** before it can be enforced.

### 15.7 Statement required by the task

> **Production ownership mapping cannot yet be verified.** The repository contains no
> production database access. A read-only data inventory of the deployed instance (row counts,
> date ranges, `role` distribution, `AppSetting` keys, orphan/foreign-key checks) must be run
> by whoever holds the Render PostgreSQL credentials, against a restored copy or a read
> replica, before Phase 4 can begin. **No default tenant has been invented.** Whether the
> deployed database holds real merchant/customer data or only test/demo data is
> **P0-D14 (= master-plan D2)** and is a hard precondition for Phase 4.

---

## 16. Migration Preconditions

Everything that must be known / done before Phase 4 (Data Ownership Migration) can start.

| # | Precondition | Why needed | Source (who provides it) | Currently known? | Blocking? |
|---|---|---|---|:-:|:-:|
| MP-1 | **Is there real production merchant/customer data?** (P0-D14 / master D2) | Determines whether Phase 4 is a true production migration (all gates, maintenance window, verified restore) or a clean bootstrap. | Ops (Render) — in writing | **No** (not in repo) | **YES** |
| MP-2 | **Live read-only data inventory** (row counts per table, min/max `createdAt`, distinct `role`, distinct `AppSetting.key`, orphan/FK checks) | The ownership mapping and backfill logic must be written against the real data shape; validation queries need baselines. | Ops — run against a restored copy / replica | **No** | **YES** |
| MP-3 | **Does the existing store become Tenant #1, or start empty?** (master D3) | Decides whether the backfill assigns all existing rows to one tenant or the deployment is discarded. | Architecture owner + business | **No** (decision) | **YES** |
| MP-4 | **Customer identity model** — separate `Customer(storeId,email)` vs global `User` + `Customer` profile (P0-D15 / master D5) | Determines whether Phase 4 re-points `orders.userId`, `carts.userId`, `reviews.userId`, `coupon_usages.userId`, `idempotency_keys.userId`, `uploaded_files.uploadedByUserId` to new `customerId` columns. | Architecture owner | **No** (decision) | **YES** |
| MP-5 | **Which existing user(s) become `OWNER` of Tenant #1** | The membership backfill needs a definitive owner; the single `role=ADMIN` user is the obvious candidate but must be confirmed (there could be more than one admin in the deployed DB — see MP-2). | Ops + business | **No** | **YES** |
| MP-6 | **Product / category ownership** | Backfill sets `tenantId`/`storeId` on all catalog rows; if the deployed catalog is all fixtures (per §15.3), it may be discarded instead. | MP-2 + business | Partial (dev DB shape known) | **YES** |
| MP-7 | **Order / invoice / payment ownership** | Backfill assigns `tenantId`/`storeId`/`customerId`/`paymentAccountId` to every `Order`, `Invoice`, `PaymentAttempt`, `Refund`, `OrderStatusHistory`, `CouponUsage`. Pre/post revenue-sum reconciliation required. | MP-2 | **No** | **YES** |
| MP-8 | **Uploaded-file ownership + classification** | Each `UploadedFile` needs a `tenantId`, a `visibility` (default `PRIVATE` when unclear), and a `kind` (customer-original vs production-output). Uploader role today determines folder; that maps to `kind`. | MP-2 + rules | Partial | Medium |
| MP-9 | **Settings ownership per key** (master D11) | Every `AppSetting` row → tenant setting, store setting, or per-tenant counter. Counters must be reseeded from `MAX(existing number)+1`. | Architecture owner (§12.4 proposal) | Proposed | Medium |
| MP-10 | **Coupon / review ownership** | `coupons.code` → `(storeId, code)`; `reviews (productId,userId)` → `(storeId, productId, customerId)`. Needs the store assignment from MP-6. | MP-6 | **No** | Medium |
| MP-11 | **Per-tenant order/invoice numbering scheme** (master D10) | Statutory GST invoice numbering may constrain the format per merchant jurisdiction → REQUIRES QUALIFIED LEGAL REVIEW. Counter rows must be initialized in-migration. | Legal + architecture owner | **No** | Medium |
| MP-12 | **`WebhookEvent` / `OutboxEvent` split decision** (master D7) | Whether Phase 4/8/11 adds `scope`+nullable `tenantId` or creates separate tables changes the migration. | Architecture owner | **No** (decision) | Medium |
| MP-13 | **Verified, restore-tested backup + written rollback plan** | Master plan Principle #5 + R11: no destructive migration (W7/W9) without a proven restore. `BACKUP-RESTORE.md` is currently **UNVERIFIED**; Render PITR unconfirmed. | Ops (Phase 14 restore drill) | **No** | **YES** (for destructive waves) |
| MP-14 | **Tenant-isolation enforcement mechanism** (master D4) | App-layer scoped Prisma client vs Postgres RLS vs both — decides what Phase 3 builds and what Phase 4's constraints look like. | Architecture owner | Proposed (both) | **YES** (for Phase 3, which precedes 4) |

**Blocking count: 8 hard blockers (MP-1..MP-7, MP-13, MP-14 — MP-14 blocks Phase 3 which
gates Phase 4).**

---

## 17. Reuse / Refactor / Rebuild Matrix

**REUSE** = keep as-is / trivial parameterization. **REFACTOR** = keep the logic, change
scoping/interface. **REBUILD** = current design is structurally single-tenant, replace.
Evidence is a repo path. (No area is marked REBUILD without evidence.)

| Area | Current implementation | Reuse | Refactor | Rebuild | Reason (from inspection) |
|---|---|:-:|:-:|:-:|---|
| **Auth — token/session mechanics** | `src/auth/auth.service.ts` (bcrypt cost 12, `DUMMY_PASSWORD_HASH` timing, `LOGIN_DELAY_CURVE_MS`, refresh rotation + reuse-detection family revocation, `tokenVersion`), `jwt.strategy.ts` (live `tokenVersion` re-check) | ✅ | ✅ | — | Mechanics are sound and kept verbatim. Refactor: split merchant vs `Customer` auth flows (P0-D15); token payload carries server-derived context; cookie `Domain`/`Path` for an admin subdomain. |
| **Auth — role model** | `Role { CUSTOMER, ADMIN }`, `RolesGuard` role-string check, `@Roles(Role.ADMIN)` | — | — | ✅ | 2-value enum + name check is inherently single-tenant. Rebuild as `SUPER_ADMIN` platform role + `TenantMembership.role` (OWNER/ADMIN/STAFF/VIEWER) + permission-based `PermissionsGuard`. |
| **Orders** | `src/orders/state-machine/order-state-machine.ts` (CAS, `assertTransitionAllowed`), `OrderStatusHistory`, immutable snapshots, `generateOrderNumber` (atomic counter) | ✅ | ✅ | — | State machine + audit + snapshots reused. Refactor: `tenantId`/`storeId`/`customerId`, per-tenant counter, `assertOwnedBy` → tenant + customer check. |
| **Products / Catalog** | `src/products/products.service.ts` (soft-delete via `isActive`, slug routing, denormalized `avgRating`/`reviewCount`) | ✅ | ✅ | — | Logic reused. Refactor: `(storeId, slug)` uniqueness, composite same-store category FK, tenant scoping. |
| **Categories** | flat one-level tree, `isActive` (migration `20260831213237`) | ✅ | ✅ | — | Reused. Refactor: store-scoped; same-store self-parent FK. |
| **Cart** | `src/cart/cart.service.ts` (live recompute, `SELECT … FOR UPDATE` at checkout, `getOwnedItemOrThrow`) | ✅ | ✅ | — | Reused. Refactor: `(storeId, customerId)` unique; `userId` → `customerId`; add `cart_item_customizations` index. |
| **Checkout** | `src/checkout/checkout.service.ts` (one txn: idempotency claim + cart lock + pricing + tax + coupon claim + snapshot writes + cart clear) | ✅ | ✅ | — | The crown jewel — reused whole. Refactor: tenant/store context, store's shipping/tax settings, store's `PaymentAccount`, per-tenant order number. |
| **Payments** | `src/payments/*` (`RazorpayService` wrapper, `PaymentsService`, `WebhookProcessor` two-phase, `PaymentReconciliationService`, partial-unique invariant) | ✅ | ✅ | — | All reused. Refactor: credentials per-call from `PaymentAccount` not env; `paymentAccountId` on attempts/refunds; per-account webhook secret; split commerce vs billing webhook stream (D7). |
| **Coupons** | `src/coupons/coupons.service.ts` (`usedCount` atomic CAS, per-user ledger, scope/min-order checks, `code`/`type` immutable) | ✅ | ✅ | — | Reused. Refactor: `(storeId, code)` unique; `createdByAdminId` → membership; store-scoped category scope. |
| **Reviews** | `src/reviews/reviews.service.ts` (verified-purchase anchor on `orderItemId` of a `DELIVERED` order, `(productId,userId)` unique, moderation, transactional denorm recompute) | ✅ | ✅ | — | Reused. Refactor: `(storeId, productId, customerId)` unique; `userId` → `customerId`; same-store anchor. |
| **Invoices / Tax** | `src/invoices/*` (immutable per-order snapshot, dedicated `invoice_number_counter`, `sellerSnapshot` freeze), `src/checkout/tax/tax.service.ts` (inclusive-GST) | ✅ | ✅ | — | Reused. Refactor: per-tenant counter + prefix; `sellerSnapshot` + tax config from tenant/store settings not global `AppSetting`; tax regime generalizable later (D12). |
| **Uploads** | `src/uploads/*` (backend-proxied, `file-signature.util.ts` magic-byte, 10 MB stream limit, PNG/JPEG/PDF allowlist, Cloudinary folder scheme, signed vs public, order-referenced `RESTRICT`) | ✅ | ✅ | — | Validation + delivery reused. Refactor: `StorageProvider` interface, `tenantId`/`visibility`/`kind`, per-tenant folders, read authz on private, **new** orphan-cleanup poller. Signed URL is not time-boxed today (needs Cloudinary `auth_token`) — improvement, not rebuild. |
| **Notifications / Email** | `src/notifications/*` (`EmailService` Resend, worker-only dispatch, template builder) | ✅ | ✅ | — | Reused. Refactor: transactional vs marketing path split (Phase 11); tenant context in the outbox event. |
| **Outbox** | `src/notifications/outbox/outbox.poller.ts` (`enqueueOutboxEvent(tx,…)`, `FOR UPDATE SKIP LOCKED`, bounded retry, dead-letter) | ✅ | ✅ | — | The pattern is the queue-runtime template. Refactor: `tenantId` + `scope` on events; poller → queue relay (Phase 11); enum gains SaaS event types. |
| **Webhooks (commerce)** | `src/payments/webhooks/*` + `payments.service.ts` (two-phase, idempotent by unique id, `PaymentMismatchError` non-retryable, Sentry, `safeContext` redaction) | ✅ | ✅ | — | Reused. Refactor: per-account secret; `tenantId` resolved in processing; split from billing webhooks (D7); processed by workers (Phase 11). |
| **Admin UI (backend + React)** | `src/admin/*` + `src/pages/admin/*` + `src/components/admin/*` + `src/features/admin/*` + `AdminLayout`/`AdminRoute` (already a separate shell) | ✅ | ✅ | — | Reused as the **Tenant** Control Plane. Refactor: permission guards, tenant scoping, tenant audit writes, team management, tenant switcher, remove unscoped aggregates. The **Platform** Control Plane (`/platform/*`) is **NEW** (not a rebuild of `admin/`). |
| **Storefront (React)** | `src/pages/*` + `src/features/{catalog,cart,checkout,reviews,customization,orders,account}` + `src/components/{home,layout,ui}` | ✅ | ✅ | — | Largest single reuse. Refactor: store-context provider, store-namespaced query keys, config-driven branding, per-store SEO, store legal pages. |
| **Settings** | `AppSetting` single global KV + `app-setting.constants.ts` typed normalizers | — | ✅ | ✅ | **Reuse** the normalizer/allowlist *discipline*. **Rebuild** the storage as `TenantSetting`/`StoreSetting` + per-tenant `TenantCounter`; no business setting stays global (D11). |
| **SEO** | `src/seo/*` (per-route `<Seo>`, `jsonLd.ts`, `siteConfig` helpers) + `seoFiles.ts` build-time `robots`/`sitemap` | ✅ | ✅ | ✅ (`seoFiles`) | `<Seo>` + helpers **reused**. Refactor: origin from store context not hard-coded `https://www.printforge.in`. **Rebuild:** `seoFiles.ts` build-time emission → backend per-store `robots.txt`/`sitemap.xml` routes. |
| **Tests** | `backend/test/e2e/support/*` (`test-app.ts`, `db.ts` reset, `fixtures.ts`, `fake-cloudinary.service.ts`, `razorpay-signing.ts`) + 15 e2e specs + 27 backend unit specs + 100 frontend tests | ✅ | ✅ | — | Harness + every existing spec reused as single-tenant cases + extended to multi-tenant. `FakeCloudinaryService` is the model for `FakeBillingProvider`/`FakeESignProvider`. **New:** the whole tenant-isolation / platform-control-plane / entitlements / subscription / domain / asset-isolation / async-context suite. |
| **CI/CD** | `.github/workflows/ci.yml` (hygiene + backend-with-real-Postgres + frontend; `npm audit`; `prisma migrate deploy`) | ✅ | ✅ | — | Structure reused. Refactor: add isolation + RBAC-negative + security suites as required gates; add grep gates (no direct `PrismaService` import in domain services, no plan-key literal, no `billing/`↔`payments/` cross-import); add a staging deploy; multi-instance worker job. Deployment **topology** (worker service, ≥2 API instances, staging env) is new infra (D8), not a code rebuild. |

**Nothing in the repository is discarded.** The two genuine rebuilds (auth role model, settings
storage) are small and well-contained; `seoFiles.ts` is a ~90-line build helper. Everything
else is reuse or re-scoping.

---

## 18. Phase 0 Risk Register

Top risks visible **from repository evidence** at the start of the single-tenant → multi-tenant
migration. Severity: **C** = Critical, **H** = High, **M** = Medium.

| # | Risk area | Sev | Evidence in the repo | Why it's a risk for the migration | First mitigation checkpoint |
|---|---|:-:|---|---|---|
| R1 | **Global `User` role** | C | `Role { CUSTOMER, ADMIN }` (`role.enum.ts`, `schema.prisma:18`); `RolesGuard` role-string check; `@Roles(Role.ADMIN)` in 3 files; no membership/permission concept | The entire authorization model is a binary string on one global table. Any tenant boundary must be built beneath it. Getting the role→permission map or the `SUPER_ADMIN` scoping wrong = privilege escalation. | Phase 2 — permission catalogue + `PermissionsGuard`, deny-by-default; role map reviewed as a security artifact |
| R2 | **Unscoped global admin queries** | C | `AdminService.getDashboard()` → `prisma.order.groupBy`/`aggregate` with no `where`; `adminRecentOrders` → `findMany` no `where`; `listCustomers` filters only `role` | After tenants exist, these leak every tenant's orders/revenue/customers to any admin. `SUPER_ADMIN` must NOT inherit this pattern (frozen §12). | Phase 3/5 — every admin read gets tenant scope; `SUPER_ADMIN` cross-tenant only via audited support session |
| R3 | **No tenant ownership column anywhere** | C | 0 of 25 tables have `tenantId`/`storeId`/`customerId`; all ownership is `userId` FKs or transitive | Isolation cannot be enforced at the data layer until columns exist, are backfilled, verified, and constrained. Enforcing too early on unverified data = cross-tenant reads or lockouts. | Phase 1 (add) → Phase 4 (backfill + verify + constrain), expand→migrate→contract |
| R4 | **Existing unique constraints** | H | `categories.slug`, `products.slug`, `coupons.code`, `orders.orderNumber`, `invoices.invoiceNumber`, `carts.userId`, `reviews (productId,userId)` — all global (§8.6) | Two tenants cannot coexist until these become composite (`(storeId, …)` / `(tenantId, …)`). Dropping/replacing a unique on a populated table is a **destructive** migration (Prisma has no down-migration). | Phase 4 wave W6 (add composite) → W7 (drop old, with verified backup) |
| R5 | **Global settings table** | H | `AppSetting` single KV; store identity + shipping + tax + seller identity + homepage config + `order_number_counter` + `invoice_number_counter` all global rows (§12) | Migrating a shared settings bag into per-tenant/per-store scopes touches checkout, tax, invoicing, and homepage rendering simultaneously; counters must be reseeded atomically or numbers collide. | Phase 4 wave W4; D11 per-key classification first |
| R6 | **Uploaded-file ownership & orphan lifecycle** | C | `uploaded_files.uploadedByUserId` is the only owner; folder `customizations/{userId}`; `OrderItemCustomization.uploadedFileId` is `RESTRICT`; **no orphan-cleanup poller** (only a `TODO`); signed URL not time-boxed | Assets have no resolvable tenant; a leaked Cloudinary public id + a non-expiring signed URL is a cross-tenant data-exposure path once tenants exist. | Phase 10 — `Asset` `tenantId`/`visibility`/`kind`, per-tenant folders, read authz, cleanup job |
| R7 | **Payment ownership = single env account** | C | `RazorpayService` reads `RAZORPAY_KEY_ID/KEY_SECRET/WEBHOOK_SECRET` from `process.env`; one client for the whole platform; one webhook secret | Every tenant's commerce money would flow through one account; a webhook can't be attributed to a tenant without `razorpayOrderId → Order` resolution; SaaS billing must be physically separate (invariant 6). | Phase 8 — `PaymentAccount` per tenant, encrypted credentials, per-account webhook verification |
| R8 | **Customer identity** | C | Storefront shoppers are `User` rows (`role=CUSTOMER`) sharing the identity/login table with the operator; frozen model wants store-scoped customer identity | Deciding this wrong (or late) means re-pointing 6+ FK families twice. A customer token must never reach a merchant route after the split. | P0-D15 resolved in Phase 0; executed across Phase 2 + Phase 4 |
| R9 | **Admin access is one binary boundary** | H | `AdminRoute.tsx` + `RolesGuard` = `role === 'ADMIN'`; one `@Controller('admin')`; catalog admin on `products`/`categories` controllers | Platform vs tenant control planes must become distinct authorization domains with separate guards, routes, and audit logs — a large surface, easy to leave a hole. | Phase 5 — two control planes; `platform-control-plane.e2e-spec.ts` |
| R10 | **Frontend cache / query state** | H | ~70 hooks, every query key is `['products',…]`/`['cart']`/`['admin',…]` with **no store/tenant segment**; one `QueryClient`; SEO origin baked at build | Switching store/tenant in one browser serves another store's cached catalog/cart/branding; CDN cache key omits `Host`. | Phase 3/12 — store id in every key; `queryClient.clear()` on context switch; two-tab browser test |
| R11 | **Scheduled jobs carry no tenant context & assume one instance** | C | 3 crons, `OutboxEvent` payload has `email`/`userId` not `tenantId`; `scheduler-registration.spec.ts` pins one `forRoot()`; "every instance would poll" | A job running with no/wrong tenant → cross-tenant write or leak (frozen invariant 14). Horizontal scale-out (required by frozen §17) currently double-runs polling. | Phase 11 — `JobContext.tenantId` mandatory; worker asserts it; leader election / queue relay |
| R12 | **Webhook processing single-secret / single-stream** | H | one `RAZORPAY_WEBHOOK_SECRET`; one `WebhookEvent` table; no `paymentAccountId`; commerce + (future) billing would share it | Can't verify a per-merchant webhook; can't keep SaaS-billing events out of the commerce ledger (invariant 6). | Phase 7/8/11 — split streams (D7), per-account secret |
| R13 | **Invoice numbering** | H | `invoice_number_counter` is one global row; `InvoiceNumberService.allocate` a global atomic bump; `sellerSnapshot` from global settings; format "PENDING CLIENT CONFIRMATION" | Per-tenant statutory GST numbering; a mis-scoped `sellerSnapshot` = invoices labelled with the wrong legal entity (statutory exposure). | Phase 4 wave W4 + D10 (REQUIRES QUALIFIED LEGAL REVIEW) |
| R14 | **`Order` relationships & cross-store FKs** | H | `orders.couponId`, `order_items.productId`, `cart_items.productId/variantId`, `reviews.productId/orderItemId`, `coupons.categoryId`, `*.uploadedFileId` — none are same-store-constrained | Once stores exist, a plain FK lets store A's order redeem store B's coupon or attach store B's asset. Needs composite same-store FKs + validation. | Phase 4 wave W6 |
| R15 | **Existing production data — unknown** | C | No production credentials in repo; `seed.ts` is a stub; `seed-storefront-preview.ts` says the *dev* DB is "almost entirely QA/smoke-test fixtures"; Razorpay is test-mode; DNS not cut over | The migration cannot be planned in detail (backfill logic, maintenance window, restore drill) without knowing what data exists. Assuming "it's just fixtures" and it isn't = data loss. | **P0-D14 / MP-1** — ops confirms in writing before Phase 4 |
| R16 | **Prohibited-technology governance conflict** | H | `BLUEPRINT-v1.2.md §2` permanently prohibits Redis/queues/BullMQ absent an ACR; SaaS v1.0 requires a queue/worker tier; ACR process = "joint Atharva+Harshad review" | Introducing the worker tier without a signed ACR violates the *other* frozen document. | Master-plan D1 — one ACR formally superseding `BLUEPRINT-v1.2` with SaaS v1.0 |
| R17 | **Backup/restore is UNVERIFIED** | C | `BACKUP-RESTORE.md`: "DOCUMENTED — NOT VERIFIED. No restore has been performed or tested." Render cadence/retention/PITR unconfirmed; RTO undefined | Every destructive Phase 4 migration (drop unique, `NOT NULL`) needs a proven restore as the only rollback (Prisma forward-only). Right now there is none. | Phase 14 restore drill — precondition for Phase 4 destructive waves |
| R18 | **No staging environment / single backend instance** | H | `DEPLOYMENT.md`: "No staging environment"; "Render, one instance"; frozen §17 requires 3 environments + stateless + independently scalable workers | The full migration sequence must be dry-run on a staging full-restore of production before touching production; there is nowhere to do that today. | Phase 14 / D8 — add staging + worker service |
| R19 | **`cart_item_customizations` / `order_item_customizations` have no index** | M | `schema.prisma` — neither declares `@@index([cartItemId])` / `@@index([orderItemId])` | Post-tenantization, every tenant-scoped join over these grows; missing indexes compound into a performance cliff. Cheap to fix during the constraint wave. | Phase 4 wave W3/W6 — add indexes, tenant-leading |
| R20 | **SEO origin & sitemap baked at build time** | M | `siteConfig.ts` hard-codes `DEFAULT_SITE_URL`; `vite.config.ts`/`seoFiles.ts` emit one `robots.txt`/`sitemap.xml` at build | One shared bundle cannot serve per-store canonical URLs / sitemaps from a build-time constant. | Phase 9/12 — backend per-store `robots`/`sitemap`; origin from store context |

---

## 19. Decision Register

Decisions that **must be made before implementation** proceeds past the dependent phase. D1–D13
are carried verbatim in intent from `docs/saas/PRINTFORGE-SAAS-IMPLEMENTATION-MASTER-PLAN-v1.0.md`
§4.4 (this Phase-0 pass confirms each is still open against the repo). **P0-D14 / P0-D15** are
this pass's re-statements of the two hardest blockers, kept with their master-plan IDs for
traceability (P0-D14 ≡ D2, P0-D15 ≡ D5).

| ID | Decision | Why it matters | Current evidence in the repo | Options / constraints | REQUIRES DECISION? |
|---|---|---|---|---|:-:|
| **D1** | Formally supersede `BLUEPRINT-v1.2` (lift its Redis/queue prohibition) via the repo's ACR process. | The SaaS worker/queue tier is prohibited by a still-frozen document. | `BLUEPRINT-v1.2.md §2` + §29 ACR clause; `PHASE-10-PROPOSAL.md` shows the ACR process is real. | One ACR: "SaaS Architecture v1.0 supersedes BLUEPRINT-v1.2 in full." Keep BLUEPRINT as history. Or: use a Postgres-backed queue table (no new prohibited tech) if the ACR stalls. | **YES** |
| **P0-D14** (= D2) | Does the deployed Render database hold **real** merchant/customer data, or only test/demo data? | Determines whether Phase 4 is a production migration (all gates) or a clean bootstrap. | No production credentials in repo; `seed.ts` stub; `seed-storefront-preview.ts` says the *dev* DB is mostly fixtures; Razorpay test-mode; DNS not cut over. | Ops confirms in writing. If real data: full migration rigor. If not: discard + bootstrap tenants empty. | **YES** |
| **P0-D15** (= D5) | Customer identity model: separate `Customer(storeId, email)` with its own auth, vs global `User` + per-store `Customer` profile. | Decides whether Phase 4 re-points `orders.userId`, `carts.userId`, `reviews.userId`, `coupon_usages.userId`, `idempotency_keys.userId`, `uploaded_files.uploadedByUserId`. Biggest identity refactor. | Every shopper is a `User` `role=CUSTOMER`; `users.email` global unique; `AuthenticatedUser {id,email,role}`; `JwtStrategy` one identity domain. | (a) separate `Customer` per store (master-plan recommendation — matches frozen model, cleanly separates privileged merchant auth from shopper auth); (b) global `User` + `Customer` link. | **YES** |
| **D3** | Does the existing store/catalog become **Tenant #1**, or is the deployment discarded? | Decides the backfill target for all existing rows. | No `Tenant`/`Store` entity; "the store" is `storeName` + one `ADMIN` user + a global catalog. | Treat existing catalog + admin as "Tenant #1 (ForgeBuilds Demo Store)" so existing e2e coverage stays meaningful — with **no** implicit privileges, **not** named `default_tenant`. Or start empty. | **YES** |
| **D4** | Tenant-isolation enforcement mechanism: (a) app-layer scoped Prisma client, (b) Postgres RLS, (c) both. | Decides what Phase 3 builds and the shape of Phase 4 constraints. | `PrismaService extends PrismaClient` — no extension/middleware/RLS; every service imports it directly. | **Both** (master-plan recommendation): app-layer as the enforced, testable path; RLS + composite FKs as defence-in-depth (invariant 3 — "at the data-model level, not just convention"). | **YES** (blocks Phase 3) |
| **D6** | Tenant-context derivation for the tenant (merchant) admin: subdomain / path prefix / session-selected active tenant cross-checked against membership / validated header. | The refresh cookie is `Path`-scoped, `Domain` omitted; an admin subdomain without a shared registrable domain breaks refresh. | `pf_refresh_token` cookie config in `auth.service.ts`; single-origin axios client; `AdminRoute` binary. | Host/subdomain resolves a *candidate* tenant, **always** re-checked against an active `TenantMembership`; multi-membership users get a server-issued tenant switcher. Never a raw client value. | **YES** |
| **D7** | `WebhookEvent` split: one table with `scope` + nullable `tenantId`/`paymentAccountId`, vs two tables (`CommerceWebhookEvent` + `BillingWebhookEvent`). | Different verification secrets, processors, audit domains; invariant 6 (billing ≠ commerce). | One `WebhookEvent` table, Razorpay-only, one `RAZORPAY_WEBHOOK_SECRET`. | Two tables (master-plan recommendation). Reuse the two-phase pattern for both. | **YES** |
| **D8** | Hosting/topology: stay on Render (add worker service + staging + ≥2 API instances) or migrate. | Frozen §17 requires stateless backend + independently scalable workers + 3 environments; today: one instance, no staging. | `DEPLOYMENT.md`: "one instance", "No staging environment", "No containers / IaC". | Stay on Render initially: promote backend to ≥2 instances, add a dedicated worker service, add a `staging` environment. Not an architecture change. | **YES** |
| **D9** | Merchant Razorpay credential storage: KMS-wrapped encrypted column on `PaymentAccount` vs external secrets-manager reference. | Invariant 9 — credentials server-side, never to client or job payload. | Today credentials are `process.env` only; `RazorpayService.onModuleInit`. | Envelope-encrypted blob on `PaymentAccount`, data key from managed KMS; decrypt only in the provider adapter; never logged/serialized. | **YES** (Phase 8) |
| **D10** | Per-tenant order/invoice numbering scheme (today: global `PF-000001` / `INV-000001`). | Statutory GST invoice numbering may constrain the format per merchant jurisdiction. | `OrdersService.generateOrderNumber` (`PF-` + padded counter), `InvoiceNumberService.allocate` (`INV-` + padded), both global `app_settings` rows; format "PENDING CLIENT CONFIRMATION". | Per-tenant counter rows + per-tenant/store configurable prefix; unique within `(tenantId, …)`. **REQUIRES QUALIFIED LEGAL REVIEW** for GST invoices. | **YES** |
| **D11** | Which `AppSetting` keys are platform- vs tenant- vs store-owned. | The settings migration touches checkout, tax, invoicing, homepage simultaneously. | §12 of this document (17 keys inventoried). | All current business keys → tenant/store settings; the two counters → per-tenant. No platform-global business setting exists today; `PlatformConfig` is new if needed. | **YES** |
| **D12** | Tax model per tenant: keep India-GST only for v1, or generalize the tax engine ("general-purpose e-commerce"). | `tax.service.ts` is India-GST inclusive; `EXCLUSIVE` is code-complete but admin-locked. | `app-setting.constants.ts` (`ADMIN_SETTABLE_TAX_MODES = ['INCLUSIVE']`), `Order` tax-snapshot columns. | Keep the India-GST engine per-tenant for v1 (config moves global → tenant settings); design `TaxConfig` as a per-store strategy so other regimes are additive later. Not frozen. | **YES** |
| **D13** | Object storage: keep Cloudinary behind a new `StorageProvider` interface, or introduce S3-compatible storage now. | Frozen §14 wants an abstraction, not a fixed vendor. | `CloudinaryService` is the only storage impl; `deliveryType`/folder scheme are Cloudinary-specific; signed URL not time-boxed (needs `auth_token`). | Keep Cloudinary, introduce `StorageProvider` with Cloudinary as the first adapter. Architecture wants the abstraction, not a migration. | **YES** |
| **D-extra-1** | Billing provider for SaaS subscriptions. | Phase 7 needs a provider + its webhook payloads. | No billing code exists. | **"Billing provider selection = implementation/vendor decision."** Not chosen here. | Deferred to Phase 7 |
| **D-extra-2** | Queue technology (Phase 11). | The worker tier needs a substrate. | 3 in-process crons; Postgres outbox pattern already present. | Postgres-backed queue table is acceptable to the frozen architecture; Redis-backed is not frozen and conflicts with D1. Technology selection = implementation decision. | Deferred to Phase 11 |

**No decision above has been silently resolved.** Recommendations are the master plan's
non-binding proposals, restated for context.

---

## 20. Phase 0 Conclusions

1. **The repository is a well-built single-tenant, single-store application** on a *different*
   frozen architecture. Its business logic (pricing, order state machine, outbox, two-phase
   webhooks, reconciliation, upload validation, refresh-token security, immutable invoices) is
   high quality and **reusable** — the gap is structural, not qualitative.

2. **There is no tenancy substrate at any layer.** 0/25 tables have a tenant/store column;
   the role vocabulary is `{CUSTOMER, ADMIN}`; the admin control plane is one unscoped
   boundary; settings and payment credentials are global; `PrismaService` has no scoping seam;
   jobs carry no tenant context; the frontend is single-store with exactly one seam
   (`useStoreName`). Every one of the master plan's Phase 1–15 areas is confirmed still open.

3. **Ownership is entirely inferred, never declared.** Every ownership relationship is a plain
   FK to `users.id` or a transitive FK. Making ownership explicit, verified, and enforced is
   the core of Phase 4.

4. **Five entities are genuinely ambiguous** and are flagged `REQUIRES REVIEW` (not forced):
   `User` (customer-identity split), `WebhookEvent` (commerce vs billing), `OutboxEvent`
   (tenant vs platform events), `AppSetting` (per-key classification), `IdempotencyKey` (key
   scope).

5. **The single largest blocker is external:** whether the deployed database holds real
   merchant/customer data **cannot be determined from the repository** (no credentials, no
   dump). A read-only live data inventory must be run by whoever holds Render access, against
   a restored copy or replica, before Phase 4. **No default tenant has been invented.**

6. **Two frozen documents disagree.** `BLUEPRINT-v1.2.md §2` permanently prohibits the
   queue/worker tier that SaaS Architecture v1.0 requires. This needs one ACR (D1) before the
   async work (Phase 11) can proceed.

7. **Operational readiness is not there yet.** Backup/restore is `UNVERIFIED`; there is no
   staging environment; the backend is a single instance; DNS has not been cut over; Razorpay
   is in test mode. Several of these are hard preconditions for Phase 4's destructive
   migrations and for launch.

8. **8 hard migration blockers** (MP-1..MP-7, MP-13; MP-14 gates Phase 3 which gates Phase 4)
   and **15 open decisions** are registered. None was silently resolved.

9. **Nothing in the repository should be discarded.** Only two small, well-contained rebuilds
   (auth role model, settings storage) plus one ~90-line SEO build helper. Everything else is
   REUSE or REFACTOR.

10. **Phase 0 is complete. Phase 1 has not started and must not start** until D1, P0-D14,
    P0-D15, D3, D4 (and the rest of the register) are resolved and recorded with named owners,
    per the master plan's decision-lock exit criterion.

---

## 21. Phase 0 Exit Criteria

| Criterion | Status | Evidence in this document |
|---|:-:|---|
| Every Prisma model is inventoried | ✅ | §6 (25/25), §6.10 compact table |
| Every important relationship is mapped | ✅ | §8 (full FK graph, delete policies, fan-out, cross-tenant risks, conflicting uniques) |
| Every entity has an ownership classification | ✅ | §6 (per model) + §7 (PLATFORM 2 / TENANT 6 / STORE 12+ / AMBIGUOUS 5) |
| Ambiguous ownership is explicitly identified | ✅ | §7.4 (5 items, each with a `REQUIRES REVIEW` reason) — none forced |
| Auth / role implementation is mapped | ✅ | §9 (model, enum, guards, decorators, JWT claims, admin authz, frontend authz) + conceptual target mapping + session-migration risks |
| Admin boundaries are mapped | ✅ | §10 (current boundary, every endpoint, service access pattern, frontend routes, platform-vs-tenant target split) |
| Payment relationships are mapped | ✅ | §11 (Razorpay integration, models, webhook, reconciliation, invoice/refund relationships, env deps, reuse vs new billing) |
| Settings are mapped | ✅ | §12 (all 17 keys, read/write surfaces, sensitivity, single-store assumptions, PLATFORM/TENANT/STORE mapping) |
| Async jobs are mapped | ✅ | §13 (all 3 crons: trigger, process, data access, tenant context, idempotency, multi-instance safety, deps, risk) |
| Frontend store-awareness gaps are mapped | ✅ | §14 (13 concerns) |
| Production data availability is explicitly known | ✅ | §15 — **explicitly: cannot be verified from the repository**; the required statement is in §15.7 |
| Migration preconditions are documented | ✅ | §16 (14 preconditions, 8 blocking) |
| Reuse / refactor / rebuild areas are identified | ✅ | §17 (20 areas, evidence-cited; only 2 rebuilds + 1 helper) |
| Blocking decisions are registered | ✅ | §19 (15 decisions, D1–D13 + P0-D14/P0-D15 + 2 deferred; none silently resolved) |

**All 14 exit criteria are met. Phase 0 is COMPLETE.**

---

*End of PrintForge SaaS Phase 0 — Repository / Schema / Data Inventory.*
*This document is analysis only. No code, schema, migration, seed, environment, dependency, or
deployment configuration was changed. Phase 1 has not been started.*
