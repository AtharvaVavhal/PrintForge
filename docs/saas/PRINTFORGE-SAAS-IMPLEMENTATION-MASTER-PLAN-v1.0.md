# PrintForge SaaS — Implementation Master Plan v1.0

> **Authoritative implementation roadmap** for converting the existing single-tenant
> PrintForge application into the frozen **PrintForge SaaS Architecture v1.0**.
>
> This document plans work. It does **not** implement it. No source code, Prisma schema,
> migration, environment file, dependency, or deployment configuration is changed by the
> task that produced this document.

---

## 1. Document Control

| Field | Value |
|---|---|
| Document | PrintForge SaaS Implementation Master Plan |
| Version | 1.0 |
| Status | DRAFT FOR REVIEW (planning only — no code) |
| Date | 2026-09-05 |
| Owner | ForgeBuilds Engineering |
| Supersedes | — |
| Authoritative inputs | `PRINTFORGE-SAAS-ARCHITECTURE-v1.0.pdf` (FROZEN, 35 pp, 19/19 steps, 20 invariants); Approved PrintForge SaaS Repository Gap Audit (APPROVED); the actual `AtharvaVavhal/PrintForge` repository at commit `b20c849` |
| Frozen documents NOT modified by this plan | SaaS Architecture v1.0; the approved Gap Audit |
| Repository docs referenced | `docs/architecture/ARCHITECTURE-FREEZE.md`, `docs/architecture/BLUEPRINT-v1.2.md`, `docs/ops/DEPLOYMENT.md`, `docs/ops/BACKUP-RESTORE.md`, `docs/ops/ENVIRONMENT.md`, `docs/ops/PRODUCTION-SMOKE-TEST.md`, `docs/architecture/PHASE-10-PROPOSAL.md` |
| Phase count | 16 (Phase 0 through Phase 15) |
| Change control | Any change to the SaaS Architecture v1.0 requires the 11-point Architecture Change Request (ACR) process in Part VII of the frozen handbook. This plan never overrides the architecture. |

### 1.1 How this plan maps to the architecture's own roadmap

The frozen handbook's Part VIII lists an 8-phase build sequence (Foundations → Entitlement &
Billing → Store & Storefront → Commerce & Payments → Assets & Customization → Async &
Operational Backbone → Security, Legal & Governance → Observability, Recovery & Launch
Validation). This plan decomposes that sequence into the 16 finer phases the task requires.
The mapping:

| Handbook phase | This plan's phases |
|---|---|
| 0 — Foundations | Phase 0, Phase 1, Phase 2, Phase 3, Phase 4 |
| 1 — Entitlement & Billing | Phase 6, Phase 7 |
| 2 — Store & Storefront | Phase 9, Phase 12 |
| 3 — Commerce & Payments | Phase 8 (+ existing commerce, re-scoped in Phase 3/Phase 12) |
| 4 — Assets & Customization | Phase 10 |
| 5 — Async & Operational Backbone | Phase 11 |
| 6 — Security, Legal & Governance | Phase 5, Phase 13, Phase 15 |
| 7 — Observability, Recovery & Launch Validation | Phase 14, Phase 15 |

### 1.2 Markers used in this document

- **REQUIRES DECISION** — an ambiguity this plan deliberately does **not** resolve. It needs
  a product, commercial, legal, or ops decision, or confirmation of an external fact (e.g.
  production data), before the affected phase can start. All open decisions are collected in
  §4.4.
- **IMPLEMENTATION / CONFIGURATION — NOT FROZEN** — a vendor/technology/number left open by
  the frozen architecture. Named here as an input needed, never pre-decided.
- **REQUIRES QUALIFIED LEGAL REVIEW** — a legal artifact or workflow named without wording.

---

## 2. Executive Summary

### 2.1 Where the repository stands

The repository is a **well-built, thoroughly tested single-tenant e-commerce application**
built to a different frozen architecture (`BLUEPRINT-v1.2.md`, "Architecture Freeze" dated
25 Aug 2026). It is a NestJS 11 modular monolith (`backend/`, 15 domain modules, ~165 TS
source files) with a React 19 + Vite + TanStack Query SPA (`frontend/`, ~358 TS/TSX files),
one PostgreSQL database via Prisma (25 models, 12 enums, 9 migrations), deployed to Render
(one backend instance) and Vercel. It has a real e2e suite against a real Postgres
(`backend/test/e2e/`, 18 specs) and ~230 unit/component test files.

Its business logic is high quality and largely reusable: server-authoritative pricing,
compare-and-swap order state machine, transactional outbox, two-phase idempotent webhook
processing, active payment reconciliation, magic-byte upload validation, rotated/revocable
refresh tokens. **None of it is disposable.**

What it does **not** have, at any layer:

- No `Tenant`, `Store`, `StoreDomain`, `TenantMembership`, `Plan`, `PlanFeature`,
  `PlanLimit`, `Usage`, `Subscription`, `PaymentAccount`, `LegalDocument`, or
  `AcceptanceRecord` model — confirmed against `backend/prisma/schema.prisma`.
- No tenant column on **any** of the 25 tables. Every ownership check is either a direct
  `user.id` comparison (`OrdersService.assertOwnedBy`, `CartService.getOwnedItemOrThrow`,
  `UploadsController.findOne`) or a global `role` check.
- A two-value role enum: `Role { CUSTOMER, ADMIN }` (`backend/src/common/enums/role.enum.ts`).
  `RolesGuard` compares `user.role` (a string carried in the JWT) to a hard-coded value.
  There is no `SUPER_ADMIN`, no membership, no permission concept.
- A single global control plane: `@Controller('admin') @Roles(Role.ADMIN)`
  (`backend/src/admin/admin.controller.ts`) — one `ADMIN` operates on **all** data.
  `AdminService.getDashboard()` aggregates `prisma.order.groupBy` with no scoping.
- A single global key–value settings table (`AppSetting`), with store identity
  (`storeName`, `storeAdminName`), the flat shipping fee, GST config, and invoice seller
  identity all as **global** rows (`backend/src/app-setting/app-setting.constants.ts`).
- One Razorpay account, read from process env
  (`backend/src/payments/razorpay/razorpay.service.ts`, `RAZORPAY_KEY_ID/KEY_SECRET/
  WEBHOOK_SECRET`). No per-merchant payment context.
- Three in-process `@nestjs/schedule` cron pollers (outbox 30 s, webhook retry 30 s,
  reconciliation 5 min) that **assume a single backend instance**
  (`backend/src/scheduler-registration.spec.ts` pins `ScheduleModule.forRoot()` to exactly
  one call site; concurrency safety is `FOR UPDATE SKIP LOCKED` on one DB, not multi-node).
- A single `PrismaService` (`extends PrismaClient`) with **no** client extension, middleware,
  or RLS — nothing that could enforce a tenant filter globally.
- A frontend with one hard-coded API origin (`VITE_API_BASE_URL`), one hard-coded canonical
  site URL fallback (`https://www.printforge.in` in `frontend/src/seo/siteConfig.ts`), and
  ad-hoc TanStack Query keys (`['products','list',params]`, `['settings','storeName']`) with
  **no tenant/store namespace**.

The repository's own `ARCHITECTURE-FREEZE.md` **explicitly prohibits** Redis, queues
(Bull/BullMQ), Kafka, microservices, and additional infrastructure. The SaaS Architecture
v1.0 **requires** a tenant-aware queue/worker tier and multi-instance-safe scheduled jobs.
This is the single largest governance conflict and is flagged as **REQUIRES DECISION**
(§4.4-D1): the SaaS handbook is the superseding frozen architecture, but retiring
`BLUEPRINT-v1.2` in favour of it should be recorded through the repo's own ACR process so
the prohibited-technology list is formally lifted for the queue tier.

### 2.2 What this plan delivers

A 16-phase, dependency-ordered, rollback-aware roadmap that:

1. **Builds** the SaaS foundation (tenant/store/membership/entitlement/subscription/payment-
   account/legal/observability models and their enforcement).
2. **Reuses** the existing commerce, catalog, cart, checkout, payments, coupons, reviews,
   invoicing, uploads, outbox, and webhook logic, re-scoped rather than rewritten.
3. **Refactors** authorization from role-string to membership+permission, and data access
   from `userId`-scoped to `tenantId`/`storeId`-scoped.
4. **Migrates** the existing single deployment's data into an explicit first tenant — only
   after the production-data question (§4.4-D2) is answered — via an
   inventory → map → backfill → validate → constrain sequence with verified backups at each
   destructive step.
5. **Verifies** every tenant-isolation change with paired positive/negative authorization
   tests, and gates production SaaS launch on a Definition of Done (§27) that requires proven
   isolation, a tested restore, and a validated production migration.

### 2.3 The answers to the nine planning questions

| # | Question | Short answer (detail in the phases) |
|---|---|---|
| 1 | What must be built? | Tenant/Store/StoreDomain/TenantMembership; SUPER_ADMIN + 4 tenant roles + permission model; server-derived tenant context; Plan/PlanFeature/PlanLimit/Usage/Entitlement; Subscription/SubscriptionEvent/SaaS-Invoice + billing-provider abstraction; PaymentAccount + payment-provider abstraction; domain resolution; tenant-aware asset ownership + storage abstraction; tenant-aware async/queue tier; LegalDocument/version/hash/AcceptanceRecord + e-sign + privacy workflows; platform observability + tested backup/restore; the platform + tenant admin surfaces; tenant-isolation test suite. |
| 2 | What can be reused? | Auth primitives (JWT + rotated refresh tokens, `tokenVersion` revocation), pricing/tax/coupon engines, order state machine, checkout transaction, outbox, webhook two-phase processor, reconciliation, invoice generation, upload magic-byte validation + Cloudinary abstraction seed, the entire storefront + admin React component libraries, the CI structure, the e2e harness (`backend/test/e2e/support/`). See §24. |
| 3 | What must be refactored? | `RolesGuard`/`role.enum.ts`/`roles.decorator.ts` → permission checks; every service's ownership check → tenant/store scope; `PrismaService` → tenant-scoped access path; `AppSetting` → tenant vs platform split; `admin.controller.ts` → two control planes; `AdminService` aggregates → tenant-scoped; frontend `AuthProvider`/`authStore`/query keys/`siteConfig` → store-aware; JWT payload + `AuthenticatedUser`. |
| 4 | What must be migrated? | Every existing row of all 25 tables into an explicit Tenant #1 + its primary Store, with verified backfill; `User` rows split into merchant identities vs store-scoped customers (**REQUIRES DECISION** §4.4-D5); global counters/settings into per-tenant rows; global unique constraints (`coupons.code`, `reviews (productId,userId)`, `products.slug`, `categories.slug`) into tenant/store-composite constraints. |
| 5 | What depends on what? | Strict spine: 0 → 1 → 2 → 3 → 4 → 5, then 6 → 7 → 8, 9 alongside 5–8, 10 after 3–4, 11 after 3, 12 after 9 + 3, 13 after 5, 14 continuous / hard gate before 15, 15 last. See §22. |
| 6 | Safest order? | The phase numbering **is** the safe order. Foundational models and dual-write compatibility columns first; backfill and constraint tightening only against verified backups; isolation enforcement flipped from "advisory" to "enforced" only once negative tests exist; legacy `userId`-only paths removed last. |
| 7 | Major risks? | 18 in the register (§23) — led by cross-tenant data leak, incorrect ownership backfill, session/identity migration breakage, SUPER_ADMIN becoming an unscoped bypass, commerce/SaaS payment commingling, async tenant-context loss, cache contamination, destructive migration without a proven restore. |
| 8 | How is each phase verified? | Every phase has explicit **VERIFICATION / ACCEPTANCE CRITERIA** and **EXIT CRITERIA** below, anchored to concrete test files/suites. Tenant-isolation phases additionally require paired positive+negative authorization tests before the isolation change ships. |
| 9 | What's required before production SaaS launch? | The Definition of Done in §27: all P0 resolved, P1 disposition documented, tenant isolation proven, membership authz proven, both control planes proven, entitlements enforced, subscriptions authoritative, payment flows separated, domains resolving, assets tenant-safe, jobs carrying tenant context, storefront store-aware, legal acceptance auditable, security verified, backups protected, **restore tested**, production migration validated, production smoke passing. |

---

## 3. Current Repository Baseline

All claims below were verified by direct file inspection at commit `b20c849`.

### 3.1 Repository shape

```
backend/    NestJS 11 modular monolith. 15 domain module dirs under src/:
            auth, users, products (+categories, variants, customizations),
            uploads, cart, checkout (+pricing, tax, idempotency), orders
            (+state-machine, history), payments (+razorpay, webhooks),
            invoices, coupons, reviews, notifications (+outbox, email, templates),
            app-setting, postal, admin, common (guards/decorators/config/health/
            database/filters/interceptors).
frontend/   React 19, Vite 8, React Router 7, TanStack Query 5, Axios, RHF, Zod,
            CSS Modules. pages/, features/, components/, hooks/ (~70 query hooks),
            services/api/ (axios client + per-domain modules), seo/, layouts/.
docs/       architecture/ (BLUEPRINT-v1.2 + freeze + Phase-10 ACR), ops/
            (deployment, backup-restore, environment, smoke-test, advisories).
.github/    workflows/ci.yml — hygiene + backend + frontend jobs.
```

No `Dockerfile`, no container/IaC manifest, no `render.yaml`. `frontend/vercel.json` is the
only deploy manifest (SPA rewrite to `/index.html`).

### 3.2 Complete Prisma model inventory (`backend/prisma/schema.prisma`, 801 lines)

**Identity & auth (2):** `User` (`@@map("users")`), `RefreshToken`.
**Catalog (4):** `Category`, `Product`, `ProductImage`, `ProductVariant`, `CustomizationField`
  (5 — counted here as catalog).
**Uploads (1):** `UploadedFile`.
**Cart (3):** `Cart`, `CartItem`, `CartItemCustomization`.
**Orders & commerce (7):** `Order`, `Invoice`, `OrderItem`, `OrderItemCustomization`,
  `PaymentAttempt`, `Refund`, `OrderStatusHistory`.
**Payments infrastructure (3):** `WebhookEvent`, `IdempotencyKey`, `OutboxEvent`.
**Admin config (1):** `AppSetting`.
**Reviews (1):** `Review`.
**Coupons (2):** `Coupon`, `CouponUsage`.

**Total: 25 models.** (Catalog block is `Category`, `Product`, `ProductImage`,
`ProductVariant`, `CustomizationField` = 5; grand total 25.)

**Enums (12):** `Role` (CUSTOMER, ADMIN), `CustomizationFieldType`, `SurchargeType`,
`OrderStatus` (9 values), `PaymentAttemptStatus`, `WebhookEventStatus`, `OutboxEventType`
(ORDER_PAID, ORDER_STATUS_CHANGED, PASSWORD_RESET_REQUESTED), `OutboxEventStatus`,
`RefundStatus`, `ReviewStatus`, `CouponType`, `CouponScopeType`.

### 3.3 Foreign-key / ownership graph (current)

The user is the sole ownership root for customer data; the catalog has no owner at all.

```
User ──1:1── Cart ──1:N── CartItem ──1:N── CartItemCustomization ──?── UploadedFile
  │                            │  └── Product (RESTRICT), ProductVariant (RESTRICT)
  ├──1:N── Order ──1:N── OrderItem ──1:N── OrderItemCustomization ──?── UploadedFile (RESTRICT)
  │          ├──1:N── PaymentAttempt ──1:N── Refund
  │          ├──1:N── OrderStatusHistory ──?── User (changedBy, SET NULL)
  │          ├──0:1── Invoice
  │          ├──0:1── IdempotencyKey (resultOrder)
  │          ├──0:1── CouponUsage
  │          └──?── Coupon (SET NULL)
  ├──1:N── UploadedFile (uploadedByUserId, RESTRICT)
  ├──1:N── RefreshToken
  ├──1:N── Review ──N:1── Product (RESTRICT), OrderItem (RESTRICT)
  ├──1:N── IdempotencyKey
  ├──1:N── Coupon (createdByAdminId, RESTRICT)
  └──1:N── CouponUsage

Category ──self (parentCategoryId, SET NULL) ──1:N── Product ──1:N── ProductImage / ProductVariant / CustomizationField
Coupon ──?── Category (SET NULL)

Ownerless / global: Category, Product, ProductImage, ProductVariant, CustomizationField,
AppSetting, WebhookEvent, OutboxEvent.
```

**FK delete policy:** almost everything is `ON DELETE RESTRICT` (historical/audit
immutability — `orders.userId`, `order_items.orderId`, `payment_attempts.orderId`,
`refresh_tokens.userId`, catalog parent→child). `SET NULL` is used where the reference is
incidental (`orders.couponId`, `order_items.productId`, `categories.parentCategoryId`,
`cart_item_customizations.uploadedFileId`, `order_status_history.changedByUserId`).

### 3.4 Unique constraints & indexes (from `migrations/20260825190725_init/migration.sql`
+ later migrations)

**Unique:** `users.email`; `categories.slug`; `products.slug`;
`product_variants (productId, label)`; `uploaded_files.cloudinaryPublicId`;
`carts.userId`; `orders.orderNumber`; `orders.razorpayOrderId`;
`payment_attempts.razorpayPaymentId`; `webhook_events.razorpayEventId`;
`idempotency_keys.key`; `idempotency_keys.resultOrderId`; `outbox_events.eventKey`;
`app_settings.key`; `invoices.invoiceNumber`; `invoices.orderId`;
`reviews (productId, userId)`; `coupons.code`; `coupon_usages.orderId`;
`refunds.razorpayRefundId`.

**Partial unique (hand-added SQL in the init migration):**
`CREATE UNIQUE INDEX payment_attempts_order_captured_unique ON payment_attempts("orderId")
WHERE status = 'CAPTURED'` — the "≤1 captured attempt per order" invariant.

**Secondary indexes:** `refresh_tokens (userId)`, `(tokenHash)`;
`categories (parentCategoryId)`; `products (categoryId)`; `product_images (productId)`;
`product_variants (productId)`; `customization_fields (productId)`;
`uploaded_files (uploadedByUserId)`; `cart_items (cartId)`; `orders (userId)`,
`(status)`, `(couponId)`; `order_items (orderId)`; `order_status_history (orderId)`;
`payment_attempts (orderId)`; `webhook_events (status, availableAt)`;
`outbox_events (status, availableAt)`; `invoices (issuedAt)`;
`reviews (productId)`, `(status)`; `coupons (isActive)`;
`coupon_usages (couponId, userId)`.

Every one of these `slug`, `email`, `code`, `(productId,userId)` uniques and every
single-column index becomes **wrong or inefficient** in a multi-tenant world and is
re-planned in Phase 4.

### 3.5 Current auth & role model

- **Tokens** (`backend/src/auth/auth.service.ts`, `strategies/jwt.strategy.ts`): stateless
  JWT access token (15 min, `JWT_ACCESS_SECRET`), payload `{ sub, email, role, tokenVersion }`.
  Opaque refresh token, hashed at rest in `refresh_tokens`, rotated on every use, family-
  revoked on reuse detection, `users.tokenVersion` incremented on password change / logout-all
  for near-instant access-token revocation.
- **Refresh cookie:** `httpOnly`, `Secure`, `SameSite=Strict`, `Path`-scoped,
  **`Domain` omitted** — depends on frontend and backend sharing a registrable domain
  (`www.printforge.in` / `api.printforge.in`). DNS cutover is still pending (Readme.md
  "Project Status").
- **Guards** (global via `APP_GUARD` in `app.module.ts`): `ThrottlerGuard` (20 req/60 s per
  IP), `JwtAuthGuard` (every route protected unless `@Public()`), `RolesGuard` (checks
  `@Roles(Role.ADMIN)` metadata against `user.role`).
- **`AuthenticatedUser`** (`common/decorators/current-user.decorator.ts`): `{ id, email, role }`
  — deliberately minimal; the doc comment says "anything beyond identity/role is looked up
  fresh… never trusted from the token."
- **Object-level authz:** performed per handler, not centralized. Examples verified:
  `OrdersService.assertOwnedBy(order, userId)`, `CartService.getOwnedItemOrThrow`,
  `UploadsController.findOne` (`file.uploadedByUserId !== user.id && role !== ADMIN`),
  `ReviewsService.getReviewOwnedByOrThrow`, `CheckoutService.loadOrderView`
  (`order.userId !== userId`), `AdminService.getCustomerDetail` (scoped to `role: CUSTOMER`).
  `IdempotencyKey` lookups also cross-check `userId`.

### 3.6 Admin boundary (current)

One controller: `backend/src/admin/admin.controller.ts`, class-level `@Roles(Role.ADMIN)`.
Routes: `GET/PATCH /admin/orders[/:id][/status]`, `GET /admin/orders/:id/invoice`,
`GET /admin/dashboard`, `GET /admin/customers[/:id]`, `PATCH /admin/reviews/:id/status`,
`GET/POST /admin/coupons[/:id]`, `PATCH /admin/coupons/:id`, `GET/PATCH /admin/settings[/:key]`.
Catalog admin lives on the product/category controllers under `@Roles(Role.ADMIN)`
(`products.controller.ts`: `GET /products/admin`, `POST /products`, etc.).
`AdminService.getDashboard()` runs **unscoped** `prisma.order.groupBy` / `aggregate` — it
sees every order in the database. There is exactly one admin per deployment, promoted by a
manual `UPDATE users SET role='ADMIN'` (documented in `docs/ops/DEPLOYMENT.md` §8).

### 3.7 Payment model (current)

`Order 1→N PaymentAttempt` (`INITIATED/CAPTURED/FAILED/ABANDONED`), `PaymentAttempt 1→N
Refund` (`PENDING/PROCESSED/FAILED`, recorded not automated). `WebhookEvent` (two-phase:
controller verifies HMAC + persists; `WebhookProcessor` `@Cron(EVERY_30_SECONDS)` processes
transactionally with bounded backoff + dead-letter + Sentry). `PaymentReconciliationService`
`@Cron(EVERY_5_MINUTES)` queries Razorpay directly for stuck `PENDING_PAYMENT` orders.
`RazorpayService` is a thin wrapper over the SDK, credentials from **process env**
(`configuration.ts` → `razorpay.keyId/keySecret/webhookSecret`), single account for the whole
platform. Amounts are always server-computed in `bigint` paise. Order↔payment separation of
concerns is explicit and clean.

### 3.8 Invoice & tax model (current)

`Invoice` — one immutable invoice per order (`orderId @unique`), every monetary field a
snapshot of the order's already-immutable columns, plus `sellerSnapshot` JSON frozen from
**global** admin settings (`invoice.sellerLegalName/Address/Gstin/State`). `invoiceNumber`
from a dedicated global counter row `invoice_number_counter` in `app_settings`
(`backend/src/invoices/invoice-number.service.ts`), prefix `invoice.numberPrefix`.
Tax is India-GST, tax-inclusive by default, `taxAmount` stays `0.00` until a client-confirmed
rate is enabled; `EXCLUSIVE` mode is code-complete but admin-locked
(`app-setting.constants.ts`). All tax/seller config is **global**, single-tenant.

### 3.9 Upload model (current)

`UploadedFile` (`uploadedByUserId` non-nullable, `cloudinaryPublicId @unique`,
`resourceType`, `deliveryType`). Backend-proxied only. `UploadsService.create` looks up the
uploader's role: `ADMIN` → `products/` folder, `deliveryType: 'upload'` (public CDN);
everyone else → `customizations/{userId}/` folder, `deliveryType: 'authenticated'` (signed,
short-lived URL). `CloudinaryService.resolveFolder` builds
`printforge/{NODE_ENV}/products` vs `printforge/{NODE_ENV}/customizations/{userId}`.
Magic-byte validation (`utils/file-signature.util.ts`), 10 MB stream limit
(`UPLOAD_MAX_BYTES`), PNG/JPEG/PDF only, no server-side parsing. Ownership re-verified on
every referencing write (cart/order customization). Order customization rows snapshot the
field label + `uploadedFileId` and are `RESTRICT` (referenced files never orphan-cleaned).
There is **no orphan-cleanup poller yet** — the schema comments describe one; it is not
implemented (no cron for uploads found).

### 3.10 Settings model (current)

Single `AppSetting` key–value table. `PUBLIC_SETTING_KEYS` (readable unauthenticated via
`GET /settings`): `announcement_text`, `hero_slides`, `banners`, `showcase_categories`,
`storeName`. Admin-only definitions (`ADMIN_SETTING_DEFINITIONS`): `storeName`,
`storeAdminName`, `shippingFeeFlat`, `announcement_text`, `tax.enabled`, `tax.pricingMode`,
`tax.ratePercent`, `invoice.numberPrefix`, `invoice.sellerLegalName`,
`invoice.sellerAddress`, `invoice.sellerGstin`, `invoice.sellerState`. Internal rows
(not in either list): `order_number_counter`, `invoice_number_counter`. Every one of these
is **global** and must be classified platform-owned or tenant-owned in Phase 4.

### 3.11 Jobs & webhooks (current)

Three `@nestjs/schedule` cron providers, all discovered by the **single**
`ScheduleModule.forRoot()` in `app.module.ts` (invariant pinned by
`backend/src/scheduler-registration.spec.ts`):

| Provider | Cadence | Safety mechanism | Multi-instance safe? |
|---|---|---|---|
| `OutboxPoller` (`notifications/outbox/outbox.poller.ts`) | 30 s | `SELECT … FOR UPDATE SKIP LOCKED` claim, bounded retry (5), backoff, `FAILED` dead-letter | Claim is row-safe, but every instance would poll → wasted work, and no leader election |
| `WebhookProcessor` (`payments/webhooks/webhook-processor.service.ts`) | 30 s | `FOR UPDATE` re-select in txn, bounded retry (6), backoff, `FAILED` dead-letter, Sentry, non-retryable `PaymentMismatchError` | Same |
| `PaymentReconciliationService` (`payments/payment-reconciliation.service.ts`) | 5 min | row-lock + CAS transition, partial-unique backstop, bounded batch | Same |

`OutboxEvent` payload carries `email`/`userId` (denormalized), **not** a tenant id.
`NotificationsService.enqueueOutboxEvent(tx, event)` is the only insert path, always inside
the caller's transaction. `OutboxEventType` has exactly 3 values. There is **no** generic
queue, **no** Redis, and the freeze doc forbids adding one.

### 3.12 Frontend state & query architecture (current)

- `frontend/src/App.tsx` — `<BrowserRouter>` with two route trees: everything under
  `<RootLayout>` (storefront chrome) with a nested `<ProtectedRoute>` group, and
  `/admin/*` under `<AdminRoute>` → `<AdminLayout>` (separate admin shell, no storefront
  chrome). `AdminRoute` (`features/auth/AdminRoute.tsx`) checks `status` + `user?.role !==
  'ADMIN'` → redirect `/forbidden`.
- Auth state: module-level store `services/api/authStore.ts` consumed via
  `useSyncExternalStore` in `features/auth/AuthProvider.tsx`; the axios client's interceptor
  and React both read the same store. Bootstrap does a silent `POST /auth/refresh` on mount.
- API client: **one** axios instance (`services/api/client.ts`), `baseURL =
  import.meta.env.VITE_API_BASE_URL`, `withCredentials: true`, single-flight refresh promise
  (`refreshSession()`), 401 → refresh → retry-once.
- Query keys: ad-hoc arrays per hook — `['products','list',params]`,
  `['products','detail',slug]`, `['categories','tree']`, `['cart']`, `['orders','list',params]`,
  `['admin','orders','list',params]`, `['settings','storeName']`, `['homepage','settings']`,
  `['invoice',orderId]`, etc. `queryClient` (`services/queryClient.ts`) has only `retry: 1`;
  no global `staleTime`. **No store/tenant segment in any key.**
- SEO: `frontend/src/seo/` — React-19 native `<title>`/`<meta>` via a `<Seo>` component per
  route, `siteConfig.ts` resolves `SITE_URL` from `VITE_SITE_URL` **or the hard-coded frozen
  origin `https://www.printforge.in`**; `seoFiles.ts` emits `robots.txt`/`sitemap.xml` at
  **build time** from that single origin.
- `frontend/src/hooks/useStoreName.ts` already reads a configurable store name from
  `GET /settings` with a `'PrintForge'` fallback — a small existing seam toward store-aware
  chrome, but everything else (catalog, cart, prices) is single-store.
- Error/loading: shared `ErrorState`/`EmptyState`/`Skeleton`/`FullPageLoader` primitives,
  storefront/admin parity enforced by recent commits (`UX-49`).

### 3.13 Deployment assumptions (current)

From `docs/ops/DEPLOYMENT.md` + `docs/ops/BACKUP-RESTORE.md` + `.github/workflows/ci.yml`:

- Backend → **Render, one Node web service, one instance**. Frontend → Vercel static.
  DB → Render PostgreSQL (single, "sole source of truth").
- Deploy = `git push` to `develop`/`main` (auto-deploy) or manual. Build:
  `npm ci && prisma generate && nest build`. Migrations: `prisma migrate deploy`
  (**forward-only — Prisma has no down-migrations**). Start: `node dist/main`.
- Env validated at boot (`common/config/env.validation.ts`): `NODE_ENV/PORT/DATABASE_URL/
  JWT_ACCESS_SECRET/REFRESH_TOKEN_SECRET` always; `PRODUCTION_REQUIRED_KEYS` (Razorpay ×3,
  Cloudinary ×3, Resend ×2, `FRONTEND_URL`, `BACKEND_URL`) when `NODE_ENV=production`.
  `SENTRY_DSN` optional.
- Health: `GET /health` (process), `GET /health/deep` (DB `SELECT 1`).
- **No staging environment.** **No containers / IaC.** `SameSite=Strict` refresh cookie
  requires the shared registrable domain that **has not been cut over yet**.
- Backup/restore doc status: **"DOCUMENTED — NOT VERIFIED. No restore has been performed or
  tested."** Render backup cadence/retention/PITR **unconfirmed**. RTO **undefined**.

### 3.14 Current tests

- Backend unit: ~130 `*.spec.ts` co-located with sources (services, guards, utils, DTOs).
- Backend e2e (`backend/test/e2e/`, real Postgres via CI `postgres:16` service, serial,
  `resetDatabase` between tests, `FakeCloudinaryService`, local HMAC signing):
  `app`, `health`, `auth-security`, `checkout-security`, `checkout-concurrency`,
  `payments-race`, `webhook-retry`, `payment-reconciliation`, `order-status-transitions`,
  `admin-control-plane`, `tax-and-invoicing`, `product-search`, `product-image-delivery`,
  `upload-magic-bytes`, `postal-lookup` (18 spec files total).
- Frontend: ~100 `*.test.tsx`/`*.test.ts` (Vitest + jsdom + Testing Library +
  `axios-mock-adapter`).
- **Zero tenant-isolation tests** (there is no tenant). `admin-control-plane.e2e-spec.ts`
  tests the single global admin boundary and "internal settings / inactive rows stay hidden
  from the public surface" — a useful pattern to extend, not a tenant test.

### 3.15 Current production-data dependencies (as documented)

- `backend/prisma/seed.ts` is a **stub**; `seed-production.ts` and
  `seed-storefront-preview.ts` exist for catalog/preview data. Real catalog + the first
  admin are created "through the running app," not seeded (`DEPLOYMENT.md` §4/§8).
- The Readme states the backend + frontend are **already deployed** to Render/Vercel with
  **Razorpay test-mode** credentials and a "production Postgres instance," but a full live
  payment smoke test, live Razorpay keys, real Resend, and DNS cutover are all still
  outstanding — i.e. **not yet a launched product**.
- **Whether that deployed database currently holds real merchant/customer data cannot be
  determined from the repository.** This is **REQUIRES DECISION / external confirmation**
  (§4.4-D2) and is a hard precondition for Phase 4.

### 3.16 Ownership classification of every current model

| Model | SaaS ownership (target) | Notes / redesign |
|---|---|---|
| `User` | **Platform-owned** (central identity) | But storefront shoppers are currently `User` rows too — see D5. Embedded shipping address moves to `Customer`. |
| `RefreshToken` | Platform-owned (per-User) | Add nothing; session is global to identity. Token payload gains membership/context — Phase 2. |
| `Category` | **Tenant-owned** (store-owned) | Add `tenantId`+`storeId`. `slug` unique → `(storeId, slug)`. Self-parent FK must stay same-tenant. |
| `Product` | Tenant-owned (store-owned) | `slug` unique → `(storeId, slug)`. `categoryId` FK must be same-store (composite FK). `avgRating`/`reviewCount` denorm unaffected. |
| `ProductImage` | Tenant-owned (via Product) | Inherit tenant through `productId`; add `tenantId` for index efficiency + isolation defense-in-depth. |
| `ProductVariant` | Tenant-owned (via Product) | `(productId, label)` unique already tenant-safe once `productId` is. |
| `CustomizationField` | Tenant-owned (via Product) | Same as ProductImage. |
| `UploadedFile` | **Tenant-owned** (Asset) | Add `tenantId` (+ `storeId` where store-scoped), `visibility` (public/private), `kind` (customer-original vs production-output — architecture §14). `uploadedByUserId` → nullable / `customerId`. |
| `Cart` | Tenant-owned (store-owned) | `userId @unique` → `(storeId, customerId)` unique. One open cart per customer per store. |
| `CartItem` / `CartItemCustomization` | Tenant-owned (via Cart) | Inherit; composite FKs to same-store product/variant/field. |
| `Order` | Tenant-owned (store-owned) | Add `tenantId`+`storeId`+`customerId`. `orderNumber` unique → `(tenantId, orderNumber)`; per-tenant counter. Shipping snapshot unchanged. `couponId` same-store. |
| `Invoice` | Tenant-owned (via Order) | `invoiceNumber` unique → `(tenantId, invoiceNumber)`; per-tenant counter + prefix; `sellerSnapshot` from **tenant** settings. |
| `OrderItem` / `OrderItemCustomization` | Tenant-owned (via Order) | Inherit; snapshots already immutable. |
| `PaymentAttempt` | Tenant-owned (via Order) — **commerce payment** | Add `tenantId`+`paymentAccountId`. Partial-unique `(orderId) WHERE CAPTURED` unchanged. |
| `Refund` | Tenant-owned (via PaymentAttempt) — commerce refund | Add `tenantId`. Must never share a path with SaaS-billing refunds (invariant 6). |
| `OrderStatusHistory` | Tenant-owned (via Order) — **tenant audit** | Add `tenantId`. This is *tenant* audit data, distinct from platform audit (Phase 5). |
| `WebhookEvent` | **Ambiguous → REQUIRES DECISION (D6)** | Commerce webhooks are tenant-scoped (resolve via `razorpayOrderId` → Order → tenant, or via `paymentAccountId`). SaaS-billing webhooks are platform-scoped. Likely split into two tables/streams. |
| `IdempotencyKey` | Tenant-owned (per checkout) | Add `tenantId`; `key` unique → `(tenantId, key)` or keep global (keys are server-generated UUIDs — low risk, decide in Phase 3). |
| `OutboxEvent` | **Mixed** | Tenant events carry `tenantId` (mandatory — architecture §15 invariant 14); platform events (e.g. platform admin notifications) carry none. Add nullable `tenantId` + a `scope` discriminator. |
| `AppSetting` | **Split** | Store identity / shipping / tax / seller identity / homepage content → **tenant-owned** (`TenantSetting` / `StoreSetting`, keyed by `(tenantId[, storeId], key)`). `order_number_counter` / `invoice_number_counter` → **per-tenant** counters. No row stays purely platform-global except possibly a future platform-config table. |
| `Review` | Tenant-owned (store-owned) | `(productId, userId)` unique → `(storeId, productId, customerId)`. `orderItemId` verified-purchase anchor stays, scoped to same store. |
| `Coupon` | Tenant-owned (store-owned) | `code` unique → `(storeId, code)`. `createdByAdminId` → a `TenantMembership`/`User` in that tenant. `categoryId` same-store. |
| `CouponUsage` | Tenant-owned (via Coupon/Order) | Add `tenantId`; `(couponId, userId)` count → `(couponId, customerId)`. |

**New models to add (none exist today):** `Tenant`, `Store`, `StoreDomain`,
`TenantMembership`, `Permission`/`RolePermission` (or a permission catalogue),
`Plan`, `PlanFeature`, `PlanLimit`, `Usage`, `Entitlement` (may be computed, not stored —
Phase 6), `Subscription`, `SubscriptionEvent`, `SaasInvoice` (+ line items),
`PaymentAccount`, `LegalDocument`, `LegalDocumentVersion`, `AcceptanceRecord`,
`ESignRequest` (Enterprise), `PrivacyRequest`, `PlatformAuditLog`, `TenantAuditLog`
(if not reusing `OrderStatusHistory`-style per-domain logs), `BillingWebhookEvent`
(if `WebhookEvent` is split), `AssetCleanupJob`/orphan tracking (if needed).

---

## 4. Frozen Architecture Reference

### 4.1 The 20 invariants (verbatim from Part VII of the handbook) and where this plan
enforces each

| # | Invariant | Enforced by phase(s) |
|---|---|---|
| 1 | Client-supplied tenantId is never an authorization boundary | 3 (tenant context server-derived), 15 (negative tests) |
| 2 | Every tenant-owned resource has an enforced tenant ownership path | 1, 3, 4 (composite FKs + constraints) |
| 3 | Cross-tenant data access is prohibited (at the data-model level) | 3, 4, 15 |
| 4 | Platform Admin and Tenant Admin are separate security domains | 2, 5 |
| 5 | Super Admin access is scoped and audited | 5 (scoped access + `PlatformAuditLog`) |
| 6 | SaaS subscription billing and merchant commerce payments are separate | 7, 8 (separate models, ledgers, refund paths) |
| 7 | Platform legal documents and merchant-store legal documents are separate | 13 |
| 8 | Payment amounts are server-authoritative | reuse existing (`PricingService`, `bigint` paise) — 8 |
| 9 | Payment credentials remain server-side | 8 (`PaymentAccount` encrypted, never to client) |
| 10 | Webhooks are verified, idempotent, and auditable | reuse + extend `WebhookProcessor` — 7, 8, 11 |
| 11 | New stores do not require new backend deployments by default | 1, 9 (config-driven store creation) |
| 12 | New stores do not require new databases by default | 1, 4 (shared DB, row-scoped isolation) |
| 13 | The backend enforces plan limits and entitlements | 6 |
| 14 | Background jobs carry tenant context | 11 |
| 15 | Assets are tenant-owned | 10 |
| 16 | Private assets require authorization | 10 (reuse signed-URL delivery, add authz) |
| 17 | Store/domain resolution is server-side | 9 |
| 18 | Platform security cannot be overridden by merchant customization | 3, 5, 12 (config surface can't cross boundaries) |
| 19 | Downgrade or cancellation does not immediately destroy merchant data | 6, 7 (retention controls, data outlives subscription) |
| 20 | Architecture v1.0 is frozen | this plan never changes it; changes go through ACR |

### 4.2 Frozen decisions this plan treats as immutable inputs

- Tenancy: one shared backend + one initial shared PostgreSQL; strict isolation in front of
  it; **not** backend-per-merchant, **not** DB-per-merchant, **not** a marketplace, **not** a
  page builder. (Handbook §4.)
- Identity: one central `User`; `SUPER_ADMIN` is mandatory (not later-phase); tenant roles
  `OWNER/ADMIN/STAFF/VIEWER` live on `TenantMembership`, not on `User`; `CUSTOMER` is
  store-scoped and carries no path into tenant admin; authorization is **permission-based**,
  not role-name-based; support/impersonation is temporary, tenant-scoped, audited.
  (Handbook §5, §16.)
- Entitlement: `PlanFeature` (can/can't) and `PlanLimit` (how much) are never merged; both
  attach to `Plan`; `Usage` is split persistent vs period-based; backend is the single
  source of truth; **no `if (plan === 'growth')` scattered in business logic**; downgrade
  constrains new activity, does not delete excess data; Enterprise custom limits don't
  change the model. (Handbook §6, Part VI.)
- Subscription: exactly one primary subscription per tenant (Free included); 7 conceptual
  states `PENDING/TRIALING/ACTIVE/PAST_DUE/PAUSED/CANCELLED/EXPIRED` — **no additional
  states**; upgrade needs confirmed billing, downgrade defaults end-of-period; failed
  payment → recovery/grace, not immediate cutoff; every change historically recorded; every
  invoice an immutable snapshot; billing webhooks are the authoritative signal. (Handbook §7.)
- Commerce payments: per-merchant payment-account context, distinct per tenant; credentials
  server-side; amounts server-side; webhooks verified/idempotent/tenant-aware/auditable;
  providers behind a common interface; **Razorpay is the first target provider**; Route/
  linked-accounts/settlement/KYC/payout/merchant-of-record are **explicitly not specified**
  and must not be assumed. (Handbook §8.)
- Legal: platform layer (ForgeBuilds↔merchant) and merchant-store layer (merchant↔customer)
  never merged; privacy notice/consent ≠ contractual acceptance; every agreement versioned;
  acceptance tied to exact document + version + **content hash**; standard merchants =
  clickwrap w/ auditable record, Enterprise = e-signature; privacy/deletion are defined
  workflows. (Handbook §9.)
- Store/domain: `Tenant` ≠ `Store` ≠ `Domain` (3 distinct concepts) even though v1 baseline
  = **one primary storefront per tenant**; shared frontend serves every store; every store
  gets a PrintForge-hosted URL by default, custom domains on top with ownership verification;
  one canonical primary domain per store; Domain→Store→Tenant resolved **server-side on every
  request**; creating a store never needs a deployment; production over HTTPS/TLS. Multiple
  stores per tenant = future-compatible, **not a v1 requirement**. (Handbook §10.)
- Data ownership: every table is platform-, tenant-, or store-owned; cross-tenant
  relationships prohibited at the model level; DB constraints complement app isolation;
  indexes tenant-aware; IDs are never an authz boundary; deletion/retention are controlled
  processes. (Handbook §11.)
- Admin: two control planes, never sharing an authz boundary; `SUPER_ADMIN` gets **no**
  blanket tenant-data access; platform vs tenant audit logs separate; subscription status ≠
  store status; feature flags ≠ plan entitlements. (Handbook §12.)
- Storefront: one shared engine; store context resolved server-side every request; branding
  is configuration on one strong initial theme; homepage structured/config-driven (**no
  drag-and-drop builder**); catalog/search/cart/checkout/account/reviews/legal all
  store-scoped; checkout server-authoritative; customization integrated into commerce;
  **customer identity store-scoped in the initial architecture**; SEO/sitemap/robots
  store-aware; frontend cache/query state store-aware; merchant config can never bypass
  platform security. (Handbook §13.)
- Storage: fixed order authorization → validation → storage → metadata, every time; bytes in
  object storage, Postgres holds metadata/refs; every asset has a resolvable tenant; assets
  explicitly public or private (private needs authz to **read**); storage provider behind a
  common interface; customer customization files private by default; order preserves exact
  asset + customization version purchased; temp/orphan cleanup lifecycle; customer original
  and production output are distinct artifacts. (Handbook §14.)
- Async: business event → outbox (where delivery must be guaranteed) → queue → worker;
  tenant context travels with every tenant job; jobs idempotent; retryable vs permanent
  failures distinguished w/ dead-letter; webhooks persisted on receipt, signature verified
  before processing; transactional vs marketing notifications on separate paths; scheduled
  jobs safe across multiple instances; payment/subscription state reconciled against
  provider; secrets not in job payloads unnecessarily. (Handbook §15.)
- Security: authentication ≠ authorization; server-side tenant + resource authz mandatory on
  every request; object-level authz mandatory; client tenantId never trusted; every
  `SUPER_ADMIN` use audited; privileged accounts get stronger controls; auth endpoints get
  dedicated abuse protection; controlled session/token lifetime/rotation/revocation; secrets
  server-side; HTTPS/TLS; minimize stored payment data; webhook signature verification;
  secure upload validation; CORS/headers/CSRF follow the real auth model; **`SameSite=Strict`
  not weakened for convenience**; sensitive admin actions audited; privacy-by-design;
  CI/CD + dependency security continuous; backups protected like production. (Handbook §16.)
- Infrastructure: 3 environments (Dev/Staging/Production); frontend + backend deploy
  independently; managed Postgres + managed object storage; CDN where appropriate;
  **stateless, horizontally scalable backend; workers scale independently**; versioned API
  contracts; versioned, migration-safe DB migrations (never assume destructive changes are
  safe); health + readiness checks; externalized secrets/config; custom-domain mappings
  verified before routing; shared infra serves every merchant (not re-provisioned per
  tenant). (Handbook §17.)
- Observability/DR: logs, metrics, error tracking, tracing where useful, correlation IDs
  across logs/traces/alerts, alerts; protected automated backups; PITR where supported;
  recover DB + object assets + critical config **together**; **restore testing** ("a backup
  that has never been restored is unproven"); payment/webhook/queue recovery paths;
  controlled tenant deletion; incident response; recovery drills. Vendors/cadence/RPO/RTO
  are **not frozen**. (Handbook §18.)
- Launch readiness: fixed checklist across functional/structural, platform-specific (tenant
  isolation, RBAC, domain routing), commercial (payments, subscriptions), trust/compliance
  (security, legal acceptance, e-sign, uploads security), quality (a11y, SEO, performance),
  operational (backup/restore, prod smoke, real-not-mocked providers). Severity P0 (blocker)
  / P1 (normally blocker) / P2 (deferrable w/ documented acceptance). Verdict: READY /
  READY WITH NON-BLOCKING FINDINGS / NOT READY. (Handbook §19.)

### 4.3 Configuration / vendor choices the frozen architecture leaves open (needed as
inputs, not pre-decided here)

- Specific SaaS **billing provider** + its webhook payloads (Phase 7).
- Specific **queue technology** (Phase 11) — "for example, a Redis-backed queue" is
  explicitly *not frozen*; a Postgres-backed queue table is equally acceptable to the
  architecture.
- Specific **TLS certificate issuer / renewal mechanism** (Phase 9).
- Specific **observability vendor / toolchain** (Phase 14).
- **Backup cadence, RPO, RTO targets, recovery vendor** (Phase 14).
- **Object storage** provider behind the abstraction — Cloudinary is present today; the
  architecture wants an interface, not a fixed vendor (Phase 10).
- Exact **plan prices, numeric limits, which feature gates which surface** (Phase 6).
- **Hosting** — Render/Vercel today; the architecture requires stateless + independently
  scalable workers + a staging environment, which Render single-instance does not currently
  satisfy (Phase 11/14). Whether to stay on Render (with a worker service + staging) or move
  is an ops decision (D8).

### 4.4 Open decisions register (REQUIRES DECISION — do not proceed past the dependent
phase without these)

| ID | Decision | Blocks | Recommendation (non-binding) |
|---|---|---|---|
| **D1** | Formally supersede `BLUEPRINT-v1.2` / lift its prohibited-technology list (Redis, queues) via the repo's ACR process, so SaaS v1.0's queue/worker tier is sanctioned. | Phase 5+ governance, Phase 11 | Raise one ACR: "SaaS Architecture v1.0 supersedes BLUEPRINT-v1.2 in full." Keep BLUEPRINT as historical. |
| **D2** | Does the currently-deployed Render database hold **real merchant/customer production data**, or only test/demo data? | Phase 4 (all of it), Phase 15 | Confirm with ops before Phase 4. If real data exists, Phase 4 is a true production migration with all its gates; if not, Phase 4 is a clean bootstrap. |
| **D3** | Does the existing store become **Tenant #1** (the "PrintForge" demo/first merchant), or is the existing deployment discarded and tenants start empty? | Phase 4 | Treat the existing catalog + admin as Tenant #1 "ForgeBuilds Demo Store" so existing e2e coverage stays meaningful; do **not** call it `default_tenant` or give it implicit privileges. |
| **D4** | Tenant-isolation **enforcement mechanism**: (a) app-layer tenant-scoped data access (Prisma Client Extension / a `TenantPrisma` wrapper that injects `where: { tenantId }`), (b) Postgres Row-Level Security, (c) both. | Phase 3 | **Both.** App-layer as the primary enforced path (testable, explicit); RLS + composite FKs as defense-in-depth (invariant 3: "at the data-model level, not just convention"). |
| **D5** | **Customer identity model.** Handbook: "customer identity is store-scoped." Repo: storefront shoppers are `User` rows (`role=CUSTOMER`) sharing the login/identity table with would-be merchants. Options: (a) separate `Customer` entity keyed by `(storeId, email)` with its own auth; (b) global `User` + per-store `Customer` profile/link. | Phase 2, Phase 4, Phase 12 | (a) separate `Customer` per store. `User` becomes platform/merchant identity only. Migrate existing `role=CUSTOMER` users → `Customer` rows under Tenant #1's store; existing `role=ADMIN` user → `User` + `OWNER` membership of Tenant #1. This is the larger refactor but matches the frozen model and keeps merchant auth (privileged, MFA-eligible) cleanly separate from shopper auth. |
| **D6** | **Tenant context derivation** for the Tenant Control Plane (merchant admin): subdomain (`{tenant}.admin.printforge.app`), path prefix, session-selected active tenant cross-checked against membership, or a validated header. Storefront context is settled by the architecture (Domain→Store→Tenant). | Phase 3, Phase 5, Phase 9 | Admin: host/subdomain resolves a *candidate* tenant, **always** re-checked against an active `TenantMembership` for the authenticated `User`; a User with multiple memberships gets an explicit tenant switcher that re-issues context server-side. Never a raw client value. |
| **D7** | `WebhookEvent` split: one table with a `scope` discriminator + nullable `tenantId`/`paymentAccountId`, or two tables (`CommerceWebhookEvent` tenant-scoped, `BillingWebhookEvent` platform-scoped). | Phase 7, Phase 8, Phase 11 | Two tables. Different verification secrets, different processors, different audit domains, invariant 6. Reuse the existing two-phase pattern for both. |
| **D8** | Hosting/topology: stay on Render (add a separate worker service + a staging environment + horizontal backend scaling) or migrate. Architecture requires stateless backend + independently scalable workers + 3 environments. | Phase 11, Phase 14, Phase 15 | Stay on Render initially: promote the backend to ≥2 instances, add a dedicated worker service, add a `staging` environment. Revisit only if scaling economics demand it. Not an architecture change. |
| **D9** | Merchant Razorpay **credential storage**: encrypted column on `PaymentAccount` (KMS-wrapped envelope encryption) vs external secrets manager reference. | Phase 8 | Envelope-encrypted blob on `PaymentAccount`, data key from a managed KMS; decrypt only in the payment-provider adapter, never logged, never serialized to any client or job payload (invariant 9, handbook §15 "jobs carry references, not credentials"). |
| **D10** | Per-tenant **order/invoice numbering** scheme (today: global `PF-000001`, `INV-000001`). | Phase 4, Phase 12 | Per-tenant counter rows + a per-tenant/store configurable prefix; number unique within `(tenantId, …)`. Confirm statutory invoice-numbering rules per merchant jurisdiction — REQUIRES QUALIFIED LEGAL REVIEW for GST invoices. |
| **D11** | Which existing global `AppSetting` keys are **platform-owned** vs **tenant-owned** (and which become store-owned specifically). | Phase 4 | All current keys → tenant-owned except the two internal counters → per-tenant. No platform-global business setting exists today; a `PlatformConfig` table is new in Phase 5 if needed. |
| **D12** | GST / tax model per tenant: is India-GST the only supported tax regime for v1, or must the tax engine generalize (the platform is "general-purpose e-commerce")? | Phase 12 | Keep the existing India-GST engine per-tenant for v1 (config moves from global to tenant settings); design `TaxConfig` as a per-store strategy so other regimes are additive later. Not frozen. |
| **D13** | Object storage: keep Cloudinary behind a new `StorageProvider` interface, or introduce S3-compatible storage now. | Phase 10 | Keep Cloudinary, introduce the interface (`StorageProvider`) with Cloudinary as the first adapter. Architecture wants the abstraction, not a migration. |

---

## 5. Implementation Principles

1. **The architecture is the contract.** Every phase cites the handbook section/invariant it
   satisfies. Nothing in this plan relaxes an invariant; anything that would requires an ACR.
2. **Safe > fast.** The goal is *safe, incremental, verifiable, rollback-aware,
   tenant-safe* — never "ship everything quickly."
3. **Expand → migrate → contract for every schema change.** Add nullable
   `tenantId`/`storeId` columns and compatibility relationships first; dual-write; backfill;
   validate counts; only then add `NOT NULL` + composite constraints; only then remove
   legacy `userId`-only code paths. Prisma has **no down-migrations**
   (`docs/ops/DEPLOYMENT.md` §11) — every migration must be forward-recoverable or
   backup-restorable.
4. **No tenant-isolation change without paired tests.** Before an isolation filter becomes
   *enforced*, a **negative** test ("Tenant A's token cannot read Tenant B's resource → 404,
   not 403, no existence leak") and a **positive** test ("Tenant A can read its own") must
   exist and pass in `backend/test/e2e/`.
5. **No destructive migration without a verified, restored-tested backup and a written
   rollback plan.** The current backup/restore doc is explicitly *unverified*; a restore
   drill (Phase 14) is a precondition for Phase 4's constraint-tightening wave and for
   Phase 15.
6. **Tenant context is server-derived, always.** Resolved from the authenticated
   membership (admin) or from Domain→Store→Tenant (storefront). A client-supplied tenant id
   is accepted only as an *unverified hint* that must match server-derived context or the
   request fails.
7. **Two boundaries stay physically separate:** (a) SaaS billing vs commerce payments —
   separate models, separate provider adapters, separate refund workflows, separate audit;
   (b) Platform Control Plane vs Tenant Control Plane — separate guards, separate route
   namespaces, separate audit logs, `SUPER_ADMIN` never a blanket tenant-data key.
8. **Reuse aggressively, re-scope surgically.** The pricing engine, order state machine,
   outbox, webhook processor, reconciliation, invoice generator, upload validator, and the
   entire React component library are kept; they gain a tenant/store parameter, they are not
   rewritten. Rebuild only where inspection shows the current design is structurally
   single-tenant (auth role model, admin control plane, settings table, payment credential
   sourcing).
9. **Permission-based authorization.** Code asks `can(membership, 'orders:transition')`, not
   `role === 'ADMIN'`. The role→permission mapping is data/config; business logic never
   name-checks a role or a plan.
10. **Every phase is independently verifiable and independently (or backup-) recoverable.**
    A phase that cannot be verified or rolled back is not done.
11. **Observability and backups are not a final phase bolt-on.** Phase 14's capabilities are
    built incrementally from Phase 1 onward (correlation IDs, tenant-tagged logs, structured
    audit); Phase 14 is where they're *proven*, not where they *start*.
12. **Documentation is a deliverable of each phase** — the ops runbooks
    (`docs/ops/*`) and a new `docs/saas/` set are updated as the code lands, not after.

---

## 6. Phase 0 — Repository / Schema / Data Inventory & Decision Lock

### Phase 0 — Repository / Schema / Data Inventory

**PURPOSE**
Produce the authoritative, inspection-verified inventory that every later phase depends on,
and force every ambiguity to an explicit decision **before** any schema or code change. This
phase writes documents and decision records only. It is the formalization of §3 and §4.4 of
this plan into review-signed artifacts.

**DEPENDENCIES**
None (this is the root). All other phases depend on Phase 0's decision lock.

**REPOSITORY AREAS**
Entire repo, read-only. Specifically: `backend/prisma/schema.prisma`,
`backend/prisma/migrations/**`, `backend/src/**` (all 15 modules), `frontend/src/**`,
`.github/workflows/ci.yml`, `frontend/vercel.json`, `backend/src/common/config/**`,
`docs/architecture/**`, `docs/ops/**`, `backend/test/e2e/**`.

**DATABASE / DATA IMPACT**
None. Read-only. Deliverable includes: the complete model inventory (§3.2), the FK/ownership
graph (§3.3), the constraint/index catalogue (§3.4), the enum list, and the per-model
ownership classification with **REQUIRES DECISION** flags (§3.16). A live `SELECT` inventory
of the deployed database (row counts per table, min/max `createdAt`, distinct `role` values,
distinct `AppSetting.key` values, orphan checks) is run **read-only against a restored copy
or a read replica — never against production directly** to establish the real data shape
(precondition D2).

**BACKEND IMPACT**
None (no code). Deliverable: a written map of every place that will change, keyed to file:
`common/guards/roles.guard.ts`, `common/enums/role.enum.ts`, `common/decorators/roles.decorator.ts`,
`common/decorators/current-user.decorator.ts`, `auth/strategies/jwt.strategy.ts`,
`auth/auth.service.ts`, `common/database/prisma.service.ts`, every `*.service.ts` with an
ownership check, `admin/admin.controller.ts`, `admin/admin.service.ts`,
`app-setting/**`, `uploads/**`, `notifications/outbox/**`, `payments/**`,
`invoices/invoice-number.service.ts`, `orders/orders.service.ts` (counter),
`checkout/checkout.service.ts`.

**FRONTEND IMPACT**
None (no code). Deliverable: a written map — `App.tsx` routing, `features/auth/*`,
`services/api/client.ts`, `services/api/authStore.ts`, all `hooks/*` query keys,
`seo/siteConfig.ts`, `seo/seoFiles.ts`, `hooks/useStoreName.ts`, `constants/query.ts`.

**INFRASTRUCTURE IMPACT**
None. Deliverable: confirmation of current topology (Render one instance, Vercel, Render PG,
no staging, no containers), and the D8 topology decision brief.

**SECURITY IMPACT**
None directly, but this phase **defines** the security model to be built: it records that
today authorization is role-string + per-handler ownership, that there is no tenant boundary,
and that `AdminService` aggregates are globally unscoped — the exact gaps Phases 2/3/5 close.

**MIGRATION IMPACT**
None. This phase produces the *migration strategy input*: the ownership map, the D2 data
confirmation, and the D3 "existing store → Tenant #1" decision that Phase 4 executes.

**KEY RISKS**
- *Deciding by omission.* Mitigation: every item in §4.4 must have a recorded, dated,
  named-owner decision before Phase 1 starts; "we'll figure it out later" is not a valid
  state.
- *Stale inventory.* Mitigation: re-run the inventory diff against `HEAD` at the start of
  each phase; the repo is under active development (recent storefront/admin commits).
- *Wrong assumption about production data.* Mitigation: D2 is answered by ops in writing, not
  inferred.

**REUSE FROM CURRENT SYSTEM**
The entire repository — this phase establishes *what* is reusable. Nothing is discarded here.

**NEW CAPABILITIES**
None (documentation). Produces: `docs/saas/INVENTORY.md`, `docs/saas/OWNERSHIP-MAP.md`,
`docs/saas/DECISIONS.md` (D1–D13 resolved), `docs/saas/CHANGE-MAP.md` (file-level).

**VERIFICATION / ACCEPTANCE CRITERIA**
- Model count, enum count, constraint list, and FK graph in the inventory match a fresh
  `prisma validate` + `migration.sql` read (25 models, 12 enums).
- Every model has exactly one ownership classification (platform / tenant / store) or an
  explicit REQUIRES DECISION with an assigned owner.
- D1–D13 each have a written resolution signed by the architecture owner.
- D2 (production data) answered in writing by ops.
- The live read-only data inventory (row counts, date ranges, `role` distribution,
  `AppSetting` keys, orphan check) is attached.

**ROLLBACK / RECOVERY CONSIDERATIONS**
Nothing to roll back (no changes). If the inventory is later found wrong, correct the
document and re-review; no code depends on it yet.

**EXIT CRITERIA**
All four `docs/saas/` artifacts reviewed and signed. D1–D13 resolved. D2 confirmed.
The team agrees the change-map is complete enough to plan Phase 1 against.

---

## 7. Phase 1 — Foundational Tenant / Store / Membership

### Phase 1 — Foundational Tenant / Store / Membership

**PURPOSE**
Introduce the core isolation entities — `Tenant`, `Store`, `StoreDomain`,
`TenantMembership` — as **additive, non-enforcing** schema, plus the platform-owned
`Plan` shell they reference. No existing table is modified yet; no data is scoped yet. This
establishes the ownership roots that Phases 2–4 attach everything else to. (Handbook §4, §5,
§10, §11; invariants 2, 11, 12.)

**DEPENDENCIES**
Phase 0 (decision lock, esp. D3 store→tenant, D5 customer identity, D6 context, D10
numbering). Nothing else.

**REPOSITORY AREAS**
`backend/prisma/schema.prisma` (new models only); new module dirs
`backend/src/tenancy/` (tenant + store + domain + membership services, no request-path
enforcement yet), `backend/src/plans/` (shell). New migration under
`backend/prisma/migrations/`. `backend/prisma/seed*.ts` (add a way to create Tenant #1 for
dev/test). No frontend yet.

**DATABASE / DATA IMPACT**
New tables (all new — none exist):
- `Tenant` — `id`, `name`, `slug` (unique), `status` (`ACTIVE/SUSPENDED/PENDING_DELETION/
  DELETED` — lifecycle from handbook §12 "store status" + §18 "controlled tenant deletion";
  exact set is REQUIRES DECISION-minor, propose these four), `createdAt`, `updatedAt`,
  `deletedAt?`.
- `Store` — `id`, `tenantId` (FK RESTRICT), `name`, `slug`, `status`
  (`ACTIVE/DISABLED/DRAFT`), `isPrimary` (bool; exactly one primary per tenant in v1 —
  partial unique `(tenantId) WHERE isPrimary`), branding/config JSON columns or a linked
  `StoreSetting`, `createdAt`, `updatedAt`. `@@unique([tenantId, slug])`.
- `StoreDomain` — `id`, `storeId` (FK), `tenantId` (denormalized for isolation),
  `hostname` (globally unique — a hostname resolves to exactly one store), `isPrimary`
  (partial unique `(storeId) WHERE isPrimary` — "one canonical primary domain"),
  `verificationStatus` (`PENDING/VERIFIED/FAILED`), `verificationToken`, `verifiedAt?`,
  `createdAt`. (Handbook §10.)
- `TenantMembership` — `id`, `userId` (FK RESTRICT), `tenantId` (FK RESTRICT),
  `role` (`OWNER/ADMIN/STAFF/VIEWER` — new enum `TenantRole`), `status`
  (`ACTIVE/INVITED/SUSPENDED`), `invitedByUserId?`, `createdAt`, `updatedAt`.
  `@@unique([userId, tenantId])` — one membership per user per tenant; **role lives here**
  (handbook §5). `@@index([tenantId])`, `@@index([userId])`.
- `Plan` (shell for Phase 6) — `id`, `key` (`free/starter/growth/business/enterprise`),
  `name`, `isPublic`, `createdAt`. Full `PlanFeature`/`PlanLimit`/`Usage` deferred to Phase 6.
- `Subscription` (shell, so `Tenant` can have exactly one from creation) — `id`,
  `tenantId` (unique — one primary subscription per tenant), `planId`, `status`
  (`PENDING/TRIALING/ACTIVE/PAST_DUE/PAUSED/CANCELLED/EXPIRED` — the 7 frozen states, new
  enum `SubscriptionStatus`), `currentPeriodStart?`, `currentPeriodEnd?`, `createdAt`. Full
  billing logic deferred to Phase 7; at Phase 1 every tenant is created with a `Free`/`ACTIVE`
  subscription.

New enums: `TenantRole`, `SubscriptionStatus`, plus small status enums. **`Role` enum is
NOT touched in Phase 1** (still `CUSTOMER/ADMIN`) — that is Phase 2.

No existing table altered. No backfill. No data scoped.

**BACKEND IMPACT**
- New `TenancyModule`: `TenantService` (create/get/list/suspend), `StoreService`,
  `StoreDomainService` (create + issue verification token + check verification —
  verification *mechanism* is Phase 9; here it's just the model + state), `MembershipService`
  (add/remove/list memberships, resolve a user's memberships).
- New `PlansModule` shell (`PlanService.getPlanByKey`).
- **No guard, no interceptor, no request-path enforcement in Phase 1.** These services are
  callable only from seeds/tests and (later) the platform admin surface.
- `app.module.ts` gains `TenancyModule`, `PlansModule` in the import list (base layer, before
  `ProductsModule`).

**FRONTEND IMPACT**
None in Phase 1 (no UI for tenant/store yet — that's Phase 5/9/12).

**INFRASTRUCTURE IMPACT**
None. One new forward migration applied via `prisma migrate deploy` in CI and on deploy.
Additive-only → a code rollback is safe (old code ignores the new tables).

**SECURITY IMPACT**
Low — additive tables, no enforcement. The one care point: `StoreDomain.hostname` must be
globally unique so a later resolver can't map one hostname to two tenants. `TenantMembership`
unique `(userId, tenantId)` prevents duplicate-membership ambiguity.

**MIGRATION IMPACT**
First migration wave (see §25 Wave 1). Pure `CREATE TABLE`. Zero risk to existing data.
Reversible by `DROP TABLE` compensating migration if truly needed before anything references
them.

**KEY RISKS**
- *Modelling `Store` branding as free-form JSON that later can't be validated/queried.*
  Mitigation: keep pricing/security-relevant store config as typed columns or a keyed
  `StoreSetting` table (mirrors the existing `AppSetting` discipline in
  `app-setting.constants.ts` — typed normalizers, allowlist).
- *Baking "one store per tenant" in so hard that multi-store later needs a re-derivation.*
  Mitigation: `Store` is a first-class table with its own id from day one; every downstream
  FK in Phase 4 carries **both** `tenantId` and `storeId`; `isPrimary` is a flag, not a
  schema shortcut. (Handbook §10 — future-compatible.)
- *Lifecycle-state set churn.* Mitigation: get the `Tenant`/`Store`/`Subscription` status
  enums reviewed against handbook §7/§12/§18 before the migration.

**REUSE FROM CURRENT SYSTEM**
- The `AppSetting` allowlist+typed-normalizer pattern (`app-setting.constants.ts`) is the
  template for `StoreSetting`.
- The `@@index` / partial-unique-index discipline already in `schema.prisma` (e.g.
  `payment_attempts_order_captured_unique`) is the template for `(tenantId) WHERE isPrimary`.
- The module-layering convention documented in `app.module.ts` (base layer → products →
  orders → …) — `TenancyModule` slots in as a new base-layer module.

**NEW CAPABILITIES**
Tenant, Store, StoreDomain, TenantMembership, Plan/Subscription shells exist. A tenant can be
created (via seed/test/service) with a primary store and a Free subscription. Nothing is
enforced yet.

**VERIFICATION / ACCEPTANCE CRITERIA**
- `prisma validate` passes; `prisma migrate deploy` applies cleanly on a copy of production.
- New unit tests: `TenantService`/`StoreService`/`MembershipService` CRUD; the
  `(tenantId) WHERE isPrimary` partial unique actually rejects a second primary store;
  `(userId, tenantId)` rejects a duplicate membership; `StoreDomain.hostname` global unique
  rejects a collision.
- Full existing suite (`npm run test`, `npm run test:e2e`, frontend `npm run test`) still
  green — proof the additive migration changed no existing behavior.
- A dev seed can bootstrap "Tenant #1 + primary store + OWNER membership + Free
  subscription."

**ROLLBACK / RECOVERY CONSIDERATIONS**
Additive migration → roll back the backend image; new tables sit unused. If the tables must
be removed, a compensating `DROP TABLE` migration is safe **only while nothing references
them** (true through end of Phase 1). Take a backup before applying (standard per
`DEPLOYMENT.md` §3) even though risk is minimal.

**EXIT CRITERIA**
New models merged, migration applied to all environments, all existing tests green, new
model tests green, dev/test seed can create a full tenant. No existing table or behavior
changed.

---

## 8. Phase 2 — Identity & Membership

### Phase 2 — Identity & Membership

**PURPOSE**
Move authorization identity from the global `Role { CUSTOMER, ADMIN }` on `User` to
`User` + `TenantMembership.role` (+ the platform `SUPER_ADMIN`), and split store shoppers
into a store-scoped `Customer` identity (D5). Update token/session context to carry
server-derived membership/context. Keep every existing user logged in and working through
the transition. (Handbook §5, §16; invariants 1, 4, 5.)

**DEPENDENCIES**
Phase 1 (needs `TenantMembership`, `Tenant`, `Store`). Phase 0 D5 (customer model), D6
(context derivation).

**REPOSITORY AREAS**
`backend/src/common/enums/role.enum.ts`, `common/decorators/roles.decorator.ts`,
`common/guards/roles.guard.ts` (→ becomes/joins a permission guard),
`common/decorators/current-user.decorator.ts` (shape change),
`common/guards/jwt-auth.guard.ts`, `auth/strategies/jwt.strategy.ts`,
`auth/auth.service.ts`, `auth/auth.controller.ts`, `auth/dto/*`,
`users/users.service.ts`, `users/users.controller.ts`.
New: `backend/src/auth/permissions/` (permission catalogue + `can()` + `PermissionsGuard`),
`backend/src/customers/` (store-scoped customer module, if D5 = separate entity).
Frontend: `features/auth/AuthProvider.tsx`, `authContext.ts`, `services/api/authStore.ts`,
`services/api/auth.ts`, `hooks/useAuth.ts`, `hooks/useCurrentUser.ts`,
`features/auth/AdminRoute.tsx`, `ProtectedRoute.tsx`, `postAuthDestination.ts`,
`types/auth.ts`.
Prisma: `User` (drop/deprecate `role` after migration; move embedded address to `Customer`),
new `Customer` model, new `Permission`/permission-mapping representation.

**DATABASE / DATA IMPACT**
- New enum `PlatformRole { SUPER_ADMIN }` (or a boolean `User.isPlatformSuperAdmin` + audit;
  propose a `PlatformRole` nullable field on `User` so it's extensible).
- New `Customer` model (D5 = separate): `id`, `storeId` (FK), `tenantId` (denormalized),
  `email`, `passwordHash`, auth fields mirrored from `User` (`tokenVersion`,
  `failedLoginAttempts`, `passwordResetTokenHash`, `passwordResetExpiresAt`, `isActive`),
  the shipping-address columns currently on `User` (`addressLine1..country`, `phone`),
  `createdAt`, `updatedAt`. `@@unique([storeId, email])` — store-scoped identity
  (handbook §13: "customer identity is store-scoped").
- `User` — `role` column: keep during the migration (dual-read), remove in Phase 2's final
  contract step or defer removal to Phase 4's legacy-removal wave. Add `platformRole?`.
- `RefreshToken` — currently `userId` only. Add a parallel `customerId?` **or** a separate
  `CustomerRefreshToken` table (cleaner separation; propose separate table). Existing
  `RefreshToken` rows stay valid for `User` sessions.
- Backfill (small, controlled): existing `role='ADMIN'` user → keep as `User`, create an
  `OWNER` `TenantMembership` to Tenant #1. Existing `role='CUSTOMER'` users → create
  `Customer` rows under Tenant #1's primary store, copy `passwordHash` + address + auth
  fields, map their `Cart`/`Order`/`Review`/`UploadedFile` ownership in Phase 4.
  **This backfill is gated on D2/D3.**

**BACKEND IMPACT**
- **Permission model:** a static permission catalogue (e.g.
  `orders:read`, `orders:transition`, `products:write`, `coupons:write`, `settings:write`,
  `members:manage`, `payment-account:manage`, …) and a `TenantRole → Set<Permission>` map
  (data or a typed constant — the architecture forbids scattering role names, not a central
  constant). `PermissionsGuard` + `@RequirePermission('orders:transition')` decorator
  replaces `@Roles(Role.ADMIN)`.
- **Platform guard:** `@PlatformOnly()` + `PlatformGuard` checks `User.platformRole ===
  SUPER_ADMIN`. Completely separate from `PermissionsGuard`. (Invariant 4.)
- **Token/session:** access token payload changes. Merchant `User` token:
  `{ sub, email, platformRole?, memberships: [{tenantId, role}] , tokenVersion }` OR a
  thinner `{ sub, tokenVersion }` with memberships looked up fresh in `JwtStrategy.validate`
  (the file's own doc comment prefers fresh lookup — recommend keeping the token thin and
  resolving memberships + active context server-side each request). Customer token is
  separate (`{ sub: customerId, storeId, tokenVersion }`), issued by a separate customer
  auth flow.
- `JwtStrategy.validate` re-checks `tokenVersion` (already does) and now also loads
  memberships / platformRole; `AuthenticatedUser` becomes
  `{ id, email, platformRole?, memberships }` (merchant) — customer requests get a
  `AuthenticatedCustomer { id, storeId, tenantId }`.
- `auth.service.ts` `register`/`login` split: merchant auth (`/auth/*`) vs customer auth
  (new `/storefront/auth/*` or store-host-scoped `/auth/*`). Reuse **all** of the existing
  bcrypt cost, dummy-hash timing normalization, progressive login delay, refresh rotation,
  reuse detection, `tokenVersion` revocation — copied/shared into the customer flow, not
  reinvented.
- `admin.controller.ts` / product/category controllers: `@Roles(Role.ADMIN)` →
  `@RequirePermission(...)` (mechanical, one PR).

**FRONTEND IMPACT**
- `authStore` gains `platformRole` and `memberships` + an `activeTenantId`. `AuthProvider`
  bootstrap `/auth/refresh` now returns context.
- `AdminRoute` (`user?.role !== 'ADMIN'`) → checks "has an `OWNER/ADMIN/STAFF/VIEWER`
  membership for the active tenant" (tenant admin) — and a **new** `PlatformRoute` checks
  `platformRole === 'SUPER_ADMIN'` for the platform console (Phase 5).
- A tenant switcher component (for `User`s with multiple memberships) — minimal in Phase 2,
  fleshed out in Phase 5.
- Storefront customer auth pages (`LoginPage`/`RegisterPage`/`ForgotPasswordPage`/
  `ResetPasswordPage`) re-point to the customer auth API and become store-scoped.
- `types/auth.ts`, `hooks/useAuth.ts`, `hooks/useCurrentUser.ts` updated.

**INFRASTRUCTURE IMPACT**
Two migrations (add `Customer` + `platformRole` + `CustomerRefreshToken`; later a contract
migration to drop `User.role`). No topology change. `JWT_ACCESS_SECRET` can be reused;
consider a **separate signing secret for customer tokens** (new optional env var — additive,
defaulting to the existing secret is acceptable but a distinct secret is cleaner;
REQUIRES DECISION-minor).

**SECURITY IMPACT**
High-value, high-risk. Positives: introduces `SUPER_ADMIN` as a first-class mandatory role
(invariant, handbook §5); separates merchant and customer identity so a shopper's session
carries **no** path to tenant admin (handbook §5, §13); permission-based checks replace
brittle role-string checks. Risks: token/session migration can log everyone out or, worse,
mis-scope a session. Mitigations under KEY RISKS.

**MIGRATION IMPACT**
Wave 2 (§25). The `Customer` split is the single most invasive identity change in the whole
plan. Must be expand→migrate→contract: (1) add `Customer` + dual auth, existing `User`
sessions untouched; (2) backfill `Customer` rows from `role='CUSTOMER'` users, keep the
`User` rows too (dual identity) until Phase 4 re-points `Cart`/`Order`/etc.; (3) after
Phase 4, deactivate the now-shopper `User` rows (do not delete — audit/history FKs) and drop
`User.role`.

**KEY RISKS**
- *Mass logout / session invalidation.* `tokenVersion` is per-user and unchanged by this
  migration, and existing access tokens are short-lived (15 min) with a working refresh
  path. Mitigation: do **not** bump `tokenVersion` during migration; keep `JwtStrategy`
  backward-compatible with the old payload shape for one refresh-TTL window (accept a token
  with `role` and no `memberships`, resolve context server-side); announce a maintenance
  window only if unavoidable.
- *Privilege escalation via the role→permission map.* Mitigation: the map is reviewed as a
  security artifact; `PermissionsGuard` denies by default (no permission entry → 403);
  negative e2e tests per permission (`auth-security.e2e-spec.ts` extended).
- *Customer/merchant identity confusion* (a `Customer` email equal to a `User` email).
  Mitigation: separate tables, separate auth endpoints, separate token audiences, separate
  guards; a token minted for one audience is rejected by the other.
- *Backfill duplicates or misses a shopper.* Mitigation: backfill is idempotent
  (`(storeId,email)` unique), row-count reconciled (`count(User WHERE role='CUSTOMER')` ==
  `count(Customer WHERE storeId = <tenant1 store>)`), run against a restored copy first.
- *`User.role` removed while code still reads it.* Mitigation: contract step is a separate,
  later migration; grep gate in CI for `\.role` on user objects.

**REUSE FROM CURRENT SYSTEM**
- **All** of `auth.service.ts`'s security mechanics (bcrypt cost, `DUMMY_PASSWORD_HASH`
  timing, `LOGIN_DELAY_CURVE_MS`, refresh rotation, reuse-detection family revocation,
  `tokenVersion`) — shared into the customer auth flow.
- `jwt-auth.guard.ts` `@Public()` opt-out mechanism — unchanged.
- `common/decorators/current-user.decorator.ts` pattern — extended, not replaced.
- Frontend `authStore` + `useSyncExternalStore` design — extended with context fields.
- The existing single-flight refresh (`services/api/client.ts`) — unchanged mechanism.

**NEW CAPABILITIES**
`SUPER_ADMIN` platform role; `OWNER/ADMIN/STAFF/VIEWER` tenant roles via membership;
permission-based authorization; store-scoped `Customer` identity separate from merchant
`User`; a `User` can hold memberships in multiple tenants with different roles.

**VERIFICATION / ACCEPTANCE CRITERIA**
- `auth-security.e2e-spec.ts` extended: a `VIEWER` cannot transition an order; a `STAFF`
  cannot manage members; a `Customer` token is rejected by every `/admin/*` route (401/403,
  no existence leak); a `SUPER_ADMIN` passes `PlatformGuard` but **fails** a tenant
  `PermissionsGuard` unless explicitly granted scoped access (invariant 5 — verified here
  as a negative test, fully realized in Phase 5).
- Existing `admin-control-plane.e2e-spec.ts` still green after the `@Roles` → `@RequirePermission`
  swap.
- A pre-migration access token (old payload) still authorizes for one refresh-TTL window.
- Backfill reconciliation report: shopper `User` count == new `Customer` count; the one
  admin `User` has an `OWNER` membership to Tenant #1.
- Frontend: existing customer + admin login flows still work end-to-end (component + a
  manual/e2e pass).

**ROLLBACK / RECOVERY CONSIDERATIONS**
- Before the `Customer` backfill: verified backup (Phase 14 restore drill must have run at
  least once by now, or a `pg_dump` proven-restorable copy).
- Expand steps roll back by image revert (new columns/tables ignored).
- The backfill itself: `Customer` rows are additive; a bad backfill is corrected by
  `DELETE FROM customers WHERE …` + re-run (no other table references `Customer` yet).
- The contract step (drop `User.role`) is deferred and independently gated.

**EXIT CRITERIA**
Permission guard live on all merchant/admin routes; platform guard live; `Customer` model +
customer auth flow live; existing sessions survive; backfill reconciled; all suites green;
`User.role` still present (removed later) but no longer read by authorization code.

---

## 9. Phase 3 — Tenant Context & Authorization

### Phase 3 — Tenant Context & Authorization

**PURPOSE**
Make tenant context **server-derived and mandatory** on every request, and make data access
**tenant-scoped** — the core of invariants 1, 2, 3, 18. Introduce the tenant-scoped data
access path (D4: app-layer + RLS), the `TenantContext` request primitive, object-level
authorization helpers, and the platform-vs-tenant operation split. This phase changes *how
queries are made* without yet backfilling `tenantId` onto business rows (that's Phase 4) —
so it ships behind a **"advisory/enforced" flag per module**, flipped to enforced only once
that module's data is scoped and its negative tests pass.

**DEPENDENCIES**
Phase 1 (tenancy models), Phase 2 (membership + permissions + `Customer`). Phase 0 D4, D6.

**REPOSITORY AREAS**
New: `backend/src/common/tenant/` — `TenantContextMiddleware` / interceptor,
`TenantContext` (request-scoped), `tenant-prisma` (scoped client / Prisma extension),
`ObjectAuth` helpers.
Modified: `backend/src/common/database/prisma.service.ts` (or a wrapper around it),
`app.module.ts` (register middleware/interceptor), and **every domain service that reads or
writes tenant-owned data**:
`products/products.service.ts`, `products/categories/*`, `products/customizations/*`,
`cart/cart.service.ts`, `checkout/checkout.service.ts`, `checkout/pricing/*`,
`checkout/tax/tax.service.ts`, `orders/orders.service.ts`, `orders/state-machine/*`,
`payments/payments.service.ts`, `payments/payment-reconciliation.service.ts`,
`payments/webhooks/webhook-processor.service.ts`, `invoices/invoices.service.ts`,
`invoices/invoice-number.service.ts`, `coupons/coupons.service.ts`,
`reviews/reviews.service.ts`, `uploads/uploads.service.ts`, `app-setting/app-setting.service.ts`,
`admin/admin.service.ts`, `notifications/notifications.service.ts`,
`users/users.service.ts` (now `customers`).
Frontend: `services/api/client.ts` (send store/tenant context header as a *hint*),
all `hooks/*` (query-key namespacing — see Phase 12 for the storefront half).

**DATABASE / DATA IMPACT**
No new business columns in Phase 3 (Phase 4 adds `tenantId`). What Phase 3 *can* add safely:
- Enable Postgres **Row-Level Security** on the new Phase-1 tables and prepare (not yet
  enforce) RLS policies for business tables — the policies reference a
  `current_setting('app.tenant_id')` GUC the scoped Prisma client sets per transaction.
- A `SET LOCAL app.tenant_id = '…'` at the start of every tenant-scoped transaction (via the
  scoped client).

**BACKEND IMPACT**
- **`TenantContext` resolution:** an interceptor/middleware that, per request, derives:
  - Storefront request → from `Host` header → `StoreDomain` lookup → `Store` → `Tenant`
    (cache the resolution; handbook §10 "on every request", §13). Sets
    `ctx = { tenantId, storeId, source: 'domain' }`.
  - Merchant/admin request → from the authenticated `User`'s `TenantMembership` +
    the requested/active tenant (D6): host/subdomain or an explicit `X-Active-Tenant` that
    **must** match a membership; otherwise 403. Sets `ctx = { tenantId, membership, source:
    'membership' }`.
  - Platform request → no tenant context; `PlatformGuard` only. Explicitly a separate code
    path (handbook §12).
  - A client-supplied tenant id is only ever a *hint* checked against the derived value
    (invariant 1).
- **Scoped data access (D4):** a `getTenantScopedClient(tenantId)` that returns a Prisma
  client (via `$extends` / a thin proxy) which injects `where: { tenantId }` into every
  find/update/delete/count on tenant-owned models and sets it on every create. Services take
  the scoped client from `TenantContext` instead of the global `PrismaService`. The global
  `PrismaService` remains for platform-scoped operations and migrations only.
- **Object-level authorization:** `assertObjectInTenant(resource, ctx)` + per-resource
  `assertOwnedByCustomer(resource, customerId)` — replaces the ad-hoc
  `order.userId !== userId` checks with a two-step check (tenant match, then
  customer/actor match). (Handbook §16 "object-level authz mandatory".)
- **Platform-scoped operations identified explicitly** (NOT given a blind tenant filter):
  - Cron pollers (`OutboxPoller`, `WebhookProcessor`, `PaymentReconciliationService`) — they
    iterate across tenants; each *job* carries tenant context (Phase 11), the *poller* does
    not filter by one tenant.
  - `WebhookController` receipt endpoint — no tenant context at receipt time; tenant is
    resolved during processing (Phase 8/11).
  - `HealthController` — none.
  - Platform admin reads (Phase 5) — cross-tenant by design, `SUPER_ADMIN` + audit, never
    the scoped client.
  - Auth endpoints — none (identity is global).
- **Per-module rollout flag:** `TENANT_ENFORCEMENT[module] = 'advisory' | 'enforced'`.
  Advisory = log + Sentry-breadcrumb on any query that would have crossed a tenant boundary;
  enforced = throw. Flip per module in Phase 4 as its data gets scoped.

**FRONTEND IMPACT**
- `services/api/client.ts`: attach the resolved store context (from the host / a bootstrap
  call) as a header hint; never rely on it for security.
- Query keys gain a store/tenant prefix (`['t', tenantId, 'products', 'list', params]`) so
  TanStack Query cache cannot serve one store's data to another (handbook §13 "frontend
  cache and query state are store-aware"). Full sweep is Phase 12; the mechanism lands here.
- `queryClient` — consider `clear()` on store/tenant switch.

**INFRASTRUCTURE IMPACT**
- RLS requires the DB role used by the app to be **non-superuser and non-`BYPASSRLS`**
  (Render managed PG default app role must be checked — REQUIRES DECISION-minor / ops).
- Connection pooling + `SET LOCAL` per transaction: verify the pooler (PgBouncer transaction
  mode, if used) is compatible — `SET LOCAL` is transaction-scoped and safe in transaction
  pooling, but a plain `SET` is not. This is an ops verification item.

**SECURITY IMPACT**
This is the phase that *creates* the tenant isolation boundary. Every mechanism here is
security-critical: context derivation must be unspoofable, the scoped client must be
impossible to bypass accidentally (lint rule: importing `PrismaService` directly in a domain
service is a CI failure outside an allowlist), object-level checks must not leak existence
(return 404 for cross-tenant, not 403).

**MIGRATION IMPACT**
No data migration. The behavioral change (queries now go through the scoped client) is
guarded by the advisory→enforced flag so it can ship before Phase 4's backfill and be
observed in production in advisory mode.

**KEY RISKS**
- *A query path that bypasses the scoped client.* Mitigation: CI lint/grep gate; the global
  `PrismaService` is only injectable in an allowlisted set (cron, platform admin, health,
  auth); code review checklist; advisory-mode Sentry breadcrumbs surface any leak before
  enforcement.
- *Context derivation spoof* (attacker sets `X-Active-Tenant` to another tenant).
  Mitigation: value is cross-checked against `TenantMembership`; mismatch → 403; e2e
  negative test.
- *RLS + pooler incompatibility causing cross-request context bleed.* Mitigation: `SET LOCAL`
  inside an explicit transaction only; load test with the production pooler config; keep
  app-layer scoping as the primary guarantee so RLS is defense-in-depth, not the sole
  mechanism.
- *Performance regression* from per-request domain resolution. Mitigation: cache
  `hostname → {storeId,tenantId}` (short TTL, invalidated on `StoreDomain` change).
- *Cron pollers accidentally scoped to one tenant* (breaking outbox/webhook processing).
  Mitigation: pollers explicitly use the global client; covered by
  `webhook-retry.e2e-spec.ts` / `payment-reconciliation.e2e-spec.ts` extended to multi-tenant.

**REUSE FROM CURRENT SYSTEM**
- The `@Public()` decorator + global-guard pattern (`app.module.ts`) is the exact model for
  a global `TenantContextInterceptor` with per-route opt-out.
- Existing per-handler ownership checks (`assertOwnedBy`, `getOwnedItemOrThrow`,
  `getReviewOwnedByOrThrow`) become the *second* half of the two-step object check — the
  logic is kept, a tenant check is prepended.
- `checkout.service.ts`'s `SELECT … FOR UPDATE` transaction pattern is already the right
  place to `SET LOCAL app.tenant_id`.
- `admin-control-plane.e2e-spec.ts`'s "internal rows stay hidden from the public surface"
  assertions are the template for cross-tenant hiding tests.

**NEW CAPABILITIES**
Server-derived tenant context on every request; a tenant-scoped data access path;
object-level authorization that is tenant-aware; an explicit catalogue of platform-scoped
operations; store-aware frontend query caching mechanism.

**VERIFICATION / ACCEPTANCE CRITERIA**
- New `backend/test/e2e/tenant-isolation.e2e-spec.ts` (created here, grows every phase):
  with two tenants seeded, Tenant A's merchant token cannot list/read/mutate Tenant B's
  products/orders/coupons/customers/settings — each returns 404, no timing/existence leak;
  Tenant A **can** do all of the above for its own data.
- Context-spoof negative test: `X-Active-Tenant: <B>` with an A-only membership → 403.
- Advisory mode in staging for ≥1 week with **zero** cross-tenant breadcrumbs before any
  module flips to enforced.
- CI gate: no domain service imports `PrismaService` outside the allowlist.
- All existing e2e/unit/frontend suites green (single-tenant seed data still works because
  Phase 4 hasn't run — verified via the advisory flag defaulting to a permissive
  single-tenant context in test).

**ROLLBACK / RECOVERY CONSIDERATIONS**
- No schema/data change to roll back beyond enabling RLS on Phase-1 tables (drop policy /
  `DISABLE ROW LEVEL SECURITY` compensating migration).
- The behavioral change is flag-gated: set every module back to `advisory` (or a global
  kill-switch) to revert enforcement without a deploy, if a leak or regression appears.
- Image revert restores pre-Phase-3 request handling.

**EXIT CRITERIA**
`TenantContext` resolved on every request; scoped client in use by every domain service;
object-level tenant checks in place; platform operations catalogued and excluded; isolation
e2e spec passing for the seeded two-tenant case; advisory mode clean in staging; CI bypass
gate active. Enforcement flags may still be `advisory` for modules whose data Phase 4 hasn't
scoped yet.

---

## 10. Phase 4 — Data Ownership Migration

### Phase 4 — Data Ownership Migration

**PURPOSE**
Add `tenantId` (and `storeId` / `customerId` where applicable) to every tenant-owned table,
backfill it from verified ownership paths, validate, then tighten constraints and indexes and
flip each module to **enforced** tenant scoping. Convert global unique constraints and
counters to tenant/store-composite. This is the phase that actually moves the existing
single-tenant dataset into Tenant #1. (Handbook §11; invariants 2, 3, 12, 19.)

**DEPENDENCIES**
Phase 1 (roots), Phase 2 (`Customer`, membership), Phase 3 (scoped client + advisory flags +
isolation test harness). **Hard preconditions:** D2 (is there real production data),
D3 (existing store → Tenant #1), D10 (numbering), D11 (settings split), and a **completed
Phase 14 restore drill** before the first destructive (constraint-tightening) migration.

**REPOSITORY AREAS**
`backend/prisma/schema.prisma` (columns + composite constraints on ~20 tables), a **series**
of migrations under `backend/prisma/migrations/`, a repeatable, resumable backfill script
(new: `backend/prisma/backfill/` — plain SQL / a guarded ts-node script, **not** a Prisma
seed), `backend/src/**` every domain service (flip scoped client from advisory to enforced,
switch counter/unique logic), `orders/orders.service.ts` (`generateOrderNumber` → per-tenant),
`invoices/invoice-number.service.ts` (per-tenant), `app-setting/*` (→ `TenantSetting` /
`StoreSetting`), `coupons/coupons.service.ts` (`code` uniqueness),
`reviews/reviews.service.ts` (`(productId,userId)` → composite),
`products/products.service.ts` + `categories` (`slug` uniqueness).

**DATABASE / DATA IMPACT**
Per §25 waves. Summary of column additions (all initially **nullable**, then backfilled,
then `NOT NULL`):
- `tenantId` on: `Category`, `Product`, `ProductImage`, `ProductVariant`,
  `CustomizationField`, `UploadedFile`, `Cart`, `CartItem`, `CartItemCustomization`,
  `Order`, `Invoice`, `OrderItem`, `OrderItemCustomization`, `PaymentAttempt`, `Refund`,
  `OrderStatusHistory`, `IdempotencyKey`, `OutboxEvent` (nullable — platform events have
  none), `Review`, `Coupon`, `CouponUsage`.
- `storeId` on the store-scoped subset: `Category`, `Product`, `Cart`, `Order`, `Review`,
  `Coupon` (and inherited on their children via `tenantId` + a same-store composite FK).
- `customerId` on: `Cart` (replaces `userId`), `Order` (replaces `userId`), `Review`
  (replaces `userId`), `UploadedFile` (`uploadedByCustomerId?` / `uploadedByUserId?` —
  merchant uploads keep a `User` ref), `CouponUsage` (replaces `userId`),
  `IdempotencyKey` (replaces `userId`), `OrderStatusHistory.changedByCustomerId?` +
  `changedByMembershipId?`.
- **Composite FKs** so a child can't point across stores: e.g.
  `Product (storeId, categoryId)` → `Category (storeId, id)`;
  `Order.couponId` → same store; `CartItem` product/variant same store.
  (Handbook §11 — "the schema itself helps prevent a cross-tenant join.")
- **Unique constraint changes:** `products.slug` → `@@unique([storeId, slug])`;
  `categories.slug` → `@@unique([storeId, slug])`; `coupons.code` → `@@unique([storeId, code])`;
  `reviews @@unique([productId, userId])` → `@@unique([storeId, productId, customerId])`;
  `carts.userId @unique` → `@@unique([storeId, customerId])`;
  `orders.orderNumber @unique` → `@@unique([tenantId, orderNumber])`;
  `invoices.invoiceNumber @unique` → `@@unique([tenantId, invoiceNumber])`.
  `users.email` stays global (identity is global). `uploaded_files.cloudinaryPublicId`
  stays global (storage key). `webhook_events.razorpayEventId`, `outbox_events.eventKey`,
  `idempotency_keys.key` — keep global (server-generated, collision-safe) unless the split
  in D7 changes `webhook_events`.
- **Index changes:** every current single-column index on a now-tenant-owned FK becomes a
  composite leading with `tenantId` (or `storeId`): `orders (tenantId, status)`,
  `orders (storeId, customerId)`, `products (storeId, categoryId)`,
  `reviews (storeId, productId)`, `coupons (storeId, isActive)`, etc.
- **Counters:** `order_number_counter` / `invoice_number_counter` rows in `app_settings` →
  per-tenant rows in a new `TenantCounter` table (or keyed `(tenantId, key)` in
  `TenantSetting`), claimed with the same `INSERT … ON CONFLICT DO UPDATE … RETURNING`
  atomic pattern already in `orders.service.ts` / `invoice-number.service.ts`.
- **Settings split (D11):** every current `AppSetting` business key → `TenantSetting` /
  `StoreSetting` rows under Tenant #1; `PUBLIC_SETTING_KEYS` logic
  (`app-setting.constants.ts`) becomes store-scoped; the two internal counters → `TenantCounter`.

**Backfill logic (verified ownership paths, all → Tenant #1 / its primary store):**
- Catalog: every `Category`/`Product` (+ children by FK) → Tenant #1, primary store.
- `UploadedFile`: `uploadedByUserId` role `ADMIN` → tenant asset (`kind='merchant'`);
  role `CUSTOMER` → `kind='customer-original'`, `customerId` = the migrated `Customer` for
  that user, tenant = Tenant #1.
- `Cart`/`Order`/`Review`/`CouponUsage`/`IdempotencyKey`: `userId` → the migrated
  `Customer.id` (join on `User.id`); tenant/store = Tenant #1.
- `Coupon.createdByAdminId` → the admin `User`'s `OWNER` membership id (or keep `User` ref
  + tenant).
- `OutboxEvent`: historical rows → set `tenantId` = Tenant #1 where the aggregate resolves
  to a tenant-owned entity; leave null for `PASSWORD_RESET_REQUESTED` (identity-scoped) and
  mark `scope='platform'` or `scope='identity'`.
- `WebhookEvent`: per D7 — if split, migrate existing rows to `CommerceWebhookEvent` with
  tenant resolved via `razorpayOrderId → Order → tenantId`.

**BACKEND IMPACT**
- Every domain service's scoped-client flag → `enforced` (module by module, each with its
  isolation tests green first).
- `generateOrderNumber(tx)` / invoice numbering take `tenantId`.
- `app-setting.service.ts` → `tenant-setting.service.ts` / `store-setting.service.ts`;
  `checkout.service.ts`'s `getShippingFeePaise` reads the store's setting;
  `tax.service.ts` reads the tenant's tax config; `invoices.service.ts`'s `sellerSnapshot`
  reads the tenant's seller identity.
- `admin.service.ts` dashboard/customer aggregates → scoped to `ctx.tenantId`
  (`groupBy`/`aggregate` gain `where: { tenantId }`).
- Cron pollers unchanged in scoping (they stay on the global client) but their per-item work
  now reads `row.tenantId` (foundation for Phase 11).

**FRONTEND IMPACT**
Minimal in Phase 4 (backend-heavy). Query keys already namespaced (Phase 3 mechanism);
`admin/*` hooks now implicitly scoped by the server. `useStoreName` / homepage-settings
hooks now hit store-scoped endpoints. Full storefront tenantization is Phase 12.

**INFRASTRUCTURE IMPACT**
- Multiple sequential migrations; the constraint-tightening ones are **expand→contract** and
  some are large-table `ALTER` (`orders`, `order_items`, `uploaded_files`) — plan for
  `CREATE INDEX CONCURRENTLY` where possible (raw SQL in the migration), off-peak windows,
  and Render maintenance mode for the `NOT NULL` + unique-swap steps.
- A **fresh verified backup immediately before each destructive migration**
  (`DEPLOYMENT.md` §3), backup id recorded in deploy notes.
- Backfill runs as a Render one-off job / release step, resumable, with progress logging.

**SECURITY IMPACT**
This phase closes the isolation boundary for real. Until every module is `enforced` and its
isolation tests pass, the boundary is partial — so the **order** within Phase 4 matters:
scope the highest-risk data first (orders, payments, customers, uploads, settings), lowest
last (catalog reads). Advisory-mode breadcrumbs from Phase 3 must be zero for a module
before it flips.

**MIGRATION IMPACT**
The heart of the plan's migration strategy (§25 waves 3–8). Every wave: affected models,
backfill query, validation query (row counts, null checks, orphan checks, cross-store FK
checks), rollback note. No wave proceeds if its validation query returns a single unexpected
row.

**KEY RISKS**
- *Incorrect ownership backfill* (a row assigned to the wrong tenant / customer).
  Mitigation: single-tenant source data means every row maps to Tenant #1 — low ambiguity;
  the risky joins are `User → Customer` (verified 1:1 by `(storeId,email)` unique and a
  reconciliation count) and `Order.userId → Customer`. Validation queries after every wave;
  run the whole sequence against a restored copy and diff row counts before touching
  production.
- *Destructive migration with no way back.* Mitigation: verified backup + a **proven**
  restore (Phase 14) before any `NOT NULL`/unique-swap; expand→contract so the `NOT NULL`
  step is separate from the column add; keep the old `userId` columns until Phase 4's final
  legacy-removal step (a distinct, late migration).
- *Unique-constraint swap race* (dropping `orders.orderNumber @unique` and adding
  `(tenantId, orderNumber)`). Mitigation: add the composite unique first (allowed —
  single-tenant data already satisfies it), verify, then drop the old one; brief maintenance
  window.
- *Counter migration double-issues a number.* Mitigation: initialize each `TenantCounter`
  from `MAX(existing number)` + 1 inside the same migration; keep the atomic
  `INSERT…ON CONFLICT…RETURNING` claim.
- *Large-table lock / downtime.* Mitigation: `ADD COLUMN … NULL` is fast (no table rewrite
  in PG 11+); `CREATE INDEX CONCURRENTLY`; add `NOT NULL` via a `CHECK … NOT VALID` +
  `VALIDATE CONSTRAINT` two-step where the PG version supports the fast path.
- *Backfill interrupted half-way.* Mitigation: idempotent, keyed by primary key, resumable,
  progress-logged; safe to re-run.

**REUSE FROM CURRENT SYSTEM**
- The atomic counter pattern (`orders.service.ts::generateOrderNumber`,
  `invoice-number.service.ts`) — reused verbatim, parameterized by tenant.
- The `AppSetting` typed-normalizer allowlist (`app-setting.constants.ts`) — reused as
  `TenantSetting`/`StoreSetting` validation.
- The immutable snapshot discipline on `Order`/`OrderItem`/`Invoice` — unchanged; those rows
  just gain a `tenantId` label.
- Every existing e2e spec becomes a **single-tenant** case of the multi-tenant suite (seed
  = Tenant #1) — near-zero rewrite, high regression value.

**NEW CAPABILITIES**
Every business row is tenant-owned with an enforced path; cross-store FKs are structurally
impossible; per-tenant order/invoice numbering; per-tenant/store settings; tenant-scoped
admin aggregates; the existing dataset lives as Tenant #1.

**VERIFICATION / ACCEPTANCE CRITERIA**
- Post-backfill validation report per table: `COUNT(*) WHERE tenantId IS NULL` = 0 (for
  mandatory columns); every child row's `tenantId` equals its parent's; no `Order` references
  a `Coupon`/`Product` from another store; `Customer` count == migrated shopper count;
  `SUM`/`COUNT` of orders/revenue per tenant matches the pre-migration global totals.
- `tenant-isolation.e2e-spec.ts` expanded to cover **every** tenant-owned resource type,
  positive + negative, all green, all modules `enforced`.
- Every pre-existing e2e/unit/frontend test green with a Tenant #1 seed.
- `order-status-transitions`, `payments-race`, `checkout-concurrency`, `tax-and-invoicing`,
  `webhook-retry`, `payment-reconciliation` specs re-run under two tenants — no cross-talk.
- Numbering: two tenants both start at `1`, no collision, prefixes independent.
- Restore drill completed and documented (Phase 14 dependency satisfied).

**ROLLBACK / RECOVERY CONSIDERATIONS**
- Expand migrations (nullable column add, additive index, additive composite unique): image
  revert is safe.
- Backfill: re-runnable; a wrong assignment is fixed by re-running against corrected logic
  (single-tenant → everything is Tenant #1, so "wrong" mostly means "null").
- Contract migrations (`NOT NULL`, drop-old-unique, drop-old-column): **restore from the
  pre-migration backup** is the rollback (Prisma has no down-migration). Each contract
  migration is small and isolated so a restore rewinds minimal work.
- Global kill-switch back to `advisory` if an enforced module misbehaves.

**EXIT CRITERIA**
All tenant-owned tables carry a non-null `tenantId` (+ `storeId`/`customerId` where
modelled); composite uniques/indexes/FKs in place; per-tenant counters + settings live; all
domain modules `enforced`; full isolation suite green; all legacy suites green under a tenant
seed; pre-migration aggregate totals reconciled; legacy `userId` columns still present
(dropped in the final legacy-removal wave, after Phase 12) but unused by application code.

---

## 11. Phase 5 — Platform Admin / Tenant Admin

### Phase 5 — Platform Admin / Tenant Admin

**PURPOSE**
Build the two control planes as separate authorization domains with separate audit logs:
the **Platform Control Plane** (`SUPER_ADMIN` — tenants, plans, subscriptions, platform
billing, domains, platform config, feature flags, security, support, audits, system health)
and the **Tenant Control Plane** (`OWNER/ADMIN/STAFF/VIEWER` — products, orders, customers,
coupons, reviews, storefront, settings, merchant payment config, team). Ensure `SUPER_ADMIN`
never becomes a blanket tenant-data key. (Handbook §5, §12; invariants 4, 5, 18.)

**DEPENDENCIES**
Phase 2 (roles/permissions/`SUPER_ADMIN`), Phase 3 (context + platform-op catalogue),
Phase 4 (tenant-scoped data + scoped admin aggregates). Phase 1 (tenancy models the platform
console manages).

**REPOSITORY AREAS**
Backend new: `backend/src/platform/` (platform console module — `platform-tenants`,
`platform-plans`, `platform-subscriptions`, `platform-domains`, `platform-audit`,
`platform-support` submodules), `backend/src/common/audit/` (`PlatformAuditLog` +
`TenantAuditLog` writers + an interceptor for sensitive actions).
Backend modified: `admin/admin.controller.ts` + `admin/admin.module.ts` (becomes the Tenant
Control Plane surface, permission-guarded, tenant-scoped), product/category/coupon/review
controllers (already permission-guarded from Phase 2 — confirm they're tenant-scoped from
Phase 4), `common/guards/*` (ensure `PlatformGuard` and `PermissionsGuard` are mutually
exclusive per route).
Frontend new: `frontend/src/pages/platform/**` + `layouts/PlatformLayout.tsx` +
`features/auth/PlatformRoute.tsx` + `components/platform/**` + `hooks/usePlatform*`.
Frontend modified: `App.tsx` (add `/platform/*` tree under `PlatformRoute`), `adminNav.ts`,
`AdminSidebar.tsx` (tenant-scoped nav), the tenant switcher from Phase 2.

**DATABASE / DATA IMPACT**
- `PlatformAuditLog` — `id`, `actorUserId` (SUPER_ADMIN), `action`, `targetType`,
  `targetId`, `tenantId?` (when the action touched a specific tenant),
  `justification?` (required for scoped tenant-data access — handbook §5),
  `metadata` JSON, `ip`, `createdAt`. Append-only.
- `TenantAuditLog` — `id`, `tenantId`, `actorMembershipId?` / `actorCustomerId?`, `action`,
  `targetType`, `targetId`, `metadata`, `createdAt`. Append-only. (Existing
  `OrderStatusHistory` is a domain-specific tenant audit trail and stays; `TenantAuditLog`
  is the general one for settings/team/coupon/catalog changes.)
- `SupportSession` / impersonation grant — `id`, `platformUserId`, `tenantId`,
  `grantedAt`, `expiresAt`, `scope` (permissions granted for the window), `reason`,
  `revokedAt?`. Impersonation/support access is **temporary, tenant-scoped, audited**
  (handbook §5) — never a standing capability.
- `FeatureFlag` — `id`, `key`, `scope` (`global` / `tenant`), `tenantId?`, `enabled`,
  `createdAt`. **Distinct from plan entitlements** (handbook §12 — "never conflated").
- `PlatformConfig` — key–value, platform-owned (if D11 surfaced any truly platform-global
  config).

**BACKEND IMPACT**
- **Platform console API** under `/platform/*`, guarded by `PlatformGuard` **only** (no
  `PermissionsGuard`, no `TenantContext` middleware — different code path entirely):
  - `platform-tenants`: list/create/suspend/resume/schedule-deletion tenants; view a
    tenant's subscription + store + domain status (read of *metadata*, not the tenant's
    business rows).
  - `platform-plans`: CRUD `Plan`/`PlanFeature`/`PlanLimit` (Phase 6 fills the model).
  - `platform-subscriptions`: view/adjust a tenant's subscription, trigger recovery
    (Phase 7).
  - `platform-domains`: review/approve custom-domain verifications (Phase 9).
  - `platform-audit`: read `PlatformAuditLog` + `TenantAuditLog` (platform can read tenant
    audit; tenant cannot read platform audit — one-way).
  - `platform-support`: open a time-boxed, scoped `SupportSession` into a tenant — every
    read/write during it is tagged in `PlatformAuditLog` with the session + justification.
- **Scoped tenant-data access for SUPER_ADMIN:** *not* via the tenant-scoped client with a
  bypass. A `SUPER_ADMIN` who needs to see a tenant's orders opens a `SupportSession`
  (justification required), which mints a **scoped, expiring** tenant context — the same
  `TenantContext` path a merchant uses, just granted by a platform grant instead of a
  membership, and fully audited. No endpoint returns cross-tenant business rows in bulk.
  (Invariant 5.)
- **Tenant Control Plane** = the existing `admin` surface, now permission-guarded
  (Phase 2) + tenant-scoped (Phase 4) + writing `TenantAuditLog` for sensitive actions
  (settings, team, coupons, order status, review moderation).
- `admin.module.ts` gains a `TeamController` (`OWNER`/`ADMIN` manage `TenantMembership`
  rows — invite/remove/change role, all `< own role`, all audited).

**FRONTEND IMPACT**
- New `/platform/*` SPA area (`PlatformLayout` + `PlatformRoute` checking
  `platformRole === 'SUPER_ADMIN'`): tenants list/detail, plans, subscriptions, domains,
  audit log viewer, support-session launcher, system health.
- Tenant admin (`/admin/*`) gains a team-management page and a tenant switcher; nav is
  filtered by the current membership's permissions.
- **Physical separation:** `/platform/*` and `/admin/*` are different route trees, different
  layouts, different API base paths; a `Customer` or a membership-only `User` never sees
  `/platform/*` (route guard + server 403). A `SUPER_ADMIN` with no membership sees
  `/platform/*` but **not** `/admin/*` for any tenant unless via a support session.

**INFRASTRUCTURE IMPACT**
- Possibly a distinct hostname for the platform console (`platform.printforge.app` /
  `admin.forgebuilds.com`) — REQUIRES DECISION-minor (D6-adjacent). At minimum a distinct
  path namespace + its own CORS/origin entry.
- Two new append-only tables — additive migration.
- `SUPER_ADMIN` accounts get stronger controls (MFA — handbook §16 "privileged accounts
  receive stronger security controls"). MFA mechanism is IMPLEMENTATION — NOT FROZEN; a
  Phase 5 sub-task or a Phase 15 hardening item.

**SECURITY IMPACT**
Defines the second orthogonal boundary. The critical property: there is **no route** where a
`SUPER_ADMIN` token alone returns another tenant's carts/orders/customers/assets in bulk;
scoped access is grant-based, time-boxed, justified, audited. Platform and tenant audit logs
are separate and the read direction is one-way (platform → tenant, never tenant → platform).

**MIGRATION IMPACT**
Additive tables only. No business-data migration. The existing single admin `User` (now
`OWNER` of Tenant #1 from Phase 2) is **not** automatically a `SUPER_ADMIN` — creating the
first `SUPER_ADMIN` is a deliberate, documented platform-bootstrap step
(analogous to today's `UPDATE users SET role='ADMIN'` in `DEPLOYMENT.md` §8, but for
`platformRole`).

**KEY RISKS**
- *SUPER_ADMIN becomes an unscoped bypass* (the #1 risk this phase must prevent).
  Mitigation: no bypass in the scoped client; cross-tenant bulk endpoints simply don't
  exist; support sessions are the only path and are audited + expiring; e2e negative tests
  assert a raw `SUPER_ADMIN` token gets 403/404 on tenant business routes.
- *Audit log gap* (a sensitive action not recorded). Mitigation: an interceptor on
  `@Audited()` routes writes the log in the same transaction as the action; CI checklist for
  new sensitive routes.
- *Platform console reachable by a tenant user.* Mitigation: separate guard, separate route
  tree, separate origin; e2e test that an `OWNER` token 403s on every `/platform/*` route.
- *Feature flags conflated with entitlements.* Mitigation: separate tables, separate
  services, separate UIs; code review rule.

**REUSE FROM CURRENT SYSTEM**
- The entire existing `admin` module + all admin React pages/components
  (`pages/admin/*`, `components/admin/*`, `features/admin/*`) become the Tenant Control
  Plane with near-zero rewrite — they were already a separate shell (`AdminLayout`,
  `AdminRoute`) per `App.tsx`.
- `admin-control-plane.e2e-spec.ts` — extended, becomes the Tenant Control Plane suite.
- `OrderStatusHistory` (`orders/history/`) — the model for append-only audit.
- The `@Roles`/`RolesGuard` metadata-reflection pattern — the model for `@PlatformOnly`/
  `@Audited`.

**NEW CAPABILITIES**
Platform console (`SUPER_ADMIN`); tenant team management; separate platform + tenant audit
logs; time-boxed audited support/impersonation sessions; feature flags distinct from
entitlements.

**VERIFICATION / ACCEPTANCE CRITERIA**
- `backend/test/e2e/platform-control-plane.e2e-spec.ts` (new): `SUPER_ADMIN` can list
  tenants/plans/subscriptions/domains and read audit logs; `SUPER_ADMIN` **cannot** read
  Tenant A's orders/customers/carts/assets without a `SupportSession`; a `SupportSession`
  grants scoped, expiring access and every access is in `PlatformAuditLog`; an `OWNER` token
  403s on all `/platform/*`; a `Customer` token 401/403s on both planes.
- Tenant audit: changing a setting / moderating a review / transitioning an order writes a
  `TenantAuditLog` row; the tenant can read its own, cannot read `PlatformAuditLog`.
- Team management: an `ADMIN` cannot grant `OWNER`; a `STAFF` cannot manage team; all audited.
- Existing admin suites green.

**ROLLBACK / RECOVERY CONSIDERATIONS**
Additive tables → image revert safe. If the platform console must be pulled, disable the
`/platform/*` routes (feature flag / route removal) — the Tenant Control Plane is unaffected.
Audit logs are append-only; no rollback concern.

**EXIT CRITERIA**
Both control planes live and physically separate; `SUPER_ADMIN` provably not an unscoped
bypass; support sessions time-boxed + audited; platform + tenant audit logs separate and
one-way; team management working; all suites green.

---

## 12. Phase 6 — Plans / Features / Limits / Usage

### Phase 6 — Plans / Features / Limits / Usage

**PURPOSE**
Build the entitlement engine: `Plan → PlanFeature / PlanLimit → Usage → Entitlement`, with
the backend as the single source of truth. Feature gates (can/can't) and limits (how much)
are never merged. Usage is split persistent vs period-based. No plan-name comparisons in
business logic. (Handbook §6, Part VI; invariants 13, 19.)

**DEPENDENCIES**
Phase 1 (`Plan`/`Subscription` shells), Phase 2 (permissions — entitlement checks compose
with permission checks), Phase 4 (tenant-scoped data — usage counts are per-tenant), Phase 5
(platform console CRUDs plans).

**REPOSITORY AREAS**
Backend: expand `backend/src/plans/` — `PlanFeature`, `PlanLimit`, `Usage`,
`EntitlementService`, `@RequireFeature('...')` guard/decorator, `assertLimit('...')` helper;
`backend/src/platform/platform-plans/` (CRUD). Touch every domain service that creates a
limited resource (`products.service.ts` create, `uploads.service.ts` create,
`orders`/`checkout` on order creation, `coupons.service.ts` create, team invite) to call
`assertLimit` / increment `Usage`. Frontend: `hooks/useEntitlements.ts`, feature-gated UI in
`pages/admin/*`, `pages/platform/platform-plans/*`.

**DATABASE / DATA IMPACT**
- `Plan` (expand from shell) — `key`, `name`, `isPublic`, `sortOrder`, `isEnterpriseCustom`.
- `PlanFeature` — `id`, `planId`, `featureKey`, `enabled`. `@@unique([planId, featureKey])`.
- `PlanLimit` — `id`, `planId`, `limitKey`, `limitValue` (int; `NULL` = unlimited),
  `period` (`PERSISTENT` | `BILLING_PERIOD` — split per handbook §6),
  `@@unique([planId, limitKey])`.
- `TenantEntitlementOverride` — `id`, `tenantId`, `featureKey?`/`limitKey?`, `value` —
  Enterprise custom limits/features **without changing the model** (handbook §6).
- `Usage` — `id`, `tenantId`, `limitKey`, `period` (`PERSISTENT` | a period stamp like
  `2026-09`), `count`, `updatedAt`. `@@unique([tenantId, limitKey, period])`. Incremented
  atomically (`INSERT … ON CONFLICT DO UPDATE SET count = count + 1` — same atomic pattern
  as the existing counters).
- **`Entitlement` is computed, not stored** — `EntitlementService.resolve(tenantId)` reads
  `Subscription.planId` → `PlanFeature`/`PlanLimit` + `TenantEntitlementOverride` + current
  `Usage`, returns `{ features: Set, limits: Map<key, {value, used, remaining}> }`. Cached
  per-request; invalidated on subscription/usage change.
- Seed the five plans (`free/starter/growth/business/enterprise`) with **placeholder**
  feature/limit rows — **exact features, numeric values, and which feature gates which
  surface are IMPLEMENTATION / CONFIGURATION — NOT FROZEN** and supplied by product.

**BACKEND IMPACT**
- `EntitlementService` — the only place plan/feature/limit/usage logic lives.
- `@RequireFeature('custom_domains')` guard (403 + a machine-readable "upgrade required"
  code when absent).
- `assertLimit('products')` called inside the create transaction *before* the write, using
  `SELECT … FOR UPDATE` on the `Usage` row or the atomic conditional-update pattern already
  in `coupons.service.ts` (`UPDATE … WHERE usedCount < usageLimitTotal RETURNING id`) — so a
  concurrent create can't exceed the limit.
- `Usage` increment on create, decrement on hard-delete only for `PERSISTENT` limits;
  `BILLING_PERIOD` usage resets by period key (no delete — a new period is a new row).
- **Downgrade behavior:** on plan change, `EntitlementService` recomputes; existing
  over-limit data is **untouched** (invariant 19), new creates are blocked until under the
  limit. A `platform-subscriptions` action can grant a temporary override.
- No `if (plan === …)` anywhere — enforced by a CI grep gate on plan `key` string literals
  outside `plans/`.

**FRONTEND IMPACT**
- `useEntitlements()` hook (query key `['t', tenantId, 'entitlements']`).
- Admin UI hides/disables feature-gated actions and shows usage meters ("42 / 100 products");
  a blocked action shows an upgrade prompt, not a raw 403.
- Platform console: plan/feature/limit CRUD grids.

**INFRASTRUCTURE IMPACT**
Additive migration. Entitlement resolution adds a small per-request query — cache it
(request-scoped + a short cross-request TTL keyed by tenant, busted on subscription/usage
write). No topology change.

**SECURITY IMPACT**
Entitlement is an authorization concern (invariant 13 — "the backend enforces"). It must be
server-side and uncacheable-by-client. It composes with, never replaces, permission and
tenant checks (a `VIEWER` still can't create a product even if the plan allows more).

**MIGRATION IMPACT**
Additive. Tenant #1 gets a plan assignment (its Phase 1 `Free`/`ACTIVE` subscription →
possibly bump to an internal "unlimited" plan for the demo tenant). Backfill `Usage`
`PERSISTENT` counts from current row counts (`products`, `uploaded_files`, etc.) per tenant
so limits are accurate from day one.

**KEY RISKS**
- *Plan-name logic leaking into business code.* Mitigation: CI grep gate; code review;
  `EntitlementService` is the only importer of plan keys.
- *Race allowing limit overrun.* Mitigation: check-and-increment inside the same
  transaction/lock as the resource create (pattern already proven in
  `coupons.service.ts` / the order-number counter).
- *Downgrade deletes data.* Mitigation: explicit test that a downgrade over-limit leaves all
  rows intact and only blocks new creates (invariant 19).
- *Usage drift* (count diverges from reality). Mitigation: a periodic reconciliation job
  (Phase 11) recomputes `PERSISTENT` usage from actual row counts and logs discrepancies.
- *Entitlement cache staleness after an upgrade.* Mitigation: bust on subscription webhook
  (Phase 7) and on any `Usage`/override write.

**REUSE FROM CURRENT SYSTEM**
- The atomic conditional-update counter pattern (`coupons.service.ts` `usedCount` CAS,
  `orders.service.ts` counter) — the exact mechanism for `Usage` increments and limit
  enforcement.
- `app-setting.constants.ts` allowlist/typed-definition pattern — the model for the
  feature/limit key catalogue.
- Existing per-transaction `SELECT … FOR UPDATE` discipline in `checkout.service.ts`.

**NEW CAPABILITIES**
Server-authoritative entitlements; feature gates; persistent + period-based limits with
enforcement; Enterprise overrides without model change; usage metering + admin visibility.

**VERIFICATION / ACCEPTANCE CRITERIA**
- `backend/test/e2e/entitlements.e2e-spec.ts` (new): a `free`-plan tenant is blocked from a
  `business`-only feature (403 + upgrade code); a tenant at its product limit gets a clean
  429/403 on create and **no** partial write; concurrent creates at the limit boundary never
  exceed it (race test, mirrors `checkout-concurrency` style); a downgrade leaves over-limit
  data intact; an Enterprise override raises the limit without a schema change; period-based
  usage rolls over at the period boundary while persistent usage does not.
- CI: zero plan-key string literals outside `src/plans/`.
- Usage backfill reconciles to actual row counts.

**ROLLBACK / RECOVERY CONSIDERATIONS**
Additive tables → image revert safe. A global "entitlements advisory" flag (log-only, don't
block) mirrors Phase 3's pattern, so a bad limit config can't lock every merchant out of
creating products — flip to advisory, fix config, re-enable.

**EXIT CRITERIA**
Entitlement engine live and authoritative; feature gates + limit enforcement on every
limited resource; usage metered + visible; downgrade non-destructive; Enterprise overrides
working; no plan-name logic in business code; suites green.

---

## 13. Phase 7 — SaaS Subscription / Billing

### Phase 7 — SaaS Subscription / Billing

**PURPOSE**
Make the tenant `Subscription` authoritative and driven by a billing provider behind an
abstraction: the 7 frozen states, historical `SubscriptionEvent` records, immutable SaaS
`Invoice` snapshots, verified idempotent billing webhooks, reconciliation against the
provider, and the upgrade/downgrade/cancellation/payment-recovery flows. **Kept structurally
separate from merchant commerce payments** (invariant 6). (Handbook §7; invariants 6, 10, 19.)

**DEPENDENCIES**
Phase 1 (`Subscription` shell), Phase 6 (entitlements consume subscription state), Phase 5
(platform console manages subscriptions). D7 (webhook split).
**IMPLEMENTATION / CONFIGURATION — NOT FROZEN:** the billing provider (Stripe/Paddle/
Chargebee/Razorpay-Subscriptions/…), its API, and its webhook payloads are a vendor decision,
made and documented separately, behind the abstraction this phase defines. **Billing provider
selection = implementation/vendor decision.**

**REPOSITORY AREAS**
Backend new: `backend/src/billing/` — `SubscriptionService`, `BillingProvider` interface +
first adapter, `billing-webhooks/` (its **own** two-phase receiver, separate secret,
separate table per D7), `saas-invoices/`, `SubscriptionStateMachine`, `billing-reconciliation`
(cron). Backend modified: `plans/EntitlementService` (bust cache on subscription change),
`platform/platform-subscriptions/`.
Frontend new: `pages/admin/billing/*` (merchant sees their own subscription, invoices,
payment method, upgrade/downgrade), `pages/platform/platform-subscriptions/*`.

**DATABASE / DATA IMPACT**
- `Subscription` (expand) — `tenantId @unique`, `planId`, `status` (7 states),
  `providerCustomerId?`, `providerSubscriptionId?`, `currentPeriodStart/End`,
  `cancelAtPeriodEnd` (bool), `trialEndsAt?`, `pendingPlanId?` (scheduled end-of-period
  downgrade), `graceEndsAt?` (PAST_DUE handling), `createdAt`, `updatedAt`.
- `SubscriptionEvent` — `id`, `subscriptionId`, `tenantId`, `type`
  (`created/activated/upgraded/downgrade_scheduled/downgrade_applied/payment_failed/
  entered_grace/paused/resumed/cancelled/expired/reactivated`), `fromStatus?`, `toStatus`,
  `fromPlanId?`, `toPlanId?`, `providerEventId?`, `metadata`, `createdAt`. Append-only —
  "every subscription change is historically recorded" (handbook §7).
- `SaasInvoice` — `id`, `tenantId`, `number` (per-platform sequence — ForgeBuilds' own
  invoice numbering, **separate** from merchant `Invoice`), `status`
  (`draft/open/paid/void/uncollectible`), `currency`, `subtotal`, `tax`, `total`,
  `periodStart/End`, `planSnapshot` JSON (immutable — "what was charged and why"),
  `providerInvoiceId?`, `issuedAt`, `paidAt?`. Line items in `SaasInvoiceLine`.
- `BillingWebhookEvent` (D7) — mirrors the existing `WebhookEvent` two-phase design
  (`id`, `providerEventId @unique`, `payload`, `status` RECEIVED/PROCESSED/IGNORED/
  PROCESSING_FAILED/FAILED, `attempts`, `availableAt`, `lastError`, `processedAt`) — its own
  poller, its own signing secret, **never** shares a table or a processor with commerce
  webhooks.
- `PaymentMethod` (SaaS) — tokenized reference from the billing provider; **no raw card
  data** (handbook §16 "minimize the sensitive payment data PrintForge itself stores").

**BACKEND IMPACT**
- `BillingProvider` interface: `createCustomer`, `createSubscription`, `updateSubscription`
  (upgrade/downgrade), `cancelSubscription`, `listInvoices`, `getSubscription`,
  `verifyWebhook(rawBody, sig)`, `parseWebhook`. First adapter is the chosen vendor;
  a `FakeBillingProvider` for tests (mirrors `FakeCloudinaryService` in
  `backend/test/e2e/support/`).
- `SubscriptionStateMachine` — the 7 states, transition rules from handbook §7:
  upgrade only on **confirmed billing** (never optimistic); downgrade →
  `pendingPlanId` + `downgrade_applied` at `currentPeriodEnd` (a cron/job, not immediate);
  payment failure → `PAST_DUE` → `graceEndsAt` → `PAUSED` (not immediate cutoff);
  cancellation → `CANCELLED` (data retained — invariant 19) → `EXPIRED` after retention
  window. **No states beyond the 7.** Same compare-and-swap discipline as the existing
  `order-state-machine.ts`.
- `billing-webhooks` receiver: verify signature → persist → fast ack → poller processes
  transactionally + idempotently (reuse the exact `WebhookProcessor` shape). Webhook is the
  **authoritative** signal — local state is never guessed between webhooks (handbook §7).
- `billing-reconciliation` cron: periodically fetch provider subscription/invoice state and
  reconcile against local (mirrors `PaymentReconciliationService` for commerce).
- On any status/plan change: write `SubscriptionEvent`, bust the entitlement cache
  (Phase 6), emit an outbox notification (Phase 11).
- **SaaS refunds** (subscription) handled entirely here — a separate workflow, a separate
  ledger, never touching `Refund` / `PaymentAttempt` (invariant 6).

**FRONTEND IMPACT**
- Merchant billing page: current plan + status, next invoice, invoice history (download),
  payment method update (provider-hosted element/redirect — no card data in our SPA),
  upgrade (immediate, after billing confirms) / downgrade (shows "effective <period end>").
- Platform console: per-tenant subscription view, force-recover, comp/adjust, view
  `SubscriptionEvent` timeline.
- A `PAST_DUE`/`PAUSED` banner in the tenant admin with a "fix payment" CTA.

**INFRASTRUCTURE IMPACT**
- New env vars for the billing provider (additive; validated only when a billing feature is
  enabled, mirroring `PRODUCTION_REQUIRED_KEYS` conditionality in `env.validation.ts`).
- A billing webhook endpoint (public, raw-body — `main.ts` already sets `rawBody: true` for
  the commerce webhook; the billing one needs the same treatment on its route).
- New cron (billing reconciliation) — see Phase 11 for multi-instance safety; until Phase 11
  it runs on the single instance like the existing three.

**SECURITY IMPACT**
Invariant 6 lives here: separate models, separate provider, separate secrets, separate
webhook table + processor, separate refund workflow, separate audit. Billing webhooks
verified before processing (invariant 10). No raw payment data stored. Merchant can only see
**their own** subscription/invoices (tenant-scoped); platform sees all (platform-owned
billing data — not tenant business data, so not an invariant-5 concern).

**MIGRATION IMPACT**
Additive. Every existing tenant (Tenant #1) already has a `Free`/`ACTIVE` subscription from
Phase 1; this phase gives it real state + a provider customer record if it's a paid plan
(the demo tenant likely stays `Free` / internal-unlimited). No commerce data touched.

**KEY RISKS**
- *Commingling with commerce payments.* Mitigation: physically separate everything; a CI
  rule that `billing/` never imports `payments/` and vice versa; invariant-6 e2e test.
- *Subscription webhook inconsistency* (out-of-order / duplicate / lost provider events).
  Mitigation: idempotent by `providerEventId @unique`; two-phase persist-then-process;
  reconciliation cron as the safety net (same design that already works for commerce in
  `payment-reconciliation.service.ts`); process events tolerant of reordering (transitions
  are CAS and idempotent).
- *Optimistic upgrade* granting entitlements before payment clears. Mitigation: state
  machine forbids `→ ACTIVE`/plan-raise without a confirmed billing event.
- *Downgrade applied immediately* truncating access. Mitigation: `pendingPlanId` +
  end-of-period job; test.
- *Entitlement cache not busted on status change* (a `PAST_DUE` tenant keeps full access).
  Mitigation: explicit cache-bust in every `SubscriptionService` mutation + webhook handler;
  test.
- *Adding an 8th state.* Mitigation: `SubscriptionStatus` enum is exactly 7; PR review +
  handbook reference.

**REUSE FROM CURRENT SYSTEM**
- The two-phase webhook design (`payments/webhooks/webhook-processor.service.ts`) — copied
  wholesale for billing webhooks (bounded retry, backoff, dead-letter, Sentry,
  non-retryable classification).
- `PaymentReconciliationService` — the template for `billing-reconciliation`.
- `orders/state-machine/order-state-machine.ts` (`assertTransitionAllowed`, CAS) — the
  template for `SubscriptionStateMachine`.
- `Invoice` immutability discipline (`invoices.service.ts` — snapshot every field, never
  re-derive) — copied for `SaasInvoice`.
- `FakeCloudinaryService` pattern — the model for `FakeBillingProvider`.
- The transactional outbox — reused for billing notifications.

**NEW CAPABILITIES**
Authoritative per-tenant subscription with 7 states; historical `SubscriptionEvent`;
immutable SaaS invoices; verified idempotent billing webhooks; provider reconciliation;
upgrade/downgrade/cancel/recovery flows; SaaS refunds separate from commerce.

**VERIFICATION / ACCEPTANCE CRITERIA**
- `backend/test/e2e/subscription-billing.e2e-spec.ts` (new, with `FakeBillingProvider`):
  full lifecycle `PENDING→TRIALING→ACTIVE→PAST_DUE→PAUSED→ACTIVE` and `→CANCELLED→EXPIRED`;
  upgrade blocked until a billing-confirmed webhook; downgrade takes effect only at period
  end; a duplicate/out-of-order webhook is idempotent; a lost webhook is recovered by
  reconciliation; every transition writes a `SubscriptionEvent`; entitlement cache busts on
  each change; a `PAST_DUE` tenant retains data but loses paid-feature access after grace.
- `backend/test/e2e/money-flow-separation.e2e-spec.ts` (new): a SaaS refund never creates a
  `Refund`/`PaymentAttempt` row; a commerce refund never touches `SaasInvoice`; `billing/`
  and `payments/` share no table.
- Merchant sees only their own billing; platform sees all.

**ROLLBACK / RECOVERY CONSIDERATIONS**
Additive tables → image revert safe. A billing feature flag gates the whole subsystem — if
the provider integration misbehaves, disable billing mutations (existing subscriptions
freeze at their current state, entitlements unaffected) while keeping the webhook receiver
persisting events for later replay. SaaS invoices are immutable; reconciliation replays from
the provider.

**EXIT CRITERIA**
Subscription authoritative and webhook-driven; 7 states only; `SubscriptionEvent` history
complete; SaaS invoices immutable; billing webhooks verified + idempotent + reconciled;
upgrade/downgrade/cancel/recovery flows working per handbook §7; provable separation from
commerce payments; suites green.

---

## 14. Phase 8 — Merchant Payment Account

### Phase 8 — Merchant Payment Account

**PURPOSE**
Introduce `PaymentAccount` (per-tenant, per-provider) and a `PaymentProvider` abstraction so
that a customer's commerce payment flows through **the merchant's own** payment-account
context — not through the single platform Razorpay account it uses today. Reuse the existing
Razorpay commerce logic wherever compatible. Do **not** redesign the payment flow, and do
**not** invent Route/linked-accounts/settlement/KYC/payout/merchant-of-record.
(Handbook §8; invariants 6, 8, 9, 10.)

**DEPENDENCIES**
Phase 3 (tenant context — every payment call is tenant-scoped), Phase 4 (`Order` carries
`tenantId`/`storeId`). D9 (credential storage).
**IMPLEMENTATION / CONFIGURATION — NOT FROZEN:** Razorpay Route, linked-account behavior,
settlement mechanics, KYC flows, merchant-of-record status, and payout architecture are
**explicitly not specified by the frozen architecture and must not be assumed** — separate
commercial/provider decisions made within this abstraction.

**REPOSITORY AREAS**
Backend: `backend/src/payments/` heavily — new `PaymentProvider` interface,
`payments/providers/razorpay-provider.ts` (wraps the existing
`payments/razorpay/razorpay.service.ts`), new `PaymentAccountService` + `payment-accounts/`
submodule (tenant admin manages its account), `payments/payments.service.ts`,
`payments/payments.controller.ts`, `payments/webhooks/webhook-processor.service.ts`
(resolve tenant from `paymentAccountId`/`razorpayOrderId`),
`payments/payment-reconciliation.service.ts` (per-account credentials),
`payments/razorpay/razorpay.service.ts` (credentials now injected per-call, not from env),
`checkout/checkout.service.ts` (uses the order's store's payment account).
Frontend: `pages/admin/settings/payment-account/*` (merchant connects/configures its
provider), `features/checkout/useRazorpayCheckout.ts` (key id comes from the per-order
initiate-payment response — already the case per `frontend/.env.example` note, so minimal
change).
Prisma: new `PaymentAccount`; `PaymentAttempt`/`Refund`/`Order` gain `paymentAccountId`.

**DATABASE / DATA IMPACT**
- `PaymentAccount` — `id`, `tenantId`, `storeId?` (v1: one per store/tenant), `provider`
  (`RAZORPAY` — enum, extensible), `status` (`PENDING/ACTIVE/DISABLED`), `displayName`,
  `mode` (`test`/`live`), `credentialsEncrypted` (envelope-encrypted blob — D9;
  `keyId`, `keySecret`, `webhookSecret`), `credentialsKeyId` (KMS key ref),
  `createdAt`, `updatedAt`. `@@unique([storeId, provider])` (v1 baseline).
  **Credentials are never returned to any client, never logged, never placed in a job
  payload** (invariant 9; handbook §15).
- `PaymentAttempt` — add `paymentAccountId` (FK), `tenantId`. Partial unique
  `(orderId) WHERE status='CAPTURED'` unchanged.
- `Refund` — add `paymentAccountId`, `tenantId`.
- `Order` — add `paymentAccountId` (resolved at checkout from the store's account) so
  reconciliation and webhooks can find the right credentials.
- `WebhookEvent` (commerce, per D7) — add `paymentAccountId?` (resolved during processing).

**BACKEND IMPACT**
- `PaymentProvider` interface: `createOrder`, `verifyPaymentSignature`,
  `verifyWebhookSignature`, `fetchOrderPayments`, `createRefund` — **exactly the surface
  `RazorpayService` already exposes** (verified: `createRazorpayOrder`,
  `verifyPaymentSignature`, `verifyWebhookSignature`/`verifyWebhookSignature`,
  `fetchOrderPayments`, `createRefund`). The interface is essentially the existing service's
  public methods, parameterized by a credentials object.
- `RazorpayProvider` = the existing `RazorpayService`, refactored so credentials are passed
  per call (from the resolved `PaymentAccount`) instead of read once from
  `ConfigService.get('razorpay')` at construction. Its normalization (bigint paise, never a
  float; `RazorpayApiError` transport-vs-response classification) is kept verbatim.
- `checkout.service.ts`: resolve `store.paymentAccountId`; if none/`DISABLED`, checkout is
  blocked with a clear "store payment not configured" error (a merchant-onboarding gate, not
  a customer-facing bug).
- `WebhookProcessor` + `PaymentReconciliationService`: resolve the `PaymentAccount` (via the
  event's order → `paymentAccountId`, or the webhook's account routing) and decrypt
  credentials **only inside the provider adapter**.
- Webhook receipt: each `PaymentAccount` has its own `webhookSecret`; the receiver must
  select the right secret to verify (route by a per-account webhook path
  `/payments/webhook/:accountId`, or by an account hint in the payload verified against
  every active account — **REQUIRES DECISION-minor**, propose per-account path).
- Platform `PaymentAttempt`/`Refund` audit stays tenant-scoped (`OrderStatusHistory`-style).

**FRONTEND IMPACT**
- Tenant admin "Payments" settings page: connect provider (enter keys / OAuth if the
  provider supports it — not frozen), test mode toggle, connection status, the webhook URL
  to register.
- Storefront checkout: `useRazorpayCheckout` already takes the key id from the
  per-call `initiate-payment` / `retry-payment` response (`payment-views.interface.ts` —
  confirmed in `frontend/.env.example`), so the frontend change is minimal: the backend just
  sources that key id from the store's `PaymentAccount` instead of env.

**INFRASTRUCTURE IMPACT**
- A KMS / envelope-encryption dependency for `credentialsEncrypted` (D9). New env: a master
  key ref. Additive.
- `RAZORPAY_KEY_ID/KEY_SECRET/WEBHOOK_SECRET` env vars: keep for the demo tenant's initial
  account seeding / a platform fallback, then **remove from `PRODUCTION_REQUIRED_KEYS`**
  once every tenant has its own account (a later contract step — `env.validation.ts`).
- Per-account webhook paths → the Razorpay dashboard for each merchant points at
  `{BACKEND_URL}/api/v1/payments/webhook/{accountId}`.

**SECURITY IMPACT**
Invariants 6, 8, 9. Each tenant's payment credentials are isolated, encrypted at rest,
decrypted only in the adapter, never serialized outward. Amounts remain server-authoritative
(the existing `PricingService` / `bigint` paise path is untouched). Webhooks stay verified
per-account. A tenant can only see/manage **its own** `PaymentAccount`.

**MIGRATION IMPACT**
- Additive `PaymentAccount` + nullable `paymentAccountId` columns.
- Backfill: create one `PaymentAccount` for Tenant #1 from the **current env credentials**
  (a one-time, secure seeding — not a `SELECT`), set `Order.paymentAccountId` /
  `PaymentAttempt.paymentAccountId` / `Refund.paymentAccountId` for all existing rows to
  that account.
- Then `NOT NULL` the columns (contract step, backup first).

**KEY RISKS**
- *Payment separation failure* (a tenant's commerce payment routed through the platform
  account, or two tenants sharing an account). Mitigation: `checkout` resolves the account
  from the order's store every time; `@@unique([storeId, provider])`; e2e test that two
  tenants' payments hit two different (fake) providers with two different credentials.
- *Credential leak* (into logs, Sentry `extra`, job payloads, API responses). Mitigation:
  the existing `WebhookProcessor.safeContext` / `PaymentReconciliationService.safeContext`
  helpers already scrub to "ids and counts only" — extend that discipline; a redaction unit
  test; `credentialsEncrypted` is never selected by default (Prisma `omit`).
- *Webhook verified against the wrong account's secret.* Mitigation: per-account webhook
  path; the processor loads the account by path param, not by trusting the payload.
- *Reconciliation using stale/wrong credentials.* Mitigation: always resolve via
  `order.paymentAccountId`; skip (and alert) if the account is `DISABLED`.
- *Breaking the existing single-account e2e tests.* Mitigation: seed Tenant #1 with a
  `PaymentAccount` wrapping the test credentials; `payments-race` / `webhook-retry` /
  `payment-reconciliation` specs get a `paymentAccountId` in their fixtures — small change.

**REUSE FROM CURRENT SYSTEM**
- **Almost the entire `payments` module.** `RazorpayService` (SDK wrapper, error
  translation, bigint-paise discipline), `PaymentsService` (`applyWebhookEvent`,
  `reconcileCapturedPayment`, `failStalePendingOrder`, `isUniqueConstraintViolation`),
  `WebhookProcessor` (two-phase, bounded retry, dead-letter), `PaymentReconciliationService`,
  `PaymentMismatchError`, the partial-unique-index invariant — all kept, parameterized by
  `PaymentAccount`.
- `PaymentAttempt`/`Refund` models — extended, not replaced.
- `payment-views.interface.ts` per-call key-id delivery — already the right pattern.

**NEW CAPABILITIES**
Per-tenant merchant payment account; a payment-provider abstraction (Razorpay first);
encrypted per-tenant credentials; per-account webhook verification; commerce payments
provably isolated per tenant and separate from SaaS billing.

**VERIFICATION / ACCEPTANCE CRITERIA**
- `backend/test/e2e/merchant-payment-account.e2e-spec.ts` (new): Tenant A's checkout creates
  a provider order via Tenant A's credentials; Tenant B's via Tenant B's; a webhook signed
  with A's secret is rejected on B's webhook path; a tenant can only read/update its own
  `PaymentAccount`; checkout is blocked (clean error) when the store has no active account.
- `payments-race`, `webhook-retry`, `payment-reconciliation`, `checkout-security`,
  `checkout-concurrency` specs re-run under two tenants with two accounts — green, no
  cross-talk, partial-unique invariant still holds.
- Credential redaction test: no code path emits `keySecret`/`webhookSecret` to a log,
  Sentry, a job payload, or an API response.
- `money-flow-separation.e2e-spec.ts` (from Phase 7) still green.

**ROLLBACK / RECOVERY CONSIDERATIONS**
- Additive columns/table → image revert safe.
- Backfill fills `paymentAccountId` from one seeded account; a bad run is re-runnable.
- Contract step (`NOT NULL` + removing env-credential fallback) is late and independently
  gated with a backup.
- Kill-switch: fall back to the platform env credentials for Tenant #1 only, if the
  per-account path regresses, while keeping other tenants disabled from checkout until fixed.

**EXIT CRITERIA**
`PaymentAccount` per tenant; provider abstraction with Razorpay adapter; encrypted
credentials; per-account webhooks + reconciliation; checkout uses the store's account;
existing payment behavior preserved; commerce payments isolated per tenant; env-sourced
single-account credentials no longer on the request path (fallback only); suites green.

---

## 15. Phase 9 — Store / Domain Resolution

### Phase 9 — Store / Domain Resolution

**PURPOSE**
Make `Domain → Store → Tenant` resolution real and server-side on every request:
PrintForge-hosted default URLs for every store, custom domains on top with ownership
verification, one canonical primary domain per store, HTTPS/TLS in production.
(Handbook §10, §13, §17; invariants 11, 17.)

**DEPENDENCIES**
Phase 1 (`Store`, `StoreDomain`), Phase 3 (`TenantContext` already consumes the resolver —
Phase 9 makes the resolver production-grade). Phase 5 (platform console approves domains).
**IMPLEMENTATION / CONFIGURATION — NOT FROZEN:** the specific TLS certificate issuer and
renewal mechanism (Vercel-managed, Let's Encrypt via a proxy, Cloudflare for SaaS, …) is an
implementation choice.

**REPOSITORY AREAS**
Backend: `backend/src/tenancy/store-domain.service.ts` (verification: DNS TXT / CNAME check,
`ACME`/provider callback), `backend/src/common/tenant/` resolver (cache, canonical redirect),
`backend/src/platform/platform-domains/` (approve/inspect).
Frontend: `frontend/src/seo/siteConfig.ts` (**stop hard-coding `https://www.printforge.in`**
— resolve the site origin from the served host / a bootstrap `store context` call),
`seo/seoFiles.ts` (`robots.txt`/`sitemap.xml` currently **build-time from one origin** →
must become **runtime, per-store** — served by the backend or an edge function, not baked),
`seo/Seo.tsx` + `seo/jsonLd.ts` (canonical URL from store context), `services/api/client.ts`
(API base per environment; store context from host).
Infra: `frontend/vercel.json`, Vercel/Render domain configuration, DNS.

**DATABASE / DATA IMPACT**
- `StoreDomain` (from Phase 1) put into real use: `hostname`, `type`
  (`PLATFORM_SUBDOMAIN` | `CUSTOM`), `isPrimary` (one per store), `verificationStatus`
  (`PENDING/VERIFYING/VERIFIED/FAILED`), `verificationMethod` (`DNS_TXT`/`CNAME`),
  `verificationToken`, `lastCheckedAt`, `verifiedAt`, `tlsStatus`
  (`PENDING/ISSUED/ERROR`), `createdAt`.
- Every `Store` auto-gets a `PLATFORM_SUBDOMAIN` `StoreDomain` on creation
  (`{store-slug}.{platform-storefront-domain}` — the platform storefront domain is config).
- A `hostname → {storeId, tenantId, storeStatus}` lookup is the hot path — index on
  `hostname`, cached in-process with a short TTL + explicit bust on `StoreDomain` change.

**BACKEND IMPACT**
- **Resolver** (invoked by the Phase 3 `TenantContext` middleware for storefront requests):
  `Host` header → `StoreDomain` (must be `VERIFIED` for custom, always-on for platform
  subdomain) → `Store` (must be `ACTIVE`) → `Tenant` (must be `ACTIVE`, subscription not
  `EXPIRED`/deleted). Unknown host → 404 "store not found" (a generic page, no tenant
  enumeration). Disabled store / suspended tenant → a specific "store unavailable" response
  (handbook §12 — store status and subscription status are different facts).
- **Canonical redirect:** non-primary domain / `www` mismatch / http→https → 301 to the
  store's canonical primary domain (handbook §10 "one canonical primary domain").
- **Custom domain verification:** merchant adds a hostname → backend issues a
  `verificationToken` and instructions (add a DNS TXT record, or CNAME to a platform
  target) → a verification job (Phase 11 cron / on-demand) checks DNS → `VERIFIED` → TLS
  provisioning (provider-specific, behind an interface) → `ISSUED` → traffic allowed.
  Platform console can inspect/override. (Handbook §17 "custom-domain mappings verified
  before traffic is routed to them".)
- **Store-context bootstrap endpoint** (`GET /storefront/context` — `@Public()`): returns
  `{ storeId, storeName, branding, canonicalOrigin, locale, … }` for the resolved host, so
  the SPA can render store-aware chrome without hard-coded config.

**FRONTEND IMPACT**
- `siteConfig.ts`: `SITE_URL` becomes the served origin (or `canonicalOrigin` from the
  bootstrap), **not** the frozen `https://www.printforge.in` literal. `VITE_SITE_URL`
  becomes a dev/preview override only.
- `robots.txt` / `sitemap.xml`: move from `seoFiles.ts` build-time generation to a
  **backend route** (`GET /robots.txt`, `GET /sitemap.xml`) resolved per store — the SPA
  shell can't serve per-host static files from one Vercel build. (Handbook §13 "SEO,
  sitemaps, and robots directives are store-aware".)
- `Seo.tsx` / `jsonLd.ts`: canonical URL, `og:url`, JSON-LD `url` all from store context.
- `useStoreName` and homepage-settings hooks: already store-shaped; now keyed by store.
- The SPA is one Vercel deployment serving every custom domain (handbook §10 "a shared
  frontend serves every store — there is no per-merchant frontend deployment") — Vercel
  wildcard/custom-domain config + the API resolving context by `Host`.

**INFRASTRUCTURE IMPACT**
- Wildcard subdomain for platform-hosted stores (`*.stores.printforge.app`) on the frontend
  host + the API.
- Custom-domain onboarding: Vercel "add domain" via API (or an edge proxy) + TLS issuance;
  the mechanism is not frozen (D-minor). CORS: the API must accept the storefront's dynamic
  origin — replace the single `frontendUrl` CORS allow (`main.ts`) with a check against
  verified `StoreDomain` hosts + the platform/admin origins.
- `SameSite=Strict` refresh cookie: **custom domains break the shared-registrable-domain
  assumption** the current cookie design relies on (`auth.service.ts`, Readme "Project
  Status"). Customer auth on a custom domain needs the cookie scoped to that domain (the
  `Customer` auth flow from Phase 2 is already separate — set its cookie per store host).
  This is a concrete design item for Phase 9, flagged: **REQUIRES DECISION-minor** on
  first-party vs proxied cookie handling for custom domains.

**SECURITY IMPACT**
Invariant 17. Resolution is 100% server-side; the `Host` header is the only input and it's
matched against `VERIFIED` domains. No traffic reaches a store before its domain is verified
and TLS is issued. Canonical redirects prevent duplicate-content + cookie-scope ambiguity.
An unknown/unverified host cannot enumerate tenants.

**MIGRATION IMPACT**
Additive. Tenant #1's store gets a platform subdomain + (optionally) the existing
`www.printforge.in` as a `CUSTOM` `VERIFIED` domain so the current storefront keeps working.
The DNS cutover that was already pending becomes: point `www.printforge.in` at the shared
frontend, register it as Tenant #1's primary custom domain.

**KEY RISKS**
- *Domain misrouting* (host resolves to the wrong store / tenant). Mitigation: `hostname`
  globally unique; resolver is pure `Host` → row; negative e2e test (host A's request never
  returns store B's data); cache bust on any `StoreDomain` write; a canary check per deploy.
- *Serving a store before verification / TLS.* Mitigation: resolver requires
  `verificationStatus='VERIFIED'` **and** `tlsStatus='ISSUED'` for `CUSTOM` domains.
- *Cache poisoning / stale resolution* after a domain is reassigned or a store disabled.
  Mitigation: short TTL + explicit invalidation; disabled-store check is on the live `Store`
  row, not cached.
- *CORS opened too wide* when accepting dynamic origins. Mitigation: allow only verified
  `StoreDomain` hosts + fixed platform origins; never reflect an arbitrary `Origin`.
- *Cookie/session breakage on custom domains.* Mitigation: customer auth cookie scoped to
  the store host; merchant/platform admin stays on the fixed platform domain.

**REUSE FROM CURRENT SYSTEM**
- The Phase 3 `TenantContext` resolver seam — Phase 9 fills it in.
- `seo/` structure (per-route `<Seo>`, `jsonLd.ts`, `siteConfig.ts` helpers like
  `absoluteUrl`, `clampDescription`, `pageTitle`) — kept; the origin input changes.
- `useStoreName.ts` — already the pattern for store-aware chrome.
- `HealthController` `@Public()` pattern — for the `robots.txt`/`sitemap.xml`/context routes.

**NEW CAPABILITIES**
Every store reachable at a PrintForge-hosted URL; custom domains with DNS-verified ownership +
TLS; server-side host→store→tenant resolution on every request; canonical primary domain +
redirects; per-store `robots.txt`/`sitemap.xml`; store-aware canonical URLs; one shared
frontend serving all stores.

**VERIFICATION / ACCEPTANCE CRITERIA**
- `backend/test/e2e/domain-resolution.e2e-spec.ts` (new): a request with `Host: a.example`
  returns only Store A's catalog; `Host: b.example` only Store B's; an unknown host → 404
  generic; an unverified custom host → not served; a non-primary host → 301 to canonical; a
  disabled store → "unavailable", a suspended tenant → "unavailable" (distinct from
  disabled).
- Domain verification: adding a hostname yields a token; a passing DNS check flips to
  `VERIFIED`; a failing check stays `PENDING` with a reason.
- `robots.txt`/`sitemap.xml` differ per store host and reflect that store's catalog only.
- Frontend: no hard-coded `printforge.in` remains in `siteConfig.ts`; canonical/OG URLs
  match the served host in a component test.

**ROLLBACK / RECOVERY CONSIDERATIONS**
- Additive schema → image revert safe.
- The resolver has a kill-switch: fall back to "single store = Tenant #1's primary store"
  resolution (pre-Phase-9 behavior) if multi-domain resolution regresses, without a
  redeploy.
- Custom-domain TLS issues are isolated per domain; the platform subdomains are unaffected.
- `robots`/`sitemap` route failure degrades to a static permissive `robots.txt` — no data
  risk.

**EXIT CRITERIA**
Server-side domain resolution live; platform subdomains for every store; custom-domain
verification + TLS working; canonical redirects; per-store SEO files; frontend origin
de-hardcoded; isolation-by-host proven; suites green.

---

## 16. Phase 10 — Asset / Storage / Customization

### Phase 10 — Asset / Storage / Customization

**PURPOSE**
Make every asset tenant-owned with a resolvable tenant, explicitly public or private
(private requires authorization to **read**), behind a `StorageProvider` abstraction; keep
customer originals and production outputs as distinct artifacts; preserve the exact
customization + asset version an order purchased; add an orphan-cleanup lifecycle and
usage/quota enforcement. (Handbook §14; invariants 15, 16.)

**DEPENDENCIES**
Phase 3 (tenant context), Phase 4 (`UploadedFile` gains `tenantId`/`customerId`), Phase 6
(storage/asset-count limits), Phase 2 (`Customer` — customer uploads). D13 (storage vendor).

**REPOSITORY AREAS**
Backend: `backend/src/uploads/` — new `StorageProvider` interface,
`uploads/providers/cloudinary-provider.ts` (wraps
`uploads/cloudinary/cloudinary.service.ts`), `uploads/uploads.service.ts`,
`uploads/uploads.controller.ts` (read authorization), `uploads/utils/file-signature.util.ts`
(kept), a new `uploads/asset-cleanup.poller.ts` (orphan lifecycle — Phase 11 wires the
cron). `checkout/checkout.service.ts` + `cart/cart.service.ts` (customization → asset
version snapshot — already snapshots label + `uploadedFileId`; add asset version/kind).
Prisma: `UploadedFile` → `Asset` (rename-in-place or new fields): `tenantId`, `storeId?`,
`visibility`, `kind`, `customerId?`/`uploadedByUserId?`, `status`, `derivedFromAssetId?`.

**DATABASE / DATA IMPACT**
- `Asset` (evolved `UploadedFile`) — add: `tenantId` (FK, **mandatory** — "no asset without
  a resolvable tenant", invariant 15), `storeId?`, `visibility` (`PUBLIC` | `PRIVATE` —
  private needs read authz), `kind` (`PRODUCT_IMAGE` | `CUSTOMER_ORIGINAL` |
  `PRODUCTION_OUTPUT` | `MERCHANT_ASSET`), `uploadedByCustomerId?` / `uploadedByUserId?`
  (was non-null `uploadedByUserId`), `status` (`PENDING` | `ATTACHED` | `ORPHAN` |
  `DELETED`), `derivedFromAssetId?` (production output → its customer original — "kept as
  distinct artifacts"), `provider` (`CLOUDINARY`), `storageKey` (was
  `cloudinaryPublicId @unique` — keep globally unique, it's a storage key), `expiresAt?`
  (temp assets), `createdAt`.
- `OrderItemCustomization` / `CartItemCustomization` — already snapshot
  `fieldLabelSnapshot` + `uploadedFileId` (`RESTRICT`). Add `assetVersionSnapshot` / keep
  the `RESTRICT` so a purchased asset is never cleaned (existing schema comment already
  states "referenced files never purged" — invariant 7 / handbook §14).
- `product_images` — inherits tenant via `Product` (Phase 4) + a direct `tenantId`.

**BACKEND IMPACT**
- `StorageProvider` interface: `upload(buffer, {tenant, kind, visibility})`,
  `signedUrl(key, {ttl})`, `publicUrl(key)`, `delete(key)`. First adapter wraps the existing
  `CloudinaryService` — its two-tier folder logic
  (`printforge/{env}/products` vs `printforge/{env}/customizations/{userId}`) becomes
  **tenant-scoped**: `printforge/{env}/t/{tenantId}/products` vs
  `.../t/{tenantId}/customers/{customerId}/originals` vs `.../production`. Delivery type
  (`upload` public vs `authenticated` signed) → driven by `Asset.visibility`, keeping the
  existing "product images public, customization files signed short-lived" behavior.
- `uploads.service.ts::create`: sets `tenantId` from context, `kind` from the upload
  purpose + actor type (`Customer` → `CUSTOMER_ORIGINAL` private; membership `User` →
  `MERCHANT_ASSET`/`PRODUCT_IMAGE`). Keeps magic-byte validation, 10 MB stream limit,
  PNG/JPEG/PDF allowlist, no server-side parsing (`file-signature.util.ts` unchanged).
  Calls `assertLimit('storage_bytes')` / `assertLimit('assets')` (Phase 6) before storing.
- `uploads.controller.ts::findOne` (`GET /uploads/:id`): today = owner-or-admin. Becomes:
  (1) asset in the request's tenant? (2) `PUBLIC` → allow; `PRIVATE` → the requesting
  `Customer` owns it, or a membership `User` with `assets:read` permission. Cross-tenant →
  404. Returns a short-lived signed URL for `PRIVATE`.
- **Orphan lifecycle:** `PENDING` on upload; `ATTACHED` when referenced by a cart/order
  customization or a product image; a cleanup poller marks `PENDING` assets older than N
  hours with no reference as `ORPHAN`, then deletes from storage + row after a grace period.
  **Never touches `ATTACHED` or order-referenced assets** (invariant 7). This is the poller
  the schema comments describe but that doesn't exist yet.
- `checkout`: on order creation, the `OrderItemCustomization` snapshot already freezes
  `uploadedFileId`; add the asset `kind`/version so a later product/option change can't
  alter what was bought (handbook §14, invariant 6-of-BLUEPRINT / handbook §14 frozen
  callout).
- Production-output assets: an endpoint/job for a merchant to attach a production file to an
  order item, stored as `kind=PRODUCTION_OUTPUT`, `derivedFromAssetId` = the customer
  original, `visibility=PRIVATE`.

**FRONTEND IMPACT**
- `features/customization/fields/FileUploadField.tsx`, `hooks/useUploadFile.ts`,
  `services/api/uploads.ts` — unchanged API shape; the returned URL is now a per-tenant
  signed URL for private assets.
- Admin: an order-item "attach production file" control; a storage-usage meter (Phase 6).
- `types/uploads.ts` gains `kind`/`visibility`.

**INFRASTRUCTURE IMPACT**
- Cloudinary folder structure changes to include `t/{tenantId}` — new uploads only; a
  backfill **moves or re-tags** existing assets (see MIGRATION).
- Signed-URL TTLs and the delivery type per `visibility` — config.
- If D13 later adds S3-compatible storage, it's a second `StorageProvider` adapter, no
  model change.

**SECURITY IMPACT**
Invariants 15, 16. Every asset has a tenant; private assets require read authorization
(not just write); cross-tenant asset access returns 404; signed URLs are short-lived;
no server-side file parsing (unchanged); the storage key namespace is per-tenant so even a
leaked Cloudinary public-id can't be walked into another tenant's private folder without a
signature.

**MIGRATION IMPACT**
- Additive columns on `UploadedFile`/`Asset`, nullable then backfilled (Phase 4 already adds
  `tenantId`; Phase 10 adds `visibility`/`kind`/`status`).
- Backfill `kind`: existing rows uploaded by `role='ADMIN'` → `PRODUCT_IMAGE`/`MERCHANT_ASSET`,
  by `role='CUSTOMER'` → `CUSTOMER_ORIGINAL` (`PRIVATE`); `status`: referenced →
  `ATTACHED`, unreferenced → `ORPHAN` candidate (do **not** auto-delete during migration —
  mark and review).
- Cloudinary: existing assets can stay at their current keys with a `tenantId` tag added
  (Cloudinary supports metadata/tags) rather than a physical move — decide per D13; the
  `storageKey` stays valid either way.

**KEY RISKS**
- *Asset cross-tenant access* (a signed URL or public id from tenant A used against tenant
  B, or an unscoped `GET /uploads/:id`). Mitigation: tenant check first in `findOne`;
  per-tenant storage folders; short-lived signatures; negative e2e test.
- *Orphan cleanup deletes a referenced/production asset.* Mitigation: cleanup only touches
  `status=ORPHAN` with zero references and past a grace window; `RESTRICT` FKs from order
  customizations; a dry-run mode + a deletion audit log; explicit test that an
  order-referenced asset survives cleanup.
- *Migration mis-classifies a customer original as public.* Mitigation: default `PRIVATE`
  for anything not clearly a product image; review the `ORPHAN`/`PUBLIC` sets before any
  deletion or ACL change.
- *Losing the customer-original ↔ production-output distinction.* Mitigation: `kind` +
  `derivedFromAssetId`; never overwrite an original with an output.
- *Quota check race.* Mitigation: same check-and-increment-in-transaction pattern as Phase 6.

**REUSE FROM CURRENT SYSTEM**
- `uploads/utils/file-signature.util.ts` (magic-byte detection) — verbatim.
- `CloudinaryService` (folder scheme, `signedUrl`, delivery-type logic) — becomes the
  Cloudinary adapter, tenant-prefixed.
- The existing "product images public / customization files `authenticated` + signed"
  delivery split (`uploads.service.ts`) — kept, driven by `visibility`.
- `OrderItemCustomization` snapshot discipline + `RESTRICT` — already implements
  "orders preserve the exact asset version."
- `upload-magic-bytes.e2e-spec.ts` / `product-image-delivery.e2e-spec.ts` — extended.

**NEW CAPABILITIES**
Tenant-owned assets with resolvable tenant; public/private visibility with read authz;
`StorageProvider` abstraction; customer-original vs production-output as distinct artifacts;
orphan-cleanup lifecycle; storage/asset quota enforcement.

**VERIFICATION / ACCEPTANCE CRITERIA**
- `backend/test/e2e/asset-isolation.e2e-spec.ts` (new): a `PRIVATE` asset is readable only
  by its owning `Customer` / an authorized membership `User` in the same tenant; a
  cross-tenant `GET /uploads/:id` → 404; a signed URL expires; a `PUBLIC` product image is
  freely readable.
- Orphan lifecycle: an unreferenced `PENDING` upload becomes `ORPHAN` then is deleted after
  grace; an order-referenced asset is **never** deleted (explicit assertion).
- Customer original + a derived production output coexist with `derivedFromAssetId` linkage.
- Quota: upload blocked at the storage/asset limit with a clean error, no partial store.
- `upload-magic-bytes` / `product-image-delivery` specs green under two tenants.

**ROLLBACK / RECOVERY CONSIDERATIONS**
- Additive columns → image revert safe.
- The cleanup poller has a dry-run flag and a deletion audit; disable it instantly via
  flag if it misbehaves — no data is lost while it's off (orphans just accumulate).
- Cloudinary assets are re-uploadable (`BACKUP-RESTORE.md` §7 already notes media is not the
  source of truth); the DB row + storage key is what matters and is in the backup.

**EXIT CRITERIA**
Every asset tenant-owned + public/private; read authz on private assets; storage abstraction
live; original/output distinction; orphan cleanup running with safeguards; quota enforced;
isolation tests green; existing upload behavior preserved.

---

## 17. Phase 11 — Async / Webhook / Worker Architecture

### Phase 11 — Async / Webhook / Worker Architecture

**PURPOSE**
Evolve the three in-process single-instance cron pollers into a tenant-aware
outbox → queue → worker architecture that is safe across multiple backend instances, carries
tenant context in every tenant job, classifies retryable vs permanent failure with
dead-letter handling, persists + verifies webhooks, and reconciles against providers.
(Handbook §15, §17; invariant 14.)

**DEPENDENCIES**
Phase 3 (tenant context to put *into* jobs), Phase 4 (`OutboxEvent`/`WebhookEvent` carry
`tenantId`), Phase 7 + Phase 8 (billing + commerce webhooks are the main webhook streams),
Phase 10 (asset cleanup is a job). D1 (queue tech un-prohibited), D8 (worker topology).
**IMPLEMENTATION / CONFIGURATION — NOT FROZEN:** the specific queue technology (a
Redis-backed queue, a Postgres-backed queue table, a managed queue) is an implementation
decision. The architecture requires a tenant-aware queue/worker pattern, not a product.

**REPOSITORY AREAS**
Backend: `backend/src/notifications/outbox/outbox.poller.ts`,
`backend/src/payments/webhooks/webhook-processor.service.ts`,
`backend/src/payments/payment-reconciliation.service.ts`, `backend/src/billing/*` cron,
`backend/src/uploads/asset-cleanup.poller.ts`, `backend/src/app.module.ts`
(`ScheduleModule.forRoot()` + `backend/src/scheduler-registration.spec.ts` invariant),
new `backend/src/queue/` (queue abstraction + worker runtime + a `JobContext` carrying
`{ tenantId, correlationId }`), new `backend/src/notifications/` split
(transactional vs marketing paths). Infra: a separate worker process entrypoint
(`backend/src/worker.ts`), `package.json` scripts, Render service config.

**DATABASE / DATA IMPACT**
- `OutboxEvent` — `tenantId?` (from Phase 4), `scope` (`tenant`/`platform`/`identity`),
  `correlationId`. `OutboxEventType` gains the SaaS/billing/asset events (breaking the
  current 3-value enum — additive).
- Commerce + billing webhook tables (D7) — keep the two-phase design; add `tenantId`
  (resolved during processing), `correlationId`.
- If a Postgres-backed queue is chosen: a `Job` table (`id`, `queue`, `type`, `payload`
  (**references, not secrets** — handbook §15), `tenantId?`, `correlationId`,
  `status` (`QUEUED/RUNNING/DONE/FAILED/DEAD`), `attempts`, `availableAt`, `lockedBy`,
  `lockedAt`, `lastError`, `createdAt`) with `SELECT … FOR UPDATE SKIP LOCKED` claim (the
  pattern `OutboxPoller` already uses).
- A `ScheduledJobLock` / leader-election row (or the queue's own scheduler) so a cron fires
  once across N instances (handbook §15 "scheduled jobs are safe to run across multiple
  backend instances without duplicating work").

**BACKEND IMPACT**
- **Queue abstraction:** `enqueue(queue, type, payload, { tenantId, correlationId })`,
  a worker registry, retry policy per job type (retryable → backoff, permanent →
  dead-letter + alert), idempotency key per job. Reuse the exact bounded-retry + backoff +
  dead-letter + Sentry policy already in `WebhookProcessor` / `OutboxPoller` — it's promoted
  from per-poller code to the queue runtime.
- **Outbox → queue:** `OutboxPoller` becomes a thin "relay" that moves `PENDING` outbox
  rows into the queue (still the transactional-guarantee hop — the outbox insert stays in
  the business transaction via `NotificationsService.enqueueOutboxEvent`), then a worker
  sends the email/notification. `EmailService` stays worker-only.
- **Every tenant job carries `tenantId`** in `JobContext`; the worker sets tenant context
  (the same `SET LOCAL app.tenant_id` + scoped client from Phase 3) before doing tenant
  work — "a worker never has to re-derive which tenant a job belongs to" (handbook §15).
- **Webhooks:** receipt endpoints (commerce per-account from Phase 8, billing from Phase 7)
  verify signature → persist → ack; a worker (not a 30 s cron loop) processes each, still
  idempotent by unique event id, still two-phase. Reconciliation (commerce + billing)
  becomes a scheduled job with leader election.
- **Multi-instance safety:** `ScheduleModule.forRoot()` still once (spec unchanged), but the
  scheduled *handlers* acquire a lock / delegate to the queue scheduler so only one instance
  runs each tick. Workers scale independently of the API (`worker.ts`).
- **Transactional vs marketing notifications** on separate queues/paths (handbook §15) —
  the current outbox is transactional-only; a marketing path is a separate queue with its
  own suppression/consent rules (mostly future, but the split is established here).
- **Secrets not in payloads:** jobs carry `assetId`/`orderId`/`paymentAccountId`, never
  credentials; the worker resolves + decrypts in the adapter (Phase 8 discipline).

**FRONTEND IMPACT**
Minimal. Possibly a platform-console "queue health / dead-letter" view (depth, failed jobs,
retry). `correlationId` surfaced in admin error toasts for support.

**INFRASTRUCTURE IMPACT**
- A **separate worker service** on Render (D8) running `worker.ts`; the API service stops
  running the pollers (or runs only the queue-relay). Both scale independently.
- If Redis/managed-queue is chosen (D1 lifts the prohibition): a new managed dependency +
  env vars. If Postgres-queue: no new infra, just the `Job` table + `SKIP LOCKED`.
- `staging` environment (handbook §17) — needed to test multi-instance behavior before
  production. (D8.)
- Backend can now run ≥2 API instances (handbook §17 "stateless, horizontally scalable").

**SECURITY IMPACT**
Invariant 14 (tenant context in every job) is enforced here. Webhook verification-before-
processing preserved (invariant 10). Secrets kept out of payloads (handbook §15). The worker
uses the same tenant-scoped data path as the API — no worker bypass of isolation.

**MIGRATION IMPACT**
- `OutboxEventType` enum extension — additive.
- Introducing the queue: run the queue relay **alongside** the existing pollers first (both
  drain the outbox — idempotency makes double-processing safe), then cut the pollers over.
- Historical `OutboxEvent`/`WebhookEvent` rows get `tenantId` from Phase 4's backfill.

**KEY RISKS**
- *Async tenant-context loss* (a job runs without/with the wrong tenant → cross-tenant
  write or a leak). Mitigation: `JobContext.tenantId` is mandatory for tenant queues; the
  worker asserts it before any tenant query; a job with no tenant on a tenant queue →
  dead-letter, not "best effort"; e2e test that a job for tenant A never writes tenant B.
- *Duplicate work across instances* (two workers / two cron fires). Mitigation:
  `SKIP LOCKED` claim + per-job idempotency key + leader election for schedules; load test
  with N instances.
- *Lost events during the poller→queue cutover.* Mitigation: run both in parallel;
  idempotency; reconcile counts (`outbox_events` all reach `SENT`); keep the poller as a
  fallback for one release.
- *Dead-letter pile-up unnoticed.* Mitigation: alert on dead-letter depth (Phase 14);
  platform-console visibility.
- *Prohibited-tech governance gap.* Mitigation: D1 ACR must be signed before a broker is
  introduced; a Postgres-backed queue needs no ACR (it's within the existing
  `@nestjs/schedule` + Postgres toolkit).
- *Reconciliation running per-tenant with the wrong credentials* (Phase 8 interaction).
  Mitigation: the reconciliation job resolves the `PaymentAccount` per order.

**REUSE FROM CURRENT SYSTEM**
- **The entire retry philosophy** — `OutboxPoller` (`MAX_ATTEMPTS`, `BACKOFF_MS`,
  `FAILED` dead-letter) and `WebhookProcessor` (`MAX_ATTEMPTS=6`, backoff array,
  `PaymentMismatchError` = non-retryable, Sentry on permanent failure) — promoted to the
  queue runtime unchanged in spirit.
- `SELECT … FOR UPDATE SKIP LOCKED` claim (`OutboxPoller.claim`) — the queue's claim
  mechanism if Postgres-backed.
- The transactional outbox insert (`NotificationsService.enqueueOutboxEvent(tx, …)`) —
  unchanged; it's the delivery guarantee.
- `PaymentReconciliationService` — becomes a scheduled job, logic intact.
- `scheduler-registration.spec.ts` — the invariant it pins still holds.
- `webhook-retry.e2e-spec.ts` / `payment-reconciliation.e2e-spec.ts` — extended for the
  queue + multi-tenant.

**NEW CAPABILITIES**
Tenant-aware queue + independently scalable workers; jobs carry tenant context + correlation
id; multi-instance-safe scheduled jobs (leader election); dead-letter handling + visibility;
transactional vs marketing notification paths; webhook processing off the request path via
workers; the backend can run ≥2 instances.

**VERIFICATION / ACCEPTANCE CRITERIA**
- `backend/test/e2e/async-tenant-context.e2e-spec.ts` (new): a queued job for tenant A,
  processed by a worker, only ever reads/writes tenant A's data; a job missing a tenant on a
  tenant queue is dead-lettered; a retryable failure backs off then succeeds; a permanent
  failure dead-letters + alerts.
- Multi-instance test (CI or staging): two worker processes against one queue never
  double-process (idempotency + `SKIP LOCKED`); a scheduled job fires once with two API
  instances.
- Poller→queue cutover: `outbox_events` all reach `SENT`, no duplicates, email counts
  reconcile.
- `webhook-retry` / `payment-reconciliation` / `subscription-billing` specs green on the
  queue.

**ROLLBACK / RECOVERY CONSIDERATIONS**
- Keep the in-process pollers as a feature-flagged fallback for one release after cutover —
  flip back to pollers if the queue/worker regresses (idempotency makes this safe).
- A Postgres-backed queue is recoverable with the DB backup; a broker-backed queue needs its
  own recovery path (handbook §15 "queue recovery paths") — documented in Phase 14.
- Worker service down → jobs accumulate (durable), drain on restart; the API is unaffected
  (email/webhook processing is async by design — `OutboxPoller` doc: "email failure is
  architecturally incapable of reverting order/payment state").

**EXIT CRITERIA**
Queue + worker runtime live; every tenant job carries tenant context; multi-instance safe
(workers + schedules); dead-letter handling + visibility; webhooks processed via workers;
reconciliation as scheduled jobs; pollers retired (fallback flag retained one release);
backend running ≥2 instances in staging; suites green.

---

## 18. Phase 12 — Storefront Tenantization

### Phase 12 — Storefront Tenantization

**PURPOSE**
Make the one shared storefront engine render **any** store from resolved store context +
store configuration + store data: store-scoped catalog / search / cart / checkout / customer
account / reviews / legal pages, store-aware SEO / sitemap / robots, store-aware
cache/query state, configuration-driven branding on one strong initial theme, a structured
config-driven homepage (no drag-and-drop builder). Initial baseline: **one primary storefront
per tenant.** (Handbook §13; invariants 17, 18.)

**DEPENDENCIES**
Phase 3 (tenant/store context + query-key namespacing mechanism), Phase 4 (all storefront
data tenant/store-scoped), Phase 9 (domain resolution + store-context bootstrap + per-store
SEO files), Phase 2 (`Customer` store-scoped auth), Phase 8 (checkout uses the store's
payment account). D12 (tax regime per tenant).

**REPOSITORY AREAS**
Frontend, broadly:
- `frontend/src/App.tsx` (storefront routes now operate within a resolved store context;
  `RootLayout` reads store branding), `layouts/RootLayout.tsx`, `layouts/Header.tsx`,
  `layouts/Footer.tsx`, `components/layout/AnnouncementBar.tsx`, `components/home/*`
  (`HomeHero`, `HeroCarousel`, `BannerGrid`, `CategoryShowcase`, `CategoryProductRails`,
  `ProductRail`, `Faq`, `TrustStrip`), `components/layout/MegaMenu.tsx`.
- `hooks/*` — every storefront query hook (`useProducts`, `useProduct`, `useCategories`,
  `useCategoryTree`, `useCart`, `useOrders`, `useOrder`, `useProductReviews`,
  `useHomepageSettings`, `useStoreName`, `useCheckoutPreview`, `useInvoice`, …) — query keys
  prefixed with store id; API calls carry store context.
- `services/api/*` (all per-domain modules), `services/queryClient.ts` (clear on store
  switch — mostly N/A for a single-store-per-host storefront, relevant for previews/admin).
- `seo/*` (`Seo`, `jsonLd`, `siteConfig`, `pageSeo`) — canonical/OG/JSON-LD from store
  context; `seoFiles` retired in favor of Phase 9's backend routes.
- `pages/static/*` (`AboutPage`, `ContactPage`, `PrivacyPage`, `TermsPage`,
  `RefundPolicyPage`) — become **store legal pages** rendered from the store's legal
  documents (Phase 13), not hard-coded copy.
- `features/checkout/*`, `features/cart/*`, `features/catalog/*`, `features/reviews/*`,
  `features/customization/*`, `pages/account/*`, `pages/orders/*` — all operate in store
  context.
Backend: storefront-facing controllers (`products`, `categories`, `cart`, `checkout`,
`orders`, `reviews`, `app-setting` public read, `postal`) — already tenant-scoped from
Phase 4; Phase 12 confirms the **public** (`@Public()`) storefront reads resolve store from
host (Phase 9) not from an authenticated context, and that `PUBLIC_SETTING_KEYS`
(`app-setting.constants.ts`) is store-scoped.

**DATABASE / DATA IMPACT**
Mostly none new (Phase 4 did the scoping). Confirm/add: `StoreSetting` rows for homepage
structure (`hero_slides`, `banners`, `showcase_categories`, `announcement_text`), store
branding (theme tokens, logo asset id, colors — typed, validated like
`app-setting.constants.ts`), store legal page bindings (Phase 13). One strong default theme
seeded so a new store looks complete immediately.

**BACKEND IMPACT**
- Storefront read endpoints resolve store from `TenantContext` (host-derived) and never
  require auth for public catalog/homepage/legal.
- The public settings read (`GET /settings`, filtered to `PUBLIC_SETTING_KEYS`) → store-
  scoped `StoreSetting`.
- Checkout / cart / orders / reviews / account already tenant+customer-scoped (Phase 4 +
  Phase 2); confirm the `Customer` in context matches the store in context.
- Per-store `robots.txt` / `sitemap.xml` (Phase 9 backend routes) enumerate only that
  store's active catalog + legal pages.
- Tax at checkout reads the store/tenant `TaxConfig` (Phase 4 moved it off global
  `AppSetting`); India-GST engine per tenant for v1 (D12).

**FRONTEND IMPACT**
- A `StoreContextProvider` (from Phase 9's bootstrap) supplies `{ storeId, storeName,
  branding, canonicalOrigin, legalPages, currency, … }` to the whole storefront tree.
- Branding: CSS custom properties / theme tokens driven by store config, layered on the
  existing `styles/tokens.css` + one strong default (handbook §13 "one strong initial
  production theme").
- Homepage: `components/home/*` render from `StoreSetting` structure (already partly the
  case — `useHomepageSettings`, `useStoreName`); no builder, just configured sections.
- Every query key: `['store', storeId, …]` so TanStack Query cache never serves store A's
  products to store B (invariant, handbook §13). `queryClient.clear()` on a store-context
  change (relevant for admin "preview store" and platform support sessions).
- Customer auth pages store-scoped (Phase 2); account/orders/invoices store-scoped.
- Static pages → store legal document pages (Phase 13).
- SEO: `<Seo>` canonical/OG/JSON-LD from `canonicalOrigin`; `siteConfig` no longer holds a
  literal domain.

**INFRASTRUCTURE IMPACT**
One shared Vercel frontend deployment serves every store (handbook §10, §13 — "no
per-merchant frontend deployment"). Custom domains from Phase 9 point at it. No per-store
build. A CDN caches public storefront assets keyed by host (handbook §17 "CDN where
appropriate") — cache keys must include the host so store A's cached HTML/JSON never serves
on store B's domain.

**SECURITY IMPACT**
Invariant 18 — merchant storefront configuration (branding, homepage structure, legal page
content) can never reach across tenant isolation or authorization: config is validated
(allowlisted keys, typed normalizers), rendered as data, never executed; no raw HTML/JS
injection from store config; a store owner cannot configure a query that returns another
store's data. Frontend cache is store-keyed (handbook §13 "one store's cached data can never
leak into another's response").

**MIGRATION IMPACT**
- Tenant #1's storefront is the existing storefront — its homepage settings
  (`hero_slides`, `banners`, `showcase_categories`, `announcement_text`, `storeName`) move
  from global `AppSetting` to Tenant #1's `StoreSetting` (part of Phase 4's settings split).
- The existing storefront keeps working throughout (Tenant #1 on its current domain via
  Phase 9).

**KEY RISKS**
- *Cache contamination* (TanStack Query / CDN / SWR serving store A's data on store B).
  Mitigation: store id in every query key; CDN cache key includes host; `queryClient.clear()`
  on context switch; an e2e/browser test that switching host swaps all data.
- *A storefront read resolving the wrong store* (e.g. an authenticated customer's store vs
  the host's store). Mitigation: public reads resolve store from host only; authenticated
  reads assert `customer.storeId === ctx.storeId`.
- *Store config injection* (XSS via branding text / homepage copy). Mitigation: typed
  validation + escaping; no `dangerouslySetInnerHTML` from store config; CSP
  (`frontend/src/index-csp.test.ts` already tests CSP — extend).
- *SEO regression* (canonical/sitemap pointing at the wrong origin, or leaking another
  store's URLs). Mitigation: per-store sitemap from that store's catalog only; canonical from
  `canonicalOrigin`; tests.
- *Accessibility / loading-state regressions* during the refactor. Mitigation: the shared
  `ErrorState`/`EmptyState`/`Skeleton` primitives + existing parity tests
  (`UX-49` commit lineage) — keep them green.

**REUSE FROM CURRENT SYSTEM**
- **The entire storefront React codebase** — `pages/*`, `features/catalog|cart|checkout|
  reviews|customization|orders|account`, `components/home/*`, `components/layout/*`,
  `layouts/*`, the `ui/` primitive library, `hooks/*`. It gains a store-context input; it is
  not rewritten. This is the single largest reuse in the plan.
- `useStoreName.ts` + `useHomepageSettings.ts` — already the store-aware-chrome pattern.
- `seo/` helpers (`absoluteUrl`, `pageTitle`, `clampDescription`, `jsonLd`) — kept.
- The `Seo` component's React-19 native metadata approach — kept.
- `styles/tokens.css` — the base for configurable theming.
- All existing storefront component tests + `HomePage.test.tsx` etc. — become per-store.

**NEW CAPABILITIES**
One shared engine renders any store from context + config + data; store-scoped catalog /
cart / checkout / account / reviews / legal; configuration-driven branding + structured
homepage; store-aware SEO / sitemap / robots; store-keyed frontend + CDN cache.

**VERIFICATION / ACCEPTANCE CRITERIA**
- `backend/test/e2e/storefront-tenantization.e2e-spec.ts` (new): a public catalog request on
  store A's host returns only store A's active products/categories; the homepage settings,
  legal pages, sitemap, and robots are store A's; store B's host returns store B's — zero
  overlap; an authenticated customer of store A cannot use their session on store B's host.
- Browser/E2E: load store A and store B in two tabs — no cache bleed; branding differs;
  checkout uses each store's payment account (Phase 8).
- SEO: canonical/OG/JSON-LD reflect the served host; sitemap lists only that store's URLs;
  `index-csp.test.ts` green.
- Accessibility + loading-state parity tests green.
- Existing storefront component/page tests green under a store-context test wrapper.

**ROLLBACK / RECOVERY CONSIDERATIONS**
- The frontend is one deployment — Vercel instant rollback to the previous build
  (`DEPLOYMENT.md` §10).
- Store-context resolution has the Phase 9 kill-switch (fall back to "single store =
  Tenant #1").
- Config is data — a bad store config is fixed by editing the setting, not a deploy.
- No destructive DB change in Phase 12.

**EXIT CRITERIA**
Shared storefront engine renders any store from context/config/data; all storefront
surfaces store-scoped; branding + homepage config-driven; SEO/sitemap/robots store-aware;
cache store-keyed; one primary storefront per tenant working end-to-end for ≥2 tenants;
suites green.

---

## 19. Phase 13 — Legal / Acceptance Infrastructure

### Phase 13 — Legal / Acceptance Infrastructure

**PURPOSE**
Build versioned legal-document infrastructure with content-hash-anchored acceptance: two
separate layers (platform: ForgeBuilds↔merchant; merchant-store: merchant↔customer),
clickwrap acceptance records for standard merchants, an e-sign workflow for Enterprise,
privacy-notice/consent kept separate from contractual acceptance, and privacy/deletion
handled as defined auditable workflows. (Handbook §9; invariant 7.)
**REQUIRES QUALIFIED LEGAL REVIEW:** this phase builds the *mechanism*. The wording of every
platform and merchant-store legal document requires qualified legal review before use.
Nothing here is legal advice; this plan drafts no legal text.

**DEPENDENCIES**
Phase 1 (`Tenant`), Phase 2 (`User` merchant identity, `Customer`), Phase 5 (platform admin
manages platform legal; tenant admin manages store legal + reviews privacy requests),
Phase 12 (storefront renders store legal pages). Phase 7 (subscription/billing terms are a
platform legal document a merchant accepts).

**REPOSITORY AREAS**
Backend new: `backend/src/legal/` — `LegalDocumentService`, `AcceptanceService`,
`ESignService` (Enterprise, behind a provider abstraction), `PrivacyRequestService`,
`legal/legal.controller.ts` (platform + tenant + storefront surfaces).
Backend touched: registration/onboarding flows (`auth` merchant register → must accept
platform ToS/DPA), storefront checkout/registration (`Customer` accepts store legal),
`platform/*` + `admin/*` (manage documents), Phase 11 queue (deletion workflow jobs).
Frontend new: `pages/platform/legal/*`, `pages/admin/legal/*` (merchant edits its store
legal + views customer acceptances + handles privacy requests),
`features/legal/*` (clickwrap components), storefront legal page rendering (replaces
`pages/static/*` hard-coded copy from Phase 12).

**DATABASE / DATA IMPACT**
- `LegalDocument` — `id`, `layer` (`PLATFORM` | `MERCHANT_STORE`), `ownerType`
  (`platform` | `tenant`), `tenantId?` (null for platform docs), `type`
  (`TERMS/PRIVACY/COOKIE/AUP/SAAS_AGREEMENT/DPA/BILLING_TERMS` for platform;
  `PRIVACY/TERMS/REFUND/SHIPPING/CONTACT` for merchant-store), `title`, `slug`,
  `status` (`DRAFT/PUBLISHED/ARCHIVED`), `createdAt`.
- `LegalDocumentVersion` — `id`, `documentId`, `version` (monotonic), `content` (or a
  storage ref), `contentHash` (SHA-256 of the exact rendered content — acceptance anchors to
  this, handbook §9), `effectiveFrom`, `publishedAt`, `publishedByUserId`. Immutable once
  published.
- `AcceptanceRecord` — `id`, `versionId` (→ exact document + version + hash),
  `subjectType` (`user` | `customer`), `subjectId`, `tenantId?`, `method`
  (`CLICKWRAP` | `ESIGN`), `acceptedAt`, `ip`, `userAgent`, `context` (what action
  triggered it — signup, checkout, re-acceptance prompt). Append-only, immutable.
  **Acceptance is tied to the exact document, version, and content hash — not "the current
  terms"** (handbook §9).
- `ConsentRecord` — separate from `AcceptanceRecord` (handbook §9 — "privacy notice and
  consent are separate from contractual acceptance"): `id`, `subjectType`, `subjectId`,
  `purpose` (`analytics/marketing/…`), `granted`, `at`, `source`.
- `ESignRequest` (Enterprise) — `id`, `tenantId`, `documentVersionId`, `provider`,
  `providerEnvelopeId`, `status` (`SENT/VIEWED/SIGNED/DECLINED/EXPIRED`), `signerEmail`,
  `completedAt`, `signedArtifactRef`. Behind an `ESignProvider` interface (vendor not
  frozen).
- `PrivacyRequest` — `id`, `type` (`ACCESS/EXPORT/DELETION/RECTIFICATION`), `subjectType`,
  `subjectId`, `tenantId?`, `status` (`RECEIVED/VERIFYING/IN_PROGRESS/COMPLETED/REJECTED`),
  `requestedAt`, `dueBy`, `handledByUserId?`, `resolutionNote`, `auditTrail` (linked
  `TenantAuditLog`/`PlatformAuditLog` entries). A **defined workflow**, not an ad-hoc ticket
  (handbook §9).

**BACKEND IMPACT**
- `LegalDocumentService`: publish a version (computes + freezes `contentHash`), list
  effective documents per layer/tenant, diff versions.
- `AcceptanceService`: `requireAcceptance(subject, documentType)` — a guard/interceptor used
  at merchant onboarding (platform ToS/DPA/billing terms) and storefront customer
  signup/checkout (store privacy/terms); a **re-acceptance prompt** when a new version is
  published and the subject's latest acceptance is for an older hash. Blocks the gated action
  until accepted; records `AcceptanceRecord`.
- `ESignService`: for Enterprise merchants, send the SaaS/merchant agreement via the e-sign
  provider, poll/webhook for completion, store the signed artifact reference; the acceptance
  record's `method='ESIGN'`.
- `PrivacyRequestService`: intake (from a form / support), identity verification step,
  orchestration of the deletion/export across tenant-scoped data (uses Phase 11 jobs to
  gather/erase across `Customer`, `Order` (retain per legal/tax obligations — **REQUIRES
  QUALIFIED LEGAL REVIEW** on retention vs erasure), `Asset`, `Review`, `Cart`), audit every
  step, produce an export artifact or a deletion certificate.
- **Deletion vs retention:** cancelling a subscription does not destroy merchant data
  (invariant 19); a verified customer deletion request erases/anonymizes that customer's
  personal data subject to legal retention of transactional/tax records — the exact policy
  is legal-review-gated and configured per jurisdiction, not hard-coded here.
- Platform legal and merchant-store legal are **never** merged into one document or one
  acceptance record (handbook §9, invariant 7) — separate `layer`, separate records,
  separate admin surfaces.

**FRONTEND IMPACT**
- Merchant onboarding: clickwrap acceptance of platform ToS + DPA + billing terms before the
  tenant is fully active; re-acceptance modal on version change.
- Storefront: customer signup/checkout clickwrap of the store's privacy + terms; a cookie/
  consent banner (consent ≠ acceptance); store legal pages rendered from the current
  published `LegalDocumentVersion` (replaces Phase 12's placeholder static pages).
- Tenant admin: edit store legal documents (versioned, with a "publish new version" flow),
  view customer acceptance records, manage incoming privacy requests with the workflow
  states.
- Platform console: manage platform legal documents + versions; view merchant acceptance of
  platform agreements; Enterprise e-sign status; platform-level privacy requests.

**INFRASTRUCTURE IMPACT**
- An e-sign provider integration (Enterprise) — new env vars, behind an interface, only
  active when the e-sign feature is enabled. Not frozen.
- Legal document content storage (DB or object storage via the Phase 10 abstraction).
- Deletion workflow touches every data store — must coordinate DB + object storage
  (handbook §18 "recover database, object assets, and critical configuration together" —
  the same coordination applies to deletion).

**SECURITY IMPACT**
Acceptance records are tamper-evident (immutable, hash-anchored, IP/UA/timestamp). Privacy
workflows are auditable end to end. Identity verification precedes any data export/deletion.
Platform vs merchant-store legal separation is an architectural boundary (invariant 7) — no
config or admin action can merge them.

**MIGRATION IMPACT**
- Additive tables.
- Seed the current placeholder legal pages (`pages/static/PrivacyPage`, `TermsPage`,
  `RefundPolicyPage`) as Tenant #1's initial store `LegalDocument` versions **marked
  DRAFT / pending legal review** — never auto-published as if reviewed.
- Existing users/customers have **no** acceptance records — a re-acceptance prompt on next
  login/checkout captures consent for the first published versions (a defined rollout, not a
  silent backfill).

**KEY RISKS**
- *Legal acceptance integrity failure* (acceptance not tied to the exact version/hash, or a
  record that can be altered). Mitigation: `AcceptanceRecord.versionId` → immutable
  `LegalDocumentVersion.contentHash`; append-only tables; no update/delete API; periodic
  hash re-verification.
- *Publishing unreviewed legal text as effective.* Mitigation: `status` starts `DRAFT`;
  publishing requires an explicit "legal review complete" gate (a platform-admin action with
  attribution); seeded content is `DRAFT`.
- *Deletion workflow over-erases (breaks order/tax records) or under-erases (leaves PII).*
  Mitigation: the erase/retain policy is legal-review-gated and configured, executed by an
  audited job with a dry-run + a reviewer approval step; a deletion certificate enumerates
  exactly what was erased/retained and why.
- *Platform and merchant legal merged.* Mitigation: `layer` discriminator on every row;
  separate services, surfaces, records; e2e test.
- *Consent conflated with acceptance.* Mitigation: separate `ConsentRecord` vs
  `AcceptanceRecord`; separate UI flows.

**REUSE FROM CURRENT SYSTEM**
- `pages/static/*` content — seeded as initial (DRAFT) store legal documents.
- `OrderStatusHistory` append-only pattern — the model for `AcceptanceRecord`/`ConsentRecord`
  immutability.
- The Phase 11 queue — for deletion/export orchestration.
- `app-setting.constants.ts` typed-definition discipline — for document-type catalogues.
- Content-hash approach mirrors the codebase's existing snapshot/immutability discipline
  (`Invoice`, `OrderItem`).

**NEW CAPABILITIES**
Versioned, hash-anchored legal documents in two separate layers; clickwrap acceptance
records; Enterprise e-sign workflow; consent records separate from acceptance;
auditable privacy/access/export/deletion workflows.

**VERIFICATION / ACCEPTANCE CRITERIA**
- `backend/test/e2e/legal-acceptance.e2e-spec.ts` (new): merchant onboarding is blocked
  until platform ToS/DPA are accepted; the record stores the exact `versionId` + hash;
  publishing a new version triggers a re-acceptance requirement; a customer's checkout
  records store-legal acceptance; platform and merchant-store acceptances are separate rows
  with separate `layer`; acceptance records cannot be mutated via any API.
- E-sign (with a fake provider): an Enterprise agreement flows `SENT→SIGNED`, produces an
  `AcceptanceRecord{method:ESIGN}` + a stored artifact ref.
- Privacy: a deletion request runs the workflow, erases the configured personal data,
  retains legally-required records, and produces an audited certificate; every step is in
  the audit log.
- Consent banner records `ConsentRecord`, distinct from any `AcceptanceRecord`.

**ROLLBACK / RECOVERY CONSIDERATIONS**
- Additive tables → image revert safe.
- Legal documents are versioned and immutable-when-published; a wrong publish is corrected
  by publishing a new correcting version (never editing history).
- Acceptance/consent records are append-only — nothing to roll back.
- The deletion workflow is the one irreversible operation — its dry-run + reviewer-approval
  gate is the safeguard; a completed deletion is recorded, not undoable (by design).

**EXIT CRITERIA**
Two-layer versioned legal infrastructure live; hash-anchored acceptance at merchant
onboarding + customer checkout; Enterprise e-sign working; consent separate from acceptance;
privacy/deletion workflows defined + audited; store legal pages render from published
versions; suites green; all published-as-effective text has gone through qualified legal
review (tracked, not asserted by this plan).

---

## 20. Phase 14 — Observability / Backup / Recovery

### Phase 14 — Observability / Backup / Recovery

**PURPOSE**
Make the platform observable and recoverable: structured logs with correlation IDs, metrics,
error tracking, tracing where useful, alerting, tenant-aware operational visibility;
protected automated backups, PITR where supported, coordinated recovery of DB + object
assets + critical config, **restore testing** (a backup never restored is unproven),
payment/webhook/queue recovery paths, controlled tenant deletion, incident response, recovery
drills. (Handbook §18; also §16 "backups protected like production", §17 health/readiness.)
**IMPLEMENTATION / CONFIGURATION — NOT FROZEN:** specific logging/metrics/tracing/alerting
products, and backup cadence / RPO / RTO targets / recovery vendor, are operational
configuration — this plan fixes that the capabilities exist and are tested, not the vendor
or the numbers. This plan invents **no RPO/RTO values.**

**DEPENDENCIES**
Built incrementally from Phase 1 (correlation IDs, tenant-tagged logs, audit logs land as
each phase ships). Phase 14 is where the capabilities are **completed and proven**.
Its restore drill is a **hard precondition for Phase 4's destructive migrations** and for
Phase 15. Depends on Phase 11 (queue recovery paths), Phase 5 (controlled tenant deletion).

**REPOSITORY AREAS**
Backend: `backend/src/common/logger/*` (structured logging + correlation-id middleware —
there is a `common/logger/` dir today), `backend/src/main.ts` (Sentry init already present,
guarded by `SENTRY_DSN` — extend with tenant/correlation tags),
`backend/src/common/health/health.controller.ts` (add readiness vs liveness distinction —
`/health` + `/health/deep` exist; add `/health/ready` for queue/worker/dependencies),
`backend/src/common/interceptors/*` (request logging), the Phase 11 queue (dead-letter
metrics), the audit modules (Phase 5).
Ops docs: `docs/ops/BACKUP-RESTORE.md` (currently **"DOCUMENTED — NOT VERIFIED"** —
this phase turns it into **VERIFIED <date>**), `docs/ops/DEPLOYMENT.md`,
`docs/ops/PRODUCTION-SMOKE-TEST.md`, new `docs/ops/OBSERVABILITY.md`,
`docs/ops/INCIDENT-RESPONSE.md`, `docs/ops/DR-DRILL.md`.
Infra: managed Postgres backup config, object-storage backup/retention, secrets backup.

**DATABASE / DATA IMPACT**
Minimal schema: possibly a `TenantDeletionRequest` / soft-delete + purge-job state
(controlled tenant deletion — handbook §18), and metrics/audit are mostly write-through to
external systems + the existing audit tables. No business-data change.

**BACKEND IMPACT**
- **Correlation IDs:** a middleware assigns/propagates a request id; it flows into logs,
  Sentry scope, job `JobContext` (Phase 11), webhook processing, and admin error responses.
  (Handbook §18 "correlation IDs across logs, traces and alerts".)
- **Structured logs:** JSON lines with `{ correlationId, tenantId?, actorType, route,
  status, durationMs }` — extend the existing NestJS `Logger` usage. **Never log secrets /
  PII / payment credentials** (the `safeContext` discipline already in `payments/` webhook +
  reconciliation code is the model).
- **Metrics:** request rate/latency/error by route and by tenant; queue depth + dead-letter
  count; webhook processing lag; reconciliation recoveries; subscription state transitions;
  storage usage. Exposed for whatever monitoring vendor is chosen (not frozen).
- **Error tracking:** Sentry (already wired) — add `tenantId`, `correlationId`,
  `actorType` tags; separate alerting for platform vs tenant-impacting errors.
- **Tracing where useful:** checkout, payment capture, webhook processing, domain resolution
  — the multi-hop paths.
- **Alerting:** dead-letter depth, webhook processing lag, reconciliation failure spikes,
  `health/ready` failing, backup job failure, subscription webhook gap, error-rate spike per
  tenant.
- **Tenant-aware operational visibility:** platform console (Phase 5) surfaces per-tenant
  health — order/webhook/email processing status, dead-letter items, subscription state.
- **Health/readiness:** `/health` (liveness — exists), `/health/deep` (DB — exists),
  `/health/ready` (new — DB + queue + object storage + critical config reachable) for
  deploy gating (handbook §17).
- **Controlled tenant deletion:** a multi-step, audited workflow (suspend → grace →
  soft-delete → hard purge across DB + object storage + external providers), reversible
  until hard purge, never an unconstrained `DELETE` (handbook §11 "deletion and retention …
  controlled processes", §18).

**FRONTEND IMPACT**
- Surface `correlationId` in admin/platform error toasts ("contact support with reference
  X").
- Platform console: system-health + per-tenant-health dashboards, queue/dead-letter view,
  backup/restore status, DR-drill log.

**INFRASTRUCTURE IMPACT**
- **Backups (handbook §18, §16):** confirm the managed Postgres plan's automated backup
  cadence + retention + PITR availability (the open action item in `BACKUP-RESTORE.md` §2);
  enable PITR if available; ensure backups are access-controlled ("protected with the same
  rigor as production data").
- **Object storage backup:** Cloudinary originals retained; decide whether an independent
  copy is needed (`BACKUP-RESTORE.md` §2 flags this as unconfirmed).
- **Secrets/config backup:** a sealed offline copy of production secrets
  (`BACKUP-RESTORE.md` §2 action item).
- **Restore testing:** actually restore a backup to a fresh instance, run the verification
  checklist (`BACKUP-RESTORE.md` §6), record RTO, and replace the doc's "NOT VERIFIED" with
  "VERIFIED <date>". Repeat as a scheduled DR drill.
- **3 environments** (Dev/Staging/Production — handbook §17) — Staging must exist by now
  (D8); DR drills run against a staging restore.
- Coordinated recovery: DB + object assets + config restored **together** to a consistent
  point (handbook §18).

**SECURITY IMPACT**
Backups protected like production (access-controlled, encrypted). Logs/traces scrubbed of
PII/secrets. Correlation IDs are non-sensitive. Incident response includes a security-event
path. CI/CD + dependency security treated as continuous (the repo already has
`npm audit` in CI + `docs/ops/DEPENDENCY-ADVISORIES.md` — formalize the process).

**MIGRATION IMPACT**
None to business data. The restore drill **operates on a copy**, never production. Controlled
tenant deletion is additive workflow state.

**KEY RISKS**
- *Backup/restore failure* (the backup is unusable, or restore doesn't work / takes too
  long). Mitigation: **this phase's entire point** — perform a real restore, verify with the
  checklist, measure RTO, document; schedule recurring drills; keep the `pg_dump` fallback
  (`BACKUP-RESTORE.md` §5) tested too.
- *Post-restore external-system drift* (payments/email/media captured after the backup
  point). Mitigation: the reconciliation crons (commerce + billing) re-sync from providers;
  `BACKUP-RESTORE.md` §7 procedure; a documented manual reconciliation window.
- *Observability gaps hiding a tenant-impacting incident.* Mitigation: per-tenant error/lag
  metrics + alerts; synthetic checks per critical path.
- *Logs leaking PII/secrets.* Mitigation: structured-log schema + a redaction layer + a
  test; extend the existing `safeContext` discipline.
- *Controlled tenant deletion running away* (deletes the wrong tenant / too much).
  Mitigation: multi-step, reversible-until-purge, audited, requires explicit `SUPER_ADMIN`
  confirmation + a waiting period; dry-run enumerates what will be purged.
- *RTO undefined leading to an unbounded outage.* Mitigation: the drill measures it; the
  business ratifies a target (not invented here).

**REUSE FROM CURRENT SYSTEM**
- `main.ts` Sentry init (guarded by `SENTRY_DSN`) — extend with tags.
- `common/logger/`, `common/interceptors/` — extend for structured + correlated logs.
- `health.controller.ts` (`/health`, `/health/deep`) — add `/health/ready`.
- `payments/` `safeContext` helpers — the PII/secret-scrubbing model.
- `docs/ops/*` — the runbooks exist and are honest ("DOCUMENTED — NOT VERIFIED"); this phase
  completes and verifies them.
- The reconciliation crons — already the "reconcile against the provider" capability
  (handbook §18 "payment, webhook, and queue recovery paths").

**NEW CAPABILITIES**
Correlation IDs end-to-end; structured tenant-tagged logs; metrics + alerting (queue,
webhook, reconciliation, subscription, per-tenant error rate); readiness checks; per-tenant
operational visibility; **a verified, restore-tested backup**; PITR where available;
coordinated DR; controlled tenant deletion; recurring DR drills; incident-response runbook.

**VERIFICATION / ACCEPTANCE CRITERIA**
- A backup is restored to a fresh instance; `BACKUP-RESTORE.md` §6 checklist passes;
  RTO measured and recorded; the doc header changes to **VERIFIED <date>**.
- A correlation id from an API request appears in the log line, the Sentry event, and the
  resulting background job's logs.
- Alerts fire in a controlled test: dead-letter depth, `health/ready` failure, backup-job
  failure.
- Platform console shows per-tenant processing health + queue dead-letters.
- Controlled tenant deletion dry-run enumerates exactly the target tenant's data; a real
  run on a disposable staging tenant is reversible until purge and fully audited.
- `PRODUCTION-SMOKE-TEST.md` extended with tenant-isolation + observability checks.

**ROLLBACK / RECOVERY CONSIDERATIONS**
This phase *is* the recovery capability. Its own changes (logging middleware, health route,
Sentry tags) are additive and image-revertible. The restore drill never touches production.
Backup configuration changes are applied through the managed provider and are reversible.

**EXIT CRITERIA**
Structured correlated logs; metrics + alerting live; readiness checks; per-tenant visibility;
**backup restore performed, verified, and documented (VERIFIED date)**; PITR enabled where
available; DR drill runbook + first drill complete; controlled tenant deletion working with
safeguards; incident-response runbook published; Staging environment in use.

---

## 21. Phase 15 — Final Security / Isolation / Launch Verification

### Phase 15 — Final Security / Isolation / Launch Verification

**PURPOSE**
Run the frozen §19 launch-readiness checklist to a verdict: prove tenant isolation,
object-level authorization, RBAC negatives, the `SUPER_ADMIN` boundary, payment separation,
subscription/webhook correctness, domain routing, storage access, legal acceptance + e-sign,
upload security, cache isolation, async tenant context, accessibility, SEO, performance, and
backup/restore — then validate the production migration and gate launch. (Handbook §19;
all 20 invariants.)

**DEPENDENCIES**
All prior phases. Phase 14's verified restore. A staging environment mirroring production.

**REPOSITORY AREAS**
`backend/test/e2e/**` (the full isolation + security + commercial + operational suites built
across Phases 3–14, consolidated + gap-filled), `frontend` a11y/SEO/perf test tooling,
`.github/workflows/ci.yml` (add the isolation + security suites as required gates),
`docs/ops/PRODUCTION-SMOKE-TEST.md` (extended), new
`docs/saas/LAUNCH-READINESS-ASSESSMENT.md` (the verdict document), new
`docs/saas/PRODUCTION-MIGRATION-RUNBOOK.md`.

**DATABASE / DATA IMPACT**
No new schema. This phase includes the **legacy-assumption removal wave** (§25 final wave):
drop `User.role`, drop the pre-tenant `userId` columns on `Cart`/`Order`/`Review`/etc. that
Phase 4 kept for compatibility, drop the old single-column indexes/uniques superseded by
composites, remove the env-sourced single Razorpay account fallback. Each is a small,
backed-up, individually-reversible-by-restore contract migration.

**BACKEND IMPACT**
Bug fixes only (no new features). Close every P0 and dispose of every P1 found by the
checklist. Remove dead single-tenant code paths. Tighten any `advisory` enforcement flag
still not `enforced`.

**FRONTEND IMPACT**
Bug fixes; a11y remediation; SEO fixes; performance fixes surfaced by the audits. Remove
dead single-tenant assumptions.

**INFRASTRUCTURE IMPACT**
- Production migration dry-run on a full staging restore of production (Phase 14 capability):
  run every SaaS migration + backfill end-to-end, time it, validate, record.
- Final production cutover runbook: backup → maintenance window → migrations + backfill →
  validation → smoke → open traffic → monitor. With a tested rollback (restore) path.
- CI gates: isolation suite + security suite + RBAC-negative suite must pass to deploy.

**SECURITY IMPACT**
This is the security-verification phase. Every invariant gets an explicit test or documented
attestation. A focused security review (the repo already has a `security-review` capability)
of the tenant boundary, the two control planes, payment separation, credential handling, and
the legal/privacy workflows.

**MIGRATION IMPACT**
The production migration is *executed* here (against real production data, per D2), having
been dry-run repeatedly on staging restores. The legacy-removal wave runs after a
stabilization period post-cutover.

**KEY RISKS**
- *An isolation gap missed by testing.* Mitigation: paired positive/negative tests for every
  tenant-owned resource type; a manual pentest-style pass; advisory-mode telemetry from
  production showing zero cross-tenant breadcrumbs for a sustained window.
- *Production migration fails mid-way.* Mitigation: dry-run on a full staging restore until
  it's boringly repeatable; each wave independently validated + restorable; a maintenance
  window; a go/no-go checkpoint after each wave.
- *A P1 quietly shipped as unaccepted.* Mitigation: the readiness assessment lists every P1
  with an explicit "resolved" or "accepted by <name> because <reason>"; no blank
  dispositions.
- *Legacy-removal breaks something still depending on it.* Mitigation: CI grep gates active
  since the phase that deprecated each thing; removal is a separate post-cutover wave with
  its own backup.
- *Performance regression under multi-tenant load.* Mitigation: load test on staging with
  representative tenant counts + data volumes; composite indexes verified used
  (`EXPLAIN`); the domain-resolution + entitlement caches validated.

**REUSE FROM CURRENT SYSTEM**
- The entire e2e harness (`backend/test/e2e/support/` — `test-app.ts`, `db.ts` reset,
  `fixtures.ts`, `FakeCloudinaryService`, local HMAC signing) — the foundation for every
  SaaS test.
- Every existing e2e spec (`auth-security`, `checkout-security`, `checkout-concurrency`,
  `payments-race`, `webhook-retry`, `payment-reconciliation`, `order-status-transitions`,
  `tax-and-invoicing`, `admin-control-plane`, `upload-magic-bytes`, `product-search`,
  `product-image-delivery`, `postal-lookup`) — retained as single-tenant cases + extended
  to multi-tenant.
- `docs/ops/PRODUCTION-SMOKE-TEST.md` + `DEPLOYMENT.md` rollback runbook — extended.
- The `security-review` capability.

**NEW CAPABILITIES**
A launch-readiness verdict (READY / READY WITH NON-BLOCKING FINDINGS / NOT READY); a
validated production migration runbook; CI-enforced isolation + security gates; the SaaS
platform in production.

**VERIFICATION / ACCEPTANCE CRITERIA** (the launch gate)
- **Tenant isolation:** every tenant-owned resource type has passing positive + negative
  tests; production advisory telemetry clean for a sustained window; a manual cross-tenant
  probe finds nothing.
- **Object-level authz:** per-object checks proven (not just per-endpoint).
- **RBAC negatives:** `VIEWER/STAFF/ADMIN/OWNER` each blocked from what they shouldn't do.
- **SUPER_ADMIN boundary:** no unscoped tenant-data route; support sessions time-boxed +
  audited.
- **Payment separation:** SaaS billing and commerce payments share no table, no ledger, no
  workflow; per-tenant payment accounts isolated.
- **Subscriptions/webhooks:** 7 states only; webhooks verified + idempotent + reconciled;
  billing webhooks separate from commerce webhooks.
- **Domain routing:** host→store→tenant correct; unknown/unverified hosts safe; canonical
  redirects.
- **Storage access:** private assets require read authz; cross-tenant → 404; orphan cleanup
  safe.
- **Legal acceptance / e-sign:** hash-anchored, immutable, two-layer separate; e-sign
  working; privacy/deletion workflows audited.
- **Upload security:** magic-byte validation, size limits, no parsing — preserved.
- **Cache isolation:** frontend + CDN store-keyed; no cross-store bleed.
- **Async tenant context:** every job carries + honors tenant context; multi-instance safe.
- **Accessibility / SEO / performance:** audited, findings triaged to the severity model.
- **Backup/restore:** verified (Phase 14), RTO recorded, drill scheduled.
- **Production migration:** dry-run on a full staging restore, validated, timed, runbooked.
- **Verdict:** all P0 resolved; every P1 resolved or explicitly accepted with a named owner
  + reason; security verification complete; tenant-isolation verification complete;
  production operational verification complete; production smoke passes.

**ROLLBACK / RECOVERY CONSIDERATIONS**
- The production cutover has a tested restore-based rollback (Phase 14) and per-wave go/no-go.
- Post-cutover, the `advisory` kill-switches and provider fallbacks from earlier phases
  remain available for a stabilization window before the legacy-removal wave.
- The legacy-removal migrations are individually small and restore-reversible.
- Frontend rollback is instant (Vercel).

**EXIT CRITERIA**
Launch-readiness assessment signed with a **READY** (or **READY WITH NON-BLOCKING FINDINGS**,
all documented) verdict; production migration executed + validated; CI isolation/security
gates enforced; production smoke green; monitoring clean through the stabilization window;
`BLUEPRINT-v1.2` formally superseded (D1). **PrintForge SaaS is live.**

---

## 22. Dependency Graph

### 22.1 The required linear spine

```
Phase 0  Inventory & Decision Lock
   │  (decisions D1–D13 resolved; production-data question D2 answered)
   ▼
Phase 1  Tenant / Store / StoreDomain / TenantMembership  (additive, non-enforcing)
   │
   ▼
Phase 2  Identity & Membership  (SUPER_ADMIN, tenant roles, permissions, Customer split)
   │
   ▼
Phase 3  Tenant Context & Authorization  (server-derived context, scoped client, advisory)
   │
   ▼
Phase 4  Data Ownership Migration  (tenantId/storeId/customerId backfill → enforced)
   │        ⟵ REQUIRES Phase 14's restore drill before its destructive waves
   ▼
Phase 5  Platform Admin / Tenant Admin  (two control planes, audit logs)
   │
   ▼
Phase 6  Plans / Features / Limits / Usage  (entitlement engine)
   │
   ▼
Phase 7  SaaS Subscription / Billing  (7 states, billing webhooks, SaaS invoices)
   │
   ▼
Phase 8  Merchant Payment Account  (per-tenant commerce payment, provider abstraction)
   │
   ▼
Phase 9  Store / Domain Resolution  (host→store→tenant, custom domains, TLS)
   │
   ▼
Phase 10 Asset / Storage / Customization  (tenant-owned assets, public/private, cleanup)
   │
   ▼
Phase 11 Async / Webhook / Worker  (tenant-aware queue, multi-instance safe workers)
   │
   ▼
Phase 12 Storefront Tenantization  (shared engine renders any store)
   │
   ▼
Phase 13 Legal / Acceptance Infrastructure  (versioned docs, hash-anchored acceptance)
   │
   ▼
Phase 14 Observability / Backup / Recovery  (correlated logs, verified restore, DR drills)
   │        ⟳ capabilities START at Phase 1 and accrete; PROVEN here
   ▼
Phase 15 Final Security / Isolation / Launch Verification  (checklist → verdict → launch)
```

### 22.2 True prerequisites (an edge means "cannot start without")

| Phase | Hard prerequisites | Notes |
|---|---|---|
| 0 | — | root |
| 1 | 0 | needs the decision lock |
| 2 | 1 | needs `TenantMembership`, `Tenant`, `Store` |
| 3 | 1, 2 | needs membership + `Customer` + permissions |
| 4 | 1, 2, 3 **+ a completed Phase 14 restore drill (for destructive waves only)** | the migration itself |
| 5 | 2, 3, 4 | tenant-scoped data + platform-op catalogue must exist |
| 6 | 1, 2, 4, 5 | usage counts are per-tenant; platform console CRUDs plans |
| 7 | 1, 5, 6 | entitlements consume subscription state |
| 8 | 3, 4 | (independent of 5–7; ordered after for review focus) |
| 9 | 1, 3, 5 | fills the Phase 3 resolver seam |
| 10 | 2, 3, 4, 6 | tenant/customer assets + storage limits |
| 11 | 3, 4, 7, 8, 10 | needs the webhook streams + jobs to make tenant-aware |
| 12 | 2, 3, 4, 8, 9 | store context + payment account + domain |
| 13 | 1, 2, 5, 7, 12 | onboarding + storefront legal surfaces |
| 14 | (accretes from 1) | restore drill gates Phase 4; full completion gates 15 |
| 15 | all | the launch gate |

### 22.3 Where phases may safely overlap (with the same team or parallel teams)

- **Phase 14 runs continuously alongside every phase.** Correlation IDs, structured logs,
  tenant-tagged telemetry, and audit-log writers are added *as each phase ships*; only the
  restore drill + DR runbook + alerting completion are a discrete block — and the restore
  drill must land **before Phase 4's destructive migrations**, i.e. it can (and should) be
  done during Phases 1–3.
- **Phase 8 (Merchant Payment Account) is largely independent of Phases 5–7.** It depends
  only on Phase 3 + Phase 4. It is sequenced after Phase 7 in the spine for review focus
  (do the whole SaaS-billing side, then the commerce side), but a second team could build
  Phase 8 in parallel with Phases 5–7 once Phase 4 is done. **Do not** parallelize it with
  Phase 4 itself (it modifies `PaymentAttempt`/`Order`).
- **Phase 9 (Domain Resolution) can overlap Phases 5–8.** It depends on Phases 1/3 (+ Phase
  5 for the approval UI). The resolver seam exists from Phase 3.
- **Phase 6 and Phase 7** can overlap partially: the `Plan`/`PlanFeature`/`PlanLimit` model
  + platform CRUD (Phase 6) and the `Subscription` state machine (Phase 7) can be built
  concurrently, but **Phase 7's entitlement-cache-bust integration requires Phase 6's
  `EntitlementService`** — integrate at the end.
- **Phase 10 and Phase 11** overlap: asset-cleanup is a Phase 11 job; build the `Asset`
  model + read authz (Phase 10) while the queue runtime (Phase 11) is built, then wire the
  cleanup job.
- **Phase 12 (Storefront) frontend work can start early** (the component library gains a
  store-context provider) but cannot *complete* until Phase 9 (domain) and Phase 8 (payment
  account) are done.
- **Phase 13 (Legal) model + admin surfaces** can be built alongside Phases 9–12; the
  onboarding/checkout *enforcement* integration needs Phase 12's storefront + Phase 7's
  billing terms.

### 22.4 What must NOT be parallelized

- **Nothing may run ahead of Phase 0's decision lock.** Building against an unresolved D2
  (production data) or D5 (customer identity) risks throwing the work away.
- **Phase 4's waves are strictly sequential** and each gates on its own validation query.
- **No isolation-enforcement flip (Phase 3→4) without its paired tests.**
- **No destructive migration before Phase 14's restore drill.**
- **Phase 2's `Customer` split and Phase 4's ownership re-point** are a single logical
  identity migration split across two phases — they cannot be worked by independent teams
  without tight coordination.
- **Phase 15 cannot start** until every prior phase's EXIT CRITERIA are met.

---

## 23. Risk Register

Severity: **C** = Critical (data breach / loss / launch-blocking), **H** = High,
**M** = Medium. "Verification" = how we prove the mitigation works.

| # | Risk | Sev | Affected phase(s) | Why it happens | Mitigation | Verification |
|---|---|---|---|---|---|---|
| R1 | **Tenant-isolation failure** — one tenant reads/writes another's data | C | 3, 4, 8, 9, 10, 11, 12 | A query path bypasses the scoped client; context derived from a client value; a missing `tenantId` filter; a composite FK not added | App-layer scoped client (D4) as primary + RLS + composite FKs as defense-in-depth; CI gate banning direct `PrismaService` import in domain services; advisory→enforced rollout with production telemetry; context always server-derived | `tenant-isolation.e2e-spec.ts` paired positive/negative for every resource type; advisory-mode zero cross-tenant breadcrumbs for a sustained window; manual cross-tenant probe (Phase 15) |
| R2 | **Incorrect ownership backfill** — a row assigned to the wrong tenant/customer | C | 2, 4 | Bad join logic; interrupted backfill; `User→Customer` mismatch | Single-tenant source ⇒ everything maps to Tenant #1 (low ambiguity); idempotent resumable backfill; validation query after every wave (null/orphan/cross-store/count); full dry-run on a restored copy with row-count diff before production | Post-backfill reconciliation report per table; pre/post aggregate totals match; `Customer` count == migrated shopper count |
| R3 | **User/session migration failure** — mass logout or mis-scoped sessions | H | 2 | JWT payload shape change; `tokenVersion` bump; customer/merchant token confusion | Don't bump `tokenVersion`; accept the old payload for one refresh-TTL window; separate token audiences + guards; short access-token TTL + working refresh | `auth-security.e2e-spec.ts`: old token still authorizes for the window; a customer token is rejected by every admin route; existing login flows pass end-to-end |
| R4 | **Privilege escalation** — a role/permission or SUPER_ADMIN path grants too much | C | 2, 5 | Bad role→permission map; `SUPER_ADMIN` gets a blanket tenant-data route; guard ordering bug | Deny-by-default `PermissionsGuard`; role→permission map reviewed as a security artifact; no cross-tenant bulk endpoints; SUPER_ADMIN tenant access only via time-boxed audited `SupportSession` | `platform-control-plane.e2e-spec.ts`: raw SUPER_ADMIN token 403/404s on tenant business routes; per-role negative tests; support-session access fully in `PlatformAuditLog` |
| R5 | **Payment separation failure** — commerce funds/flow commingled with SaaS billing, or two tenants share a payment account | C | 7, 8 | Shared models/tables; `billing/` imports `payments/`; checkout falls back to the platform account | Physically separate models, tables, provider adapters, webhook streams, refund workflows, audit; CI rule `billing/ ⊥ payments/`; checkout resolves the account from the order's store every time; `@@unique([storeId, provider])` | `money-flow-separation.e2e-spec.ts`; `merchant-payment-account.e2e-spec.ts` (two tenants → two providers/credentials); SaaS refund never creates a `Refund` row |
| R6 | **Subscription webhook inconsistency** — out-of-order/duplicate/lost billing events → wrong entitlements | H | 7 | Provider event reordering; a lost webhook; non-idempotent handler | Idempotent by `providerEventId @unique`; two-phase persist-then-process; CAS transitions tolerate reordering; `billing-reconciliation` cron as the safety net; entitlement-cache bust on every change | `subscription-billing.e2e-spec.ts`: duplicate/out-of-order webhook idempotent; lost webhook recovered by reconciliation; `PAST_DUE` loses paid access after grace |
| R7 | **Domain misrouting** — a host resolves to the wrong store/tenant, or serves before verification | C | 9, 12 | `Host` matched loosely; stale resolution cache; unverified custom domain served; CORS reflects arbitrary origin | Globally-unique `hostname`; pure `Host`→row resolution; `VERIFIED`+`ISSUED` required for custom domains; short-TTL cache with explicit bust; CORS allow-list of verified hosts only; per-deploy canary | `domain-resolution.e2e-spec.ts`: host A never returns store B; unknown host → generic 404; unverified host not served; disabled store vs suspended tenant distinct |
| R8 | **Asset cross-tenant access** — a private asset read by another tenant / a leaked public id walked into a private folder | C | 10 | Unscoped `GET /uploads/:id`; shared storage folder; long-lived signatures | Tenant check first in `findOne`; per-tenant storage folders (`t/{tenantId}/…`); short-lived signed URLs for private; cross-tenant → 404 | `asset-isolation.e2e-spec.ts`: private asset only readable by owner/authorized same-tenant; cross-tenant → 404; signed URL expires |
| R9 | **Async tenant-context loss** — a job runs with no/wrong tenant → cross-tenant write or leak | C | 11 | Tenant id not put into the job; worker doesn't set context; a job on a tenant queue without a tenant | Mandatory `JobContext.tenantId` for tenant queues; worker asserts it before any tenant query; missing tenant → dead-letter, not best-effort; worker uses the same scoped data path as the API | `async-tenant-context.e2e-spec.ts`: a job for tenant A never touches tenant B; a tenant-less job is dead-lettered |
| R10 | **Cache contamination** — TanStack Query / CDN / SWR serves one store's data on another's domain | H | 3, 11, 12 | Query keys not store-namespaced; CDN cache key omits host; no clear on store switch | Store id in every query key; CDN cache key includes `Host`; `queryClient.clear()` on context change; browser test switching hosts | `storefront-tenantization.e2e-spec.ts` + a two-tab browser test: no data/branding bleed; CSP test green |
| R11 | **Destructive migration with no way back** — a contract migration corrupts/loses data and Prisma has no down-migration | C | 4, 8, 10, 15 | `NOT NULL`/drop-column/unique-swap on a large table; no verified backup; expand+contract done in one step | Expand→migrate→contract always split; **verified, restore-tested backup before every destructive migration**; each contract migration small + individually restore-reversible; per-wave go/no-go; maintenance window | Phase 14 restore drill complete before Phase 4 destructive waves; each wave's validation query returns zero unexpected rows; staging full dry-run repeatable |
| R12 | **Backup/restore failure** — the backup is unusable or restore is too slow/never tested | C | 14, 15 | Managed backup cadence/retention/PITR unconfirmed; restore never exercised; RTO undefined; external-system drift after restore | Confirm plan cadence/retention/PITR; **perform a real restore + run the verification checklist + measure RTO**; test the `pg_dump` fallback; document external-system reconciliation (payments/email/media); schedule recurring drills | `BACKUP-RESTORE.md` header becomes "VERIFIED <date>"; §6 checklist passes; RTO recorded; a scheduled DR drill on the calendar |
| R13 | **Legal acceptance integrity failure** — acceptance not bound to the exact version/hash, or a record can be altered | H | 13 | Acceptance stored as "current terms"; mutable acceptance table; platform + merchant legal merged | `AcceptanceRecord.versionId` → immutable `LegalDocumentVersion.contentHash`; append-only, no update/delete API; `layer` discriminator keeps platform vs merchant-store separate; periodic hash re-verification | `legal-acceptance.e2e-spec.ts`: record stores exact version+hash; new version forces re-acceptance; records immutable via API; platform vs store acceptances are separate rows |
| R14 | **Prohibited-technology governance conflict** — the repo's frozen `BLUEPRINT-v1.2` forbids the queue tier the SaaS architecture requires | H | 5, 11 | Two frozen documents disagree; introducing a broker without an ACR | D1: one ACR formally superseding `BLUEPRINT-v1.2` with SaaS v1.0; prefer a Postgres-backed queue (no new prohibited tech) if the ACR stalls | D1 signed before any broker is added; `scheduler-registration.spec.ts` invariant still holds; queue choice documented |
| R15 | **Enforcement flip without tests** — an `advisory` module flipped to `enforced` before its negative tests exist | H | 3, 4 | Schedule pressure; assuming "the filter is obviously right" | Principle #4: no isolation-enforcement change ships without a paired positive+negative e2e test; per-module flip checklist | Each module's `enforced` flip PR includes its isolation tests; CI blocks the flip otherwise |
| R16 | **Entitlement lock-out** — a bad plan/limit config blocks every merchant from normal operations | M | 6, 7 | A misconfigured `PlanLimit`; entitlement-cache staleness; downgrade logic deletes data | Global "entitlements advisory" kill-switch (log-only); downgrade never deletes (invariant 19); cache bust on subscription/usage/override write; Enterprise override path | `entitlements.e2e-spec.ts`: downgrade leaves over-limit data intact; advisory flag disables blocking; override raises a limit without schema change |
| R17 | **Order/invoice number collision or duplication across tenants** | H | 4 | Global counter reused; per-tenant counter initialized wrong; non-atomic claim | Per-tenant `TenantCounter` initialized from `MAX(existing)+1` in-migration; atomic `INSERT…ON CONFLICT…RETURNING` claim (existing pattern); number unique within `(tenantId, …)` | Two tenants both start at 1, no collision; concurrency test; `tax-and-invoicing.e2e-spec.ts` under two tenants |
| R18 | **Storefront config injection / merchant config bypassing platform security** | H | 12, 13 | Unvalidated branding/legal/homepage content rendered as HTML; a store owner configuring a query that returns other data | Typed, allowlisted config (the `app-setting.constants.ts` normalizer discipline); render config as data, never execute; no `dangerouslySetInnerHTML` from config; CSP; config surface can't reach across isolation | `index-csp.test.ts` extended; a config-injection e2e/component test; invariant-18 review in Phase 15 |
| R19 | **Performance regression under multi-tenant load** — composite indexes not used, resolution/entitlement caches ineffective | M | 3, 4, 6, 9, 12 | Single-column indexes left in place; N+1 on context resolution; uncached entitlement resolution | Every tenant-owned index leads with `tenantId`/`storeId`; `EXPLAIN` verification; cache `hostname→context` and entitlement resolution; staging load test with representative tenant counts | Phase 15 load test; `EXPLAIN` shows composite index usage; p95 latency within target |
| R20 | **Stale repository assumptions** — the repo changes under active development during the build | M | all | Concurrent storefront/admin/SEO work on `main` | Re-run the Phase 0 inventory diff at each phase start; the `CHANGE-MAP.md` is a living doc; feature-branch the SaaS work with regular rebases | Inventory diff clean at each phase start; CI green on rebase |

---

## 24. Reuse vs Rebuild Matrix

**REUSE** = keep as-is or with trivial parameterization. **REFACTOR** = keep the logic,
change the scoping/interface. **REBUILD** = the current design is structurally single-tenant
and must be replaced. (Most rows are REUSE + REFACTOR — the business logic is sound; the
scoping is not.)

| Area | Reuse | Refactor | Rebuild | Reason (from inspection) |
|---|:---:|:---:|:---:|---|
| **Auth — token/session mechanics** | ✅ | ✅ | — | `auth.service.ts` bcrypt cost, `DUMMY_PASSWORD_HASH` timing, `LOGIN_DELAY_CURVE_MS`, refresh rotation + reuse-detection family revocation, `tokenVersion` — all excellent, kept verbatim. **Refactor:** split merchant vs `Customer` auth flows (Phase 2); token payload carries server-derived context. |
| **Auth — role model** | — | — | ✅ | `Role { CUSTOMER, ADMIN }` + `RolesGuard` role-string check is 2-value single-tenant. Rebuilt as `SUPER_ADMIN` platform role + `TenantMembership.role` (OWNER/ADMIN/STAFF/VIEWER) + permission-based `PermissionsGuard` (Phase 2). |
| **Orders** | ✅ | ✅ | — | `order-state-machine.ts` (CAS, `assertTransitionAllowed`), `OrderStatusHistory` audit, immutable snapshots, `generateOrderNumber` atomic counter — all reused. **Refactor:** `tenantId`/`storeId`/`customerId`, per-tenant counter, `assertOwnedBy` → two-step tenant+customer check. |
| **Products / Catalog** | ✅ | ✅ | — | `products.service.ts` / `categories` logic (soft-delete via `isActive`, slug routing, denormalized `avgRating`) reused. **Refactor:** `(storeId, slug)` uniqueness, composite same-store category FK, tenant scoping. |
| **Categories** | ✅ | ✅ | — | Flat one-level tree, `isActive` filtering — reused. **Refactor:** store-scoped; self-parent FK must stay same-store. |
| **Cart** | ✅ | ✅ | — | `cart.service.ts` live-recompute pricing, `SELECT … FOR UPDATE` at checkout, `getOwnedItemOrThrow` — reused. **Refactor:** `(storeId, customerId)` unique; `userId` → `customerId`; tenant scoping. |
| **Checkout** | ✅ | ✅ | — | `checkout.service.ts` single-transaction idempotency + cart lock + pricing + tax + coupon claim + snapshot writes — the crown jewel, reused whole. **Refactor:** tenant/store context, store's shipping/tax settings, store's `PaymentAccount`, per-tenant order number. |
| **Payments** | ✅ | ✅ | — | `RazorpayService` wrapper (bigint-paise, `RazorpayApiError` classification), `PaymentsService` (`applyWebhookEvent`, `reconcileCapturedPayment`), `WebhookProcessor` (two-phase, bounded retry, dead-letter), `PaymentReconciliationService`, partial-unique invariant — all reused. **Refactor:** credentials per-call from `PaymentAccount` not env; `paymentAccountId` on attempts; per-account webhook verification (Phase 8). |
| **Coupons** | ✅ | ✅ | — | `coupons.service.ts` `usedCount` atomic-CAS, per-user usage ledger, scope/min-order checks, immutability of `code`/`type` — reused. **Refactor:** `(storeId, code)` unique; `createdByAdminId` → membership; store-scoped category scope. |
| **Reviews** | ✅ | ✅ | — | `reviews.service.ts` verified-purchase anchor on `orderItemId` of a DELIVERED order, `(productId,userId)` one-review rule, moderation states, transactional denorm recompute — reused. **Refactor:** `(storeId, productId, customerId)` unique; `userId` → `customerId`; same-store anchor. |
| **Invoices / Tax** | ✅ | ✅ | — | `invoices.service.ts` immutable per-order snapshot, dedicated `invoice_number_counter`, `sellerSnapshot` freeze; `tax.service.ts` inclusive-GST engine — reused. **Refactor:** per-tenant counter + prefix; `sellerSnapshot` + tax config from tenant/store settings not global `AppSetting` (Phase 4); tax regime generalizable later (D12). |
| **Uploads / Assets** | ✅ | ✅ | — | Backend-proxied upload, `file-signature.util.ts` magic-byte validation, 10 MB stream limit, PNG/JPEG/PDF allowlist, no server-side parsing, Cloudinary folder scheme, signed vs public delivery, order-referenced `RESTRICT` — reused. **Refactor:** `StorageProvider` interface, `tenantId`/`visibility`/`kind`, per-tenant folders, read authz on private, orphan-cleanup poller (new, Phase 10/11). |
| **Notifications / Email** | ✅ | ✅ | — | `EmailService` (Resend), worker-only dispatch, template builder — reused. **Refactor:** transactional vs marketing path split (Phase 11); tenant context in the outbox event. |
| **Outbox** | ✅ | ✅ | — | `NotificationsService.enqueueOutboxEvent(tx,…)` transactional insert, `OutboxPoller` `FOR UPDATE SKIP LOCKED` claim + bounded retry + backoff + `FAILED` dead-letter — the pattern is the queue-runtime template. **Refactor:** `tenantId` + `scope` on events; poller becomes a queue relay (Phase 11); enum gains SaaS event types. |
| **Webhooks (commerce)** | ✅ | ✅ | — | Two-phase (verify+persist, then poll+process), idempotent by unique event id, `PaymentMismatchError` non-retryable, Sentry on permanent failure, `safeContext` redaction — reused. **Refactor:** per-account secret; `tenantId` resolved in processing; split from billing webhooks (D7); processed by workers (Phase 11). |
| **Admin UI (backend + React)** | ✅ | ✅ | — | `admin` module + `pages/admin/*` + `components/admin/*` + `features/admin/*` + `AdminLayout`/`AdminRoute` (already a separate shell per `App.tsx`) — reused as the **Tenant Control Plane**. **Refactor:** permission guards, tenant scoping, tenant audit writes, team management, tenant switcher. **Note:** the **Platform** Control Plane (`/platform/*`) is genuinely **new** (Phase 5), not a rebuild of admin. |
| **Storefront (React)** | ✅ | ✅ | — | The entire `pages/*` + `features/catalog|cart|checkout|reviews|customization|orders|account` + `components/home/*` + `components/layout/*` + `ui/` primitives + `hooks/*` — the largest single reuse. **Refactor:** store-context provider, store-namespaced query keys, config-driven branding, per-store SEO, store legal pages. |
| **Settings** | — | ✅ | ✅ | `AppSetting` single global key–value table + `app-setting.constants.ts` typed normalizers. **Reuse** the normalizer/allowlist *discipline*. **Rebuild** the storage as `TenantSetting`/`StoreSetting` (+ per-tenant `TenantCounter`); no business setting stays global (Phase 4, D11). |
| **SEO** | ✅ | ✅ | ✅ | `seo/` per-route `<Seo>` (React-19 native metadata), `jsonLd.ts`, `siteConfig.ts` helpers (`absoluteUrl`, `pageTitle`, `clampDescription`) — **reused**. **Refactor:** origin from store context not the hard-coded `https://www.printforge.in`. **Rebuild:** `seoFiles.ts` build-time `robots.txt`/`sitemap.xml` → backend per-store routes (Phase 9). |
| **Tests** | ✅ | ✅ | — | The e2e harness (`backend/test/e2e/support/` — `test-app.ts`, `db.ts` reset, `fixtures.ts`, `FakeCloudinaryService`, local HMAC signing) and every existing spec — reused as single-tenant cases + extended to multi-tenant. `FakeCloudinaryService` is the model for `FakeBillingProvider`/`FakeESignProvider`. **New:** the whole tenant-isolation / platform-control-plane / entitlements / subscription / domain / asset-isolation / async-context suite. |
| **CI/CD** | ✅ | ✅ | — | `.github/workflows/ci.yml` (hygiene + backend-with-real-Postgres + frontend, `npm audit`, `prisma migrate deploy`) — structure reused. **Refactor:** add isolation + security + RBAC-negative suites as required gates; add the `PrismaService`-import and plan-key-literal grep gates; add a staging deploy; multi-instance worker job (Phase 11). **Rebuild-ish:** deployment topology (worker service, ≥2 API instances, staging env — D8) is new infra, not a code rebuild. |

**Nothing in the repository is discarded.** The two genuine rebuilds (auth role model,
settings storage) are small and well-contained; everything else is reuse or re-scoping.

---

## 25. Database Migration Strategy (conceptual — no migration code)

Follows the required sequence: **Inventory → Ownership mapping → Foundational entities →
Compatibility relationships → Verified backfill → Validation → Constraints/indexes →
Tenant-aware access → Domain-by-domain migration → Legacy-assumption removal.**

Every wave: forward-only (Prisma has no down-migration); expand→contract; a verified,
**restore-tested** backup before any destructive step; a validation query that must return
zero unexpected rows before proceeding; a maintenance window for `NOT NULL`/unique-swap steps.

| Wave | Phase | Affected models | Change | Risk | Required validation | Rollback consideration |
|---|---|---|---|---|---|---|
| **W0 — Inventory** | 0 | (read-only) | Live `SELECT` row counts, date ranges, `role` distribution, `AppSetting` keys, orphan checks — against a restored copy or replica | None (read-only) | Inventory report attached to `docs/saas/INVENTORY.md`; D2 answered | n/a |
| **W1 — Foundational entities** | 1 | *new:* `Tenant`, `Store`, `StoreDomain`, `TenantMembership`, `Plan`, `Subscription` (shells) | `CREATE TABLE` only; partial uniques (`(tenantId) WHERE isPrimary`, `(storeId) WHERE isPrimary`), `(userId,tenantId)` unique, global-unique `hostname` | Minimal (additive) | `prisma validate`; new tables' constraint tests; full existing suite green | `DROP TABLE` compensating migration (safe — nothing references them yet); image revert |
| **W2 — Identity** | 2 | *new:* `Customer`, `CustomerRefreshToken`, `PlatformRole` field; `User.platformRole?` (add), `User.role` (keep) | Add `Customer` (`(storeId,email)` unique) + auth fields + address columns; nullable additions to `User` | Medium (identity) | Backfill reconciliation: shopper `User` count == `Customer` count under Tenant #1's store; admin `User` has `OWNER` membership; old token still authorizes 1 TTL window | Backup before `Customer` backfill; `Customer` rows additive → `DELETE … + re-run`; `User.role` drop deferred to W9 |
| **W3 — Compatibility columns** | 4 | `Category`, `Product`, `ProductImage`, `ProductVariant`, `CustomizationField`, `UploadedFile`, `Cart`, `CartItem`, `CartItemCustomization`, `Order`, `Invoice`, `OrderItem`, `OrderItemCustomization`, `PaymentAttempt`, `Refund`, `OrderStatusHistory`, `IdempotencyKey`, `OutboxEvent`, `Review`, `Coupon`, `CouponUsage` | `ADD COLUMN tenantId/storeId/customerId … NULL` (no rewrite in PG 11+); additive composite indexes `CONCURRENTLY` | Low (all nullable) | Every column present + nullable; no lock incident; suite green | Image revert (columns ignored by old code) |
| **W4 — Verified backfill: catalog + settings** | 4 | catalog models; `AppSetting` → `TenantSetting`/`StoreSetting`/`TenantCounter` | Set `tenantId`/`storeId` = Tenant #1 / primary store for all catalog rows; migrate business settings + counters (init counters from `MAX(existing)+1`) | Medium | `COUNT(*) WHERE tenantId IS NULL` = 0 for catalog; every child's tenant == parent's; counter values ≥ current max; `PUBLIC_SETTING_KEYS` resolve store-scoped | Backfill re-runnable; settings dual-read during transition; backup first |
| **W5 — Verified backfill: commerce + customer data** | 4 | `Cart`, `Order`, `Review`, `CouponUsage`, `IdempotencyKey`, `UploadedFile`, `PaymentAttempt`, `Refund`, `OrderStatusHistory`, `OutboxEvent` | `userId` → migrated `Customer.id`; `tenantId`/`storeId` = Tenant #1; `UploadedFile.kind`/`customerId` by uploader role; `OutboxEvent.tenantId`/`scope` | High (customer/order re-point) | Pre/post aggregate reconciliation (order count, revenue sum per tenant == pre-migration global); no `Order` → cross-store `Coupon`/`Product`; `Cart` 1:1 `(storeId,customerId)` | **Verified restore-tested backup mandatory**; each model backfilled + validated independently; re-runnable |
| **W6 — Constraints & composite FKs** | 4 | catalog + commerce | Add composite same-store FKs (`Product(storeId,categoryId)→Category(storeId,id)`, cart/order line FKs); add composite uniques (`(storeId,slug)`, `(storeId,code)`, `(storeId,productId,customerId)`, `(storeId,customerId)`, `(tenantId,orderNumber)`, `(tenantId,invoiceNumber)`) **alongside** the old ones | Medium (add-then-verify) | New composite uniques satisfied by existing single-tenant data (verify before adding); FK violations = 0 | Add new constraints first (non-destructive); old ones still present |
| **W7 — Contract: NOT NULL + drop old uniques** | 4 | all tenant-owned | `SET NOT NULL` on `tenantId` (via `CHECK NOT VALID` + `VALIDATE` fast path); drop superseded single-column uniques (`products.slug`, `categories.slug`, `coupons.code`, `orders.orderNumber`, `invoices.invoiceNumber`, `reviews(productId,userId)`, `carts.userId`) | **High (destructive)** | Zero nulls confirmed (W4/W5); new composite uniques active; brief maintenance window; full suite green | **Restore from pre-wave backup** is the only rollback; wave kept small; per-table go/no-go |
| **W8 — Payment accounts + assets** | 8, 10 | *new:* `PaymentAccount`; `PaymentAttempt`/`Refund`/`Order` `+paymentAccountId`; `UploadedFile` `+visibility/kind/status/derivedFromAssetId` | Add `PaymentAccount` (seed Tenant #1 from env creds — secure, not `SELECT`); backfill `paymentAccountId` on existing rows; backfill asset `kind`/`visibility`/`status` (default `PRIVATE` when unclear) | Medium | Every `Order`/`PaymentAttempt`/`Refund` has a `paymentAccountId`; assets classified; no auto-deletion of orphans (mark + review) | Additive → image revert for expand; `NOT NULL` steps separate + backed up |
| **W9 — Legacy-assumption removal** | 15 | `User`, `Cart`, `Order`, `Review`, `CouponUsage`, `IdempotencyKey`, `OrderStatusHistory`, env config | Drop `User.role`; drop pre-tenant `userId` columns kept for compatibility; drop old single-column indexes; remove env single-Razorpay-account fallback from `PRODUCTION_REQUIRED_KEYS` | **High (destructive)** but small | CI grep gates (since deprecation) show zero readers; post-cutover stabilization window elapsed; suite green | Each drop is a separate tiny migration, restore-reversible; run only after production is stable |
| **W10 — SaaS-native additive** | 5,6,7,9,11,13,14 | `PlatformAuditLog`, `TenantAuditLog`, `SupportSession`, `FeatureFlag`, `PlanFeature`, `PlanLimit`, `Usage`, `TenantEntitlementOverride`, `SubscriptionEvent`, `SaasInvoice(+Line)`, `BillingWebhookEvent`, `PaymentMethod`, `LegalDocument(+Version)`, `AcceptanceRecord`, `ConsentRecord`, `ESignRequest`, `PrivacyRequest`, `Job` (if PG-queue), `ScheduledJobLock`, `TenantDeletionRequest` | `CREATE TABLE` — all additive, spread across their phases | Low (additive) | Per-phase acceptance criteria | `DROP TABLE` / image revert while unreferenced |

**Migration principles applied throughout:**
`ADD COLUMN … NULL` (fast), `CREATE INDEX CONCURRENTLY`, `CHECK … NOT VALID` +
`VALIDATE CONSTRAINT` for `NOT NULL`, additive-unique-then-drop-old for constraint swaps,
per-tenant counters seeded from `MAX+1`, idempotent resumable backfill scripts (not Prisma
seeds), a validation query gating every wave, a verified backup before every destructive
wave, maintenance windows for W7/W9, and the whole sequence dry-run on a full staging
restore of production before it touches production (Phase 15).

---

## 26. Testing Strategy

### 26.1 Layers and what each proves

| Layer | Tooling (existing) | What it covers for SaaS |
|---|---|---|
| **Unit** | Jest (`backend`, ~130 `*.spec.ts`), Vitest (`frontend`, ~100 `*.test.tsx`) | Permission map resolution; entitlement computation; subscription state-machine transitions; `TenantContext` derivation; scoped-client `where` injection; per-tenant counter atomicity; storage folder resolution; legal content-hash; redaction helpers |
| **Integration** | Jest + real Postgres (extend `backend/test/e2e/support/`) | Scoped Prisma client against a real DB with RLS; backfill scripts against a restored copy; queue claim/`SKIP LOCKED`; outbox→queue relay |
| **E2E (API)** | `backend/test/e2e/` — real Postgres, real Nest app, supertest, `resetDatabase`, `FakeCloudinaryService`, local HMAC (`+ FakeBillingProvider`, `FakeESignProvider`) | Every isolation, RBAC, payment-separation, subscription, webhook, domain, asset, legal, async-context scenario — positive **and** negative |
| **Browser / UI E2E** | (to add — Playwright or similar; none today) | Two-store cache isolation in a real browser; branding differences; customer session not usable cross-store; checkout through each store's payment account; a11y in-context |
| **Security** | `security-review` capability + manual | Tenant-boundary probe; SUPER_ADMIN boundary; credential-redaction audit; config-injection; CSP (`index-csp.test.ts`) |
| **Performance** | (to add) load tooling on staging | Composite-index usage (`EXPLAIN`); domain-resolution + entitlement cache effectiveness; p95 latency under representative multi-tenant load |
| **Accessibility** | Testing Library + axe (extend existing component tests) | Storefront + both admin planes; loading/empty/error parity (existing `UX-49` lineage) |
| **SEO** | `seo/*.test.tsx` (exists) + new backend route tests | Per-store canonical/OG/JSON-LD; per-store `robots.txt`/`sitemap.xml` content |
| **Backup/restore** | manual DR drill (Phase 14) | A real restore + `BACKUP-RESTORE.md` §6 checklist + RTO measurement |
| **Production migration** | staging full-restore dry-run (Phase 15) | The entire W1–W8 sequence + backfill, timed, validated, repeatable |

### 26.2 The isolation contract — **Tenant A must never access Tenant B**

A single spec family, `backend/test/e2e/tenant-isolation.e2e-spec.ts` (seeded), grown every
phase, asserting for **every tenant-owned resource type** (`Product`, `Category`,
`ProductImage`/`Variant`/`CustomizationField`, `Cart`/`CartItem`, `Order`/`OrderItem`,
`Invoice`, `PaymentAttempt`/`Refund`, `OrderStatusHistory`, `Coupon`/`CouponUsage`,
`Review`, `Asset`, `TenantSetting`/`StoreSetting`, `TenantMembership`, `Subscription`,
`SaasInvoice`, `PaymentAccount`, `LegalDocument`, `AcceptanceRecord`, `TenantAuditLog`,
async jobs):

- **Negative (must fail):** Tenant A's merchant token / A's customer session / A's host →
  **cannot** list, read-by-id, create-under, update, or delete any B resource. Result is
  **404** (or an empty list), never 403 with an existence hint, never a timing difference.
- **Positive (must succeed):** the same actor performs all of the above for A's own
  resources.
- **Context-spoof (must fail):** `X-Active-Tenant: <B>` / a forged tenant hint / B's
  hostname with A's session → rejected; server-derived context wins.
- **Cross-store FK (must be impossible):** an API attempt to attach B's category to A's
  product, or B's coupon to A's order → rejected by validation **and** would be rejected by
  the composite FK.
- **Async (must hold):** a job enqueued for A, run by a worker, only ever touches A's data;
  a tenant-less job on a tenant queue is dead-lettered.
- **Cache (must hold):** switching host/store in the browser swaps **all** data and
  branding; no TanStack Query or CDN bleed.

### 26.3 RBAC / authorization — positive **and** negative for every role

| Actor | Must be able to | Must NOT be able to |
|---|---|---|
| `SUPER_ADMIN` (platform) | manage tenants/plans/subscriptions/domains; read platform + tenant audit; open a scoped, audited `SupportSession` | read/list/mutate any tenant's business data (orders/customers/carts/assets) **without** a support session; act on `/admin/*` without a membership or session |
| `OWNER` (tenant) | everything in their tenant; manage team incl. `ADMIN`; manage `PaymentAccount`; publish store legal | touch another tenant; reach `/platform/*`; read `PlatformAuditLog` |
| `ADMIN` (tenant) | products/orders/coupons/reviews/settings; invite `STAFF`/`VIEWER` | grant/modify `OWNER`; manage `PaymentAccount` (config it, per permission map — decide in Phase 2); another tenant; `/platform/*` |
| `STAFF` (tenant) | assigned day-to-day ops (e.g. order status, fulfilment) | manage team; change billing/plan; settings the permission map withholds; another tenant |
| `VIEWER` (tenant) | read-only tenant views | any mutation; another tenant |
| `CUSTOMER` (store) | their own cart/orders/reviews/profile/assets in **their** store | any `/admin/*` or `/platform/*` route (401/403, no leak); another customer's data; another store with the same session |

### 26.4 Commercial & trust suites (new)

- **Payments (commerce):** `merchant-payment-account.e2e-spec.ts` — per-tenant credentials,
  per-account webhook verification, checkout blocked without an active account; re-run
  `payments-race` / `webhook-retry` / `payment-reconciliation` / `checkout-concurrency`
  under two tenants; partial-unique `(orderId) WHERE CAPTURED` still holds.
- **Subscriptions:** `subscription-billing.e2e-spec.ts` — 7-state lifecycle, upgrade needs
  confirmed billing, downgrade end-of-period, duplicate/out-of-order/lost webhook handling,
  reconciliation recovery, `SubscriptionEvent` history, entitlement-cache bust.
- **Money-flow separation:** `money-flow-separation.e2e-spec.ts` — SaaS vs commerce refunds
  never cross; `billing/` and `payments/` share no table.
- **Entitlements:** `entitlements.e2e-spec.ts` — feature gate 403 + upgrade code; limit
  enforcement with no partial write; concurrent-create race at the limit; non-destructive
  downgrade; Enterprise override; period vs persistent usage.
- **Webhooks:** verified-before-processing, idempotent by unique id, retryable vs permanent
  classification, dead-letter — for **both** commerce and billing streams.
- **Storage:** `asset-isolation.e2e-spec.ts` — private-asset read authz, cross-tenant 404,
  signed-URL expiry, orphan cleanup never deletes a referenced/production asset,
  original↔output distinction; `upload-magic-bytes` preserved.
- **Domain routing:** `domain-resolution.e2e-spec.ts` — host→store→tenant, unknown/
  unverified host safe, canonical redirects, disabled-store vs suspended-tenant distinct.
- **Legal acceptance / e-sign:** `legal-acceptance.e2e-spec.ts` — hash-anchored immutable
  records, re-acceptance on new version, two-layer separation, e-sign flow, audited
  privacy/deletion workflow, consent ≠ acceptance.
- **Async tenant context:** `async-tenant-context.e2e-spec.ts` — jobs carry + honor tenant
  context, multi-instance no-double-process, scheduled job fires once.

### 26.5 Quality & operational

- **Accessibility / SEO / performance** audits run in Phase 15, findings triaged to the
  P0/P1/P2 severity model.
- **Backup/restore** proven by the Phase 14 drill (checklist + RTO).
- **Production migration** proven by the Phase 15 staging full-restore dry-run.
- **Real (not mocked) providers** exercised in a pre-launch smoke against test-mode
  Razorpay + the real billing provider sandbox + real Resend + real object storage
  (`PRODUCTION-SMOKE-TEST.md` extended).

### 26.6 CI gates (extend `.github/workflows/ci.yml`)

Required to merge / deploy: existing hygiene + backend (real Postgres) + frontend jobs;
**plus** the tenant-isolation suite, the platform-control-plane suite, the RBAC-negative
suite, `money-flow-separation`; **plus** grep gates — no `PrismaService` import in domain
services outside the allowlist, no plan-key string literal outside `src/plans/`, no
`billing/`↔`payments/` cross-import, no read of `user.role` after Phase 2. Multi-instance
worker test job added in Phase 11. Staging deploy gate before production.

---

## 27. Definition of Done — PrintForge SaaS is not "SaaS-ready" until…

A single checklist. Every item is **proven** (a passing test suite, a signed assessment, or
a completed drill), not asserted.

**Isolation & identity**
- [ ] Tenant isolation proven — `tenant-isolation.e2e-spec.ts` passes for every
      tenant-owned resource type, positive + negative; production advisory telemetry shows
      zero cross-tenant access for a sustained window; a manual cross-tenant probe finds
      nothing.
- [ ] Client-supplied tenant id is never an authorization boundary — context-spoof tests
      pass; context is always server-derived.
- [ ] Membership-based authorization proven — `SUPER_ADMIN` + `OWNER/ADMIN/STAFF/VIEWER` +
      `CUSTOMER`; permission-based checks (no role-name business logic — CI grep gate green);
      RBAC positive + negative suites pass.
- [ ] `CUSTOMER` is separate from merchant roles — a customer session has no path into any
      tenant or platform admin surface (tested).

**Control planes**
- [ ] Platform and Tenant control planes proven separate — separate guards, route trees,
      audit logs; `platform-control-plane.e2e-spec.ts` passes.
- [ ] `SUPER_ADMIN` is not an unscoped tenant-data bypass — no cross-tenant bulk route
      exists; scoped access only via a time-boxed, justified, audited `SupportSession`
      (tested).
- [ ] Platform audit log and tenant audit log are distinct and one-way (tested).

**Entitlement & billing**
- [ ] Plans / features / limits / usage enforced by the backend — `entitlements.e2e-spec.ts`
      passes; feature gates, persistent + period-based limits, concurrent-create races,
      Enterprise overrides all covered.
- [ ] Downgrade / cancellation does not destroy merchant data (tested — invariant 19).
- [ ] Subscriptions are authoritative — exactly 7 states; webhook-driven; verified +
      idempotent + reconciled; `SubscriptionEvent` history complete; SaaS invoices immutable;
      `subscription-billing.e2e-spec.ts` passes.

**Payments**
- [ ] SaaS subscription billing and merchant commerce payments are separated — no shared
      table, ledger, or workflow; `money-flow-separation.e2e-spec.ts` passes.
- [ ] Merchant commerce uses the merchant's own payment-account context — per-tenant
      credentials, encrypted at rest, never client-exposed, never in a job payload;
      `merchant-payment-account.e2e-spec.ts` passes.
- [ ] Payment amounts are server-authoritative (existing guarantee preserved under
      multi-tenant — `checkout-security` re-run passes).
- [ ] Webhooks (commerce + billing) verified, idempotent, auditable (tested).

**Stores & storefront**
- [ ] Stores / domains resolve correctly server-side — `domain-resolution.e2e-spec.ts`
      passes; custom domains verified before routing; TLS in production; canonical redirects.
- [ ] One primary storefront per tenant works end-to-end for ≥2 tenants; the shared engine
      renders each from context + config + data.
- [ ] Storefront is store-aware — catalog/cart/checkout/account/reviews/legal/SEO/sitemap/
      robots all store-scoped; frontend + CDN cache store-keyed; no cross-store bleed
      (browser test).

**Assets**
- [ ] Assets are tenant-owned with a resolvable tenant; private assets require read
      authorization; cross-tenant access returns 404; `asset-isolation.e2e-spec.ts` passes.
- [ ] Orders preserve the exact customization + asset version purchased; customer originals
      and production outputs are distinct; orphan cleanup never deletes a referenced asset.

**Async**
- [ ] Background jobs carry tenant context — `async-tenant-context.e2e-spec.ts` passes;
      multi-instance safe (workers + scheduled jobs); dead-letter handling + visibility.

**Legal**
- [ ] Legal acceptance is auditable — versioned, content-hash-anchored, immutable records;
      platform vs merchant-store layers separate; Enterprise e-sign working; privacy /
      deletion workflows defined and audited; `legal-acceptance.e2e-spec.ts` passes.
- [ ] All legal text published as effective has passed qualified legal review (tracked).

**Security & operations**
- [ ] Security controls verified — a focused security review of the tenant boundary, both
      control planes, payment separation, credential handling, and legal/privacy workflows;
      findings triaged to the severity model.
- [ ] `SameSite=Strict` not weakened; CORS is an allow-list of verified hosts + fixed
      platform origins; secrets server-side; auth endpoints have abuse protection (existing +
      extended).
- [ ] Backups are protected (access-controlled, encrypted) with the same rigor as
      production.
- [ ] **Restore has been tested** — a real restore performed, `BACKUP-RESTORE.md` §6
      checklist passed, RTO measured, the doc marked **VERIFIED <date>**, a recurring DR
      drill scheduled.
- [ ] Observability in place — correlated structured logs, metrics, error tracking,
      alerting, per-tenant operational visibility; readiness checks.
- [ ] Controlled tenant deletion works with safeguards (reversible until purge, audited).

**Migration & launch**
- [ ] Production migration validated — the full W1–W8 + backfill sequence dry-run on a
      full staging restore of production, timed, validated, runbooked; then executed against
      production and reconciled (pre/post aggregate totals match).
- [ ] All **P0** findings resolved.
- [ ] Every **P1** finding explicitly resolved **or** accepted with a named owner and a
      documented reason — no blank dispositions.
- [ ] Production smoke passes — `PRODUCTION-SMOKE-TEST.md` (extended with tenant-isolation +
      observability checks) green; `webhook_events`/`outbox_events` draining; one real
      commerce checkout + one subscription lifecycle exercised end-to-end.
- [ ] Governance — `BLUEPRINT-v1.2` formally superseded by SaaS Architecture v1.0 via the
      ACR process (D1); no silent architecture changes were made.
- [ ] Launch-readiness assessment (`docs/saas/LAUNCH-READINESS-ASSESSMENT.md`) signed with a
      **READY** or **READY WITH NON-BLOCKING FINDINGS** verdict.

---

## 28. Final Implementation Sequence

The numbered phases **are** the sequence. Restated as an execution checklist, with the
cross-cutting work called out:

1. **Phase 0 — Inventory & Decision Lock.** No code. Resolve D1–D13; confirm D2 (production
   data) in writing. Produce `docs/saas/INVENTORY.md`, `OWNERSHIP-MAP.md`, `DECISIONS.md`,
   `CHANGE-MAP.md`.
2. **Phase 1 — Tenant / Store / StoreDomain / TenantMembership** (+ `Plan`/`Subscription`
   shells). Additive `CREATE TABLE` only. Existing behavior unchanged.
3. **Phase 2 — Identity & Membership.** `SUPER_ADMIN` + tenant roles + permission guard;
   `Customer` split; backward-compatible token handling; controlled identity backfill.
4. **Phase 3 — Tenant Context & Authorization.** Server-derived context; scoped data client
   (app-layer + RLS); object-level authz; platform-op catalogue; advisory→enforced flags.
   **Start Phase 14's correlation-ID / structured-logging / audit-writer work here.**
5. **Phase 4 — Data Ownership Migration.** Waves W3–W7: compatibility columns → verified
   backfill (catalog, settings, commerce, customer data) → validation → composite
   constraints/indexes/FKs → `NOT NULL` + unique-swap. **Precondition: Phase 14 restore
   drill complete.** Flip modules to `enforced` as their isolation tests pass. Legacy
   `userId` columns retained.
6. **Phase 5 — Platform Admin / Tenant Admin.** Two control planes; `PlatformAuditLog` /
   `TenantAuditLog`; `SupportSession`; team management; feature flags ≠ entitlements.
7. **Phase 6 — Plans / Features / Limits / Usage.** Entitlement engine; feature gates; limit
   enforcement in create transactions; usage metering + backfill.
8. **Phase 7 — SaaS Subscription / Billing.** 7-state machine; `BillingProvider` abstraction
   (vendor = separate decision); own two-phase billing-webhook stream; immutable
   `SaasInvoice`; reconciliation; SaaS refunds separate from commerce.
   *(Phase 8 may run in parallel with 5–7 by a second team, after Phase 4.)*
9. **Phase 8 — Merchant Payment Account.** `PaymentAccount` + `PaymentProvider` abstraction
   (Razorpay adapter = the existing `RazorpayService`); encrypted per-tenant credentials;
   per-account webhooks; checkout uses the store's account.
10. **Phase 9 — Store / Domain Resolution.** Host→store→tenant on every request; platform
    subdomains; custom-domain verification + TLS; canonical redirects; per-store `robots`/
    `sitemap`; de-hardcode the frontend origin. *(May overlap 5–8.)*
11. **Phase 10 — Asset / Storage / Customization.** `StorageProvider` abstraction (Cloudinary
    adapter, tenant-prefixed folders); `Asset` public/private + kind; read authz on private;
    orphan-cleanup lifecycle; storage quotas.
12. **Phase 11 — Async / Webhook / Worker.** Tenant-aware queue (tech = separate decision;
    Postgres-backed acceptable) + independent worker service; jobs carry tenant context;
    multi-instance safety (leader election); dead-letter visibility; pollers → queue relay.
    **Requires D1 (ACR) and D8 (worker topology + staging).**
13. **Phase 12 — Storefront Tenantization.** Shared engine renders any store from context +
    config + data; store-namespaced query keys; config-driven branding + homepage; store
    legal pages; store-aware SEO. *(Frontend groundwork can start earlier.)*
14. **Phase 13 — Legal / Acceptance Infrastructure.** Two-layer versioned documents;
    hash-anchored immutable acceptance; clickwrap + Enterprise e-sign; consent ≠ acceptance;
    audited privacy/deletion workflows. *(Model + admin surfaces can overlap 9–12.)*
15. **Phase 14 — Observability / Backup / Recovery.** Complete + **prove** the capabilities
    accreted since Phase 3: alerting, per-tenant visibility, readiness checks; **perform and
    document a real backup restore**; DR drill runbook; controlled tenant deletion; Staging
    in use. *(The restore drill lands during Phases 1–3, before Phase 4's destructive
    waves.)*
16. **Phase 15 — Final Security / Isolation / Launch Verification.** Consolidate + gap-fill
    every test suite; run the §19 checklist to a verdict; wave W9 (legacy-assumption
    removal); staging full-restore production-migration dry-run; execute the production
    migration; enforce CI isolation/security gates; production smoke; supersede
    `BLUEPRINT-v1.2` (D1). **Launch.**

**Cross-cutting, every phase:** update `docs/ops/*` and `docs/saas/*` as code lands; re-run
the Phase 0 inventory diff at each phase start (R20); never flip an isolation flag without
paired tests (R15); never run a destructive migration without a verified restore-tested
backup and a written rollback (R11); keep every existing test suite green.

---

*End of PrintForge SaaS Implementation Master Plan v1.0.*

