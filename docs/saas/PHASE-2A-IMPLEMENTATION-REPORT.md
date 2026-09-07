# PrintForge SaaS — Phase 2a Implementation Report

| Field | Value |
|---|---|
| Document | `docs/saas/PHASE-2A-IMPLEMENTATION-REPORT.md` |
| Version | 1.0 |
| Date | 2026-09-06 |
| Repository | `AtharvaVavhal/PrintForge`, `main` |
| Phase | **2a — Identity Foundation Expansion** |
| Mode | IMPLEMENTATION |
| Contract | `docs/saas/PHASE-2-DECISION-RESOLUTION-AND-SPEC.md §C` (APPROVED via G-11) |
| Baseline | Phase 1 ACCEPTED (`76fd26e`) — 31 models / 18 enums / 10 migrations |
| **Result** | **31 → 32 models · 18 → 19 enums · 10 → 11 migrations** |
| **Final verdict** | **PASS WITH NON-BLOCKING FINDINGS** |
| Phase 2b | **NOT implemented** (BLOCKED on D2 + D8 + G-16) |
| Phase 3 | **NOT started** |

---

## 1. Phase 2a objective

Implement the identity/data foundation that is safe to ship additively, without production data
and without the Phase-9 store-domain runtime: the platform super-admin axis (`PlatformRole` +
`User.platformRole` + `PlatformGuard`), the store-scoped storefront-identity root (`Customer`
model), and the merchant JWT identity enrichment (memberships + `platformRole` as facts, thin
token). Per decision **P2-D7** customer authentication is entirely deferred to Phase 9/12; per
**P2-D9** the permission-guard swap is Phase 3; per **P2-D10** `User.role` stays. Master Plan
§8; `PHASE-2-DECISION-RESOLUTION-AND-SPEC.md §C`.

## 2. Approved decisions used

| Decision / gate | Use in Phase 2a |
|---|---|
| **P2-D1 / G-12** | `enum PlatformRole { SUPER_ADMIN }` (not a boolean). |
| **P2-D2** | `User.platformRole` nullable, **no default**. |
| **P2-D4** | Merchant access token is **thin** `{ sub, tokenVersion }`; memberships/`platformRole` resolved fresh in `JwtStrategy.validate()`. |
| **P2-D7 (OPTION 3)** | Customer auth deferred to Phase 9/12 → **no** `/storefront/auth/*`, **no** `CustomerRefreshToken` table, **no** customer token runtime. |
| **P2-D8 / P2-D9 / G-13** | Permission catalogue + guard swap → **Phase 3**. Nothing authored here (`src/auth/permissions/` absent). |
| **P2-D10** | `User.role` retained and still read by `RolesGuard`. Nothing removed. |
| **P2-D11** | `Customer.isActive` only — **no** `CustomerStatus` enum. |
| **P2-D12** | `Customer.tenantId` a plain FK column now; composite/same-store FK → Phase 4. |
| **P2-D3 / P2-D5 / P2-D6 / P2-D13 / G-15** | Design recorded for Phase 9/12 — nothing built. |
| **G-11** | The §C contract is the implementation contract. |
| **G-19** | `migration-safety.spec.ts` evolved to permit a narrow nullable `ADD COLUMN`. |
| **G-16 / D2 / D8** | **PENDING** — Phase 2b (backfill) is not touched. |
| **D6** | DEFERRED — no tenant-context anything. |

## 3. Exact scope implemented

1. `enum PlatformRole { SUPER_ADMIN }`.
2. `User.platformRole PlatformRole?` — nullable, no default; the only new `users` column.
3. `model Customer` — 19 columns (Master Plan §8 list), `@@unique([storeId, email])`,
   `@@index([storeId])`, `@@index([tenantId])`, FK → `stores`/`tenants` `ON DELETE RESTRICT`.
4. `PlatformGuard` (`src/common/guards/platform.guard.ts`) — global via `APP_GUARD`; no-op
   unless a route carries `@PlatformOnly()`.
5. `@PlatformOnly()` (`src/common/decorators/platform-only.decorator.ts`) — used by **no** route.
6. Merchant `JwtStrategy.validate()` loads `platformRole` + ACTIVE `tenantMemberships`.
7. `AuthenticatedUser` → `{ id, email, role, platformRole, memberships[] }` (identity facts).
8. Thin merchant token — `signAccessToken()` emits `{ sub, tokenVersion }`.
9. Backward compatibility — `validate()` accepts a pre-Phase-2a `{ sub, email, role,
   tokenVersion }` token identically (it never reads `email`/`role` from the payload).
10. `migration-safety.spec.ts` evolved per **G-19** (no weakening).
11. Tests — 1 new unit spec, 2 new e2e specs, 2 updated + 2 added migration-safety cases,
    `db.ts` + `fixtures.ts` support.
12. Dev/test fixture — `createCustomer()` in `test/e2e/support/fixtures.ts` (spec §C.1 item 10).

**Not implemented (out of scope):** everything in `PHASE-2A-CHANGE-MAP.md §4`.

## 4. Baseline state (before this task)

`backend/prisma/schema.prisma` at `76fd26e`: 31 models, 18 enums; `User` had `role Role
@default(CUSTOMER)` and no `platformRole`; no `Customer`; `AuthenticatedUser = { id, email,
role }`; access token `{ sub, email, role, tokenVersion }`; global guards Throttler → JwtAuth →
Roles; 10 migrations; `migration-safety.spec.ts` rejected **all** `ALTER TABLE <existing>`.
Backend unit 28 suites / 257 tests; e2e 17 suites / 140 tests; frontend 100 files / 759 tests
(Phase 2 preflight baseline).

## 5. PlatformRole changes

- `enum PlatformRole { SUPER_ADMIN }` — exactly one value; placed next to `Role` in the enum
  section with a Phase 2a comment. `Role { CUSTOMER, ADMIN }` **unchanged** (verified:
  `identity-foundation` AC-P2-05).
- Extensible by a future forward migration; no data depends on it yet.

## 6. User changes

- **One** new column: `platformRole PlatformRole?` — nullable, **no `DEFAULT`** (verified at
  the DB level: `information_schema.columns` → `is_nullable = YES`, `column_default = NULL`).
- Every existing `users` row is `platformRole = NULL` after the migration (metadata-only
  change; no row rewrite).
- No other `User` field changed. Address columns, auth columns, `role`, `tokenVersion`,
  Phase 1 back-relations all untouched.

## 7. Customer model

`model Customer` (`@@map("customers")`) — 19 columns exactly as Master Plan §8 enumerates:

`id` (uuid pk) · `storeId` · `tenantId` · `email` · `passwordHash` · `tokenVersion` (`@default(0)`)
· `failedLoginAttempts` (`@default(0)`) · `passwordResetTokenHash?` · `passwordResetExpiresAt?` ·
`isActive` (`@default(true)`) · `addressLine1?` · `addressLine2?` · `city?` · `state?` ·
`postalCode?` · `country?` · `phone?` · `createdAt` (`@default(now())`) · `updatedAt` (`@updatedAt`).

- `@@unique([storeId, email])` — store-scoped identity (verified: same-store duplicate → P2002;
  same email in two stores → allowed).
- `@@index([storeId])`, `@@index([tenantId])`.
- FK `storeId` → `stores.id` `ON DELETE RESTRICT ON UPDATE CASCADE`; FK `tenantId` →
  `tenants.id` `ON DELETE RESTRICT ON UPDATE CASCADE` (verified: deleting a Store/Tenant that
  has a Customer → P2003).
- **No relation to `User` or `TenantMembership`** — no FK path (verified: the customers column
  set contains no `userId`/`membershipId`). A `Customer` can never hold a membership.
- `isActive` is the only lifecycle field; **no `CustomerStatus` enum** (verified: `pg_type` has
  no `CustomerStatus`).
- `Customer` rows are created in Phase 2a **only** by the dev/test `createCustomer()` fixture.
  The production `role='CUSTOMER'` → `Customer` backfill is **Phase 2b** (not done).

### 7.1 Finding P2A-F1 (non-blocking) — spec said "18 fields", the approved list is 19

`PHASE-2-DECISION-RESOLUTION-AND-SPEC.md §C.3` / `§B.5` and `PHASE-2-DECISION-CLOSURE.md §1a`
describe the `Customer` model as "18 approved fields". The **authoritative named list** (Master
Plan §8, quoted verbatim in §C.3) is: `id, storeId, tenantId, email, passwordHash` + 5 auth
fields + **7** address columns (`addressLine1..country` = 6, plus `phone`) + `createdAt,
updatedAt` = **19 columns**. The "18" is an off-by-one prose miscount (the 7 `User` address
columns were undercounted as 6), directly analogous to the Phase 1 "index count 17 → 15"
correction. **Implemented: the 19 named columns exactly, mirroring `User`'s address columns
1:1.** No field was invented or omitted. Recommended: correct the "18" label in the spec/closure
prose to "19". This does not change any field, type, default, index, or relationship.

## 8. PlatformGuard

- `PlatformGuard.canActivate()` — reads `PLATFORM_ONLY_KEY` metadata; returns `true` (no-op)
  when absent; otherwise throws `ForbiddenException('Platform super-admin access required')`
  unless `req.user.platformRole === PlatformRole.SUPER_ADMIN`.
- Registered globally in `app.module.ts` as `{ provide: APP_GUARD, useClass: PlatformGuard }`
  after `RolesGuard` — **live but dormant**: `grep` proves no route in `src/` applies
  `@PlatformOnly()`.
- **Independent of `RolesGuard` and of tenant membership** (frozen SaaS invariant 4) — verified
  by a unit test where a legacy `role='ADMIN'` user who also holds an `OWNER` `TenantMembership`
  but has `platformRole=null` is **denied**.
- Tests: `src/common/guards/platform.guard.spec.ts` — 7 unit tests (AC-P2-10, AC-P2-11).

## 9. JWT / auth identity changes

- `JwtStrategy.validate()` query now `include`s `tenantMemberships { where: { status:
  'ACTIVE' }, select: { tenantId, role } }` and returns `platformRole` + a mapped
  `memberships` array. The `tokenVersion` re-check and `!user.isActive` rejection are
  **unchanged** (verified).
- `AuthenticatedUser` / `AuthenticatedMembership` interfaces extended in
  `current-user.decorator.ts`. The new fields are **identity facts** — nothing reads
  `memberships` for an authorization decision; there is **no** active-tenant derivation and
  **no** implicit Tenant #1 (verified: no `TenantContext`/`activeTenantId`/`X-Active-Tenant`
  anywhere).
- One extra indexed (`tenant_memberships_userId_idx`) lookup per authenticated request (folded
  into the existing `findUnique` via `include`).

## 10. Token compatibility

- `signAccessToken()` emits **`{ sub, tokenVersion }`** only. Verified: a freshly-issued token
  decodes to exactly `{ sub, tokenVersion, iat, exp }` — no `email`, no `role`.
- A pre-Phase-2a `{ sub, email, role, tokenVersion }` token still authorizes (`GET /users/me` →
  200) — `validate()` ignores `email`/`role`. Verified (AC-P2-18).
- **`tokenVersion` is not bumped** by the migration or by any code path — register + login + a
  request leave it at `0` (verified, AC-P2-19). No existing session is invalidated.
- `PublicUser` / the `/auth/*` response bodies are **unchanged** (still carry `role` for the
  frontend). The frontend needs no change (it reads `role` from the body, not the JWT).

## 11. Migration name

`20260906171709_add_customer_and_platform_role` — applied to `printforge_dev` and
`printforge_test` (`prisma migrate status` → "Database schema is up to date!" on both). 11
migrations on disk.

## 12. Migration SQL safety review

`backend/prisma/migrations/20260906171709_add_customer_and_platform_role/migration.sql`,
inspected line by line:

| Statement | Verdict |
|---|---|
| `CREATE TYPE "PlatformRole" AS ENUM ('SUPER_ADMIN');` | additive ✓ |
| `ALTER TABLE "users" ADD COLUMN "platformRole" "PlatformRole";` | nullable, **no `NOT NULL`, no `DEFAULT`**, single action ✓ (the one permitted `ALTER <existing>` under G-19) |
| `CREATE TABLE "customers" ( … 19 columns … PK );` | additive ✓ (defaults on `tokenVersion`/`failedLoginAttempts`/`isActive`/`createdAt` are on a **new** table) |
| `CREATE INDEX "customers_storeId_idx"` / `"customers_tenantId_idx"` | additive ✓ |
| `CREATE UNIQUE INDEX "customers_storeId_email_key"` | additive ✓ |
| `ALTER TABLE "customers" ADD CONSTRAINT "customers_storeId_fkey" …` | `customers` is created in-file ✓ |
| `ALTER TABLE "customers" ADD CONSTRAINT "customers_tenantId_fkey" …` | `customers` is created in-file ✓ |

**No `DROP`, `TRUNCATE`, `DELETE`, row `UPDATE`, `SET NOT NULL`, type change, or `ALTER` on any
existing commerce table.** Reversible while unreferenced (compensating `DROP TABLE
"customers"` / `ALTER TABLE "users" DROP COLUMN "platformRole"` / `DROP TYPE "PlatformRole"`).

## 13. G-10 / G-19 verification

- **G-19 change** (`src/migration-safety.spec.ts`): the `!newInThisFile.has(target)` branch now
  permits `stmt` iff it matches `ALTER TABLE "<x>" ADD COLUMN "<c>" <type…>` **and** is a
  single action (no `, ADD|DROP|ALTER|RENAME`) **and** has no `NOT NULL` **and** has no
  `DEFAULT`. Everything else on a pre-existing table is still a violation.
- **No weakening** — verified by `G-19: still rejects everything else on an earlier-migration
  table` (7 cases: `NOT NULL`, `DEFAULT`, multi-action, multi-action+drop, type change, add
  constraint, rename — all rejected) plus the unchanged `DROP` / `TRUNCATE` / `DELETE` /
  `UPDATE` / `SET NOT NULL` / comment-prose tests.
- The on-disk scan (`it.each(guarded)`) now includes
  `20260906171709_add_customer_and_platform_role` and it **passes**.
- `migration-safety.spec.ts`: **15 tests pass** (was 13; +2 new, 2 rewritten).
- The 9 `LEGACY_MIGRATIONS` are untouched; the Phase 2a migration is **not** exempted — it
  passes the real detector.

## 14. Tests

| Spec | Kind | Count | Covers |
|---|---|:-:|---|
| `src/common/guards/platform.guard.spec.ts` | unit (NEW) | 7 | AC-P2-10, AC-P2-11; dormancy scan |
| `src/migration-safety.spec.ts` | unit (updated) | 15 (+2) | G-10 + G-19 |
| `test/e2e/identity-foundation.e2e-spec.ts` | e2e schema (NEW) | 18 | AC-P2-01, -03, -04, -05, -11, -26, -02, -06 |
| `test/e2e/phase-2a-merchant-identity.e2e-spec.ts` | e2e (NEW) | 10 | AC-P2-17, -18, -19, -12′; thin-token shape; admin-RBAC-unchanged |
| `test/e2e/support/{db,fixtures}.ts` | support | — | `customers` truncate; `createCustomer()` fixture |
| `test/e2e/tenancy-foundation.e2e-spec.ts` | e2e (Phase 1) | 23 | **unchanged, still green** |
| `test/e2e/tenant-bootstrap-seed.e2e-spec.ts` | e2e (Phase 1) | 3 | **unchanged, still green** |
| `test/e2e/admin-control-plane.e2e-spec.ts` | e2e | — | **unchanged, still green** (guard swap is Phase 3) |

Existing tests were **not weakened**. The two `migration-safety` tests that changed encoded
the pre-G-19 rule that the owner-approved G-19 explicitly revises; both were rewritten to
assert the new, precise boundary (permit only nullable `ADD COLUMN`; reject all else).

## 15. Test results

| Suite | Baseline (Phase 2 preflight) | Phase 2a | Result |
|---|---|---|---|
| `prisma validate` | valid | valid | ✅ |
| `prisma migrate status` (dev + test) | 10, up to date | **11, up to date** (both DBs) | ✅ |
| Backend unit (`npm run test`) | 28 suites / 257 | **29 suites / 266** | ✅ PASS |
| Backend e2e (`npm run test:e2e`) | 17 suites / 140 | **19 suites / 167** | ✅ PASS |
| `migration-safety.spec.ts` | 13 | **15** | ✅ |
| `scheduler-registration.spec.ts` | 1 | 1 (still asserts one `ScheduleModule.forRoot()`) | ✅ |
| Backend lint (`npm run lint`) | 0 errors, 1 pre-existing warning (`fixtures.ts:13`) | **0 errors, 1 warning** (same pre-existing `fixtures.ts:13`) | ✅ |
| Backend build (`npm run build`) | ok | ok | ✅ |
| Frontend tests (`npm run test`) | 100 files / 759 | **100 files / 759** | ✅ PASS |
| Frontend lint | 6 errors — all in pre-existing untracked storefront files | unchanged (no frontend file touched) | ⚠ pre-existing, not Phase 2a |

## 16. Phase 2b deferrals (explicitly NOT done)

`role='ADMIN'` → `OWNER` `TenantMembership` backfill; `role='CUSTOMER'` → `Customer` backfill
under Tenant #1's primary store; passwordHash / address copy; reconciliation report; any
production `User` read or write. **Gated on D2 (answered) + D8 (verified restore artifact) +
G-16 (ops authorization).** No production credentials were accessed; `backend/.env` was not
opened; no claim is made about production data. All DB work ran against local
`printforge_dev` / `printforge_test` only.

## 17. Phase 3 deferrals (NOT started)

`TenantContext`; active-tenant / `X-Active-Tenant`; `@Roles(Role.ADMIN)` → `@RequirePermission()`
swap (18 sites unchanged); `PermissionsGuard` (does not exist); permission catalogue authoring
(`src/auth/permissions/` does not exist); tenant-scoped Prisma client (D4); object-level tenant
authorization; frontend `activeTenantId` + tenant switcher. **D6 remains DEFERRED.**

## 18. Phase 4 deferrals (NOT started)

`customerId` on `Cart` / `Order` / `Review` / `CouponUsage` / `IdempotencyKey` / `UploadedFile`;
`OrderStatusHistory.changedByCustomerId?` / `changedByMembershipId?`; FK re-pointing; `tenantId`
/ `storeId` on ~20 existing commerce tables + composite constraints; `Customer.tenantId`
same-store composite FK; per-tenant counter split; `AppSetting` per-key split; deactivate
now-shopper `User` rows; **drop `User.role`** (retained and still read by `RolesGuard`);
`Role.CUSTOMER` retired Phase 15.

## 19. Phase 9 / 12 deferrals (NOT started)

`CustomerRefreshToken` table; `/storefront/auth/*` (register/login/refresh/logout/password-reset);
customer JWT strategy + guard + `AuthenticatedCustomer { id, storeId, tenantId }`; customer
access token `{ sub: customerId, storeId, tokenVersion, aud }`; mutual audience rejection;
distinct customer signing secret provisioning + wiring (`CUSTOMER_JWT_ACCESS_SECRET`);
Domain → Store → Tenant runtime resolution; store-contextual storefront auth pages. Designs are
recorded in `DECISIONS.md` v1.2 (P2-D3, P2-D5, P2-D6, P2-D7, P2-D13, G-15).

## 20. Known findings

| ID | Severity | Finding |
|---|:-:|---|
| **P2A-F1** | INFO (non-blocking) | Spec/closure prose says "18 approved fields" for `Customer`; the authoritative named list (Master Plan §8) is **19 columns** (the 7 `User` address columns were undercounted as 6). Implemented the 19 named columns exactly. Recommend correcting the "18" label in `PHASE-2-DECISION-RESOLUTION-AND-SPEC.md §C.3/§B.5` and `PHASE-2-DECISION-CLOSURE.md §1a`. See §7.1. |
| **P2A-F2** | INFO (non-blocking) | `§C.1(11)` frontend `authStore` enrichment (`platformRole` + `memberships`) **not implemented** — it is not in the task's numbered "Implement ONLY" list (items 1–12), it has no backend blocker, and the thin-token change is transparent to the current frontend. Backend `req.user` (`AuthenticatedUser`) **is** enriched (items 6–7). Fast-follow / can fold into Phase 3's frontend work. |
| **P2A-F3** | INFO (non-blocking) | Phase 2a used a `createCustomer()` **test fixture** (spec §C.1 item 10 says "seed/fixture") rather than extending `seed-tenant-bootstrap.ts`, keeping that seed and its 3 existing tests unchanged. A dev who wants a demo Customer row uses the fixture pattern or adds one ad-hoc. |
| **P2A-F4** | INFO (non-blocking) | Frontend lint still reports 6 errors — **all pre-existing**, in untracked storefront-redesign files (`CategoryProductRails.*`, etc.), 0 in tracked/Phase-2a scope. Not introduced or touched by this task. |
| **P2A-F5** | INFO | `docs/saas/DECISIONS.md` shows as modified in `git status` — that is the **v1.2** update from the prior "RECORD PHASE 2 OWNER DECISIONS" governance task, **not** this implementation task. This task changed no doc except adding `PHASE-2A-CHANGE-MAP.md` + this report. |

**No P0 / P1 findings.** No STOP condition was hit.

## 21. Files changed

**Modified (tracked):** `backend/prisma/schema.prisma`; `backend/src/app.module.ts`;
`backend/src/auth/auth.service.ts`; `backend/src/auth/strategies/jwt.strategy.ts`;
`backend/src/common/decorators/current-user.decorator.ts`; `backend/src/migration-safety.spec.ts`;
`backend/test/e2e/support/db.ts`; `backend/test/e2e/support/fixtures.ts`.

**New (untracked):**
`backend/prisma/migrations/20260906171709_add_customer_and_platform_role/migration.sql`;
`backend/src/common/decorators/platform-only.decorator.ts`;
`backend/src/common/guards/platform.guard.ts`;
`backend/src/common/guards/platform.guard.spec.ts`;
`backend/test/e2e/identity-foundation.e2e-spec.ts`;
`backend/test/e2e/phase-2a-merchant-identity.e2e-spec.ts`;
`docs/saas/PHASE-2A-CHANGE-MAP.md`; `docs/saas/PHASE-2A-IMPLEMENTATION-REPORT.md`.

`git diff --stat` backend tracked: **8 files, +264 / −33** (of which `schema.prisma` +94/−2,
`migration-safety.spec.ts` +92/−? — the `−33` is concentrated in the migration-safety header
rewrite + 2 rewritten tests).

**`backend/package.json` — unchanged.** No `git add .` / `git add -A` used; nothing staged.

## 22. Protected-file verification

| Protected file | State | OK |
|---|---|---|
| `.DS_Store` | `??` untracked, untouched | ✅ |
| `PHASE-6-IMPLEMENTATION-PLAN.md` | `??` untracked, untouched | ✅ |
| `SC-STOREFRONT-READINESS-AUDIT.md` | `??` untracked, untouched | ✅ |
| `backend/printforge-backend-source.zip` | `??` untracked, untouched | ✅ |
| `backend/prisma/seed-storefront-preview.ts` | `??` untracked, untouched | ✅ |
| `frontend/src/components/home/{CategoryProductRails,Faq}.*` | `??` untracked, untouched | ✅ |
| `docs/architecture/BLUEPRINT-v1.2.md` | `M` (pre-existing 2026-08-26 edit) — **not touched by this task** | ✅ |
| All `frontend/**` | pre-existing storefront working-tree changes — **not touched** | ✅ |

## 23. Final verdict

# PASS WITH NON-BLOCKING FINDINGS

Phase 2a delivers exactly the approved §C contract: `PlatformRole` + `User.platformRole` +
`Customer` model + `PlatformGuard` (dormant) + merchant JWT identity enrichment + thin token +
old-payload compatibility + the G-19 migration-safety evolution + tests. The migration is
additive-only and passes the (un-weakened) G-10/G-19 detector. All backend unit (266), backend
e2e (167), and frontend (759) tests pass; lint and build are clean (1 pre-existing warning);
`tokenVersion` is not bumped and no session is invalidated. Five INFO findings, none blocking —
chiefly a prose miscount ("18" vs the correct 19 `Customer` fields) and the deferred frontend
`authStore` enrichment.

**Phase 2a implemented.**
**Phase 2b NOT implemented** (BLOCKED on D2 + D8 + G-16).
**Phase 3 NOT started.**

---

*End of `docs/saas/PHASE-2A-IMPLEMENTATION-REPORT.md` v1.0.*
