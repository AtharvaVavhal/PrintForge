# PHASE 9 — Store / Domain Resolution: Start-Gate and Implementation Specification

| | |
|---|---|
| Status | **APPROVED FOR IMPLEMENTATION — G-21** (`docs/saas/DECISIONS.md` → `## G-21 — Phase 9 specification approval`, **APPROVED** 2026-09-20). This document is the Phase 9 implementation contract; implementation proceeds wave by wave per §2, starting at Wave 0 (not yet started at the time of this status update). *(Previously: DRAFT FOR OWNER REVIEW — SPEC ONLY. NOT APPROVED. NO IMPLEMENTATION AUTHORIZED, pending a G-20-style approval record.)* **Spec review 2026-09-20 (S-1 / S-6):** S-1 resolved by making the storefront-host security model explicit (§4.1.1–§4.1.4, §4.4, §11); S-6 resolved with **no schema change** — the verification failure reason is retained operationally, not on `StoreDomain` (§6.3). Both remain listed in §21 as RESOLVED for traceability. **Final spec decisions 2026-09-20 (later same day):** S-2, S-7, S-14 ratified by the owner as `DECISIONS.md` **P9-S2 / P9-S7 / P9-S14**; S-9 corrected to mode-coupled CORS; S-5 slug-immutability clarified; every §21 item is now RESOLVED. **SPEC STATUS: READY FOR IMPLEMENTATION REVIEW** (G-21 still required before any wave). |
| Date | 2026-09-20 |
| Authored under | `docs/saas/DECISIONS.md` — Phase 9 Decision Records **P9-D1 … P9-D8** (all `RESOLVED — RATIFIED`, 2026-09-20) |
| Question sheet | `docs/saas/PHASE-9-DECISION-DOCKET.md` (CLOSED) |
| Evidence base | `docs/saas/PHASE-9-START-GATE-AUDIT.md`; `docs/saas/PRINTFORGE-SAAS-IMPLEMENTATION-MASTER-PLAN-v1.0.md` §15 (lines 2063–2211), §22 |
| Commit | `07d98ff` (`main`) |
| Contains code? | **No.** This document is a blueprint. It names files, routes, columns, states and tests; it does not contain implementation code, migration SQL, or configuration values. Where a name is given (enum value, config key, route path) it is a specification the implementation must follow, not code. |
| Legend | 🗂 repository-derived fact · ⚖️ ratified decision (cited) · 📐 specification (binding once G-21 is approved) · 🔎 **SPEC DECISION** — a design choice this spec makes because neither §15 nor P9-D1…D8 fixed it; each is listed in §21 for the owner to confirm or overrule at review |

---

## 0. Scope Boundary (read first)

Phase 9 establishes, server-side and on every storefront request:

```
Host / Domain  →  StoreDomain  →  Store  →  Tenant  →  store-specific context
```

The deployment model is unchanged (⚖️ D8; invariant 11): **one shared NestJS backend on Render, one shared React frontend on Vercel, one PostgreSQL database, many Stores/Tenants, many hostnames.** Nothing in this spec creates a per-store backend, frontend, or deployment.

Phase 9 is **not** the Phase 12 storefront/theme system. It builds the context foundation (`GET /storefront/context`, `StoreContextProvider` shell, per-store SEO routes) that Phase 12's theming, branding and hook sweep will consume. §20 lists every deferral.

Phase 9 is **not** customer authentication (⚖️ P9-D1 = B). No customer cookie, token, table, route or secret is touched (⚖️ P9-D4 re-filed to Phase 12).

---

## 1. Ratified Phase 9 Decisions (restated; `DECISIONS.md` is canonical)

| ID | Ratified | Binding effect on this spec |
|---|---|---|
| **P9-D1** | **B** — Phase 12 owns all customer-auth runtime items (`CustomerRefreshToken`, `/storefront/auth/*`, customer JWT issuance, `CUSTOMER_JWT_ACCESS_SECRET`, `customerId` cutover) | No auth wave. `identity-foundation.e2e-spec.ts:272` (`AC-P2-02`) and `fixtures.ts:505` stay green and unmodified. |
| **P9-D2** | **B** — add `type`, `verificationMethod`, `lastCheckedAt`, `tlsStatus` + their enums; **G-5 `DomainVerificationStatus = {PENDING, VERIFIED, FAILED}` preserved; no `VERIFYING`** | §3 migration: three `CREATE TYPE`s + four G-19-shaped nullable `ADD COLUMN`s; no `ALTER TYPE`. |
| **P9-D3** | **A** — Vercel-managed TLS; no proxy; no Cloudflare for SaaS | §7: a provider-neutral `DomainHostingProvider` interface with a single Vercel adapter. |
| **P9-D4** | **Re-filed under Phase 12**; mechanism undecided; merchant/platform-admin sessions stay on the fixed platform domain | §8: no cookie/session change in Phase 9; `auth.service.ts:398–420` untouched. |
| **P9-D5** | **A** — Phase 9 owns `platform-domains` | §6.4 / W6: `@PlatformOnly()` approve/inspect surface. |
| **P9-D6** | `stores.printforge.world` (intent); ownership/wildcard DNS/Vercel/API config **UNCONFIRMED** | §17: mandatory four-item Ops checklist gating W8. |
| **P9-D7** | **A** — on-demand verification only; cron → Phase 11 | §6.3: synchronous verify operation; no scheduler registration. |
| **P9-D8** | `PlatformConfig` row kill-switch; semantics defined here, before the fallback is removed | §15 (this spec) defines the flag; W2 ships it **before** W3 changes resolver behaviour. |

---

## 2. Implementation Waves (Master Plan §15 translated; sequential unless stated)

| Wave | Name | §15 area | Depends on | Gate to start | Gate to exit |
|:-:|---|---|---|---|---|
| **W0** | Pre-execution confirmations | INFRASTRUCTURE | — | G-21 approved | §17 checklist items recorded (yes / no / not yet). **Nothing in W0 modifies production.** |
| **W1** | Additive schema | DATABASE | W0 (G-21 only) | — | Migration passes `migration-safety.spec.ts` unmodified; `prisma migrate deploy` on dev/CI; **not** applied to production in this wave |
| **W2** | `PlatformConfig` kill-switch | ROLLBACK | W1 | — | Flag readable/writable via platform console with audit; default = legacy; paired tests green |
| **W3** | Resolver (host → store → tenant) | BACKEND | W2 | §15 paired tests exist (Principle 4) | `domain-resolution.e2e-spec.ts` green in both modes; kill-switch flips behaviour without restart |
| **W4** | Storefront context + public-read scoping | BACKEND | W3 | — | `GET /storefront/context` live; public catalog/settings reads scoped by resolved store in `host_resolution` mode |
| **W5** | Canonical redirect + per-store `robots.txt`/`sitemap.xml` | BACKEND / FRONTEND | W4 | — | Per-store SEO routes differ by host; non-primary host → 301 |
| **W6** | Custom-domain onboarding, verification, Vercel TLS adapter, platform-domains | BACKEND | W3 | Vercel credential **name** provisioned (value by ops) | Merchant can add → verify → (Vercel) → served; platform can inspect/override; audit written |
| **W7** | CORS dynamic allow-list + frontend host-awareness | INFRASTRUCTURE / FRONTEND | W4, W6 | — | No hard-coded `printforge.in` in `siteConfig.ts`; CORS admits only allow-listed origins **in `host_resolution` mode and only `FRONTEND_URL` in legacy mode** (S-9); dry-run endpoint live; component tests green |
| **W8** | Ops cutover | INFRASTRUCTURE / MIGRATION | W1–W7 + **§17 checklist all "yes"** | fresh verified backup (G-9) | Production on `host_resolution`; canary green; rollback rehearsed |

W6 may run in parallel with W4–W5 once W3 is merged (independent code areas). W7's frontend half may start after W4 (it consumes `GET /storefront/context`).

---

## 3. Database Migration Plan (W1 — additive only)

### 3.1 New enums (`CREATE TYPE` — allowed by the guard)

📐 Names are this spec's; exact casing follows the repository's existing enum style (`DomainVerificationStatus`, `StoreStatus`).

| Enum | Values | Backs column |
|---|---|---|
| `StoreDomainType` | `PLATFORM_SUBDOMAIN`, `CUSTOM` | `StoreDomain.type` |
| `DomainVerificationMethod` | `DNS_TXT`, `CNAME` | `StoreDomain.verificationMethod` |
| `TlsStatus` | `PENDING`, `ISSUED`, `ERROR` | `StoreDomain.tlsStatus` |

⚖️ `DomainVerificationStatus` is **not touched** (P9-D2; G-5). No `ALTER TYPE` statement of any kind appears in the migration.

### 3.2 `StoreDomain` columns (`ALTER TABLE "store_domains" ADD COLUMN` — one statement each, G-19 shape)

| Column | Type | Nullable | DB default | Why nullable/no-default |
|---|---|:-:|:-:|---|
| `type` | `StoreDomainType` | yes | none | G-19: nullable, no default, one action per statement |
| `verificationMethod` | `DomainVerificationMethod` | yes | none | same |
| `lastCheckedAt` | `timestamp` | yes | none | same |
| `tlsStatus` | `TlsStatus` | yes | none | same |

📐 **Application-level defaults (P6-D1 pattern — nullable column + backfill + app-level default):**
- `type IS NULL` is read as **`CUSTOM`** (fail-closed: a row with unknown type is subject to the strictest serving rule).
- `tlsStatus IS NULL` is read as **`PENDING`** for `CUSTOM` rows (not served); it is **not consulted** for `PLATFORM_SUBDOMAIN` rows (the wildcard certificate covers them — §7.2).
- `verificationMethod IS NULL` and `lastCheckedAt IS NULL` carry no serving semantics.

W2/W8 backfill sets `type` explicitly on every existing row (§16), so the null-reading rules exist for safety, not as the steady state.

### 3.3 `PlatformConfig` table (`CREATE TABLE` — allowed; required by P9-D8)

🗂 No `PlatformConfig` model exists (`schema.prisma` search). ⚖️ P9-D8 requires one.

📐 Shape: `id`, `key` (unique), `value` (text), `updatedByUserId` (FK → `User`, `onDelete: Restrict`, nullable for seed), `createdAt`, `updatedAt`. Platform-owned like `plans` / `platform_audit_logs`: **no `tenantId`**, **not RLS-enabled**, never reachable through a tenant-scoped client. Mapped to `platform_config`.

🔎 **SPEC DECISION S-3:** a generic key/value table rather than a single-purpose `storefront_resolution_mode` table, so future platform-level runtime switches reuse it without another migration. Keys are constants in code, never client-supplied.

### 3.4 Indexes

🗂 `store_domains.hostname` is already `@unique` (schema line 1353) — the hot-path index exists. `PlatformConfig.key` unique index is created with the table (same-file `CREATE UNIQUE INDEX`, allowed).

### 3.5 Guard compliance

📐 The migration file contains only: 3 × `CREATE TYPE`, 1 × `CREATE TABLE` (+ its own `CREATE UNIQUE INDEX` / FK `ALTER TABLE` on the table created in the same file), 4 × single-action nullable `ALTER TABLE "store_domains" ADD COLUMN`. Every statement is within `backend/src/migration-safety.spec.ts`'s existing allowances (header lines 12–30). **The guard is not modified.** A positive test naming the new migration is added; CI must pass with the guard unchanged.

### 3.6 RLS note

🗂 `store_domains` is RLS-enabled (Phase 3 migration `20260907183000_enable_rls_tenancy_tables`). Adding nullable columns does not alter policies. Hostname lookup remains a named platform-scoped operation via `withPlatformRlsBypass` (as `tenant-context.guard.ts:161–166` and `storefront-tenant.resolver.ts:59–64` already do).

### 3.7 Production application

W1 authors and CI-validates the migration. **Applying it to production is W8**, after a fresh verified backup (G-9), and is listed in §17 as an explicit operator action. Additive → image-revert safe (§15 ROLLBACK).

---

## 4. Backend Domain-Resolution Architecture (W3)

### 4.1 The storefront-host signal (🔎 SPEC DECISION S-1 — refines §15's "Host header")

🗂 The API is served **cross-origin**: `VITE_API_BASE_URL` points at the backend's own origin — in production the Render service origin (`docs/ops/ENVIRONMENT.md`; corrected 2026-09-25 under ⚖️ P9-D10, which found the previously documented `api.printforge.in` has never been delegated), `withCredentials: true` (`frontend/src/services/api/client.ts:27`). For a browser API call the backend's `Host` header is therefore the **API host**, never the store host. This is why today's `StorefrontTenantResolver.resolveTenantId(request.hostname)` never matches a `StoreDomain` and always falls through to the most-recent-tenant fallback (`storefront-tenant.resolver.ts:57–74`).

📐 Phase 9 defines the **storefront-host signal** per request class:

| Request class | Signal | Trust basis |
|---|---|---|
| Browser → API (all `/api/v1/*` storefront calls) | `Origin` request header → its host | Set by the browser on every cross-origin fetch/XHR; not settable by page script. Already the input CORS validates. |
| Edge-forwarded SEO routes (`/robots.txt`, `/sitemap.xml`, crawler-fetched on the store host) | Host captured by the Vercel rewrite and passed as a query parameter (§12.2) | Selects **public** data only. |
| Any other direct request to the API host with no `Origin` | none → **unresolved** | Non-browser callers get no storefront scope. |

📐 **Trust model (binding):** the storefront-host signal selects **which store's public/storefront scope** a request operates in — nothing more. It never confers merchant or platform authorization (that stays membership-based, ⚖️ D6, and `@PlatformOnly()`). A spoofed signal can only select a store the caller could reach by visiting it. Unknown or unverified hosts are **never** served (§15 SECURITY IMPACT, invariant 17). The signal is validated against `StoreDomain` rows on every resolution; it is never trusted as an identifier.

#### 4.1.1 Request-flow model (binding)

```
Browser on a store domain  (https://shop-a.example  |  https://a.stores.printforge.world)
    ↓  browser sets  Origin: https://shop-a.example   (page script cannot set or alter it)
API request → https://<api-origin>/api/v1/…            (Host = the API host, NOT the store)
    ↓  CORS predicate (§9): Origin ∈ allow-list?  else: no CORS headers, browser blocks the response
    ↓  StoreContextMiddleware: Origin → normalise (§4.2) → UNTRUSTED lookup key
resolver:  key → StoreDomain row  (platform-scoped read, cached §4.6)
    ↓  row must exist; CUSTOM rows must be VERIFIED + ISSUED; PLATFORM_SUBDOMAIN always-on
validated StoreDomain
    ↓  Store  (live read; must be ACTIVE)
    ↓  Tenant (live read; must be ACTIVE; subscription not EXPIRED)
request.storeContext = { storeId, tenantId, … }          ← the ONLY thing downstream code reads
    ↓
authorization / isolation:
    public reads        → filtered by storeContext.tenantId / storeId
    shopper resources   → owned by the authenticated userId (JWT) AND, where the row carries it,
                          the row's own tenantId; never by Origin
    create paths        → tenantId from the parent resource (P4-D2) or from storeContext
    merchant routes     → TenantContextGuard (membership, D6) — NEVER reads Origin
    platform routes     → PlatformGuard / @PlatformOnly() — NEVER reads Origin
    RLS (D4)            → app.tenant_id set from the server-derived tenantId, never from Origin
```

`Origin` is an **untrusted input to a controlled lookup**. It is never stored, never echoed into a response body, never compared to any tenant identifier a client sent, and never consulted by any guard that grants merchant or platform authority.

#### 4.1.2 Validation that must succeed before `Origin` can select a store (in order)

1. **Syntax.** `Origin` parses as `<scheme>://<host>[:<port>]`; scheme is `https` in production (`http` only in `development`/`test`); no path, query, userinfo or fragment; host is a valid DNS hostname after §4.2 normalisation. The literal `null` (sandboxed iframes, some redirects) fails this step.
2. **CORS allow-list** (§9) admitted the same value — the predicate and the resolver share one lookup, so a request that reaches the resolver has already been origin-checked, and a request the resolver rejects never receives CORS headers.
3. **Row existence.** The normalised host matches exactly one `StoreDomain.hostname` (globally unique).
4. **Serving gate.** `type = PLATFORM_SUBDOMAIN`, or `type = CUSTOM` with `verificationStatus = VERIFIED` **and** `tlsStatus = ISSUED`. `type IS NULL` is treated as `CUSTOM` (§3.2).
5. **Liveness.** `Store.status = ACTIVE`; `Tenant.status = ACTIVE`; subscription not `EXPIRED` — read live, not from cache.

Only after all five does `request.storeContext` exist. Any failure yields the outcome in §4.1.3; the request never proceeds with a partial or guessed context.

#### 4.1.3 Failure behaviour by `Origin` case (`host_resolution` mode)

| `Origin` case | Resolver outcome | Storefront route response | CORS |
|---|---|---|---|
| **Absent** (no header) | unresolved | `@Public()` storefront reads and storefront writes: **404** generic (no store scope can be derived). Non-storefront routes (health, merchant `/admin/*`, `/platform/*`, auth, webhooks) are unaffected — they never needed a store scope | not a CORS request |
| **Malformed** (`null`, non-URL, path present, bad host, wrong scheme in production) | unresolved | **404** generic | denied |
| **Unknown host** (no `StoreDomain` row) | `STORE_NOT_FOUND` | **404** generic | denied |
| **Unverified / TLS-pending custom domain** | `NOT_SERVED` | **404** generic — byte-identical to unknown (S-4) | denied |
| **Platform subdomain** (`x.stores.printforge.world`, exactly one label) | serve → liveness | **200**, or **503** if store/tenant/subscription not live | allowed |
| **Fixed platform/admin origin** (`FRONTEND_URL` host — the shared frontend's own deployment origin) | `STORE_NOT_FOUND` — **no `StoreDomain` row, by decision** | **404** generic for storefront routes, **intentionally** (⚖️ **P9-D11**, 2026-09-25 — see §4.1.3a). Non-storefront routes — health, merchant `/admin/*`, `/platform/*`, auth, webhooks — are unaffected: they never use `Origin` to derive a store | **allowed** (always, §9) — and this admission does **not** imply storefront resolution; see §4.1.3a |
| **Verified custom domain, non-primary** | `RESOLVED` with `isPrimary=false` | **200** — the API serves; canonicalisation is the SPA's/edge's job (§11) | allowed |
| **Server-to-server / non-browser** (no `Origin`, or a forged one) | as the rows above | A forged `Origin` naming a served store selects that store's scope exactly as a browser on that store would — see §4.1.4 | n/a for non-browsers |

In `legacy_single_store` mode none of these outcomes is produced (§4.5); the mode switch is the kill-switch (§15).

#### 4.1.3a The deployment origin is not a storefront hostname (⚖️ P9-D11 — decided 2026-09-25)

⚖️ **P9-D11 (OPTION C).** The shared frontend's Vercel deployment origin — the value of
`FRONTEND_URL`, currently a `*.vercel.app` URL — is an **internal deployment origin only**. It is
**not** a customer-facing storefront hostname. The rule, in full:

| | Rule |
|---|---|
| Role | Internal Vercel deployment origin, and the platform/admin console origin |
| `StoreDomain` row | **Does not require one, and must not be given one** |
| `PLATFORM_SUBDOMAIN`? | **No.** §5 derives that type's hostname as `{store.slug}.{PLATFORM_STOREFRONT_DOMAIN}`; an arbitrary host cannot hold it |
| `CUSTOM`? | **No** |
| Tenant #1's `canonicalOrigin`? | **No** — that is Tenant #1's primary row (§11, §16.2) |
| Storefront requests to it under `host_resolution` | **Intentionally not served** — the generic unknown-host **404** (§4.1.3, 🔎 S-4). This is the designed outcome, not a defect |
| How customers reach a storefront | Only through the store's configured hostname — `{store.slug}.stores.printforge.world` (always-on, §5) or a `VERIFIED` + `ISSUED` `CUSTOM` domain (§4.3) |

⚠️ **CORS ADMISSION DOES NOT IMPLY STOREFRONT RESOLUTION.** These are two independent
mechanisms, and confusing them is the specific misreading this section exists to prevent.

`storefront-cors.policy.ts` admits `FRONTEND_URL` in **both** modes, from
`evaluateOriginIndependentOfMode()`, before the resolution mode is even read — verdict
`platform_admin_origin`. That is deliberate and unconditional: denying it would lock an operator
out of the very console needed to fix the mode flag. The resolver
(`store-context.service.ts:resolveByOrigin` → `store-domain-resolver.service.ts:resolveHost`) has
**no corresponding exemption** and never has: with no `StoreDomain` row it raises
`StoreNotFoundException`.

So an operator **will** observe, in production, after the flip:

```
Access-Control-Allow-Origin: https://<the-deployment-origin>     ← CORS: admitted
HTTP 404  { generic store-not-found }                            ← resolver: not a storefront
```

**Both lines are correct simultaneously.** The header means "a browser on the admin origin may read
this response"; it does **not** mean the deployment URL is a storefront hostname. §4.1.4 makes the
same point from the other direction: CORS is not authorization, and admission grants no tenant and
no store scope.

📐 **Why no row.** Registering the deployment origin as a `CUSTOM` row would bind it to Tenant #1's
storefront identity — anonymous `@Public()` catalog reads at that origin would scope to Tenant #1
(`resolvePublicScope`). Harmless under ⚖️ D3 (one production tenant), but it would make the platform's
own console origin permanently one tenant's storefront, for no benefit the store's real hostnames do
not already provide. P9-D11 declines that coupling.

📐 **Unchanged by P9-D11:** ⚖️ P9-D6 (`stores.printforge.world`), ⚖️ P9-D10
(`www.printforge.world` as Tenant #1's `CUSTOM` canary), §5 platform-subdomain derivation, the §4.3
serving gates, the host-resolution architecture, and the §9 CORS platform-admin-origin behaviour.

#### 4.1.4 Why a forged `Origin` is not a boundary violation

A non-browser client can send any `Origin`. What it obtains is bounded by what `request.storeContext` is allowed to do, and every consumer is one of three kinds:

| Consumer kind | What `storeContext` does | What forging `Origin` to store B yields | Boundary crossed? |
|---|---|---|---|
| **Public reads** (`products`, `categories`, public `app-setting` keys, `storefront/context`, SEO routes) | Filters to B's *public* rows | B's public catalog — obtainable by anyone visiting B | **No** |
| **Shopper-owned resources** (cart, orders, uploads, reviews, account) | Supplies `tenantId` only on the *create* branch of a new cart/upload (P4-D2); every read/update is scoped by the authenticated `userId` (JWT) — e.g. `getOwnedItemOrThrow(userId, …)`, `orders.controller.ts:55 userId: user.id` | A cart or upload the caller **owns**, created under B — identical to the caller visiting B and doing the same | **No** — the caller sees only their own rows |
| **Tenant business rows** (merchant `/admin/*`), **platform rows** (`/platform/*`) | **Nothing** — these routes never read `storeContext`; authority comes from `TenantMembership` (D6) or `platformRole` | Nothing | **No** — `Origin` is not an input |

The one place a forged scope could *combine* tenants is a create path that takes a client-supplied foreign id (e.g. `productId`) and stores it under the resolved tenant. 🗂 **Pre-existing gap, disclosed:** `cart.service.ts:100` loads the product by id only (`prisma.product.findUnique({ where: { id } })`) with no check against `cart.tenantId`; the W6 composite FK `cart_items(storeId, productId)` (`20260909024619_w6_composite_fks_and_uniques/migration.sql:84`) is inert because `storeId` is never populated (`primary-store.ts` comment). This gap exists **today**, with or without `Origin`, because `productId` is client-supplied. **W4 closes it** (§4.4): every storefront lookup of a client-supplied id is scoped to the resolved/parent tenant. After W4, a forged scope B plus A's `productId` is a 404, not a cross-tenant row. This is what makes the I-3 negative test (§13) meaningful.

**Conclusion (S-1):** `Origin` is safe to use as the storefront-host signal because it is only ever a lookup key into `StoreDomain`, the lookup is gated by verification/TLS/liveness, the resulting context can only narrow (filter) or attribute (own-row create), and no authority-granting guard reads it. Forging it selects a store the forger could reach by visiting it; it cannot reach another tenant's non-public rows or another user's rows.

### 4.2 Host normalisation

📐 Lowercase; strip port; strip trailing dot; reject anything that is not a syntactically valid hostname; reject `localhost`/IP literals outside `NODE_ENV=test|development`. The normalised value is the only lookup key.

### 4.3 Resolution pipeline (`host_resolution` mode)

```
normalise(host)
  → StoreDomain by hostname (platform-scoped lookup, cached)
      none                                   → STORE_NOT_FOUND
      type=CUSTOM & (verificationStatus≠VERIFIED | tlsStatus≠ISSUED) → NOT_SERVED
      type=PLATFORM_SUBDOMAIN                → serve (verification/TLS not consulted)
  → Store   status≠ACTIVE                    → STORE_UNAVAILABLE(store)
  → Tenant  status≠ACTIVE                    → STORE_UNAVAILABLE(tenant)
            subscription EXPIRED             → STORE_UNAVAILABLE(subscription)
  → RESOLVED { storeId, tenantId, storeDomainId, isPrimary, canonicalOrigin }
     (isPrimary=false is RESOLVED, not a redirect — the API never 301s a cross-origin
      fetch; canonicalisation is performed by the SPA / edge, §11)
```

📐 Outcome → HTTP mapping for storefront endpoints:

| Outcome | Response | Body discipline |
|---|---|---|
| `STORE_NOT_FOUND` | **404** | Generic "store not found"; no tenant/store enumeration, no hint whether the hostname exists in any state |
| `NOT_SERVED` (unverified / TLS not issued custom host) | **404** | Identical body to `STORE_NOT_FOUND` — an attacker cannot distinguish "unknown" from "pending" |
| `STORE_UNAVAILABLE(store)` | **503** | "store unavailable" — distinct from `STORE_NOT_FOUND` (§15: *store status and subscription status are different facts*) |
| `STORE_UNAVAILABLE(tenant)` / `(subscription)` | **503** | Same body as `(store)` — the *reason* is logged server-side with `tenantId`, not exposed |
| `RESOLVED`, `isPrimary=false` | request proceeds | `canonicalOrigin` in context; the SPA redirects itself (§11). Edge-served SEO routes on a non-primary host **do** 301 (§11, §12) |
| `RESOLVED` | request proceeds | `request.storeContext` populated |

🔎 **SPEC DECISION S-4:** `NOT_SERVED` returns the same 404 as `STORE_NOT_FOUND` (not a distinct status) to avoid leaking hostname-registration state. `STORE_UNAVAILABLE` sub-reasons share one body for the same reason.

📐 Subscription status is read through the existing Phase 7 `Subscription` state (⚖️ P7-D1 matrix); only `EXPIRED` blocks serving — `PAST_DUE`/`PAUSED`/`CANCELLED`(within retention) do not, matching §15's wording ("subscription not EXPIRED/deleted").

### 4.4 Request context

📐 `request.storeContext` (new, distinct from the merchant `request.tenantContext`): `{ storeId, tenantId, storeDomainId, isPrimary, canonicalOrigin, resolvedBy: 'origin' | 'edge' | 'legacy' }`. Attached by a new **`StoreContextMiddleware`/guard** that runs for `@Public()` storefront routes and for storefront (non-membership) authenticated routes — the exact hook point mirrors where `StorefrontTenantResolver` is called today (`cart`, `checkout`, `uploads`, `app-setting`), consolidated so each consumer reads `request.storeContext` instead of calling the resolver itself.

📐 The merchant path (`TenantContextGuard.resolveFromHost`, ⚖️ D6) is **unchanged in semantics**: `Host` (never `Origin`) → `StoreDomain` → tenant, then membership cross-check. It adopts the same normalisation (§4.2) and the same cached lookup (§4.6). Merchant/platform admin stays on the fixed platform domain (⚖️ P9-D4), so no merchant-console host routing is added. **Binding:** `TenantContextGuard`, `PlatformGuard`/`@PlatformOnly()`, `SupportSessionContextGuard`, `PermissionsGuard` and `JwtAuthGuard` do not read `Origin` and do not read `request.storeContext`; `StoreContextMiddleware` runs after `JwtAuthGuard` and never sets, overrides or consults `request.tenantContext`.

📐 **W4 tenant anchoring of client-supplied ids (closes the gap disclosed in §4.1.4):** in every storefront path that accepts a client-supplied foreign id — `cart` add/update item (`productId`, `variantId`, `customizationFieldId`, `uploadedFileId`), `checkout` (coupon code), `reviews` (`productId`), `uploads` attach — the referenced row must be loaded **scoped to the parent resource's `tenantId`** (the cart's, the order's) or, for a brand-new parent, to `storeContext.tenantId`, using the tenant-scoped client (D4). A mismatch is a **404** (not 403 — no existence leak, Principle 4). Shopper-owned reads (`orders`, `account`, cart contents) remain scoped by the authenticated `userId` as today; Phase 9 adds no store filter to them (store-scoped customer identity is Phase 12, ⚖️ P9-D1).

### 4.5 `legacy_single_store` mode (pre-Phase-9 behaviour, kept verbatim)

📐 When the kill-switch (§15) is `legacy_single_store`, the pipeline is bypassed and `request.storeContext` is derived exactly as `StorefrontTenantResolver` does today: host lookup first, else most-recently-created `Tenant` → its primary `Store` via `resolvePrimaryStoreId` (`primary-store.ts`). No 404/503/301 outcomes are produced in this mode. **This is the only fallback that exists; it is not enhanced.**

### 4.6 Cache

📐 In-process map `normalisedHost → resolution row` with TTL **15 s**; explicit bust on every `StoreDomain` write path (§6) and on every `Store`/`Tenant` status write (`platform.controller.ts` suspend/resume; store enable/disable). `Store.status`/`Tenant.status`/subscription are read **live** (not from the cache) per §15 KEY RISKS ("disabled-store check is on the live `Store` row, not cached"); only the hostname → `{storeId, tenantId, type, verificationStatus, tlsStatus, isPrimary}` row is cached. Render is single-instance today; TTL bounds staleness if that changes (D8 revisit).

### 4.7 Placement

📐 New `backend/src/common/tenant/store-domain-resolution/` (resolver, cache, outcomes, middleware). `StorefrontTenantResolver` becomes the `legacy_single_store` strategy behind the same façade rather than being deleted — its comment block (lines 8–46) is updated to say so. §15's suggested `backend/src/tenancy/` directory is **not** created (the repository's tenant code lives in `common/tenant/`; consistency wins).

---

## 5. Platform Subdomain Handling

📐 Every `Store` gets exactly one `PLATFORM_SUBDOMAIN` row: `hostname = "{store.slug}.stores.printforge.world"` (⚖️ P9-D6; the base domain is the config value §5.2), `verificationStatus = VERIFIED` at creation (the platform controls that DNS zone), `verificationMethod = null`, `tlsStatus = null` (not consulted — wildcard certificate, §7.2), `isPrimary = true` **unless** the store already has a primary domain.

📐 Creation points: (a) the W2 backfill for every existing `Store` (§16); (b) the existing store-creation path (`seed-tenant-bootstrap.ts` and any Phase 5 tenant/store provisioning service) gains the row in the same transaction. Slug collisions are impossible by construction only if `Store.slug` is globally unique — 🗂 it is not (`schema.prisma:1303` shows `slug String` with no `@unique`). 🔎 **SPEC DECISION S-5:** the platform subdomain uses `store.slug` and the implementation must add a **pre-insert uniqueness check on the derived hostname** (the `hostname @unique` constraint is the DB backstop); a collision fails the store creation with a clear error rather than silently suffixing. Making `Store.slug` globally unique is **not** in scope (it would be a constraint change on an existing table, outside G-19). **Slug immutability (S-5, finalised at spec review 2026-09-20):** 🗂 no runtime code creates or updates a `Store` — `prisma.store.upsert` exists only in `seed-tenant-bootstrap.ts` and a dev scratch seed — so `Store.slug` is **treated as immutable in Phase 9** and the collision check above is a seed-time guard. If future self-service store creation or slug mutation is introduced, the platform-subdomain derivation (re-derive the row atomically, or refuse the change) and any collision policy (fail / suffix / global-unique slug) must be **separately designed and decided** under their own record; Phase 9 does not pre-decide them.

📐 Platform subdomains are always-on: never subject to verification or `tlsStatus` gating; never removable by a merchant (only re-pointed as non-primary when a custom primary is set).

### 5.2 Configuration surface

📐 **Domain amended 2026-09-25 (P9-D6 amendment):** the platform storefront domain is
`stores.printforge.world` (registrable domain `printforge.world`, registrar GoDaddy). The
originally ratified `stores.printforge.app` was never provisioned for this purpose and is
not used. Only the hostname changes — every rule in this section, §9, §17 and §18 is
unchanged, and P9-D6's original 2026-09-20 wording is preserved verbatim in `DECISIONS.md`.

📐 One new configuration value, name fixed here: `PLATFORM_STOREFRONT_DOMAIN` (backend `ConfigService` key `platformStorefrontDomain`), value `stores.printforge.world` in production, validated in `env.validation.ts` as a hostname, Tier-2 (production-enforced, like `FRONTEND_URL` — `ENVIRONMENT.md:48`). Documented in `docs/ops/ENVIRONMENT.md`. **No default in production.**

---

## 6. Custom-Domain Onboarding and Verification (W6)

### 6.1 Merchant surface

📐 New tenant-admin controller `admin/store-domains` (mirrors `admin/payment-accounts`, `payment-accounts.controller.ts:44–45`), class-level `@RequirePermission('store-domain:manage')`.

⚖️ **P9-S2 (RATIFIED 2026-09-20; was SPEC DECISION S-2):** `store-domain:manage` is a **new tenant permission string** in `backend/src/auth/permissions/permission.ts` (`PERMISSIONS` tuple), ratified under the G-13 / P7-D2 governance pattern. **Default role grant: OWNER only** — excluded from `ADMIN_PERMISSIONS` exactly as `members:manage` / `payment-account:manage` are (line 63); `STAFF`/`VIEWER` never receive it. No existing permission (e.g. `settings:write`) is reused. It covers every merchant store-domain operation in the table above (add / manage / verify / refresh TLS / set primary / remove). **The existing `PermissionsGuard` + `@RequirePermission` is the authorization boundary**; `TenantContextGuard` (D6) supplies the tenant; `Origin` is never an input. W6 adds positive (OWNER → 2xx) and negative (ADMIN/STAFF/VIEWER → 403) tests and the new controller to `admin-authorization-coverage.spec.ts`.

| Operation | Effect | Audit (`TenantAuditLog`) |
|---|---|---|
| List domains | Store's `StoreDomain` rows (tenant-scoped client) | — |
| Add hostname | Validates (§6.2); inserts `type=CUSTOM, verificationStatus=PENDING, verificationMethod=<chosen>, verificationToken=<random>, tlsStatus=PENDING, isPrimary=false`; returns the token + human-readable DNS instructions | `store_domain.added` |
| Verify (on-demand, ⚖️ P9-D7) | §6.3 | `store_domain.verified` / `store_domain.verification_failed` |
| Refresh TLS status | Calls the hosting provider (§7) and updates `tlsStatus` | `store_domain.tls_refreshed` |
| Set primary | Requires `VERIFIED` + `ISSUED`; atomically clears the previous primary (partial unique index `store_domains_store_primary_unique` is the backstop) | `store_domain.primary_changed` |
| Remove | Only `CUSTOM`; if it was primary, the platform subdomain becomes primary; calls provider `removeDomain` | `store_domain.removed` |

Every write busts the resolution cache (§4.6). Every write is rate-limited by the existing `ThrottlerGuard`.

### 6.2 Hostname validation on add

📐 Normalised (§4.2); syntactically valid FQDN with ≥ 2 labels; **not** under `PLATFORM_STOREFRONT_DOMAIN`; **not** the platform admin origin's host (`FRONTEND_URL`) nor the API host — this rejection applies to **merchant self-service adds only**; the platform backfill B-3 (§16.2) registers `www.printforge.in` for Tenant #1 as a platform action; not already present (global `hostname @unique`); `www.`-vs-apex is two separate rows (each verified independently) — the merchant chooses which is primary.

### 6.3 On-demand verification (⚖️ P9-D7 — no scheduler)

📐 Two methods, chosen at add time:

| Method | Merchant instruction | Check |
|---|---|---|
| `DNS_TXT` | Create TXT record `_printforge-verify.<hostname>` with value `<verificationToken>` | Resolve TXT for that name; pass if any record equals the token |
| `CNAME` | Point `<hostname>` CNAME to the Vercel-provided target (§7.3) | Resolve CNAME for `<hostname>`; pass if it equals the target |

📐 Verification is a **synchronous** operation using Node's built-in DNS resolver (no new dependency), bounded by a **5 s** timeout, at most **one in-flight verification per domain** (advisory lock on the row). Outcome: **pass** → `VERIFIED` (+ `verifiedAt`, `lastCheckedAt`); **fail** → the row **stays `PENDING`** with `lastCheckedAt` updated (Master Plan §15 VERIFICATION, line 2196, verbatim: *"a failing check stays `PENDING` with a reason"*). A `PENDING` row may be re-verified on demand any number of times; a `VERIFIED` row is not re-checked in Phase 9 (re-checks are the Phase 11 cron, §20).

📐 **Failure reason — retained operationally, not on `StoreDomain` (S-6 RESOLVED, spec review 2026-09-20).** ⚖️ P9-D2 enumerates exactly four new columns and "the corresponding new enums required by those fields"; a free-text reason column is neither of those, so **no column is added** and the W1 migration stays at exactly three `CREATE TYPE`s + one `CREATE TABLE` + four `ADD COLUMN`s (§3). §15 requires the reason to be *retained*, not to be a `StoreDomain` column. It is retained in three places, none of which is a schema change to `store_domains`:
1. **The verify operation's response** — `{ verificationStatus: 'PENDING', lastCheckedAt, reason: <machine code + human text> }` (e.g. `TXT_RECORD_NOT_FOUND`, `TXT_VALUE_MISMATCH`, `CNAME_TARGET_MISMATCH`, `DNS_TIMEOUT`, `DNS_NXDOMAIN`). This is what the §15 acceptance test observes.
2. **`TenantAuditLog`** — the existing append-only, tenant-scoped, platform-readable audit table (`common/audit`): action `store_domain.verification_failed`, `targetId = storeDomain.id`, `metadata = { method, reason, checkedAt }`. The merchant's domain list and the platform "Inspect" view (§6.4) surface the **latest** such row for the domain as "last failure". This is persisted, queryable, and survives restarts.
3. **Structured server log** (existing logger discipline; no secrets, no DNS payload beyond the reason code).
`lastCheckedAt` (ratified) is the only `StoreDomain` field the failure touches.

📐 **Transitions in Phase 9 (⚖️ P9-S7 — sticky platform revoke):**

| From | Operation | Actor | To |
|---|---|---|---|
| `PENDING` | on-demand verify, pass | merchant or platform | `VERIFIED` |
| `PENDING` | on-demand verify, fail | merchant or platform | `PENDING` (`lastCheckedAt` bumped; reason retained per S-6) |
| `PENDING` | override | platform only | `VERIFIED` |
| `VERIFIED` | **revoke** | **platform only** | `FAILED` |
| `FAILED` | merchant on-demand verify | merchant | **refused** — no DNS check is run, no state change, error `DOMAIN_REVOKED_BY_PLATFORM`, `TenantAuditLog` `store_domain.verify_refused_revoked` |
| `FAILED` | **restore** = platform override **or** platform re-verify (pass) | **platform only** | `VERIFIED` |
| `FAILED` | platform re-verify, fail | platform | `FAILED` |

There is no `VERIFYING` (⚖️ P9-D2) and **no automatic entry into `FAILED`** — since a failed merchant check keeps `PENDING` (S-6), **every `FAILED` row in Phase 9 is platform-revoked by construction**; no schema field marks it (⚖️ P9-S7: "Do not create a new schema field solely for this decision"). The resolver serving gate (§4.3) refuses any `CUSTOM` row that is not `VERIFIED`, so a revoked domain stops serving within one cache TTL (bust on write). A test asserts the enum set is exactly `{PENDING, VERIFIED, FAILED}` (G-5).

📐 On `VERIFIED`, the same operation calls `DomainHostingProvider.addDomain(hostname)` (§7) and records the returned status into `tlsStatus`. If the provider call fails, the row stays `VERIFIED` with `tlsStatus=ERROR` and the merchant/platform can retry via "Refresh TLS status".

### 6.4 Platform-domains surface (⚖️ P9-D5)

📐 New `backend/src/platform/platform-domains/` module, routes under `platform/domains`, class-level `@PlatformOnly()` (as `platform.controller.ts:39–40`), every mutation written to `PlatformAuditLog` via the existing `common/audit` service with `justification` required (as suspend/resume already do):

| Operation | Effect | Audit action |
|---|---|---|
| List / filter (by `verificationStatus`, `tlsStatus`, `type`, tenant) | Read of metadata only (invariant: platform reads tenant *metadata*, not business rows) | — |
| Inspect one | Row + last verification error + provider status (live call) | — |
| Force re-verify | Same on-demand check as §6.3 | `platform.domain.reverified` |
| Override verification (`PENDING → VERIFIED`) | Manual approval with justification (§15: "Platform console can inspect/override") | `platform.domain.verification_overridden` |
| **Revoke** (`VERIFIED → FAILED`) | Stops serving a custom domain immediately (cache bust); **sticky** — the merchant cannot restore it (⚖️ P9-S7) | `platform.domain.revoked` |
| **Restore** (`FAILED → VERIFIED`) — by override, or by platform re-verify that passes | The **only** exits from `FAILED`; justification required | `platform.domain.restored` (override) / `platform.domain.reverified` (re-verify) |
| Remove | As merchant remove, any tenant | `platform.domain.removed` |
| Read / set resolution mode | §15 kill-switch | `platform.config.storefront_resolution_mode_changed` |

⚖️ **P9-S7 (RATIFIED 2026-09-20; was SPEC DECISION S-7):** platform "revoke" is the one path that moves `VERIFIED → FAILED` (abuse / misrouting / reassignment response — §15 KEY RISKS) and is **sticky**: a `FAILED` row returns to serving only through an explicit platform-authorized override or platform re-verification. `PlatformGuard` (`SUPER_ADMIN`) authorizes both revoke and restore; `PlatformAuditLog` records both; the merchant's on-demand verify refuses a `FAILED` row without running DNS and without changing state. W6 tests must prove (1) a merchant cannot undo a platform revoke and (2) the platform can explicitly restore the domain (§14.2).

---

## 7. TLS Integration — Vercel-managed (⚖️ P9-D3)

### 7.1 Provider-neutral interface

📐 `DomainHostingProvider` (backend, `common/tenant/store-domain-resolution/hosting/`): `addDomain(hostname) → { status }`, `getDomainStatus(hostname) → { configured: boolean, certificate: 'pending' | 'issued' | 'error', cnameTarget }`, `removeDomain(hostname)`. Exactly one implementation in Phase 9: `VercelDomainHostingProvider`. A `FakeDomainHostingProvider` for tests (mirrors `FakeBillingProvider`, ⚖️ P7-D2 Part G). DI-wired by environment; no other provider is implemented (no proxy, no Cloudflare — ⚖️ P9-D3).

### 7.2 What Vercel does and what PrintForge does

| Concern | Vercel-managed | PrintForge |
|---|---|---|
| TLS termination | All storefront hosts (platform wildcard + custom) terminate at Vercel | Nothing — the backend never terminates storefront TLS |
| Platform wildcard `*.stores.printforge.world` | One wildcard domain attached to the Vercel project (W8, §17); Vercel issues the wildcard certificate | `PLATFORM_SUBDOMAIN` rows do not consult `tlsStatus` |
| Custom domain onboarding | Domain added to the Vercel project via API; Vercel issues the certificate once DNS points at it | `addDomain` after `VERIFIED`; `tlsStatus` mirrors Vercel's reported certificate state |
| `tlsStatus` mapping | Vercel domain "configured" + certificate present → `ISSUED`; not yet → `PENDING`; API error / misconfiguration → `ERROR` | Written on `addDomain`, "Refresh TLS status", and platform inspect |
| Renewal | Vercel | Nothing in Phase 9 |
| Removal | `removeDomain` on merchant/platform remove | Row deleted after provider confirms |

📐 Polling: **none** in Phase 9 (⚖️ P9-D7 spirit — no worker). `tlsStatus` advances when a merchant or platform operator invokes "Refresh TLS status" or "Inspect". Phase 11 may add a scheduled refresh (§20).

### 7.3 Configuration (names only — values are Render secrets provisioned by ops, never recorded)

📐 `VERCEL_API_TOKEN` (secret), `VERCEL_PROJECT_ID`, `VERCEL_TEAM_ID` (optional). Validated in `env.validation.ts` as **required in production only when `PLATFORM_STOREFRONT_DOMAIN` is set** (Tier-2). Documented in `docs/ops/ENVIRONMENT.md` by name. The CNAME target shown to merchants (§6.3) is a config value `PLATFORM_CUSTOM_DOMAIN_CNAME_TARGET`, set by ops to the Vercel-provided target, so the code never hard-codes a Vercel DNS name.

🔎 **SPEC DECISION S-8:** the Vercel API surface used is limited to project-domain add / get / remove. The exact endpoint names and response fields are confirmed against Vercel's documentation at implementation time; this spec fixes only the adapter's contract (§7.1) and the `tlsStatus` mapping (§7.2).

---

## 8. Cookie / Session Handling (⚖️ P9-D4 — re-filed to Phase 12)

📐 **No change.** `backend/src/auth/auth.service.ts:398–420` (merchant refresh cookie: `httpOnly, secure, sameSite: 'strict', path`) is not modified. Merchant and platform-admin sessions remain on the fixed platform domain (`FRONTEND_URL`), so the shared-registrable-domain assumption still holds for every cookie that exists in Phase 9. No customer cookie exists (⚖️ P9-D1). The first-party-vs-proxied decision is Phase 12's (`DECISIONS.md` P9-D4). A test asserts the cookie options are unchanged (§14.5).

---

## 9. CORS / Origin Handling (W7)

🗂 Today: `main.ts:38–40` — single exact origin from `frontendUrl`, `credentials: true`, never a wildcard.

📐 Phase 9 replaces the static string with an **origin predicate** (same `enableCors` call, `credentials: true` retained):

| Origin host | Allowed when |
|---|---|
| `FRONTEND_URL` host (platform admin origin) | always |
| `*.{PLATFORM_STOREFRONT_DOMAIN}` (exactly one label deep) | always (platform subdomains are always-on) |
| Any other host | only if a `StoreDomain` row exists with that `hostname`, `type=CUSTOM`, `verificationStatus=VERIFIED`, `tlsStatus=ISSUED` — via the same cached lookup as §4.6 |
| No `Origin` header | not a CORS request; unaffected |

📐 The predicate **never reflects an arbitrary origin**, never returns `*`, and requires `https` in production. Scheme + host are matched; port is matched only in non-production.

📐 **Mode-coupled activation (S-9, corrected at spec review 2026-09-20):** the predicate reads the resolution mode (§15). In **`legacy_single_store`** mode it admits **only the `FRONTEND_URL` host — exactly today's behaviour** (`main.ts:39–40`); the platform-subdomain and custom-domain rows above are **not** consulted. The full dynamic allow-list activates **only** in **`host_resolution`** mode, in the same TTL window as the resolver flip. Rationale: with the allow-list live but the resolver in legacy mode, a request from `x.stores.printforge.world` would be CORS-admitted while the legacy resolver ignored the host and returned Tenant #1 — the §15 KEY RISKS *domain misrouting* (Critical) created deliberately for a testability benefit. Coupling removes the window.

📐 **Pre-flip verification without opening CORS:** a read-only, `@PlatformOnly()` dry-run endpoint `GET /platform/config/cors-check?origin=<origin>` evaluates the **full** predicate for the supplied origin (syntax, allow-list, `StoreDomain` gate) and returns `{ allowed, reason }` **without** emitting CORS headers or changing any state. W8 step 5 uses it against the platform origin, `www.printforge.world` (⚖️ P9-D10 — only if B-3 ran, §16.2a), `<tenant1-slug>.stores.printforge.world` and an unknown host **before** the flip. §14.4 covers both modes and the dry-run route.

📐 The `Origin` value admitted by CORS is the same value §4.1 uses as the storefront-host signal — one validation, two consumers.

---

## 10. Frontend Host-Awareness (W7) — foundation only

### 10.1 `siteConfig.ts`

🗂 `frontend/src/seo/siteConfig.ts:16–20` resolves `SITE_URL` from `VITE_SITE_URL` else the frozen `https://www.printforge.in` literal (`siteConfig.constants.ts`), citing the superseded BLUEPRINT (audit §13.4).

📐 `SITE_URL` becomes a **runtime** value: `canonicalOrigin` from `GET /storefront/context` when available, else `window.location.origin`. `VITE_SITE_URL` remains **only** as a dev/preview override (§15 FRONTEND IMPACT). `DEFAULT_SITE_URL` and the `printforge.in` literal are removed from `siteConfig.constants.ts`; the comment cites this spec, not BLUEPRINT-v1.2. `absoluteUrl`, `pageTitle`, `clampDescription` helpers are kept (§15 REUSE) with the origin injected rather than imported as a constant.

### 10.2 `Seo.tsx` / `jsonLd.ts`

📐 Canonical, `og:url`, JSON-LD `url` derive from the runtime origin (§10.1). Existing tests (`Seo.test.tsx`, `jsonLd.test.ts`, `pageSeo.test.tsx` — 14 `printforge.in` assertions between them) are rewritten to assert *the served host*, per §15 VERIFICATION ("canonical/OG URLs match the served host in a component test").

### 10.3 `seoFiles.ts` and the Vite plugin

🗂 `vite.config.ts:7–23` emits build-time `robots.txt`/`sitemap.xml` from one origin.

📐 The `seoFiles` Vite plugin and `seoFiles.ts` builders are **retired** (deleted, with `seoFiles.test.ts`) once the backend routes (§12) are live and `vercel.json` rewrites are in place. Order within W7: rewrites + backend routes verified first, then the plugin removed in the same PR.

### 10.4 `StoreContextProvider` (shell only)

📐 A `StoreContextProvider` that fetches `GET /storefront/context` once at app boot and exposes `{ storeId, storeName, canonicalOrigin, storeStatus }`. In Phase 9 its only consumers are `siteConfig`/`Seo` (§10.1–10.2) and the existing `useStoreName` (which already reads the store name from settings — it may switch to the context value). **Theme tokens, branding, homepage structure, query-key namespacing and the hook sweep are Phase 12** (§20). The provider is the seam, not the system.

### 10.5 `vercel.json`

📐 Adds two rewrites (`/robots.txt`, `/sitemap.xml`) that forward to the API's per-store SEO routes with the matched host captured into a query parameter (§12.2). The SPA catch-all stays last. No per-store build, no per-store project.

---

## 11. Canonical Domain Behaviour (W5)

📐 Each `Store` has exactly one primary domain (`isPrimary=true`; DB-enforced). `canonicalOrigin = https://<primary hostname>`.

| Case | Behaviour | Where |
|---|---|---|
| Page request on a non-primary **verified/served** host | **Client-side 301-equivalent**: the SPA, on boot, compares `window.location.host` to `canonicalOrigin` from `GET /storefront/context` and performs a `location.replace` to the canonical origin + path + query | SPA. The **API never 301s** a cross-origin fetch (a browser following it would land on the SPA's `/api/v1/…` path); it serves with `isPrimary=false` (§4.3). Vercel-side domain redirects are an ops option (§17), not required |
| Crawler request for `/robots.txt` or `/sitemap.xml` on a non-primary host | **301** to the same path on `canonicalOrigin` | Backend SEO route (§12), reached via the edge rewrite — the one server-side 301 in Phase 9 |
| `www` vs apex mismatch | Two rows; whichever is non-primary redirects | same |
| `http → https` | Vercel enforces for storefront hosts; the API is https-only on Render | no backend logic |
| Request on the primary host | served | — |
| `GET /storefront/context` on a non-primary host | **200** with `canonicalOrigin` (so the SPA can redirect itself); not 301 | 🔎 **SPEC DECISION S-10** |

📐 Redirects never apply to the platform admin origin or the API host itself.

---

## 12. Per-Store `robots.txt` / `sitemap.xml` (W5)

### 12.1 Backend routes

📐 `GET /storefront/seo/robots.txt` and `GET /storefront/seo/sitemap.xml`, `@Public()` (the `HealthController` pattern, §15 REUSE), resolved via the storefront-host signal (§4.1) — for these two routes the signal is the edge-captured host (§12.2), falling back to `Origin`, else the generic file.

| Route | Resolved store | Unresolved / unavailable |
|---|---|---|
| `robots.txt` | Store-specific: allow `/`, disallow `/admin`, `/account`, `/checkout`, `/cart` (the current `STATIC_PUBLIC_PATHS` intent), `Sitemap:` line pointing at the canonical origin | Static permissive `robots.txt` (§15 ROLLBACK: "degrades to a static permissive robots.txt — no data risk") |
| `sitemap.xml` | Canonical origin + static public routes + **that store's `ACTIVE` products and active categories only** (tenant-scoped query) — this is the enumeration the build-time plugin explicitly could not do (`seoFiles.ts:8–11`) | Static sitemap with the static routes only, or 404 on an unknown host — 🔎 **SPEC DECISION S-11:** 404 (a crawler should not index an unknown host) |

📐 Responses are `Cache-Control: public, max-age=3600`. Legal pages are **not** enumerated (Phase 13, §20).

### 12.2 Edge forwarding

📐 `vercel.json` rewrites `/robots.txt` and `/sitemap.xml` on **every** storefront host to the API routes, carrying the matched host as `?host=<captured>`. The backend validates `host` against `StoreDomain` exactly as any other signal (§4.1 trust model — public data only). 🔎 **SPEC DECISION S-12:** Vercel's host-capture rewrite syntax is confirmed at implementation; if unavailable, the fallback is a rewrite without capture plus reliance on Vercel's forwarded-host header, treated with the same public-data-only trust.

---

## 13. Tenant-Isolation Tests (Principle 4 — paired, before any enforcement flip)

📐 New `backend/test/e2e/domain-resolution.e2e-spec.ts` (§15 names it). Fixtures: two tenants (A, B), each `ACTIVE` with one `ACTIVE` primary store, one `PLATFORM_SUBDOMAIN` row each, plus custom rows in each state. The existing `support/fixtures.ts` builders are extended — `Customer` fixtures are **not** touched (⚖️ P9-D1).

| # | Positive | Negative (paired) |
|---|---|---|
| I-1 | `Origin: https://a.stores.<platform>` → catalog contains only A's products | Same request never contains any B product id |
| I-2 | `Origin: https://shop-b.example` (CUSTOM, VERIFIED, ISSUED, primary) → only B's catalog | A's product ids absent; A's settings absent |
| I-3 | Cart created under A's origin has `tenantId = A`; adding A's product succeeds | Adding B's `productId` under A's origin (and under a forged B origin with a cart already in A) → **404**; no `cart_items` row ever references a product of another tenant (§4.4 W4 anchoring) |
| I-4 | `GET /storefront/context` under A → A's `storeId` | Under B → never A's `storeId` |
| I-5 | Public settings read under A → A's `StoreSetting` | Never B's |

📐 These run in **both** resolution modes; in `legacy_single_store` mode the expectation is documented as "today's behaviour" (single-tenant fixture) so the suite proves the mode switch, not just the new path. Existing isolation suites (`phase4-w3-tenant-scoping`, `tenancy-foundation`, `support-session-scoped-client`) must stay green unmodified.

---

## 14. Host-Resolution Tests (positive and negative)

### 14.1 `domain-resolution.e2e-spec.ts` — §15 VERIFICATION cases, verbatim

| # | Case | Expected |
|---|---|---|
| R-1 | Unknown host | 404 generic; body identical to R-2 |
| R-2 | `CUSTOM` host, `PENDING` | 404 (not served) |
| R-3 | `CUSTOM` host, `VERIFIED`, `tlsStatus=PENDING` | 404 (not served) |
| R-4 | `CUSTOM` host, `VERIFIED`, `ISSUED`, non-primary | API: **200** with `isPrimary=false` and `canonicalOrigin` = primary; `/robots.txt` via edge on that host: **301** to canonical, path preserved |
| R-5 | `PLATFORM_SUBDOMAIN` host, store `DISABLED` | 503 "store unavailable" |
| R-6 | `PLATFORM_SUBDOMAIN` host, tenant `SUSPENDED` | 503 — same body as R-5; server log carries the reason |
| R-7 | `PLATFORM_SUBDOMAIN` host, subscription `EXPIRED` | 503 |
| R-8 | `PLATFORM_SUBDOMAIN` host, store `DRAFT` | 503 |
| R-9 | Host with port / uppercase / trailing dot | normalised; resolves as R-1..R-8 |
| R-10 | `type IS NULL` row | treated as `CUSTOM` (fail-closed) |
| R-11 | Cache: platform-revoke a row to `FAILED` → next request within TTL is not served (bust on write) | 404 |
| R-13 | `Origin` absent / `null` / malformed / wrong scheme on a storefront route | 404 generic; merchant and platform routes unaffected |
| R-14 | Forged `Origin` = B's served host, JWT = shopper with a cart in A, add A's `productId` | 404 (tenant anchoring); no row written |
| R-12 | Merchant path: host resolves to tenant A, caller has membership in B only | falls through as today (D6 unchanged) |

### 14.2 Verification tests (`store-domain-verification.spec.ts`, unit, DNS mocked)

Add yields a token and instructions; TXT match → `VERIFIED` + `verifiedAt` + `lastCheckedAt`; mismatch → **stays `PENDING`**, `lastCheckedAt` bumped, response carries `reason`, one `TenantAuditLog` row `store_domain.verification_failed` with the reason in `metadata`, **no `StoreDomain` column other than `lastCheckedAt` changes**; timeout → same with `DNS_TIMEOUT`; second concurrent verify on the same row is rejected; provider `addDomain` failure → `VERIFIED` + `tlsStatus=ERROR`; merchant verify never writes `FAILED`; platform revoke writes `FAILED` + `platform.domain.revoked`; **(P9-S7-1)** merchant on-demand verify against a `FAILED` row → refused (`DOMAIN_REVOKED_BY_PLATFORM`), no DNS resolver call made (mock asserts zero calls), row still `FAILED`, resolver still returns 404 for the host, `TenantAuditLog` `store_domain.verify_refused_revoked`; **(P9-S7-2)** platform override → `VERIFIED` + `platform.domain.restored`, host served again within one TTL; platform re-verify (pass) → `VERIFIED` + `platform.domain.reverified`; non-`SUPER_ADMIN` cannot call revoke/restore (403); no `VERIFYING` value anywhere (a test asserts the enum set equals `{PENDING, VERIFIED, FAILED}` — protecting G-5); a schema assertion that `store_domains` gained exactly four columns.

### 14.3 Kill-switch tests (`storefront-resolution-mode.e2e-spec.ts`)

Absent row → legacy; set to `host_resolution` via platform route → next request (after TTL or bust) uses the pipeline **without restart**; set back → legacy restored; non-`SUPER_ADMIN` cannot read or write the flag; every write produces a `PlatformAuditLog` row; DB read failure with a cached value → cached value used; with no cached value → request fails 503 (no silent mode guess); **(P9-S14)** row holds an invalid value (e.g. `legacy`, empty, `HOST_RESOLUTION`) → error log emitted, Sentry event captured (test double), last-known valid cached mode used if present, else **503**; the invalid value never becomes the cached mode; the platform write route rejects an invalid value with 400 (so the only way to reach this state is a direct DB edit, which the test performs); an *absent* row still resolves to `legacy_single_store`.

### 14.4 CORS tests

In `host_resolution` mode: platform origin allowed; `x.stores.<platform>` allowed; `a.b.stores.<platform>` (two labels) denied; verified+issued custom origin allowed; verified-but-`PENDING`-TLS custom origin denied; platform-revoked (`FAILED`) custom origin denied; unknown origin denied; `*` never emitted; `Access-Control-Allow-Credentials: true` retained. In `legacy_single_store` mode: **only** the `FRONTEND_URL` origin allowed — `x.stores.<platform>` and a verified custom origin are **denied** (S-9). Dry-run: `GET /platform/config/cors-check` returns the `host_resolution` verdict for each of the above regardless of the current mode, emits no CORS headers, requires `SUPER_ADMIN` (non-`SUPER_ADMIN` → 403).

### 14.5 Explicitly-unchanged assertions

`identity-foundation.e2e-spec.ts:272` (`AC-P2-02` no `customer_refresh_tokens` table) — **unmodified, green**; `fixtures.ts:505` — unmodified; `auth.service` cookie options — new unit assertion that `sameSite: 'strict'`, `httpOnly`, `secure`, `path` and **no `domain`** are still set (⚖️ P9-D4); `money-flow-separation.spec.ts` — unmodified, green; `migration-safety.spec.ts` — unmodified rules, one new positive case.

### 14.6 Frontend

`siteConfig` resolves origin from context/`window.location`; `Seo`/`jsonLd` emit the served host; no `printforge.in` literal remains in `frontend/src/seo/` (a grep-style test, mirroring the repository's `admin-authorization-coverage.spec.ts` style of static assertion); `StoreContextProvider` renders children with context after bootstrap and with a safe fallback when the bootstrap fails.

---

## 15. Resolver Kill-Switch (⚖️ P9-D8 — semantics defined here, shipped in W2, before W3)

| Attribute | Specification |
|---|---|
| Storage | `PlatformConfig` row, `key = "storefront.domain_resolution_mode"` |
| Values | `legacy_single_store` \| `host_resolution` — any other value is treated as **invalid** (see failure mode) |
| Default when the row is absent | **`legacy_single_store`** — pre-Phase-9 behaviour is the fail-safe. W1/W2 production application therefore changes **nothing** observable until an operator flips the flag in W8 |
| Read path | In-process cache, TTL **10 s**, bust on write in the same process. One DB read per TTL window per instance, not per request |
| Failure mode on read error | Use the last-known **valid** cached value; if none, the request **fails** (503) rather than guessing a mode. S-13 (finalised, B): never silently fall back to a mode on error — both modes are "safe" only if chosen deliberately |
| Invalid stored value (anything other than `legacy_single_store` / `host_resolution`) | ⚖️ **P9-S14 (RATIFIED 2026-09-20) — FAIL CLOSED:** (1) emit an error log; (2) report the configuration error to Sentry (existing integration, `main.ts`); (3) treat the mode read as a **failure** — the same path as the row above; (4) use the last-known **valid** cached mode if one exists; (5) if none, return HTTP **503**; (6) **NEVER** silently fall back to `legacy_single_store`. An *absent* row is not an *invalid* row — absent still defaults to `legacy_single_store` (P9-D8 / row 3). The invalid value is never cached as "valid" |
| Who may flip | `SUPER_ADMIN` via `platform/config` routes (`@PlatformOnly()`); `justification` required; `PlatformAuditLog` action `platform.config.storefront_resolution_mode_changed` with `metadata: { from, to }` |
| Read visibility | `GET /platform/config/storefront-domain-resolution` returns the effective mode + source (`row` / `default`) |
| What it switches | §4.3 pipeline vs §4.5 legacy — for **all** consumers of `request.storeContext` (cart, checkout, uploads, app-setting, tenant-lifecycle guard, public reads, SEO routes, context bootstrap). It does **not** switch CORS (§9, S-9) and does **not** affect the merchant `TenantContextGuard` path |
| Sequencing (binding) | W2 ships the table, the flag, the platform route and §14.3 tests. **W3 may not remove or alter the legacy fallback until W2 is merged and §14.3 is green.** §15 ROLLBACK's "without a redeploy" is satisfied because the flip is a DB write read within one TTL |
| Multi-instance | TTL bounds propagation to ≤ 10 s per instance; acceptable for a rollback control. Revisit if D8 moves to ≥ 2 instances |
| Removal | The legacy strategy is **not** removed in Phase 9. Its removal is a future record after `host_resolution` has run in production for an owner-chosen observation window (the Phase 3 "advisory → enforced" discipline, Master Plan §9) |

---

## 16. Migration / Backfill Requirements

### 16.1 Schema (W1) — §3. Applied to production in W8.

### 16.2 Data backfill (W2 authoring; W8 production execution) — idempotent, re-runnable, reconciled

| Step | Action | Reconciliation query |
|---|---|---|
| B-1 | For every existing `StoreDomain` row with `type IS NULL`: set `type = CUSTOM` unless `hostname` ends with `.{PLATFORM_STOREFRONT_DOMAIN}` (then `PLATFORM_SUBDOMAIN`) | `COUNT(*) WHERE type IS NULL = 0` |
| B-2 | For every `Store` without a `PLATFORM_SUBDOMAIN` row: insert `{slug}.{PLATFORM_STOREFRONT_DOMAIN}`, `VERIFIED`, `isPrimary = (store has no primary domain)` | `COUNT(stores) = COUNT(store_domains WHERE type=PLATFORM_SUBDOMAIN)`; every store has exactly one primary |
| B-3 | **Tenant #1 only** (⚖️ D3 — production has exactly one tenant). **TENANT #1 CUSTOM HOST: `www.printforge.world`** (⚖️ P9-D10, amended 2026-09-25 — was `www.printforge.in`). **TYPE: `CUSTOM`.** Insert with `verificationMethod = null`, `verificationToken = null`, and the **required final serving state `VERIFIED` + `ISSUED` + `isPrimary = true`**; the platform-subdomain row from B-2 becomes non-primary. Per §15 MIGRATION IMPACT ("register it as Tenant #1's primary custom domain"), which frames this step as **optional**. ⚠️ **MANDATORY PRECONDITION — see §16.2a. B-3 records ownership and TLS; it does not establish them and cannot detect their absence.** | Tenant #1's store has `isPrimary` on `www.printforge.world`; `resolve('www.printforge.world')` → Tenant #1 |
| B-4 | Insert `PlatformConfig` row `storefront.domain_resolution_mode = legacy_single_store` explicitly (so W8's flip is a row update with a `from` value in the audit) | row exists |

🗂 Production `store_domains` is presumed empty today (`storefront-tenant.resolver.ts:26`: "none do in production today") — B-1 is expected to be a no-op; the query proves it.

📐 The backfill is a script under `backend/prisma/backfill/` in the Phase 2b/4 style (idempotent, prints per-step counts, never deletes), run by an operator via `!` in W8 after the migration, with the reconciliation output pasted into the W8 report. **Nothing in this section runs in W1–W7 against production.**

#### 16.2a B-3 operator precondition (⚖️ P9-D10, binding — added 2026-09-25)

B-3 writes `verificationStatus = VERIFIED` and `tlsStatus = ISSUED` as **platform-recorded
facts**, with no DNS challenge and no live provider call. Nothing in the code path can tell whether
those facts are true. **A hostname being fixed in source is not evidence that anyone owns it or
that a certificate exists for it** — that mistake is exactly what the previous `www.printforge.in`
value encoded, and `printforge.in` has never been delegated (NXDOMAIN).

All three must ALREADY be true, and have been **independently observed**, before B-3 runs against
production:

**Status 2026-09-25: all three VERIFIED** — recorded as `E-W3-1`…`E-W3-3` in the table below. These
are **direct observations**, not attestations.

| # | Precondition | Acceptable evidence | Verified? |
|:-:|---|---|---|
| 1 | DNS for `www.printforge.world` is correctly delegated and resolves publicly | A **public-resolver** query (`dig … @1.1.1.1` / `@8.8.8.8`), not a local/default resolver — the §17.1a `E-DNS-2` discipline | **`E-W3-1` — PASS** (2026-09-25): resolves from `1.1.1.1`, `8.8.8.8` and `9.9.9.9` to Vercel addresses (`64.29.17.65`, `216.198.79.1`, `64.29.17.1`). Three independent public resolvers, no local resolver relied on |
| 2 | The hostname is attached and configured at the hosting provider | Vercel project-domain read reporting `verified`, and domain config **not** `misconfigured` (§7.1–§7.2) | **`E-W3-2` — PASS** (2026-09-25): project-domain read returns `name: www.printforge.world`, `apexName: printforge.world`, the Phase 9 `projectId`, **`verified: true`**, `redirect: null` (it serves, it does not redirect); domain config returns **`misconfigured: false`**, `configuredBy: http`. Read through the same endpoints the §7.1 adapter uses |
| 3 | **HTTPS/TLS is independently observed on the hostname** | A real handshake presenting a certificate covering `www.printforge.world` — issuer, validity window, SAN. The provider reporting "configured" is **not** a certificate observation: see §17.1a (`E-DNS-3` vs `E-DNS-4`) and §19.1 slot 8 | **`E-W3-3` — PASS** (2026-09-25): `openssl s_client -connect www.printforge.world:443 -servername www.printforge.world` → `issuer=C=US, O=Let's Encrypt, CN=YR1`; `notBefore=Sep 25 07:15:45 2026 GMT`, **`notAfter=Dec 24 07:15:44 2026 GMT`**; `X509v3 Subject Alternative Name: DNS:www.printforge.world`. Read off the wire, not inferred from a provider field. A **distinct certificate** from the platform wildcard's (`CN=YR2`, `E-DNS-4`) |

📐 **Why this is a hard precondition and not advice.** `isPrimary = true` makes this hostname
Tenant #1's `canonicalOrigin` (§11). If it does not resolve, the SPA on every non-primary host
`location.replace`s into a dead origin and `robots.txt`/`sitemap.xml` 301 there — the storefront
becomes unreachable. Run `--dry-run` first; **if any precondition is unmet, do not run the real
pass.**

⚠️ **`E-W3-3` is a point-in-time observation and expires.** The certificate is valid through
**2026-12-24**. Renewal is the hosting provider's (§7.2), but this evidence row is not open-ended:
**if B-3 has not run against production by that date, re-observe rather than relying on this row.**
The same caveat applies to `E-DNS-4`'s wildcard certificate.

Omitting B-3 entirely is permitted — §15 MIGRATION IMPACT calls it "(optionally)" — and
leaves Tenant #1's platform subdomain as primary, which always serves (§4.3).

📐 `www.printforge.world` is deliberately **not** under `PLATFORM_STOREFRONT_DOMAIN`
(`stores.printforge.world`), so it stays a genuine `CUSTOM` row and keeps exercising the §4.3
serving gate, which consults neither verification nor TLS for `PLATFORM_SUBDOMAIN` rows. The
platform subdomain remains `{store.slug}.stores.printforge.world`. ⚖️ P9-D6 is unchanged.

---

### 16.3 Rollback

Schema: additive → image revert safe (§15). Data: B-2/B-3 rows may be left in place under `legacy_single_store` (they are inert). The kill-switch (§15 spec) is the behavioural rollback.

---

## 17. Production Prerequisites — DNS / TLS / Vercel / Render (W0 confirm, W8 execute)

### 17.1 ⚖️ P9-D6 mandatory pre-execution Ops confirmation checklist (hard gate for W8)

🗂 Domain amended 2026-09-25 — `stores.printforge.world` (registrar GoDaddy), replacing the
originally ratified `stores.printforge.app`. The four items below are unchanged in substance;
only the hostname they refer to changed, so no item may be carried over as already-confirmed.

| # | Item | Confirmed? (yes / no / not yet) | Evidence id (no secrets) |
|---|---|:-:|---|
| 1 | Registrar **ownership of `stores.printforge.world`** (i.e. of `printforge.world`) | **yes** (2026-09-25) | `E-DNS-1` — §17.1a |
| 2 | **`*.stores.printforge.world` wildcard DNS** record pointing at Vercel | **yes** (2026-09-25) | `E-DNS-2` — §17.1a |
| 3 | **Vercel domain configuration**: wildcard domain attached to the frontend project; wildcard certificate issued | **yes** (2026-09-25) — both halves evidenced | `E-DNS-3` (attachment) + `E-DNS-4` (certificate) — §17.1a |
| 4 | **API/backend configuration**: `PLATFORM_STOREFRONT_DOMAIN`, `PLATFORM_CUSTOM_DOMAIN_CNAME_TARGET`, `VERCEL_PROJECT_ID`, `VERCEL_API_TOKEN` (+ `VERCEL_TEAM_ID` if applicable) present on the Render service — **names confirmed, values never recorded** | **yes** (2026-09-25) — owner-attested | `E-RENDER-1` — §17.1b |

W8 does not start until all four are **yes**. A "no" or "not yet" on any item holds W8 without blocking W1–W7 code work.

**Current gate verdict: §17.1 GATE SATISFIED (2026-09-25) — all four items are `yes`.** The
checklist no longer holds W8. Execution remains subject to owner authorization, to §16.2a's B-3
preconditions (recorded — all three verified, §16.2a) and to §17.2 steps 1–6 preceding the step-7
flip. **This is a gate verdict, not an authorization to execute.**

🗂 Item 3 resolved 2026-09-25. It was recorded as a *split* item while only its attachment half
(`E-DNS-3`) was evidenced; `E-DNS-4` supplied the certificate half by direct observation, so both
halves of the item as written are satisfied.

🗂 Item 4 resolved 2026-09-25 as `E-RENDER-1` (§17.1b). It is **owner-attested**, not
independently verified from the Render side — which is the evidence form this item specifies
("names confirmed, values never recorded"). No value, secret or token is recorded anywhere in this
document.

#### 17.1a Recorded evidence — DNS delegation and platform-wildcard TLS (collected 2026-09-25, owner-supplied)

No secret was recorded in, or required for, any of the observations below, and none required a
credential. `E-DNS-1`–`E-DNS-3` are mutually independent delegation/attachment observations and
**none of them is a TLS observation**; `E-DNS-4` is the separate, direct **certificate**
observation, added 2026-09-25.

| Id | Source | Observation | Supports |
|---|---|---|---|
| `E-DNS-1` | GoDaddy registrar dashboard for `printforge.world` | Domain present in the owner's registrar account, with **custom nameservers** set to `ns1.vercel-dns.com` / `ns2.vercel-dns.com`. Only the registrant can change a domain's nameservers, so this is ownership evidence as well as delegation evidence. | Item 1 |
| `E-DNS-2` | Independent public resolvers — `dig NS printforge.world @1.1.1.1 +short` (Cloudflare) and `dig NS printforge.world @8.8.8.8 +short` (Google) | Both return `ns1.vercel-dns.com.` and `ns2.vercel-dns.com.` (order differs, set identical). Public delegation of the zone — and therefore of `*.stores.printforge.world` within it — to Vercel DNS is live and observable from outside the owner's network. | Item 2 |
| `E-DNS-3` | Vercel CLI 60.0.1 — `npx vercel@latest domains verify '*.stores.printforge.world' --project print-forge --json` | `status: ok`, `reason: configured_correctly`, `domainStatus: configured-correctly`, `configurationStatus: configured-correctly`, `ok: true`, `misconfigured: false`, `project.attached: true`, `project.verified: true`; nameservers reported as `ns1.vercel-dns.com` / `ns2.vercel-dns.com`. Vercel considers the wildcard attached to the frontend project and correctly configured. | Item 2; **attachment half of item 3 only** |
| `E-DNS-4` | **Direct TLS observation** of a hostname under the wildcard — `openssl s_client -connect test123.stores.printforge.world:443 -servername test123.stores.printforge.world </dev/null \| openssl x509 -noout -issuer -dates -ext subjectAltName` | Handshake **succeeded**. `issuer=C=US, O=Let's Encrypt, CN=YR2`; `notBefore=Sep 25 07:15:46 2026 GMT`, `notAfter=Dec 24 07:15:45 2026 GMT`; `X509v3 Subject Alternative Name: DNS:*.stores.printforge.world`. The presented certificate's SAN **explicitly covers the required platform wildcard**, observed from the wire rather than inferred from any provider status field. (`test123` is an arbitrary probe label — TLS is negotiated before routing, so no `StoreDomain` row or store need exist for it, and any HTTP-layer response afterwards is irrelevant to this evidence.) | **Certificate half of item 3** — completes it |

**Known non-blocker — stale local resolver.** The owner's local/default resolver still answers
`printforge.world` NS with the pre-cutover GoDaddy nameservers `ns71.domaincontrol.com` /
`ns72.domaincontrol.com`. This is ordinary recursive-resolver caching of the previous delegation
and is contradicted by two independent public resolvers (`E-DNS-2`) and by Vercel's own view
(`E-DNS-3`). **It is explicitly not a W8 blocker, and no further DNS change is to be made on
account of it.** Any later verification step that must observe delegation should query a public
resolver explicitly rather than the default one.

**What `E-DNS-3` does *not* establish — and what `E-DNS-4` does.** `configured-correctly` /
`misconfigured: false` describe DNS-and-attachment configuration, not certificate issuance, so
`E-DNS-3` alone never evidenced a certificate. That gap is now closed **by observation, not by
inference**: `E-DNS-4` reads the certificate off the wire. The two are kept as separate evidence
ids precisely so the distinction survives in the record.

📐 **Three limits of `E-DNS-4`, stated so it is not over-read.**
1. **One label deep.** The SAN is `*.stores.printforge.world`, which covers `<label>.stores.printforge.world`
   and **not** `a.b.stores.printforge.world`. This matches, and independently corroborates, §14.4's
   rule that a two-label host under the platform domain is denied.
2. **It expires.** `notAfter=Dec 24 07:15:45 2026 GMT`. Renewal is Vercel's responsibility (§7.2:
   *"Renewal | Vercel | Nothing in Phase 9"*), and PrintForge does not consult `tlsStatus` for
   `PLATFORM_SUBDOMAIN` rows at all (§4.3). But this evidence is a point-in-time observation: **if W8
   execution slips past that date, re-observe rather than rely on this row.**
3. **It says nothing about any custom domain.** `E-DNS-4` is a platform-wildcard certificate. The
   `E-3` exit criterion (§19, §19.1) concerns `type=CUSTOM` hostnames and is **untouched** by it —
   §19.1 slot 8 still requires its own independent HTTPS observation of the E-3 test hostname.

#### 17.1b Recorded evidence — Render production configuration (owner-attested, 2026-09-25)

| Id | Source | Observation | Supports |
|---|---|---|---|
| `E-RENDER-1` | **Owner confirmation** — manual verification of the production Render service's environment configuration, 2026-09-25 | The required Phase 9 §7.3 / §5.2 configuration is **present on the production Render service**: `PLATFORM_STOREFRONT_DOMAIN`, `PLATFORM_CUSTOM_DOMAIN_CNAME_TARGET`, `VERCEL_PROJECT_ID`, `VERCEL_TEAM_ID` are set, and `VERCEL_API_TOKEN` is **present**. **Names confirmed only — no value, secret or token is recorded here, and none was transmitted to produce this record.** | Item 4 |

📐 **Nature and limits of `E-RENDER-1`.** This is **owner attestation**, deliberately distinguished
from `E-DNS-1`…`E-DNS-4` and `E-W3-1`…`E-W3-3`, which are direct observations. Reading Render's
environment requires a Render credential, and §17.1 item 4 asks for an ops *confirmation* rather
than a machine-readable artifact precisely because the values must never be recorded. Two facts
corroborate it without exposing anything:

1. **The four non-secret values match an independent source.** `VERCEL_PROJECT_ID`,
   `VERCEL_TEAM_ID` and the CNAME target were each derived from Vercel's own API in a separate
   read-only inspection, and `PLATFORM_STOREFRONT_DOMAIN` matches ⚖️ P9-D6.
2. **The production service booted successfully afterwards** (`GET /api/v1/health` → `200`,
   2026-09-25). This is load-bearing: `env.validation.ts`'s `missingVercelKeys` makes
   `VERCEL_API_TOKEN` and `VERCEL_PROJECT_ID` **required in production whenever
   `PLATFORM_STOREFRONT_DOMAIN` is set**. A Render environment change redeploys the service, so a
   platform domain saved without the Vercel keys would have **failed that boot**. It did not.

📐 **The configuration is inert until §17.2 step 7.** Setting these values changes no behaviour in
`legacy_single_store`: CORS still admits only `FRONTEND_URL` (🔎 S-9 — confirmed 2026-09-25 by a
read-only probe, where `Origin: https://x.stores.printforge.world` still received the
`FRONTEND_URL` allow-origin), and the resolver still uses the §4.5 legacy path. What the values do
arm is the boot-time validation above.

---

### 17.2 W8 operator sequence (each step is a documented `!`-run or dashboard action; none is performed by the implementation team's PRs)

1. Fresh verified backup (G-9; `docs/ops/BACKUP-RESTORE.md`). ✅ **DONE 2026-09-25 — evidence `E-G9-1`, §17.2a.**
2. Deploy the W1–W7 image (mode defaults to `legacy_single_store` — no behaviour change).
3. `prisma migrate deploy` (W1 migration) — health checks `200`.
4. Run the backfill (§16.2) — paste reconciliation.
5. Verify the CORS allow-list in production **via the dry-run endpoint** (`GET /platform/config/cors-check`, §9) for the platform origin, `www.printforge.world`, `<tenant1-slug>.stores.printforge.world` and an unknown host — still legacy mode, so live CORS is unchanged (S-9).
6. Canary (§18.1) in legacy mode — must be green.
7. Flip `storefront.domain_resolution_mode` → `host_resolution` via the platform route (audited). ⚖️ **P9-D11:** this step is **not** gated on a `StoreDomain` row for the frontend's Vercel deployment origin — no such row exists or is wanted (§4.1.3a). It remains gated on the §17.1 checklist, the customer-facing hostname canary (§18.1) and steps 1–6.
8. Canary (§18.1) in host-resolution mode — must be green within one TTL.
9. Confirm the `www.printforge.world` storefront serves Tenant #1 for a real browser session (only if B-3 ran — §16.2a); confirm `<tenant1-slug>.stores.printforge.world` serves the same store; confirm an unknown `x.stores.printforge.world` returns the generic 404.
10. Leave in `host_resolution`; record the flip time in the W8 report.

🗂 **Corrected 2026-09-25 (⚖️ P9-D10).** The original note claimed `www.printforge.in` "is already served by Vercel" and that "B-3 only registers that fact". That was wrong when written and is contradicted by the source it cited: `Readme.md` records the `printforge.in` cutover as **not** done, and the domain resolves `NXDOMAIN` (registered, never delegated). Phase 9 changes no DNS for it and makes no claim about it. Tenant #1's custom canary is now `www.printforge.world` (§16.2), whose ownership and TLS must be **independently observed first** — §16.2a. Nothing about `printforge.in` is a Phase 9 dependency.

---

### 17.2a W8 execution evidence (filled as each step completes — no row may be filled from expectation)

| Step | Status | Evidence |
|:-:|---|---|
| 1 — G-9 pre-migration snapshot | ✅ **DONE** 2026-09-25 | `E-G9-1` — below |
| 2 — Deploy W1–W7 image | NOT STARTED | — |
| 3 — `prisma migrate deploy` | NOT STARTED | — |
| 4 — Backfill B-1…B-4 | NOT STARTED | — |
| 5 — CORS dry-run check | NOT STARTED | — |
| 6 — Canary, legacy mode | NOT STARTED | — |
| 7 — Flip to `host_resolution` | NOT STARTED | — |
| 8 — Canary, host_resolution | NOT STARTED | — |
| 9 — Browser confirmation | NOT STARTED | — |
| 10 — Record flip time | NOT STARTED | — |

#### `E-G9-1` — G-9 pre-migration production snapshot (⚖️ G-9; `DEPLOYMENT.md` §3; taken 2026-09-25)

| Field | Value |
|---|---|
| Snapshot file | `backend/printforge_prod_preP9W8_20260925T125908Z.dump` |
| Taken at | **2026-09-25T12:59:08Z** (from the filename stamp) |
| Format | `pg_dump --format=custom --no-owner --no-privileges` (§5 of `BACKUP-RESTORE.md`) |
| Size | **238,616 bytes** (233 KB) |
| SHA256 | `e8d5a05b4a00f63d658a7ac8906250c29228544a9eb3d2a875a88338ba4e0f56` |
| PostgreSQL server | 18.6 |
| `pg_dump` client | 18.6 (version-matched to the server — see the note below) |
| Deep health at time of snapshot | `GET /api/v1/health/deep` → **200** (`DEPLOYMENT.md` §3 step 3) |

**Validation performed on the artifact (not on its description):**

| Check | Result |
|---|---|
| File exists at the recorded path | **PASS** |
| Non-zero | **PASS** — 238,616 bytes |
| SHA256 recomputed and compared | **PASS** — matches the recorded digest exactly |
| Structurally valid archive | **PASS** — `pg_restore --list` exits **0** and parses; **389** numbered TOC entries (404 total listing lines), **46** `TABLE DATA` entries |
| Core production tables present | **PASS** — `users`, `orders`, `payment_attempts`, `invoices`, `products`, `tenants`, `stores`, `subscriptions`, `_prisma_migrations` (`BACKUP-RESTORE.md` §6) |
| **Genuinely PRE-Phase-9-migration** | **PASS** — `platform_config` is **ABSENT** from the archive. That table is created by the W1 migration (`20260920062349_phase9_w1_store_domain_and_platform_config`), so its absence proves the snapshot predates it. `store_domains` **is** present, as expected from an earlier phase |

📐 **Why the version match matters.** The server is PostgreSQL **18.6**; a `pg_dump` older than the
server refuses to run and can leave a **0-byte file** behind. Eight earlier dumps in `backend/`
include **five 0-byte artifacts** — almost certainly that failure. This is why "non-zero" and
"`pg_restore --list` exits 0" are both mandatory checks here and not formalities. **Never accept a
0-byte dump as a snapshot.**

⚠️ **Handling — this artifact is a secret.** `BACKUP-RESTORE.md` §5: dumps *"contain all customer
PII and password hashes — treat as a secret"*. It currently sits **inside the working tree** at
`backend/` and is **not** covered by any `.gitignore` rule, so it appears as untracked and **could be
committed by a `git add -A`**. It must be moved to access-controlled storage, and `*.dump` should be
git-ignored, before any commit is made in this repository.

📐 **Freshness.** G-9 requires the snapshot *"immediately before"* the migration. This one is valid
for the §17.2 steps 2–4 window it was taken for; if that window is not used, **retake it** rather
than relying on this row.

---

## 18. Canary and Rollback

### 18.1 Canary (run at steps 6 and 8 of §17.2, and after every later deploy — added to `docs/ops/PRODUCTION-SMOKE-TEST.md`)

| Check | Pass condition |
|---|---|
| `GET /api/v1/health`, `/health/deep` | `200` |
| `GET /storefront/context` with `Origin: https://www.printforge.world` | `200`, Tenant #1's `storeId` — **only if B-3 ran** (§16.2a); skipped, not failed, when B-3 was omitted |
| `GET /storefront/context` with `Origin: https://<tenant1-slug>.stores.printforge.world` | `200`, same `storeId` |
| `GET /storefront/context` with `Origin: https://does-not-exist.stores.printforge.world` | `404` generic (in `host_resolution`); Tenant #1 (in legacy — documented difference) |
| `GET /products` with each of the above origins | same catalog for the two real hosts; `404` for the unknown (host_resolution) |
| `https://www.printforge.world/robots.txt` | store-specific body with `Sitemap:` line — **only if B-3 ran** (§16.2a); otherwise run it against `<tenant1-slug>.stores.printforge.world` |
| `GET /storefront/context` with `Origin: <the `FRONTEND_URL` deployment origin>` | **404** generic in `host_resolution` — the **expected** result (⚖️ P9-D11, §4.1.3a), **while** the response still carries `Access-Control-Allow-Origin` for that origin. A `200` here would mean the deployment origin was wrongly registered as a storefront |
| `GET /admin/*` and `GET /platform/*` from the `FRONTEND_URL` origin | unchanged by the flip — they never use `Origin` to derive a store (§4.1.3) |
| CORS preflight from `https://evil.example` | no `Access-Control-Allow-Origin` |
| `PlatformAuditLog` | contains the mode-change row |

### 18.2 Rollback

| Symptom | Action | Redeploy? |
|---|---|---|
| Misrouting / unexpected 404 or 503 on a real store | Flip `storefront.domain_resolution_mode` → `legacy_single_store` (platform route, audited) | **No** (⚖️ P9-D8) |
| CORS denying a legitimate origin | Fix the `StoreDomain` row (verify / TLS refresh / platform override); CORS reads the same rows | No |
| Migration failure | Prisma has no down-migrations (Master Plan §5 Principle 3); additive columns/tables are harmless — revert the image; restore from the step-1 backup only if data was corrupted | Image revert |
| Vercel API failures | Custom-domain onboarding degrades (`tlsStatus=ERROR`, retry later); platform subdomains and existing domains unaffected (§15 ROLLBACK: "TLS issues are isolated per domain") | No |
| SEO route failure | `robots.txt` degrades to static permissive; `sitemap.xml` 404 | No |

---

## 19. Phase 9 Exit Criteria (Master Plan §15 EXIT CRITERIA, itemised)

| # | Criterion (§15) | Evidence required |
|---|---|---|
| E-1 | Server-side domain resolution live | Production in `host_resolution`; §18.1 canary green; W8 report |
| E-2 | Platform subdomains for every store | B-2 reconciliation = 0 stores without a platform row; `<tenant1-slug>.stores.printforge.world` serves |
| E-3 | Custom-domain verification + TLS working | One real custom domain (owner-supplied test domain) taken from add → `VERIFIED` → `ISSUED` → served, with audit rows; or, if no test domain is available, the e2e suite + a Vercel sandbox project run recorded — ⚖️ **ROUTE A selected (P9-D9, 2026-09-25); evidence slots at §19.1** |
| E-4 | Canonical redirects | R-4 green; in production a page load on a non-primary host lands on the canonical origin, and `/robots.txt` on a non-primary host 301s |
| E-5 | Per-store SEO files | `robots.txt`/`sitemap.xml` differ between two hosts (e2e) and are served on a real **customer-facing** host (canary) — never the Vercel deployment origin (⚖️ P9-D11) — `www.printforge.world` if B-3 ran, else `<tenant1-slug>.stores.printforge.world` (⚖️ P9-D10). Requires `vercel.json`'s SEO rewrites to point at the **live** API origin |
| E-6 | Frontend origin de-hardcoded | grep-test green; no `printforge.in` literal in `frontend/src/seo/` |
| E-7 | Isolation-by-host proven | §13 I-1…I-5 green in both modes; §14.1 R-1…R-12 green |
| E-8 | Suites green | Backend unit + e2e, frontend unit; `identity-foundation` `AC-P2-02`, `money-flow-separation`, `migration-safety` (rules unmodified) all green |
| E-9 | Kill-switch proven | §14.3 green; production flip forward and back rehearsed once (§17.2 steps 7–8 plus one rollback and re-flip) |
| E-10 | Governance | Every 🔎 SPEC DECISION in §21 confirmed or overruled at G-21; W8 report filed as `docs/saas/PHASE-9-IMPLEMENTATION-REPORT.md` |

---

### 19.1 `E-3` evidence record — ROUTE A, **production, sequenced last** (⚖️ P9-D9, 2026-09-25 — **unfilled; execution NOT authorized**)

⚖️ **P9-D9** selects `E-3`'s **Route A**: one real owner-controlled custom domain driven through the
complete `add → VERIFIED → ISSUED → served` flow. Route B (mocked suites + a recorded Vercel
sandbox run) is **not** used, so its undefined acceptance criteria never arise.

⚖️ **Environment and ordering (P9-D9, decided 2026-09-25).** `E-3` executes against **production**, and
is **deliberately the last W8 activity** — not a parallel one. The order is binding:

| Order | Gate / step | Where |
|:-:|---|---|
| 1 | ~~§17.1 item 3 — **wildcard certificate evidence** for `*.stores.printforge.world`~~ — **CLEARED 2026-09-25** (`E-DNS-4`) | §17.1 (+ §17.1a) |
| 2 | ~~§17.1 item 4 — **required Render production configuration**~~ — **CLEARED 2026-09-25** (`E-RENDER-1`, owner-attested) | §17.1 (+ §17.1b) |
| 3 | Every other W8 infrastructure gate the ratified runbook requires ahead of activation — §17.2 steps 1–6: G-9 backup, W1–W7 image deploy, `prisma migrate deploy`, backfill + reconciliation, CORS dry-run check, legacy-mode canary | §17.2, §18.1 |
| 4 | `host_resolution` activated **only** through the existing ratified runbook — no ad-hoc flip | §17.2 step 7 |
| 5 | **`E-3` Route A executes** against production | this section |

📐 Why `E-3` cannot come earlier: slot 9's "served" evidence requires the resolver to select a store
**by host**, which exists only in `host_resolution` (§4.3) — and reaching that mode is §17.2 step 7,
itself gated on §17.1 and on §17.2 steps 1–6. This sequencing is an *execution* constraint only:
`E-3` remains **evidentially** independent of §17.1 items 3 and 4 (see the closing note of this
section).

⚖️ **Verification method: `DNS_TXT`** (P9-D9, fixed). Chosen over `CNAME` so the check does not depend
on `PLATFORM_CUSTOM_DOMAIN_CNAME_TARGET`, and so the test hostname's own record stays free to point
at the hosting provider for the serving half of the flow.

**Test hostname: NOT YET SUPPLIED.** No domain literal appears below and none may be inferred.
Before any step runs, the supplied hostname must satisfy all three P9-D9 eligibility constraints
— **not** under `PLATFORM_STOREFRONT_DOMAIN` (`stores.printforge.world`), **not** the `FRONTEND_URL`
host, **not** the API host — which restate §6.2's merchant-self-service rejections as owner-binding
constraints on the test domain.

**No slot below may be filled from expectation.** Each records an observation that actually
happened, or stays empty. An unfilled slot leaves `E-3` failing.

| # | Evidence | Required content | Observed |
|---|---|---|---|
| 1 | `StoreDomain` add response (§6.1, §6.2) | `type=CUSTOM`, `verificationStatus=PENDING`, `verificationMethod`, `tlsStatus=PENDING`, `isPrimary=false`, DNS instructions present; `TenantAuditLog` `store_domain.added` row id. **The `verificationToken` value is never recorded** — only "token issued" | |
| 2 | Public DNS verification (§6.3) | The TXT record `_printforge-verify.<hostname>` (method fixed as `DNS_TXT` by ⚖️ P9-D9, so no CNAME variant applies) as returned by a **public resolver** (`dig … @1.1.1.1` / `@8.8.8.8`), not the registrar UI alone — same discipline as `E-DNS-2` (§17.1a) | |
| 3 | `VERIFIED` state (§6.3) | `verificationStatus=VERIFIED` with **`verifiedAt`** and **`lastCheckedAt`** | |
| 4 | `TenantAuditLog` verification evidence (§6.3) | Row id for `store_domain.verified`. A failed attempt, if any, is recorded too: `store_domain.verification_failed` with `metadata.reason`, row **still `PENDING`**, and no `StoreDomain` column but `lastCheckedAt` changed (S-6) | |
| 5 | Vercel `addDomain` result (§6.3 final clause, §7.1) | The provider's returned status, and the `verified` / `misconfigured` pair behind it. **No token, no URL, no project id** | |
| 6 | `tlsStatus` transition (§7.2) | The value written on `addDomain` and each subsequent value, up to `ISSUED`. (`ERROR` on provider failure leaves the row `VERIFIED` — record that too if it occurs) | |
| 7 | `store_domain.tls_refreshed` audit evidence (§6.1) | Row id per "Refresh TLS status" invocation. §7.2: polling is **none** in Phase 9, so each advance is operator-driven | |
| 8 | **HTTPS serving observation** (⚖️ P9-D9 — *separate* from slot 6) | A real HTTPS observation of the test hostname showing HTTPS actually works: certificate issuer, validity window, and a SAN covering the hostname. **Recorded separately from the derived `ISSUED` of slot 6, and never merged with it** | |
| 9 | Storefront response from the custom hostname (§4.3) | **Requires `host_resolution` to be active** (§17.2 step 7 — see the ordering table above). The store served on that host (`RESOLVED`). The paired negative is recorded alongside: an unverified / TLS-pending custom host returns the **generic 404** identical to `STORE_NOT_FOUND` (🔎 S-4) | |
| 10 | Primary-domain evidence — **only if exercised** | `store_domain.primary_changed` row id. Set-primary requires `VERIFIED` + `ISSUED` (§6.1), so a success corroborates slots 3 and 6. Optional per P9-D9 | |

📐 **Why slot 8 exists, and why it is not a mapping change.** `tlsStatus=ISSUED` is **derived, not
observed**: `vercel-domain-hosting.provider.ts:118–121` computes `configured = verified &&
domainConfig !== null && !misconfigured` and then `certificate = configured ? 'issued' : 'pending'`,
reading **no certificate field** from either Vercel response. §7.2's mapping row speaks of
"certificate present", so slot 6 alone evidences configuration rather than a working certificate.
Slot 8 supplies the missing observation **evidentially**. ⚖️ P9-D9 explicitly does **not** authorize
changing §7.2, the adapter, or the mapping — 🔎 **S-8** leaves Vercel's exact fields to be confirmed at
implementation time, and any real defect found during execution is raised as its own record rather
than fixed silently.

📐 **`E-3` is independent of §17.1 items 3 and 4.** `E-3` concerns `type=CUSTOM` rows, whose serving
gate does consult `tlsStatus` (§4.3); the platform wildcard is a `PLATFORM_SUBDOMAIN` row, for which
§4.3 consults neither verification nor TLS. So no `*.stores.printforge.world` observation can satisfy
`E-3`, and `E-3` does not require the wildcard certificate to exist. They block separately — P9-D9's decision to run `E-3` *after* them is an **execution ordering** choice (it runs against production, and slot 9 needs `host_resolution`), **not** a statement that either gate supplies `E-3`'s evidence.

---

## 20. Deferred to Later Phases (explicit)

| Item | Phase | Source |
|---|---|---|
| Scheduled domain re-verification (cron) and periodic `tlsStatus` refresh worker | **Phase 11** | ⚖️ P9-D7; §15 "Phase 11 cron" |
| Customer authentication: `CustomerRefreshToken`, `/storefront/auth/*`, customer JWT, `CUSTOMER_JWT_ACCESS_SECRET`, `customerId` cutover | **Phase 12** | ⚖️ P9-D1 |
| Customer cookie handling on custom domains (first-party vs proxied) | **Phase 12** | ⚖️ P9-D4 |
| `StoreContextProvider` consumers: theme tokens, branding, homepage structure, per-store query-key namespacing, hook sweep, `services/api/*` store-context plumbing beyond the bootstrap | **Phase 12** | Master Plan §16; audit §11 |
| Multiple themes/templates per store; store-specific configuration UI | **Phase 12** | Owner's target architecture statement |
| Store legal pages; legal pages in `sitemap.xml` | **Phase 13** | Master Plan §16 line 2600 |
| Removal of the `legacy_single_store` strategy | future record after an observation window | §15 (this spec) |
| Making `Store.slug` globally unique | not scheduled | §5 S-5 — constraint change outside G-19 |
| Vercel-side domain redirect configuration (edge 301 instead of API/SPA 301) | ops option, not required | §11 |
| Any second `DomainHostingProvider` implementation | not scheduled; would need a new decision | ⚖️ P9-D3 |
| Asset / storage changes | **Phase 10** | none required by Phase 9 |

---

## 21. Spec Decisions Requiring Owner Confirmation at G-21

Each was a design choice neither §15 nor P9-D1…D8 fixed. None changes a ratified decision. **As of 2026-09-20 every item is RESOLVED** — S-2, S-7, S-14 by owner records (`DECISIONS.md` P9-S2 / P9-S7 / P9-S14); S-1 and S-6 by the first spec review; the rest classified A/B and finalised in the second. The table is kept as the traceability record. G-21 (spec approval) remains the gate to implementation.

| ID | Decision | Section | Why it is needed |
|---|---|---|---|
| **S-1** | Storefront-host signal = browser `Origin` for API calls; edge-captured host for SEO routes; trust model = scope selection only | §4.1 | The API is cross-origin; `Host` is the API host. §15's "Host header is the only input" cannot be implemented literally for API calls. **STATUS: RESOLVED (spec review 2026-09-20)** — security model made explicit in §4.1.1–§4.1.4; guards never read `Origin` (§4.4); W4 tenant-anchoring closes the pre-existing client-supplied-id gap; API never 301s (§4.3, §11). Listed for owner visibility, not as an open question |
| **S-2** | New permission `store-domain:manage`, OWNER-only default | §6.1 | No existing permission covers domain management; P7-D2 precedent. **STATUS: RESOLVED — RATIFIED as `DECISIONS.md` P9-S2 (2026-09-20)** |
| **S-3** | `PlatformConfig` as a generic key/value table | §3.3 | P9-D8 requires the table; shape not fixed. **STATUS: RESOLVED (A/B, spec review 2026-09-20)** |
| **S-4** | `NOT_SERVED` returns the same 404 as unknown; `STORE_UNAVAILABLE` reasons share one 503 body | §4.3 | Prevent hostname-state enumeration (§15 SECURITY IMPACT). **STATUS: RESOLVED (A/B, spec review 2026-09-20)** |
| **S-5** | Platform subdomain from `store.slug` with pre-insert hostname uniqueness check; `Store.slug` not made unique | §5 | `Store.slug` is unique per tenant only (`@@unique([tenantId, slug])`); `hostname @unique` is the backstop. **STATUS: RESOLVED (B, spec review 2026-09-20)** — slug treated as immutable in Phase 9 (no runtime mutation path); future self-service creation / slug mutation is a separate decision |
| **S-6** | ~~Fifth nullable column `lastVerificationError` (text)~~ **No column.** Failure reason retained in the verify response, `TenantAuditLog` metadata and the structured log; row stays `PENDING` with `lastCheckedAt` bumped | §6.3 | §15 line 2196 requires the reason to be *retained* and the row to *stay `PENDING`*; P9-D2 enumerates exactly four columns + their enums — a text column is outside that list, so adding it would expand a ratified schema decision. **STATUS: RESOLVED (spec review 2026-09-20)** — schema unchanged; smallest change satisfying §15 is zero columns |
| **S-7** | Platform "revoke" (`VERIFIED → FAILED`) — **sticky**; restore only by platform override / platform re-verify; no schema field | §6.3, §6.4, §14.2 | Abuse / reassignment response; only platform, audited both ways. **STATUS: RESOLVED — RATIFIED as `DECISIONS.md` P9-S7, OPTION A (2026-09-20)** |
| **S-8** | Vercel adapter limited to project-domain add/get/remove; endpoint details confirmed at implementation | §7.3 | Keeps the adapter contract fixed without pre-empting Vercel API specifics. **STATUS: RESOLVED (A/B, spec review 2026-09-20)** |
| **S-9** | ~~CORS predicate active in both resolution modes~~ **Mode-coupled:** `legacy_single_store` = `FRONTEND_URL` only (today's behaviour); full dynamic allow-list only in `host_resolution`; read-only `@PlatformOnly()` dry-run endpoint for pre-flip verification | §9, §14.4, §17.2 | The original option created a bounded misrouting window (§15 KEY RISKS, Critical). **STATUS: RESOLVED (B, corrected at spec review 2026-09-20)** |
| **S-10** | `GET /storefront/context` returns 200 (not 301) on a non-primary host | §11 | Lets the SPA self-redirect using `canonicalOrigin`. **STATUS: RESOLVED by S-1 (spec review 2026-09-20)** — §4.3/§11 now state the API never 301s a cross-origin fetch on any storefront route; S-10 is the general rule applied to the bootstrap endpoint, not a separate choice |
| **S-11** | `sitemap.xml` on an unknown host → 404 | §12.1 | Crawlers must not index unknown hosts. **STATUS: RESOLVED (A/B, spec review 2026-09-20)** |
| **S-12** | Vercel rewrite host-capture; fallback to forwarded-host with the same trust | §12.2 | Edge mechanism detail. **STATUS: RESOLVED (A/B, spec review 2026-09-20)** |
| **S-13** | Kill-switch read error with no cache → 503, never a guessed mode | §15 | Both modes must be chosen deliberately. **STATUS: RESOLVED (B, spec review 2026-09-20)**; P9-S14 routes the invalid-value case through this same path |
| **S-14** | ~~Invalid stored mode → legacy + error log + Sentry~~ **FAIL CLOSED:** error log + Sentry + treat as read failure → last-known valid cached mode, else 503; never `legacy_single_store` | §15, §14.3 | `legacy_single_store` is not isolation-safe once multiple stores exist; corruption must not select it. **STATUS: RESOLVED — RATIFIED as `DECISIONS.md` P9-S14, OPTION B (2026-09-20)** |

---

## 22. What This Spec Does Not Authorize

No file under `backend/src/`, `backend/prisma/`, `frontend/src/`, `frontend/vercel.json`, no environment variable, no Render/Vercel/DNS/TLS change, no production command, no migration, no backfill, no commit of implementation may occur under this document. Implementation begins only after **G-21** (approval of this spec, with §21 resolved) is recorded in `docs/saas/DECISIONS.md`, and then only wave by wave in the order of §2.
