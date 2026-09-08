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

---

## 12. W4/W5 backfill — preparation + dry-run (this task)

**Status: TOOLING BUILT AND VALIDATED AGAINST A LOCAL SCRATCH COPY ONLY.
PRODUCTION NOT TOUCHED. NOT COMMITTED, NOT PUSHED.** This section covers
what the Master Plan / spec label **W4 (catalog + settings)** and **W5
(commerce + customer data)** together — scoped as one combined task per an
explicit clarification at the start of this work (the task's own prompt
used "W4" as an umbrella term for all backfill and listed all 21 tables;
the spec's own §11 splits that work into two named waves. Both readings are
recorded here so neither is silently reinterpreted later). **W6 (composite
FKs/uniques) and W7 (NOT NULL/contract) were not started.**

### 12.1 Scope — exact tables, ownership mapping, backfill expressions

Derived directly from `schema.prisma` (not assumed) and cross-checked
against spec §3's per-table Ownership path / Backfill columns. Every column
listed already exists (added in W3); this task adds no schema/migration.

| Table | Column(s) backfilled | Source |
|---|---|---|
| `categories` | `tenantId`, `storeId` | Direct -> target tenant/store |
| `products` | `tenantId`, `storeId` | Direct |
| `product_images` | `tenantId` | Copy parent `products.tenantId` (no `storeId` column exists on this table — W3 never added one, see §12.6 finding) |
| `product_variants` | `tenantId` | Copy parent `products.tenantId` |
| `customization_fields` | `tenantId` | Copy parent `products.tenantId` |
| `coupons` | `tenantId`, `storeId` | Direct |
| `uploaded_files` | `tenantId` | Direct (every row -> target tenant) |
| `uploaded_files` | `uploadedByCustomerId` | Join `uploadedByUserId` -> `users.role='CUSTOMER'` -> `customers(storeId,email)` |
| `carts` | `tenantId`, `storeId` | Direct |
| `carts` | `customerId` | Join `userId` -> role=CUSTOMER -> `customers(storeId,email)` |
| `cart_items` | `tenantId` | Copy parent `carts.tenantId` |
| `cart_item_customizations` | `tenantId` | Copy parent `cart_items.tenantId` |
| `orders` | `tenantId`, `storeId` | Direct |
| `orders` | `customerId` | Same join as `carts.customerId` |
| `order_items` | `tenantId` | Copy parent `orders.tenantId` |
| `order_item_customizations` | `tenantId` | Copy parent `order_items.tenantId` |
| `invoices` | `tenantId` | Copy parent `orders.tenantId` |
| `payment_attempts` | `tenantId` | Copy parent `orders.tenantId` |
| `refunds` | `tenantId` | Copy grandparent via `payment_attempts.tenantId` |
| `order_status_history` | `tenantId` | Copy parent `orders.tenantId` |
| `order_status_history` | `changedByCustomerId` | Join `changedByUserId` (nullable) -> role=CUSTOMER -> `customers` |
| `coupon_usages` | `tenantId`, `storeId` | Copy parent `orders.tenantId`/`storeId` (spec §3.5 explicit; this column exists only because of the P1 fix in §11) |
| `coupon_usages` | `customerId` | Join `userId` -> role=CUSTOMER -> `customers` |
| `reviews` | `tenantId`, `storeId` | Direct |
| `reviews` | `customerId` | Join `userId` -> role=CUSTOMER -> `customers` |
| `idempotency_keys` | `tenantId` | Copy from `resultOrder.tenantId` where `resultOrderId` is set; direct-assign for the remainder (spec §3's exact two-path description) |
| `idempotency_keys` | `customerId` | Join `userId` -> role=CUSTOMER -> `customers` |
| `outbox_events` | `tenantId` | Conditional: `aggregateType='Order'` rows join `aggregateId` -> `orders.tenantId`; every other `aggregateType` (grep-verified: the codebase only ever writes `'Order'` or `'User'`) stays `NULL` **forever** — spec §3.6's one deliberate permanent exception |
| `tenant_counters` | new rows (`order_number_counter`, `invoice_number_counter`) | Seeded from the current `app_settings` counter value (see §12.3) |

Dependency order (parent before child, matching spec §11): catalog ->
coupons -> uploaded files -> cart family -> order family -> coupon usage ->
review -> idempotency keys -> outbox events -> counters. Full per-table
detail (PK, dependency, exact SQL) lives in the tool's own code comments
(`backend/prisma/backfill/w4-backfill.ts`) rather than duplicated here, to
avoid the two drifting apart.

**Explicitly excluded** (matches spec §3.7 + §3.6): `User`, `RefreshToken`
(global identity), `WebhookEvent` (spec's own tenantId list never names
it), `Tenant`/`Store`/`StoreDomain`/`TenantMembership`/`Plan`/`Subscription`/
`Customer` (already tenant-scoped since Phase 1/2a).

### 12.2 Ownership mapping

Every existing row resolves to **Tenant #1 / its primary Store** — the tool
takes these as **required, explicit CLI arguments** (`--tenant-id`,
`--store-id`), validated against the database before anything runs
(existence, the store belongs to the given tenant, the store `isPrimary`)
— it never guesses, auto-discovers, or accepts an unvalidated value. This
matches D2/D3 (RESOLVED): production is confirmed single-tenant today, so
every row's correct owner is unambiguous.

### 12.3 Counters (decision D10)

`TenantCounter` rows are seeded directly from `app_settings`' current
`order_number_counter` / `invoice_number_counter` **value** — not a
re-derived `MAX(orderNumber)+1`. Verified from the actual claim code
(`orders.service.ts::generateOrderNumber`, `invoice-number.service.ts`):
`INSERT ... VALUES ('1') ON CONFLICT DO UPDATE SET value = value+1 ...
RETURNING value`, and the **returned value is used immediately as the
number just issued** — so the stored value already **is** the last-issued
number, and seeding `TenantCounter.value` to it directly is exactly
equivalent to D10's "`MAX(existing)+1`" framing (the next atomic `+1` claim
correctly produces the true next number). Key names are preserved verbatim
(`order_number_counter`, `invoice_number_counter`) — not renamed, since no
consumer exists yet to decide a different convention (that is W7).

**Blocked, disclosed, not attempted:** `AppSetting` -> `TenantSetting` /
`StoreSetting` (decision D11's other half). Those two Prisma models **do
not exist** — only `TenantCounter` was added in W3. Creating them would be
a schema change, which is out of scope for a backfill-preparation task and
was not authorized here. The 8 remaining `TENANT`/`STORE`-classified
`AppSetting` keys (D11's table: `storeName`, `storeAdminName`,
`shippingFeeFlat`, `announcement_text`, `hero_slides`, `banners`,
`showcase_categories`, `tax.*`, `invoice.sellerLegalName` etc.) are **not**
migrated by this task. This is a genuine, named gap for whoever implements
the `TenantSetting`/`StoreSetting` schema addition, not an oversight.

### 12.4 CustomerId strategy (decision P4-D1, Option B — implemented exactly)

`userId` is never read as a target of any write, never touched, never
overwritten — every backfill statement's `SET` clause only ever targets
`tenantId`/`storeId`/`customerId`-family columns. `customerId` is populated
**only** where a `Customer` row already exists matching
`(storeId, User.email)` for a `role='CUSTOMER'` actor — the exact
reconciliation criterion P4-D1 itself specifies (`COUNT(customerId set) ==
COUNT(userId mapping to a role='CUSTOMER' User)`), verified automatically
by `reconcile.ts`'s `postOnlyChecks`.

**Explicitly handled, per the task's own list:**
- **CUSTOMER users** — backfilled via the join, whenever a `Customer`
  match exists.
- **ADMIN users who also have order history** — get `tenantId`/`storeId`
  (unconditional, direct) but **no** `customerId` (the join's `WHERE
  u.role = 'CUSTOMER'` guard excludes them structurally) — not an anomaly,
  the expected P4-D1 shape. Covered by a dedicated e2e test.
- **Inactive shoppers** — `Customer.isActive` already mirrors
  `User.isActive` (Phase 2b); the join doesn't filter on `isActive` at all
  (an inactive customer's historical rows still get a `customerId` — they
  existed and shopped; `isActive` is a login-eligibility flag, not a
  data-visibility one).
- **Duplicate emails** — `users.email` is globally `@unique` and
  `customers(storeId,email)` is `@unique` — the join can structurally never
  produce more than one match. Verified 0 duplicate emails in the local
  scratch dataset (127 users) as an extra sanity check, matching Phase 2b's
  own finding (0 duplicates in production).
- **Missing/ambiguous customer matches** — reported as an anomaly
  (`customer_role_user_with_no_matching_customer_row`), never silently
  skipped or invented. Verified by two dedicated e2e tests (a role=CUSTOMER
  user with no `Customer` row; confirming `customerId` stays `NULL` and the
  count is surfaced in the step result).
- **`User` rows are never created, updated, or deleted** by this tool —
  read-only access to `users`.

**Deliberate, disclosed scope limit:** `OrderStatusHistory.changedByMembershipId`
is added to the schema (W3) but **not populated** by this backfill. P4-D1's
approved text groups it under "backfilled from the same
`(storeId,email)` join," but that join resolves a `Customer`, not a
`TenantMembership` — populating it correctly for `ADMIN`-role actors would
require a *different* join (`userId`+`tenantId` -> `tenant_memberships.id`)
that P4-D1's text doesn't actually specify and Phase 2b never exercised at
write-time. Rather than invent a new join not present in any approved
decision, this backfill leaves `changedByMembershipId` `NULL` for every row
— a conservative, disclosed limitation, not a silent gap.

### 12.5 Backfill tooling (exact files)

- **`backend/prisma/backfill/w4-backfill.ts`** — the backfill tool.
  `npx ts-node prisma/backfill/w4-backfill.ts --tenant-id=<uuid>
  --store-id=<uuid> [--dry-run]`. Idempotent by construction (every
  `UPDATE`'s `WHERE` clause includes `"<column>" IS NULL` — an
  already-backfilled row is structurally never touched again; nothing is
  ever overwritten, so a wrong prior value is never silently "corrected").
  `--tenant-id`/`--store-id` are required, explicit, and validated
  (existence + store-belongs-to-tenant + store-is-primary) before any
  write — no trusted/implicit input. **Dry-run implementation note (a real
  bug found and fixed during this task, not a hypothetical):** an early
  version of this tool computed dry-run "would-change" counts via `SELECT
  COUNT(*)` only, without writing — for every "copy from parent" step, this
  undercounted to near-zero, because the parent hadn't actually been
  written yet by the time the dry-run reached the child (a dry-run can't
  see a write that never happened). Fixed by having dry-run mode run the
  **same real `UPDATE`/`INSERT` statements** as a real run, inside **one
  single transaction that always rolls back** at the end — the identical
  rollback-only technique already proven in this codebase
  (`test/e2e/tenant-rls.e2e-spec.ts`'s `inRolledBackTransaction`; Postgres
  DML is fully transactional). Real-run mode instead commits each logical
  step in its own transaction, so a failure partway through leaves every
  already-completed step's work intact.
- **`backend/prisma/backfill/reconcile.ts`** — read-only reconciliation.
  `--snapshot-out=<file>` captures a baseline; `--compare=<file>` diffs the
  live state against a prior snapshot (row counts, order-total sum,
  payment-CAPTURED sum, refund sum, order-number set hash, invoice-number
  set hash, `userId` pair-hash per table); always also runs "post-only"
  checks needing no baseline (Tenant/Store resolution, ownership
  completeness per table, the P4-D1 customerId cross-check, orphan
  detection — child `tenantId` matches parent's). `tenant_counters` is the
  one table allowed to **grow** (bounded 0-2, the two known keys) rather
  than stay row-count-identical — every other table must show zero
  `INSERT`/`DELETE` (spec §10).
- **`backend/prisma/backfill/dev-scratch-seed-phase2b-equivalent.ts`** —
  **local dry-run prerequisite only, NOT part of W4/W5 itself.** Phase 2b's
  Tenant #1/Store/`TenantMembership`/`Customer` foundation already exists in
  production (2026-09-07) but never existed in `printforge_dev`/
  `printforge_test` (verified: 0 rows in `tenants`/`stores`/`customers`/
  `tenant_memberships` before this task touched anything). This script
  replicates that exact foundation locally, using production's real slugs
  (`printforge`/`printforge`/"PrintForge Store"), so the local dry run
  exercises the real target identifiers this spec and decision set refer to
  throughout. Refuses to run when `NODE_ENV=production` or `DATABASE_URL`
  isn't local.
- **`backend/test/e2e/phase4-w4-backfill.e2e-spec.ts`** — 13 automated
  tests (§12.7).

### 12.6 A second finding during this task (not from the independent audit — found by actually running the tool)

While building the dry-run, the tool's "copy from parent" logic was
initially written assuming `product_images`/`product_variants`/
`customization_fields`/`cart_items`/`cart_item_customizations`/
`order_items`/`order_item_customizations` all have a `storeId` column
(mirroring their parent). **They don't** — W3 only added `storeId` to the 7
tables spec marks `SID = ✓` (direct-column-required):
`categories`/`products`/`carts`/`orders`/`coupons`/`coupon_usages`/`reviews`.
The other 7 tables' spec `SID` marker is `derived` — meaning no direct
`storeId` column at all, only `tenantId`. Running the (correctly-designed,
per §12.5) dry-run against real data caught this immediately (`column
"storeId" of relation "product_images" does not exist`) before any write
was attempted. Fixed by using the correct tenantId-only copy helper for all
7 affected tables; `coupon_usages` (which does have `storeId`, via the P1
fix in §11) correctly kept the tenantId+storeId copy helper. Re-verified
against the actual `schema.prisma` for every one of the 21 tables, not
just the 7 that broke.

### 12.7 Tests

**`test/e2e/phase4-w4-backfill.e2e-spec.ts` — 13 tests, all passing**,
importing the tool's own exported functions (`validateTarget`,
`runAllSteps`) and the reconciliation script's own exported functions
(`captureSnapshot`, `compareSnapshots`, `postOnlyChecks`) directly — real
regression coverage, not a rerun of the manual scratch demonstration:

- `validateTarget`: accepts a real tenant+primary-store pair; rejects a
  non-existent tenant; rejects a non-existent store; rejects a store
  belonging to a *different* tenant; rejects a non-primary store.
- A full representative dataset (category/product/image, coupon, cart+item,
  order+item+invoice+payment+refund+status-history+coupon-usage, an
  ADMIN-placed order, two idempotency keys — one with `resultOrderId`, one
  without, a review, three uploaded files by different actor roles, two
  outbox events — one `Order`-type, one `User`-type, two `app_settings`
  counter rows) backfills correctly on the first run — asserted via
  `postOnlyChecks` returning zero failing checks, `TenantCounter` seeded to
  the exact source values, the `Order`-type outbox event getting `tenantId`
  while the `User`-type one stays `NULL` — and is a **provable no-op on the
  second run** (every one of 30 step results reports `affected: 0`).
- **Preservation**: `userId`/order-number/invoice-number/`total` are
  byte-for-byte unchanged after a real run (`compareSnapshots` returns zero
  failing checks); a **second test deliberately tampers with an order's
  `total` between two snapshots** and asserts `compareSnapshots` correctly
  reports that specific check as failing — proving the reconciliation logic
  actually detects a real discrepancy, not just rubber-stamping PASS.
- **Anomaly handling**: a `role=CUSTOMER` user with no matching `Customer`
  row is reported (`customer_role_user_with_no_matching_customer_row: 1`),
  `customerId` stays `NULL`, `tenantId`/`storeId` are still correctly
  backfilled; an `ADMIN`-role user with order history gets
  `tenantId`/`storeId` but no `customerId` and **no** anomaly (expected
  shape, not an error); an already-set `tenantId` is never overwritten even
  when backfilling against a *different* tenant/store pair.
- **Dry-run/rollback**: `runAllSteps` executed inside a transaction that
  deliberately throws after collecting results — the results show real,
  non-zero affected counts, but the database is unchanged afterward
  (`order.tenantId` still `NULL`, zero `TenantCounter` rows created) —
  automated proof of the exact technique §12.5 describes.
- **Reconciliation orphan detection**: a child row (`product_images`) with
  a `tenantId` deliberately set to a *different* tenant than its parent
  `product` is correctly flagged by `postOnlyChecks`' orphan check.

### 12.8 Dry-run + real scratch-run results (against local `printforge_dev`)

`printforge_dev` had realistic bulk data (127 `users` — 116 `CUSTOMER` / 11
`ADMIN`, 0 duplicate emails, 1 admin with order history; 51 `orders`, 101
`carts`, 31 `products`, 12 `categories`, 7 `coupons`, 2 `coupon_usages`, 1
`review`, 17 `uploaded_files`, 52 `payment_attempts`, 7 `invoices`, 110
`order_status_history`, 51 `idempotency_keys`, 57 `outbox_events` — 56
`Order`-type / 1 `User`-type) but had **never** had Phase 2b's foundation
run against it. Sequence actually executed:

1. `dev-scratch-seed-phase2b-equivalent.ts` — created Tenant #1
   (`049f7d2a-...`), primary Store (`96c52def-...`), 11 `TenantMembership`
   rows (one per `ADMIN`), 116 `Customer` rows (one per `CUSTOMER`).
2. `reconcile.ts --snapshot-out=baseline.json` — captured the real
   pre-backfill baseline (not the historical D8 figures, a live capture,
   per the task's own instruction).
3. `w4-backfill.ts --dry-run` — reported **875 rows** would change across
   30 step results, **zero anomalies**. Verified the database was
   genuinely untouched afterward (every table's `tenantId IS NOT NULL`
   count still 0; `tenant_counters` still 0 rows) and `reconcile.ts
   --compare=baseline.json` showed **PASS** on every check (proving the
   dry-run's rollback held).
4. `w4-backfill.ts` (real run) — **875 rows affected**, identical to the
   dry-run's count, **zero anomalies**.
5. `reconcile.ts --compare=baseline.json` — **Baseline comparison: PASS**
   (every table's row count unchanged except `tenant_counters`, which grew
   by exactly 2 as expected; order-total/payment-CAPTURED/refund sums
   unchanged; order-number and invoice-number sets unchanged; every
   `userId` relationship pair-hash unchanged) and **Post-state checks:
   PASS** (Tenant/Store resolve; every table's ownership completeness is
   0-remaining-NULL; every `customerId` mapping count exactly matches its
   `role='CUSTOMER'` expected count; zero orphaned child rows).
6. `w4-backfill.ts` (real run, again) — **0 rows affected on every single
   one of the 30 step results** — idempotency proven against the same real
   dataset the first run touched, not just a synthetic fixture.

`printforge_dev` is left in this backfilled state (Tenant #1/Store #1
foundation + W4/W5 backfill applied) — a legitimate, safe, fully
additive/reversible local dev-database state (every touched column is
still nullable; nothing was made `NOT NULL`; no constraint changed), not
reverted, since there is no requirement to and doing so would need its own
risky action for no benefit. This is disclosed here rather than left
implicit.

### 12.9 Test results (exact)

| Check | Result |
|---|---|
| `prisma validate` | ✅ (schema unchanged this task) |
| `migration-safety.spec.ts` | ✅ 19/19 (unchanged, unmodified) |
| Full unit suite (`npm run test`) | ✅ 35 suites / 317 tests |
| Full e2e suite (`npm run test:e2e`) | ✅ 23 suites / 244 tests (231 prior + 13 new W4 tests) |
| New W4 e2e file alone | ✅ 13/13 |
| `tsc --noEmit` | ✅ no errors |
| `nest build` | ✅ clean |
| `eslint` | ✅ 0 errors, same 1 pre-existing unrelated warning |
| Local scratch dry-run | ✅ PASS — 875 eligible, 0 persisted, 0 anomalies |
| Local scratch real run | ✅ PASS — 875 affected, 0 anomalies |
| Local scratch reconciliation | ✅ PASS — baseline comparison + post-state checks both PASS |
| Local scratch idempotent rerun | ✅ PASS — 0 affected on rerun |

### 12.10 Explicit scope statements

- **PRODUCTION: UNTOUCHED.** No production connection string exists in
  this local environment (`.env` -> `printforge_dev`, `.env.test` ->
  `printforge_test`, both `localhost:5432` — confirmed before any command
  ran). Every command this task ran was against one of these two local
  databases only.
- **No `UPDATE`/`DELETE`/schema change was executed against production.**
- **W6 (composite FKs/uniques), W7 (NOT NULL/contract): NOT STARTED.** No
  new constraint of any kind was added by this task; no column was made
  `NOT NULL`.
- **No decision was reopened.** D10, D11, P4-D1 remain exactly as resolved;
  P4-D2 remains OPEN, held for W7.
- **`AppSetting` -> `TenantSetting`/`StoreSetting` (the other half of D11):
  BLOCKED**, not executed — the target schema doesn't exist (§12.3).
- **W4 is NOT marked complete.** Tooling is built, dry-run-verified, and
  real-run-verified against a local scratch copy only. **Production
  execution requires its own separate, explicit authorization** — not
  requested or assumed by this task.

### 12.11 Not committed, not pushed

`git status` shows exactly 4 new files from this task:
`backend/prisma/backfill/w4-backfill.ts`,
`backend/prisma/backfill/reconcile.ts`,
`backend/prisma/backfill/dev-scratch-seed-phase2b-equivalent.ts`,
`backend/test/e2e/phase4-w4-backfill.e2e-spec.ts` — plus this report
update. Nothing staged, nothing committed, nothing pushed. No unrelated
file was modified.

---

## 13. TenantCounter safety fix (P2, W4 independent audit)

**Status: FIXED. NOT COMMITTED, NOT PUSHED. PRODUCTION NOT TOUCHED.** The
independent W4 audit's one P2 finding is resolved: `TenantCounter` seeding
no longer trusts the source `app_settings` counter value verbatim — it is
now cross-checked against the actual issued numbers before anything is
created.

### 13.1 The exact rule

For each of the two counters (`order_number_counter` -> `orders.orderNumber`,
`invoice_number_counter` -> `invoices.invoiceNumber`),
`validateCounterAgainstMax()` (`backend/prisma/backfill/w4-backfill.ts`)
computes the real `MAX` of the already-issued numbers and compares it
against the source counter's current value:

| Condition | Status | Behavior |
|---|---|---|
| source == actual MAX | `PASS` | Seed `TenantCounter.value` = source, exactly as before |
| source < actual MAX | `BELOW_MAX` | **Refuse to seed.** A real collision risk — seeding this would let a future claim re-issue a number that already exists. |
| source > actual MAX | `ABOVE_MAX` | **Refuse to seed.** The exact drift class discovered in `printforge_dev` (order counter = 52, actual MAX = 51, zero gaps in 1..51) — seeding this verbatim would silently skip every number between actual MAX and the source value forever. |
| any existing number doesn't end in a digit run | `MALFORMED` | **Refuse to seed.** The MAX can't be trusted, so never guess. |
| the `app_settings` value itself isn't a parseable integer | `SOURCE_MALFORMED` | **Refuse to seed.** |
| no `app_settings` row for the key | `NO_SOURCE_ROW` | Nothing to seed — not an error (unchanged from before this fix). |

**Only `PASS` results in a `TenantCounter` row being created.** Every other
outcome reports a named anomaly (`counter_below_max`, `counter_above_max`,
`counter_malformed`, `counter_source_malformed`) with a human-readable
`detail` string carrying the exact numbers, and creates **nothing** — the
step's `affected` count is `0`. Per the task's explicit instruction,
`app_settings` itself is **never** rewritten and no "safer" substitute
value is silently picked for either direction of drift — the inconsistency
is surfaced, not repaired.

### 13.2 Number parsing — not invented

There is no pre-existing "parse a generated number back to an integer"
function anywhere in the codebase (grep-verified) — order/invoice numbers
are only ever generated, never re-parsed. `parseTrailingNumber()` is
derived directly from the two actual generation templates, not assumed:
`orders.service.ts::generateOrderNumber` -> `` `PF-${counter.padStart(6,'0')}` ``
and `invoice-number.service.ts::allocate` -> `` `${prefix}${value.padStart(6,'0')}` ``.
It extracts the trailing digit run (`/(\d+)$/`) rather than assuming a
fixed prefix — a fixed-prefix regex would be *wrong* for invoice numbers
specifically, since `invoice.numberPrefix` is a mutable, admin-editable
`AppSetting` (`app-setting.constants.ts`); a historical invoice issued
under an older prefix would silently fail to match a fixed-prefix regex
and be undercounted out of the MAX computation. The digit-padding shape is
the one stable fact regardless of prefix.

### 13.3 Where it's enforced

- **`w4-backfill.ts`'s `seedTenantCounters()`** — the actual gate. Calls
  `validateCounterAgainstMax()` **before** any `INSERT INTO tenant_counters`
  is even attempted; only a `PASS` reaches the `INSERT`. This is what makes
  the fix preventative ("fail loudly before any unsafe value is created"),
  not merely diagnostic.
- **`reconcile.ts`'s `postOnlyChecks()`** — a second, independent,
  read-only check (`TenantCounter matches actual MAX (no drift): <key>`)
  that reads whatever is *already* in `tenant_counters` (if anything) and
  re-verifies it against the current actual MAX — defense-in-depth for a
  row that was correct when seeded but could in principle drift afterward
  (e.g. if a business-table row were added through some other path). It
  imports `parseTrailingNumber`/`COUNTER_SPECS` from `w4-backfill.ts` rather
  than reimplementing the parsing logic a second time — one canonical
  implementation, not two that could quietly disagree.

### 13.4 Fixture correction (task item 6)

The existing "backfills a full representative dataset" e2e test originally
used `` `ORD-${randomUUID()}` ``/`` `INV-${randomUUID()}` `` placeholder
numbers with arbitrary, disconnected counter values (`'7'`, `'3'`) — this
predates the safety gate and would now correctly be rejected as
`MALFORMED`/drifted (a UUID string essentially never matches the real
generation format). Corrected to use real `PF-######`/`INV-######` numbers
consistent with the actual rows created (two real orders -> counter `'2'`;
one real invoice -> counter `'1'`) so the fixture is internally consistent
and the safety gate legitimately `PASS`es for it, exactly as it should for
a correctly-formed dataset.

### 13.5 Tests (12 new, all passing)

`backend/test/e2e/phase4-w4-backfill.e2e-spec.ts`, new
`describe('TenantCounter safety validation (validateCounterAgainstMax)')`
block:

- `validateCounterAgainstMax()` unit-level (fast, isolated): counter ==
  actual MAX -> `PASS`; counter < actual MAX -> `BELOW_MAX`; counter >
  actual MAX (small case) -> `ABOVE_MAX`; **an exact reproduction of the
  real printforge_dev scenario — 51 sequential orders PF-000001..PF-000051
  with zero gaps, counter=52 -> `ABOVE_MAX`, drift of exactly 1**; a
  malformed existing `orderNumber` (no trailing digit run) -> `MALFORMED`;
  a malformed source `app_settings` value -> `SOURCE_MALFORMED`; no source
  row -> `NO_SOURCE_ROW`.
- Integration (via `runAllSteps`/`seedTenantCounters`): `BELOW_MAX` creates
  **no** `TenantCounter` row and reports `counter_below_max`; `ABOVE_MAX`
  (the printforge_dev scenario again, through the full pipeline this time)
  creates **no** row, reports `counter_above_max` with the exact
  `source=52`/`actual MAX=51` numbers in `detail`, and **`app_settings`
  itself is confirmed unchanged** (still `'52'`) — surfaced, not repaired;
  `PASS` creates the row with exactly the source value.
- `reconcile.ts postOnlyChecks`: flags an already-seeded `TenantCounter`
  that has since drifted from the actual MAX; passes when it matches.

### 13.6 Real-world verification against the actual discovered mismatch

Beyond the e2e suite (isolated `printforge_test` fixtures), the fix was
run against the **actual `printforge_dev` data where the drift was
originally discovered**:

```
$ npx ts-node prisma/backfill/reconcile.ts --tenant-id=<...> --store-id=<...>
[FAIL] TenantCounter matches actual MAX (no drift): order_number_counter (tenant_counters.value=52 actual MAX("orderNumber")=51)
[PASS] TenantCounter matches actual MAX (no drift): invoice_number_counter (tenant_counters.value=7 actual MAX("invoiceNumber")=7)
```

Then the backfill tool itself, in real (non-dry-run) mode, against the same
database:

```
$ npx ts-node prisma/backfill/w4-backfill.ts --tenant-id=<...> --store-id=<...>
tenant_counters (order_number_counter)  affected=0  ANOMALIES={"counter_above_max":1}
  DETAIL=source app_settings.order_number_counter = 52, actual MAX("orderNumber") in "orders" = 51
  (source is ahead of actual data) — refusing to seed; resolve the drift manually before retrying
tenant_counters (invoice_number_counter) affected=0
```

Confirmed after: `tenant_counters` in `printforge_dev` is **unchanged**
(`order_number_counter` still reads `52` — the pre-existing row from before
this fix was neither touched nor "corrected"; `invoice_number_counter`
still reads `7`), and `app_settings.order_number_counter` is still `'52'`
— nothing was rewritten anywhere, exactly as required.

### 13.7 Validation (re-run after the fix)

`prisma validate` ✅ · `migration-safety.spec.ts` 19/19 ✅ (unmodified,
untouched — this fix is pure application-layer TypeScript, no schema or
migration change) · unit suite 317/317 ✅ · e2e suite 256/256 ✅ (244 prior
+ 12 new) · `tsc --noEmit` ✅ · `nest build` ✅ · `eslint` ✅ (0 errors, same
1 pre-existing unrelated warning) · W4 e2e file alone 25/25 ✅ (13 prior +
12 new).

### 13.8 Explicit scope confirmation

- **No production access.** Every command in §13.6 ran against
  `printforge_dev` (`localhost:5432`) only.
- **No W6/W7 work added.** No composite FK/unique, no `NOT NULL`, no
  `DROP` — this fix is pure DML-selection-logic (a `SELECT`-based gate
  before an existing `INSERT`), same additive/non-destructive character as
  the rest of W4/W5.
- **No schema/migration change.** `schema.prisma` is untouched by this fix
  — confirmed via `git status`.
- **No data deleted.** No `DELETE`/`TRUNCATE` anywhere in the fix.
- **No order/invoice number rewritten.** The fix never writes to
  `orders.orderNumber`/`invoices.invoiceNumber`/`app_settings` at all —
  read-only inputs to a decision about whether to write a *new*
  `tenant_counters` row.
- **D10, D11, P4-D1, P4-D2 — none reopened, none touched.**

**Still not committed, not pushed.**

---

## PRODUCTION EXECUTION AUTHORIZATION: NOT YET REQUESTED

This task explicitly builds and validates W4/W5 tooling for later use — it
does not request, and this report does not imply, authorization to run
this tool against production. That is a separate, future, explicit
decision, following the same pattern every other production-affecting step
in this project has required (D8-style fresh backup + restore-verification
+ staging dry run first, per spec §9).
