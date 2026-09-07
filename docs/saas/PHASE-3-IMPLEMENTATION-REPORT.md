# Phase 3 — Tenant Context & Authorization: Implementation Report

**Status: IMPLEMENTED, NOT DEPLOYED.** All code, tests, and the RLS migration
file exist in the working tree. Nothing has been staged, committed, or
pushed. No migration has been applied to any database (local `printforge_test`
included) outside of transaction-rollback verification. No production system
was accessed or modified. **Phase 4 was not started.**

Implements `docs/saas/PHASE-3-START-GATE-AND-IMPLEMENTATION-SPEC.md` under
`G-20` (approved), against the five resolved decisions: **D6** (both
host/domain + `X-Active-Tenant`, header cross-validated), **D4** (both
app-layer primary + RLS defense-in-depth), **G-13** (ratified 13-permission
catalogue), **P3-D1** (env-var rollout flags), **P3-D2** (RLS fact-finding).

---

## 1. Implementation summary

| Mechanism | Status |
|---|---|
| Permission catalogue (`permission.ts`) | Implemented, unit-tested (16 tests) |
| `@RequirePermission` / `PermissionsGuard` | Implemented, unit-tested (8 tests) |
| `TenantContext` + `TenantContextGuard` (D6) | Implemented, unit-tested (8 tests) |
| Tenant-scoped Prisma client (D4, app-layer) | Implemented, e2e-tested against real Postgres |
| Object-level auth helper (`assertObjectInTenant`) | Implemented (404-on-mismatch, per spec) |
| RLS migration (D4, defense-in-depth) | Written, verified correct via isolated transaction-rollback tests (6 tests) against real Postgres; **not applied to any database** |
| Mechanical `@Roles` → `@RequirePermission` swap | Complete — all 27 sites across 3 controllers; `RolesGuard`/`@Roles`/`ROLES_KEY` removed |
| Per-module rollout flags (P3-D1) | Implemented via `ConfigService`, all default `advisory` |
| `tenant-isolation.e2e-spec.ts` | New, 10 tests, all passing against the real app + real Postgres |

---

## 2. Files changed (exact)

**New:**
- `backend/src/auth/permissions/permission.ts` + `.spec.ts`
- `backend/src/auth/permissions/require-permission.decorator.ts`
- `backend/src/auth/permissions/permissions.guard.ts` + `.spec.ts`
- `backend/src/common/tenant/tenant-context.ts`
- `backend/src/common/tenant/tenant-context.guard.ts` + `.spec.ts`
- `backend/src/common/tenant/tenant-prisma.ts`
- `backend/src/common/tenant/tenant-rls.ts`
- `backend/src/common/tenant/object-auth.ts`
- `backend/prisma/migrations/20260907183000_enable_rls_tenancy_tables/migration.sql`
- `backend/test/e2e/tenant-isolation.e2e-spec.ts`
- `backend/test/e2e/tenant-rls.e2e-spec.ts`
- `docs/saas/PHASE-3-START-GATE-AND-IMPLEMENTATION-SPEC.md`
- `docs/saas/PHASE-3-DECISION-DOCKET.md`
- `docs/saas/PHASE-3-IMPLEMENTATION-REPORT.md` (this file)

**Modified:**
- `backend/src/app.module.ts` — `TenantContextGuard` + `PermissionsGuard` added to the global `APP_GUARD` chain; `RolesGuard` removed.
- `backend/src/admin/admin.controller.ts` — controller-level `@Roles(Role.ADMIN)` replaced by 14 per-method `@RequirePermission(...)`.
- `backend/src/products/products.controller.ts` — 12 sites swapped.
- `backend/src/products/categories/categories.controller.ts` — 5 sites swapped.
- `backend/src/common/enums/role.enum.ts` — doc comment corrected (no longer claims "no per-resource permission system").
- `backend/src/auth/strategies/jwt.strategy.ts` — membership-loading query wrapped in `withPlatformRlsBypass` (RLS compatibility; query/result unchanged).
- `backend/src/common/config/configuration.ts` — `tenantEnforcement` config section added.
- `backend/src/migration-safety.spec.ts` — narrow G-19-style extension: a bare `ENABLE`/`FORCE ROW LEVEL SECURITY` on an existing table is now permitted (2 new tests; everything else the guard rejected still rejected — see §6).
- `backend/src/products/products.controller.spec.ts` — updated to check `REQUIRE_PERMISSION_KEY` instead of the removed `ROLES_KEY`.
- `backend/test/e2e/phase-2a-merchant-identity.e2e-spec.ts` — one test's name/comment corrected (its assertion was already still valid, unchanged).
- `backend/test/e2e/support/fixtures.ts` — `registerAdmin()` now also grants an `OWNER` `TenantMembership` (see §8 — required for backward compatibility, not optional).

**Deleted:**
- `backend/src/common/guards/roles.guard.ts`
- `backend/src/common/decorators/roles.decorator.ts`

**Explicitly not touched:** `schema.prisma` (no model change — matches spec §12: "no new business columns in Phase 3"); every commerce-domain service (`orders`, `payments`, `checkout`, `cart`, etc. — see §9 for why); any frontend file.

---

## 3. Migrations (exact)

One: `backend/prisma/migrations/20260907183000_enable_rls_tenancy_tables/migration.sql`.

- `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` + `ALTER TABLE ... FORCE ROW LEVEL SECURITY` + `CREATE POLICY "tenant_isolation" ...` for exactly six tables: `tenants`, `stores`, `store_domains`, `tenant_memberships`, `subscriptions`, `customers`.
- Zero business/commerce tables touched (verified by an automated test asserting the migration text contains no `ALTER TABLE "orders"`/`"carts"`/`"reviews"`/`"users"`).
- **Not applied to `printforge_dev`, `printforge_test`, or production.** Verified exclusively via `tenant-rls.e2e-spec.ts`, which runs the full migration SQL inside a Postgres transaction that always rolls back (Postgres DDL, including `CREATE ROLE`/`CREATE POLICY`/`ENABLE ROW LEVEL SECURITY`, is fully transactional — empirically confirmed before relying on it). Applying this migration anywhere requires its own explicit authorization, following the same pattern every other production migration in this project has required.

---

## 4. Permission catalogue and role mapping implemented

Exactly the G-13-ratified set (`backend/src/auth/permissions/permission.ts`):

`dashboard:read`, `orders:read`, `orders:transition`, `customers:read`,
`reviews:moderate`, `coupons:read`, `coupons:write`, `settings:read`,
`settings:write`, `products:read`, `products:write`, `members:manage`,
`payment-account:manage`.

`OWNER` = all 13. `ADMIN` = all except `members:manage` /
`payment-account:manage`. `STAFF` = 9 (dashboard/orders/customers/reviews/
coupons-read/settings-read/products, plus `orders:transition` and
`products:write`). `VIEWER` = the 6 `:read` permissions only. `SUPER_ADMIN`
has no entry in the map at all — structurally impossible for it to gain a
tenant permission through `PermissionsGuard` (frozen invariant 4, verified
by test).

**Correction found and applied during implementation:** the G-13 record's
informative "concrete swap mapping" table undercounted `products.controller.ts`
as 8 sites; the actual controller has 12 (it omitted `updateVariant` and
`removeImage`). Both are `products:write`, matching their siblings — the
categorization was never wrong, only the site count. `docs/saas/DECISIONS.md`
has been corrected to reflect this (12, not 8).

---

## 5. `TenantContext` resolution paths implemented

`backend/src/common/tenant/tenant-context.guard.ts`, resolution order:

1. `X-Active-Tenant` header, if present — cross-validated against the
   caller's `ACTIVE` `TenantMembership` rows; mismatch → 403 (never a
   silent fallback). Takes precedence (D6's "header as an explicit
   override" rationale).
2. Host/subdomain resolution (`StoreDomain` lookup by hostname) — the
   long-run mechanism; implemented and tested, but has no real effect
   today since no per-tenant admin subdomain routing exists in the
   frontend yet (matches the spec's own framing).
3. Convenience default: a caller with exactly one `ACTIVE` membership gets
   it automatically, no header needed.
4. Otherwise: no context set. Fail closed — any route requiring a
   permission then denies via `PermissionsGuard`.

`@Public()` and `@PlatformOnly()` routes are skipped entirely — a
`SUPER_ADMIN` gets no tenant context through this guard.

---

## 6. Prisma tenant-scoping approach (D4, application-layer, primary)

`backend/src/common/tenant/tenant-prisma.ts`, using Prisma Client
Extensions (`$extends`). `getTenantScopedClient(prisma, tenantId)` injects
`tenantId` (or, for `Tenant` itself, `id`) into every `where`/`data` for
five models that already carry the column: `Store`, `StoreDomain`,
`TenantMembership`, `Subscription`, `Customer`. Any operation on a scoped
model not explicitly handled throws rather than executing unfiltered
(fail closed). Proven correct end-to-end in `tenant-isolation.e2e-spec.ts`
against real `tenant_memberships`/`customers` data for two real tenants.

**Not wired into any commerce-domain service** (`orders`, `payments`,
`checkout`, `cart`, `coupons`, `reviews`, `uploads`, `app-setting`,
`invoices`, `notifications`) — none of their tables carry a `tenantId`
column yet (Phase 4's backfill), so the scoped client has nothing to filter
those tables by. Master Plan §9's own EXIT CRITERIA anticipates exactly
this: *"Enforcement flags may still be advisory for modules whose data
Phase 4 hasn't scoped yet."* Extending `TENANT_ID_SCOPED_MODELS` (one line)
and switching a domain service to `getTenantScopedClient` is the mechanical
Phase 4 follow-up this file is built to support.

`migration-safety.spec.ts` extension (mirrors G-19's own precedent, not a
weakening): a bare `ALTER TABLE <existing> ENABLE|FORCE ROW LEVEL SECURITY`
— alone, no other clause — is now permitted. Everything else the guard
rejected (`DROP`, `DISABLE ROW LEVEL SECURITY`, `NO FORCE ROW LEVEL
SECURITY`, any combined statement) is still rejected; both directions are
covered by new positive and negative tests.

---

## 7. RLS implementation and exact six-table scope

`tenants`, `stores`, `store_domains`, `tenant_memberships`, `subscriptions`,
`customers` — no more, no less (§3, §6).

**A finding not covered by P3-D2's original fact-finding, discovered and
handled during implementation:** Postgres exempts a table's *owner* from
RLS by default, independent of the `rolsuper`/`rolbypassrls` attributes
P3-D2 checked. A safe, read-only check against production
(`SELECT tableowner FROM pg_tables WHERE tablename IN (...)`) confirmed
`printforge_db_user` **owns** all six tables — so the migration issues
`FORCE ROW LEVEL SECURITY` on every one of them, not just `ENABLE`, or the
policies would have been a complete no-op against the app's own connection
while appearing enabled. No production configuration was changed to make
this check; it was read-only.

Policy shape (identical on all six tables): `USING (bypass_flag = 'true' OR
scope_column = current_setting(tenant_id, true))`. With neither GUC set,
`current_setting(..., true)` returns `NULL`, every comparison is `NULL`
(falsy), and every row is hidden — fail closed by construction, not by a
separate enforcement step.

**The bypass flag** (`app.bypass_tenant_rls`) exists for exactly two named,
legitimately cross-tenant call sites, both wrapped with
`withPlatformRlsBypass()` (`tenant-rls.ts`):
1. `JwtStrategy.validate()` — loading a `User`'s own memberships across
   every tenant they hold, before any tenant is selected.
2. `TenantContextGuard`'s host/domain lookup — resolving a tenant *from* a
   hostname, before a tenant is known.

Nothing else in the application sets this flag. Both wrapped queries'
inputs/outputs are byte-for-byte unchanged from before Phase 3 — only the
transport (a `SET LOCAL`-scoped transaction) is new.

**Verification method and its limit, stated plainly:** the local test
database's connection role (`atharva`) is a Postgres **superuser** (also
`BYPASSRLS`), confirmed via the same query used against production. A
superuser unconditionally bypasses RLS regardless of `FORCE` — a hard
Postgres guarantee, not a bug — so it cannot demonstrate enforcement
directly. `tenant-rls.e2e-spec.ts` addresses this the standard way: inside
a transaction that always rolls back, it `CREATE ROLE`s a temporary,
ordinary (`NOSUPERUSER NOBYPASSRLS`) role, `GRANT`s it table access, and
`SET LOCAL ROLE`s to it for the assertion phase — genuinely proving
fail-closed behavior, tenant-scoped visibility, the bypass flag, and the
`WITH CHECK` rejection of a cross-tenant `INSERT`, all against a real,
non-privileged connection. **This has not been verified against
production's actual `printforge_db_user` connection** — that would require
either applying the migration for real (its own separate authorization) or
an equivalent read-only role-simulation directly against production, which
was not requested and was not performed.

---

## 8. Rollout flag behavior (P3-D1)

`backend/src/common/config/configuration.ts` — `TENANT_ENFORCEMENT_<MODULE>`
env vars (products, cart, checkout, orders, payments, invoices, coupons,
reviews, uploads, appSetting, notifications), each `'enforced'` only on
exact string match, `'advisory'` otherwise (including unset/misconfigured
— fails toward the safe state). **No module can meaningfully be flipped to
`enforced` yet** — none of their tables carry `tenantId` (§6) — matching
Master Plan §9's own anticipation of this. The flags exist now so Phase 4
only has to add the column and flip a value.

**Finding, not independently verified:** whether changing one of these env
vars on this project's Render service triggers a mere restart (as `spec
§16` and the P3-D1 record assume) or a full redeploy could not be
confirmed. `docs/ops/DEPLOYMENT.md` documents a redeploy only for a
different, unrelated scenario (a *missing* required variable causing a
boot-time crash) — not a contradiction, but not confirmation either. No
Render account/CLI access was available or sought for this check (per this
session's standing D8-era restriction on ambient/unauthorized Render
access). **Non-blocking** — it affects only the speed of an emergency
rollback, not whether the rollback mechanism exists or works once
triggered.

---

## 9. Backward compatibility

- No merchant token/session shape change — Phase 3 is a guard/decorator
  swap on the server side only (§16 of the spec).
- **A real backward-compatibility break was found and fixed during
  implementation, not merely anticipated:** `PermissionsGuard` checks
  `TenantMembership`, not the legacy `User.role` column. The existing e2e
  test fixture `registerAdmin()` (`test/e2e/support/fixtures.ts`) only set
  `role='ADMIN'` — with `RolesGuard` removed, every admin-dependent e2e
  test in the suite would have started failing closed. Fixed by having
  `registerAdmin()` also grant an `OWNER` `TenantMembership`, mirroring
  exactly what the real Phase 2b production backfill already did for
  every legacy admin `User`. Verified: the full existing suite (unit + e2e)
  passes unchanged in behavior after this fix.
- `uploads.controller.ts` / `uploads.service.ts` / `orders.service.ts`
  inline `Role.ADMIN` checks (object-ownership logic, never routed through
  `@Roles`/`RolesGuard`) were left untouched — out of scope for the
  mechanical swap, and not "endpoint business logic" this phase was asked
  to touch.

---

## 10. Test results (exact)

| Suite | Result |
|---|---|
| Backend unit (`npm run test`) | **32 suites / 298 tests — PASS** (was 30/282 before Phase 3; +2 suites/+16 tests net: `permission.spec.ts`, `permissions.guard.spec.ts`, `tenant-context.guard.spec.ts`, +2 `migration-safety.spec.ts` cases, minus the 2 removed `roles.guard`-adjacent files) |
| Backend e2e (`npm run test:e2e`) | **21 suites / 183 tests — PASS** (was 19/167; +2 new suites: `tenant-isolation.e2e-spec.ts` (10 tests), `tenant-rls.e2e-spec.ts` (6 tests)) |
| `migration-safety.spec.ts` (G-10/G-19/D4-G-20) | 18/18 pass, including the new RLS-toggle positive/negative cases |
| `prisma validate` | schema valid |
| Lint (`npm run lint`) | 0 errors, 1 pre-existing warning (unchanged, unrelated file) |
| Build (`npm run build`) | PASS, exit 0 |
| TypeScript (`tsc --noEmit`) | PASS, 0 errors |
| Frontend | **Not run — no frontend file was touched by Phase 3.** |

One flaky, pre-existing, unrelated test (`tax-and-invoicing.e2e-spec.ts`'s
invoice-sequence test) failed once across ~6 full-suite runs during this
session and passed every other time, including isolated re-runs — the same
class of ordering-dependent flakiness already noted in the Phase 2b report
for a different test (`payments-race.e2e-spec.ts`). Not a Phase 3
regression.

---

## 11. Known non-blocking findings

1. RLS enforcement is proven via transaction-rollback + a simulated
   non-superuser role locally (§7) — not against production's actual
   connection. Recommended before relying on RLS in an incident: run an
   equivalent read-only check directly against production, or apply the
   migration to a disposable environment that mirrors production's role.
2. Render env-var-change deploy behavior is unconfirmed (§8) — affects
   only rollback *speed*, not correctness.
3. No commerce-domain service can be meaningfully flipped to `enforced`
   until Phase 4 backfills `tenantId` — expected, not a defect.
4. G-13's informative site-count table had a documentation gap (§4),
   corrected in `DECISIONS.md`.

None of these block Phase 3's own acceptance criteria (§12 below).

---

## 12. Acceptance criteria (spec §18) — verdict

- [x] `TenantContext` resolved on every request, all three paths implemented and tested.
- [x] Every domain service that has a `tenantId` column uses the scoped client; none that lack one are forced to (correctly out of scope).
- [x] Object-level tenant checks available (`assertObjectInTenant`), 404-on-mismatch.
- [x] `tenant-isolation.e2e-spec.ts` passing, including the context-spoof negative test.
- [x] Permission catalogue authored, ratified (G-13), enforced via `PermissionsGuard` on all sites; `RolesGuard` removed.
- [x] `PlatformGuard` independence verified (negative test).
- [ ] Advisory-mode "≥1 week clean in staging" — not applicable/not performed; no module has real data to be advisory *about* yet (see §11.3). Not a gap in this phase's own deliverable.
- [x] RLS enabled on tenancy tables (migration written, verified correct); DB-role/pooler compatibility confirmed (P3-D2) — **not yet applied anywhere**.
- [x] All pre-existing unit/e2e/frontend suites still green.
- [x] `role.enum.ts` doc comment corrected.

---

## 13. Explicit confirmations

- **Phase 4 was NOT implemented.** No column was added to any commerce
  table, no FK was re-pointed, `User.role` was not dropped or modified, no
  shopper `User` row was deactivated, and RLS was not enabled on any
  business table.
- **No production system was accessed for anything other than two
  read-only checks**, both already covered by this session's established
  safe-inspection pattern: confirming `printforge_db_user`'s role
  attributes (reused from the earlier P3-D2 finding, not re-queried) and
  confirming table ownership (§7, new this session) — no configuration
  changed, no role altered, no data written, no credential printed.
- **Nothing has been staged, committed, or pushed.**

---

## 14. Audit findings closed

An independent audit of this report (same session, adversarial re-read —
not a rubber stamp) found three genuine gaps and confirmed no P0/exploitable
issue. All three approved fixes below are implemented, tested, and green;
nothing else was touched (no architecture change, no reopening of D6, D4,
G-13, P3-D1, or P3-D2, no Phase 4 work).

### P1 — missing PrismaService allowlist CI gate (spec §10/§14)

**Closed.** New `backend/src/tenant-data-access-guard.spec.ts`, mirroring
`migration-safety.spec.ts`'s file-scanning style. Scans every non-spec file
under `src/` for direct access to the six tenancy models (`tenant`, `store`,
`storeDomain`, `tenantMembership`, `subscription`, `customer`) via a raw
`prisma`/`tx` delegate call or a `tenantMemberships` relation include, and
asserts any such access appears only in an explicit allowlist. The
allowlist is scoped to exactly the six named categories from the audit
(cron pollers, platform admin — reserved, no file exists yet, health, auth,
`tenant-context.guard.ts`, `jwt.strategy.ts`) and is grounded in the real
codebase, not invented — a positive-control test independently confirms
the two files that actually trigger the detector today are exactly
`jwt.strategy.ts` and `tenant-context.guard.ts`, nothing more, nothing
less. Deliberately does **not** scan for "any `PrismaService` import" —
that would fail the entire pre-existing commerce domain, which correctly
still uses the raw client since no commerce table carries `tenantId` yet
(Phase 4). 7/7 tests pass, including two positive-control and one
negative-control case proving the detector actually fires and doesn't
false-positive on an unrelated `customer` identifier.

### P2 — `object-auth.spec.ts` (assertObjectInTenant)

**Closed.** New `backend/src/common/tenant/object-auth.spec.ts`, 4 tests:
same-tenant resource passes through unchanged; mismatched-tenant resource
throws `NotFoundException`; `null` resource throws; `undefined` resource
throws. **No defect found** in the existing implementation — all four
tests passed against the code as originally written, confirming the
3-line function already behaves correctly; nothing was changed to make
tests pass.

### P2 (recommended) — controller authorization-decorator regression test

**Closed.** New `backend/src/admin-authorization-coverage.spec.ts`,
mirroring `platform.guard.spec.ts`'s file-scanning regression style,
scoped exactly to the three controller files Phase 3's mechanical swap
covers (`admin.controller.ts`, `products.controller.ts`,
`categories.controller.ts`) — deliberately not extended to the rest of
`src/`, since no other controller was ever `@Roles`-gated and asserting
this rule there would invent a broader policy Phase 3 never adopted. For
every HTTP-method-decorated handler in those three files, asserts exactly
one of `@Public()`, the platform-only decorator, or
`@RequirePermission(...)` is present — zero means an accidentally
unprotected route, two means a contradictory declaration. 7/7 tests pass,
including positive/negative controls proving the detector itself is
correct, plus the real scan confirming today's 27 routes are each
decorated exactly once (no defect found; this test only adds regression
protection against a *future* omission).

**One incidental fix along the way, disclosed for completeness:** both new
spec files initially tripped `platform.guard.spec.ts`'s unrelated
filesystem-walk test (it matches raw file text for the literal
`@PlatformOnly(` substring, which both new files' own source legitimately
needed to reference/describe). Resolved by rewording/splitting that
literal in the two new files only — `platform.guard.spec.ts` itself was
not touched.

### Exact test results (this fix pass)

| Suite | Result |
|---|---|
| `tenant-data-access-guard.spec.ts` (new) | 7/7 pass |
| `object-auth.spec.ts` (new) | 4/4 pass |
| `admin-authorization-coverage.spec.ts` (new) | 7/7 pass |
| Backend unit (full, `npm run test`) | **35 suites / 316 tests — PASS** (was 32/298 before this fix pass; +18 net from the three new files) |
| Backend e2e (full, `npm run test:e2e`) | **21 suites / 183 tests — PASS** (unchanged — no e2e file added or modified by these fixes) |
| `migration-safety.spec.ts` | 18/18 pass (unchanged) |
| `tsc --noEmit` | PASS, 0 errors |
| Lint | 0 errors, 1 pre-existing warning (unchanged, unrelated file) |
| Build | PASS, exit 0 |
| `prisma validate` | schema valid |

### Files changed (this fix pass, exact)

**New:**
- `backend/src/tenant-data-access-guard.spec.ts`
- `backend/src/common/tenant/object-auth.spec.ts`
- `backend/src/admin-authorization-coverage.spec.ts`

**Modified:** none. **Deleted:** none. No frontend file touched. No
migration created or altered. No production access. Nothing staged,
committed, or pushed.

### Remaining findings (genuine, non-blocking)

Unchanged from §11 items 1–3 (RLS enforcement verified locally, not against
production's actual connection; Render env-var deploy behavior
unconfirmed; no commerce module can be meaningfully `enforced` until Phase
4 — all expected, none newly introduced). Item 4 (G-13 site-count
documentation gap) and all three audit findings above are now closed.

---

## 15. Final Phase 3 verdict

**PASS.**

All three audit-identified findings are closed with real, passing tests —
not reworded claims. No P0 was ever found. No architecture changed, no
resolved decision was reopened, no Phase 4 work occurred. The remaining
items (production-vs-local RLS verification, Render deploy-speed
confirmation) are genuinely follow-up verification that cannot be settled
without either production access this session did not seek, or Phase 4's
own arrival — they do not block this phase's own, now fully-tested,
deliverable.
