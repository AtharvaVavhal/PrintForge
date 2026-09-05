# PrintForge SaaS — Phase 1 START GATE Result

> **Mode:** documentation / governance only. No source code, Prisma schema, migration, seed,
> environment file, dependency, or `BLUEPRINT-v1.2.md` was changed by the task that produced
> this document. **Phase 1 implementation has NOT started.**

---

## 1. Document Control

| Field | Value |
|---|---|
| Document | PrintForge SaaS — Phase 1 START GATE Result (`docs/saas/PHASE-1-START-GATE-RESULT.md`) |
| Version | 1.0 |
| Date | 2026-09-06 |
| Repository | `AtharvaVavhal/PrintForge`, branch `main`, HEAD `b20c849` |
| Gate rule applied | `PHASE-0-DECISION-RESOLUTION-AND-PHASE-1-SPEC.md §B.12` — *"Phase 1 implementation cannot begin until every BLOCKED item is resolved and every REQUIRES EXPLICIT APPROVAL item is explicitly approved and recorded in `docs/saas/DECISIONS.md`."* |
| Owner decisions recorded | 7 — D1, D3, D5, G-4, G-5, G-9, G-10 (all 2026-09-06, `docs/saas/DECISIONS.md` v1.1) |
| **Phase 1 START GATE verdict** | **`READY`** |
| Phase 1 implementation status | **NOT STARTED** |
| Companion documents | `docs/saas/DECISIONS.md` (v1.1), `docs/saas/PHASE-0.5-DECISION-STATUS.md` (v1.1), `docs/saas/ACR-001-SUPERSEDE-BLUEPRINT-V1.2.md`, `PHASE-0-DECISION-RESOLUTION-AND-PHASE-1-SPEC.md`, `PHASE-0.5-DECISION-CLOSURE.md`, `PHASE-0-REPOSITORY-INVENTORY.md`, `PRINTFORGE-SAAS-IMPLEMENTATION-MASTER-PLAN-v1.0.md`, `docs/architecture/BLUEPRINT-v1.2.md` |

---

## 2. Decision Inputs

The project owner supplied the following seven explicit decisions on **2026-09-06**. They
correspond exactly to the Phase 0.5 items D1, D3, D5, G-4, G-5, G-9, G-10.

| Owner input | Item | Interpretation (as supplied) |
|---|---|---|
| `D1: APPROVE` | **D1** | APPROVE the required ACR under `BLUEPRINT-v1.2 §38` to permit the Phase 1 tenancy models. |
| `D3: A` | **D3** | The existing deployment/store becomes **Tenant #1**. |
| `D5: A` | **D5** | Use a **separate store-scoped `Customer` entity**. |
| `G-4: APPROVE` | **G-4** | APPROVE the Phase 1 specification (`PHASE-0-DECISION-RESOLUTION-AND-PHASE-1-SPEC.md §B.2–B.8`). |
| `G-5: APPROVE` | **G-5** | APPROVE the proposed lifecycle/status enum sets; ratify `TenantRole` and `SubscriptionStatus` as specified. |
| `G-9: APPROVE` | **G-9** | APPROVE the routine pre-migration snapshot requirement for shared-environment deployments. |
| `G-10: APPROVE` | **G-10** | APPROVE inclusion of the additive-only migration CI check in Phase 1 scope. |

All seven are recorded in `docs/saas/DECISIONS.md` v1.1 with owner, date, verbatim wording, and
a Decision Log entry.

**Not supplied, and not inferred:** D2, D4, D6, D7, D8, D9, D10, D11, D12, D13, D14, D15 — all
remain `OPEN`.

---

## 3. D1 Resolution

| Field | Content |
|---|---|
| **Status** | **RESOLVED — APPROVED** (2026-09-06) |
| **What was approved** | An Architecture Change Request under `BLUEPRINT-v1.2 §38` declaring *"PrintForge SaaS Architecture v1.0 supersedes `BLUEPRINT-v1.2` in full"*, permitting the Phase 1 tenancy models to be added to `schema.prisma`. Recorded as **`docs/saas/ACR-001-SUPERSEDE-BLUEPRINT-V1.2.md`** (status: APPROVED). |
| **Effect on the gate** | The Phase 1 **governance blocker (G-1)** is cleared. Adding the six Phase 1 models is now permitted under repository governance. |
| **What has NOT happened** | The ACR is **approved and documented**, not *implemented*. `docs/architecture/BLUEPRINT-v1.2.md` is **unchanged**. The follow-through edits — updating the `schema.prisma` header comment and `docs/architecture/ARCHITECTURE-FREEZE.md` — are the **first change of the Phase 1 PR** and have not been made. |
| **Source** | `BLUEPRINT-v1.2 §38`, §2, §15; `schema.prisma:1-5`; Master Plan §4.4-D1; `PHASE-0.5-DECISION-CLOSURE.md §6`; `DECISIONS.md` (D1); `ACR-001-SUPERSEDE-BLUEPRINT-V1.2.md`. |

---

## 4. D3 Resolution

| Field | Content |
|---|---|
| **Status** | **RESOLVED — OPTION A** (2026-09-06) |
| **What was decided** | The existing deployment/store **becomes Tenant #1** — an ordinary `Tenant` with an ordinary `Free`/`ACTIVE` subscription and a primary `Store`, carrying **no `default_tenant` name and no implicit cross-tenant privileges**. |
| **Effect on the gate** | The Phase 1 **seed / test-fixture framing blocker (G-2)** is cleared. The Phase 1 bootstrap seed frames "Tenant #1 = the existing merchant" — **dev/test only**. |
| **What D3=A does NOT do** | It does **not** resolve **D2** and makes **no** claim about whether the deployed database holds real merchant/customer data. **D2 remains `OPEN` and `REQUIRES AUTHORIZED ACCESS`**, and remains a **hard blocker for Phase 4** (the data-ownership migration). Phase 1 is **additive-only** and performs **no** production data migration. |
| **Still to be supplied** | The chosen tenant display name / slug (must **not** be `default_tenant`) — required before the **Phase 4** backfill, not before Phase 1. |
| **Source** | Master Plan §4.4-D3; `PHASE-0-REPOSITORY-INVENTORY.md §7.5/§15`; `PHASE-0.5-DECISION-CLOSURE.md §7`; `DECISIONS.md` (D3). |

---

## 5. D5 Resolution

| Field | Content |
|---|---|
| **Status** | **RESOLVED — OPTION (a)** (2026-09-06) |
| **What was decided** | Use a **separate store-scoped `Customer` entity** keyed by `(storeId, email)` with its own auth. `User` becomes **platform/merchant identity only**. |
| **Effect on the gate** | The Phase 1 **identity-design blocker (G-3)** is cleared. Phase 1 documents `User` as platform/merchant identity and `TenantMembership` as **merchant-only** (a `Customer` can never hold a membership), and its doc comments name the future storefront-identity root (`Customer`). |
| **What has NOT been decided to implement** | The **`Customer` entity is NOT implemented in Phase 1.** It is introduced in **Phase 2** (with `CustomerRefreshToken` + store-scoped auth + `customerId` columns). Phase 4 backfills `role=CUSTOMER` users → `Customer` rows and re-points six FK families; Phase 15 drops the legacy `userId` columns + `CUSTOMER` enum value. |
| **Source** | Frozen SaaS Architecture v1.0 ("customer identity is store-scoped"); Master Plan §4.4-D5; `PHASE-0-DECISION-RESOLUTION-AND-PHASE-1-SPEC.md §A.2-D5/§B.4`; `PHASE-0.5-DECISION-CLOSURE.md §8`; `DECISIONS.md` (D5). |

---

## 6. G-4 / G-5 / G-9 / G-10 Approvals

| ID | Status | What was approved | Effect on the gate | Condition carried into implementation |
|---|:-:|---|---|---|
| **G-4** | **APPROVED** (2026-09-06) | `PHASE-0-DECISION-RESOLUTION-AND-PHASE-1-SPEC.md §B.2–B.8` accepted, unchanged, as the Phase 1 contract. | The "Phase 1 spec approved" gate condition is satisfied. | Implement strictly to the spec; any deviation requires a recorded change. |
| **G-5** | **APPROVED** (2026-09-06) | `TenantStatus` {ACTIVE, SUSPENDED, PENDING_DELETION, DELETED}; `StoreStatus` {ACTIVE, DISABLED, DRAFT}; `MembershipStatus` {ACTIVE, INVITED, SUSPENDED}; `DomainVerificationStatus` {PENDING, VERIFIED, FAILED}. `TenantRole` {OWNER, ADMIN, STAFF, VIEWER} and `SubscriptionStatus` {PENDING, TRIALING, ACTIVE, PAST_DUE, PAUSED, CANCELLED, EXPIRED} confirmed **verbatim** from the frozen architecture. | The "enum sets ratified" gate condition is satisfied. | The Phase 1 migration writes exactly these `CREATE TYPE`s — no additions. |
| **G-9** | **APPROVED** (2026-09-06) | The **requirement** that a routine DB snapshot is taken and its id recorded before the Phase 1 additive migration is applied to any **shared** environment (`DEPLOYMENT.md §3`). | The "pre-migration snapshot approved" gate condition is satisfied. | **Execution-time condition:** snapshot + record its id before applying the migration to staging/production. Local-dev unaffected. **Not** the full verified restore drill (that is a Phase 4 precondition). |
| **G-10** | **APPROVED** (2026-09-06) | Inclusion of an additive-only migration CI check (no `ALTER TABLE <existing>` / no `DROP` / no `NOT NULL`-add — spec AC-10) in **Phase 1 scope**. | The "additive-only CI check approved" gate condition is satisfied. | **Built during Phase 1**, landing with the Phase 1 migration. Not a prerequisite artifact; not built by any documentation task. |

---

## 7. Remaining OPEN Decisions That Do NOT Block Phase 1

| ID | Status | Blocks | Must be resolved before |
|---|---|---|---|
| **D2** | OPEN — `REQUIRES AUTHORIZED ACCESS` | **Phase 4** (all of it) + Phase 15 | Phase 4 start. Recommended sooner to scope Phase 4. **D3=A does not resolve D2.** |
| **D4** | OPEN *(doc-level classification "both"; not owner-ratified)* | **Phase 3** | Phase 3 start. |
| **D6** | OPEN | Phase 3 | Phase 3 start. |
| **D7** | OPEN | Phase 7 / 8 | Phase 7 start. |
| **D8** | OPEN — hosting/staging/worker topology | Phase 4 (staging + restore drill), Phase 11 (worker), Phase 14 | **Provisioning should start in parallel with Phase 1** (lead time); the decision itself before Phase 4. |
| **D9** | OPEN | Phase 8 | Phase 8 start. |
| **D10** | OPEN — `REQUIRES LEGAL DECISION` | Phase 4 (W4) | Phase 4 W4. |
| **D11** | OPEN | Phase 4 (W4) | Phase 4 W4. |
| **D12** | OPEN | Phase 12 | Phase 12 start. |
| **D13** | OPEN | Phase 10 | Phase 10 start. |
| **D14** | OPEN — `REQUIRES PROVIDER DECISION` | Phase 7 | Phase 7 start. |
| **D15** | OPEN | Phase 11 (governed by D1) | Phase 11 start. |

None of the above is listed as a Phase 1 blocker by `PHASE-0-DECISION-RESOLUTION-AND-PHASE-1-SPEC.md §B.12`
(gate items G-6, G-7, G-8 are explicitly *"not required for Phase 1"*).

---

## 8. Phase 1 START GATE Matrix

| ID | Status | Owner Decision | Phase 1 Impact | Gate Result |
|---|:-:|---|---|:-:|
| **D1** | RESOLVED — APPROVED | `"D1: APPROVE"` — ACR under `BLUEPRINT-v1.2 §38` (recorded as `ACR-001`, status APPROVED) | Governance blocker for adding any Phase 1 model — **cleared** | ✅ PASS |
| **D3** | RESOLVED — OPTION A | `"D3: A"` — existing deployment becomes Tenant #1 | Seed / test-fixture framing (dev/test only) — **cleared**; Phase 4 scope still gated on D2 | ✅ PASS |
| **D5** | RESOLVED — OPTION (a) | `"D5: A"` — separate store-scoped `Customer` entity | `User` ↔ `TenantMembership` semantics fixed (`Customer` = Phase 2, not Phase 1) — **cleared** | ✅ PASS |
| **G-4** | APPROVED | `"G-4: APPROVE"` — Phase 1 spec §B.2–B.8 | Phase 1 implementation contract — **satisfied** | ✅ PASS |
| **G-5** | APPROVED | `"G-5: APPROVE"` — enum sets ratified; `TenantRole`/`SubscriptionStatus` verbatim | Phase 1 migration `CREATE TYPE`s — **fixed** | ✅ PASS |
| **G-9** | APPROVED | `"G-9: APPROVE"` — pre-migration snapshot requirement | Execution-time condition on applying the migration to shared envs — **satisfied as an approved requirement** | ✅ PASS |
| **G-10** | APPROVED | `"G-10: APPROVE"` — additive-only CI check in Phase 1 scope | Built during Phase 1, lands with the migration — **satisfied as a scope inclusion** | ✅ PASS |
| — | *(non-gating)* | D2, D4, D6, D8, D10, D11 remain OPEN | Gate Phase 3 / Phase 4 — **not Phase 1** (`§B.12` G-6/G-7/G-8) | n/a |

**BLOCKED items unresolved: 0. REQUIRES EXPLICIT APPROVAL items pending: 0.**

### Additional-blocker check (Phase 0.5 START GATE + Phase 1 spec review)

Reviewed `PHASE-0-DECISION-RESOLUTION-AND-PHASE-1-SPEC.md §B.9` (Dependencies) and §B.12
(START GATE) for any Phase 1 prerequisite that is **not** one of the seven decisions:

- §B.9 Prerequisites (1)–(6): (1) Phase 0 approved ✅; (2) D1 ACR ✅; (3) D3 resolved ✅;
  (4) D5 resolved ✅; (5) spec approved (G-4) ✅; (6) enum sets approved (G-5) ✅ — **all met.**
- §B.12 gate items G-1…G-10: G-1/G-2/G-3 resolved; G-4/G-5/G-9/G-10 approved; G-6/G-7/G-8
  explicitly *"not required for Phase 1"* — **nothing outstanding.**
- No hidden prerequisite (e.g. an implied artifact) was found. `docs/saas/DECISIONS.md` now
  holds all seven records, satisfying the "recorded in `docs/saas/DECISIONS.md`" clause.

> **No remaining Phase 1 START GATE blockers identified in the authoritative documents.**

---

## 9. Final Verdict

# PHASE 1 START GATE: **READY**

Every documented Phase 1 hard blocker (D1, D3, D5) is `RESOLVED`, and every Phase 1 explicit
approval (G-4, G-5, G-9, G-10) is `APPROVED` and recorded in `docs/saas/DECISIONS.md` (v1.1,
2026-09-06). Per `PHASE-0-DECISION-RESOLUTION-AND-PHASE-1-SPEC.md §B.12`, Phase 1 implementation
may begin.

`D2` and `D4` remain `OPEN`; per the documented gate they are **not** Phase 1 blockers (they
gate Phase 4 and Phase 3 respectively). They are **not** treated as inferred/resolved.

---

## 10. Conditions That Must Be Respected When Implementation Begins

1. **ACR-001 follow-through is the first Phase 1 PR change:** update the
   `backend/prisma/schema.prisma` header comment (lines 1–5) and
   `docs/architecture/ARCHITECTURE-FREEZE.md` to cite SaaS Architecture v1.0 +
   `PRINTFORGE-SAAS-IMPLEMENTATION-MASTER-PLAN-v1.0.md` as authoritative; retain
   `BLUEPRINT-v1.2.md` as history; link `ACR-001`.
2. **Migration boundary (`PHASE-0-DECISION-RESOLUTION-AND-PHASE-1-SPEC.md §B.8`):** the Phase 1
   migration is `CREATE TABLE` / `CREATE TYPE` / `CREATE INDEX` on the **six new models**
   (`Tenant`, `Store`, `StoreDomain`, `TenantMembership`, `Plan` shell, `Subscription` shell)
   and the **six ratified enums** ONLY.
   - **No** `tenantId` / `storeId` / `customerId` (or any scope column) on any existing table.
   - **No** change to the `Role` enum / `RolesGuard` / `@Roles()` / `JwtAuthGuard` / JWT payload.
   - **No** `Customer` table, `customerId` column, or customer-auth flow (D5-a is the direction;
     the entity is **Phase 2**).
   - **No** `User.platformRole` / `SUPER_ADMIN` (Phase 2).
   - **No** tenant-context middleware / interceptor / guard / scoped Prisma client (Phase 3).
   - **No** `PlanFeature` / `PlanLimit` / `Usage` / entitlement logic (Phase 6); **no**
     billing-provider coupling / `SubscriptionEvent` / `SaasInvoice` (Phase 7); **no**
     `StoreDomain` verification mechanism or host→store→tenant resolution (Phase 9).
   - **No** backfill of any existing row. **No** change to any existing unique constraint or
     index. **No** destructive migration. **No** modification of any existing service query or
     controller.
   - **No** production data touched.
3. **G-10:** the additive-only migration CI check (no `ALTER TABLE <existing>` / no `DROP` /
   no `NOT NULL`-add) lands **with** the Phase 1 migration.
4. **G-9:** before applying the Phase 1 migration to **staging** or **production**, take a DB
   snapshot and record its id (`DEPLOYMENT.md §3`). Not required for local dev. This is **not**
   the Phase 4 verified restore drill.
5. **Re-run the Phase 0 inventory diff** against `HEAD` at Phase 1 start (Master Plan R20) and
   refresh `docs/saas/CHANGE-MAP.md`.
6. **Seed the `Free` `Plan` row** (dev/test) so a `Tenant` is created with a `Free`/`ACTIVE`
   `Subscription` (spec AC-14); the full plan catalogue is **Phase 6**.
7. **D3-A framing:** the Phase 1 bootstrap seed frames "Tenant #1" as the existing merchant —
   **dev/test only**. Real tenant name/slug and the live `role=ADMIN` → `OWNER` assignment are
   **Phase 4** (gated on **D2** + the Phase 14 restore drill).
8. **Start D8 (staging) provisioning in parallel** — it gates Phase 4 and has lead time.
9. **`TenancyModule` / `PlansModule`** expose **no HTTP route and no guard** — services callable
   only from seeds/tests (spec AC-17).
10. **All existing tests stay green** (`npm run test`, `npm run test:e2e`, frontend
    `npm run test`); `scheduler-registration.spec.ts` still asserts exactly one
    `ScheduleModule.forRoot()` (spec AC-15).
11. **Produce `docs/saas/PHASE-1-COMPLETION-REPORT.md`** and verify spec AC-1…AC-17.
12. **Obtain D2** (authorized read-only data inventory) and **resolve D4** before their phases
    (Phase 4 and Phase 3 respectively) — not required to start Phase 1, but on the critical
    path shortly after.

---

## 11. Phase 1 Implementation Status

**Phase 1 implementation has NOT started.**

- No new model exists in `backend/prisma/schema.prisma` (still 25 models, 12 enums).
- No migration has been created (still 9 under `backend/prisma/migrations/`).
- No `TenancyModule` / `PlansModule` / tenancy source exists in `backend/src/`.
- No seed created or modified.
- `docs/architecture/BLUEPRINT-v1.2.md` has **not** been changed by this task — ACR-001 is
  approved and documented, its follow-through edits are Phase 1 PR work.
- The only changes from the task that produced this document are documentation files under
  `docs/saas/`: `DECISIONS.md` (v1.1), `PHASE-0.5-DECISION-STATUS.md` (v1.1),
  `ACR-001-SUPERSEDE-BLUEPRINT-V1.2.md` (new), `PHASE-1-START-GATE-RESULT.md` (this file, new).

---

*End of `docs/saas/PHASE-1-START-GATE-RESULT.md` v1.0. Phase 1 START GATE = READY. Phase 1
implementation has not started.*
