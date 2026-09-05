# PrintForge SaaS — Phase 0.5 Decision Status Snapshot

> Derived status snapshot. Source of truth for owner decisions is
> `docs/saas/DECISIONS.md`. This file summarizes where every decision stands and computes the
> Phase 1 START GATE using the rules already documented in
> `PHASE-0-DECISION-RESOLUTION-AND-PHASE-1-SPEC.md §B.12`.
>
> **Documentation / governance only — the only changes from the task that produced this
> version are documentation files under `docs/saas/`. Phase 1 has not started.**

| Field | Value |
|---|---|
| Document | `docs/saas/PHASE-0.5-DECISION-STATUS.md` |
| Version | 1.1 |
| Date | 2026-09-06 |
| Repository | `AtharvaVavhal/PrintForge`, `main`, HEAD `b20c849` |
| Owner decisions recorded in `DECISIONS.md` | **7** (D1, D3, D5, G-4, G-5, G-9, G-10 — all recorded 2026-09-06) |
| Phase 1 START GATE | **`READY`** |
| May Phase 1 implementation begin? | **YES** — strictly within `PHASE-0-DECISION-RESOLUTION-AND-PHASE-1-SPEC.md §B.8` and the conditions in §5 below |

---

## 1. D1–D15 Status

**Legend.** *Owner-decision status* = has a named owner recorded an explicit choice in
`docs/saas/DECISIONS.md`? *Phase 0.5 classification* = the documentation-level classification
from `PHASE-0-DECISION-RESOLUTION-AND-PHASE-1-SPEC.md §A.1` (a recommendation/category, **not**
an owner decision).

| ID | Topic | Owner | Owner-decision status | Phase 0.5 classification (documentation only) | Phase 1 blocker? | Gates phase |
|---|---|---|:-:|---|:-:|---|
| **D1** | Supersede `BLUEPRINT-v1.2` via `§38` ACR | Atharva + Harshad | **RESOLVED — APPROVED** (2026-09-06) | REQUIRES BUSINESS DECISION | ~~YES (hard)~~ **CLEARED** | 1 (cleared) + governance umbrella 2–15; re-referenced before 11 |
| **D2** | Does the deployed DB hold real production data? | Ops | **OPEN** | REQUIRES DATA ACCESS (`REQUIRES AUTHORIZED ACCESS`) | No | **4** (hard); recommended before 1 |
| **D3** | Existing deployment → Tenant #1 (A) vs not adopted (B) | Business owner | **RESOLVED — OPTION A** (2026-09-06) | REQUIRES BUSINESS DECISION | ~~YES (soft — seed framing)~~ **CLEARED** | 1 (cleared) + **4** (defining; scope still gated on D2) |
| **D4** | Isolation mechanism: app-layer / RLS / both | Architecture owner | **OPEN** *(doc-level classification "RESOLVED — both"; not owner-ratified)* | RESOLVED *(documentation-level only)* | No | **3** |
| **D5** | Customer identity: separate `Customer` (a) vs global `User` + profile (b) | Product + architecture owner | **RESOLVED — OPTION (a)** (2026-09-06) | REQUIRES BUSINESS DECISION | ~~YES (design)~~ **CLEARED** | 1 (cleared) + **2** (defining) + 4 |
| **D6** | Tenant-context derivation for merchant console | Architecture owner + product | **OPEN** | SAFE TO DEFER | No | **3** |
| **D7** | `WebhookEvent` split (one table vs two) | Architecture owner | **OPEN** | SAFE TO DEFER | No | 7 / 8 |
| **D8** | Hosting / staging / worker topology | Ops | **OPEN** | REQUIRES BUSINESS DECISION | No | **4** (indirect — staging + restore drill); provisioning should start now |
| **D9** | Merchant payment-credential storage | Architecture owner | **OPEN** | SAFE TO DEFER | No | 8 |
| **D10** | Per-tenant order/invoice numbering + statutory format | Legal + architecture owner | **OPEN** | REQUIRES LEGAL DECISION | No | **4** (W4) |
| **D11** | `AppSetting` per-key ownership classification | Architecture owner | **OPEN** | SAFE TO DEFER | No | **4** (W4) |
| **D12** | Per-tenant tax model | Product + architecture owner | **OPEN** | SAFE TO DEFER | No | 12 |
| **D13** | Object storage: `StorageProvider` interface vs S3 now | Architecture owner | **OPEN** | SAFE TO DEFER | No | 10 |
| **D14** | SaaS subscription billing provider | Business + architecture owner | **OPEN** | REQUIRES PROVIDER DECISION | No | 7 |
| **D15** | Queue technology for the worker tier | Architecture owner | **OPEN** | SAFE TO DEFER (governed by D1) | No | 11 |

**Owner decisions recorded: 3 / 15 D-items** (D1, D3, D5). **D2 and D4 remain `OPEN`** — no
owner decision has been supplied for either, and neither is a Phase 1 blocker. D4's
documentation-level "both" classification is **not** an owner ratification and is not treated as
resolved in the canonical register.

---

## 2. G-4 / G-5 / G-9 / G-10 Status

| ID | Approval | Owner | Status | Phase 1 impact | Recorded in `DECISIONS.md`? |
|---|---|---|:-:|---|:-:|
| **G-4** | Approve Phase 1 spec `§B.2–B.8` | Architecture owner | **APPROVED** (2026-09-06) | Contract for the whole Phase 1 implementation — satisfied | **Yes** |
| **G-5** | Ratify the 4 `*Status` enum sets; confirm `TenantRole` / `SubscriptionStatus` verbatim | Architecture owner | **APPROVED** (2026-09-06) | Phase 1 migration `CREATE TYPE`s fixed — satisfied | **Yes** |
| **G-9** | Pre-migration snapshot for shared-env deploys (`DEPLOYMENT.md §3`) | Ops | **APPROVED** (2026-09-06) | Requirement approved; snapshot taken at execution time before applying to staging/production | **Yes** |
| **G-10** | Additive-only migration CI check in Phase 1 scope | Architecture owner | **APPROVED** (2026-09-06) | In Phase 1 scope; built during Phase 1, lands with the migration | **Yes** |

**Approvals recorded: 4 / 4.**

*(Gate items G-1 / G-2 / G-3 from `PHASE-0-DECISION-RESOLUTION-AND-PHASE-1-SPEC.md §B.12` are
the same as decisions D1 / D3 / D5 respectively — all RESOLVED, see §1.)*

---

## 3. Current Phase 1 START GATE

**Rule** (`PHASE-0-DECISION-RESOLUTION-AND-PHASE-1-SPEC.md §B.12`):
> *"Phase 1 implementation cannot begin until every **BLOCKED** item is resolved and every
> **REQUIRES EXPLICIT APPROVAL** item is explicitly approved and recorded in
> `docs/saas/DECISIONS.md`."*

| Gate item | Maps to | Required state | Actual state (2026-09-06) | Met? |
|---|---|---|---|:-:|
| G-1 | D1 | RESOLVED (ACR approved) | **RESOLVED — APPROVED**; `ACR-001` documented | ✅ |
| G-2 | D3 | RESOLVED (A or B chosen) | **RESOLVED — OPTION A** | ✅ |
| G-3 | D5 | RESOLVED (a or b chosen) | **RESOLVED — OPTION (a)** | ✅ |
| G-4 | — | APPROVED & recorded | **APPROVED & recorded** | ✅ |
| G-5 | — | APPROVED & recorded | **APPROVED & recorded** | ✅ |
| G-9 | — | APPROVED & recorded | **APPROVED & recorded** (execution-time condition noted) | ✅ |
| G-10 | — | APPROVED & recorded | **APPROVED & recorded** (built during Phase 1) | ✅ |
| G-6 | D2 | *not required for Phase 1* (recommended; hard blocker for Phase 4) | OPEN | n/a for Phase 1 |
| G-7 | D4 | *not required for Phase 1* (gates Phase 3) | OPEN (doc-level "both") | n/a for Phase 1 |
| G-8 | D6/D8/D10/D11 | *not required for Phase 1* (gate Phase 3/4) | OPEN | n/a for Phase 1 |

### Computed START GATE status

```
BLOCKED items unresolved ........... 0   (D1, D3, D5 all RESOLVED)
REQUIRES EXPLICIT APPROVAL pending . 0   (G-4, G-5, G-9, G-10 all APPROVED & recorded)
Non-Phase-1 items (not gating) ..... D2, D4, D6, D8, D10, D11 (OPEN — gate Phase 3/4, not 1)
───────────────────────────────────────
PHASE 1 START GATE = READY
```

Per the documented rule, **every BLOCKED item is resolved and every REQUIRES EXPLICIT APPROVAL
item is approved and recorded in `docs/saas/DECISIONS.md`** → the gate is `READY`.

---

## 4. Exact Unresolved Blockers

**Phase 1 START GATE blockers remaining: NONE.**

> No remaining Phase 1 START GATE blockers identified in the authoritative documents.

**OPEN decisions that do NOT block Phase 1** (tracked; must be resolved before their own
phases):

| ID | Status | Blocks | Latest safe point |
|---|---|---|---|
| **D2** | OPEN — `REQUIRES AUTHORIZED ACCESS` | **Phase 4** (all of it) + Phase 15 | Before Phase 4 begins. Recommended sooner to scope Phase 4. D3=A does **not** resolve D2. |
| **D4** | OPEN (doc-level "both") | **Phase 3** | Before Phase 3 begins. |
| **D6** | OPEN | Phase 3 | Before Phase 3. |
| **D8** | OPEN | Phase 4 (staging + restore drill) | Provisioning has lead time — **start in parallel with Phase 1**. |
| **D10** | OPEN — `REQUIRES LEGAL DECISION` | Phase 4 (W4) | Before Phase 4 W4. |
| **D11** | OPEN | Phase 4 (W4) | Before Phase 4 W4. |
| **D7, D9, D12, D13, D14, D15** | OPEN | Phases 7–12 | Before their respective phases. |

---

## 5. Whether Phase 1 May Begin

**YES. Phase 1 implementation may begin.**

- The Phase 1 START GATE is **`READY`**.
- All 3 BLOCKED decisions (**D1, D3, D5**) are `RESOLVED`, and all 4 required approvals
  (**G-4, G-5, G-9, G-10**) are `APPROVED` and recorded in `docs/saas/DECISIONS.md` (2026-09-06).
- **D2 and D4 are OPEN but are not Phase 1 blockers** (they gate Phase 4 and Phase 3
  respectively — `PHASE-0-DECISION-RESOLUTION-AND-PHASE-1-SPEC.md §B.12` G-6/G-7).

### Conditions that must be respected once Phase 1 implementation begins

1. **First change of the Phase 1 PR = the D1 / ACR-001 follow-through:** update the
   `backend/prisma/schema.prisma` header comment and `docs/architecture/ARCHITECTURE-FREEZE.md`
   to cite SaaS Architecture v1.0 + the Master Plan as authoritative (ACR-001 post-approval
   actions). `BLUEPRINT-v1.2.md` is retained as history.
2. **Stay strictly within the Phase 1 migration boundary** (`PHASE-0-DECISION-RESOLUTION-AND-PHASE-1-SPEC.md §B.8`):
   `CREATE TABLE` / `CREATE TYPE` / `CREATE INDEX` on the **six new models + six ratified
   enums** only. **No** `tenantId`/`storeId`/`customerId` on any existing table; **no** change
   to `Role` / `RolesGuard` / `@Roles()` / JWT payload; **no** `Customer` table or `customerId`
   (D5-a is the direction, but the `Customer` entity is **Phase 2**); **no** guard/interceptor/
   scoped Prisma client; **no** backfill; **no** destructive migration.
3. **G-10:** the additive-only migration CI check lands **with** the Phase 1 migration
   (no `ALTER TABLE <existing>` / no `DROP` / no `NOT NULL`-add — spec AC-10).
4. **G-9:** before applying the Phase 1 migration to **staging** or **production**, take a
   database snapshot and record its id (`DEPLOYMENT.md §3`). Local-dev is unaffected. This is
   **not** the full verified restore drill (that remains a Phase 4 precondition).
5. **Re-run the Phase 0 inventory diff** against `HEAD` at Phase 1 start (Master Plan risk R20 —
   the repo is under active development) and refresh `docs/saas/CHANGE-MAP.md`.
6. **Seed the `Free` `Plan` row** (dev/test) so a `Tenant` can be created with a `Free`/`ACTIVE`
   `Subscription` (spec AC-14); the full plan catalogue + features/limits is **Phase 6**.
7. **D3-A framing:** the Phase 1 bootstrap seed frames "Tenant #1" as the existing merchant —
   **dev/test only**. No production data is touched in Phase 1. The real tenant display
   name/slug and the live `role=ADMIN` → `OWNER` assignment are Phase 4 (gated on D2).
8. **Start D8 (staging) provisioning in parallel** — it gates Phase 4, and has lead time.
9. **Produce `docs/saas/PHASE-1-COMPLETION-REPORT.md`** and re-verify spec AC-1…AC-17.

---

## Phase 1 Implementation Status

**NOT STARTED.**

- `backend/prisma/schema.prisma` — unchanged (25 models, 12 enums).
- `backend/prisma/migrations/` — unchanged (9 migrations).
- `backend/src/` — no tenancy source; unchanged.
- `frontend/src/` — unchanged by this task.
- No seed created or modified.
- `docs/architecture/BLUEPRINT-v1.2.md` — **not changed by this task** (ACR-001 approved but its
  follow-through edits are Phase 1 PR work).
- Files created/updated by this task: `docs/saas/DECISIONS.md` (v1.1),
  `docs/saas/PHASE-0.5-DECISION-STATUS.md` (v1.1), `docs/saas/ACR-001-SUPERSEDE-BLUEPRINT-V1.2.md`
  (new), `docs/saas/PHASE-1-START-GATE-RESULT.md` (new). Documentation only.

---

*End of `docs/saas/PHASE-0.5-DECISION-STATUS.md` v1.1.*
