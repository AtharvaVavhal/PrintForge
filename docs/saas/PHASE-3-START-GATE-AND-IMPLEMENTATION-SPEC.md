# Phase 3 — Tenant Context & Authorization: Start-Gate + Implementation Spec

**Status: SPEC ONLY — NOT IMPLEMENTED.** No source file, Prisma schema,
migration, or production system was touched to produce this document. It is
a planning artifact, written the same way `PHASE-0-DECISION-RESOLUTION-AND-PHASE-1-SPEC.md`
and `PHASE-2-DECISION-RESOLUTION-AND-SPEC.md` preceded Phase 1 and Phase 2
implementation. **Implementation must not begin until the owner decisions in
§2 are recorded and a start-gate result (mirroring `PHASE-2-START-GATE-RESULT.md`)
shows READY.**

Sources read to produce this spec: `PRINTFORGE-SAAS-IMPLEMENTATION-MASTER-PLAN-v1.0.md`
§8–§9 (Phase 2 and Phase 3), `PHASE-0-DECISION-RESOLUTION-AND-PHASE-1-SPEC.md`,
`DECISIONS.md` (D4, D6, P2-D7…P2-D10, G-13, G-17), `docs/architecture/BLUEPRINT-v1.2.md`,
`PHASE-2A-CHANGE-MAP.md` / `PHASE-2A-IMPLEMENTATION-REPORT.md` /
`PHASE-2B-IMPLEMENTATION-REPORT.md`, and the current backend auth code (`src/auth/`,
`src/common/guards/`, `src/common/decorators/`, `src/app.module.ts`).

---

## 1. Exact Phase 3 scope from the Master Plan

Per Master Plan §9 ("Tenant Context & Authorization"), **plus** the pieces
that the owner's Phase 2 decisions (P2-D8, P2-D9, G-17) explicitly moved out
of Phase 2 and into Phase 3 (Master Plan §9's printed text predates those
decisions and does not itself restate them — this spec is the merge):

**A. From Master Plan §9 directly:**
1. `TenantContext` — a server-derived, per-request primitive. Three code
   paths: storefront (Host → `StoreDomain` → `Store` → `Tenant`), merchant
   (authenticated `User`'s `TenantMembership` + D6's derivation rule), and
   platform (no tenant context, `PlatformGuard` only).
2. Tenant-scoped data access (D4) — a scoped Prisma client that injects
   `tenantId` into every tenant-owned-model query, used by every domain
   service instead of the raw `PrismaService`.
3. Object-level authorization helpers (`assertObjectInTenant` etc.),
   replacing ad-hoc ownership checks with tenant-match-then-actor-match.
4. An explicit catalogue of platform-scoped operations that must **not**
   be tenant-filtered (pollers, webhook receipt, health, platform admin,
   auth).
5. Per-module `advisory`/`enforced` rollout flag.
6. Postgres RLS enabled on the Phase 1/2a tables, policies prepared (not
   yet enforced pending Phase 4's `tenantId` backfill on business tables).
7. `tenant-isolation.e2e-spec.ts` (new, grows every later phase).

**B. Deferred into Phase 3 by owner decision (not in §9's printed text,
but contractually part of it per P2-D8/P2-D9/G-17):**
8. Author and ratify the permission catalogue (typed constant; strings
   ratified — **G-13**, currently "NOT REQUIRED FOR PHASE 2 → Phase 3").
9. Build `PermissionsGuard` + `@RequirePermission(...)` decorator.
10. Mechanically swap all `@Roles(Role.ADMIN)` call sites (19 found in
    the current tree: `products.controller.ts`, `categories.controller.ts`,
    `admin.controller.ts`, plus the decorator file itself) to
    `@RequirePermission(...)`.
11. Activate `PermissionsGuard` globally (joins `JwtAuthGuard` / `RolesGuard`
    / `PlatformGuard` in `app.module.ts`'s `APP_GUARD` chain), since it
    needs D6's active-tenant resolution to select which membership to
    check — this is exactly why P2-D9 moved it here.

**Explicitly NOT Phase 3** (Master Plan §9 "DATABASE/DATA IMPACT": *"No new
business columns in Phase 3"*): `tenantId`/`storeId`/`customerId` columns on
the ~20 existing commerce tables, FK re-pointing, `User.role` drop,
deactivating shopper `User` rows, RLS **enforcement** on business tables
(RLS is enabled/prepared here, enforced once Phase 4 backfills the column).
See §15 below for the full exclusion list.

---

## 2. Required owner decisions/gates before implementation

Phase 3 cannot start implementation the same way Phase 2a couldn't: it
needs its own resolved decision docket and a `G-11`-style spec-approval
gate. Proposed docket, using the project's existing ID space:

| ID | Decision | Status | Why it blocks Phase 3 |
|---|---|---|---|
| **D6** | Tenant-context derivation for the merchant console: host/subdomain vs. an explicit `X-Active-Tenant` header that must match a membership (else 403) — or both, with a defined precedence | **DEFERRED → Phase 3** (already recorded; this **is** Phase 3's own decision to resolve, not an external blocker) | `TenantContext`'s merchant-path resolver cannot be written without knowing which mechanism (or precedence order) is authoritative. |
| **D4** | Tenant isolation mechanism: app-layer scoping only, RLS only, or both (Master Plan §9 text already assumes "both", but D4 has never been owner-ratified — it sits `OPEN` in `DECISIONS.md`'s "not recorded" table, "Gates Phase 3") | **OPEN — must be ratified before implementation** | Determines whether RLS work (policies, GUC-setting, pooler compatibility check) is in scope at all, or app-layer scoping alone is sufficient for Phase 3. |
| **G-13** | Permission catalogue ratification (currently "NOT REQUIRED FOR PHASE 2 → Phase 3") | **Becomes due now** | The actual permission strings (`orders:read`, `orders:transition`, `products:write`, …) and the `TenantRole → Set<Permission>` map are a privilege-escalation surface (Master Plan §8 KEY RISKS: "reviewed as a security artifact") — same rigor as G-5's Phase 1 enum ratification. |
| *(new)* **P3-D1** | Rollout-flag storage: env var, DB-backed config, or code constant for `TENANT_ENFORCEMENT[module] = advisory\|enforced` | Not yet asked | Affects whether flipping a module to enforced requires a deploy or is an ops-toggleable runtime setting — an ops/architecture call, not obvious from existing code. |
| *(new)* **P3-D2** | RLS DB-role verification: confirm the Render-managed Postgres app role is non-superuser / non-`BYPASSRLS`, and confirm `SET LOCAL` + the connection pooling mode in use are compatible | Not yet asked (ops) | Master Plan §9 INFRASTRUCTURE IMPACT flags this as a "REQUIRES DECISION-minor / ops" item; if the answer is "app role bypasses RLS" or "pooler is incompatible with `SET LOCAL`", RLS cannot be the isolation mechanism (feeds back into D4). |
| *(new)* **G-20** | Phase 3 specification approval (this document) | Recommend opening once the above are resolved | Mirrors G-4 (Phase 1) and G-11 (Phase 2) — the established pattern of an explicit spec-approval gate before implementation starts. |

**None of D6, D4, G-13, P3-D1, P3-D2, or G-20 were resolved in the course of
producing this document.** No decision was invented or assumed on the
owner's behalf.

---

## 3. Current repository gaps relevant to Phase 3

Confirmed by reading the current tree (not assumed from docs):

- No `backend/src/common/tenant/` directory exists — `TenantContext`,
  the tenant-scoped Prisma client, and object-auth helpers are all new.
- No `backend/src/auth/permissions/` directory exists (matches AC-P2-25 —
  Phase 2a correctly did not create it).
- `RolesGuard` (`src/common/guards/roles.guard.ts`) is a flat `user.role`
  string check with **no** tenant awareness — it is the thing
  `PermissionsGuard` replaces, not extends.
- `JwtStrategy.validate()` (`src/auth/strategies/jwt.strategy.ts`) already
  loads `ACTIVE` `TenantMembership` rows onto `AuthenticatedUser.memberships`
  as identity facts (Phase 2a), but performs **no** active-tenant selection
  — its own doc comment says so explicitly: *"It does NOT derive an active
  tenant and does NOT make a tenant authorization decision — that is Phase 3."*
- `PlatformGuard` (`src/common/guards/platform.guard.ts`) already exists,
  is already registered globally in `app.module.ts`, and is explicitly
  documented as independent of tenant/permission logic (frozen invariant
  4) — Phase 3 must not couple it to `PermissionsGuard`.
- `app.module.ts`'s global `APP_GUARD` chain is currently:
  `ThrottlerGuard → JwtAuthGuard → RolesGuard → PlatformGuard`.
  `PermissionsGuard` (and a `TenantContext`-resolving interceptor/middleware)
  must be added to this chain in a defined order (see §17).
- `role.enum.ts` still documents itself as *"MVP has exactly two roles; no
  per-resource permission system"* — this comment becomes false the moment
  Phase 3 ships and should be corrected as part of the mechanical swap.
- No Row-Level Security is enabled on any table today (confirmed: no
  `ENABLE ROW LEVEL SECURITY` in any migration file).
- 19 `@Roles(...)` call sites exist today (grep-verified) across
  `products.controller.ts`, `categories.controller.ts`, `admin.controller.ts`
  — the exact swap surface for §10.

---

## 4. Tenant-context design

Three independent resolution paths, matching Master Plan §9 BACKEND IMPACT
exactly:

- **Storefront path:** `Host` header → `StoreDomain` lookup (unique on
  `hostname`, already exists as a Phase 2a table) → `Store` → `Tenant`.
  Cached (short TTL, invalidated on `StoreDomain` change per the KEY RISKS
  mitigation). No `Customer` auth exists yet (P2-D7 deferred it to Phase
  9/12), so in Phase 3 this path only matters for **unauthenticated**
  storefront reads (product/category listings) — there is no customer
  session to attach it to yet.
- **Merchant path:** the authenticated `User`'s `ACTIVE` `TenantMembership`
  rows (already loaded onto `AuthenticatedUser.memberships` by Phase 2a) +
  whatever D6 resolves as the active-tenant selector (host/subdomain,
  `X-Active-Tenant` header, or both). The resolved tenant **must** match
  one of the user's memberships or the request is rejected with 403
  (never a silent fallback to "first membership").
- **Platform path:** no tenant context at all. `PlatformGuard` alone,
  unchanged from Phase 2a. `TenantContext`-resolving middleware must
  explicitly skip `@PlatformOnly()` routes (mirrors the existing
  `@Public()` skip pattern in `jwt-auth.guard.ts`).

A client-supplied tenant identifier (header or otherwise) is **only** a
hint, cross-checked against the derived value — never trusted directly
(Master Plan §9 SECURITY IMPACT, invariant 1).

---

## 5. Membership resolution design

- Source of truth: `TenantMembership` rows with `status='ACTIVE'`
  (already the exact query `JwtStrategy.validate()` uses today — reuse,
  don't reinvent).
- A `User` may hold memberships in multiple tenants (Phase 2a schema
  already supports this — no schema change needed for multi-membership).
- "Active tenant" selection (D6) resolves to **one** membership per
  request; `TenantContext` carries `{ tenantId, membership: { role,
  status } }` for the merchant path.
- No membership → no tenant context → every tenant-scoped route 403s
  (fail closed, matches `PermissionsGuard`'s deny-by-default requirement).
- `SUPER_ADMIN` (`platformRole`) grants **no** implicit membership or
  permission in any tenant (frozen invariant 4 — already enforced today
  by `PlatformGuard`'s independence from `RolesGuard`; Phase 3 must
  preserve this when `PermissionsGuard` is added, not merge the two
  guards or their metadata keys).

---

## 6. Permission model and permission enforcement

- Representation: **typed constant** (P2-D8, frozen) — a
  `Permission` string-literal union (e.g. `'orders:read'`,
  `'orders:transition'`, `'products:write'`, `'coupons:write'`,
  `'settings:write'`, `'members:manage'`, `'payment-account:manage'`) and
  a `TenantRole → Set<Permission>` map, both in
  `backend/src/auth/permissions/` (new).
- The **exact string catalogue** is not yet authored — that is this
  phase's first implementation task, and per G-13 it must be **ratified
  as a security artifact** (same process as G-5) before `PermissionsGuard`
  is wired to any route.
- `can(membership, permission)` — a pure function, easily unit-tested in
  isolation from HTTP/Nest, checking `map[membership.role].has(permission)`.
- Deny-by-default: no catalogue entry for a role+permission pair → the
  guard denies (403), never permits by omission.
- The four `TenantRole` values already exist in the schema (`OWNER`,
  `ADMIN`, `STAFF`, `VIEWER`, added Phase 2a) — Phase 3 does not add or
  rename any.

---

## 7. `@RequirePermission` / `PermissionsGuard` requirements

- `@RequirePermission(permission: Permission)` — a `SetMetadata`-based
  decorator, structurally identical to the existing `@Roles(...)` /
  `@PlatformOnly()` pattern (`ROLES_KEY`, `PLATFORM_ONLY_KEY` — reuse the
  same `Reflector.getAllAndOverride` idiom).
- `PermissionsGuard.canActivate()`:
  1. Read the required permission via `Reflector`; no metadata → pass
     through (mirrors `RolesGuard`'s no-metadata behavior) unless the
     route is tenant-scoped by convention (see implementation-order note
     in §17 about a possible "default deny for any route under
     `/admin/*` with no explicit permission" CI grep gate, to prevent a
     forgotten decorator from silently granting access).
  2. Resolve `TenantContext` (must already be populated by the
     context-resolving middleware/interceptor — guard order matters, see
     §17).
  3. No tenant context → 403 (no implicit tenant).
  4. `can(context.membership, requiredPermission)` → 403 if false.
- Registered globally in `app.module.ts`'s `APP_GUARD` chain, **after**
  `RolesGuard` is removed from the merchant/admin surface it currently
  covers (see §8) and after the `TenantContext` resolver runs.
- Independent of `PlatformGuard` — a route can require both
  `@PlatformOnly()` and (separately) nothing from `PermissionsGuard`, or
  vice versa, never both simultaneously on the same handler (frozen
  invariant 4; Master Plan §9 "mutually exclusive" note at line 1469).

---

## 8. Legacy `@Roles`/`RolesGuard` migration boundary

- **Mechanical, one PR** (Master Plan §8 explicitly calls this "mechanical,
  one PR" even in the original pre-re-scope draft): every
  `@Roles(Role.ADMIN)` → `@RequirePermission(<appropriate permission>)`
  across the 19 confirmed call sites.
- `RolesGuard` and `@Roles`/`ROLES_KEY` are **removed** once the swap is
  complete and `admin-control-plane.e2e-spec.ts` is green against
  `@RequirePermission` — not left running in parallel indefinitely (dead
  code / confusing dual-authorization surface).
- `Role.CUSTOMER` / `Role.ADMIN` enum values themselves are **not**
  removed in Phase 3 — `User.role` retirement is explicitly **Phase 4**
  (P2-D10). Only the *guard mechanism* changes; the underlying legacy
  column stays, unread by authorization code from this point on (matches
  the Master Plan §8 KEY RISKS mitigation: "grep gate in CI for `.role`
  on user objects" once it's no longer supposed to be read for authz).
- `role.enum.ts`'s doc comment ("MVP has exactly two roles; no per-resource
  permission system") must be corrected in the same PR — it becomes
  actively misleading otherwise.

---

## 9. Server-derived tenant context rules

- Tenant context is **never** accepted from the client as the sole
  source — always derived server-side from `Host` (storefront) or
  `TenantMembership` (merchant), with any client-supplied value treated
  as a hint to be cross-validated, never trusted (Master Plan §9
  SECURITY IMPACT, invariant 1 — this is the single most important rule
  in the whole phase).
- Context resolution happens once per request, early (middleware or a
  global interceptor ahead of guards), and is attached to the request
  object for every downstream guard/service/controller to read — not
  re-derived per handler.
- Context-spoof attempt (a membership-holder for Tenant A sends
  `X-Active-Tenant: B`) → 403, verified by a dedicated negative e2e test
  (§14).

---

## 10. Cross-tenant/IDOR prevention

- Every tenant-owned-model query goes through the scoped Prisma client
  (D4), which injects `where: { tenantId }` automatically — a domain
  service cannot forget the filter because it never writes the filter
  itself.
- Object-level checks (`assertObjectInTenant`) are a **second**,
  explicit layer on top of the scoped client — defense in depth, not a
  replacement (Master Plan §9 REUSE section: existing per-handler
  ownership helpers like `assertOwnedBy` become the second half of a
  two-step check, tenant match prepended).
- Cross-tenant access returns **404, never 403** — a 403 confirms the
  resource exists in another tenant (existence leak); a 404 does not
  (Master Plan §9 SECURITY IMPACT, explicit requirement).
- CI gate: no domain service file imports `PrismaService` directly
  outside an explicit allowlist (cron pollers, platform admin, health,
  auth) — this is a **new**, required CI check, analogous to the
  existing `migration-safety.spec.ts` additive-only guard (G-10/G-19).

---

## 11. Affected backend modules/files

Per Master Plan §9 REPOSITORY AREAS, cross-checked against the current
tree:

**New:**
- `backend/src/common/tenant/` — context middleware/interceptor,
  `TenantContext` type, scoped-client factory, object-auth helpers.
- `backend/src/auth/permissions/` — permission catalogue, `can()`,
  `PermissionsGuard`, `@RequirePermission` decorator.

**Modified:**
- `src/common/database/prisma.service.ts` (or a new wrapper) — scoped
  client derives from this.
- `src/app.module.ts` — register the context resolver + `PermissionsGuard`
  in the `APP_GUARD`/middleware chain; remove `RolesGuard` once the swap
  lands.
- `src/common/guards/roles.guard.ts`, `src/common/decorators/roles.decorator.ts`
  — deleted once the swap + removal is complete.
- `src/common/enums/role.enum.ts` — doc-comment correction (§8).
- `src/products/products.controller.ts`, `src/products/categories/categories.controller.ts`,
  `src/admin/admin.controller.ts` — the 19 `@Roles` → `@RequirePermission`
  call sites.
- Every domain service that reads/writes tenant-owned data (full list per
  Master Plan §9: `products`, `cart`, `checkout` + `pricing` + `tax`,
  `orders` + `state-machine`, `payments` + reconciliation + webhooks,
  `invoices`, `coupons`, `reviews`, `uploads`, `app-setting`, `admin`,
  `notifications`, `users`) — switched from the raw `PrismaService` to
  the tenant-scoped client.
- Frontend: `services/api/client.ts` (store/tenant header hint), query-key
  namespacing groundwork (full sweep is Phase 12 per Master Plan; the
  mechanism lands here).

**Explicitly not touched:** `src/auth/auth.service.ts`'s bcrypt/timing/
login-delay/refresh-rotation mechanics (customer auth is still Phase
9/12 and merchant auth's core flow is unchanged); `src/customers/`
(does not exist and is not created here — no customer-auth work in
Phase 3).

---

## 12. Required Prisma/schema changes, if any

**None required for the tenant-context/permission-guard mechanism
itself.** Per Master Plan §9 DATABASE/DATA IMPACT: *"No new business
columns in Phase 3."* The two schema-adjacent items that **are** in
scope are infrastructure, not model changes:

- `ENABLE ROW LEVEL SECURITY` + `CREATE POLICY` statements on the
  existing Phase 1/2a tenancy tables (`tenants`, `stores`,
  `store_domains`, `tenant_memberships`, `subscriptions`, `customers`) —
  **only if D4 ratifies RLS as (part of) the isolation mechanism**. These
  are DDL, expressible as a Prisma migration (`CREATE POLICY` needs a
  raw-SQL migration block; Prisma has no native RLS DSL) but touch no
  `schema.prisma` model shape.
- No column is added, dropped, or altered on any existing table.

---

## 13. Required migrations, if any

- **Conditional on D4:** if RLS is ratified as part of the isolation
  mechanism, one additive migration enabling RLS + policies on the
  tenancy tables named in §12. This migration is enable-only (no
  enforcement change to existing data) and passes the additive-only
  guard (G-10/G-19) as written — `ENABLE ROW LEVEL SECURITY` and
  `CREATE POLICY` are neither `DROP`/`TRUNCATE`/`DELETE`/row `UPDATE`/
  `SET NOT NULL`, so no guard exemption should be needed, but this
  should be verified against the detector once the migration is drafted.
- **If D4 rejects RLS** (app-layer only): **zero** migrations in Phase 3.
- No migration touches `users`, `customers`, or any commerce table.

---

## 14. Required unit/integration/e2e/security/isolation tests

Per Master Plan §9 VERIFICATION/ACCEPTANCE CRITERIA, plus the mechanical
swap's own regression surface:

- **New `backend/test/e2e/tenant-isolation.e2e-spec.ts`** — two tenants
  seeded; Tenant A's merchant token cannot list/read/mutate Tenant B's
  products/orders/coupons/customers/settings (404, no existence/timing
  leak); Tenant A **can** do all of the above for its own data. This
  file is created here and is expected to grow in every subsequent
  phase (Master Plan's own framing).
- **Context-spoof negative test:** `X-Active-Tenant: B` with an A-only
  membership → 403.
- **Permission negative tests, per role:** a `VIEWER` cannot transition
  an order; a `STAFF` cannot manage members; every permission in the
  catalogue gets at least one negative test for a role that should not
  have it (deny-by-default verification).
- **`admin-control-plane.e2e-spec.ts`** — must stay green after the
  `@Roles` → `@RequirePermission` swap (regression, not new).
- **`PlatformGuard` independence:** a `SUPER_ADMIN` with no
  `TenantMembership` passes `PlatformGuard` but fails `PermissionsGuard`
  on any tenant-scoped route (frozen invariant 4, negative test).
- **CI lint/grep gate:** no domain service imports `PrismaService`
  directly outside the allowlist — enforced as a test/CI check, not just
  a code-review convention (mirrors `migration-safety.spec.ts`'s
  pattern).
- **Cron/poller regression:** `webhook-retry.e2e-spec.ts` and
  `payment-reconciliation.e2e-spec.ts` extended to confirm pollers still
  see **all** tenants' rows (they must use the global client, not the
  scoped one — a regression here would silently break background
  processing).
- **Advisory-mode observability:** if the advisory/enforced flag ships,
  a test confirming advisory mode logs/breadcrumbs a would-be violation
  without throwing.
- **Full existing suite green:** all current unit/e2e/frontend suites
  (266 unit / 167 e2e as of the Phase 2b report) continue to pass —
  single-tenant seed data must keep working (Master Plan §9: "verified
  via the advisory flag defaulting to a permissive single-tenant context
  in test").

---

## 15. Explicit Phase 4 items that MUST NOT leak into Phase 3

Per Master Plan §9/§10 and the existing D5/G-18-corrected boundary:

- `customerId` / `tenantId` / `storeId` columns on any of the ~20
  existing commerce tables (`orders`, `carts`, `reviews`, `coupon_usages`,
  `idempotency_keys`, `uploaded_files`, and the rest) — **zero** commerce
  tables gain a column in Phase 3.
- FK re-pointing of any existing row to `Tenant`/`Store`/`Customer`.
- `User.role` drop or any change to the legacy column's *data* (only its
  *authorization use* changes — see §8).
- Deactivating now-shopper `User` rows.
- RLS **enforcement** on business/commerce tables (only the Phase 1/2a
  tenancy tables may get RLS in Phase 3, per §12–§13, and only if D4
  ratifies it — enforcement on business tables waits for Phase 4's
  `tenantId` backfill).
- Any per-tenant revenue/row-count reconciliation baseline work (that's
  a Phase 4 precondition item, not Phase 3's).
- Customer-auth login/register/refresh routes, `CustomerRefreshToken`
  table, customer JWT issuance/validation — all P2-D7-deferred to Phase
  9/12, unaffected by Phase 3.
- The platform console UI/routes (Phase 5) — `PlatformGuard` stays a
  no-op in practice (no `@PlatformOnly()` route exists yet) unless Phase
  5 is separately started.
- Domain→Store→Tenant **runtime** resolution for the frontend storefront
  (Phase 9) — Phase 3 only lands the *backend* Host-header resolution
  mechanism for the storefront path; the frontend query-key namespacing
  groundwork lands here, but the full frontend sweep is Phase 12.

---

## 16. Rollback/backward-compatibility considerations

- **No data to roll back** beyond RLS enablement (if D4 ratifies it) —
  compensating action is `DISABLE ROW LEVEL SECURITY` / `DROP POLICY`,
  additive-safe, no data loss.
- **Behavioral rollback is flag-gated, not a deploy:** every module's
  `advisory`/`enforced` state (and, if desired, a single global
  kill-switch) can be flipped back to `advisory` to silence enforcement
  without a redeploy, if a leak or regression appears in production.
- **Image revert** restores pre-Phase-3 request handling entirely (no
  schema/data dependency Phase 3 creates that a revert would strand).
- **Backward compatibility during the guard swap:** the swap PR should
  land with both guards briefly co-existing behind a feature check (or
  be small/fast enough to ship as one atomic PR with full e2e coverage)
  — the existing pattern (Master Plan §8 KEY RISKS) of accepting an
  old-shaped token/session for one refresh-TTL window is **not** needed
  here since no token shape changes in Phase 3 (that already happened in
  Phase 2a); this is purely a guard/decorator swap on the server side.
- Sessions are unaffected — no `tokenVersion` bump, no re-login required
  (Phase 3 changes authorization *logic*, not token *contents*).

---

## 17. Exact implementation order

Recommended sequencing, front-loading the parts that gate everything
else:

1. **Resolve D6, D4, G-13, P3-D1, P3-D2** (owner/ops decisions, §2) —
   nothing below should start coding against an unresolved mechanism.
2. **G-20: approve this spec** (or a revised version reflecting the
   above decisions).
3. Author + ratify the permission catalogue (`src/auth/permissions/`) —
   pure data/types, no guard wiring yet, reviewable as its own small PR
   (the "security artifact" review G-13 calls for).
4. Build `TenantContext` primitive + the three resolution paths (§4) as
   an interceptor/middleware, **not yet wired into any guard** — testable
   in isolation first.
5. Build the tenant-scoped Prisma client (D4-dependent) + object-auth
   helpers (§10) — again unit-testable before wiring.
6. Build `PermissionsGuard` + `@RequirePermission`, wire `TenantContext`
   resolution ahead of it in the guard/middleware order. Do **not**
   register it globally yet.
7. Migrate domain services to the scoped client, one module at a time,
   each behind its own `advisory` flag — start with a low-risk module
   (e.g. `reviews` or `coupons`) to validate the mechanism before the
   higher-traffic ones (`orders`, `payments`).
8. Write `tenant-isolation.e2e-spec.ts` and all negative tests (§14)
   against the advisory-mode services — they should pass in the sense
   that violations are logged, not thrown, until enforcement flips.
9. Perform the mechanical `@Roles` → `@RequirePermission` swap (§8),
   register `PermissionsGuard` globally, remove `RolesGuard`/`@Roles`/
   `ROLES_KEY`. Confirm `admin-control-plane.e2e-spec.ts` green.
10. (If D4 ratifies RLS) land the RLS-enabling migration on the tenancy
    tables, verify the DB role / pooler compatibility (P3-D2) in a
    non-production environment first.
11. Flip modules from `advisory` to `enforced` one at a time, watching
    for breadcrumbs, per Master Plan's "advisory mode in staging for
    ≥1 week with zero cross-tenant breadcrumbs before any module flips"
    criterion.
12. Full regression pass (unit/e2e/lint/build) + update
    `PHASE-3-CHANGE-MAP.md` / `PHASE-3-IMPLEMENTATION-REPORT.md`
    (matching the established per-phase documentation pattern).

---

## 18. Phase 3 acceptance criteria

Directly from Master Plan §9 EXIT CRITERIA, made checkable:

- [ ] `TenantContext` resolved on every request (all three paths
      implemented and tested).
- [ ] Every domain service listed in §11 uses the scoped Prisma client;
      CI gate confirms no unlisted direct `PrismaService` import.
- [ ] Object-level tenant checks in place on every mutating/reading
      handler for tenant-owned resources.
- [ ] `tenant-isolation.e2e-spec.ts` passing for the seeded two-tenant
      case, including the context-spoof negative test.
- [ ] Permission catalogue authored, ratified (G-13), and enforced via
      `PermissionsGuard` on all 19 former `@Roles` sites; `RolesGuard`
      removed.
- [ ] `PlatformGuard` independence verified (negative test, §14).
- [ ] Advisory mode observed clean (zero cross-tenant breadcrumbs) in a
      non-production environment for the agreed observation window
      before any module is flipped to `enforced`.
- [ ] (If D4 = RLS or both) RLS enabled on tenancy tables; DB-role and
      pooler compatibility confirmed (P3-D2).
- [ ] All pre-existing unit/e2e/frontend suites still green.
- [ ] `role.enum.ts` doc comment corrected; no source file still
      describes the system as "no per-resource permission system."

---

## 19. Phase 3 commit boundaries

Following the granular-PR discipline visible in the existing git history
(Phase 2a/2b each landed as scoped, reviewable commits) and this spec's
implementation order (§17):

1. `feat(saas): author phase 3 permission catalogue` — §17 step 3 only.
2. `feat(saas): add tenant context resolution primitive` — §17 steps 4–5,
   no guard wiring, no service migration.
3. `feat(saas): add PermissionsGuard and RequirePermission decorator` —
   §17 step 6, not yet globally registered.
4. `feat(saas): migrate <module> to tenant-scoped Prisma client` — one
   commit per module (§17 step 7), each independently revertable.
5. `test(saas): add tenant-isolation e2e suite` — §17 step 8.
6. `feat(saas): swap @Roles to @RequirePermission, activate PermissionsGuard, remove RolesGuard` —
   §17 step 9, the single mechanical-swap commit Master Plan §8 describes
   as "one PR."
7. `feat(saas): enable RLS on tenancy tables` — §17 step 10, **only if**
   D4 ratifies RLS; otherwise this commit does not exist.
8. `docs(saas): phase 3 change map and implementation report` — closing
   documentation commit, matching every prior phase.

No commit in this list touches a commerce-table schema, `User.role`, or
production data — consistent with §15's exclusion list. As with every
prior phase in this repository, **no commit here should be created until
explicitly requested**, and staging must remain scoped to exactly the
files each commit's description names (per this session's established
git discipline).
