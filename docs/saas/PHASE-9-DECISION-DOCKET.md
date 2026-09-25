# PHASE 9 — DECISION DOCKET

**Status: CLOSED (2026-09-20) — P9-D1 RATIFIED (B); P9-D2 RATIFIED (B, G-5
preserved, no `VERIFYING`); P9-D3 RATIFIED (A, Vercel-managed); P9-D4 RATIFIED
(re-filed under Phase 12); P9-D5 RATIFIED (A); P9-D6 RATIFIED
(`stores.printforge.app`, ops checklist mandatory); P9-D7 RATIFIED (A); P9-D8
RATIFIED (`PlatformConfig` row, semantics → spec).** The owner's exact
resolution wording for every item is recorded in `docs/saas/DECISIONS.md`
("Phase 9 Decision Records" section, P9-D1…P9-D8) — **`DECISIONS.md` is the
canonical source of the actual resolutions**; this docket's §1–§9 option and
evidence text is left exactly as originally written (the historical record of
what was asked), with only §10's `Owner Decision`/`Rationale` fields populated
and §13 appended. *(Originally, same day: OPEN — no owner decision supplied
for any item.)* No source file, Prisma schema, migration, environment, hosting
dashboard, DNS record, or production system was accessed or modified to
produce it — every fact below is taken from
`docs/saas/PHASE-9-START-GATE-AUDIT.md`, `docs/saas/DECISIONS.md`, and
`docs/saas/PRINTFORGE-SAAS-IMPLEMENTATION-MASTER-PLAN-v1.0.md` (cited by
section/line as those documents cite them), never assumed. Where the
repository contradicts itself, the contradiction is reported, not resolved.
**`DECISIONS.md` is the canonical source of the actual resolutions once
recorded**; this docket is the question sheet.

---

## 1. Governance

Phase 9 (Store / Domain Resolution, Master Plan §15) implementation is
**BLOCKED** until the four decisions P9-D1 through P9-D4 are ratified by
their owners and recorded in `docs/saas/DECISIONS.md`, per the Phase 9
Start-Gate Audit verdict (`PHASE-9-START-GATE-AUDIT.md §15`: *"PHASE 9
START-GATE STATUS: BLOCKED — OWNER DECISIONS REQUIRED"*).

This follows the repository's established discipline: Phases 2, 3, 4 and 8
each had a decision docket ratified in `DECISIONS.md` before a start-gate
spec was authored and before any implementation began (audit §13.3). Master
Plan §4.4 states the general rule for its open-decision register: *"REQUIRES
DECISION — do not proceed past the dependent phase without these."*

This docket:
- presents each decision with the options the repository itself names;
- explains consequences using repository evidence only;
- **recommends nothing** and **selects nothing**;
- leaves every `Owner Decision` field empty (§10).

The four additional items P9-D5 through P9-D8 are confirmations or design
choices surfaced by the audit. They are recorded here so they are ratified
in the same pass, but they do not by themselves block the gate (audit §15).

---

## 2. P9-D1 — Customer Auth Ownership

### 2.1 Question

Which phase ships the customer-authentication runtime that the repository
consistently defers to **"Phase 9/12"** — a two-phase label that no record
resolves to a single phase (audit §4)?

### 2.2 Affected items (all five deferred under the same label)

| # | Item | Frozen design (already decided — not reopened here) | Deferring record(s) |
|---|---|---|---|
| 1 | **`CustomerRefreshToken` table** | Separate table mirroring `RefreshToken`: `id, customerId FK, tokenHash, expiresAt, revokedAt?, replacedByTokenId?, createdAt` | P2-D3 (`DECISIONS.md:487–500`): *"design FROZEN; table creation deferred to Phase 9/12"* |
| 2 | **`/storefront/auth/*`** route family | Route family fixed; distinct from merchant `/auth/*` | P2-D6 (`DECISIONS.md:562–583`): *"runtime deferred to Phase 9/12 per P2-D7"* |
| 3 | **Customer JWT issuance** (token, strategy/guard, `AuthenticatedCustomer { id, storeId, tenantId }`) | `{sub: customerId, storeId, tokenVersion, aud}` | P2-D5 (`DECISIONS.md:537–558`): *"runtime implementation deferred to Phase 9/12 per P2-D7"* |
| 4 | **`CUSTOMER_JWT_ACCESS_SECRET` provisioning/wiring** | Distinct secret; optional env var defaulting to the shared secret | P2-D13 (`DECISIONS.md:737–750`), G-15 (`DECISIONS.md:865–878`): *"provisioning + wiring are Phase 9/12"* |
| 5 | **`customerId` cutover** (live / `NOT NULL` / constraint-bearing on `Cart`, `Order`, `Review`, `CouponUsage`, `IdempotencyKey`, `UploadedFile`, `OrderStatusHistory`) | Option B: backfill-only nullable columns; `userId` stays the live write path | P4-D1 (`DECISIONS.md:1061–1074`): *"deferred to whichever phase ships customer authentication (Phase 9/12), to be decided there"* |

Underlying re-scope: P2-D7 (`DECISIONS.md:587–608`) — *"OPTION 3 —
CUSTOMER AUTHENTICATION IS DEFERRED TO PHASE 9/12. Do NOT invent a
pre-Phase-9 Store-identification mechanism."* — and G-14
(`DECISIONS.md:840–853`): *"Store resolution for customer auth will be the
Phase 9 Domain→Store→Tenant runtime resolver."*

### 2.3 What is settled and what is not

🗂 **Settled:** the *prerequisite* for all five items — runtime
`Host → StoreDomain → Store → Tenant` resolution — is Phase 9 (P2-D5, P2-D6,
G-14 say so explicitly).

🗂 **Not settled:** whether the five items themselves ship in Phase 9, in
Phase 12, or split. Master Plan §15 (Phase 9) does not list customer auth in
any impact section; Master Plan §16 (Phase 12, line 2556) lists *"Phase 2
(`Customer` store-scoped auth)"* as a **dependency**, not a deliverable.
Neither phase's draft claims the work.

### 2.4 Options (exactly three)

**A. Phase 9 owns all customer-auth runtime items.**

**B. Phase 12 owns all customer-auth runtime items.**

**C. Explicit recorded split.**

### 2.5 Architectural consequences of each (repository evidence only)

**Option A — Phase 9 owns all five items.**
- Phase 9 becomes a domain-resolution phase **plus** a new auth subsystem:
  a `CustomerRefreshToken` migration, a `/storefront/auth/*` controller,
  a customer JWT strategy/guard, secret provisioning in every environment
  (P2-D13: *"provisioning is required before any customer token can
  actually be issued"*), and the P4-D1 cutover decision *"with a real
  Customer session available to reason about"* (`DECISIONS.md:1073`).
- P9-D4 (custom-domain cookie handling) becomes a **Phase 9 blocker**,
  because Master Plan §15 line 2143–2148 ties the cookie question to
  *"Customer auth on a custom domain"*.
- Existing tests change: `identity-foundation.e2e-spec.ts:272`
  (`AC-P2-02: there is NO customer_refresh_tokens table`) must be inverted
  or removed; `test/e2e/support/fixtures.ts:505` (fixtures build `Customer`
  rows directly *"because customer auth is Phase 9/12"*) changes (audit §9).
- Phase 12's dependency list (Master Plan §16 line 2556: *"Phase 2
  (`Customer` store-scoped auth)"*) would then be satisfied by Phase 9
  rather than by Phase 2 as written — a Master Plan wording mismatch the
  owner would be accepting.

**Option B — Phase 12 owns all five items.**
- Phase 9 is a backend/infra phase with a bounded frontend SEO change and
  **no new auth surface** (audit §4: *"Under a 'Phase 12 owns it' reading,
  Phase 9 is a backend/infra phase with a small frontend SEO change"*).
- `identity-foundation.e2e-spec.ts:272` and `fixtures.ts:505` stay green
  unmodified through Phase 9.
- P9-D4 is **re-filed under Phase 12** (§5.4 below; audit §6.2: *"If
  customer auth is assigned to Phase 12, the merchant cookie is unaffected
  by Phase 9 … and this decision can be recorded as Phase 12's"*).
- Phases 10 and 11 (Master Plan §22.1 spine: 9 → 10 → 11 → 12) would run
  with `Customer` rows still authenticated by nothing, exactly as Phases 3–8
  did. The repository records no objection to that, and no requirement
  that a later phase needs a live Customer session before Phase 12.
- Phase 12's own dependency wording (*"Phase 2 (`Customer` store-scoped
  auth)"*) would remain inaccurate in the other direction — Phase 12 would
  be building, not depending on, customer auth.

**Option C — Explicit recorded split.**
- The owner names, item by item (1–5 above), which phase ships each. The
  audit noted one shape as *available*, not proposed: *"table + secret in
  Phase 9, routes + cutover in Phase 12"* (audit §4).
- ⚠️ Repository evidence bearing on splitting: P4-D1's rationale rejected
  Option C of *that* docket because it *"would piecemeal-construct part of
  Phase 9/12's own customer-authentication design (P2-D5/P2-D6/P2-D7
  territory) out of order"* (`DECISIONS.md:1071`). Whether a recorded,
  owner-authorised split is "piecemeal" in that sense is the owner's
  reading, not this docket's. The repository contains no other statement
  for or against splitting.
- Any split must state where P9-D4 files, and which of the two existing
  tests (audit §9) changes in which phase.

### 2.6 Owner

Architecture + product owner (the same owner who recorded P2-D7 and P4-D1,
per those records' `Owner` fields).

---

## 3. P9-D2 — StoreDomain Schema Reconciliation

### 3.1 Question

Master Plan §15 DATABASE / DATA IMPACT (lines 2094–2103) describes a
`StoreDomain` row that differs from the shipped, G-5-ratified schema
(`backend/prisma/schema.prisma:1349–1367`, enum at `:1183–1187`). Which
shape governs Phase 9's first migration, and by what governance record?

### 3.2 Exact current-vs-planned difference

**Current schema (Phase 1, shipped — audit §5 table):**

| Field | In `schema.prisma` today |
|---|---|
| `storeId` | ✅ `String`, FK `onDelete: Restrict`, indexed (line 1351, 1361, 1364) |
| `tenantId` | ✅ `String`, FK `onDelete: Restrict`, indexed (line 1352, 1362, 1365) — *"denormalized for isolation defence-in-depth (spec §B.6) and is FK-enforced"* (line 1340) |
| `hostname` | ✅ `String @unique` (line 1353) |
| `isPrimary` | ✅ `Boolean @default(false)` (line 1354); DB-enforced one-per-store via partial unique index `store_domains_store_primary_unique` (comment lines 1341–1347) |
| `verificationStatus` | ✅ `DomainVerificationStatus @default(PENDING)`; enum = **`PENDING \| VERIFIED \| FAILED`** (lines 1183–1187) |
| `verificationToken` | ✅ `String?` (line 1356) |
| `verifiedAt` | ✅ `DateTime?` (line 1357) |
| `createdAt` | ✅ `DateTime @default(now())` (line 1359) |

**Phase 9 draft additionally specifies (Master Plan §15 lines 2094–2103):**

| Field | §15 stated values | In schema today |
|---|---|:-:|
| `type` | `PLATFORM_SUBDOMAIN` \| `CUSTOM` | ❌ absent (column + enum) |
| `verificationMethod` | `DNS_TXT` / `CNAME` | ❌ absent (column + enum) |
| `lastCheckedAt` | timestamp of last DNS check | ❌ absent |
| `tlsStatus` | `PENDING/ISSUED/ERROR` | ❌ absent (column + enum) |
| `VERIFYING` | additional `verificationStatus` value (`PENDING/VERIFYING/VERIFIED/FAILED`) | ❌ absent (enum value) |

Net: 4 missing columns, 3 missing enums, 1 missing enum value (audit §5).
§15 MIGRATION IMPACT says Phase 9 is *"Additive"*; every item is
expressible additively (`ADD COLUMN` / `CREATE TYPE` / `ALTER TYPE … ADD
VALUE`). Additivity is not the issue — governance is.

### 3.3 The G-5-ratified enum (highlighted)

⚠️ **G-5 (`DECISIONS.md:350–372`, APPROVED 2026-09-06) ratified verbatim:**

> `DomainVerificationStatus` = {PENDING, VERIFIED, FAILED}

The schema carries the marker *"Ratified (G-5)"* (`schema.prisma:1180`).
Master Plan §15 — written before G-5 — lists a four-value set including
`VERIFYING`. The repository does **not** state which governs when they
disagree, nor whether extending a G-5-ratified set requires a G-5
amendment, a new record, or is simply a forward migration (audit §5.1). The
nearest precedent, P2-D11 (`DECISIONS.md:699`), concerned adding a *new*
enum, not amending a ratified one.

**This docket does not decide whether G-5 should be amended.**

Two other G-5-ratified sets — `TenantStatus` and `StoreStatus` — are read
by §15's resolver rules but need no change (audit §5.1).

### 3.4 What §15 cannot express without the missing fields

- Without `type`: the resolver rule *"must be VERIFIED for custom,
  always-on for platform subdomain"* (§15 BACKEND IMPACT) has no column to
  branch on.
- Without `tlsStatus`: the KEY RISKS mitigation *"resolver requires
  `verificationStatus='VERIFIED'` and `tlsStatus='ISSUED'` for CUSTOM
  domains"* (§15 line 2158–2159) cannot be enforced.
- Without `VERIFYING`: only load-bearing if verification is asynchronous —
  see P9-D7 (§8).
- `verificationMethod`, `lastCheckedAt`: operational fields for the
  verification flow (§15 BACKEND IMPACT line 2113–2118); no resolver rule
  depends on them.

### 3.5 Governance choices (presented, not chosen)

**A. Adopt the Phase 9 draft in full and amend the ratified enum** — all
four columns, three new enums, and `VERIFYING` added to
`DomainVerificationStatus`; G-5 amended or superseded by a new record.

**B. Adopt the Phase 9 fields but preserve the ratified enum** — `type`,
`verificationMethod`, `lastCheckedAt`, `tlsStatus` (+ their new enums)
added; `DomainVerificationStatus` stays `PENDING | VERIFIED | FAILED` as
G-5 ratified; `VERIFYING` not introduced.

**C. Adopt a subset with a new recorded decision** — the owner names
exactly which of the five additions are adopted for Phase 9 and which are
deferred, in a new `DECISIONS.md` record.

**D. Other explicitly documented owner decision.**

### 3.6 Owner

Architecture owner (G-5's `Owner` field).

---

## 4. P9-D3 — TLS Issuer / Renewal Mechanism

### 4.1 Question

Which TLS certificate issuer / renewal mechanism does Phase 9 build
against? The repository explicitly leaves this **NOT FROZEN**:

- Master Plan §4.3 line 601: *"Specific TLS certificate issuer / renewal
  mechanism (Phase 9)"* under *"Explicitly NOT frozen (implementation
  inputs, not pre-decided here)"*.
- Master Plan §15 DEPENDENCIES lines 2076–2078: *"IMPLEMENTATION /
  CONFIGURATION — NOT FROZEN: the specific TLS certificate issuer and
  renewal mechanism (Vercel-managed, Let's Encrypt via a proxy, Cloudflare
  for SaaS, …) is an implementation choice."*
- Master Plan §15 INFRASTRUCTURE IMPACT line 2139–2140: *"Custom-domain
  onboarding: Vercel 'add domain' via API (or an edge proxy) + TLS
  issuance; the mechanism is not frozen (D-minor)."*

No `DECISIONS.md` record exists (audit §6.1).

### 4.2 Options (repository-named)

**A. Vercel-managed**
**B. Let's Encrypt through a proxy**
**C. Cloudflare for SaaS**
**D. Other**

### 4.3 What the choice affects (from §15; no option evaluated)

| Concern | §15 reference | What the choice determines |
|---|---|---|
| **TLS termination** | INFRASTRUCTURE IMPACT (lines 2136–2140); *"one shared frontend serving all stores"* (NEW CAPABILITIES) | Whether the frontend host (Vercel) or an intermediate proxy/edge terminates TLS for custom domains, and therefore where the `Host` header the backend resolver reads originates |
| **`tlsStatus`** | DATABASE IMPACT (`PENDING/ISSUED/ERROR`, line 2097); KEY RISKS (*"requires … `tlsStatus='ISSUED'` for CUSTOM domains"*, line 2158–2159) | What event flips `PENDING → ISSUED` (a provider callback, a polled API status, a proxy's ACME completion) and what `ERROR` means — i.e. the state machine P9-D2's `tlsStatus` column would carry |
| **Domain onboarding** | BACKEND IMPACT (line 2113–2118: token → DNS check → `VERIFIED` → *"TLS provisioning (provider-specific, behind an interface)"* → `ISSUED` → traffic allowed); INFRASTRUCTURE (Vercel "add domain" via API vs. edge proxy) | Whether onboarding a custom domain is an API call to the frontend host, a proxy configuration write, or a Cloudflare-for-SaaS custom-hostname registration; what DNS target the merchant is instructed to CNAME to |
| **Renewal** | §4.3 line 601 (*"issuer / renewal mechanism"*) | Whether renewal is provider-automatic, proxy-automatic, or a job Phase 9/11 must own; whether `tlsStatus` can regress from `ISSUED` on a failed renewal |
| **Backend/provider interface** | BACKEND IMPACT: *"TLS provisioning (provider-specific, behind an interface)"*; REPOSITORY AREAS: `backend/src/tenancy/store-domain.service.ts` (*"ACME/provider callback"*) | The shape of the interface the named service file (which does not yet exist — audit §3) would implement; what a "provider callback" is for the chosen provider |

🗂 Current hosting facts for context only (audit §6.1; not re-verified):
frontend on Vercel (`frontend/vercel.json` has SPA rewrite only, no domain
config), backend on Render, production origin `https://www.printforge.in`.
Hosting topology (D8, Master Plan §4.4) is an ops decision for Phases
11/14 and is **not** reopened by this docket.

### 4.4 Owner

Architecture owner + Ops owner.

---

## 5. P9-D4 — Custom-Domain Cookie Handling

### 5.1 Question

How are cookies handled for sessions on custom domains, given that
`SameSite=Strict` on the current refresh cookie relies on a shared
registrable domain that custom domains break?

### 5.2 The repository's actual decision axis (verbatim, Master Plan §15
INFRASTRUCTURE IMPACT lines 2143–2148)

> `SameSite=Strict` refresh cookie: **custom domains break the
> shared-registrable-domain assumption** the current cookie design relies
> on (`auth.service.ts`, Readme "Project Status"). Customer auth on a
> custom domain needs the cookie scoped to that domain (the `Customer` auth
> flow from Phase 2 is already separate — set its cookie per store host).
> This is a concrete design item for Phase 9, flagged: **REQUIRES
> DECISION-minor** on first-party vs proxied cookie handling for custom
> domains.

The axis the repository names is exactly two-sided:

- **First-party cookie handling**
- **Proxied cookie handling**

The repository contains no analysis of either (audit §6.2). **This docket
adds no cookie architecture beyond that axis.**

### 5.3 Relationship to customer auth, `SameSite`, and custom-domain sessions

| Relationship | Repository evidence |
|---|---|
| **Customer auth** | §15 frames the item entirely around *"Customer auth on a custom domain"*. The `Customer` auth flow is *"already separate"* by design (P2-D6 route family `/storefront/auth/*`; P2-D5 token shape). There is **no customer cookie today** because there is no customer auth (audit §6.2). |
| **`SameSite`** | Current merchant refresh cookie (`backend/src/auth/auth.service.ts:398–420`): `httpOnly, secure, sameSite: 'strict', path: REFRESH_TOKEN_COOKIE_PATH`, **no `domain` attribute**. §15 says custom domains break the assumption this relies on. |
| **Custom-domain sessions** | §15 KEY RISKS line 2166–2167: *"Cookie/session breakage on custom domains. Mitigation: customer auth cookie scoped to the store host; merchant/platform admin stays on the fixed platform domain."* — the direction is stated; the mechanism (first-party vs proxied) is the open decision. |
| **Merchant sessions** | Unaffected by Phase 9 under §15's own mitigation: merchant/platform admin *"stays on the fixed platform domain"*. |

### 5.4 Dependency on P9-D1 (explicit)

⚠️ This decision is load-bearing **in Phase 9 only if P9-D1 = Option A
(or a split that places customer-session issuance in Phase 9)**. The
Master Plan files it under Phase 9 (line 2147: *"a concrete design item
for Phase 9"*), so it is listed here as Phase 9's until the owner says
otherwise.

**If P9-D1 assigns customer auth to Phase 12 (Option B), this decision may
need to be re-filed under Phase 12** — audit §6.2: *"If customer auth is
assigned to Phase 12, the merchant cookie is unaffected by Phase 9 … and
this decision can be recorded as Phase 12's."* Whether to decide it now
anyway (so Phase 12 inherits a fixed answer) or defer the decision itself
is also the owner's call; this docket takes no position.

### 5.5 Owner

Architecture + security owner.

---

## 6. P9-D5 — `platform-domains` Ownership

### 6.1 The repository conflict (reported, not resolved — audit §7.1)

Three places in the same Master Plan, plus shipped code, disagree on who
builds the platform-console domain-approval surface:

| Source | What it says | Reading |
|---|---|---|
| **Master Plan §15 DEPENDENCIES** (line 2075) | *"Phase 5 (platform console approves domains)"* | Phase 5 **provides** it to Phase 9 |
| **Master Plan §22.3** (line 3267) | *"It depends on Phases 1/3 (+ Phase 5 for the approval UI)"* | Phase 5 **provides** it |
| **Master Plan §13 Phase 5 REPOSITORY AREAS** (line 1503) | *"`platform-domains`: review/approve custom-domain verifications **(Phase 9)**"* | Phase 9 **builds** it |
| **Master Plan §15 REPOSITORY AREAS** (line 2083) | `backend/src/platform/platform-domains/ (approve/inspect)` listed under Phase 9's own backend areas | Phase 9 **builds** it |
| **Shipped Phase 5 code** | `backend/src/platform/` contains `platform-plans/` only; `platform-tenant-view.interface.ts:35`: domain-review capability *"deferred — no domain-review capability exists in W3 (Phase 9 concern)"* | Phase 5 **deferred** it to Phase 9 |

Net effect: the §22.2 "Phase 5" prerequisite for Phase 9 is satisfied for
everything *except* the domain-approval surface, which — under the §13 /
§15-areas / shipped-code reading — is Phase 9's own deliverable and not a
prerequisite at all. The repository does not say which reading is
authoritative; it only shows which one was acted on.

### 6.2 Options

**A. Phase 9 owns it** — `platform-domains` (approve/inspect) is a Phase 9
deliverable; §15 DEPENDENCIES and §22.3 wording is treated as superseded by
§13/§15-areas and the shipped code.

**B. Reopen/extend Phase 5** — the approval surface is delivered as a Phase
5 extension before or alongside Phase 9, honouring §15 DEPENDENCIES as
written.

**C. Other owner decision.**

### 6.3 Owner

Architecture owner.

---

## 7. P9-D6 — Platform Storefront Domain

### 7.1 What the repository says

- Master Plan §15 DATABASE IMPACT (lines 2099–2100): every `Store`
  auto-gets a `PLATFORM_SUBDOMAIN` `StoreDomain` at
  *"`{store-slug}.{platform-storefront-domain}` — the platform storefront
  domain is config"*.
- Master Plan §15 INFRASTRUCTURE IMPACT (line 2137): *"Wildcard subdomain
  for platform-hosted stores (`*.stores.printforge.app`) on the frontend
  host + the API."*

### 7.2 What the repository does not establish (audit §7, §10)

`*.stores.printforge.app` appears in the Master Plan **as an example**.
Repository evidence does **not** establish that `stores.printforge.app`
(or `printforge.app`) is registered, owned, or DNS-configured:

- No env var for a platform storefront domain exists in
  `backend/src/config/configuration.ts`, `env.validation.ts`, or
  `docs/ops/ENVIRONMENT.md` (grep → only `FRONTEND_URL`, `VITE_SITE_URL`,
  `EMAIL_FROM_ADDRESS`).
- `frontend/vercel.json` has no domain configuration.
- No DNS record or registrar reference exists in the repository.

**This docket does not assume the domain is owned.** The value is
**UNKNOWN** and is an ops fact, not a repository-derivable one.

### 7.3 Owner must confirm

| Item | Why it gates Phase 9 |
|---|---|
| **Registrable domain** to host platform subdomains | Determines the literal `hostname` written into every auto-created `PLATFORM_SUBDOMAIN` row (§15 DATABASE IMPACT) and the Tenant #1 backfill (§15 MIGRATION IMPACT) |
| **Wildcard DNS ownership** (`*.<domain>`) | §15 INFRASTRUCTURE IMPACT requires the wildcard on both the frontend host and the API |
| **Frontend / Vercel configuration** | The single shared Vercel deployment must serve every platform subdomain (§15: *"one Vercel deployment serving every custom domain"*) |
| **API / backend configuration** | The backend resolver reads `Host`; CORS must accept the platform origins (§15 INFRASTRUCTURE IMPACT: *"allow only verified `StoreDomain` hosts + fixed platform origins"*) |

### 7.4 Owner

Ops owner (confirmation), architecture owner (recording the config
surface).

---

## 8. P9-D7 — Verification Job Timing

### 8.1 What the repository says

Master Plan §15 BACKEND IMPACT (line 2113–2118): *"merchant adds a hostname
→ backend issues a `verificationToken` and instructions (add a DNS TXT
record, or CNAME to a platform target) → a verification job (**Phase 11
cron / on-demand**) checks DNS → `VERIFIED` → TLS provisioning … → `ISSUED`
→ traffic allowed."*

### 8.2 Facts to record (audit §11, §14 P9-D7)

- **On-demand verification is compatible with Phase 9** — §15's own
  wording names it alongside the cron.
- **Cron verification is identified as Phase 11** — §15 says *"Phase 11
  cron"*; Phase 11 is *"Async / Webhook / Worker"* (Master Plan §17), the
  phase that owns tenant-aware jobs.
- **`VERIFYING` only becomes meaningful if asynchronous verification is
  chosen** — a synchronous, on-demand DNS check moves a row directly from
  `PENDING` to `VERIFIED`/`FAILED`; an intermediate `VERIFYING` state
  exists to mark a check in flight. This couples P9-D7 to P9-D2 (§3.4):
  adopting `VERIFYING` under P9-D2 presupposes an async job somewhere; not
  adopting it constrains Phase 9 to synchronous checks (or to an async
  design without an in-flight marker).

### 8.3 Options

**A. On-demand only in Phase 9; cron deferred to Phase 11** (§15's own
sequencing).
**B. Both on-demand and a scheduled check in Phase 9.**
**C. Other owner decision.**

**This docket does not choose the implementation.**

### 8.4 Owner

Architecture owner.

---

## 9. P9-D8 — Phase 9 Resolver Kill-Switch

### 9.1 The requirement (Master Plan §15 ROLLBACK / RECOVERY, lines 2203–2206)

> The resolver has a kill-switch: fall back to "single store = Tenant #1's
> primary store" resolution (pre-Phase-9 behavior) if multi-domain
> resolution regresses, **without a redeploy**.

"Pre-Phase-9 behavior" is today's `storefront-tenant.resolver.ts:57–74`:
`Host` → `StoreDomain` first; if nothing resolves, the most-recently-created
`Tenant` (audit §13.1). §15 BACKEND IMPACT replaces the fallback with
*"Unknown host → 404 'store not found'"*. Switching between those two is an
isolation-enforcement change, and Master Plan §5 Principle 4 (*"No
tenant-isolation change without paired tests"*) applies to the flip.

The kill-switch must therefore be **defined before** the fallback is
removed (audit §14 P9-D8 dependencies), and *"without a redeploy"* implies
a runtime-readable control — no such flag exists today (audit §10).

### 9.2 Repository precedent and approaches named (none selected)

| Approach | Repository evidence |
|---|---|
| **Phase 3 advisory/enforced pattern** | Master Plan §12 lines 1236–1244: the Phase 3→4 isolation flip was *"flag-gated: set every module back to `advisory` (or a global …)"*, with per-module enforcement flags that could remain `advisory` for modules Phase 4 hadn't reached. Audit §10 names this *"the nearest precedent"*. |
| **Environment-variable flag** | Audit §10: *"Implies a runtime flag (env or `PlatformConfig`)"*. `docs/ops/PHASE-8-PRODUCTION-ACTIVATION.md:147` records that Render env-var changes *"take effect on the next deploy"* — whether that satisfies *"without a redeploy"* is for the owner to weigh against the §15 wording. |
| **`PlatformConfig` row** | Master Plan §4.4 D11: *"a `PlatformConfig` table is new in Phase 5 if needed"* — the repository names the table as a possibility; whether Phase 5 created it is not recorded in the audit. |
| **Other** | — |

**This docket does not select one.**

### 9.3 Owner

Architecture owner + Ops owner.

---

## 10. Decision Recording Format

Each record below is the form to be transcribed into `docs/saas/DECISIONS.md`
once the owner decides. ~~**`Owner Decision` is intentionally empty in every
record. No selection has been made.**~~ **Populated 2026-09-20 from the owner's
explicit decisions; transcribed to `DECISIONS.md` (P9-D1…P9-D8), which is the
canonical record.**

### P9-D1

| Field | Content |
|---|---|
| **Decision ID** | P9-D1 |
| **Question** | Which phase ships the customer-auth runtime deferred as "Phase 9/12": `CustomerRefreshToken` table, `/storefront/auth/*`, customer JWT issuance, `CUSTOMER_JWT_ACCESS_SECRET` provisioning/wiring, `customerId` cutover? |
| **Options** | A. Phase 9 owns all customer-auth runtime items. B. Phase 12 owns all customer-auth runtime items. C. Explicit recorded split (item-by-item assignment). |
| **Owner Decision** | **B — Phase 12 owns all customer-auth runtime items.** `CustomerRefreshToken`, `/storefront/auth/*`, customer JWT issuance, `CUSTOMER_JWT_ACCESS_SECRET` provisioning/wiring, and the `customerId` cutover remain Phase 12 responsibilities. (Ratified 2026-09-20; `DECISIONS.md` P9-D1.) |
| **Rationale** | Owner's explicit choice; no further rationale supplied beyond the itemisation. Resolves the "Phase 9/12" label in P2-D3/P2-D5/P2-D6/P2-D7/P2-D13/G-14/G-15/P4-D1 to Phase 12 without reopening any of them. |
| **Dependencies** | Upstream: P2-D3, P2-D5, P2-D6, P2-D7, P2-D13, G-14, G-15, P4-D1 (all frozen designs; none reopened). Downstream: P9-D4 (phase of filing); Phase 12 dependency wording (Master Plan §16 line 2556). |
| **Affected files** | `backend/test/e2e/identity-foundation.e2e-spec.ts:272`; `backend/test/e2e/support/fixtures.ts:505`; `backend/prisma/schema.prisma` (Customer block comments, lines 1670–1692, reference "Phase 9/12"); `backend/src/common/tenant/storefront-tenant.resolver.ts:19` (comment); `docs/saas/DECISIONS.md` summary rows 1701–1716, 1724. |
| **Follow-up actions** | Record in `DECISIONS.md`; update the "Phase 9/12" label in the affected summary rows to the decided phase; if A or C, enumerate the Phase 9 auth waves in the Phase 9 spec; if B, re-file P9-D4 under Phase 12. |

### P9-D2

| Field | Content |
|---|---|
| **Decision ID** | P9-D2 |
| **Question** | Which `StoreDomain` shape governs Phase 9's first migration — the shipped G-5-ratified schema, Master Plan §15's draft (`type`, `verificationMethod`, `lastCheckedAt`, `tlsStatus`, `VERIFYING`), or a recorded subset — and is amending the G-5-ratified `DomainVerificationStatus` set authorised? |
| **Options** | A. Adopt Phase 9 draft and amend the ratified enum. B. Adopt Phase 9 fields but preserve the ratified enum. C. Adopt a subset with a new recorded decision. D. Other explicitly documented owner decision. |
| **Owner Decision** | **B — Adopt the Phase 9 `StoreDomain` fields while preserving the G-5-ratified `DomainVerificationStatus` enum.** Add `type`, `verificationMethod`, `lastCheckedAt`, `tlsStatus` and the corresponding new enums those fields require. **DO NOT add `VERIFYING`.** `DomainVerificationStatus` remains `PENDING | VERIFIED | FAILED`. **No amendment to G-5 is authorised.** (Ratified 2026-09-20; `DECISIONS.md` P9-D2.) |
| **Rationale** | Owner's explicit choice; the owner's wording itself preserves G-5 and excludes `VERIFYING`. Disclosed consequence: the migration stays inside `migration-safety.spec.ts`'s existing `CREATE TYPE` + G-19 nullable `ADD COLUMN` allowances (no `ALTER TYPE … ADD VALUE` needed). |
| **Dependencies** | Upstream: G-5 (`DECISIONS.md:350–372`). Downstream: P9-D3 (`tlsStatus` semantics), P9-D7 (`VERIFYING` meaningful only if async). Gates the first Phase 9 migration. |
| **Affected files** | `backend/prisma/schema.prisma:1180–1187` (enum + "Ratified (G-5)" comment), `:1340–1367` (`StoreDomain` model + comment); a new file under `backend/prisma/migrations/` (none exists); `docs/saas/DECISIONS.md` G-5 record. |
| **Follow-up actions** | Record in `DECISIONS.md` (amend G-5 or add a new record per the chosen option); author the migration plan in the Phase 9 spec — not before. |

### P9-D3

| Field | Content |
|---|---|
| **Decision ID** | P9-D3 |
| **Question** | Which TLS certificate issuer / renewal mechanism does Phase 9 build against? |
| **Options** | A. Vercel-managed. B. Let's Encrypt through a proxy. C. Cloudflare for SaaS. D. Other. |
| **Owner Decision** | **A — Vercel-managed TLS.** Phase 9 builds the custom-domain integration around Vercel-managed domain/TLS provisioning. No separate proxy layer and no Cloudflare for SaaS layer. (Ratified 2026-09-20; `DECISIONS.md` P9-D3.) |
| **Rationale** | Owner's explicit choice; the owner's wording excludes a proxy and Cloudflare for SaaS. No further rationale supplied. D8 (hosting topology) is not reopened. |
| **Dependencies** | Upstream: Master Plan §4.3 line 601 (NOT FROZEN). Downstream: P9-D2 (`tlsStatus` state machine), P9-D6 (domain/DNS configuration), the provider interface in `store-domain.service.ts`. Does not reopen D8 (hosting topology). |
| **Affected files** | `backend/src/tenancy/store-domain.service.ts` (does not exist — §15-named); `frontend/vercel.json`; `backend/src/main.ts:38–40` (CORS); `docs/ops/ENVIRONMENT.md`, `docs/ops/DEPLOYMENT.md` (new config surface). |
| **Follow-up actions** | Record in `DECISIONS.md`; capture the provider interface shape and the `PENDING → ISSUED / ERROR` transitions in the Phase 9 spec; add ops confirmations to a pre-execution checklist. |

### P9-D4

| Field | Content |
|---|---|
| **Decision ID** | P9-D4 |
| **Question** | First-party or proxied cookie handling for customer sessions on custom domains, given `SameSite=Strict` and the shared-registrable-domain assumption custom domains break? |
| **Options** | First-party cookie handling. Proxied cookie handling. (The repository names only this axis.) |
| **Owner Decision** | **Re-file under Phase 12.** Customer authentication is owned by Phase 12 under P9-D1. Phase 9 does not implement customer-session cookie handling for custom domains. Phase 12 must resolve first-party vs proxied customer cookie handling as part of the customer-authentication implementation. Merchant/platform-admin sessions remain on the fixed platform domain. **The first-party-vs-proxied mechanism is NOT decided.** (Ratified 2026-09-20; `DECISIONS.md` P9-D4.) |
| **Rationale** | Owner's explicit choice, following from P9-D1 = B: the only cookie §15 ties to custom domains is the customer-auth cookie, which does not exist until Phase 12. The merchant refresh cookie (`auth.service.ts:398–420`) is unaffected and must not be modified by Phase 9. |
| **Dependencies** | Upstream: P9-D1 (load-bearing in Phase 9 only if customer auth ships in Phase 9; otherwise may be re-filed under Phase 12); P9-D3 (where TLS terminates affects whether a proxy exists to handle cookies). |
| **Affected files** | `backend/src/auth/auth.service.ts:398–420` (merchant cookie — reference only; §15 says merchant admin stays on the platform domain); the future `/storefront/auth/*` controller (does not exist). |
| **Follow-up actions** | Record in `DECISIONS.md` under the phase P9-D1 assigns; if Phase 12, note the re-filing explicitly in the record. |

### P9-D5

| Field | Content |
|---|---|
| **Decision ID** | P9-D5 |
| **Question** | Is the `platform-domains` approve/inspect surface a Phase 5 prerequisite (Master Plan §15 DEPENDENCIES, §22.3) or a Phase 9 deliverable (Master Plan §13 line 1503, §15 REPOSITORY AREAS, shipped Phase 5 code)? |
| **Options** | A. Phase 9 owns it. B. Reopen/extend Phase 5. C. Other owner decision. |
| **Owner Decision** | **A — Phase 9 owns the `platform-domains` approve/inspect surface.** The shipped Phase 5 deferral and the Master Plan §13 / §15 repository-area ownership are the operative scope for Phase 9. (Ratified 2026-09-20; `DECISIONS.md` P9-D5.) |
| **Rationale** | Owner's explicit choice, adopting the reading the shipped Phase 5 code already acted on. Master Plan §15 DEPENDENCIES / §22.3 wording is superseded for this item by pointer; the Master Plan is not edited. |
| **Dependencies** | None blocking. Affects the Phase 9 spec's wave list and whether the §22.2 Phase 5 prerequisite is recorded as fully satisfied. |
| **Affected files** | `backend/src/platform/` (no `platform-domains/`); `backend/src/platform/dto/platform-tenant-view.interface.ts:35`; Master Plan §15 DEPENDENCIES wording (documentation, not to be edited by implementation). |
| **Follow-up actions** | Record in `DECISIONS.md`; reflect in the Phase 9 spec's scope. |

### P9-D6

| Field | Content |
|---|---|
| **Decision ID** | P9-D6 |
| **Question** | Which registrable domain hosts platform subdomains (`{store-slug}.{platform-storefront-domain}`), and are wildcard DNS, frontend/Vercel, and API/backend configuration for it owned and available? Master Plan's `*.stores.printforge.app` is an example, not an established fact. |
| **Options** | Ops confirmation — the owner supplies the domain and confirms each of the four items in §7.3, or records that they are not yet available. |
| **Owner Decision** | **`stores.printforge.app`** is the intended platform storefront domain for Phase 9. **Ownership, `*.stores.printforge.app` wildcard DNS, Vercel domain configuration, and API/backend configuration are NOT proven by repository evidence** — the Phase 9 implementation spec must include an explicit pre-execution Ops confirmation checklist for all four. No secrets are recorded in `DECISIONS.md`. (Ratified 2026-09-20; `DECISIONS.md` P9-D6.) |
| **Rationale** | Owner's explicit choice, with the owner's own caveat that the choice is intent, not proof of provisioning. The four-item checklist gates the ops cutover wave. |
| **Dependencies** | Downstream: the `hostname` value of every auto-created `PLATFORM_SUBDOMAIN` row and the Tenant #1 backfill (§15 DATABASE / MIGRATION IMPACT); CORS platform origins; P9-D3 (DNS target for custom-domain CNAME). |
| **Affected files** | `backend/src/config/configuration.ts`, `backend/src/config/env.validation.ts`, `docs/ops/ENVIRONMENT.md` (new config var — none exists); `frontend/vercel.json`. |
| **Follow-up actions** | Record the confirmed domain in `DECISIONS.md` (value only, no secrets); add the config var to the Phase 9 spec's env surface. |

### P9-D7

| Field | Content |
|---|---|
| **Decision ID** | P9-D7 |
| **Question** | Is domain verification in Phase 9 on-demand only (cron deferred to Phase 11 per §15), or does Phase 9 also ship a scheduled check? |
| **Options** | A. On-demand only in Phase 9; cron deferred to Phase 11. B. Both on-demand and scheduled in Phase 9. C. Other owner decision. |
| **Owner Decision** | **A — On-demand verification only in Phase 9.** Scheduled/cron verification is deferred to Phase 11. Phase 9 may expose an explicit on-demand verification operation but must not introduce the Phase 11 scheduled verification worker. (Ratified 2026-09-20; `DECISIONS.md` P9-D7.) |
| **Rationale** | Owner's explicit choice, matching §15's own "Phase 11 cron" sequencing. Consistent with P9-D2 (no `VERIFYING`): the on-demand check is a synchronous `PENDING → VERIFIED | FAILED` transition. |
| **Dependencies** | Coupled to P9-D2 (`VERIFYING` meaningful only if verification is asynchronous); Phase 11 scope (Master Plan §17) if A. |
| **Affected files** | `backend/src/tenancy/store-domain.service.ts` (does not exist); any scheduler wiring (Phase 11 territory if A). |
| **Follow-up actions** | Record in `DECISIONS.md`; reflect in the Phase 9 spec and, if A, in Phase 11's deferred-items list. |

### P9-D8

| Field | Content |
|---|---|
| **Decision ID** | P9-D8 |
| **Question** | What runtime mechanism satisfies §15 ROLLBACK's requirement that multi-domain resolution can be reverted to pre-Phase-9 single-store resolution *without a redeploy*? |
| **Options** | Phase 3 advisory/enforced per-module flag pattern (Master Plan §12 lines 1236–1244). Environment-variable flag. `PlatformConfig` row (Master Plan §4.4 D11 names the table as a possibility). Other. |
| **Owner Decision** | **`PlatformConfig` row.** A runtime-readable `PlatformConfig`-based kill-switch so the resolver can be switched between Phase 9 domain resolution and the pre-Phase-9 single-store fallback without requiring a redeploy. **The exact runtime flag semantics must be defined in the Phase 9 implementation specification before the resolver fallback is removed.** (Ratified 2026-09-20; `DECISIONS.md` P9-D8.) |
| **Rationale** | Owner's explicit choice; the owner's wording supplies the rationale ("without requiring a redeploy", which a Render env var does not satisfy — `PHASE-8-PRODUCTION-ACTIVATION.md:147`). Disclosed dependency: no `PlatformConfig` model exists today; Phase 9 must add it by additive `CREATE TABLE`. Distinct from, not in conflict with, P3-D1 (env-var `TENANT_ENFORCEMENT_*` flags). |
| **Dependencies** | Must be defined before `storefront-tenant.resolver.ts`'s most-recent-tenant fallback is replaced by unknown-host → 404 (audit §13.1); Master Plan §5 Principle 4 (paired tests before the enforcement flip). |
| **Affected files** | `backend/src/common/tenant/storefront-tenant.resolver.ts:57–74`; `backend/src/common/tenant/tenant-context.guard.ts:152–185`; consumers listed in audit §3 (`cart`, `checkout`, `uploads`, `app-setting`, `tenant-lifecycle.guard`). |
| **Follow-up actions** | Record in `DECISIONS.md`; specify the kill-switch semantics (what "pre-Phase-9 behavior" means for each consumer) and the paired tests in the Phase 9 spec before any resolver change. |

---

## 11. Recommended Decision Order

This section identifies **dependency order only**. It does not rank
options or evaluate which choice within any decision is better.

| Order | Decision | Why it comes here (dependency, not merit) |
|:-:|---|---|
| 1 | **P9-D1** — Customer auth ownership | Determines *what Phase 9 is*. P9-D4's phase of filing depends on it (§5.4). Two existing tests change or not depending on it (§2.5). Nothing else in this docket can be scoped until it is known whether Phase 9 includes an auth subsystem. |
| 2 | **P9-D2** — `StoreDomain` schema reconciliation | Gates the first Phase 9 migration. Its `tlsStatus` column presupposes a P9-D3 answer for its state semantics, and its `VERIFYING` value presupposes a P9-D7 answer — but the *governance* question (whether G-5 may be amended, which fields are adopted) is independent of those and must be settled before either can be written into a spec. |
| 3 | **P9-D3** — TLS mechanism | Fixes the meaning of `tlsStatus` transitions (P9-D2's column), the provider interface, where TLS terminates (which P9-D4 depends on — a proxy either exists or does not), and the DNS target merchants are instructed to use (P9-D6). |
| 4 | **P9-D4** — Custom-domain cookies | Depends on P9-D1 (whether it is Phase 9's at all) and P9-D3 (whether a proxy is in the path). Blocking for Phase 9 only under P9-D1 = A or an applicable split. |
| 5 | **P9-D5** — `platform-domains` ownership | Independent of 1–4; affects the Phase 9 wave list. Placed after the blocking four because it changes scope breadth, not scope kind. |
| 6 | **P9-D6** — Platform storefront domain | Ops confirmation. Needed before the `PLATFORM_SUBDOMAIN` hostname value can be written into a migration/backfill plan; its CNAME target depends on P9-D3. |
| 7 | **P9-D7** — Verification job timing | Coupled to P9-D2 (`VERIFYING`) — if P9-D2 has already excluded `VERIFYING`, P9-D7's async option is constrained; if P9-D2 included it, P9-D7 says whether Phase 9 uses it. |
| 8 | **P9-D8** — Kill-switch | Must exist before the resolver's fallback is removed, but depends on nothing above except that Phase 9 proceeds at all. Last because it constrains implementation sequencing, not scope. |

Dependency edges, stated plainly:
- P9-D1 → P9-D4 (phase of filing).
- P9-D2 ↔ P9-D3 (`tlsStatus` semantics) and P9-D2 ↔ P9-D7 (`VERIFYING`).
- P9-D3 → P9-D4 (proxy in path or not); P9-D3 → P9-D6 (CNAME target).
- P9-D8 → first resolver change (sequencing, not decision content).
- P9-D5 has no incoming or outgoing edges within this docket.

---

## 12. Gate

**PHASE 9 IMPLEMENTATION STATUS:**
**BLOCKED UNTIL P9-D1 THROUGH P9-D4 ARE RATIFIED.**

No implementation may begin before those decisions are recorded in:

`docs/saas/DECISIONS.md`

P9-D5 through P9-D8 should be ratified in the same pass where possible, but
their absence does not by itself hold the gate (audit §15). Once P9-D1
through P9-D4 are recorded, the next artefact is the Phase 9 start-gate and
implementation spec (audit §16) — spec only, no code — not implementation.

---

## 13. Closure outcome (2026-09-20)

The owner supplied explicit decisions for all eight items in one pass
("OWNER DECISIONS" instruction, 2026-09-20). Each was verified against this
docket's option axis and against every existing `RESOLVED`/`APPROVED` record
it touches before recording; **no supplied decision conflicts with an existing
ratified decision.** Full records, verbatim approval wording, dependencies and
follow-ups: `docs/saas/DECISIONS.md` — "Phase 9 Decision Records".

| ID | Ratified as | Blocking? | Note |
|---|---|:-:|---|
| **P9-D1** | **B** — Phase 12 owns all customer-auth runtime items | was blocking — **CLEARED** | "Phase 9/12" → Phase 12 for P2-D3/D5/D6/D7/D13, G-14/G-15, P4-D1; none reopened |
| **P9-D2** | **B** — adopt `type`, `verificationMethod`, `lastCheckedAt`, `tlsStatus` + enums; **G-5 preserved; no `VERIFYING`** | was blocking — **CLEARED** | No G-5 amendment authorised |
| **P9-D3** | **A** — Vercel-managed TLS; no proxy; no Cloudflare for SaaS | was blocking — **CLEARED** | D8 not reopened |
| **P9-D4** | **Re-filed under Phase 12**; mechanism not decided | was blocking — **CLEARED** (by re-filing) | Merchant cookie untouched in Phase 9 |
| **P9-D5** | **A** — Phase 9 owns `platform-domains` | non-blocking — recorded | Master Plan §15 DEPENDENCIES wording superseded by pointer |
| **P9-D6** | `stores.printforge.app` (intent); ownership/DNS/Vercel/API **UNCONFIRMED** | non-blocking — recorded | Mandatory ops pre-execution checklist in the spec |
| **P9-D7** | **A** — on-demand only; cron → Phase 11 | non-blocking — recorded | Consistent with no `VERIFYING` |
| **P9-D8** | `PlatformConfig` row; semantics → spec | non-blocking — recorded | Requires a new additive `PlatformConfig` table (none exists) |

**PHASE 9 DECISION GATE: SATISFIED** — P9-D1 through P9-D4 are all ratified in
`DECISIONS.md`. Per §12, the next artefact is
`docs/saas/PHASE-9-START-GATE-AND-IMPLEMENTATION-SPEC.md` — **spec only, no
code** — authored under these records and itself subject to owner review
before any implementation begins. No implementation, schema, migration,
infrastructure, or production change accompanies this closure.
