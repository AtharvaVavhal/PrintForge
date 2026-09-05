# PrintForge SaaS — Phase 0 Decision Resolution & Phase 1 Specification

> **Mode:** READ-ONLY analysis + documentation. No source code, Prisma schema, migration,
> seed, environment file, or dependency was changed by the task that produced this document.
> **Phase 1 has not been implemented.**
>
> **Authoritative inputs (not modified, not redesigned):**
> `PRINTFORGE-SAAS-ARCHITECTURE-v1.0` (FROZEN);
> `docs/saas/PRINTFORGE-SAAS-IMPLEMENTATION-MASTER-PLAN-v1.0.md` (APPROVED);
> `docs/saas/PHASE-0-REPOSITORY-INVENTORY.md` (APPROVED).

---

## Document Control

| Field | Value |
|---|---|
| Document | PrintForge SaaS — Phase 0 Decision Resolution & Phase 1 Specification |
| Version | 1.0 |
| Status | COMPLETE (analysis + spec only — no code) · **Phase 1 START GATE = BLOCKED** |
| Date | 2026-09-05 |
| Repository | `AtharvaVavhal/PrintForge`, branch `main`, HEAD `b20c849` |
| Decisions reviewed | 15 (D1–D15, canonical IDs from the Phase 0 report §19) |
| RESOLVED | 1 |
| REQUIRES BUSINESS DECISION | 4 |
| REQUIRES LEGAL DECISION | 1 |
| REQUIRES PROVIDER DECISION | 1 |
| REQUIRES DATA ACCESS | 1 |
| SAFE TO DEFER | 7 |
| Phase 1 hard blockers | **3** — D1 (ACR to permit any schema addition), D3 (initial-tenant framing), D5 (customer-identity model) |
| Phase 1 readiness | **BLOCKED** — pending D1, D3, D5, explicit spec approval, and explicit approval of the lifecycle-enum sets |

### Decision-ID mapping (this task's "Foundational Decisions" section → canonical Phase 0 IDs)

The task narrative labels three foundational decisions "D1", "D2", "D5". Two match the Phase 0
report's canonical numbering; one does not. This document uses the **canonical Phase 0 §19
IDs** throughout and maps as follows:

| Task narrative label | Canonical ID (Phase 0 §19) | Topic |
|---|---|---|
| "D1 — Initial Tenant / Store Ownership" | **D3** | Does the existing store/catalog become Tenant #1, or is the deployment discarded? |
| "D2 — Production Data Access" | **D2** (≡ Phase 0 `P0-D14`) | Does the deployed database hold real merchant/customer data? |
| "D5 — Customer Identity Model" | **D5** (≡ Phase 0 `P0-D15`) | Store-scoped `Customer` entity vs global `User` + `Customer` profile |

*(Phase 0 §19 also carries `P0-D14`/`P0-D15` as traceability aliases for the Master Plan's
`D2`/`D5`. They are the same two decisions, not additional ones.)*

---

## Part A — Decision Resolution

### A.0 How classification was applied

`RESOLVED` is used **only** when the approved Master Plan **and** the approved Phase 0 report
converge on the same answer, nothing in the repository contradicts it, and the decision does
not gate Phase 1. Everything else names the input still required. **No decision was silently
resolved.** Recommendations quoted are the Master Plan's own non-binding proposals, restated
for context.

---

### A.1 Full Decision Register (D1–D15)

---

#### D1 — Formally supersede `BLUEPRINT-v1.2` (lift its prohibited-technology list) via the repo's ACR process

| Field | Content |
|---|---|
| **Decision** | Raise and sign one Architecture Change Request declaring that **PrintForge SaaS Architecture v1.0 supersedes `docs/architecture/BLUEPRINT-v1.2.md` in full**, so that (a) SaaS models may be added to `schema.prisma`, and (b) the SaaS async/worker tier is sanctioned. |
| **Why it matters** | `schema.prisma` line 4–5: *"Do not add tables/fields beyond what §15 specifies without an Architecture Change Request."* `BLUEPRINT-v1.2.md §38`: any change to §15 (the schema) requires a **joint Atharva+Harshad ACR** stating sections affected, problem, proposed change, why it doesn't violate the §2 prohibited-tech list, and schema/API-contract impact. `BLUEPRINT-v1.2.md §2` **permanently prohibits** Redis / Kafka / RabbitMQ / Bull/BullMQ / background-queue infrastructure / additional databases "absent a formal Architecture Change Request." **Two frozen documents currently disagree.** |
| **Current repository evidence** | `backend/prisma/schema.prisma:1-5`; `docs/architecture/BLUEPRINT-v1.2.md §2`, §38; `docs/architecture/ARCHITECTURE-FREEZE.md`; precedent that the ACR process is real and used: `docs/architecture/PHASE-10-PROPOSAL.md` (added Reviews + Coupons after the original freeze). |
| **Current known state** | Unresolved. No ACR exists. The SaaS Architecture v1.0 is frozen and approved, but the repo's *own* governance clause has not been formally reconciled with it. |
| **Impact on Phase 1** | **HARD BLOCKER.** Phase 1's entire deliverable is *"add `Tenant`, `Store`, `StoreDomain`, `TenantMembership`, `Plan` shell, `Subscription` shell to the schema."* Every one of those is a §15 addition and is explicitly forbidden without the ACR. Phase 1 cannot write a single `model` block until D1 is signed. |
| **Impact on Phase 2** | Same governance umbrella (identity model changes touch §15 + §6). |
| **Impact on Phase 3** | Same (context/authorization changes touch §16/§23). |
| **Impact on Phase 4** | Same, and specifically the destructive constraint waves need the ACR's "schema/API-contract impact" section to be on record. |
| **Classification** | **REQUIRES BUSINESS DECISION** *(project-owner / architecture-owner governance action — the joint review named in `BLUEPRINT-v1.2 §38`)* |
| **Recommended next action** | Draft one ACR: *"SaaS Architecture v1.0 supersedes BLUEPRINT-v1.2 in full; BLUEPRINT-v1.2 retained as historical."* It must explicitly (per §38): name §2, §6, §10–17, §20–25, §30–31, §34 as affected; state the problem (single-tenant → multi-tenant SaaS); reference the approved SaaS Architecture v1.0 and Master Plan as the replacement; address §2 (the queue tier — note a Postgres-backed queue avoids all named prohibited tech, see D15); and note the schema grows from 25 models to ~50. Joint sign-off, then update `schema.prisma`'s header comment and `ARCHITECTURE-FREEZE.md` in the Phase 1 PR. |

---

#### D2 — Does the deployed database hold real merchant/customer production data? *(≡ Phase 0 `P0-D14`)*

| Field | Content |
|---|---|
| **Decision** | Confirm, in writing from whoever holds Render access, whether the live PostgreSQL instance contains **real merchant/customer data** or only test/demo/QA-fixture data. |
| **Why it matters** | Determines whether Phase 4 is a true production data migration (verified restore, maintenance window, pre/post reconciliation of order counts and revenue sums, all P0 gates) or a clean bootstrap (discard + start tenants empty). It also determines whether D3's "existing store → Tenant #1" is a migration or a naming choice. |
| **Current repository evidence** | `backend/prisma/seed-production.ts` hard-codes `SEED_API_BASE_URL = 'https://printforge-8c9m.onrender.com/api/v1'` → a deployed Render backend + Render PostgreSQL exist. `backend/prisma/seed-storefront-preview.ts` header (written against a read-only audit of the *dev* DB): *"8 categories and 9 products … almost entirely QA/smoke-test fixtures … only 1 category is active with 1 product."* `backend/prisma/seed.ts` is a **stub**. `Readme.md` "Project Status": deployed with **Razorpay test-mode**, real live payment smoke test / production keys / DNS cutover all **outstanding** → **not a launched product**. **No production DB credentials in any tracked file.** |
| **Current known state** | **UNKNOWN from the repository.** See §A.2 (D2 deep-dive) for the AVAILABLE / UNAVAILABLE / REQUIRES AUTHORIZED ACCESS finding. |
| **Impact on Phase 1** | **None directly** — Phase 1 is additive-only and touches no existing row. It is, however, strongly advisable to have the answer before Phase 1 so the whole roadmap can be sequenced (a "no real data" answer collapses several Phase 4 gates). |
| **Impact on Phase 2** | Determines whether the `role=CUSTOMER` → `Customer` backfill (if D5 = separate entity) is a real migration or a no-op. |
| **Impact on Phase 3** | Minimal. |
| **Impact on Phase 4** | **HARD BLOCKER.** The entire migration strategy (Master Plan §25 waves W3–W7), the backfill scripts, the maintenance window, and the restore-drill precondition all depend on this. |
| **Classification** | **REQUIRES DATA ACCESS** |
| **Recommended next action** | Ops confirms in writing. If access is granted: run a **read-only** inventory against a **restored copy or read replica — never production directly** (row counts per table, `min`/`max(createdAt)`, distinct `role` values + counts, distinct `AppSetting.key` values, orphan / dangling-FK checks, count of `role=ADMIN` users). Attach the result to a new `docs/saas/DATA-INVENTORY.md`. Do **not** connect to production. Do **not** expose the connection string. |

---

#### D3 — Does the existing store/catalog become **Tenant #1**, or is the deployment discarded? *(task narrative "D1")*

| Field | Content |
|---|---|
| **Decision** | Choose one: **(a)** the existing catalog + admin user + settings become the platform's first real merchant, modelled as an explicitly-named ordinary `Tenant` (e.g. *"ForgeBuilds Demo Store"*); or **(b)** the current deployment is treated as disposable dev/demo scaffolding and tenants are created empty from Phase 5 onward. |
| **Why it matters** | Phase 1 includes *"a dev seed can bootstrap Tenant #1 + primary store + OWNER membership + Free subscription"* (Master Plan Phase 1 acceptance criterion). The **framing** of that seed, the `Store.slug`, the `Store.isPrimary` semantics, and whether Phase 4 has a backfill target at all, all follow from this. The Phase 0 report (§7.5, §15.4) explicitly did **not** invent a default tenant. |
| **Current repository evidence** | No `Tenant`/`Store`/merchant entity exists (`schema.prisma`). "The store" is an implicit singleton = the `storeName`/`storeAdminName` settings + one global catalog + one `role=ADMIN` user (promoted by manual `UPDATE users SET role='ADMIN'`, `DEPLOYMENT.md §8`). Existing e2e coverage (`backend/test/e2e/`, 15 specs) all assumes this singleton. |
| **Current known state** | Unresolved. The Master Plan's non-binding recommendation: *"Treat the existing catalog + admin as Tenant #1 … do not call it `default_tenant` or give it implicit privileges."* Its correctness depends on D2 (is there real data to preserve?). |
| **Impact on Phase 1** | **BLOCKER (soft).** The new-model shapes are the same either way, but the Phase 1 **seed / test fixture** that bootstraps a tenant, and the doc framing ("Tenant #1" vs "any tenant"), cannot be finalized. Choosing (b) also means Phase 1's seed is purely synthetic (no "existing store" concept). |
| **Impact on Phase 2** | Determines whether the existing `role=ADMIN` user is migrated to `OWNER` of Tenant #1, or whether merchant `User`s are created fresh. |
| **Impact on Phase 3** | Minimal — context resolution works the same for any tenant. |
| **Impact on Phase 4** | **BLOCKER.** (a) = every existing catalog/order/settings row is backfilled to Tenant #1's id; (b) = existing rows are dropped/ignored and Phase 4 is a much smaller migration. |
| **Classification** | **REQUIRES BUSINESS DECISION** |
| **Recommended next action** | Business + architecture owner decide (a) or (b). If (a): pick the tenant's real display name and slug now (not `default_tenant`, not `tenant-1`); record that it receives **no** implicit privileges — it is an ordinary tenant with an ordinary `Free`/`ACTIVE` subscription. Decision recorded in `docs/saas/DECISIONS.md`. Depends on D2 for the "is there data to preserve" input. |

---

#### D4 — Tenant-isolation enforcement mechanism: app-layer scoped Prisma access, Postgres RLS, or both

| Field | Content |
|---|---|
| **Decision** | Which mechanism(s) enforce that Tenant A can never read/write Tenant B's rows: (a) an app-layer `TenantPrisma` wrapper / Prisma Client Extension injecting `where: { tenantId }`; (b) Postgres Row-Level Security; (c) **both**. |
| **Why it matters** | Determines what Phase 3 builds and the shape of Phase 4's constraints. Frozen invariant 3: *"cross-tenant access is prohibited at the data-model level, not just by convention."* |
| **Current repository evidence** | `backend/src/common/database/prisma.service.ts` = `PrismaService extends PrismaClient` with **no** extension, middleware, or RLS. Every domain service injects it directly and writes its own `where` clauses. No seam exists today. |
| **Current known state** | The Master Plan §4.4-D4 recommends **"both"** (app-layer as the enforced, testable path; RLS + composite FKs as defence-in-depth). The Phase 0 report §19 restates the same. **No contradiction anywhere.** Nothing in Phase 1 touches enforcement. |
| **Impact on Phase 1** | **None.** Phase 1 introduces the `Tenant`/`Store` roots but adds **no** scoping to any query and **no** guard/middleware. |
| **Impact on Phase 2** | Minimal (identity split is orthogonal). |
| **Impact on Phase 3** | **This is the Phase 3 gate** — Phase 3 designs `TenantContext` + the scoped data-access path around this choice. |
| **Impact on Phase 4** | Composite FK + RLS-policy work in waves W6/W7 depends on "both" vs "app-only". |
| **Classification** | **RESOLVED** — adopt **(c) both**: app-layer scoped data access as the primary *enforced* path (explicit, unit-testable, the thing negative e2e tests assert against); Postgres RLS + composite same-store FKs as defence-in-depth. Per the approved Master Plan §4.4-D4 and approved Phase 0 §19, with no dissent, and not a Phase 1 dependency. |
| **Recommended next action** | Architecture owner counter-signs this resolution in `docs/saas/DECISIONS.md`. Detailed design of the `TenantPrisma` seam is Phase 3 work, not Phase 1. |

---

#### D5 — Customer identity model: store-scoped `Customer` entity vs global `User` + per-store `Customer` profile *(task narrative "D5")*

| Field | Content |
|---|---|
| **Decision** | The frozen architecture states *customer identity is **store-scoped**.* Choose: **(a)** a separate `Customer` entity keyed by `(storeId, email)` with its own auth (password hash, sessions), leaving `User` as **platform/merchant identity only**; or **(b)** keep one global `User` and attach a per-store `Customer` profile/link record for storefront-scoped data. |
| **Why it matters** | Every storefront shopper is currently a `User` row (`role=CUSTOMER`, the default on `POST /auth/register`) sharing the identity/login table with the single operator. The choice determines whether Phase 4 re-points **six FK families** to a new `customerId` and whether merchant auth (privileged, MFA-eligible) is physically separate from shopper auth. |
| **Current repository evidence (inspected)** | **`User` model** (`schema.prisma:91-127`): `id`, `email @unique` (global, lowercased), `passwordHash`, `role Role @default(CUSTOMER)`, `tokenVersion`, `failedLoginAttempts`, password-reset fields, one **embedded shipping address** (`addressLine1..country`, `phone`), `isActive`. **Customer-owned data via `userId` FKs:** `orders.userId` (RESTRICT), `carts.userId` (unique, RESTRICT), `reviews.userId` (RESTRICT), `coupon_usages.userId` (RESTRICT), `idempotency_keys.userId` (RESTRICT), `uploaded_files.uploadedByUserId` (RESTRICT), `order_status_history.changedByUserId` (SET NULL). **Auth flows** (`src/auth/auth.controller.ts`, `auth.service.ts`): `register` (always `CUSTOMER`, email+password only — no name, no org, no store), `login`, `refresh` (opaque cookie), `logout`, `logout-all`, password-reset request/confirm — **one identity domain, no store/tenant selection anywhere**. **Profile/account** (`src/users/users.service.ts`, `GET/PATCH /users/me`): ownership implicit from JWT, address fields on `User`, `toProfileView` returns `role`. **Customer-specific IDs:** none — a "customer" is just `User.id` with `role=CUSTOMER`. **`grep` for `customerId` / `model Customer` across `backend/`: zero hits.** **Admin "customer" views** (`AdminService.listCustomers` / `getCustomerDetail`) already filter `where: { role: CUSTOMER }` — a de-facto "this User is acting as a customer" partition, but not an entity. |
| **Current known state** | Unresolved. Master Plan §4.4-D5 recommends **(a)** — *"separate `Customer` per store … `User` becomes platform/merchant identity only … the larger refactor but matches the frozen model and keeps merchant auth cleanly separate from shopper auth."* |
| **Can the existing model be evolved safely?** | **Yes, incrementally** — but the direction must be fixed *before* Phase 1 defines how `User` relates to `TenantMembership`. Option (a) is expand-migrate-contract: Phase 2 adds a `Customer` table + `customerId` (nullable) alongside every `userId`; Phase 4 backfills `role=CUSTOMER` users → `Customer` rows under Tenant #1's store and re-points the FKs; the legacy `userId` columns and `role` enum value are dropped only in Phase 15's W9. **No new identity *architecture* is introduced** — it is the frozen model's own `User` + store-scoped `Customer`, applied to the existing tables. |
| **Impact on Phase 1** | **BLOCKER (design-level).** Phase 1 defines `TenantMembership(userId → User, tenantId → Tenant)`. Under (a), `User` is *merchant/platform identity* and a storefront shopper will **never** have a `TenantMembership` — the Phase 1 model and its doc comments must say so, and must anticipate a future `Customer` table (so the ownership model isn't retrofitted). Under (b), the `User`↔membership relationship carries a different meaning. Phase 1 adds no `Customer` table itself (that's Phase 2), but it must not model `User` in a way that (a) later has to unwind. |
| **Impact on Phase 2** | **Defining.** (a) = Phase 2 adds `Customer` + `CustomerRefreshToken` + separate auth flow + token audiences. (b) = Phase 2 adds a thin `Customer` profile/link only. |
| **Impact on Phase 3** | Storefront tenant context resolves a `Customer` (store-scoped) vs a `User` (membership-scoped) — different guard, different session. |
| **Impact on Phase 4** | **Large.** (a) re-points `orders/carts/reviews/coupon_usages/idempotency_keys/uploaded_files` from `userId` to `customerId`; pre/post reconciliation = "migrated shopper count == `Customer` count." |
| **Classification** | **REQUIRES BUSINESS DECISION** *(product / identity architecture — "REQUIRES BUSINESS/PRODUCT DECISION" per the task)* |
| **Recommended next action** | Product + architecture owner choose (a) or (b) and record it. Recommendation: **(a)**, matching the frozen model. Phase 1 then models `User` explicitly as *platform/merchant identity*, `TenantMembership` as *merchant-only*, and its doc comments name the future `Customer` table as the storefront-identity root — without adding it yet. |

---

#### D6 — Tenant-context derivation for the merchant (tenant) admin console

| Field | Content |
|---|---|
| **Decision** | How the server derives *which tenant* an authenticated merchant `User` is acting on: subdomain (`{tenant}.admin.printforge.app`), path prefix, session-selected active tenant cross-checked against membership, or a validated header. |
| **Why it matters** | The refresh cookie is `Path=/api/v1/auth/refresh`, `Domain` **omitted** (`src/auth/auth.service.ts` `setRefreshCookie`). An admin subdomain without a shared registrable domain + explicit `Domain` breaks refresh. Frozen invariant 1: *client-supplied tenantId is never an authorization boundary.* |
| **Current repository evidence** | Single-origin axios client (`frontend/src/services/api/client.ts`); `AdminRoute.tsx` binary `role === 'ADMIN'`; cookie config in `auth.service.ts`. |
| **Current known state** | Master Plan §4.4-D6 recommends: host/subdomain resolves a *candidate* tenant, **always** re-checked against an active `TenantMembership`; multi-membership users get a server-issued tenant switcher. Never a raw client value. |
| **Impact on Phase 1** | **None.** Phase 1 has no request-path enforcement and no admin UI. |
| **Impact on Phase 2** | Token payload may carry an "active tenant" claim — influences the Phase 2 token shape. |
| **Impact on Phase 3** | **This is the Phase 3 gate.** |
| **Impact on Phase 4** | None. |
| **Classification** | **SAFE TO DEFER** *(to Phase 3; needs an architecture-owner + product decision before Phase 3 starts, not before Phase 1)* |
| **Recommended next action** | Note it in `docs/saas/DECISIONS.md` as "OPEN — required before Phase 3". |

---

#### D7 — `WebhookEvent` split: one table with a `scope` discriminator vs two tables

| Field | Content |
|---|---|
| **Decision** | Keep one `WebhookEvent` table (add `scope` + nullable `tenantId`/`paymentAccountId`) or split into `CommerceWebhookEvent` (tenant-scoped) + `BillingWebhookEvent` (platform-scoped). |
| **Why it matters** | Different verification secrets, processors, audit domains; frozen invariant 6 (SaaS billing ≠ commerce). |
| **Current repository evidence** | One `WebhookEvent` table (`schema.prisma:609`), Razorpay-only, one `RAZORPAY_WEBHOOK_SECRET`, two-phase processor (`src/payments/webhooks/webhook-processor.service.ts`). |
| **Current known state** | Master Plan §4.4-D7 recommends **two tables**. |
| **Impact on Phase 1 / 2 / 3** | **None.** |
| **Impact on Phase 4** | Minor — Phase 4 adds `tenantId` to the commerce webhook path regardless. |
| **Classification** | **SAFE TO DEFER** *(to Phase 7/8)* |
| **Recommended next action** | Record as OPEN — required before Phase 7. |

---

#### D8 — Hosting / topology: stay on Render (+ worker service + staging + ≥2 API instances) or migrate

| Field | Content |
|---|---|
| **Decision** | Add a dedicated worker service, a `staging` environment, and horizontal backend scaling on Render — or migrate hosting. Frozen §17 requires stateless backend + independently scalable workers + 3 environments. |
| **Why it matters** | Today: one Render instance, **no staging** (`DEPLOYMENT.md`). The full Phase 4 migration sequence must be dry-run on a **staging full-restore of production** before it touches production (Master Plan §25), and the Phase 14 restore drill (a Phase 4 precondition) needs somewhere to run. Lead time on provisioning. |
| **Current repository evidence** | `DEPLOYMENT.md`: "Render … one instance", "No staging environment", "No containers, no IaC manifests". `scheduler-registration.spec.ts` pins one `ScheduleModule.forRoot()`. |
| **Current known state** | Master Plan §4.4-D8 recommends: stay on Render, promote to ≥2 instances, add a worker service + staging. "Not an architecture change." |
| **Impact on Phase 1** | **None technically** — but staging should be **provisioned during Phase 1–3** because it gates Phase 4. |
| **Impact on Phase 2 / 3** | None. |
| **Impact on Phase 4** | **Indirect blocker** — no staging = nowhere to dry-run the migration; no restore drill = destructive waves (W7) cannot proceed (Master Plan Principle #5, R11). |
| **Classification** | **REQUIRES BUSINESS DECISION** *(ops / budget — spend + provisioning)* |
| **Recommended next action** | Ops decides and **begins provisioning staging now** (parallel with Phase 1–3) so it is ready before Phase 4. Worker service can wait until Phase 11. |

---

#### D9 — Merchant Razorpay credential storage (KMS-wrapped column vs external secrets manager)

| Field | Content |
|---|---|
| **Decision** | How per-tenant Razorpay credentials are stored on `PaymentAccount`: envelope-encrypted blob (data key from managed KMS) vs external secrets-manager reference. |
| **Why it matters** | Frozen invariant 9 — credentials server-side, never to client or job payload. |
| **Current repository evidence** | Today: `RAZORPAY_KEY_ID/KEY_SECRET/WEBHOOK_SECRET` from `process.env` only (`src/common/config/configuration.ts`, `RazorpayService.onModuleInit`). One account. |
| **Current known state** | Master Plan §4.4-D9 recommends the envelope-encrypted blob. |
| **Impact on Phase 1 / 2 / 3 / 4** | **None** — `PaymentAccount` is a Phase 8 model. |
| **Classification** | **SAFE TO DEFER** *(to Phase 8 — pure implementation choice)* |
| **Recommended next action** | Record as OPEN — Phase 8. |

---

#### D10 — Per-tenant order/invoice numbering scheme

| Field | Content |
|---|---|
| **Decision** | Replace the two global counters (`order_number_counter` → `PF-000001`, `invoice_number_counter` → `INV-000001`) with per-tenant counters + per-tenant/store configurable prefix, and confirm the **statutory** invoice-number format per merchant jurisdiction. |
| **Why it matters** | Frozen: invoices are immutable statutory documents. `invoice.numberPrefix` is marked *"PENDING CLIENT CONFIRMATION"* in `app-setting.constants.ts`; a mis-scoped `sellerSnapshot` = invoices labelled with the wrong legal entity. GST invoice numbering (financial-year series, gap-free, etc.) has legal constraints. |
| **Current repository evidence** | `src/orders/orders.service.ts` `generateOrderNumber` (global atomic `INSERT … ON CONFLICT DO UPDATE … RETURNING` against `app_settings`); `src/invoices/invoice-number.service.ts` `allocate` (same pattern, separate key); `Invoice.invoiceNumber @unique` global; `sellerSnapshot` from global `invoice.seller*` settings; `app-setting.constants.ts` normalizers + "PENDING CLIENT CONFIRMATION" notes. |
| **Current known state** | Unresolved. Master Plan §4.4-D10: per-tenant counters + configurable prefix; **REQUIRES QUALIFIED LEGAL REVIEW** for GST invoices. |
| **Impact on Phase 1 / 2 / 3** | **None** — the counters stay global until Phase 4. |
| **Impact on Phase 4** | **BLOCKER for the settings/counter wave (W4).** Per-tenant counters must be initialized in-migration from `MAX(existing number)+1`; the format must be legally confirmed before invoices are re-issued under it. |
| **Classification** | **REQUIRES LEGAL DECISION** *(statutory GST invoice-numbering format — qualified legal review; the technical shape "per-tenant counter + prefix" is straightforward)* |
| **Recommended next action** | Engage qualified legal review on GST invoice-numbering requirements per target jurisdiction before Phase 4's W4. Record as OPEN — Phase 4. Not a Phase 1 dependency. |

---

#### D11 — Which `AppSetting` keys are platform- vs tenant- vs store-owned

| Field | Content |
|---|---|
| **Decision** | Classify each of the 17 `AppSetting` keys (Phase 0 §12) as tenant-setting, store-setting, or per-tenant counter; confirm no key needs to stay platform-global. |
| **Why it matters** | The settings migration touches checkout (`shippingFeeFlat`), tax (`tax.*`), invoicing (`invoice.*`), and homepage rendering (`hero_slides`/`banners`/`showcase_categories`) simultaneously. |
| **Current repository evidence** | Phase 0 §12 inventories all 17 keys + read/write surfaces. `PUBLIC_SETTING_KEYS` and `ADMIN_SETTING_DEFINITIONS` in `src/app-setting/app-setting.constants.ts`; the two internal counters used by `OrdersService`/`InvoiceNumberService`. |
| **Current known state** | Phase 0 §12.4 proposes a full mapping (all business keys → tenant/store; both counters → per-tenant; no platform-global business key). No contradiction. |
| **Impact on Phase 1 / 2 / 3** | **None** — `AppSetting` is untouched until Phase 4. |
| **Impact on Phase 4** | **BLOCKER for W4** — the backfill needs the per-key mapping. |
| **Classification** | **SAFE TO DEFER** *(to Phase 4; the Phase 0 §12.4 proposal is a strong working default requiring only architecture-owner ratification)* |
| **Recommended next action** | Architecture owner ratifies the Phase 0 §12.4 mapping before Phase 4's W4. Record as OPEN — Phase 4. |

---

#### D12 — Per-tenant tax model: keep India-GST for v1, or generalize the tax engine

| Field | Content |
|---|---|
| **Decision** | Keep the existing India-GST inclusive engine (config moved global → per-store) for v1, or build a pluggable multi-regime tax engine now. |
| **Why it matters** | The platform is "general-purpose e-commerce" but the tax engine (`src/checkout/tax/tax.service.ts`) is India-GST inclusive only; `EXCLUSIVE` is code-complete but admin-locked (`app-setting.constants.ts` `ADMIN_SETTABLE_TAX_MODES = ['INCLUSIVE']`). |
| **Current repository evidence** | `tax.service.ts`; `Order` tax-snapshot columns (`taxMode`, `taxableAmount`, `taxAmount`, `taxRateSnapshot`, `taxBreakdown`); `app-setting.constants.ts` tax normalizers + `EXCLUSIVE`-locked note. |
| **Current known state** | Master Plan §4.4-D12: keep India-GST per-tenant for v1; design `TaxConfig` as a per-store strategy so other regimes are additive later. Not frozen. |
| **Impact on Phase 1–4** | **None** — tax config moves in Phase 4 W4 (part of D11); the engine itself is Phase 12. |
| **Classification** | **SAFE TO DEFER** *(to Phase 12)* |
| **Recommended next action** | Record as OPEN — Phase 12. |

---

#### D13 — Object storage: keep Cloudinary behind a `StorageProvider` interface, or introduce S3 now

| Field | Content |
|---|---|
| **Decision** | Wrap the existing `CloudinaryService` in a `StorageProvider` interface (Cloudinary as first adapter) vs migrate to S3-compatible storage. |
| **Why it matters** | Frozen §14 wants a storage abstraction, not a fixed vendor. |
| **Current repository evidence** | `src/uploads/cloudinary/cloudinary.service.ts` is the only storage impl; folder scheme + `deliveryType` (`upload`/`authenticated`) are Cloudinary-specific; signed URL is **not time-boxed** (needs Cloudinary `auth_token`, an account-level feature not in the current env vars). |
| **Current known state** | Master Plan §4.4-D13: keep Cloudinary, introduce the interface. |
| **Impact on Phase 1–4** | **None** — asset work is Phase 10. |
| **Classification** | **SAFE TO DEFER** *(to Phase 10)* |
| **Recommended next action** | Record as OPEN — Phase 10. |

---

#### D14 — SaaS subscription billing provider

| Field | Content |
|---|---|
| **Decision** | Which billing provider (and its webhook payload contract) backs SaaS subscriptions in Phase 7. |
| **Why it matters** | Phase 7 needs a concrete `BillingProvider` adapter + webhook verification. |
| **Current repository evidence** | No billing code exists. Commerce payments use Razorpay (`src/payments/razorpay/`); frozen architecture keeps SaaS billing **physically separate** from commerce (invariant 6). |
| **Current known state** | Master Plan §7 explicitly: *"Do NOT select Stripe/Paddle/etc. as a frozen technology. Billing provider selection = implementation/vendor decision."* |
| **Impact on Phase 1** | **None** — Phase 1 adds a `Subscription` **shell** (id, tenantId, planId, status, period fields) with no provider coupling. |
| **Impact on Phase 2 / 3** | None. |
| **Impact on Phase 4** | None. |
| **Classification** | **REQUIRES PROVIDER DECISION** *(to be made before Phase 7 — a `FakeBillingProvider` covers Phases 1–6)* |
| **Recommended next action** | Record as OPEN — Phase 7. Build against a `BillingProvider` interface + fake until then. |

---

#### D15 — Queue technology for the async/worker tier

| Field | Content |
|---|---|
| **Decision** | What substrate backs the Phase 11 worker tier: a Postgres-backed queue table (extends the existing outbox pattern) vs an external broker. |
| **Why it matters** | Frozen §15 requires *business event → outbox → queue → worker*; `BLUEPRINT-v1.2 §2` **prohibits** Redis/Bull/BullMQ/"background queue infrastructure" absent an ACR (see D1). |
| **Current repository evidence** | 3 in-process `@nestjs/schedule` crons; a working Postgres outbox (`src/notifications/outbox/`) using `FOR UPDATE SKIP LOCKED` + bounded retry + dead-letter — already the pattern a queue relay would extend. |
| **Current known state** | Master Plan §11: *"Do NOT select Redis/BullMQ/etc. as an architecture requirement. Technology selection remains an implementation decision."* A Postgres-backed queue is architecture-compatible **and** avoids every §2-prohibited technology. |
| **Impact on Phase 1–4** | **None** — the worker tier is Phase 11. |
| **Classification** | **SAFE TO DEFER** *(to Phase 11; governed by D1's ACR)* |
| **Recommended next action** | Record as OPEN — Phase 11. Default to a Postgres-backed queue unless Phase 11 load analysis shows it insufficient. |

---

### A.2 Foundational Decision Deep-Dives

#### D3 deep-dive — Initial Tenant / Store Ownership: what the frozen architecture requires, and what evidence is needed

**What the frozen architecture requires** for the existing single-tenant app to become the
initial SaaS tenant (Master Plan §4.2, frozen §4/§5/§10/§11):

1. There is **no privileged "default tenant"** concept. The initial tenant is an **ordinary
   `Tenant`** with an ordinary `Subscription` (`Free`/`ACTIVE`) and an ordinary primary
   `Store`. It gets **no** implicit cross-tenant access, no special-casing in code, no
   reserved id.
2. **One primary `Store` per `Tenant`** is the v1 baseline; `Store` is nonetheless a
   first-class table with its own id from day one (multi-store is future-compatible).
3. The initial **`Owner`** is a real `User` with an `OWNER` `TenantMembership` — not a role
   flag on `User`.
4. Every existing tenant-owned row must acquire an **enforced ownership path** to that
   `Tenant` (Phase 4), via `tenantId`/`storeId` columns + composite FKs.

**Evidence required to establish each element** (and its current availability):

| Element | Evidence required | Where it comes from | Available now? |
|---|---|---|---|
| **Initial `Tenant`** | A business decision that the existing deployment *is* a merchant (D3(a)); a chosen display name + slug | Business + architecture owner | **No** — decision pending |
| **Initial `Store`** | The chosen store name/slug (may reuse `storeName` setting = `"PrintForge"` today, or a new one); confirmation it is `isPrimary` | Business owner + `AppSetting.storeName` (`"PrintForge"` default) | Partial — a default name exists; the decision does not |
| **Initial `Owner`** | Which existing `User` row(s) have `role=ADMIN` in the **live** DB, and which one is *the* owner | **Live read-only inventory (D2)** — `SELECT id, email, createdAt FROM users WHERE role='ADMIN'` | **No** — requires D2 data access |
| **Existing merchant/admin user** | Count + identities of `role=ADMIN` users in the live DB (there may be seed admins, e.g. `catalog-seed-admin@printforge.internal` from `seed-production.ts`) | Live inventory (D2) | **No** |
| **Existing products** | Count, `isActive` distribution, whether they are real or QA fixtures | Live inventory (D2); `seed-storefront-preview.ts` says the *dev* DB is "8 categories, 9 products, almost all fixtures, 1 active product" | **Partial** (dev DB only, not authoritative for the deployed DB) |
| **Existing categories** | Count, `isActive`, tree shape (`parentCategoryId`) | Live inventory (D2) | **No** (deployed) / partial (dev) |
| **Existing customers** | Count of `role=CUSTOMER` users; how many have orders vs are empty registrations | Live inventory (D2) | **No** |
| **Existing carts** | Count of `carts` rows; whether any are non-empty | Live inventory (D2) | **No** |
| **Existing orders** | Count by `status`; `min`/`max(createdAt)`; revenue sum (for pre/post reconciliation) | Live inventory (D2) | **No** |
| **Existing coupons** | Count; `isActive`; any with `usedCount > 0` | Live inventory (D2) | **No** |
| **Existing reviews** | Count; `status` distribution | Live inventory (D2) | **No** |
| **Existing uploaded assets** | Count of `uploaded_files`; `deliveryType` split (`upload` vs `authenticated`); how many are order-referenced | Live inventory (D2) + Cloudinary account | **No** |
| **Existing payment records** | Count of `payment_attempts` by `status`; count of `CAPTURED`; count of `refunds` | Live inventory (D2) + Razorpay dashboard (test-mode today) | **No** |
| **Existing invoices** | Count; current `invoice_number_counter` value (to seed the per-tenant counter from `MAX+1`) | Live inventory (D2) | **No** |
| **Existing settings** | Which of the 17 `AppSetting` keys have a stored row (vs falling back to the definition default); current counter values | Live inventory (D2): `SELECT key, value FROM app_settings` | **No** |

**If production data is unavailable (current state):** the following **cannot yet be
verified** and are **explicitly deferred to the D2 data-access step**:

- the number and identity of `role=ADMIN` users (→ who becomes `OWNER`);
- whether any `role=CUSTOMER` user has real orders (→ is Phase 4 a real customer migration);
- order/revenue/invoice/payment counts (→ Phase 4 reconciliation baselines);
- current `AppSetting` rows and the two counter values (→ per-tenant counter seeding);
- whether the deployed catalog is real merchant content or QA fixtures (→ D3(a) vs D3(b)).

**No default tenant has been invented. No ownership has been assumed.**

---

#### D2 deep-dive — Production Data Access

**Finding: `REQUIRES AUTHORIZED ACCESS`.**

| Question | Answer (from the repository only) |
|---|---|
| Do production DB credentials / configuration exist in the repo? | **No tracked file contains a production `DATABASE_URL`.** `backend/.env.example` and `backend/.env.test` point at `localhost` / a local `printforge_test` database. `backend/src/common/config/configuration.ts` reads `DATABASE_URL` from the environment with an empty-string default. |
| Is there an untracked local `.env`? | **Yes** — `backend/.env` exists (1049 bytes) and is **git-ignored** (`backend/.gitignore`: `.env` + `.env.*` except `.env.example`; root `.gitignore`: `.env`). **It was NOT opened** — reading it risks exposing secrets, and the task forbids that. Whether it holds a production or a local connection string is therefore **unverified**. |
| Which environment does the *repository* point to? | The **tracked** configuration points only at **local/localhost**. `seed-production.ts` hard-codes a deployed **API** base URL (`https://printforge-8c9m.onrender.com/api/v1`) but **no database connection string** — it writes catalog data through the HTTP API, and connects to Postgres directly only for the one-line admin-role promotion, using whatever `DATABASE_URL` the operator supplies on the command line. |
| Does repository configuration *reveal* the production DB? | **No.** No tracked file exposes the production host, database name, user, or password. |
| Can the deployed DB be safely inspected? | **Only by someone holding the Render PostgreSQL credentials, with explicit authorization, and only read-only against a restored copy or a read replica — never production directly.** Nothing in this task connected to any database. |
| Is a read-only production data inventory possible *from here*? | **No.** |

**Consequence for migration planning:**

- **Phase 1–3 are unaffected** — they are additive-only and touch no existing row, so they
  are safe to plan and (once D1/D3/D5 clear) execute regardless of D2.
- **Phase 4 is blocked on D2.** Its backfill scripts, validation queries, maintenance window,
  and the pre/post reconciliation (order counts, revenue sums, `Customer` count) cannot be
  written without the live data shape. The Phase 14 restore drill (a Phase 4 precondition) is
  also gated on knowing what to restore.
- **D3 is informed by D2** — "is the deployed catalog real or fixtures" is a direct input to
  "does it become Tenant #1 or get discarded."

**Required next step:** ops confirms in writing whether the deployed DB holds real
merchant/customer data, then (if so) runs the read-only inventory described in D3 deep-dive
against a restored copy / replica and attaches it to `docs/saas/DATA-INVENTORY.md`. **Do not
connect to production. Do not modify production data. Do not commit or expose the connection
string.**

---

#### D5 deep-dive — Customer Identity Model

**What "customer identity is store-scoped" means for the existing model:**

The frozen architecture treats a shopper at Store A and a shopper at Store B as **distinct
identities**, even with the same email — a customer account, its cart, its orders, its
reviews, and its saved address belong to **one store**, not to the platform. The current repo
has the opposite: one global `User` per email, `role=CUSTOMER`, shared with the single
operator's identity table.

**Inspection results (all verified against the working tree):**

| Aspect | Current implementation | Store-scoping implication |
|---|---|---|
| `User` model | `schema.prisma:91` — global `email @unique`, `role`, embedded address, password hash, `tokenVersion` | The address + shopper-facing fields belong on a store-scoped `Customer`; `email` uniqueness becomes `(storeId, email)` for customers, stays global for merchant `User`s |
| Order ownership | `orders.userId` (RESTRICT) — `OrdersService.assertOwnedBy(order.userId !== userId)` | → `orders.customerId` + `orders.storeId`; ownership check becomes store + customer |
| Cart ownership | `carts.userId @unique` (RESTRICT) — one cart per identity | → `carts (storeId, customerId)` unique — one open cart per customer **per store** |
| Review ownership | `reviews (productId, userId)` unique; anchored to `orderItemId` of a `DELIVERED` order | → `(storeId, productId, customerId)`; anchor stays, scoped to same store |
| Coupon-usage ownership | `coupon_usages.userId`; per-user limit = `COUNT(*) WHERE couponId AND userId` | → `customerId`; per-customer limit within the store |
| Idempotency keys | `idempotency_keys.userId` cross-checked at lookup | → `customerId` (or keep `userId` — low risk; see D-note in Phase 0 §7.4) |
| Uploaded assets | `uploaded_files.uploadedByUserId` (non-nullable) | → nullable / `customerId`; asset gains `tenantId` + `visibility` + `kind` (Phase 10) |
| Auth flows | `POST /auth/register` (always `CUSTOMER`, email+password, **no store selector**), `login`, `refresh` (opaque cookie), `logout(-all)`, password reset — **one identity domain** | A store-scoped customer auth flow (register/login *within a store context*) is needed; merchant auth (`User`) stays separate and can gain stronger controls (MFA) |
| Profile / account | `GET/PATCH /users/me` — address fields on `User`, returns `role` | Becomes a store-scoped customer profile endpoint; merchant profile is separate |
| Customer-specific IDs | **None.** A "customer" is `User.id` with `role=CUSTOMER`. `grep customerId` / `grep 'model Customer'` across `backend/` = **0 hits** | A `Customer` entity with its own `id` is introduced in Phase 2 (not Phase 1) |
| Existing partition | `AdminService.listCustomers` / `getCustomerDetail` already filter `where: { role: CUSTOMER }` | A de-facto "acting as customer" partition already exists in code — evolvable, not a rewrite |

**Can the existing model be evolved safely? — Yes, without a new identity architecture.**

The frozen model *is* `User` (platform/merchant) + store-scoped `Customer`. Applying it to the
existing tables is standard expand→migrate→contract:

- **Phase 1 (this spec):** defines `User` explicitly as *platform/merchant identity* and
  `TenantMembership` as *merchant-only*. Adds **no** `Customer` table. Its doc comments name
  the future `Customer` table as the storefront-identity root so the ownership model is not
  retrofitted later.
- **Phase 2:** adds `Customer` (`(storeId, email)`) + a customer auth path + `customerId`
  (nullable) alongside every `userId` on tenant-owned tables.
- **Phase 4:** backfills `role=CUSTOMER` users → `Customer` rows under Tenant #1's primary
  store; re-points the FK families; reconciles counts.
- **Phase 15 (W9):** drops the legacy `userId` columns and the `CUSTOMER` enum value.

**Remaining ambiguity → `REQUIRES BUSINESS DECISION`:** whether to take option (a) separate
`Customer` entity (Master Plan recommendation, matches the frozen model) or (b) global `User`
+ thin `Customer` profile. This must be fixed **before Phase 1 finalizes how `User` relates to
`TenantMembership`**, because option (b) would let a storefront shopper theoretically hold a
membership, and option (a) forbids it.

---

### A.3 Blocking-Decisions Matrix

**Decision → Blocking Phase → Reason.** A decision "blocks" a phase if that phase's work
cannot correctly start (or would risk rework) without it.

| Decision | Blocks Phase | Reason |
|---|---|---|
| **D1** (ACR to supersede BLUEPRINT-v1.2) | **Phase 1** | `schema.prisma:4-5` + `BLUEPRINT-v1.2 §38` forbid adding **any** model to §15 without a joint ACR. Phase 1's whole deliverable is new models. Also umbrella-blocks Phases 2–15. |
| **D3** (existing store → Tenant #1?) | **Phase 1** (soft) + **Phase 4** (hard) | Phase 1's bootstrap seed / test fixture and doc framing depend on whether "Tenant #1" is a real migrated merchant or a synthetic example. Phase 4's backfill has a target only under D3(a). |
| **D5** (customer identity model) | **Phase 1** (design) + **Phase 2** (defining) + **Phase 4** (large) | Phase 1 must model `User` ↔ `TenantMembership` in a way that option (b) would not have to unwind; Phase 2 builds the `Customer` table + auth per this choice; Phase 4 re-points 6 FK families under option (a). |
| **D2** (real production data?) | **Phase 4** | Backfill scripts, validation queries, maintenance window, reconciliation baselines, restore-drill target all need the live data shape. Not a Phase 1–3 blocker (additive/non-enforcing work). |
| **D4** (isolation mechanism) | **Phase 3** | Phase 3 designs `TenantContext` + the scoped data-access path around app-layer vs RLS vs both. *Resolved as "both"; recorded for Phase 3.* |
| **D6** (tenant-context derivation) | **Phase 3** | Phase 3 implements server-derived context for the merchant console; subdomain vs switcher vs header must be chosen first. |
| **D8** (hosting / staging) | **Phase 4** (indirect) | Phase 4's staging full-restore dry-run and the Phase 14 restore drill (a Phase 4 precondition) need a staging environment. Provisioning has lead time → start during Phase 1–3. |
| **D10** (per-tenant numbering + statutory format) | **Phase 4** (W4) | Per-tenant counters seeded from `MAX+1`; legal format must be confirmed before invoices re-issue. |
| **D11** (AppSetting per-key classification) | **Phase 4** (W4) | The settings backfill needs the per-key mapping. |
| **D7** (WebhookEvent split) | **Phase 7 / 8** | Different secrets/processors/audit domains for commerce vs billing webhooks. |
| **D9** (credential storage) | **Phase 8** | `PaymentAccount` credential encryption mechanism. |
| **D12** (tax model) | **Phase 12** | Storefront tax engine generalization. |
| **D13** (storage provider) | **Phase 10** | `StorageProvider` interface / vendor. |
| **D14** (billing provider) | **Phase 7** | Concrete `BillingProvider` adapter + webhook contract. |
| **D15** (queue technology) | **Phase 11** | Worker-tier substrate (governed by D1's ACR). |

**Decisions that MUST be resolved before each phase:**

| Before… | Must be resolved |
|---|---|
| **Phase 1** | **D1, D3, D5** + explicit approval of this spec + explicit approval of the lifecycle-enum sets |
| **Phase 2** | D5 (already required for Phase 1); D3 |
| **Phase 3** | D4 *(resolved)*, D6 |
| **Phase 4** | D2, D3, D8 (staging ready), D10, D11 + a completed Phase 14 restore drill |

---

## Part B — Phase 1 Specification

# Phase 1 — Foundational Tenant / Store / Membership Specification

> **Documentation only.** This defines the *intended* Phase 1 scope. No schema, migration, or
> code is produced here. Phase 1 implementation may begin only after the START GATE (§B.8)
> clears.

## B.1 Phase 1 objective

Introduce the core isolation entities — **`Tenant`, `Store`, `StoreDomain`,
`TenantMembership`** — plus the platform-owned **`Plan`** and **`Subscription`** shells they
reference, as **additive, non-enforcing** schema. **No existing table is modified. No data is
scoped. No authorization behavior changes.** This establishes the ownership roots that
Phases 2–4 attach everything else to. (Frozen §4, §5, §10, §11; invariants 2, 11, 12.)

---

## B.2 Tenant

| Aspect | Specification |
|---|---|
| **Purpose** | The top-level isolation and billing boundary. Every tenant-owned row in the platform ultimately resolves to exactly one `Tenant`. A `Tenant` represents one merchant business on the shared platform. |
| **Ownership** | **TENANT-owned (it is the ownership root).** Managed by the Platform Control Plane (`SUPER_ADMIN`) for lifecycle; read by the tenant's own members. |
| **Relationships** | `1:N Store` (a tenant has ≥1 store; exactly one `isPrimary` in v1). `1:N TenantMembership` (a tenant has ≥1 member; ≥1 `OWNER`). `1:1 Subscription` (every tenant has exactly one primary subscription from creation, `Free`/`ACTIVE` by default). **No direct relationship to `User`** — that link is always through `TenantMembership`. |
| **Lifecycle considerations** | `status ∈ { ACTIVE, SUSPENDED, PENDING_DELETION, DELETED }` (proposed — **REQUIRES EXPLICIT APPROVAL**, §B.8). `SUSPENDED` = platform-initiated hold (e.g. non-payment) — data retained, access frozen (invariant 19: downgrade/cancel never destroys merchant data). `PENDING_DELETION` → `DELETED` is a controlled, audited, reversible-until-purge process (frozen §18) — **not implemented in Phase 1**, only the state exists. `createdAt`, `updatedAt`, `deletedAt?`. |
| **Security boundary** | A `Tenant.id` is **never** an authorization boundary on its own (invariant 1). It is only ever reached server-side via an authenticated `TenantMembership` (merchant console) or via Domain→Store→Tenant resolution (storefront). Phase 1 adds **no** guard — the entity exists but nothing enforces scoping yet. |
| **Keys / indexes (intent, not schema)** | `id` (uuid, PK). `slug` globally unique (URL-safe tenant handle). `@@index` on `status`. |

---

## B.3 Store

| Aspect | Specification |
|---|---|
| **Purpose** | One storefront belonging to a tenant — the unit the shared storefront engine renders. Catalog, cart, checkout, customers, reviews, and store settings are all store-scoped in the target model. |
| **Relationship to Tenant** | `N:1 Tenant` (`tenantId`, FK RESTRICT — a tenant is never hard-deleted while it owns a store). Every `Store` has exactly one owning `Tenant`. |
| **Initial v1 one-primary-store rule** | Exactly **one** `Store` per `Tenant` has `isPrimary = true`, enforced by a **partial unique index** `(tenantId) WHERE isPrimary`. Multiple stores per tenant is **future-compatible, not a v1 requirement** — `Store` is a first-class table with its own id from day one; `isPrimary` is a flag, not a schema shortcut. Every downstream ownership column added in Phase 4 carries **both** `tenantId` and `storeId`. |
| **Domain relationship** | `1:N StoreDomain`. A store has one canonical **primary** domain (`StoreDomain.isPrimary`) plus zero or more additional (custom) domains. Every store gets a platform-hosted URL by default (frozen §10). Verification and routing are **Phase 9** — Phase 1 adds only the model + states. |
| **Lifecycle considerations** | `status ∈ { ACTIVE, DISABLED, DRAFT }` (proposed — **REQUIRES EXPLICIT APPROVAL**). `DISABLED` (store-level) is distinct from `Tenant.SUSPENDED` and from `Subscription` status (frozen §12: "subscription status ≠ store status"). `createdAt`, `updatedAt`. |
| **Security boundary** | Store context is resolved **server-side on every storefront request** (Domain→Store→Tenant) — Phase 9. Phase 1 adds no resolver. A `Store.id` is never trusted from a client. |
| **Keys / indexes (intent)** | `id` (uuid, PK). `@@unique([tenantId, slug])`. Partial unique `(tenantId) WHERE isPrimary`. `@@index([tenantId])`. Branding/config kept as **typed columns or a keyed `StoreSetting`** table (mirroring the `app-setting.constants.ts` allowlist + typed-normalizer discipline) — **not** free-form JSON for anything pricing- or security-relevant. `StoreSetting` itself may be deferred to Phase 4/12; Phase 1 adds at most a minimal typed branding column set. |

---

## B.4 TenantMembership

| Aspect | Specification |
|---|---|
| **Purpose** | The join between a global `User` (merchant/platform identity) and a `Tenant`, carrying that user's **tenant-specific role**. This is where merchant authorization lives — **never** as a flag on `User`. |
| **User ↔ Tenant relationship** | `N:M` between `User` and `Tenant`, resolved by `TenantMembership`. `userId` FK → `User` (RESTRICT). `tenantId` FK → `Tenant` (RESTRICT). `@@unique([userId, tenantId])` — at most one membership per user per tenant. A `User` may have memberships in several tenants (→ a server-issued tenant switcher, Phase 3/D6). |
| **Role ownership** | `role ∈ TenantRole { OWNER, ADMIN, STAFF, VIEWER }` (new enum, introduced in Phase 1). The role lives **on the membership row**, so the same `User` can be `OWNER` of tenant X and `VIEWER` of tenant Y. **Phase 1 stores this as data only — nothing reads it for authorization yet** (that is Phase 2's `PermissionsGuard`). |
| **Membership lifecycle** | `status ∈ MembershipStatus { ACTIVE, INVITED, SUSPENDED }` (proposed — **REQUIRES EXPLICIT APPROVAL**). `INVITED` = a pending team invitation (invite/accept flow is Phase 5). `invitedByUserId?`. `createdAt`, `updatedAt`. Every `Tenant` must have ≥1 `ACTIVE` `OWNER` membership at all times (a Phase 5 invariant; Phase 1 just allows it). |
| **Authorization implications** | After Phase 2, code asks `can(membership, 'orders:transition')` — never `role === 'ADMIN'`. The `TenantRole → permission` map is data/config. `CUSTOMER` is **not** a `TenantRole` and carries **no** path into any tenant console (frozen §5). A storefront `Customer` (D5) will **never** hold a `TenantMembership`. Phase 1 introduces none of this enforcement — it only creates the table the enforcement will later read. |
| **Keys / indexes (intent)** | `id` (uuid, PK). `@@unique([userId, tenantId])`. `@@index([tenantId])`, `@@index([userId])`. |

---

## B.5 Roles

**No new roles. No roles removed. Phase 1 changes no authorization behavior.**

| Role | Domain | Lives on | Introduced | Enforced |
|---|---|---|---|---|
| **`SUPER_ADMIN`** | **Platform** control plane | `User` (a future `User.platformRole`) | **Phase 2** (not Phase 1) | Phase 2 (`PermissionsGuard` / platform guard) |
| **`OWNER`** | Tenant control plane | `TenantMembership.role` (`TenantRole`) | **Phase 1** (as data) | Phase 2 |
| **`ADMIN`** | Tenant control plane | `TenantMembership.role` | **Phase 1** (as data) | Phase 2 |
| **`STAFF`** | Tenant control plane | `TenantMembership.role` | **Phase 1** (as data) | Phase 2 |
| **`VIEWER`** | Tenant control plane | `TenantMembership.role` | **Phase 1** (as data) | Phase 2 |
| **`CUSTOMER`** | Storefront (store-scoped) — **separate domain** | Today: `User.role`; target: a store-scoped `Customer` (D5) | Exists today; `Customer` entity = **Phase 2** | Existing `RolesGuard` unchanged in Phase 1 |

**Phase 1 boundary on roles:**

- **The existing `Role { CUSTOMER, ADMIN }` enum, `RolesGuard`, `@Roles()` decorator, and
  `AuthenticatedUser` shape are NOT touched.** The current storefront + admin app keep working
  unchanged.
- Phase 1 **adds** the `TenantRole { OWNER, ADMIN, STAFF, VIEWER }` enum and writes it onto
  `TenantMembership` rows created by seeds/tests. Nothing reads it.
- `SUPER_ADMIN` and `User.platformRole` are **Phase 2**. Phase 1's data model **shows** where
  `SUPER_ADMIN` will attach (see §B.6) but does not add the column.
- The name collision between `Role.ADMIN` (global, today) and `TenantRole.ADMIN` (membership,
  new) is intentional and temporary; Phase 2 resolves it when `Role` is retired.

---

## B.6 Platform vs Tenant vs Store ownership of the new models

| New model | Bucket | Rationale |
|---|---|---|
| **`Tenant`** | **TENANT** (the root) | It *is* the tenant ownership boundary. Platform-managed lifecycle, tenant-readable. |
| **`Store`** | **TENANT → STORE** | Belongs to a `Tenant`; is itself the store-ownership root for storefront data (Phase 4). |
| **`StoreDomain`** | **STORE** | Belongs to a `Store`; carries denormalized `tenantId` for isolation defence-in-depth. |
| **`TenantMembership`** | **TENANT** | Belongs to a `Tenant`; references a **PLATFORM**-owned `User`. |
| **`Plan`** (shell) | **PLATFORM** | The platform's catalogue of subscription plans (`free/starter/growth/business/enterprise`). Not tenant-specific. `PlanFeature`/`PlanLimit`/`Usage` are **Phase 6** — not added in Phase 1. |
| **`Subscription`** (shell) | **PLATFORM-managed, TENANT-scoped** | Exactly one per `Tenant` (`tenantId` unique). Lifecycle is written only by the Platform Control Plane / billing (Phase 7); the tenant reads its own. Billing-provider coupling is **Phase 7** — Phase 1's shell has `id`, `tenantId`, `planId`, `status` (7 frozen states), `currentPeriodStart?`, `currentPeriodEnd?`, `createdAt` only. |
| **`User`** | **PLATFORM** (unchanged) | Existing model. Phase 1 adds **no column** to it — not even `platformRole` (Phase 2). |

**New enums introduced in Phase 1:** `TenantRole` (OWNER/ADMIN/STAFF/VIEWER),
`SubscriptionStatus` (PENDING/TRIALING/ACTIVE/PAST_DUE/PAUSED/CANCELLED/EXPIRED — the 7 frozen
states, no additions), plus the small status enums `TenantStatus`, `StoreStatus`,
`DomainVerificationStatus` (PENDING/VERIFIED/FAILED), `MembershipStatus` — **all subject to
§B.8 explicit approval.**

---

## B.7 Phase 1 Conceptual Data Model

*(Conceptual only — no Prisma, no migration code. `[P1]` = introduced in Phase 1;
`[P2]` = Phase 2; `[P6]` / `[P7]` / `[P9]` = later phases, shown for context.)*

```
                          ┌─────────────────────────────┐
                          │  User  (PLATFORM)  [exists]  │
                          │  id, email(unique), role,    │
                          │  passwordHash, tokenVersion  │
                          │  …                           │
                          │  platformRole → SUPER_ADMIN  │  [P2 — NOT added in Phase 1]
                          └───────────────┬──────────────┘
                                          │ 1
                                          │
                                          │ N        (N:M via the join below)
                          ┌───────────────┴───────────────────────┐
                          │  TenantMembership  (TENANT)  [P1]      │
                          │  id, userId→User, tenantId→Tenant      │
                          │  role → TenantRole{OWNER,ADMIN,        │  [P1 — data only,
                          │                    STAFF,VIEWER}       │   NOT enforced]
                          │  status{ACTIVE,INVITED,SUSPENDED}      │
                          │  invitedByUserId?                      │
                          │  @@unique(userId, tenantId)            │
                          └───────────────┬───────────────────────┘
                                          │ N
                                          │
                                          │ 1
                          ┌───────────────┴───────────────────────┐
                          │  Tenant  (TENANT — ownership root)[P1] │
                          │  id, slug(unique),                     │
                          │  status{ACTIVE,SUSPENDED,              │
                          │         PENDING_DELETION,DELETED}      │
                          │  createdAt, updatedAt, deletedAt?      │
                          └──────┬───────────────────────┬─────────┘
                                 │ 1                     │ 1
                                 │ 1                     │ N
             ┌───────────────────┴──────┐   ┌────────────┴────────────────────────┐
             │ Subscription (PLATFORM-  │   │  Store  (TENANT → STORE root)  [P1]  │
             │  managed, TENANT-scoped) │   │  id, tenantId→Tenant,               │
             │  [P1 shell]              │   │  slug, name,                        │
             │  id, tenantId(unique),   │   │  status{ACTIVE,DISABLED,DRAFT},      │
             │  planId→Plan,            │   │  isPrimary  (partial unique         │
             │  status → Subscription   │   │             (tenantId) WHERE        │
             │   Status{PENDING,        │   │             isPrimary)              │
             │   TRIALING,ACTIVE,        │   │  @@unique(tenantId, slug)           │
             │   PAST_DUE,PAUSED,        │   │  branding: typed cols /             │
             │   CANCELLED,EXPIRED}      │   │            keyed StoreSetting        │
             │  currentPeriodStart?,     │   └────────────┬────────────────────────┘
             │  currentPeriodEnd?        │                │ 1
             └───────────┬──────────────┘                │ N
                         │ N                  ┌───────────┴──────────────────────────┐
                         │ 1                  │  StoreDomain  (STORE)  [P1 model;     │
             ┌───────────┴───────────┐        │   verification/routing = P9]         │
             │  Plan (PLATFORM)      │        │  id, storeId→Store, tenantId (denorm),│
             │  [P1 shell]           │        │  hostname (GLOBALLY unique),          │
             │  id, key{free,starter,│        │  isPrimary (partial unique           │
             │   growth,business,    │        │            (storeId) WHERE isPrimary),│
             │   enterprise},        │        │  verificationStatus{PENDING,VERIFIED, │
             │  name, isPublic       │        │                     FAILED},          │
             │  PlanFeature/         │  [P6]  │  verificationToken, verifiedAt?       │
             │  PlanLimit/Usage      │        └──────────────────────────────────────┘
             └──────────────────────┘

   ── NOT in Phase 1 ────────────────────────────────────────────────────────────────
   Customer (STORE — storefront identity root)      [P2, per D5(a)]
     (storeId, email) unique; own auth; the future owner of orders/carts/reviews/…
   PermissionsGuard, TenantContext, scoped Prisma   [P2 / P3]
   tenantId/storeId/customerId on ANY existing table [P4]
```

**Cross-tenant impossibility in the intended model:** every FK on a new model points *into*
one tenant's subtree (`Store.tenantId`, `StoreDomain.storeId` + denormalized `tenantId`,
`TenantMembership.tenantId`, `Subscription.tenantId`). There is **no** FK that could link two
tenants. `StoreDomain.hostname` is **globally unique**, so a hostname resolves to exactly one
store → one tenant. `TenantMembership (userId, tenantId)` unique prevents duplicate-membership
ambiguity.

---

## B.8 Phase 1 Migration Boundary

### Phase 1 IS ALLOWED to:

1. Add the six new models — `Tenant`, `Store`, `StoreDomain`, `TenantMembership`, `Plan`
   (shell), `Subscription` (shell) — via **one additive forward migration** (`CREATE TABLE`
   only; `CREATE TYPE` for the new enums).
2. Add the new enums: `TenantRole`, `SubscriptionStatus`, `TenantStatus`, `StoreStatus`,
   `DomainVerificationStatus`, `MembershipStatus` (exact value sets per §B.6, **pending
   approval**).
3. Add constraints **on the new tables only**: `Tenant.slug` unique; `Store @@unique([tenantId,
   slug])`; partial unique `Store (tenantId) WHERE isPrimary`; `StoreDomain.hostname` globally
   unique; partial unique `StoreDomain (storeId) WHERE isPrimary`; `TenantMembership
   @@unique([userId, tenantId])`; `Subscription.tenantId` unique; supporting `@@index`.
4. Add a new `TenancyModule` (`TenantService`, `StoreService`, `StoreDomainService`,
   `MembershipService`) and a `PlansModule` shell (`PlanService.getPlanByKey`) — **callable
   only from seeds/tests**; **no controller, no guard, no interceptor, no request-path
   enforcement.**
5. Register `TenancyModule` and `PlansModule` in `app.module.ts`'s import list (base layer,
   before `ProductsModule`).
6. Add dev/test seed capability to bootstrap "a `Tenant` + primary `Store` + `OWNER`
   `TenantMembership` + `Free`/`ACTIVE` `Subscription`" (shape informed by D3).
7. Add new unit tests for the new models/services and the new constraints.
8. Update `docs/saas/` (a `CHANGE-MAP.md` / `OWNERSHIP-MAP.md` refresh) and the
   `schema.prisma` header comment (per the D1 ACR).

### Phase 1 MUST NOT:

- Add `tenantId` / `storeId` / `customerId` (or any scope column) to **any existing table**.
- Touch the `Role` enum, `RolesGuard`, `@Roles()`, `JwtAuthGuard`, `AuthenticatedUser`, or the
  JWT payload.
- Add `User.platformRole` or `SUPER_ADMIN` (Phase 2).
- Add a `Customer` table or any customer-auth flow (Phase 2).
- Add any tenant-context middleware/interceptor/guard or any scoped Prisma client (Phase 3).
- Backfill, migrate, or read any existing production row.
- Change, drop, or replace **any** unique constraint or index on an existing table
  (no `slug`/`code`/`orderNumber` changes — Phase 4).
- Add `PlanFeature` / `PlanLimit` / `Usage` / entitlement logic (Phase 6).
- Add `Subscription` billing-provider coupling, `SubscriptionEvent`, or `SaasInvoice`
  (Phase 7).
- Add `StoreDomain` verification *mechanism* or host→store→tenant resolution (Phase 9).
- Modify any existing service's queries or any existing controller.
- Perform any global query conversion or tenant-aware authorization replacement.
- Perform any destructive migration of any kind.

**Any deviation from this boundary requires explicit approval recorded in
`docs/saas/DECISIONS.md`.**

---

## B.9 Phase 1 Dependencies

| Category | Items |
|---|---|
| **Prerequisites** | (1) `docs/saas/PHASE-0-REPOSITORY-INVENTORY.md` approved *(done)*. (2) **D1 ACR signed** (permits schema additions). (3) **D3 resolved** (Tenant #1 framing). (4) **D5 resolved** (customer identity direction, so `User`↔`TenantMembership` is modelled correctly). (5) **This spec explicitly approved.** (6) **Lifecycle-enum value sets explicitly approved** (§B.6). |
| **Inputs** | Frozen SaaS Architecture v1.0 §4/§5/§10/§11 + invariants 1, 2, 11, 12, 19. Master Plan Phase 1 (§7). Phase 0 report §3.16 (ownership classification), §6–8 (model/FK inventory), §12 (settings), §19 (decisions). The D1–D15 resolutions in Part A. |
| **Outputs** | (1) Additive `schema.prisma` with 6 new models + 6 new enums, no existing model changed. (2) One additive forward migration (`CREATE TABLE`/`CREATE TYPE` only). (3) `TenancyModule` + `PlansModule` (non-enforcing services). (4) Dev/test seed that bootstraps a full tenant. (5) New unit tests + full existing suite still green. (6) Updated `schema.prisma` header + `docs/saas/CHANGE-MAP.md`. (7) A `docs/saas/PHASE-1-COMPLETION-REPORT.md`. |
| **Blocked-by decisions** | **D1** (hard), **D3** (soft/seed), **D5** (design). *(D2, D4, D6, D8, D10, D11 are NOT Phase 1 blockers — they gate Phases 3/4.)* |
| **Downstream consumers** | **Phase 2** (Identity — consumes `TenantMembership`, `Tenant`, `Store`; adds `SUPER_ADMIN`, `Customer`, permission guard). **Phase 3** (Context — consumes membership + store; adds `TenantContext` + scoped Prisma). **Phase 4** (Data Ownership — attaches `tenantId`/`storeId` on every existing table to these roots; backfills to Tenant #1). **Phase 5** (Platform/Tenant admin — CRUDs `Tenant`/`Store`/`StoreDomain`/`TenantMembership`/`Plan`/`Subscription`). **Phase 6** (fills the `Plan` shell). **Phase 7** (fills the `Subscription` shell). **Phase 9** (fills `StoreDomain` verification + resolution). |

---

## B.10 Phase 1 Risks

| # | Risk | Severity | Why it applies to Phase 1 | Mitigation |
|---|---|:-:|---|---|
| P1-R1 | **Circular relationships** | M | `Store ↔ StoreDomain` via `isPrimary`; `Tenant ↔ Subscription` (each references the other conceptually); `TenantMembership.invitedByUserId` self-refs the actor. | Model `isPrimary` as a plain boolean + partial unique index, **not** a FK to a "primary domain id" on `Store`. `Subscription.tenantId` unique is the only link (Tenant does not FK to Subscription). `invitedByUserId` is nullable `SET NULL`. `prisma validate` + a dependency-cycle check in CI. |
| P1-R2 | **Incorrect ownership model** — baking "one store per tenant" so hard that multi-store later needs re-derivation | H | v1 is one primary store; the temptation is to fold store-ness into `Tenant`. | `Store` is a first-class table with its own id from day one; every Phase 4 ownership column carries **both** `tenantId` and `storeId`; `isPrimary` is a flag. (Frozen §10 — future-compatible.) |
| P1-R3 | **User migration ambiguity** — which existing `User` becomes `OWNER` of Tenant #1 | H | Phase 1's seed creates an `OWNER` membership; if D2 reveals multiple `role=ADMIN` users (incl. `catalog-seed-admin@printforge.internal`), "the owner" is ambiguous. | Blocked-by **D2** + **D3**. Phase 1's *seed* uses a synthetic owner for dev/test; the *real* Tenant #1 owner is assigned in **Phase 4** from the confirmed live inventory, not in Phase 1. |
| P1-R4 | **Role migration ambiguity** — `Role.ADMIN` (global) vs `TenantRole.ADMIN` (membership) coexist | M | Phase 1 introduces `TenantRole` while `Role` stays. Two "ADMIN"s in the codebase. | Documented as intentional + temporary; `TenantRole` is **data only** in Phase 1 (nothing reads it); Phase 2 retires `Role`. CI grep gate (added Phase 2) bans `user.role` reads. |
| P1-R5 | **Existing data mapping ambiguity** — the new model precludes a valid future backfill | H | If `Store`/`Customer` relationships are modelled wrong now, Phase 4 can't attach existing rows cleanly. | The model is reviewed against Phase 0 §3.16's per-model target ownership **before** the migration; `StoreSetting` mirrors the proven `app-setting.constants.ts` discipline; D5 fixes the `User`/`Customer` direction first. |
| P1-R6 | **Destructive schema changes** (scope creep) | C | The pressure to "just also add `tenantId` to `products` while we're here." | Hard boundary §B.8; the migration is reviewed to be `CREATE TABLE`/`CREATE TYPE` only; a CI check that the Phase 1 migration contains no `ALTER TABLE` on an existing table, no `DROP`, no `NOT NULL` add. |
| P1-R7 | **Production data uncertainty** (D2 open) | M for Phase 1 | Phase 1 proceeds before D2 is answered. | Phase 1 is **additive-only and touches no existing row**, so it is safe regardless of D2. The migration is reversible by a compensating `DROP TABLE` while nothing references the new tables (true through end of Phase 1). Take a backup before applying (standard, `DEPLOYMENT.md §3`). |
| P1-R8 | **Lifecycle-state churn** — the status enums get revised after the migration ships | M | Prisma enum changes on a populated table are awkward; forward-only migrations. | Get `Tenant`/`Store`/`Subscription`/`Membership`/`Domain` status enums reviewed against frozen §7/§12/§18 **before** the migration (§B.8 approval gate). Use the 7 frozen `SubscriptionStatus` values exactly — no additions. |
| P1-R9 | **`Store` branding as unvalidatable JSON** | M | A free-form `branding Json` column that later can't be queried or validated. | Keep pricing/security-relevant store config as typed columns or a keyed `StoreSetting` (allowlist + typed normalizers, per `app-setting.constants.ts`). Defer `StoreSetting` to Phase 4/12 if a minimal typed column set suffices for Phase 1. |
| P1-R10 | **Existing test suite regression** | M | New base-layer modules in `app.module.ts` could perturb DI / startup. | Full `npm run test`, `npm run test:e2e` (backend), `npm run test` (frontend) must stay green — this is the proof the additive change altered no existing behavior. `scheduler-registration.spec.ts` must still pass (no new `ScheduleModule.forRoot()`). |

---

## B.11 Phase 1 Acceptance Criteria (testable)

| # | Criterion | How it is verified |
|---|---|---|
| AC-1 | `Tenant`, `Store`, `StoreDomain`, `TenantMembership`, `Plan`, `Subscription` models exist. | `prisma validate` passes; `grep '^model '` shows 31 models (25 + 6). |
| AC-2 | `Store` belongs to exactly one `Tenant` (`tenantId` FK, RESTRICT). | Schema review; a unit test that creating a `Store` without a valid `tenantId` fails. |
| AC-3 | Exactly one primary `Store` per `Tenant`. | Unit test: a second `Store` with `isPrimary=true` for the same tenant is rejected by the partial unique index. |
| AC-4 | `TenantMembership` connects a `User` and a `Tenant`, one per pair. | Unit test: duplicate `(userId, tenantId)` is rejected. |
| AC-5 | Role lives on `TenantMembership` (`TenantRole`), not on `User`. | Schema review: `User` has no new role column; `TenantMembership.role` is `TenantRole`. |
| AC-6 | `SUPER_ADMIN` remains platform-scoped and is **not** added in Phase 1. | `grep -i 'super_admin\|platformRole' schema.prisma` → no match; `Role` enum unchanged (`CUSTOMER, ADMIN`). |
| AC-7 | Initial v1 = one primary storefront per tenant. | AC-3 + schema review (`Store.isPrimary` partial unique); no multi-store requirement in code. |
| AC-8 | `StoreDomain.hostname` is globally unique. | Unit test: a second `StoreDomain` with the same `hostname` (even under a different store) is rejected. |
| AC-9 | `Subscription` is 1:1 with `Tenant` and uses exactly the 7 frozen states. | Unit test: a second `Subscription` for a tenant is rejected; `grep` on `SubscriptionStatus` shows exactly `PENDING, TRIALING, ACTIVE, PAST_DUE, PAUSED, CANCELLED, EXPIRED`. |
| AC-10 | **No existing table is modified.** | The Phase 1 migration `.sql` contains only `CREATE TABLE` / `CREATE TYPE` / `CREATE INDEX` on new objects — no `ALTER TABLE <existing>`, no `DROP`, no `NOT NULL` add. CI check. |
| AC-11 | **No cross-tenant relationship is possible in the model.** | Schema review: every FK on a new model resolves into one tenant subtree; `hostname` global-unique; `(userId, tenantId)` unique. Documented in the completion report. |
| AC-12 | Existing legacy data remains intact; **no production data is modified.** | Phase 1 runs no data statements; `git`/deploy notes show only the additive migration; row counts of existing tables unchanged before/after. |
| AC-13 | **No tenant-aware authorization change occurs.** | `RolesGuard`, `JwtAuthGuard`, `@Roles()`, `AuthenticatedUser`, JWT payload all unchanged (`git diff` on those files = empty). |
| AC-14 | A dev/test seed can bootstrap a full tenant (Tenant + primary Store + OWNER membership + Free/ACTIVE subscription). | Run the seed against a local DB; assert the four rows exist and are linked. |
| AC-15 | The full existing test suite is still green. | `npm run test` + `npm run test:e2e` (backend) + `npm run test` (frontend) all pass; `scheduler-registration.spec.ts` still asserts exactly one `ScheduleModule.forRoot()`. |
| AC-16 | The additive migration applies cleanly on a copy of production and is reversible while unreferenced. | `prisma migrate deploy` on a restored copy; a compensating `DROP TABLE` migration is demonstrably safe pre-Phase-2. |
| AC-17 | `TenancyModule` / `PlansModule` expose **no HTTP route and no guard**. | `grep -r '@Controller\|@Get\|@Post\|Guard' src/tenancy src/plans` → no match. |

---

## B.12 Phase 1 START GATE

Phase 1 implementation **cannot begin** until every **BLOCKED** item is resolved and every
**REQUIRES EXPLICIT APPROVAL** item is explicitly approved and recorded in
`docs/saas/DECISIONS.md`.

| # | Requirement | Status | Detail |
|---|---|:-:|---|
| G-1 | **D1 — ACR superseding `BLUEPRINT-v1.2` signed** | **BLOCKED** | Joint Atharva+Harshad ACR per `BLUEPRINT-v1.2 §38`. Without it, adding any model to `schema.prisma` violates the repo's own frozen governance clause. |
| G-2 | **D3 — Initial Tenant / Store framing chosen** | **BLOCKED** | (a) existing store → Tenant #1, or (b) discard + empty tenants. Determines the Phase 1 seed shape and doc framing. Depends on D2 for the "is there real data" input. |
| G-3 | **D5 — Customer identity direction chosen** | **BLOCKED** | (a) separate store-scoped `Customer` (recommended) or (b) global `User` + `Customer` profile. Phase 1 must model `User`↔`TenantMembership` so option (b) would not have to be unwound. |
| G-4 | **This Phase 1 specification explicitly approved** | **REQUIRES EXPLICIT APPROVAL** | Architecture owner signs off on §B.2–B.8. |
| G-5 | **Lifecycle-enum value sets approved** | **REQUIRES EXPLICIT APPROVAL** | `TenantStatus {ACTIVE, SUSPENDED, PENDING_DELETION, DELETED}`, `StoreStatus {ACTIVE, DISABLED, DRAFT}`, `MembershipStatus {ACTIVE, INVITED, SUSPENDED}`, `DomainVerificationStatus {PENDING, VERIFIED, FAILED}`. `TenantRole` and `SubscriptionStatus` are fixed by the frozen architecture (no approval needed — but confirm the 7 subscription states are used verbatim). |
| G-6 | **D2 — production-data question answered** | **READY to proceed without** *(for Phase 1 only)* | Not a Phase 1 blocker (additive-only, no data touched). **Strongly recommended** to obtain before Phase 1 so the roadmap can be sequenced and G-2/G-3 informed. **Hard blocker for Phase 4.** |
| G-7 | **D4 — isolation mechanism** | **READY** | Resolved as "both" (app-layer enforced + RLS/composite-FK defence-in-depth). Not consumed until Phase 3. |
| G-8 | **D6, D8, D10, D11** | **READY to proceed without** *(for Phase 1)* | All gate Phase 3 or Phase 4, not Phase 1. D8 (staging) provisioning should **start now** in parallel due to lead time. |
| G-9 | **Backup taken before applying the additive migration** | **REQUIRES EXPLICIT APPROVAL** *(operational step at execution time)* | Standard per `DEPLOYMENT.md §3`, even though Phase 1 risk is minimal. |
| G-10 | **CI check for "additive-only" migration** in place | **REQUIRES EXPLICIT APPROVAL** *(add as part of Phase 1)* | A gate asserting the Phase 1 migration `.sql` has no `ALTER TABLE <existing>` / `DROP` / `NOT NULL`-add (AC-10). |

### Gate summary

| Classification | Count | Items |
|---|:-:|---|
| **READY** | 2 | G-7, and G-6/G-8 are "ready to proceed without" for Phase 1 scope |
| **BLOCKED** | 3 | **G-1 (D1 ACR), G-2 (D3), G-3 (D5)** |
| **REQUIRES EXPLICIT APPROVAL** | 4 | G-4 (spec), G-5 (enum sets), G-9 (pre-migration backup), G-10 (additive-only CI check) |

**PHASE 1 READINESS: BLOCKED.**
Resolve D1, D3, D5; obtain the four explicit approvals; (recommended) answer D2 and begin
staging provisioning (D8). Then Phase 1 may start.

---

## Part C — Summary

- **15 decisions reviewed** (D1–D15, canonical Phase 0 §19 IDs).
- **1 RESOLVED** (D4 — isolation mechanism = both layers).
- **4 REQUIRES BUSINESS DECISION** (D1 governance/ACR, D3 initial tenant, D5 customer identity,
  D8 hosting/staging).
- **1 REQUIRES LEGAL DECISION** (D10 — statutory GST invoice numbering).
- **1 REQUIRES PROVIDER DECISION** (D14 — SaaS billing provider).
- **1 REQUIRES DATA ACCESS** (D2 — real production data? = `REQUIRES AUTHORIZED ACCESS`).
- **7 SAFE TO DEFER** (D6→Phase 3, D7→Phase 7/8, D9→Phase 8, D11→Phase 4, D12→Phase 12,
  D13→Phase 10, D15→Phase 11).
- **Phase 1 hard blockers: D1, D3, D5.**
- **Phase 1 readiness: BLOCKED** — pending those 3 decisions + 4 explicit approvals.
- **No default tenant was invented. No decision was silently resolved. No production
  data was accessed or exposed.**

---

*End of PrintForge SaaS — Phase 0 Decision Resolution & Phase 1 Specification.*
*Documentation only. No code, schema, migration, seed, environment, or dependency was changed.
Phase 1 has not been started.*
