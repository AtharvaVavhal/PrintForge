# PrintForge SaaS — Phase 1 Change Map

> Phase 0 inventory diff re-run at Phase 1 start (Master Plan risk R20). Distinguishes the
> Phase 0 baseline, the changes Phase 1 makes, and pre-existing working-tree changes that are
> **not** part of Phase 1.

| Field | Value |
|---|---|
| Date | 2026-09-06 |
| Repository | `AtharvaVavhal/PrintForge`, `main`, HEAD `b20c849` (unchanged since Phase 0) |
| Phase 1 START GATE | READY (`docs/saas/PHASE-1-START-GATE-RESULT.md`) |

---

## 1. Phase 0 baseline (verified unchanged at Phase 1 start)

| Metric | Phase 0 (`PHASE-0-REPOSITORY-INVENTORY.md`) | At Phase 1 start | Match |
|---|---|---|:-:|
| Prisma models | 25 | 25 | ✅ |
| Prisma enums | 12 | 12 | ✅ |
| Migrations | 9 | 9 | ✅ |
| `Role` enum | `{CUSTOMER, ADMIN}` | `{CUSTOMER, ADMIN}` | ✅ |
| Backend NestJS modules | 19 `*.module.ts` | 19 | ✅ |
| Git HEAD | `b20c849` | `b20c849` | ✅ |
| Backend unit spec files | 27 | 27 | ✅ |
| Backend e2e spec files | 15 | 15 | ✅ |

No repository drift since Phase 0. The pre-existing working-tree changes below were also
present at Phase 0 and were already excluded from that inventory.

---

## 2. Phase 1 additions (this task)

### 2.1 Schema — `backend/prisma/schema.prisma` (additive; 247 insertions, 4 deletions)

| Change | Nature |
|---|---|
| Header comment (lines 1–5 → 1–11) | ACR-001 action 1 — cite SaaS Architecture v1.0 + Master Plan as authoritative; note `BLUEPRINT-v1.2` superseded/historical. The **4 deletions** are the old header lines. |
| `User` model — 2 back-relation fields (`tenantMemberships`, `invitedTenantMemberships`) | Prisma-required virtual back-relations for `TenantMembership` FKs. **No column added to `users`** (verified: `migration.sql` has no `ALTER TABLE "users"`). |
| Appended "SaaS Foundation — Phase 1" block | 6 new enums + 6 new models (below). Nothing before it in the file is otherwise changed. |

**6 new enums:** `TenantRole`, `TenantStatus`, `StoreStatus`, `MembershipStatus`,
`DomainVerificationStatus`, `SubscriptionStatus` — value sets ratified by decision **G-5**
(`TenantRole` and `SubscriptionStatus` verbatim from the frozen architecture).

**6 new models:** `Tenant`, `Store`, `StoreDomain`, `TenantMembership`, `Plan`, `Subscription`
— per `PHASE-0-DECISION-RESOLUTION-AND-PHASE-1-SPEC.md §B.2–B.8`.

Model count 25 → **31**. Enum count 12 → **18**.

### 2.2 Migration — `backend/prisma/migrations/20260905191258_add_saas_foundation/` (NEW)

171 lines, additive-only: 6 × `CREATE TYPE`, 6 × `CREATE TABLE`, **15** × `CREATE [UNIQUE]
INDEX` (13 Prisma-generated + 2 hand-added partial unique indexes —
`stores_tenant_primary_unique`, `store_domains_store_primary_unique`), 8 × `ALTER TABLE
<new-table> ADD CONSTRAINT ... FOREIGN KEY` (standard Prisma FK creation, all on tables created
in the same migration). **No** `DROP`, `DELETE`, `TRUNCATE`, `UPDATE`, `SET NOT NULL`, or
`ALTER TABLE` on any pre-existing table. Migration count 9 → **10**.
*(Index count corrected 2026-09-06 per audit finding P2-1 — was stated as 17.)*

### 2.3 G-10 migration-safety CI check — `backend/src/migration-safety.spec.ts` (NEW)

Jest spec (runs in the existing `npm run test` job, like `scheduler-registration.spec.ts`).
Contains the `findAdditiveOnlyViolations()` detector + 8 unit tests of the detector +
a live check that every non-legacy migration on disk is additive-only. 11 tests.

### 2.4 Tenancy foundation e2e — `backend/test/e2e/tenancy-foundation.e2e-spec.ts` (NEW)

14 tests against a real Postgres proving the DB enforces AC-2, AC-3, AC-4, AC-8, AC-9, AC-11
and AC-14 (FK RESTRICT, partial unique primary-store / primary-domain, `(userId, tenantId)`
unique, global `hostname` unique, `Subscription` 1:1, 7 subscription states, full-tenant
bootstrap linkage).

### 2.5 Test support — `backend/test/e2e/support/db.ts` (additive; 8 lines)

Added the 6 new table names to `ALL_TABLES` (the e2e truncate list). The file's own comment
requires this list stays complete. No behavior change (`TRUNCATE ... CASCADE` already covered
them; nothing writes to them in existing tests).

### 2.6 Dev/test seed — `backend/prisma/seed-tenant-bootstrap.ts` (NEW) + `package.json` (1 line)

Standalone, idempotent, dev/test-only (refuses `NODE_ENV=production`). Bootstraps a `Free`
Plan + Tenant #1 + primary Store + OWNER `TenantMembership` + Free/ACTIVE `Subscription`
(spec AC-14). `package.json` gains one script: `prisma:seed:tenant-bootstrap`.

### 2.7 Docs — `docs/saas/` + `docs/architecture/ARCHITECTURE-FREEZE.md`

- `docs/architecture/ARCHITECTURE-FREEZE.md` — ACR-001 action 2: top notice that
  `BLUEPRINT-v1.2` is superseded by SaaS Architecture v1.0 and retained as history (13-line
  diff — additive notice + 4 header-label tweaks; **no section rewritten, no history deleted**).
- `docs/saas/PHASE-1-CHANGE-MAP.md` (this file) — NEW (in `c3fc160`).
- `docs/saas/PHASE-1-IMPLEMENTATION-REPORT.md` — NEW (in `c3fc160`).
- **Governance chain committed by the audit-fix commit (audit finding P1-1)** — these existed
  from Phase 0 / 0.5 and are referenced by the committed `schema.prisma` header,
  `ARCHITECTURE-FREEZE.md`, and this change map, but were untracked in `c3fc160`:
  `docs/saas/ACR-001-SUPERSEDE-BLUEPRINT-V1.2.md` (authorizes the schema additions per
  `BLUEPRINT-v1.2 §38`), `PHASE-0-DECISION-RESOLUTION-AND-PHASE-1-SPEC.md` (the G-4-approved
  Phase 1 contract), `DECISIONS.md` (records D1/D3/D5/G-4/G-5/G-9/G-10 approvals and the
  D2/D4 `OPEN` status), `PHASE-1-START-GATE-RESULT.md` (START GATE = READY),
  `PHASE-0-REPOSITORY-INVENTORY.md`, `PHASE-0.5-DECISION-CLOSURE.md`,
  `PHASE-0.5-DECISION-STATUS.md`, `PRINTFORGE-SAAS-IMPLEMENTATION-MASTER-PLAN-v1.0.md`.

### 2.8 NOT done in Phase 1 (deferred, in-scope minimization)

- **`TenancyModule` / `PlansModule` NestJS modules** (spec §B.8 item 4–5 — *"IS ALLOWED to"*,
  not required by any acceptance criterion). Not created: they would touch `app.module.ts`
  and the DI graph for zero enforced behavior, and AC-14 (seed) + AC-17 (no routes/guards)
  are both satisfied without them. To be added when Phase 2 first needs a service. Recorded
  as a Phase 1 limitation.
- `docs/architecture/BLUEPRINT-v1.2.md` itself — **NOT modified** (ACR-001 explicitly retains
  it unchanged as history).

---

## 3. Pre-existing working-tree changes — NOT part of Phase 1

Present since before this conversation (storefront redesign; see `git log` around the
`Phase 13.6/13.7` / `UX-49` commits). **Excluded from Phase 1 scope. Not touched by this task**
except `backend/package.json` (see note).

| Path | Status | Relation to Phase 1 |
|---|---|---|
| `frontend/index.html`, `frontend/src/components/home/*`, `frontend/src/components/layout/AnnouncementBar.module.css`, `frontend/src/index-csp.test.ts`, `frontend/src/pages/home/HomePage.*`, `frontend/src/styles/{global,tokens}.css` | `M` / `D` | Pre-existing storefront redesign. Untouched by Phase 1. |
| `frontend/src/components/home/{CategoryProductRails,Faq}.*` | `??` | Pre-existing untracked storefront files. Untouched. |
| `docs/architecture/BLUEPRINT-v1.2.md` | `M` (`1 +-`, mtime `2026-09-05 14:02`) | Pre-existing one-line roadmap edit. **Not touched by Phase 1** (predates it; ACR-001 keeps BLUEPRINT unchanged). |
| `backend/prisma/seed-storefront-preview.ts` | `??` | Pre-existing untracked (Phase 13.8 storefront preview seed). Untouched. |
| `backend/printforge-backend-source.zip` | `??` | **Protected file.** Untouched. |
| `.DS_Store`, `PHASE-6-IMPLEMENTATION-PLAN.md`, `SC-STOREFRONT-READINESS-AUDIT.md` | `??` | **Protected files.** Untouched. |
| `backend/package.json` | `M` | Phase 1 adds exactly one script: `"prisma:seed:tenant-bootstrap"`. Commit `c3fc160` inadvertently also carried the pre-existing `prisma:seed:storefront-preview[:remove]` scripts (target file not in the repo); the audit-fix commit **removes those two** (audit finding P1-2). Final scripts: `prisma:seed` + `prisma:seed:tenant-bootstrap`. |

---

*End of `docs/saas/PHASE-1-CHANGE-MAP.md`.*
