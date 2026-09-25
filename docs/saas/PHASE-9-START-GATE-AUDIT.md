# PHASE 9 — Store / Domain Resolution: Start-Gate Audit

| | |
|---|---|
| Scope | Audit only — no code, schema, migration, frontend, infra (Render/Vercel/DNS/Razorpay), production-DB, commit, or push |
| Repository audited | `~/PrintForge/PrintForge` (`origin` = `github.com/AtharvaVavhal/PrintForge.git`) |
| Commit audited | `07d98ff` — `feat: activate Phase 8 merchant payments` (confirmed `HEAD`, `main`) |
| Working tree | Uncommitted changes present (frontend storefront redesign, docs, untracked Phase 2/4/8 reports, local `.dump` files) — all pre-existing, unrelated to domain resolution; left untouched per instructions |
| Phase 8 | **FROZEN** per owner instruction (2026-09-20). Not reopened by this audit. Deferred Phase 8 operational items (per-account Razorpay webhook Dashboard reconfiguration, `PaymentAccount.webhookSecret` reconnect, real ₹1 refund validation) are tracked by the owner, not here. |
| Legend | 🗂 repository-derived fact · 💡 recommendation/inference · ⚠️ conflict between repository documents, reported not resolved |

No external (vendor/web) research was performed for this audit; every fact below is repository-derived.

---

## 1. Executive Summary

🗂 Phase 9 is **not starting from zero**, but it is starting from **less** than Phase 8 did:

1. A full **draft Phase 9 design** lives in `docs/saas/PRINTFORGE-SAAS-IMPLEMENTATION-MASTER-PLAN-v1.0.md` **§15 "Phase 9 — Store / Domain Resolution"** (lines 2063–2211). As with Phase 8's §14, it is a **planning input, not a ratified decision** — no `docs/saas/DECISIONS.md` record with a `P9-` prefix exists.
2. The `StoreDomain` model, the `DomainVerificationStatus` enum, and the DB-enforced one-primary-domain-per-store index have existed since Phase 1 (`backend/prisma/schema.prisma:1349–1367`, `:1183–1187`; migration `20260905191258_add_saas_foundation`). Both existing host-lookup code paths (`tenant-context.guard.ts:152 resolveFromHost`, `storefront-tenant.resolver.ts`) already query it. **No production `StoreDomain` row exists** — the resolver's own comment says so ("none do in production today", `storefront-tenant.resolver.ts:26`).
3. **No Phase 9 start-gate, spec, decision docket, runbook, migration, or implementation report exists anywhere in the repository** (verified: `find -iname "*PHASE-9*"` → nothing; `backend/prisma/migrations/` ends at `20260914055530_phase8_payment_account_foundation`).

⚠️ The central fact this audit surfaces: **Phase 9's own Master Plan section and the repository's decision records disagree with each other and with the shipped schema on three load-bearing points**, none of which this audit may resolve:

- **Customer-auth ownership.** Nine `DECISIONS.md` records defer the customer-authentication runtime to **"Phase 9/12"** — a two-phase label — and Master Plan §15 does not list customer auth in Phase 9's scope at all. Whether Phase 9 builds it is undecided (§4).
- **`StoreDomain` schema gap.** §15 describes five `StoreDomain` fields and one enum value that the shipped schema does not have, and the enum in question was ratified verbatim by **G-5** (§5).
- **Two §15-flagged decisions** — the TLS issuer/renewal mechanism ("NOT FROZEN") and custom-domain cookie handling ("REQUIRES DECISION-minor") — have no `DECISIONS.md` record (§6).

**Verdict (§15 detail below): BLOCKED — OWNER DECISIONS REQUIRED.** Unlike Phase 8 (READY WITH OPEN DECISIONS), the Phase 9 blockers cannot be worked around by sequencing: the customer-auth question changes *what Phase 9 is*, and the schema gap touches a ratified enum before the first migration can be written.

---

## 2. Phase 9 Objective (verbatim, Master Plan §15 PURPOSE, lines 2067–2071)

> Make `Domain → Store → Tenant` resolution real and server-side on every request: PrintForge-hosted default URLs for every store, custom domains on top with ownership verification, one canonical primary domain per store, HTTPS/TLS in production. (Handbook §10, §13, §17; invariants 11, 17.)

🗂 Exit criteria (§15 EXIT CRITERIA, line 2209–2211): *"Server-side domain resolution live; platform subdomains for every store; custom-domain verification + TLS working; canonical redirects; per-store SEO files; frontend origin de-hardcoded; isolation-by-host proven; suites green."*

🗂 The Master Plan defines **no numbered waves or milestones** for Phase 9. §15 is organised by impact area (DATABASE / BACKEND / FRONTEND / INFRASTRUCTURE / SECURITY / MIGRATION / KEY RISKS / REUSE / NEW CAPABILITIES / VERIFICATION / ROLLBACK / EXIT), in that order. §23 item 10 (line 3631) restates the phase in one line: *"Host→store→tenant on every request; platform subdomains; custom-domain verification + TLS; canonical redirects; per-store `robots`/`sitemap`; de-hardcode the frontend origin. (May overlap 5–8.)"*

---

## 3. Existing Domain-Resolution Architecture

🗂 Structural map (what exists today, and what §15 names that does not):

| Path | Exists? | Owns today | §15 expectation |
|---|:-:|---|---|
| `backend/prisma/schema.prisma:1349` `model StoreDomain` | ✅ | `id, storeId, tenantId, hostname @unique, isPrimary, verificationStatus, verificationToken, verifiedAt, createdAt`; partial unique index `store_domains_store_primary_unique` (`schema.prisma:1341–1347` comment, hand-added SQL in Phase 1 migration) | Same model, extended — see §5 |
| `backend/prisma/schema.prisma:1183` `enum DomainVerificationStatus` | ✅ | `PENDING, VERIFIED, FAILED` — comment: *"Ratified (G-5). The verification mechanism and host -> store -> tenant runtime resolution are Phase 9; Phase 1 has the state only."* | `PENDING/VERIFYING/VERIFIED/FAILED` — see §5 |
| `backend/src/common/tenant/tenant-context.guard.ts:152` `resolveFromHost()` | ✅ | **Merchant** path: `Host` → `storeDomain.findUnique({hostname})` → `store.tenantId`, then **cross-checked against the caller's `TenantMembership`**; mismatch falls through (line 174–179). Invoked at line 128. Decision D6 (`DECISIONS.md:213`). | §15 calls this "the Phase 3 `TenantContext` resolver seam — Phase 9 fills it in" (line 2177) |
| `backend/src/common/tenant/storefront-tenant.resolver.ts` | ✅ | **Storefront create-path** resolver (Phase 4 W7, P4-D2): `Host` → `StoreDomain` first; if nothing resolves, **most-recently-created `Tenant`** fallback (lines 25–46 comment; lines 57–74 code). Consumed by `cart`, `checkout`, `uploads`, `app-setting`, `tenant-lifecycle.guard`. | The "unknown host → 404 generic" and VERIFIED/ACTIVE gating in §15 BACKEND IMPACT do not exist; today an unknown host silently resolves to Tenant #1 |
| `backend/src/common/tenant/primary-store.ts` | ✅ | `resolvePrimaryStoreId(prisma, tenantId)` — D11 tenant→primary-Store step; fails closed | Reusable for `GET /storefront/context` |
| `backend/src/tenancy/store-domain.service.ts` | ❌ | — (no `backend/src/tenancy/` directory exists; tenant code lives in `backend/src/common/tenant/`) | §15 REPOSITORY AREAS names this path for DNS TXT / CNAME verification + ACME/provider callback |
| `backend/src/platform/platform-domains/` | ❌ | — (`backend/src/platform/` contains `dto/`, `platform-plans/`, `platform.controller.ts`, `platform.service.ts`) | §15: approve/inspect custom-domain verifications. See §7 conflict. |
| `backend/src/platform/dto/platform-tenant-view.interface.ts:35` | ✅ | Comment: domain-review capability *"deferred — no domain-review capability exists in W3 (Phase 9 concern)"* | Confirms Phase 5 did not build it |
| `GET /storefront/context`, `GET /robots.txt`, `GET /sitemap.xml` (backend, `@Public()`) | ❌ | — | §15 BACKEND / FRONTEND IMPACT |
| `backend/src/main.ts:38–40` CORS | ✅ | `origin: configService.get('frontendUrl')` — exact single origin, credentialed, never a wildcard (`ENVIRONMENT.md:42`: `FRONTEND_URL` is the "Sole CORS allowed origin") | §15 INFRASTRUCTURE IMPACT: replace with a check against verified `StoreDomain` hosts + platform/admin origins |
| `backend/src/auth/auth.service.ts:398–420` refresh cookie | ✅ | `httpOnly, secure, sameSite: 'strict', path: REFRESH_TOKEN_COOKIE_PATH` — **no `domain` attribute**; merchant auth only | §15 flags custom-domain breakage — see §6.2 |
| `frontend/src/seo/siteConfig.ts:6–20` | ✅ | `SITE_URL` = `VITE_SITE_URL` override else `DEFAULT_SITE_URL` (`https://www.printforge.in`, per `siteConfig.constants.ts`); comment cites BLUEPRINT-v1.2 §23 / ARCHITECTURE-FREEZE | §15: *"stop hard-coding `https://www.printforge.in`"*; `VITE_SITE_URL` becomes dev/preview override only |
| `frontend/src/seo/seoFiles.ts` | ✅ | Pure builders for build-time `robots.txt`/`sitemap.xml` emitted by the `seoFiles` Vite plugin; `STATIC_PUBLIC_PATHS` only (product/category URLs explicitly excluded, lines 8–11) | §15: retire in favour of backend per-store routes |
| `frontend/src/seo/Seo.tsx`, `jsonLd.ts` | ✅ | Canonical / `og:url` / JSON-LD `url` from `SITE_URL` | §15: from store context |
| `frontend/src/services/api/client.ts` | ✅ (not opened) | API base per environment | §15: store context from host |
| `frontend/vercel.json` | ✅ | SPA rewrite `/(.*) → /index.html` only; no domain config | §15: wildcard/custom-domain config |
| `StoreContextProvider` (frontend) | ❌ | — | Named in Master Plan §16 (Phase 12) line 2606 as *"from Phase 9's bootstrap"* |
| Any seed/bootstrap writing a `StoreDomain` row | ❌ | grep of `backend/prisma/*.ts`, `backend/scripts/` → no `storeDomain` reference | §15 DATABASE IMPACT: every `Store` auto-gets a `PLATFORM_SUBDOMAIN` row; MIGRATION IMPACT: Tenant #1 backfill |

🗂 **Precedent worth naming:** the `HealthController` `@Public()` pattern is what §15 REUSE (line 2183) designates for the `robots.txt`/`sitemap.xml`/context routes; `useStoreName.ts` is designated as the store-aware-chrome pattern (line 2182).

---

## 4. CUSTOMER AUTH OWNERSHIP — "Phase 9/12" (OWNER DECISION REQUIRED)

⚠️ **This is the highest-leverage unresolved item.** Every relevant decision record uses the compound label **"Phase 9/12"**; none assigns the runtime to a single phase. Master Plan §15 (Phase 9) does not mention customer authentication in any impact section. Master Plan §16 (Phase 12) lists *"Phase 2 (`Customer` store-scoped auth)"* as a **dependency** (line 2556), not a deliverable. Neither phase's draft claims it.

🗂 Exactly what is deferred, item by item, with the record that defers it:

| # | Deferred item | Frozen design (already decided) | Deferring record(s) | Deferred to | Repository evidence it does not exist |
|---|---|---|---|---|---|
| 1 | **`CustomerRefreshToken` table** | Separate table mirroring `RefreshToken`: `id, customerId FK, tokenHash, expiresAt, revokedAt?, replacedByTokenId?, createdAt` | **P2-D3** (`DECISIONS.md:487–500`): *"RESOLVED — OPTION (i) (design FROZEN; table creation deferred to Phase 9/12)"* | Phase 9/12 | `identity-foundation.e2e-spec.ts:272` — `AC-P2-02: there is NO customer_refresh_tokens table (deferred to Phase 9/12)` is a **passing, asserting test** |
| 2 | **`/storefront/auth/*` route family** | Route family fixed; distinct from merchant `/auth/*` | **P2-D6** (`DECISIONS.md:562–583`): *"RESOLVED (intended route family recorded; runtime deferred to Phase 9/12 per P2-D7)"* — rationale: *"the store-host-scoped alternative requires runtime Domain→Store→Tenant resolution, which is Phase 9"* | Phase 9/12 | No `storefront/auth` controller in `backend/src/` |
| 3 | **Customer JWT issuance** (token shape, strategy/guard, `AuthenticatedCustomer { id, storeId, tenantId }`) | `{sub: customerId, storeId, tokenVersion, aud}` | **P2-D5** (`DECISIONS.md:537–558`): *"RESOLVED (design FROZEN; runtime implementation deferred to Phase 9/12 per P2-D7)"* — consequence: *"The `storeId` claim presupposes the store is known at login, which requires the deferred Phase 9 Domain→Store→Tenant resolution."* | Phase 9/12 | `Customer` auth fields *"are inert until the Phase 9/12 customer auth runtime"* (`schema.prisma:1691–1692`) |
| 4 | **`CUSTOMER_JWT_ACCESS_SECRET`** (distinct signing secret — provisioning + wiring) | Distinct secret, optional env var defaulting to shared secret | **P2-D13** (`DECISIONS.md:737–750`): *"RESOLVED — DISTINCT SECRET (design FROZEN; provisioning + wiring are Phase 9/12)"*; **G-15** (`DECISIONS.md:865–878`): *"APPROVED (design); provisioning is a Phase 9/12 execution item"* | Phase 9/12 | Not in `env.validation.ts` / `ENVIRONMENT.md` (grep) |
| 5 | **`customerId` cutover** (make `customerId` live / `NOT NULL` / constraint-bearing on `Cart`, `Order`, `Review`, `CouponUsage`, `IdempotencyKey`, `UploadedFile`, `OrderStatusHistory`) | Option B: backfill-only nullable columns; `userId` remains the live write path | **P4-D1** (`DECISIONS.md:1061–1074`): *"The actual cutover … is explicitly deferred to whichever phase ships customer authentication (Phase 9/12), to be decided there with a real Customer session available to reason about."* | Phase 9/12 — **"not decided here"** | `storefront-tenant.resolver.ts:19` comment: *"P2-D7/P4-D1 defer real customer identity to Phase 9/12"* |
| — | **Store identification for customer auth** (the reason for the deferral) | No pre-Phase-9 mechanism; no implicit Tenant #1 context | **P2-D7** (`DECISIONS.md:587–608`): *"OPTION 3 — CUSTOMER AUTHENTICATION IS DEFERRED TO PHASE 9/12. Do NOT invent a pre-Phase-9 Store-identification mechanism."*; **G-14** (`DECISIONS.md:840–853`): *"Store resolution for customer auth will be the Phase 9 Domain→Store→Tenant runtime resolver."* | Phase 9/12 | — |

🗂 The `DECISIONS.md` summary tables (lines 1701–1716, 1724) repeat the "Phase 9/12" label for P2-D3, P2-D5, P2-D6, P2-D7, P2-D13, G-14, G-15; P4-D1's row (line 1724) records only "Phase 4 backfill design (W5)".

🗂 What *is* unambiguous: the *prerequisite* for all five items — runtime `Host → StoreDomain → Store → Tenant` resolution — is Phase 9 (P2-D5, P2-D6, G-14 all say so explicitly). What is ambiguous is whether the items themselves ship in Phase 9, in Phase 12, or split.

💡 **The two readings are materially different phases.** Under a "Phase 12 owns it" reading, Phase 9 is a backend/infra phase with a small frontend SEO change and no new auth surface, and `identity-foundation.e2e-spec.ts:272` stays green unmodified. Under a "Phase 9 owns it" reading, Phase 9 additionally ships a new auth subsystem (table + migration, route family, JWT strategy/guard, secret provisioning across three environments, and a P4-D1 cutover decision) and the cookie question in §6.2 becomes a Phase 9 blocker rather than a Phase 12 one. A split reading (e.g. "table + secret in Phase 9, routes + cutover in Phase 12") is also available. **This audit does not recommend a reading** — the owner's re-scope in P2-D7 was explicit that customer auth is not to be constructed piecemeal (P4-D1 rationale: Option C rejected because it *"would piecemeal-construct part of Phase 9/12's own customer-authentication design … out of order"*), so the assignment is the owner's call.

**OWNER DECISION REQUIRED (1): Customer auth — Phase 9 vs Phase 12 (or a recorded split), covering all five items above.**

---

## 5. STOREDOMAIN SCHEMA GAP (OWNER DECISION REQUIRED)

⚠️ Master Plan §15 DATABASE / DATA IMPACT (lines 2094–2103) describes the `StoreDomain` row Phase 9 "puts into real use". Compared field-by-field against `backend/prisma/schema.prisma:1349–1367`:

| §15 field | §15 stated values / meaning | In `schema.prisma` today | Gap |
|---|---|:-:|---|
| `hostname` | lookup key, globally unique | ✅ `String @unique` (line 1353) | None. §15 KEY RISKS "hostname globally unique" already DB-enforced |
| `type` | `PLATFORM_SUBDOMAIN` \| `CUSTOM` — distinguishes always-on platform subdomains from verification-gated custom domains | ❌ absent | **Missing column + missing enum.** §15's resolver rule (*"must be VERIFIED for custom, always-on for platform subdomain"*) cannot be expressed without it |
| `isPrimary` | one per store | ✅ `Boolean @default(false)` (line 1354); partial unique index `store_domains_store_primary_unique` (comment lines 1341–1347) | None |
| `verificationStatus` | `PENDING/VERIFYING/VERIFIED/FAILED` | ⚠️ `DomainVerificationStatus @default(PENDING)`; enum = `PENDING, VERIFIED, FAILED` (lines 1183–1187) | **`VERIFYING` absent.** See G-5 note below |
| `verificationMethod` | `DNS_TXT` / `CNAME` | ❌ absent | Missing column + missing enum |
| `verificationToken` | issued when merchant adds a hostname | ✅ `String?` (line 1356) | None |
| `lastCheckedAt` | last DNS check timestamp | ❌ absent | Missing column |
| `verifiedAt` | | ✅ `DateTime?` (line 1357) | None |
| `tlsStatus` | `PENDING/ISSUED/ERROR` | ❌ absent | **Missing column + missing enum.** §15 KEY RISKS mitigation (*"resolver requires `verificationStatus='VERIFIED'` and `tlsStatus='ISSUED'` for CUSTOM domains"*) cannot be enforced without it |
| `createdAt` | | ✅ `DateTime @default(now())` (line 1359) | None |
| *(not in §15)* `storeId`, `tenantId` | — | ✅ present, both `onDelete: Restrict`, both indexed (lines 1351–1352, 1361–1365) | §15 does not list them; the schema comment (line 1340) says `tenantId` is *"denormalized for isolation defence-in-depth (spec §B.6) and is FK-enforced"* |

🗂 **Summary of the gap:** 4 missing columns (`type`, `verificationMethod`, `lastCheckedAt`, `tlsStatus`), 3 missing enums (for `type`, `verificationMethod`, `tlsStatus`), 1 missing enum value (`VERIFYING`). §15 MIGRATION IMPACT says the phase is *"Additive"* — every item above is expressible as `ADD COLUMN` / `CREATE TYPE` / `ALTER TYPE … ADD VALUE`, so additivity is not the problem.

### 5.1 The G-5-ratified enum issue

⚠️ `DomainVerificationStatus = {PENDING, VERIFIED, FAILED}` was **ratified verbatim by the architecture owner under G-5** (`DECISIONS.md:350–372`, 2026-09-06): *"Ratified: … `DomainVerificationStatus` = {PENDING, VERIFIED, FAILED}."* The schema carries the same marker (`schema.prisma:1180`: *"Ratified (G-5)"*). Master Plan §15 — written before G-5 — lists a four-value set including `VERIFYING`.

🗂 The repository does **not** state which of these governs when they disagree, nor whether extending a G-5-ratified set requires a new decision record, an amendment to G-5, or is simply an additive migration. The nearest precedent is P2-D11 (`DECISIONS.md:699`), where the owner chose *not* to add a `CustomerStatus` enum and noted *"adding a `CustomerStatus` enum is a forward migration"* — but that concerned a new enum, not amending a ratified one.

🗂 `TenantStatus` (`ACTIVE, SUSPENDED, PENDING_DELETION, DELETED`, line 1157) and `StoreStatus` (`ACTIVE, DISABLED, DRAFT`, line 1166) — both also G-5-ratified — are what §15's resolver rules (*"Store must be ACTIVE"*, *"Tenant must be ACTIVE, subscription not EXPIRED"*, *"disabled store / suspended tenant → store unavailable"*) will read. They need no change; noted here because they are the other G-5 sets Phase 9 touches.

💡 This audit does not propose column names, enum names, or whether `VERIFYING` is needed at all (it is only load-bearing if the verification job is asynchronous — which depends on the §8 Phase 11 cron question). It only records that the first Phase 9 migration cannot be authored until the owner reconciles §15 with the shipped, ratified schema.

**OWNER DECISION REQUIRED (2): `StoreDomain` schema reconciliation — which of the §15 fields/enums are adopted, and whether amending the G-5-ratified `DomainVerificationStatus` set is authorised.**

---

## 6. DOMAIN / TLS DECISIONS (OWNER DECISIONS REQUIRED)

Both items below are flagged **inside Master Plan §15 itself** as undecided. Neither has a `DECISIONS.md` record. This audit records the options the Master Plan names and does not pick one.

### 6.1 TLS certificate issuer / renewal mechanism

🗂 Master Plan §4.3 (line 601), in the list of *"Explicitly NOT frozen (implementation inputs, not pre-decided here)"*: *"Specific **TLS certificate issuer / renewal mechanism** (Phase 9)."*

🗂 Master Plan §15 DEPENDENCIES (lines 2076–2078): *"**IMPLEMENTATION / CONFIGURATION — NOT FROZEN:** the specific TLS certificate issuer and renewal mechanism (Vercel-managed, Let's Encrypt via a proxy, Cloudflare for SaaS, …) is an implementation choice."*

🗂 §15 INFRASTRUCTURE IMPACT (line 2139–2140): *"Custom-domain onboarding: Vercel 'add domain' via API (or an edge proxy) + TLS issuance; the mechanism is not frozen (D-minor)."* §15 BACKEND IMPACT (line 2117): *"TLS provisioning (provider-specific, behind an interface)"*.

🗂 What the choice determines: the shape of the `tlsStatus` state machine (§5), whether `store-domain.service.ts` calls a Vercel API, an ACME client, or a Cloudflare API, whether the frontend host or a proxy terminates TLS, and what the *"provider-specific, behind an interface"* interface is. Every §15 KEY RISK about serving a store before TLS is issued depends on this.

🗂 Current hosting facts (from `docs/ops/DEPLOYMENT.md` / `ENVIRONMENT.md`, not re-verified against live infra): frontend on Vercel (`frontend/vercel.json`), backend on Render (`srv-da7en5qd0e5s73ebm0bg` per `PHASE-8-PRODUCTION-ACTIVATION.md:79`), production origin `https://www.printforge.in`. D8 (hosting topology) was resolved for the restore drill only (`DECISIONS.md:1692`); the "stay on Render vs. move" question in Master Plan §4.4 D8 is noted as an ops decision for Phases 11/14 and is not reopened here.

**OWNER DECISION REQUIRED (3): TLS issuer / renewal mechanism.**

### 6.2 Custom-domain cookie handling / `SameSite` behaviour

🗂 Master Plan §15 INFRASTRUCTURE IMPACT (lines 2143–2148):

> `SameSite=Strict` refresh cookie: **custom domains break the shared-registrable-domain assumption** the current cookie design relies on (`auth.service.ts`, Readme "Project Status"). Customer auth on a custom domain needs the cookie scoped to that domain (the `Customer` auth flow from Phase 2 is already separate — set its cookie per store host). This is a concrete design item for Phase 9, flagged: **REQUIRES DECISION-minor** on first-party vs proxied cookie handling for custom domains.

🗂 Current code (`backend/src/auth/auth.service.ts:398–420`): the **merchant** refresh cookie is `httpOnly, secure, sameSite: 'strict', path: REFRESH_TOKEN_COOKIE_PATH`, with no `domain` attribute. There is no customer cookie because there is no customer auth (§4).

🗂 §15 KEY RISKS (line 2166–2167) restates the mitigation direction without deciding the mechanism: *"customer auth cookie scoped to the store host; merchant/platform admin stays on the fixed platform domain."*

⚠️ **Coupling with §4:** this decision is only load-bearing in Phase 9 **if** customer auth ships in Phase 9. If customer auth is assigned to Phase 12, the merchant cookie is unaffected by Phase 9 (merchant admin *"stays on the fixed platform domain"*) and this decision can be recorded as Phase 12's. The Master Plan nonetheless files it under Phase 9, so it is listed here as Phase 9's until the owner says otherwise.

🗂 The Master Plan names the axis of the decision — *"first-party vs proxied cookie handling"* — and nothing more. The repository contains no analysis of either option.

**OWNER DECISION REQUIRED (4): Custom-domain cookie handling (first-party vs proxied; `SameSite` behaviour for customer sessions on custom domains).**

---

## 7. Hard Prerequisites and Their Status

🗂 Master Plan §22.2 "True prerequisites" (line 3247): **`9 | 1, 3, 5 | fills the Phase 3 resolver seam`**. §15 DEPENDENCIES (lines 2073–2075): *"Phase 1 (`Store`, `StoreDomain`), Phase 3 (`TenantContext` already consumes the resolver — Phase 9 makes the resolver production-grade). Phase 5 (platform console approves domains)."* §22.3 (line 3266): *"Phase 9 (Domain Resolution) can overlap Phases 5–8. It depends on Phases 1/3 (+ Phase 5 for the approval UI)."*

| Prerequisite | Status | Evidence |
|---|:-:|---|
| **Phase 1** — `Store`, `StoreDomain`, `DomainVerificationStatus` | **COMPLETE** | `schema.prisma:1296` `model Store` (`slug`, `status`, `isPrimary`, `domains StoreDomain[]`); `:1349` `model StoreDomain`; migrations `20260905191258_add_saas_foundation`, `20260907183000_enable_rls_tenancy_tables` (both create/alter `store_domains`) |
| **Phase 3** — `TenantContext` host-resolution seam | **COMPLETE** | `tenant-context.guard.ts:152 resolveFromHost()` (D6, RESOLVED 2026-09-07, `DECISIONS.md:1691`); `PHASE-3-START-GATE-AND-IMPLEMENTATION-SPEC.md:424–427`: *"Phase 3 only lands the backend Host-header resolution mechanism for the storefront path"* |
| **Phase 5** — platform console (backend) | **COMPLETE** | Production live deploy `29df0f6a` *"feat(saas): complete Phase 5 backend (W1-W10)"* (`PHASE-8-PRODUCTION-ACTIVATION.md:17`); `platform-control-plane.e2e-spec.ts` |
| **Phase 5** — `platform-domains` approval surface | **INCOMPLETE** — see conflict below | `backend/src/platform/` has no `platform-domains/`; `platform-tenant-view.interface.ts:35`: *"deferred — no domain-review capability exists in W3 (Phase 9 concern)"* |
| **D6** — tenant-context derivation (the only §4.4 register entry naming Phase 9) | **COMPLETE** | `DECISIONS.md:1691` RESOLVED — BOTH mechanisms, header cross-validated |
| **Phase 8** — Merchant Payment Account | **Not a Phase 9 prerequisite** (§22.2/§22.3); FROZEN per owner | Phase 12, not Phase 9, is what requires both 8 and 9 (`§22.2` line 3250: `12 | 2, 3, 4, 8, 9`) |
| **Platform storefront domain** config value (`{store-slug}.{platform-storefront-domain}`) | **UNKNOWN** | §15 line 2099–2100 says *"the platform storefront domain is config"*; §15 INFRASTRUCTURE (line 2137) names `*.stores.printforge.app` as the example wildcard. No such env var exists in `backend/src/config/configuration.ts`, `env.validation.ts`, or `docs/ops/ENVIRONMENT.md` (grep for `DOMAIN`/`SITE_URL` → only `FRONTEND_URL`, `VITE_SITE_URL`, `EMAIL_FROM_ADDRESS`). Whether `stores.printforge.app` (or any wildcard) is registered/owned is not a repository-derived fact. |
| **TLS mechanism** (§6.1) | **INCOMPLETE — NOT FROZEN** | No `DECISIONS.md` record |
| **Cookie handling** (§6.2) | **INCOMPLETE — REQUIRES DECISION-minor** | No `DECISIONS.md` record |
| **Customer-auth ownership** (§4) | **INCOMPLETE — "Phase 9/12"** | Nine records, no single-phase assignment |

### 7.1 Phase 5 / `platform-domains` dependency conflict

⚠️ Two sections of the same Master Plan assign the domain-approval console to different phases:

- **§15 DEPENDENCIES** (line 2075): *"Phase 5 (platform console approves domains)"* — and §22.3 (line 3267): *"(+ Phase 5 for the approval UI)"* — treat it as something Phase 5 **provides to** Phase 9.
- **§13 Phase 5 REPOSITORY AREAS** (line 1503): *"`platform-domains`: review/approve custom-domain verifications **(Phase 9)**"* — treats it as something Phase 9 **builds**.
- **§15 REPOSITORY AREAS** (line 2083): lists `backend/src/platform/platform-domains/ (approve/inspect)` under Phase 9's own backend areas.

🗂 The shipped Phase 5 code follows the §13 reading: `platform-domains` was not built, and the Phase 5 W3 tenant-view DTO explicitly defers it to Phase 9. **Net effect:** the "Phase 5" prerequisite in §22.2 is satisfied for everything *except* the domain-approval surface, which — if the §13/§15-areas reading holds — is Phase 9's own deliverable and not a prerequisite at all. The repository does not say which reading is authoritative; it only shows which one was acted on.

---

## 8. Required Phase 9 Migration — Absent

🗂 `backend/prisma/migrations/` (24 entries) ends at `20260914055530_phase8_payment_account_foundation`. **No Phase 9 migration exists.** The two migrations that touch `store_domains` are Phase 1's (`20260905191258_add_saas_foundation`) and Phase 3's RLS enablement (`20260907183000_enable_rls_tenancy_tables`).

🗂 §15 MIGRATION IMPACT (lines 2185–2190): *"Additive. Tenant #1's store gets a platform subdomain + (optionally) the existing `www.printforge.in` as a `CUSTOM` `VERIFIED` domain so the current storefront keeps working. The DNS cutover that was already pending becomes: point `www.printforge.in` at the shared frontend, register it as Tenant #1's primary custom domain."*

🗂 What a Phase 9 migration would have to contain, **once §5 is decided** (listed from §15, not proposed by this audit): the schema additions from §5; a data step creating a `PLATFORM_SUBDOMAIN` `StoreDomain` for every existing `Store` (production has exactly one, Tenant #1's primary store — D3); optionally the `www.printforge.in` `CUSTOM VERIFIED` row. No code today creates any `StoreDomain` row (§3 last row), so production `store_domains` is presumed empty — **presumed**, because this audit did not query production (read-only instruction; the resolver comment at `storefront-tenant.resolver.ts:26` is the evidence).

🗂 Whether production is at `20260914055530` (i.e. whether the Phase 8 migration was applied) is not verified by this audit. `docs/ops/PHASE-8-PRODUCTION-ACTIVATION.md:89` says *"confirmed unapplied"* as of that document's session; the owner's 2026-09-20 freeze statement says Phase 8 production activation completed. See §13.2 — the repo docs have not been updated to reflect the latter.

---

## 9. Required Phase 9 Test Surface

🗂 Master Plan §15 VERIFICATION / ACCEPTANCE CRITERIA (lines 2192–2202), verbatim requirements:

| # | Test | Exists today? |
|---|---|:-:|
| 1 | `backend/test/e2e/domain-resolution.e2e-spec.ts` (**new**): `Host: a.example` returns only Store A's catalog; `Host: b.example` only Store B's; unknown host → 404 generic; unverified custom host → not served; non-primary host → 301 to canonical; disabled store → "unavailable"; suspended tenant → "unavailable" (distinct from disabled) | ❌ (`backend/test/e2e/` has 39 specs; none for domain resolution) |
| 2 | Domain verification: adding a hostname yields a token; a passing DNS check flips to `VERIFIED`; a failing check stays `PENDING` with a reason | ❌ |
| 3 | `robots.txt`/`sitemap.xml` differ per store host and reflect that store's catalog only | ❌ (`frontend/src/seo/seoFiles.test.ts` tests the build-time builders, which §15 retires) |
| 4 | Frontend: no hard-coded `printforge.in` remains in `siteConfig.ts`; canonical/OG URLs match the served host in a component test | ❌ (`Seo.test.tsx`, `jsonLd.test.ts`, `pageSeo.test.tsx` exist and currently assert the `www.printforge.in` origin) |
| 5 | §21 R1 (line 3303) lists Phase 9 among phases covered by `tenant-isolation.e2e-spec.ts` *"paired positive/negative for every resource type"* | ⚠️ No file named `tenant-isolation.e2e-spec.ts` exists; isolation coverage is spread across `phase4-w3-tenant-scoping.e2e-spec.ts`, `tenancy-foundation.e2e-spec.ts`, `support-session-scoped-client.e2e-spec.ts` etc. Which file Phase 9's host-isolation negatives belong in is not stated. |
| 6 | §5 Implementation Principle 4 (line 3313–3316): *"No tenant-isolation change without paired tests"* — a negative + positive e2e must exist and pass **before** an isolation filter becomes enforced | Repo-wide rule; applies to switching `storefront-tenant.resolver.ts` from "fallback to most-recent tenant" to "unknown host → 404" |
| 7 | EXIT CRITERIA: *"suites green"* | Baseline not re-run by this audit |

🗂 **Existing tests that would be affected**, depending on §4's outcome:
- `identity-foundation.e2e-spec.ts:272` (`AC-P2-02: there is NO customer_refresh_tokens table`) — must be **inverted or removed only if** customer auth ships in Phase 9. Under a Phase 12 assignment it stays as-is.
- `test/e2e/support/fixtures.ts:505` — fixtures build `Customer` rows directly because *"customer auth is Phase 9/12"*; same conditionality.
- `tenant-context.guard.spec.ts`, `storefront-tenant.resolver` consumers (`cart`, `checkout`, `uploads`, `app-setting` specs) — the storefront fallback behaviour they rely on changes when unknown-host → 404 is enforced. Whether the §15 ROLLBACK "kill-switch" (*"fall back to 'single store = Tenant #1's primary store' resolution (pre-Phase-9 behavior)"*, line 2203–2205) preserves today's fallback for tests is a design question for the spec, not this audit.

---

## 10. Production / Infrastructure Dependencies

🗂 From §15 INFRASTRUCTURE IMPACT (lines 2136–2148) and MIGRATION IMPACT (2185–2190). None of these can be verified from the repository; all are ops facts the owner must confirm:

| Dependency | Repository evidence | Owner-confirmable? |
|---|---|:-:|
| Wildcard subdomain for platform-hosted stores (`*.stores.printforge.app` is §15's example) on **both** the frontend host and the API | No env var, no `vercel.json` domain entry, no DNS record in repo | Yes — DNS/Vercel/Render dashboards |
| Ownership/registration of the platform storefront domain itself | **UNKNOWN** (§7) | Yes |
| Custom-domain onboarding mechanism (Vercel "add domain" API vs. edge proxy) + TLS issuance | NOT FROZEN (§6.1) | Decision, then confirm capability |
| CORS: replace single `FRONTEND_URL` allow (`main.ts:39–40`; `ENVIRONMENT.md:42` *"Sole CORS allowed origin"*) with verified-`StoreDomain`-hosts + fixed platform/admin origins | Code change, but `ENVIRONMENT.md`'s Tier-2 production enforcement of `FRONTEND_URL` (`:48`) must be reconciled with a dynamic allow-list | Spec item |
| DNS cutover of `www.printforge.in` → shared frontend, registered as Tenant #1's primary custom domain | `siteConfig.ts:8–9`: *"DNS cutover is still pending (Readme.md 'Project Status')"* — pending since before the SaaS track | Yes |
| Kill-switch to pre-Phase-9 single-store resolution **without a redeploy** (§15 ROLLBACK, line 2203–2206) | Implies a runtime flag (env or `PlatformConfig`); no such flag exists; the Phase 3 `advisory`/`enforced` per-module flag pattern (Master Plan §12 line 1236–1244) is the nearest precedent | Spec item |
| `robots`/`sitemap` degrade to static permissive `robots.txt` on route failure | Spec item | — |
| Canary check per deploy for domain misrouting (§15 KEY RISKS line 2153) | No canary tooling exists; `docs/ops/PRODUCTION-SMOKE-TEST.md` is the nearest existing surface | Spec item |

---

## 11. Explicit Phase 9 Out-of-Scope Items

🗂 Stated by the repository (not inferred):

| Item | Where it is placed instead | Source |
|---|---|---|
| Specific TLS issuer / renewal mechanism | Implementation choice, not frozen | Master Plan §4.3 line 601; §15 line 2076–2078 |
| Full frontend storefront sweep: `StoreContextProvider` consumers, per-store query-key namespacing, branding/theme tokens, hooks, static/legal pages | **Phase 12** (which *depends on* Phase 9's bootstrap endpoint and per-store SEO routes) | Master Plan §16 lines 2553–2606; `PHASE-3-START-GATE-AND-IMPLEMENTATION-SPEC.md:424–427` |
| Domain-verification **cron** job | §15 line 2115: *"a verification job (**Phase 11 cron** / on-demand)"* — only on-demand is unambiguously Phase 9 | Master Plan §15; §17 (Phase 11) |
| Per-store legal pages / `robots`/`sitemap` enumerating legal pages | **Phase 13** | Master Plan §16 line 2600; §19 |
| Customer authentication runtime (all five items in §4) | **"Phase 9/12"** — undecided | `DECISIONS.md` P2-D3/D5/D6/D7/D13, G-14/G-15, P4-D1 |
| `customerId` cutover to `NOT NULL` / constraint-bearing | **"Phase 9/12" — "not decided here"** | P4-D1 (`DECISIONS.md:1073–1074`) |
| Multiple stores per tenant (multi-store UI) | Not in any Phase 9 section; v1 = one primary storefront per tenant | Master Plan §16 line 2549–2550; `Store` partial unique index |
| Hosting topology change (worker service, staging, ≥2 instances) | **D8 / Phases 11, 14** | Master Plan §4.4 D8 |
| Deferred Phase 8 operational items (per-account webhook Dashboard reconfiguration, `webhookSecret` reconnect, ₹1 refund validation) | Phase 8 — FROZEN; owner-tracked | Owner instruction 2026-09-20 |

---

## 12. Numbering Conflict with the Superseded BLUEPRINT "Phase 9"

⚠️ Two different phase-numbering schemes coexist in the repository and both contain a "Phase 9":

| Scheme | "Phase 9" means | Where it appears | Governance status |
|---|---|---|---|
| **Original storefront blueprint** | **Admin (remaining surface)** — admin dashboard, orders, refund recording | `docs/architecture/BLUEPRINT-v1.2.md:505` (spine: *"Phase 8 (Customer Account) → Phase 9 (Admin, remaining surface) → Phase 10 (Reviews/Coupons …)"*); `docs/architecture/PHASE-10-PROPOSAL.md:17` (*"code as of `121f72c` (Phase 9, `feat(admin): admin dashboard, orders, …`"*); `docs/architecture/history/BLUEPRINT-v1.0.md`, `history/REVIEW-v1.1.md`; **code comment** `backend/src/orders/orders.service.refund-recording.spec.ts:21` (*"the one behavior Phase 9 adds to adminTransitionStatus"*) | **Superseded** — D1 RESOLVED/APPROVED (`DECISIONS.md:1686`), `docs/saas/ACR-001-SUPERSEDE-BLUEPRINT-V1.2.md`; BLUEPRINT kept as historical |
| **SaaS Implementation Master Plan v1.0** | **Store / Domain Resolution** | Master Plan §15, §22, §23; all `DECISIONS.md` "Phase 9/12" references; all `schema.prisma` "Phase 9" comments; `docs/design/PRINTFORGE-UI-UX-HANDBOOK-v1.0.md` | **Current** — the scheme under which Phases 1–8 were executed (Phase 8 = Merchant Payment Account, matching the owner's freeze statement) |

🗂 This audit uses the **SaaS Master Plan** numbering throughout. The one code-level artefact carrying the old numbering (`orders.service.refund-recording.spec.ts:21`) is a historical comment about already-shipped admin work; it is not Phase 9 work and this audit does not propose editing it.

---

## 13. Other Repository-Level Blockers and Conflicts

### 13.1 Storefront resolver fallback vs. §15 "unknown host → 404"

🗂 `storefront-tenant.resolver.ts:57–74` resolves an unknown/absent host to the **most-recently-created `Tenant`** and only throws when no `Tenant` row exists. Its own comment (lines 33–46) justifies this as today's single-tenant production reality and says *"Real host-based resolution (Phase 5+, once per-tenant storefront domains exist) supersedes this step entirely."* §15 BACKEND IMPACT requires *"Unknown host → 404 'store not found' (a generic page, no tenant enumeration)."* Switching from the former to the latter is an isolation-enforcement change and falls under §5 Principle 4 (paired tests first) — and it is exactly what the §15 kill-switch would toggle back. The Phase 9 spec must define both the enforced behaviour and the kill-switch semantics before the resolver is touched.

### 13.2 Phase 8 closure not reflected in repository docs

⚠️ `docs/ops/PHASE-8-PRODUCTION-ACTIVATION.md` §11–§12 (lines 165–190) record the verdict **"BLOCKED"** with six open operator actions, and `docs/saas/PHASE-8-FINAL-READINESS-GATE.md` §9 (lines 156–186) records **"NO-GO for production activation of Phase 8 today."** The owner's 2026-09-20 instruction states Phase 8 production activation, real ₹100 payment, capture, and `payment.captured` webhook verification are complete, and `HEAD` is `07d98ff feat: activate Phase 8 merchant payments`. **The repository contains no Phase 8 closure/implementation report superseding the BLOCKED/NO-GO verdicts.** This audit does not treat that as a Phase 9 blocker (Phase 8 is not a Phase 9 prerequisite per §22.2), but it is a documentation gap the owner has declared frozen; recording it here so the next reader does not re-derive Phase 8's status from stale docs.

### 13.3 No `P9-` decision docket exists

🗂 Phases 2, 3, 4 and 8 each had a docket (`PHASE-2-DECISION-RESOLUTION-AND-SPEC.md`, `PHASE-3-DECISION-DOCKET.md`, `PHASE-4-DECISION-DOCKET.md`, `PHASE-8-START-GATE-AUDIT.md §14`) ratified in `DECISIONS.md` before implementation. Phase 9 has none. §14 below is the minimum docket this audit can populate from repository evidence alone; it proposes nothing beyond what §15 and `DECISIONS.md` already name.

### 13.4 `frontend/src/seo/siteConfig.ts` cites the superseded BLUEPRINT as its authority

🗂 `siteConfig.ts:6–8` says the production origin is *"established by the frozen architecture docs (docs/architecture/BLUEPRINT-v1.2.md §23, docs/architecture/ARCHITECTURE-FREEZE.md)"*. BLUEPRINT-v1.2 is superseded (D1/ACR-001). §15 requires this literal to go. No blocker — recorded so the Phase 9 frontend change cites the Master Plan rather than the superseded document.

### 13.5 Working tree

🗂 57 uncommitted/untracked paths at audit time, including an in-progress frontend storefront redesign (`frontend/src/components/home/*`, `pages/home/*`, `styles/*`, `index.html`), multiple untracked `docs/saas/PHASE-2*`/`PHASE-4*` reports, `backend/prisma/seed-storefront-preview.ts`, several local `backend/*.dump` files and a `backend/printforge-backend-source.zip`. None overlap Phase 9's repository areas. Not a Phase 9 blocker; noted because §15's frontend changes touch `frontend/src/seo/*` and `index.html` is currently modified.

---

## 14. Phase 9 Decision Docket (💡 proposed — none ratified by this audit; no options chosen)

| ID | Question | Options named by the repository | Recommended | Dependencies | Status |
|---|---|---|---|---|---|
| **P9-D1** | **Customer-auth ownership** — which phase ships `CustomerRefreshToken` table, `/storefront/auth/*`, customer JWT issuance, `CUSTOMER_JWT_ACCESS_SECRET` provisioning, and the P4-D1 `customerId` cutover decision? | Phase 9 / Phase 12 / recorded split | **None** — owner's call (§4) | Determines P9-D4's phase; determines whether `identity-foundation.e2e-spec.ts:272` changes | **BLOCKED — OWNER DECISION** |
| **P9-D2** | **`StoreDomain` schema reconciliation** — adopt §15's `type`, `verificationMethod`, `lastCheckedAt`, `tlsStatus` (+ their enums) and `VERIFYING`? Is amending the G-5-ratified `DomainVerificationStatus` set authorised, and via what record? | Adopt §15 as written / adopt a subset / amend G-5 / new record | **None** (§5) | Gates the first Phase 9 migration | **BLOCKED — OWNER DECISION** |
| **P9-D3** | **TLS issuer / renewal mechanism** | Vercel-managed / Let's Encrypt via proxy / Cloudflare for SaaS / other (§15 list is open-ended) | **None** (§6.1) | Shapes `tlsStatus` semantics (P9-D2) and `store-domain.service.ts` | **BLOCKED — OWNER DECISION** |
| **P9-D4** | **Custom-domain cookie handling** — first-party vs proxied; `SameSite` behaviour for customer sessions on custom domains | First-party / proxied (§15 names only the axis) | **None** (§6.2) | P9-D1 (only load-bearing in Phase 9 if customer auth is Phase 9) | **BLOCKED — OWNER DECISION** (or re-file to Phase 12 per P9-D1) |
| **P9-D5** | **`platform-domains` ownership** — Phase 5 prerequisite (§15 DEPENDENCIES) or Phase 9 deliverable (§13 line 1503, §15 REPOSITORY AREAS)? | Phase 9 builds it / Phase 5 is reopened | 💡 Shipped code already follows the "Phase 9 builds it" reading (§7.1); owner to confirm | None blocking if confirmed | OPEN — conflict, confirm reading |
| **P9-D6** | **Platform storefront domain** — which registrable domain hosts platform subdomains (§15 example `*.stores.printforge.app`), and is it owned/registered? | Ops fact | **None** — not repository-derivable (§7, §10) | Gates the auto-created `PLATFORM_SUBDOMAIN` row's hostname value | **UNKNOWN — OPS CONFIRMATION** |
| **P9-D7** | **Verification job** — on-demand only in Phase 9, with the cron deferred to Phase 11 (§15 line 2115)? | On-demand now, cron Phase 11 / both now | 💡 §15's own wording supports "on-demand now" but does not require it | P9-D2 (`VERIFYING` only meaningful if async) | OPEN |
| **P9-D8** | **Kill-switch mechanism** for reverting to pre-Phase-9 single-store resolution *without a redeploy* (§15 ROLLBACK) | Env flag / `PlatformConfig` row / advisory-enforced module flag (Phase 3 precedent) | **None** | Must be defined before `storefront-tenant.resolver.ts` fallback is removed (§13.1) | OPEN |

---

## 15. Start-Gate Verdict

## **PHASE 9 START-GATE STATUS: BLOCKED — OWNER DECISIONS REQUIRED**

💡 Not `READY WITH OPEN DECISIONS` (Phase 8's verdict): Phase 8's open decisions constrained *how* to build an agreed thing. Phase 9's first two decisions constrain *what* Phase 9 is (P9-D1) and whether its first migration may be written at all (P9-D2, a G-5-ratified enum). Neither can be deferred to a later stage the way P8-D4/P8-D8 were, and neither is a repository-derived fact this audit is entitled to settle.

**Minimum decisions that must be ratified before any Phase 9 implementation begins:**

### OWNER DECISIONS REQUIRED

1. **Customer auth: Phase 9 vs Phase 12** — covering, item by item: `CustomerRefreshToken` table, `/storefront/auth/*`, customer JWT issuance, `CUSTOMER_JWT_ACCESS_SECRET` provisioning + wiring, and the P4-D1 `customerId` cutover decision (§4, P9-D1).
2. **`StoreDomain` schema reconciliation** — §15 fields/enums vs. `schema.prisma:1349–1367`, including whether the G-5-ratified `DomainVerificationStatus` set may be amended and by what record (§5, P9-D2).
3. **TLS issuer / renewal mechanism** (§6.1, P9-D3).
4. **Custom-domain cookie handling** — first-party vs proxied, `SameSite` behaviour (§6.2, P9-D4).

The remaining docket items (P9-D5 through P9-D8) are confirmations or lower-risk design choices that can be ratified in the same pass, but do not by themselves block the gate.

---

## 16. Exact Next Step (after the four decisions are recorded)

Once decisions 1–4 are recorded in `docs/saas/DECISIONS.md` (as `P9-D1`…`P9-D4`, following the Phase 8 pattern where `P8-D6` = `D9`), the next turn should be scoped — mirroring this repository's established "ratify, then spec, then implement" discipline (Phase 3 and Phase 4 each had a `START-GATE-AND-IMPLEMENTATION-SPEC` after their docket) — as:

> **PHASE 9 — START-GATE AND IMPLEMENTATION SPEC** (`docs/saas/PHASE-9-START-GATE-AND-IMPLEMENTATION-SPEC.md`), spec only, no code:
>
> Given P9-D1 = [phase assignment], P9-D2 = [reconciled `StoreDomain` shape], P9-D3 = [TLS mechanism], P9-D4 = [cookie handling]:
>
> 1. Translate Master Plan §15 into numbered waves with per-wave exit criteria, in §15's own impact-area order (DATABASE → BACKEND → FRONTEND → INFRASTRUCTURE), naming the Phase 3 advisory/enforced pattern or another recorded mechanism for the §15 kill-switch (P9-D8).
> 2. Author the additive migration plan for the reconciled `StoreDomain` shape and the Tenant #1 `PLATFORM_SUBDOMAIN` / optional `www.printforge.in` `CUSTOM VERIFIED` backfill — one statement per change, G-19-compliant, no `NOT NULL` on new columns.
> 3. Specify `domain-resolution.e2e-spec.ts` case-by-case from §15 VERIFICATION, and name the file that carries Phase 9's paired positive/negative host-isolation tests (§9 row 5).
> 4. Specify the storefront resolver's enforced behaviour (unknown host → 404) and its fallback semantics under the kill-switch, with the paired tests landing **before** the enforcement flip (§5 Principle 4).
> 5. List the ops confirmations (P9-D6 domain ownership, wildcard DNS, Vercel/Render domain config) as a pre-execution checklist in the `docs/ops/D8-*` handoff style — not executed by the spec.
> 6. If P9-D1 assigns customer auth to Phase 9: add the customer-auth waves as a separately-gated Stage 2 with its own exit criteria, and enumerate every existing test that changes (`identity-foundation.e2e-spec.ts:272`, `fixtures.ts:505`). If Phase 12: state so and re-file P9-D4 to Phase 12.
> 7. No schema, migration, backend, frontend, infra, or production change in that turn.
