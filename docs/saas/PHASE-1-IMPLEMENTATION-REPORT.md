# PrintForge SaaS — Phase 1 Implementation Report

| Field | Value |
|---|---|
| Document | `docs/saas/PHASE-1-IMPLEMENTATION-REPORT.md` |
| Version | 1.0 |
| Date | 2026-09-06 |
| Repository | `AtharvaVavhal/PrintForge`, `main`, HEAD `b20c849` |
| Phase | 1 — Foundational Tenant / Store / StoreDomain / TenantMembership (+ Plan / Subscription shells) |
| START GATE | READY (`docs/saas/PHASE-1-START-GATE-RESULT.md`, 2026-09-06) |
| **Final verdict** | **PASS WITH NON-BLOCKING FINDINGS** |

---

## 1. Phase 1 objective

Introduce the core isolation entities — `Tenant`, `Store`, `StoreDomain`, `TenantMembership` —
plus the platform-owned `Plan` and `Subscription` shells they reference, as **additive,
non-enforcing** schema. Establish the ownership roots that Phases 2–4 attach everything to.
No existing model, column, query, guard, or behaviour is changed. Per
`PHASE-0-DECISION-RESOLUTION-AND-PHASE-1-SPEC.md §B.2–B.8` (approved as the contract, G-4).

## 2. Approved decisions used

| ID | Decision | How it shaped the implementation |
|---|---|---|
| **D1** | ACR-001 APPROVED | Permits the schema additions. Follow-through done: `schema.prisma` header + `ARCHITECTURE-FREEZE.md` updated to cite SaaS Architecture v1.0 + the Master Plan; `BLUEPRINT-v1.2.md` left unchanged as history. |
| **D3-A** | Existing deployment → Tenant #1 | The bootstrap seed frames "Tenant #1" as the existing merchant (dev/test only). `Tenant` has `slug` but **no `name`** — per D3 the display name is a Phase 4 input (`Store.name` carries the display need in Phase 1). |
| **D5-A** | Separate store-scoped `Customer` entity | `User` documented as platform/merchant identity; `TenantMembership` documented as merchant-only; schema comments name the future `Customer` root. **No `Customer` table created** (Phase 2). |
| **G-4** | Phase 1 spec approved | Implemented exactly to §B.2–B.8; migration boundary §B.8 respected. |
| **G-5** | Enum sets ratified | The 6 enums use the ratified value sets verbatim; `TenantRole` / `SubscriptionStatus` unchanged from the frozen architecture. |
| **G-9** | Pre-migration snapshot requirement | Documented as an execution-time condition (§17). Not exercised here — no shared-environment deploy in this task. |
| **G-10** | Additive-only CI check in Phase 1 scope | Implemented as `backend/src/migration-safety.spec.ts` (§9). |

## 3. Baseline schema state (verified at Phase 1 start)

25 models, 12 enums, 9 migrations, `Role {CUSTOMER, ADMIN}`, HEAD `b20c849` — identical to the
Phase 0 inventory. No repository drift. (`docs/saas/PHASE-1-CHANGE-MAP.md §1`.)

## 4. Models added (6)

| Model (`@@map`) | Purpose | Key fields | FKs (onDelete) |
|---|---|---|---|
| `Tenant` (`tenants`) | Top-level isolation + billing boundary | `id`, `slug @unique`, `status TenantStatus @default(ACTIVE)`, `createdAt/updatedAt/deletedAt?` | — |
| `Store` (`stores`) | One storefront belonging to a Tenant | `id`, `tenantId`, `slug`, `name`, `status StoreStatus @default(DRAFT)`, `isPrimary @default(false)`, `createdAt/updatedAt` | `tenantId → tenants` (RESTRICT) |
| `StoreDomain` (`store_domains`) | Hostname bound to a Store | `id`, `storeId`, `tenantId` (denorm), `hostname @unique`, `isPrimary @default(false)`, `verificationStatus DomainVerificationStatus @default(PENDING)`, `verificationToken?`, `verifiedAt?`, `createdAt` | `storeId → stores` (RESTRICT), `tenantId → tenants` (RESTRICT) |
| `TenantMembership` (`tenant_memberships`) | Global `User` ↔ `Tenant`, carrying tenant role | `id`, `userId`, `tenantId`, `role TenantRole`, `status MembershipStatus @default(INVITED)`, `invitedByUserId?`, `createdAt/updatedAt` | `userId → users` (RESTRICT), `tenantId → tenants` (RESTRICT), `invitedByUserId → users` (SET NULL) |
| `Plan` (`plans`) | Platform plan catalogue (shell) | `id`, `key @unique` (free/starter/growth/business/enterprise), `name`, `isPublic @default(true)`, `createdAt` | — |
| `Subscription` (`subscriptions`) | One primary subscription per Tenant (shell) | `id`, `tenantId @unique`, `planId`, `status SubscriptionStatus @default(PENDING)`, `currentPeriodStart?`, `currentPeriodEnd?`, `createdAt` | `tenantId → tenants` (RESTRICT), `planId → plans` (RESTRICT) |

`User` gains 2 Prisma **virtual** back-relation fields (`tenantMemberships`,
`invitedTenantMemberships`) — no column on `users` (verified: migration has no
`ALTER TABLE "users"`).

Model count: **25 → 31**.

## 5. Enums added (6) — value sets ratified by G-5

| Enum | Values | Source |
|---|---|---|
| `TenantRole` | `OWNER, ADMIN, STAFF, VIEWER` | Frozen SaaS §5 — **verbatim** |
| `SubscriptionStatus` | `PENDING, TRIALING, ACTIVE, PAST_DUE, PAUSED, CANCELLED, EXPIRED` | Frozen SaaS §7 — **verbatim, 7 states, no additions** |
| `TenantStatus` | `ACTIVE, SUSPENDED, PENDING_DELETION, DELETED` | G-5 ratified |
| `StoreStatus` | `ACTIVE, DISABLED, DRAFT` | G-5 ratified |
| `MembershipStatus` | `ACTIVE, INVITED, SUSPENDED` | G-5 ratified |
| `DomainVerificationStatus` | `PENDING, VERIFIED, FAILED` | G-5 ratified |

Enum count: **12 → 18**. `Role {CUSTOMER, ADMIN}` — **unchanged**. No `PlanKey` enum (`Plan.key`
is a `String`, not among the six ratified enums).

## 6. Relation / index / constraint summary

**Uniques:** `tenants.slug`; `stores (tenantId, slug)`; `store_domains.hostname` (global);
`tenant_memberships (userId, tenantId)`; `subscriptions.tenantId`; `plans.key`.

**Partial unique indexes (hand-added to `migration.sql`, like `payment_attempts_order_captured_unique`):**
`stores_tenant_primary_unique ON stores(tenantId) WHERE isPrimary=true`;
`store_domains_store_primary_unique ON store_domains(storeId) WHERE isPrimary=true`.

**Secondary indexes:** `tenants(status)`; `stores(tenantId)`; `store_domains(storeId)`,
`store_domains(tenantId)`; `tenant_memberships(tenantId)`, `tenant_memberships(userId)`;
`subscriptions(planId)`.

**FKs:** 8 (all listed in §4). Every FK on a new model points into exactly one tenant subtree
(`Store→Tenant`, `StoreDomain→{Store,Tenant}`, `TenantMembership→{User,Tenant}`,
`Subscription→{Tenant,Plan}`). No FK can link two tenants (AC-11). `hostname` global-unique →
a host resolves to exactly one store → one tenant.

## 7. Migration name

`20260905191258_add_saas_foundation` (`backend/prisma/migrations/20260905191258_add_saas_foundation/migration.sql`,
171 lines). Migration count **9 → 10**. Directory name sorts after the last legacy migration
(`20260902031308_…`), so ordering is correct. *(Timestamp reads `20260905…` — the local
Prisma clock; functionally irrelevant, ordering is lexical and correct.)*

## 8. Migration safety analysis (manual inspection — STEP 4)

The generated SQL was inspected before applying. Contents:

- **6 × `CREATE TYPE`** — additive.
- **6 × `CREATE TABLE`** (`tenants`, `stores`, `store_domains`, `tenant_memberships`, `plans`,
  `subscriptions`) — all new.
- **15 × `CREATE [UNIQUE] INDEX`** — all on new tables: 13 Prisma-generated + 2 hand-added
  partial unique indexes (`stores_tenant_primary_unique`, `store_domains_store_primary_unique`).
  *(Corrected 2026-09-06 per audit finding P2-1 — was stated as 17.)*
- **8 × `ALTER TABLE <t> ADD CONSTRAINT … FOREIGN KEY`** where `<t>` ∈ {`stores`,
  `store_domains`, `tenant_memberships`, `subscriptions`} — **every target table is created
  earlier in the same migration**. This is how Prisma always emits FK creation (every existing
  repo migration does the same, e.g. `20260827193208_add_reviews` → `ALTER TABLE "reviews" ADD
  CONSTRAINT … REFERENCES "users"`).
- **`ON DELETE RESTRICT` / `ON DELETE SET NULL`** appear only as FK actions inside those
  `ADD CONSTRAINT` clauses — not standalone destructive statements.

**Absent (confirmed):** no `ALTER TABLE` on any pre-existing table; no `DROP` (table / column /
index / constraint / type); no `DELETE` / `TRUNCATE` / `UPDATE`; no `SET NOT NULL` /
`ADD COLUMN … NOT NULL` on an existing table. **No production data statement of any kind.**

Applied cleanly and idempotently to three scratch/local databases:
`prisma migrate deploy` → "All migrations have been successfully applied"; `prisma migrate
status` → "Database schema is up to date!" (no drift). Reversible while unreferenced by a
compensating `DROP TABLE` (AC-16). No forced migration; no `STOP` condition hit.

## 9. G-10 CI implementation

`backend/src/migration-safety.spec.ts` — a jest spec (runs in the existing `npm run test`
job, exactly like `scheduler-registration.spec.ts`; no new CI workflow). Self-contained,
per repo convention.

- **Detector** `findAdditiveOnlyViolations(sql, existingTables)` — strips SQL comments, splits
  statements, flags: any `DROP …`, `TRUNCATE`, `DELETE FROM`, `UPDATE "<table>"`,
  `ALTER TABLE "<t>"` where `<t>` is **not** created in the same file, `SET NOT NULL`, and any
  non-`CREATE` statement.
- **`LEGACY_MIGRATIONS`** — the 9 pre-guard migrations are exempt (e.g. the `20260902` tax
  backfill's `UPDATE "orders"`). Adding to this list in a later phase requires a recorded
  decision — that friction is the P1-R6 mitigation.
- **Tests (11):** 8 unit tests of the detector (accepts `CREATE …` and same-file FK `ALTER`;
  rejects `DROP TABLE`, `DROP COLUMN`, `ALTER` on an existing table, `DELETE`/`TRUNCATE`/
  `UPDATE`, `SET NOT NULL`; not fooled by keywords in comments) + a live check that every
  non-legacy migration on disk (currently: the Phase 1 migration) is additive-only + a check
  that the legacy exemption names all exist.

Result: **11/11 pass.** The Phase 1 migration passes the live additive-only check.

## 10. Free Plan seed decision

**AC-14 requires a dev/test seed.** Implemented as `backend/prisma/seed-tenant-bootstrap.ts`
(standalone, not the `prisma db seed` default) + `package.json` script
`prisma:seed:tenant-bootstrap`.

- Idempotent (upsert by `plans.key` / `tenants.slug` / `(tenantId, slug)` /
  `(userId, tenantId)` / `subscriptions.tenantId`) — verified by running twice (row counts
  stayed at 1 each).
- Creates exactly: **`Free` Plan** (the minimum for `Subscription` creation — **no** plan
  catalogue, **no** `PlanFeature`/`PlanLimit`/`Usage`, **no** billing), **Tenant #1**
  (slug, `ACTIVE`), its **primary `Store`** (`ACTIVE`, `isPrimary`), an **`OWNER`
  `TenantMembership`** (`ACTIVE`), a **Free / `ACTIVE` `Subscription`**.
- Owner resolution: `SEED_OWNER_EMAIL` → else first `role=ADMIN` user → else a created dev
  user (`owner@tenant-1.local`, non-usable password hash — membership holder only; real
  merchant auth is Phase 2).
- **Refuses to run when `NODE_ENV=production`.** No production seed executed by this task.

## 11. Tests executed

*(Numbers below are the **post-audit-fix** state — after the `fix(saas): resolve phase 1
audit findings` commit that added the P2-3 e2e/seed coverage and reworked the G-10 detector
per P2-4.)*

| Suite | Command | Environment |
|---|---|---|
| Backend unit (incl. `migration-safety.spec.ts`, `scheduler-registration.spec.ts`) | `npm run test` | jest, no DB |
| Backend e2e (incl. `tenancy-foundation.e2e-spec.ts`, `tenant-bootstrap-seed.e2e-spec.ts`) | `npm run test:e2e` | real Postgres `printforge_test` (migration applied) |
| Backend lint | `npm run lint` | eslint `--fix` |
| Backend build | `npm run build` | `nest build` |
| Frontend unit/component | `npm run test` (frontend) | vitest + jsdom |
| Prisma | `prisma validate`, `prisma migrate deploy` (scratch/local DBs), `prisma migrate status` | — |
| Seed smoke | `tenant-bootstrap-seed.e2e-spec.ts` — real `ts-node prisma/seed-tenant-bootstrap.ts` subprocess ×3 (rows, idempotency, prod-guard) | `printforge_test` |

## 12. Test results

| Suite | Result | Delta vs `b20c849` baseline |
|---|---|---|
| Backend unit | **28 suites / 257 tests — PASS** | +1 suite, +13 tests (`migration-safety.spec.ts`). `scheduler-registration.spec.ts` still green (exactly one `ScheduleModule.forRoot()`). |
| Backend e2e | **17 suites / 140 tests — PASS** | +2 suites: `tenancy-foundation.e2e-spec.ts` (22 tests) + `tenant-bootstrap-seed.e2e-spec.ts` (3 tests). All green across repeated runs. |
| Backend lint | **PASS** (exit 0; 1 pre-existing `warning` in `test/e2e/support/fixtures.ts`, not this work's) | — |
| Backend build | **PASS** (exit 0) | — |
| Frontend | **100 files / 759 tests — PASS** | unchanged (frontend not touched) |
| `prisma validate` | **valid** | — |
| `prisma migrate status` | **up to date, no drift** (10 migrations) | — |

**NB-1 (§18):** during the original Phase 1 implementation, one pre-existing timing-sensitive
e2e spec (webhook-retry / reconciliation family) flaked once, then passed on every subsequent
run (6/7 green then, and every run since). Not caused by Phase 1 — all Phase 1 changes are
additive; the tenancy specs pass every run. Recommend the team stabilise that spec separately.

## 13. ACR-001 follow-through

Per `docs/saas/ACR-001-SUPERSEDE-BLUEPRINT-V1.2.md` "Post-approval actions":

| Action | Done | Detail |
|---|:-:|---|
| 1. `schema.prisma` header — cite SaaS Architecture v1.0 + Master Plan; drop the `BLUEPRINT-v1.2 §15/§12/§14` authority line | ✅ | Lines 1–11 (4 old header lines removed, 11 new). Inline `§NN` comments retained as historical provenance (noted in the header). |
| 2. `docs/architecture/ARCHITECTURE-FREEZE.md` — record `BLUEPRINT-v1.2` superseded + retained as history | ✅ | Top "SUPERSEDED — 6 September 2026" notice + label tweaks (freeze status, "Historical document"). **No section rewritten; no history deleted.** |
| 3. Link ACR-001 from both | ✅ | Both cite `docs/saas/ACR-001-SUPERSEDE-BLUEPRINT-V1.2.md` — **committed to the repo by the audit-fix commit** (audit finding P1-1; it was untracked in `c3fc160`). |
| — `docs/architecture/BLUEPRINT-v1.2.md` itself | **not modified** | ACR-001 explicitly retains it unchanged as history. Its pre-existing ` M` state predates this work (mtime `2026-09-05 14:02`). |

## 14. Files changed

**Commit `c3fc160` — `feat(saas): implement phase 1 tenancy foundation`:**
| File | Change |
|---|---|
| `backend/prisma/schema.prisma` | +247 / −4 — header (ACR-001), `User` 2 virtual back-relations, appended SaaS Foundation block (6 enums + 6 models). No existing model line changed. |
| `backend/prisma/migrations/20260905191258_add_saas_foundation/migration.sql` | NEW — the additive migration (171 lines). |
| `backend/src/migration-safety.spec.ts` | NEW — G-10 additive-only CI check + tests. |
| `backend/test/e2e/tenancy-foundation.e2e-spec.ts` | NEW — tenancy DB-constraint e2e. |
| `backend/test/e2e/support/db.ts` | +8 — 6 new table names in `ALL_TABLES` + comment. Additive. |
| `backend/prisma/seed-tenant-bootstrap.ts` | NEW — dev/test tenant bootstrap seed (AC-14). |
| `backend/package.json` | +3 script lines (of which 2 were unrelated — see below). |
| `docs/architecture/ARCHITECTURE-FREEZE.md` | +13 / −4 — ACR-001 supersession notice + header labels. |
| `docs/saas/PHASE-1-CHANGE-MAP.md`, `docs/saas/PHASE-1-IMPLEMENTATION-REPORT.md` | NEW. |

**Commit `fix(saas): resolve phase 1 audit findings` (this follow-up):**
| File | Change |
|---|---|
| `backend/package.json` | **−2** — removed the unrelated `prisma:seed:storefront-preview` + `:remove` scripts (P1-2). Final scripts: `prisma:seed` + `prisma:seed:tenant-bootstrap`. |
| `backend/src/migration-safety.spec.ts` | Removed the unused `existingTables` parameter; documented the self-contained validation model; +2 detector tests (P2-4). 11 → 13 tests. Detector not weakened. |
| `backend/test/e2e/tenancy-foundation.e2e-spec.ts` | +8 tests — `StoreDomain.tenantId`/`storeId` FK, `Subscription.planId` FK + `Plan` RESTRICT, `TenantMembership.tenantId` FK, and column-default assertions for `Store.status`/`isPrimary`, `TenantMembership.status`, `Subscription.status`, `Tenant.status`, `StoreDomain.isPrimary`/`verificationStatus`, `Plan.isPublic` (P2-3). 14 → 22 tests. |
| `backend/test/e2e/tenant-bootstrap-seed.e2e-spec.ts` | NEW — CI seed-smoke: runs `seed-tenant-bootstrap.ts` as a subprocess against `printforge_test`, verifies the 5 linked rows, idempotency, and the `NODE_ENV=production` guard (P2-3). |
| `docs/saas/ACR-001-SUPERSEDE-BLUEPRINT-V1.2.md`, `PHASE-0-DECISION-RESOLUTION-AND-PHASE-1-SPEC.md`, `DECISIONS.md`, `PHASE-1-START-GATE-RESULT.md`, `PHASE-0-REPOSITORY-INVENTORY.md`, `PHASE-0.5-DECISION-CLOSURE.md`, `PHASE-0.5-DECISION-STATUS.md`, `PRINTFORGE-SAAS-IMPLEMENTATION-MASTER-PLAN-v1.0.md` | NEW (committed) — the governance chain (P1-1). |
| `docs/saas/PHASE-1-IMPLEMENTATION-REPORT.md`, `docs/saas/PHASE-1-CHANGE-MAP.md` | Corrected index count 17 → 15 (P2-1); replaced the stale "nothing committed" claim (P2-2); noted the P1/P2 resolutions. |

*(`node_modules/@prisma/client` regenerated by `prisma generate` — not tracked.)*

*(`node_modules/@prisma/client` was regenerated by `prisma generate` — not tracked.)*

## 15. Pre-existing files deliberately untouched

`docs/architecture/BLUEPRINT-v1.2.md` (`M`, pre-existing, retained as history per ACR-001);
all `frontend/**` (`M`/`D`/`??`, pre-existing storefront redesign);
`backend/prisma/seed-storefront-preview.ts` (`??`, pre-existing);
`backend/prisma/seed.ts`, `backend/prisma/seed-production.ts` (unchanged);
all existing `backend/src/**` runtime code, guards, decorators, services, controllers
(unchanged — `git diff` on `src/` is empty except the new spec file).

## 16. Protected-file verification

| Protected file | State | Verified |
|---|---|---|
| `.DS_Store` | `??` untracked, unmodified | ✅ |
| `PHASE-6-IMPLEMENTATION-PLAN.md` | `??` untracked, unmodified | ✅ |
| `backend/printforge-backend-source.zip` | `??` untracked, unmodified | ✅ |
| `SC-STOREFRONT-READINESS-AUDIT.md` | `??` untracked, unmodified | ✅ |

**Commit history (updated 2026-09-06 per audit finding P2-2):** the Phase 1 implementation
was committed as **`c3fc160` — `feat(saas): implement phase 1 tenancy foundation`** (author:
project owner). An independent audit (Codex) then found the commit incomplete (governance
docs missing) and contaminated (two unrelated storefront `package.json` scripts). A single
follow-up commit — **`fix(saas): resolve phase 1 audit findings`** — adds the governance
chain, removes the stray scripts, and applies the selected P2 corrections. Neither commit was
pushed to any remote by this work. `git add .` / `git add -A` were never used; only the
specific Phase-1 and audit-fix paths were staged. The pre-existing storefront-redesign
working-tree changes (`frontend/**`, `backend/prisma/seed-storefront-preview.ts`) remain
**uncommitted and outside Phase 1 scope**.

## 17. Phase 1 boundary verification (STEP 8 checklist)

| Check | Result |
|---|:-:|
| Only Phase 1 models/enums added (6 + 6) | ✅ 25→31 models, 12→18 enums |
| No `Customer` model | ✅ `grep -i customer schema.prisma` → only doc-comment mentions of the *future* entity |
| No `tenantId`/`storeId`/`customerId` on any existing table | ✅ migration has no `ALTER TABLE "<existing>"`; `\d users` shows no new column |
| No auth changes | ✅ `git diff backend/src` = only the new spec file; `auth.*`, `jwt.strategy.ts`, `AuthenticatedUser` untouched |
| No authorization changes | ✅ `RolesGuard`, `@Roles()`, `JwtAuthGuard`, `Role` enum untouched |
| No tenant-context middleware / interceptor / scoped Prisma | ✅ none added |
| No production backfill | ✅ migration is `CREATE`-only; seed is dev/test-only and refuses `NODE_ENV=production` |
| No destructive migration | ✅ §8; G-10 check passes |
| G-10 CI guard exists and passes | ✅ `migration-safety.spec.ts`, 11/11 |
| ACR-001 follow-through completed | ✅ §13 |
| D3 Tenant #1 decision preserved | ✅ seed + `Tenant` doc-comment reflect D3-A; no implicit privileges |
| D2 remains unresolved | ✅ not touched; no production data accessed; `backend/.env` not opened |
| D4 remains unresolved | ✅ no isolation enforcement / scoped client added |
| No protected files modified | ✅ §16 |
| `SUPER_ADMIN` / `User.platformRole` not added | ✅ `grep -i 'super_admin\|platformRole' schema.prisma` → no match |
| `TenancyModule` / `PlansModule` expose no route/guard | ✅ (not created — AC-17 trivially satisfied; see §19) |
| Existing test suites green | ✅ §12 |

## 18. Known limitations

- **NB-1 — pre-existing e2e flake.** One timing-sensitive existing e2e test failed once in 7
  runs (passed the other 6). Not introduced by Phase 1 (additive changes only). Recommend the
  team stabilise that spec separately.
- **NB-2 — `Tenant` has no `name` column.** The Phase 1 spec (§B.7) enumerates `Tenant` fields
  as `id, slug, status, createdAt, updatedAt, deletedAt?` — no `name`. D3's tenant *display
  name* is a Phase 4 input; in Phase 1 the primary `Store.name` carries the display need. If a
  tenant-level display name is wanted, it is a trivial additive Phase 4/5 column.
- **NB-3 — `TenancyModule` / `PlansModule` not created.** Spec §B.8 items 4–5 list them as
  *"IS ALLOWED to"*, and no acceptance criterion requires them. Deferred (see §19) to keep the
  Phase 1 footprint minimal and avoid touching `app.module.ts` / the DI graph for zero
  enforced behaviour.
- **NB-4 — enum column defaults.** `Store.status @default(DRAFT)`, `TenantMembership.status
  @default(INVITED)`, `Subscription.status @default(PENDING)` follow the repo convention
  (enums default to their initial state, like `OrderStatus.PENDING_PAYMENT`). The bootstrap
  seed sets `ACTIVE` explicitly for Tenant #1. If the team prefers `ACTIVE` column defaults,
  that is a one-line additive change.
- **NB-5 — partial unique indexes are hand-edited SQL.** Same technique and caveat as the
  existing `payment_attempts_order_captured_unique` (documented in the `Store` / `StoreDomain`
  schema comments): a future `prisma migrate dev` will not touch them unless a schema change
  to those models reintroduces them.
- **NB-6 — G-9 not exercised.** The pre-migration snapshot requirement is approved and
  documented as an execution-time condition; this task performed no shared-environment deploy.
- **NB-7 — `StoreDomain.tenantId` denorm not composite-FK-tied to `storeId`.** Both are plain
  FKs into one tenant subtree (sufficient for Phase 1 — no FK can link two tenants). Both are
  now e2e-tested to reject an invalid target (audit fix P2-3). A composite `(storeId,
  tenantId)` same-store FK guaranteeing the denorm *matches* is Phase 4/9 defence-in-depth
  (Master Plan wave W6).

### Independent audit (Codex) — findings & resolutions

An independent audit of `c3fc160` returned **NOT READY** on two P1 completeness defects
(not correctness defects). Both are resolved by the `fix(saas): resolve phase 1 audit
findings` commit:

| Finding | Resolution |
|---|---|
| **P1-1** governance chain absent from the commit | Committed `ACR-001-SUPERSEDE-BLUEPRINT-V1.2.md`, `PHASE-0-DECISION-RESOLUTION-AND-PHASE-1-SPEC.md`, `DECISIONS.md`, `PHASE-1-START-GATE-RESULT.md` + the supporting Phase 0/0.5 docs + the Master Plan. All cross-references in `schema.prisma` / `ARCHITECTURE-FREEZE.md` / this report now resolve. |
| **P1-2** two unrelated `storefront-preview` scripts + broken file ref in `package.json` | Removed both lines. `seed-storefront-preview.ts` stays **uncommitted** (storefront work, outside Phase 1). |
| **P2-1** report/change-map index count 17 | Corrected to 15 (13 Prisma + 2 hand-added partial). |
| **P2-2** stale "nothing committed" claim | Replaced with an accurate commit-history statement (§16). |
| **P2-3** missing FK / default / seed coverage | +8 e2e tests (`StoreDomain`/`Subscription`/`TenantMembership` FKs, 7 column-default assertions) + new `tenant-bootstrap-seed.e2e-spec.ts` CI seed-smoke (rows + idempotency + prod-guard). |
| **P2-4** dead `existingTables` param in the G-10 detector | Removed the param; documented the self-contained validation model; +2 detector tests. Detector behaviour unchanged / not weakened. |

## 19. Phase 2 intentionally deferred items

- `Customer` entity (`(storeId, email)`), `CustomerRefreshToken`, store-scoped customer auth,
  token audiences (D5-A — Phase 2).
- `SUPER_ADMIN` / `User.platformRole`; `PermissionsGuard`; retiring `Role {CUSTOMER, ADMIN}`
  and the `Role.ADMIN` vs `TenantRole.ADMIN` name collision (Phase 2).
- `TenancyModule` (`TenantService` / `StoreService` / `StoreDomainService` /
  `MembershipService`) + `PlansModule` shell + `app.module.ts` registration — deferred to when
  Phase 2 first needs a service (NB-3).
- `TenantContext` derivation + app-layer scoped Prisma + RLS (Phase 3, D4/D6 — both OPEN).
- `tenantId`/`storeId`/`customerId` on existing tables + backfill of Tenant #1 (Phase 4, gated
  on D2).
- `PlanFeature`/`PlanLimit`/`Usage`/entitlements (Phase 6); `Subscription` billing-provider
  coupling / `SubscriptionEvent` / `SaasInvoice` (Phase 7); `StoreDomain` verification
  mechanism + host→store→tenant resolution (Phase 9).

## 20. Final Phase 1 verdict

# PASS WITH NON-BLOCKING FINDINGS

Every mandatory acceptance criterion (AC-1 … AC-17,
`PHASE-0-DECISION-RESOLUTION-AND-PHASE-1-SPEC.md §B.11`) is met:

- AC-1 ✅ 31 models, `prisma validate` passes · AC-2/AC-3 ✅ FK RESTRICT + primary-store partial
  unique (e2e) · AC-4 ✅ `(userId, tenantId)` unique (e2e) · AC-5 ✅ role on `TenantMembership`,
  no role column on `User` · AC-6 ✅ no `SUPER_ADMIN`/`platformRole`, `Role` unchanged ·
  AC-7 ✅ one primary store per tenant · AC-8 ✅ global `hostname` unique (e2e) · AC-9 ✅
  `Subscription` 1:1 + 7 states (e2e) · AC-10 ✅ migration additive-only, G-10 check green ·
  AC-11 ✅ no cross-tenant FK possible · AC-12 ✅ no data statement, existing row counts
  untouched · AC-13 ✅ `git diff backend/src` = only the new spec; guards/JWT untouched ·
  AC-14 ✅ seed bootstraps a full linked tenant (e2e + CI seed-smoke) · AC-15 ✅ unit 257/257,
  e2e 140/140, frontend 759/759, scheduler-registration green · AC-16 ✅ applies cleanly,
  no drift, `DROP TABLE`-reversible · AC-17 ✅ no `src/tenancy` / `src/plans` dirs → no route/guard.

The findings in §18 are documentation-level / pre-existing / deliberate-minimization — none
affect correctness or the migration boundary. The verdict is **PASS WITH NON-BLOCKING
FINDINGS** rather than plain PASS solely to surface NB-1 (pre-existing e2e flake) and NB-3
(`TenancyModule` deferral) for the team's awareness.

**Phase 1 implementation is complete within its boundary. Phase 2 has not started.**

---

*End of `docs/saas/PHASE-1-IMPLEMENTATION-REPORT.md`.*
