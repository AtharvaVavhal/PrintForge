# PrintForge SaaS — Phase 2a Change Map

> **Phase 2a = IMPLEMENTED.** Identity/schema foundation only. Additive; touches no
> production data. Customer authentication runtime, `CustomerRefreshToken`, the permission
> machinery, and any `customerId` on existing tables are **NOT** in this change — see §4.

| Field | Value |
|---|---|
| Date | 2026-09-06 |
| Repository | `AtharvaVavhal/PrintForge`, `main` |
| Baseline | Phase 1 ACCEPTED (`76fd26e`) — 31 models / 18 enums / 10 migrations |
| Phase 2a START GATE | `READY` (`docs/saas/PHASE-2-START-GATE-RESULT.md`) |
| Contract | `docs/saas/PHASE-2-DECISION-RESOLUTION-AND-SPEC.md §C` (APPROVED via G-11); decisions `P2-D1…P2-D13`, `G-12`, `G-19` in `docs/saas/DECISIONS.md` v1.2 |
| **Schema after Phase 2a** | **32 models / 19 enums / 11 migrations** |
| Migration | `backend/prisma/migrations/20260906171709_add_customer_and_platform_role/` |
| Phase 2b | **NOT implemented** — `BLOCKED` on D2 + D8 + G-16 |
| Phase 3 / 4 / 9 / 12 | **NOT started** |

---

## 1. Phase 1 baseline → Phase 2a

| | Phase 1 (`76fd26e`) | Phase 2a |
|---|---|---|
| Models | 31 | **32** (+`Customer`) |
| Enums | 18 | **19** (+`PlatformRole`) |
| Migrations | 10 | **11** (+`20260906171709_add_customer_and_platform_role`) |
| `users` columns | unchanged | **+1** — `platformRole PlatformRole?` (nullable, no default) |
| Existing commerce tables | unchanged | **unchanged** (no `customerId`/`tenantId`/`storeId` — Phase 4) |
| `Role` enum | `{ CUSTOMER, ADMIN }` | **unchanged** |
| `RolesGuard` / `@Roles(Role.ADMIN)` (18 sites) | live | **unchanged** — still the admin authorization mechanism |
| Access token payload | `{ sub, email, role, tokenVersion }` | **thin `{ sub, tokenVersion }`** for newly-issued tokens; old fat tokens still accepted (one refresh-TTL window) |
| `AuthenticatedUser` (`req.user`) | `{ id, email, role }` | **`{ id, email, role, platformRole, memberships[] }`** — identity facts only |
| Guards (global) | Throttler → JwtAuth → Roles | **+ PlatformGuard** (no-op — no `@PlatformOnly()` route exists) |
| Customer auth | none | **still none** (deferred to Phase 9/12 — decision P2-D7) |
| `tokenVersion` | — | **not bumped** — no session invalidated |

---

## 2. Files changed (this task)

### Schema / migration
| Path | Change |
|---|---|
| `backend/prisma/schema.prisma` | `+94 / -2`. New `enum PlatformRole { SUPER_ADMIN }`; `User.platformRole PlatformRole?`; new `model Customer` (19 columns, `@@unique([storeId, email])`, `@@index([storeId])`, `@@index([tenantId])`, 2 FKs `ON DELETE RESTRICT`); virtual back-relations `Store.customers` / `Tenant.customers` (no column); header comment. The 2 deletions are a 2-line `@relation` re-alignment inside the `Store` block — **not** a `prisma format` reformat. |
| `backend/prisma/migrations/20260906171709_add_customer_and_platform_role/migration.sql` | **NEW.** `CREATE TYPE "PlatformRole"`; `ALTER TABLE "users" ADD COLUMN "platformRole" "PlatformRole"` (nullable, no default); `CREATE TABLE "customers"`; 3 `CREATE INDEX` (2 plain + 1 unique); 2 `ALTER TABLE "customers" ADD CONSTRAINT ... FOREIGN KEY`. **No `DROP` / `TRUNCATE` / `DELETE` / row `UPDATE` / `SET NOT NULL`.** |

### Backend source
| Path | Change |
|---|---|
| `backend/src/common/decorators/current-user.decorator.ts` | `AuthenticatedUser` enriched with `platformRole: PlatformRole \| null` and `memberships: AuthenticatedMembership[]`; new `AuthenticatedMembership` interface. `role` retained (legacy dual-read — Phase 4). |
| `backend/src/auth/strategies/jwt.strategy.ts` | `validate()` includes `tenantMemberships { where: status: ACTIVE }` + `platformRole` in the user query and maps them into `AuthenticatedUser`. `AccessTokenPayload` made `email`/`role` optional (old-token compat). `tokenVersion` re-check and inactive-user check unchanged. |
| `backend/src/auth/auth.service.ts` | `signAccessToken()` now emits `{ sub, tokenVersion }` only (thin token — P2-D4). No `tokenVersion` change. `toPublicUser()` / response bodies unchanged. |
| `backend/src/common/decorators/platform-only.decorator.ts` | **NEW.** `@PlatformOnly()` = `SetMetadata(PLATFORM_ONLY_KEY, true)`. |
| `backend/src/common/guards/platform.guard.ts` | **NEW.** `PlatformGuard` — admits only `platformRole === SUPER_ADMIN` on `@PlatformOnly()` routes; no-op otherwise. Independent of `RolesGuard` / memberships. |
| `backend/src/app.module.ts` | Register `{ provide: APP_GUARD, useClass: PlatformGuard }` after `RolesGuard`; doc comment. |
| `backend/src/migration-safety.spec.ts` | **G-19.** `findAdditiveOnlyViolations` permits a *single, nullable* `ADD COLUMN` (no `NOT NULL`, no `DEFAULT`, no second action) on a pre-existing table; still rejects `DROP` / `SET NOT NULL` / type change / `ADD CONSTRAINT` / multi-action / `RENAME` / everything else. Header rewritten. 2 tests updated to the new boundary, 2 tests added. |

### Tests
| Path | Change |
|---|---|
| `backend/src/common/guards/platform.guard.spec.ts` | **NEW.** 7 unit tests: no-op when not `@PlatformOnly()`; admit `SUPER_ADMIN`; deny `null` / no-user / non-SUPER_ADMIN value; independence from RolesGuard (legacy ADMIN + OWNER membership + `platformRole=null` → denied); source-tree scan proving no route applies `@PlatformOnly()`. |
| `backend/test/e2e/identity-foundation.e2e-spec.ts` | **NEW.** 18 schema-constraint tests: `PlatformRole` = `{SUPER_ADMIN}` only; `User.platformRole` nullable / no default / persists; `Role` unchanged; `Customer` FK RESTRICT (Store + Tenant); `@@unique([storeId,email])` (same-store dup rejected, cross-store same email allowed); `email` not globally unique; `isActive` lifecycle; no `CustomerStatus` enum; **no `Customer`↔`User`/membership FK path** + full 19-column set; no `customer_refresh_tokens` table; no `customerId` on any table. |
| `backend/test/e2e/phase-2a-merchant-identity.e2e-spec.ts` | **NEW.** 10 tests: `validate()` loads `platformRole` + only ACTIVE memberships as `{tenantId, role}` facts; stale `tokenVersion` / inactive user still rejected; old fat token authorizes; thin token authorizes; newly-issued token payload is `{ sub, tokenVersion }` only; `tokenVersion` never bumped; no `/storefront/auth/*` surface (404); admin RBAC unchanged (403 via RolesGuard). |
| `backend/test/e2e/support/db.ts` | `+'customers'` in `ALL_TABLES` (truncate list). |
| `backend/test/e2e/support/fixtures.ts` | `+createCustomer(prisma, { storeId, tenantId, email?, isActive? })` — direct-via-Prisma store-scoped Customer fixture (spec §C.1 item 10; there is no customer-auth API to go through). |

### Documentation
| Path | Change |
|---|---|
| `docs/saas/PHASE-2A-CHANGE-MAP.md` | **NEW** (this file). |
| `docs/saas/PHASE-2A-IMPLEMENTATION-REPORT.md` | **NEW.** |

---

## 3. NOT changed

- `backend/package.json` — **unchanged** (Customer fixture is a test helper, not a new seed script; `seed-tenant-bootstrap.ts` untouched → its 3 tests stay green).
- `backend/prisma/seed*.ts` — unchanged.
- `frontend/**` — **unchanged.** The thin token is transparent to the frontend (it reads `role` from the auth response body, not the JWT). §C.1(11) `authStore` enrichment is a deferred fast-follow (see report §20).
- `docs/architecture/BLUEPRINT-v1.2.md` — unchanged by this task (pre-existing 2026-08-26 working-tree edit only).
- `docs/saas/DECISIONS.md` — unchanged by *this* task (it shows `M` from the prior owner-decision-recording task, v1.2).
- The 18 `@Roles(Role.ADMIN)` decorator sites; `RolesGuard`; `jwt-auth.guard.ts`; `@Public()`; the JWT `role` claim *behaviour* (dual-read).
- All protected files (`.DS_Store`, `PHASE-6-IMPLEMENTATION-PLAN.md`, `SC-STOREFRONT-READINESS-AUDIT.md`, `backend/printforge-backend-source.zip`, `backend/prisma/seed-storefront-preview.ts`) — untracked, untouched.

---

## 4. Explicitly deferred (NOT in Phase 2a)

| Deferred | Phase | Decision |
|---|---|---|
| `role='ADMIN'` → `OWNER` membership backfill; `role='CUSTOMER'` → `Customer` backfill; reconciliation; any production `User` write | **Phase 2b** | D2 + D8 + G-16 |
| `CustomerRefreshToken` table; `/storefront/auth/*`; customer login / refresh / token issuance / validation; customer JWT strategy/guard; `AuthenticatedCustomer`; distinct signing-secret provisioning; Domain→Store→Tenant runtime resolution | **Phase 9 / 12** | P2-D3, P2-D5, P2-D6, P2-D7, P2-D13, G-15 |
| `@Roles → @RequirePermission` swap; `PermissionsGuard`; permission catalogue authoring; `TenantContext`; active-tenant / `X-Active-Tenant`; scoped Prisma; object-level tenant auth | **Phase 3** | P2-D8, P2-D9, G-13, D6 (deferred) |
| `customerId` on `Cart` / `Order` / `Review` / `CouponUsage` / `IdempotencyKey` / `UploadedFile`; `OrderStatusHistory` actor cols; FK re-pointing; `tenantId`/`storeId` on ~20 existing tables; `Customer.tenantId` composite FK; drop `User.role`; deactivate now-shopper `User` rows | **Phase 4 / 15** | P2-D10, P2-D12, D5 correction (G-18) |
| Frontend `authStore` `platformRole` + `memberships` | fast-follow / Phase 3 | §C.1(11) — not in the task's numbered scope |

Verified absent (`grep` over `backend/src` + schema): `PermissionsGuard` (code), `@RequirePermission`, `src/auth/permissions/`, `storefront/auth`, `TenantContext`, `activeTenantId`, `X-Active-Tenant`, `CustomerRefreshToken`, `customer_refresh`, any real `customerId` column.

---

*End of `docs/saas/PHASE-2A-CHANGE-MAP.md`. Phase 2a implemented. Phase 2b NOT implemented.
Phase 3 NOT started.*
