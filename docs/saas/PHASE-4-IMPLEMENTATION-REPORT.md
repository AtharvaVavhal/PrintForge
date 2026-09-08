# Phase 4, Wave W3 — Tenant/Store/Customer Scoping Columns: Implementation Report

**Status: IMPLEMENTED, NOT COMMITTED, NOT PUSHED.** All schema changes, the
new migration, and tests exist in the working tree. Nothing has been staged,
committed, or pushed. **No production system was accessed or modified.** The
new migration was applied to the two local databases only
(`printforge_dev`, `printforge_test`) — see §3 for why, and §7 for an
incident during that step that was found and reverted before it could reach
this report. **Only W3 is implemented. W4, W5, W6, W7 were not started.**
**Phase 5 was not started.**

**Post-implementation update (§11):** an independent audit of this W3 work
found one P1 conformance finding — `CouponUsage` was missing the `storeId`
column the approved spec requires — and one related P2 finding about the
original test suite's coverage methodology. Both are now fixed; see §11 for
the full account. This document's other sections were written before that
fix and are corrected in place below (marked) rather than left stale.

Implements the W3 slice of `docs/saas/PHASE-4-START-GATE-AND-IMPLEMENTATION-SPEC.md`
under the approved gate: **D10** (RESOLVED — sequential tenant-scoped
order/invoice numbering via `TenantCounter`, business decision, no
financial-year reset required), **D11** (RESOLVED), **P4-D1** (RESOLVED —
Option B), **P4-D2** (OPEN, held — W7-only, not touched).

---

## 1. Implementation summary

| Item | Status |
|---|---|
| Nullable `tenantId` on 21 pre-existing commerce tables | Added — plain scalar, no `@relation`, no default |
| Nullable `storeId` on 6 tables (per Master Plan's exact list) | Added — plain scalar, no `@relation`, no default |
| Nullable `customerId`-family columns (7 columns across 7 tables) | Added — plain scalar, no `@relation`, no default |
| `TenantCounter` model (decision D10) | Added — new, empty table; real `@relation` to `Tenant` (safe: brand-new table, zero existing rows) |
| Single-column indexes on every new column | Added (`@@index`) |
| Composite FKs / composite uniques (W6) | **Not added** — out of scope |
| `NOT NULL` on any new column (W7) | **Not added** — out of scope |
| Data backfill (W4) | **Not executed** — out of scope |
| Migration-safety guard (`migration-safety.spec.ts`) | Unmodified; all 31 `ADD COLUMN` statements pass the existing G-19 exemption (30 original + 1 from the §11 P1 fix) |
| New migration | `20260908093650_w3_tenant_scoping_columns` |
| New W3-specific e2e tests | `test/e2e/phase4-w3-tenant-scoping.e2e-spec.ts` — 48 tests (§11: rewritten to derive expected columns from the spec text itself) |
| Pre-existing test updated for W3 | `test/e2e/identity-foundation.e2e-spec.ts` (AC-P2-06 — see §6) |
| Pre-existing test fixture updated for W3 | `src/products/customizations/customization-validation.util.spec.ts` (see §6) |

---

## 2. Files changed (exact)

**New:**
- `backend/prisma/migrations/20260908093650_w3_tenant_scoping_columns/migration.sql`
- `backend/test/e2e/phase4-w3-tenant-scoping.e2e-spec.ts`
- `docs/saas/PHASE-4-IMPLEMENTATION-REPORT.md` (this file)

**Modified:**
- `backend/prisma/schema.prisma` — see §4/§5 for the exact field/model/index list.
- `backend/test/e2e/identity-foundation.e2e-spec.ts` — `AC-P2-06` re-scoped (see §6).
- `backend/src/products/customizations/customization-validation.util.spec.ts` — one test fixture literal updated to satisfy the now-wider `CustomizationField` type (see §6).

**Explicitly not touched:** every domain service (`orders`, `payments`, `checkout`, `cart`, `products`, etc. — no runtime code reads or writes any new column yet, that is W5/W7); `migration-safety.spec.ts` (no change needed — see §5); any frontend file; `docs/saas/DECISIONS.md` (no new decision was made or reopened during implementation).

---

## 3. Migration (exact)

**Name:** `backend/prisma/migrations/20260908093650_w3_tenant_scoping_columns/migration.sql`

Hand-split from Prisma's own generated diff (`prisma migrate dev --create-only`)
into one `ALTER TABLE ... ADD COLUMN` statement per column — Prisma's default
output batches multiple `ADD COLUMN`s for the same table into one
comma-separated `ALTER TABLE` statement, which trips the migration-safety
guard's G-19 exemption (G-19 requires exactly one additive action per
statement). Splitting is a pure SQL-shape change; the resulting schema is
byte-for-byte identical to Prisma's own output.

Contents:
- 30 `ALTER TABLE "<table>" ADD COLUMN "<col>" TEXT;` statements — one per
  new column, every one nullable, no `DEFAULT`, no `NOT NULL`, single action.
- One `CREATE TABLE "tenant_counters" (...)` — brand-new table.
- One `CREATE UNIQUE INDEX "tenant_counters_tenantId_key_key"`.
- 30 `CREATE INDEX "<table>_<col>_idx"` — one per new column.
- One `ALTER TABLE "tenant_counters" ADD CONSTRAINT ... FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")` — the only FK this migration adds, and only because `tenant_counters` is itself created in the same file (Prisma's normal FK-creation pattern, same as every other `CREATE TABLE` in this schema's history).
- No `DROP`, no `DELETE`, no `UPDATE`, no `SET NOT NULL` anywhere.

**Applied to:** `printforge_dev` and `printforge_test` (both local). **Not
applied to production** — the production `DATABASE_URL` was never read,
connected to, or referenced by any command run in this session; only the
local `.env` (`printforge_dev`) and `.env.test` (`printforge_test`)
connection strings were used, and both were confirmed local
(`localhost:5432`) before any migration command ran.

Applying it to the two local databases (rather than leaving it
create-only/unapplied, as Phase 3's RLS migration deliberately was) was
necessary to run the full required verification suite for real against
Postgres — `prisma validate` alone cannot prove a migration executes cleanly,
and this repo's e2e suite requires a migrated `printforge_test`. This mirrors
how every other additive migration in this repo's history (Phase 1, Phase 2a)
was verified.

---

## 4. Models changed (exact)

**21 pre-existing commerce tables** gained new nullable scalar columns
(scalar only — no Prisma `@relation`, per §5):

| Model (table) | New columns |
|---|---|
| `Category` (`categories`) | `tenantId`, `storeId` |
| `Product` (`products`) | `tenantId`, `storeId` |
| `ProductImage` (`product_images`) | `tenantId` |
| `ProductVariant` (`product_variants`) | `tenantId` |
| `CustomizationField` (`customization_fields`) | `tenantId` |
| `UploadedFile` (`uploaded_files`) | `tenantId`, `uploadedByCustomerId` |
| `Cart` (`carts`) | `tenantId`, `storeId`, `customerId` |
| `CartItem` (`cart_items`) | `tenantId` |
| `CartItemCustomization` (`cart_item_customizations`) | `tenantId` |
| `Order` (`orders`) | `tenantId`, `storeId`, `customerId` |
| `Invoice` (`invoices`) | `tenantId` |
| `OrderItem` (`order_items`) | `tenantId` |
| `OrderItemCustomization` (`order_item_customizations`) | `tenantId` |
| `PaymentAttempt` (`payment_attempts`) | `tenantId` |
| `Refund` (`refunds`) | `tenantId` |
| `OrderStatusHistory` (`order_status_history`) | `tenantId`, `changedByCustomerId`, `changedByMembershipId` |
| `IdempotencyKey` (`idempotency_keys`) | `tenantId`, `customerId` |
| `OutboxEvent` (`outbox_events`) | `tenantId` |
| `Review` (`reviews`) | `tenantId`, `storeId`, `customerId` |
| `Coupon` (`coupons`) | `tenantId`, `storeId` |
| `CouponUsage` (`coupon_usages`) | `tenantId`, `storeId`, `customerId` (`storeId` added by the §11 P1 fix — originally missing) |

**1 new model:** `TenantCounter` (`tenant_counters`) — see §5.

**1 back-relation only** (adds no column): `Tenant.tenantCounters TenantCounter[]`.

**Explicitly excluded from `tenantId`/`storeId`:** `User`, `RefreshToken`,
`AppSetting`, `WebhookEvent`, and every existing SaaS-Foundation/Identity
model (`Tenant`, `Store`, `StoreDomain`, `TenantMembership`, `Plan`,
`Subscription`, `Customer`) — none of these are in Master Plan's W3 table
list, and none were touched.

Fields added: 33 total (30 on pre-existing tables + 3 columns on the new
`TenantCounter` beyond its FK column, i.e. `id`, `key`, `value`, `updatedAt`
— `tenantId` counted once above).

---

## 5. Design decisions applied (traceable, not invented)

- **No `@relation`/FK on the 21 pre-existing tables' new columns.** Master
  Plan's own wave table assigns composite FKs to **W6**; adding relations
  now would additionally require ~33 new back-relation arrays on
  `Tenant`/`Store`/`Customer`, which is scope creep beyond W3. The new W3
  e2e suite (§6) asserts this explicitly: no `FOREIGN KEY` constraint exists
  on any of the 30 new columns.
- **A real `@relation` FK on `TenantCounter.tenantId`.** Safe specifically
  because this is a brand-new, empty table with zero pre-existing rows —
  unlike the 21 tables above, there is no backfill-ordering concern. This
  mirrors Phase 1's own precedent (every Phase-1-introduced table got a real
  FK from day one).
- **`TenantCounter` design (decision D10).** `id`, `tenantId` (FK, RESTRICT),
  `key` (a caller-defined namespace per counter series, e.g.
  `"order_number"`/`"invoice_number"` — the exact key set is decided by
  whichever W7 consumer reads it, not by this table), `value` (Int, default
  0), `updatedAt`. `@@unique([tenantId, key])` — one counter row per
  (tenant, series). No financial-year reset field, matching D10's exact
  wording ("No financial-year reset is required by the current business
  decision"). The atomic-claim pattern (`UPDATE ... SET value = value + 1
  RETURNING value`, never check-then-increment) is documented in the schema
  comment for whichever W7 work implements the actual claim — this table
  only provides the storage primitive; no counter-consuming logic was
  written (that is W7, explicitly not authorized this session).
- **Migration-safety guard left untouched (P4-D2 stays OPEN).** Every
  `ALTER TABLE` in the new migration is a single, nullable, no-default `ADD
  COLUMN` — the existing G-19 exemption already covers this exactly, with no
  extension needed. Verified: `migration-safety.spec.ts`'s 19 tests
  (including the "every non-legacy migration on disk is additive-only"
  check against the new file) all pass unmodified.

---

## 6. Pre-existing tests that needed updating (and why — not scope creep)

- **`test/e2e/identity-foundation.e2e-spec.ts` — `AC-P2-06`.** This was a
  Phase 2a acceptance criterion asserting, DB-wide, that no table had any
  `customerId`-like column — its own inline comment already said "(that is
  Phase 4)", i.e. it was known to be a Phase-2a-only invariant. Since Phase 4
  W3 is now explicitly authorized and has added exactly those columns, the
  live-DB-wide assertion is obsolete by design, not by mistake. Re-scoped it
  to check what it was actually protecting: that **Phase 2a's own migration
  file** (`20260906171709_add_customer_and_platform_role`) never added a
  `customerId` column — which remains, and will always remain, true. No
  other AC-P2-* test needed changing.
- **`src/products/customizations/customization-validation.util.spec.ts`.**
  A hand-written test fixture built a full `CustomizationField` object
  literal; Prisma's generated type for that model now includes a
  (non-optional-key, nullable-value) `tenantId: string | null` field, so the
  literal needed `tenantId: null` added. No test assertion or behavior
  changed — this was a pure type-shape fix required by `tsc --noEmit`.

No other existing test file, fixture, or assertion needed any change.

---

## 7. Findings

**A migration-application incident, found and reverted before it could reach
this report.** While syncing the local databases so the new W3 migration
could be created and applied, `prisma migrate dev`/`migrate deploy` also
applied the still-pending, unrelated Phase 3 migration
(`20260907183000_enable_rls_tenancy_tables`) for real onto both local
databases. That migration's own file header and `test/e2e/tenant-rls.e2e-spec.ts`
explicitly document that it must **never** be applied for real to any shared
database — it exists to be exercised only inside that test's own
rolled-back transaction; real application is documented as "a separate,
future, explicitly-authorized production step." The real application caused
6 e2e test failures (`policy "tenant_isolation" for table "tenants" already
exists`).

This was caught by running the full e2e suite as required (§8) rather than
assuming success from a clean migration-apply exit code. **Fix:** reverted
the RLS migration's real effects on both `printforge_dev` and
`printforge_test` — `DROP POLICY "tenant_isolation"` on all six Phase 1/2a
tenancy tables, `ALTER TABLE ... NO FORCE`/`DISABLE ROW LEVEL SECURITY` on
the same six, and removed that migration's row from each database's
`_prisma_migrations` table — restoring the exact state that existed before
this session touched anything (that migration back to "pending," matching
`prisma migrate status`'s original output at the start of this task). The
W3 migration was left applied. This revert touched only local `printforge_dev`/
`printforge_test` and Prisma's own internal bookkeeping table; it did not
touch production and did not touch any application/business data. The user
was informed and explicitly authorized this specific revert before it was
run (the DROP/DELETE statements were blocked by the auto-mode permission
classifier by default; the user granted a one-time approval).

No other findings. No `NOT NULL`, no default value, no dropped column, no
renamed column, no altered type on any pre-existing column anywhere in this
change.

---

## 8. Test results (exact)

All commands run from `backend/`, against local databases only.

| Check | Result |
|---|---|
| `prisma validate` | ✅ "The schema at prisma/schema.prisma is valid" |
| `prisma generate` | ✅ Prisma Client v6.19.3 generated |
| Migration applied to `printforge_dev` | ✅ clean apply, `migrate status` → "Database schema is up to date!" |
| Migration applied to `printforge_test` | ✅ clean apply via `migrate deploy` |
| `migration-safety.spec.ts` (additive-only guard) | ✅ 19/19 passed, unmodified guard |
| Full unit suite (`npm run test`) | ✅ 35 suites / 317 tests passed |
| Full e2e suite (`npm run test:e2e`) | ✅ 22 suites / 231 tests passed (183 pre-existing + 48 W3 tests, post-§11-fix) |
| New W3 e2e file alone | ✅ 48/48 passed (post-§11-fix; was 42/42 pre-fix) |
| `tsc --noEmit` | ✅ no errors (1 pre-existing fixture fixed — see §6) |
| `npm run build` (`nest build`) | ✅ clean |
| `npm run lint` (eslint --fix) | ✅ 0 errors, 1 pre-existing unrelated warning (`test/e2e/support/fixtures.ts:13`, `no-unsafe-argument` — not touched by this change) |

---

## 9. Explicit scope statements

- **DATA BACKFILL: NOT EXECUTED.** No `UPDATE` statement exists anywhere in
  the new migration or in any code touched this session. Every new column
  reads back `NULL` on every existing and newly-created row (asserted by
  the new e2e suite, §6/§8).
- **PRODUCTION: NOT TOUCHED.** No production connection string was ever
  read or used. Only `printforge_dev`/`printforge_test`, both
  `localhost:5432`, confirmed before any migration command ran.
- **W4 (backfill), W5, W6 (composite FKs/uniques), W7 (NOT NULL/contract):
  NOT STARTED.** No code in this session reads or writes any new column at
  runtime; no composite FK/unique was added; no column was made `NOT NULL`;
  no legacy uniqueness was removed.
- **Phase 5: NOT STARTED.**
- **No resolved decision (D10, D11, P4-D1) was reopened.** P4-D2 remains
  OPEN, held for W7, and the migration-safety guard was not modified.

---

## 10. Not committed, not pushed

`git status` shows `prisma/schema.prisma`, the new migration directory,
`test/e2e/phase4-w3-tenant-scoping.e2e-spec.ts`,
`test/e2e/identity-foundation.e2e-spec.ts`, and
`src/products/customizations/customization-validation.util.spec.ts` as the
only files this session changed — none staged, none committed, none pushed,
per explicit instruction.

---

## 11. Post-audit P1 fix — `CouponUsage.storeId`

An independent W3 audit (separate task, same session) re-read the approved
spec, this report, `DECISIONS.md`, and the Phase 3 report; re-inspected
`schema.prisma`, the migration file, the new e2e suite, `git diff`, and both
local databases directly; and cross-checked every one of the 21 W3 tables'
columns against `docs/saas/PHASE-4-START-GATE-AND-IMPLEMENTATION-SPEC.md`
§3's own TID/SID/CID markers, column by column. It found exactly one gap:

- **P1 — `CouponUsage` was missing `storeId`.** Spec §3.5 marks
  `CouponUsage`'s SID column `✓` (direct-column-required — the same marker
  every other storeId-bearing W3 table uses), not `derived` or `not
  required`. The original implementation omitted it. Every other one of the
  21 tables matched the spec exactly.
- **P2 — the original `phase4-w3-tenant-scoping.e2e-spec.ts`'s column list
  mirrored the schema being tested**, not the spec, so it could not and did
  not catch the gap above.

### Fix applied (this task)

1. **`backend/prisma/schema.prisma`** — `CouponUsage` gained `storeId
   String?` and `@@index([storeId])`, in the same position and shape as
   every other W3 `storeId` column (nullable, no default, no `@relation`,
   single-column index only).
2. **`backend/prisma/migrations/20260908093650_w3_tenant_scoping_columns/migration.sql`**
   — one `ALTER TABLE "coupon_usages" ADD COLUMN "storeId" TEXT;` (single
   nullable `ADD COLUMN`, matching the G-19 exemption exactly, same as
   every other statement in this file) and one `CREATE INDEX
   "coupon_usages_storeId_idx" ON "coupon_usages"("storeId");`, inserted in
   the same alphabetical position as the file's existing `coupon_usages`
   entries. The migration was already applied to both local databases
   (§3); the equivalent `ALTER TABLE`/`CREATE INDEX` was applied directly
   to `printforge_dev` and `printforge_test` for real, and the migration's
   `_prisma_migrations` checksum was updated on both to match the edited
   file's new sha256 — the same reconciliation technique already used once
   in this session's original W3 work (§7), scoped to Prisma's own
   bookkeeping table plus the two purely-additive DDL statements
   themselves. No other row in either database was touched; both databases'
   two pre-existing `coupon_usages` rows (created 2026-08-27, before this
   session) still read `storeId = NULL` after the column was added —
   confirming no backfill occurred.
3. **`backend/test/e2e/phase4-w3-tenant-scoping.e2e-spec.ts`** — rewritten
   so the expected tenantId/storeId requirement per table is **parsed
   directly from `docs/saas/PHASE-4-START-GATE-AND-IMPLEMENTATION-SPEC.md`
   §3's own markdown table** at test-run time (`parseSpecOwnershipTable`),
   instead of a hand-copied literal. The customerId-family column *names*
   (which the spec's CID column doesn't spell out) remain sourced from
   decision P4-D1's exact approved column list, now with an added
   bidirectional cross-check test that the two agree. Two new sanity tests
   guard against the parser itself silently breaking (a spec-format change
   making it match zero rows, or every table failing closed with `false`)
   — 6 new tests total (48 vs. the original 42), plus one dedicated
   `CouponUsage.storeId` round-trip test (NULL by default; accepts a real
   value; still no FK).
4. **`docs/saas/PHASE-4-IMPLEMENTATION-REPORT.md`** — this file, updated in
   place (§1, §4, §8 corrected; this §11 added).

### Explicitly still not done (out of scope for this fix, same as W3 itself)

No `(storeId,couponId)→Coupon(storeId,id)` composite FK (that is W6, named
in spec §3.5's own "Target FKs" column for this exact table). No `NOT NULL`.
No unique constraint. No data backfill/`UPDATE`. No other table touched. No
decision reopened — this fix implements exactly what P4-D1/the approved spec
already authorized, it does not revisit either.

### Validation (re-run after the fix)

`prisma validate` ✅ · `migration-safety.spec.ts` 19/19 ✅ (unmodified) ·
unit suite 317/317 ✅ · e2e suite 231/231 ✅ (183 + 48) · `tsc --noEmit` ✅ ·
`nest build` ✅ · `eslint` ✅ (0 errors, same 1 pre-existing unrelated
warning) · direct DB checks on both `printforge_dev`/`printforge_test`:
`coupon_usages.storeId` nullable/no-default ✅, index exists ✅, no FK ✅, no
unique constraint ✅, both pre-existing rows still `NULL` ✅, RLS migration
still not persisted on either database (0 policies, RLS disabled/unforced
on all six tenancy tables, no `_prisma_migrations` row) ✅, no production
connection string anywhere in the local environment ✅.

**Still not committed, not pushed.**
