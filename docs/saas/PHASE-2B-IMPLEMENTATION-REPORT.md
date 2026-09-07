# Phase 2b — Identity Backfill: Implementation Report

**Status: EXECUTED AGAINST PRODUCTION — 2026-09-07.** Gated on D2 (RESOLVED), D8
(RESOLVED, evidence `D8-20260907-02`), and **G-16** (APPROVED — AUTHORIZED,
2026-09-07). See `docs/saas/DECISIONS.md` D2/D3/D8/G-16 records for the
canonical governance trail; this document is the implementation/evidence
record for the execution itself.

## 1. Scope executed

Per `PHASE-2-DECISION-RESOLUTION-AND-SPEC.md §B.12.2`, plus the owner's
2026-09-07 authorization extending scope to Tenant #1 / primary Store
creation (see `DECISIONS.md` D3 Decision Log, 2026-09-07 entry):

1. **Free `Plan`** row (`key='free'`) — idempotent by `key`.
2. **Tenant #1** — `slug='printforge'`, `status=ACTIVE`. Name/slug supplied
   by the project owner in writing, 2026-09-07 (`DECISIONS.md` D3 record).
3. **Primary `Store`** for Tenant #1 — `name='PrintForge Store'`,
   `slug='printforge'`, `status=ACTIVE`, `isPrimary=true`.
4. **`Free`/`ACTIVE` `Subscription`** for Tenant #1.
5. **`OWNER` `TenantMembership`** for every `User` with `role='ADMIN'`, to
   Tenant #1, `status=ACTIVE`.
6. **`Customer`** row for every `User` with `role='CUSTOMER'`, under Tenant
   #1's primary store, copying `email`, `passwordHash`, `tokenVersion`,
   `failedLoginAttempts`, `passwordResetTokenHash`, `passwordResetExpiresAt`,
   `isActive`, and the 7 address columns — exactly per §B.12.2 step 2.

**No `User` row was created, updated, or deleted.** All six writes are new,
additive rows in `plans` / `tenants` / `stores` / `subscriptions` /
`tenant_memberships` / `customers`.

## 2. Method

A single idempotent SQL transaction (`INSERT ... SELECT ... WHERE NOT
EXISTS`, guarded by each table's existing unique constraint —
`plans.key`, `tenants.slug`, `stores(tenantId,slug)`,
`subscriptions.tenantId`, `tenant_memberships(userId,tenantId)`,
`customers(storeId,email)`) was:

1. Rehearsed against the D8-restored disposable scratch database
   (`d8_scratch`) — run twice; second run produced zero new rows across
   all six inserts, proving idempotency before touching production.
2. A **fresh pre-backfill production snapshot** was taken and
   checksum-verified immediately before production execution:
   `printforge_prod_prebackfill_20260907T173125Z.dump`, SHA-256
   `0847ee3cf68b10990474c156bfc8870e2b100c713a48e8fe2fe17aa56f2ace24`
   (149,660 bytes, permissions 600).
3. Executed against production inside `BEGIN`/`COMMIT` — single
   transaction, all-or-nothing.
4. Re-run against production immediately after — zero new rows across all
   six inserts, proving idempotency in production itself.

No `prisma db push`, no reset, no drop, no unrelated migration. `git`
tree touched: none (raw SQL executed directly; no schema/migration files
changed).

## 3. Dry-run + anomaly detection (performed before execution, against
`d8_scratch`)

| Check | Result |
|---|---|
| Eligible `role='ADMIN'` users | 5 |
| Eligible `role='CUSTOMER'` users | 18 (5+18=23 = total users) |
| Duplicate emails (case-insensitive) | 0 |
| Inactive (`isActive=false`) CUSTOMER-role users | 0 |
| CUSTOMER-role users with null/empty `passwordHash` | 0 |
| Admin-who-also-shopped (ADMIN users with ≥1 order) | 4 of 5 (count only — not resolved, not auto-fixed; recorded here as the anomaly class named in `DECISIONS.md` D2 consequences) |
| Existing `tenant_memberships` / `customers` rows before backfill | 0 / 0 |
| Tenant #1 / primary Store existing before this task | **0 / 0** — did not exist; created under the owner's 2026-09-07 authorization (see §1) |

No anomaly was auto-resolved. The admin-who-also-shopped condition is
**expected and accepted** per spec — these 4 users receive an `OWNER`
membership (via their `ADMIN` role) and are *not* also backfilled into
`Customer` (their `role` is `ADMIN`, not `CUSTOMER`); their order history
remains attached to their `User.id` via `orders.userId`, unchanged. No
further action was taken on this class per "record — do not auto-resolve."

## 4. Post-execution verification (production, read-only, aggregate-only)

| Table | Rows created | Notes |
|---|---|---|
| `plans` | 1 | `key='free'` |
| `tenants` | 1 | `slug='printforge'` |
| `stores` | 1 | `isPrimary=true`, `slug='printforge'` |
| `subscriptions` | 1 | `status=ACTIVE`, plan=free |
| `tenant_memberships` | 5 | all `role='OWNER'` (verified: `count(distinct role)=1`) |
| `customers` | 18 | `isActive` matches source `User.isActive` for all 18 (verified) |

### Reconciliation — existing commerce/business data (before vs. after)

| Table | Before | After | Match |
|---|---|---|---|
| `users` | 23 | 23 | ✅ |
| `orders` | 40 | 40 | ✅ |
| `orders` revenue sum | ₹3,248.00 | ₹3,248.00 | ✅ |
| `carts` | 21 | 21 | ✅ |
| `reviews` | 0 | 0 | ✅ |
| `coupon_usages` | 3 | 3 | ✅ |
| `idempotency_keys` | 40 | 40 | ✅ |
| `uploaded_files` | 39 | 39 | ✅ |
| `payment_attempts` | 54 | 54 | ✅ |
| `invoices` | 12 | 12 | ✅ |
| `order_status_history` | 84 | 84 | ✅ |
| `app_settings` | 10 | 10 | ✅ |

Zero drift on any existing table. No `User` row was modified (verified:
`users` count and structure unchanged; backfill only read `User`, never
wrote to it).

### `AC-P2-21` reconciliation criterion (§B.12.3)

- `count(User WHERE role='CUSTOMER')` (18) **==** `count(Customer WHERE
  storeId = <Tenant #1 primary store id>)` (18). ✅
- Every `User WHERE role='ADMIN'` (5) has exactly one `OWNER`
  `TenantMembership` to Tenant #1 (5 memberships, all `OWNER`, all to the
  single tenant). ✅

## 5. Idempotency evidence

| Run | Environment | New rows (plan/tenant/store/subscription/membership/customer) |
|---|---|---|
| 1st | `d8_scratch` (rehearsal) | 1/1/1/1/5/18 |
| 2nd | `d8_scratch` (rehearsal) | 0/0/0/0/0/0 |
| 1st | production | 1/1/1/1/5/18 |
| 2nd | production | 0/0/0/0/0/0 |

## 6. Tests

| Suite | Result |
|---|---|
| Backend unit (`npm run test`) | **29 suites / 266 tests — PASS** |
| Backend e2e (`npm run test:e2e`) | 18/19 suites, 166/167 tests pass on first run; the one failure (`payments-race.e2e-spec.ts` — a payment-webhook-race timing test, unrelated to identity/tenancy) **passed 3/3 in isolated re-run**, confirming pre-existing timing flakiness, not a Phase 2b regression |
| Backend lint (`npm run lint`) | 0 errors, 1 pre-existing warning (`test/e2e/support/fixtures.ts`, unrelated) |
| Backend build (`npm run build`) | PASS, exit 0 |
| `prisma validate` | schema valid |
| Migration status | unchanged by this task — no migration/schema file touched (raw idempotent SQL against existing Phase 2a schema only) |

## 7. Rollback

If a rollback is ever required: restore from
`printforge_prod_prebackfill_20260907T173125Z.dump` (pre-backfill snapshot,
checksum-verified), or run `DELETE FROM customers WHERE "tenantId" = <id>;
DELETE FROM tenant_memberships WHERE "tenantId" = <id>; DELETE FROM
subscriptions WHERE "tenantId" = <id>; DELETE FROM stores WHERE "tenantId"
= <id>; DELETE FROM tenants WHERE id = <id>;` (additive-only rows; no
`User` or commerce-table row was ever touched, so no compensating action
is needed for those).

## 8. Phase 2 completion

With Phase 2a (additive schema, 2026-09-06) and Phase 2b (this report,
2026-09-07) both executed and reconciled, **Phase 2 COMPLETION** criteria
per Master Plan §8 ("backfill reconciled") are met. See `DECISIONS.md`
Summary Table / gate-status lines for the canonical status update.

Explicitly **not** in scope for Phase 2 (unchanged, still future work):
`TenantContext` / `@RequirePermission` guard activation (Phase 3),
`customerId`/`tenantId`/`storeId` columns on existing commerce tables and
`User.role` retirement (Phase 4), customer-auth login routes (Phase 9/12),
platform console (Phase 5).
