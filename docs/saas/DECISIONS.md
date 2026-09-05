# PrintForge SaaS — Canonical Decision Register

> **Purpose.** This is the single authoritative record of SaaS-conversion decisions and
> approvals. A decision is `RESOLVED` / `APPROVED` **only** when an explicit choice has been
> supplied by the named owner and recorded here with a date. Until then it is `OPEN`.
>
> **Rules for this file.**
> - Never infer an approval. Never convert a recommendation into an approval.
> - Never mark an item `RESOLVED` / `APPROVED` without an explicit owner decision recorded here.
> - Recommendations from the Master Plan / Phase 0 / Phase 0.5 documents are **not** decisions.
> - Editing this file does not change any frozen document, schema, migration, or source code.

---

## Document Control

| Field | Value |
|---|---|
| Document | PrintForge SaaS — Canonical Decision Register (`docs/saas/DECISIONS.md`) |
| Version | 1.1 |
| Created | 2026-09-06 |
| Last updated | 2026-09-06 — recorded explicit owner decisions for D1, D3, D5, G-4, G-5, G-9, G-10 |
| Repository | `AtharvaVavhal/PrintForge`, branch `main`, HEAD `b20c849` |
| Records held | 7 — D1, D3, D5, G-4, G-5, G-9, G-10 |
| Records `RESOLVED` / `APPROVED` | **7** (D1, D3, D5, G-4, G-5, G-9, G-10) |
| Records `OPEN` | **0** (of the 7 tracked here) |
| Owner decisions supplied to date | **7** — recorded 2026-09-06 (see each Decision Log below) |
| Companion | `docs/saas/PHASE-0.5-DECISION-STATUS.md` (derived status snapshot); `docs/saas/PHASE-1-START-GATE-RESULT.md` (gate verdict); `docs/saas/ACR-001-SUPERSEDE-BLUEPRINT-V1.2.md` (the D1 ACR artifact) |

**Status vocabulary:** `OPEN` (no owner decision yet) · `RESOLVED` (decision made — for D-items)
· `APPROVED` / `REJECTED` (for G-items) · `DEFERRED` (owner explicitly postponed to a later phase).

---

## How to record a decision

When a project owner makes a choice, append to that record's **Decision Log** table a row with:
`Date | Owner | Choice | Approval wording (verbatim) | Reference (ACR link / PR / meeting note)`,
then update the record's **Status**, **Owner**, **Date**, and **Rationale** fields and the
counts in Document Control. Do not overwrite history — append.

---

# Decision Records

---

## D1 — `BLUEPRINT-v1.2` governance / ACR

| Field | Content |
|---|---|
| **ID** | D1 |
| **Decision (question)** | Raise and sign one Architecture Change Request declaring **"PrintForge SaaS Architecture v1.0 supersedes `docs/architecture/BLUEPRINT-v1.2.md` in full"**, thereby permitting SaaS models to be added to `schema.prisma` and sanctioning the SaaS async/worker tier. |
| **Owner** | Atharva + Harshad (joint review, per `BLUEPRINT-v1.2 §38`) |
| **Date** | 2026-09-06 |
| **Status** | **RESOLVED — APPROVED** |
| **Decision (approved option)** | **APPROVE the ACR** under `BLUEPRINT-v1.2 §38` permitting the Phase 1 tenancy models (and, as the governance umbrella, the full SaaS conversion). Recorded as `docs/saas/ACR-001-SUPERSEDE-BLUEPRINT-V1.2.md`. |
| **Rationale** | The approved PrintForge SaaS Architecture v1.0 and the approved Master Plan require multi-tenant foundational models that `BLUEPRINT-v1.2 §15` does not contain, and `§38` + `schema.prisma:4-5` make any such schema addition conditional on a signed ACR. The owner has explicitly approved raising that ACR (Master Plan §4.4-D1 path; content drafted in `PHASE-0.5-DECISION-CLOSURE.md §6.4`). This resolves the Phase 1 governance blocker. **The ACR is APPROVED and documented; its follow-through actions (updating the `schema.prisma` header comment and `ARCHITECTURE-FREEZE.md`) are performed in the Phase 1 PR and have NOT yet been done.** |
| **Source document / section** | `BLUEPRINT-v1.2.md §38` (Architecture Change Procedure), §2 (prohibited technology), §15 (Complete Schema); `backend/prisma/schema.prisma` lines 4–5; Master Plan `§4.4-D1`; `PHASE-0-REPOSITORY-INVENTORY.md §19` (D1); `PHASE-0-DECISION-RESOLUTION-AND-PHASE-1-SPEC.md §A.1-D1`, §B.12 (G-1); `PHASE-0.5-DECISION-CLOSURE.md §5 (D1)`, §6; `docs/saas/ACR-001-SUPERSEDE-BLUEPRINT-V1.2.md`. |
| **Consequences** | The Phase 1 governance blocker is cleared. One governance action covers Phases 1–15. In the Phase 1 PR: the `schema.prisma` header comment and `docs/architecture/ARCHITECTURE-FREEZE.md` are updated to cite SaaS Architecture v1.0 + the Master Plan as authoritative; `BLUEPRINT-v1.2` is retained as a historical document. The schema is permitted to grow from 25 → ~50 models across the programme (Phase 1: +6). No prohibited technology (§2) is introduced by Phase 1; the eventual queue tier is planned as a Postgres-backed queue (Master Plan §4.4-D15) and, if a broker is ever proposed, needs its own ACR at that time. |
| **Affected phase(s)** | **Phase 1 (blocker — now cleared)** and, as a governance umbrella, Phases 2–15. Re-referenced before Phase 11 (async/worker tier) per Master Plan §4.4-D1. |
| **Reversibility** | The ACR is a governance record — reversible only by a further ACR; in practice not reverted. |
| **Explicit approval wording (recorded)** | `"D1: APPROVE — APPROVE the required ACR under BLUEPRINT-v1.2 §38 to permit the Phase 1 tenancy models."` (project owner, 2026-09-06). |
| **Not to be implemented until this record is `APPROVED`** | ~~Any `schema.prisma` model addition; any migration; `TenancyModule`/`PlansModule`; any edit to the `schema.prisma` header comment or `ARCHITECTURE-FREEZE.md`.~~ **CLEARED 2026-09-06.** Those actions are now permitted **within Phase 1 scope** (`PHASE-0-DECISION-RESOLUTION-AND-PHASE-1-SPEC.md §B.8`), subject to the other Phase 1 conditions (G-9 snapshot, G-10 CI check). The `schema.prisma` header + `ARCHITECTURE-FREEZE.md` update is the **first** Phase 1 PR change. |

### D1 — Decision Log

| Date | Owner | Choice | Approval wording (verbatim) | Reference |
|---|---|---|---|---|
| 2026-09-06 | Atharva + Harshad (project owner) | **APPROVE the ACR** | `"D1: APPROVE"` → *"APPROVE the required ACR under BLUEPRINT-v1.2 §38 to permit the Phase 1 tenancy models."* | `docs/saas/ACR-001-SUPERSEDE-BLUEPRINT-V1.2.md` |

---

## D3 — Existing deployment/store → Tenant #1, or not adopted

| Field | Content |
|---|---|
| **ID** | D3 |
| **Decision (question)** | Does the existing deployed catalog + `role=ADMIN` user + `AppSetting` rows become the platform's first real merchant — modelled as an ordinary, explicitly-named `Tenant` with **no** implicit privileges (**Option A**) — or is the current deployment treated as disposable dev/demo scaffolding, with tenants created empty from Phase 5 onward (**Option B**)? |
| **Owner** | Business owner |
| **Date** | 2026-09-06 |
| **Status** | **RESOLVED — OPTION A** |
| **Decision (approved option)** | **Option A** — the existing deployment/store **becomes Tenant #1**: an ordinary `Tenant` with an ordinary `Free`/`ACTIVE` subscription and a primary `Store`, carrying **no `default_tenant` name and no implicit cross-tenant privileges**. |
| **Rationale** | The owner has explicitly chosen Option A. It keeps the existing e2e coverage meaningful (Master Plan §4.4-D3 rationale) and gives Phase 4's data-ownership migration a concrete backfill target. **This decision does not depend on, and does not resolve, D2** — see the Dependency row. |
| **Source document / section** | Master Plan `§4.4-D3`; `PHASE-0-REPOSITORY-INVENTORY.md §7.5`, §15.3, §15.4; `PHASE-0-DECISION-RESOLUTION-AND-PHASE-1-SPEC.md §A.1-D3`, §B.12 (G-2); `PHASE-0.5-DECISION-CLOSURE.md §5 (D3)`, §7. |
| **Consequences** | **Phase 1:** the bootstrap seed / test fixture is framed as "Tenant #1 = the existing merchant" (dev/test only; no production data touched). **Phase 4:** existing catalog / orders / invoices / payments / settings are backfilled to Tenant #1 with verified restore, maintenance window, and pre/post revenue-sum + count reconciliation (Master Plan §25 waves W3–W7). **Phase 2:** the existing `role=ADMIN` user is migrated to an `OWNER` `TenantMembership` of Tenant #1 (from the D2 live inventory, not before). The chosen tenant display name / slug is to be supplied by the business (see Decision Log "name/slug" note) and is not `default_tenant`. |
| **Affected phase(s)** | Phase 1 (seed framing — now decided), **Phase 4 (defining)**, Phase 15 (production-migration validation); Phase 2 (`role=ADMIN` → `OWNER` backfill). |
| **Reversibility** | The *direction* is reversible on paper until Phase 4 executes. After Phase 4 backfills legacy rows and runs the destructive constraint waves, reverting requires a restore from backup (Prisma forward-only). |
| **Dependency (still open)** | **D2 remains unresolved.** Option A is now the chosen direction, but the *scope and rigor* of the Phase 4 migration still depend on D2 ("does the deployed DB hold real merchant/customer data?"), which **requires authorized data access** and is a **hard blocker for Phase 4** (not Phase 1). Recording D3=A does **not** imply any statement about the deployed data. |
| **Explicit approval wording (recorded)** | `"D3: A — The existing deployment/store becomes Tenant #1."` (project owner, 2026-09-06). |
| **Not to be implemented until this record is `RESOLVED`** | ~~The Phase 1 bootstrap seed's framing; any Phase 4 backfill; any assignment of a live `role=ADMIN` user to an `OWNER` membership.~~ **The seed framing is now decided (Phase 1, dev/test only).** Phase 4 backfill and any live `role=ADMIN` → `OWNER` assignment remain gated on D2 + the Phase 14 restore drill (Phase 4 preconditions). |

### D3 — Decision Log

| Date | Owner | Choice (A / B) | Approval wording (verbatim) | Reference |
|---|---|---|---|---|
| 2026-09-06 | Business owner (project owner) | **A** — existing deployment becomes Tenant #1 | `"D3: A"` → *"The existing deployment/store becomes Tenant #1."* | Phase 1 spec §B.3; Master Plan §4.4-D3. Tenant display name / slug: **to be supplied by the business before the Phase 4 backfill** (must not be `default_tenant`). |

---

## D5 — Customer identity model

| Field | Content |
|---|---|
| **ID** | D5 |
| **Decision (question)** | The frozen architecture states *"customer identity is store-scoped."* Adopt **(a)** a separate `Customer` entity keyed by `(storeId, email)` with its own auth — leaving `User` as platform/merchant identity only — or **(b)** a single global `User` with a per-store `Customer` profile/link record? |
| **Owner** | Product owner + architecture owner |
| **Date** | 2026-09-06 |
| **Status** | **RESOLVED — OPTION (a)** |
| **Decision (approved option)** | **Option (a)** — a **separate store-scoped `Customer` entity** keyed by `(storeId, email)` with its own auth; `User` becomes platform/merchant identity only. |
| **Rationale** | The owner has explicitly chosen Option (a), which follows directly from the frozen PrintForge SaaS Architecture v1.0 ("customer identity is store-scoped") and Master Plan §4.4-D5. This fixes the identity direction so Phase 1 models `User` as *platform/merchant identity* and `TenantMembership` as *merchant-only* (a `Customer` can never hold a membership). **The `Customer` entity is NOT implemented in Phase 1** — it is introduced in Phase 2. |
| **Source document / section** | Frozen PrintForge SaaS Architecture v1.0 (customer identity store-scoped); Master Plan `§4.4-D5`; `PHASE-0-REPOSITORY-INVENTORY.md §7.4` (`User` REQUIRES REVIEW); `PHASE-0-DECISION-RESOLUTION-AND-PHASE-1-SPEC.md §A.2-D5`, §B.4, §B.6, §B.12 (G-3); `PHASE-0.5-DECISION-CLOSURE.md §5 (D5)`, §8. |
| **Consequences** | **Phase 1:** `User` is documented as platform/merchant identity only; `TenantMembership` as merchant-only; the Phase 1 doc comments name the future storefront-identity root (`Customer`) without creating it. **Phase 2:** adds `Customer` (`(storeId, email)` unique) + `CustomerRefreshToken` + a store-scoped customer auth flow + separate token audiences; adds `customerId` (nullable) alongside every `userId` on tenant-owned tables. **Phase 4:** re-points six FK families (`orders`, `carts`, `reviews`, `coupon_usages`, `idempotency_keys`, `uploaded_files`) from `userId` to `customerId`; backfills `role=CUSTOMER` users → `Customer` rows under Tenant #1's primary store; count reconciliation. **Phase 15:** drops the legacy `userId` columns and the `CUSTOMER` enum value (wave W9). **Phase 12:** storefront auth is store-contextual. |
| **Affected phase(s)** | Phase 1 (design — now decided), **Phase 2 (defining)**, **Phase 4 (large)**, Phase 12 (storefront auth), Phase 15 (legacy removal). |
| **Reversibility** | Direction is reversible until Phase 2 adds `Customer` + `customerId`. After that and the Phase 4 backfill, reverting = schema surgery + restore. |
| **Explicit approval wording (recorded)** | `"D5: A — Use a separate store-scoped Customer entity."` (project owner, 2026-09-06). |
| **Not to be implemented until this record is `RESOLVED`** | ~~Any `Customer` table; any `customerId` column; any customer-auth flow; the Phase 1 doc comments that name the future storefront-identity root.~~ **The identity direction is now decided.** The Phase 1 **doc comments** naming the future `Customer` root are now correct to write. The **`Customer` table, `customerId` columns, and customer-auth flow remain Phase 2** — NOT to be implemented in Phase 1. |

### D5 — Decision Log

| Date | Owner | Choice (a / b) | Approval wording (verbatim) | Reference |
|---|---|---|---|---|
| 2026-09-06 | Product + architecture owner (project owner) | **(a)** — separate store-scoped `Customer` entity | `"D5: A"` → *"Use a separate store-scoped Customer entity."* | Phase 1 spec §B.4, §B.6; Master Plan §4.4-D5; frozen architecture ("customer identity is store-scoped"). |

---

## G-4 — Phase 1 specification approval

| Field | Content |
|---|---|
| **ID** | G-4 |
| **Decision (question)** | Does the architecture owner approve `PHASE-0-DECISION-RESOLUTION-AND-PHASE-1-SPEC.md` **§B.2–B.8** (Tenant / Store / TenantMembership / Roles / Platform-vs-Tenant-vs-Store ownership / conceptual data model / migration boundary) as the contract for Phase 1 implementation? |
| **Owner** | Architecture owner |
| **Date** | 2026-09-06 |
| **Status** | **APPROVED** |
| **Decision (approved option)** | **APPROVE** — `PHASE-0-DECISION-RESOLUTION-AND-PHASE-1-SPEC.md §B.2–B.8` is accepted, unchanged, as the Phase 1 contract. |
| **Rationale** | The owner has explicitly approved the spec. It is a faithful decomposition of Master Plan §7 (Phase 1): the six named models only, additive-only, non-enforcing, one-primary-store-per-tenant, roles on `TenantMembership`, `SUPER_ADMIN` deferred to Phase 2. |
| **Source document / section** | `PHASE-0-DECISION-RESOLUTION-AND-PHASE-1-SPEC.md §B.2–B.8`, §B.12 (G-4); Master Plan §7 (Phase 1 scope); `PHASE-0.5-DECISION-CLOSURE.md §9`. |
| **Consequences** | Phase 1 has an agreed contract. Combined with D1/D3/D5 resolution and G-5/G-9/G-10, the Phase 1 START GATE conditions are met. |
| **Affected phase(s)** | Phase 1 directly; the foundational models are consumed by Phases 2–9. |
| **Reversibility** | The spec can be re-versioned before or during implementation via a recorded change. |
| **Explicit approval wording (recorded)** | `"G-4: APPROVE — APPROVE the Phase 1 specification."` (project owner, 2026-09-06). |
| **Not to be implemented until this record is `APPROVED`** | ~~Any Phase 1 model, migration, module, or seed.~~ **CLEARED 2026-09-06** — Phase 1 implementation is contractually authorized, subject to the other START-GATE conditions and the §B.8 migration boundary. |

### G-4 — Decision Log

| Date | Owner | Choice | Approval wording (verbatim) | Reference |
|---|---|---|---|---|
| 2026-09-06 | Architecture owner (project owner) | **APPROVE** | `"G-4: APPROVE"` → *"APPROVE the Phase 1 specification."* | `PHASE-0-DECISION-RESOLUTION-AND-PHASE-1-SPEC.md §B.2–B.8` |

---

## G-5 — Enum-set approval

| Field | Content |
|---|---|
| **ID** | G-5 |
| **Decision (question)** | Does the architecture owner ratify the four proposed `*Status` enum value sets for the new models, and confirm the two frozen enums are used verbatim? |
| **Owner** | Architecture owner |
| **Date** | 2026-09-06 |
| **Status** | **APPROVED** |
| **Decision (approved option)** | **APPROVE as proposed.** Ratified: `TenantStatus` = {ACTIVE, SUSPENDED, PENDING_DELETION, DELETED}; `StoreStatus` = {ACTIVE, DISABLED, DRAFT}; `MembershipStatus` = {ACTIVE, INVITED, SUSPENDED}; `DomainVerificationStatus` = {PENDING, VERIFIED, FAILED}. Confirmed verbatim from the frozen architecture: `TenantRole` = {OWNER, ADMIN, STAFF, VIEWER}; `SubscriptionStatus` = {PENDING, TRIALING, ACTIVE, PAST_DUE, PAUSED, CANCELLED, EXPIRED} (7 states, no additions). |
| **Rationale** | The owner has explicitly approved the proposed sets. The four `*Status` sets map cleanly to frozen §7/§12/§18; the two role/subscription enums are non-negotiable and are confirmed used verbatim. |
| **Source document / section** | `PHASE-0-DECISION-RESOLUTION-AND-PHASE-1-SPEC.md §B.6`, §B.12 (G-5); Master Plan §7 (*"REQUIRES DECISION-minor"*); frozen architecture §7, §12, §18; `PHASE-0.5-DECISION-CLOSURE.md §10`. |
| **Consequences** | The Phase 1 migration writes exactly these `CREATE TYPE`s. Adding an enum value later remains a forward migration if ever needed; renaming/removal after data exists is avoided by this pre-migration ratification. |
| **Affected phase(s)** | Phase 1 (`CREATE TYPE`s); `TenantStatus`/`StoreStatus`/`SubscriptionStatus` read by Phase 5 control planes and Phase 7 billing; `DomainVerificationStatus` by Phase 9. |
| **Reversibility** | Enum additions later are possible; renames/removals after data exists are not clean — hence the gate is satisfied pre-migration. |
| **Explicit approval wording (recorded)** | `"G-5: APPROVE — APPROVE the proposed lifecycle/status enum sets and ratify TenantRole and SubscriptionStatus as specified."` (project owner, 2026-09-06). |
| **Not to be implemented until this record is `APPROVED`** | ~~The `CREATE TYPE` statements in the Phase 1 migration.~~ **CLEARED 2026-09-06** — the six enum value sets are ratified for the Phase 1 migration. |

### G-5 — Decision Log

| Date | Owner | Choice | Approval wording (verbatim) | Reference |
|---|---|---|---|---|
| 2026-09-06 | Architecture owner (project owner) | **APPROVE AS PROPOSED** | `"G-5: APPROVE"` → *"APPROVE the proposed lifecycle/status enum sets and ratify TenantRole and SubscriptionStatus as specified."* | `PHASE-0-DECISION-RESOLUTION-AND-PHASE-1-SPEC.md §B.6` |

---

## G-9 — Pre-migration snapshot approval

| Field | Content |
|---|---|
| **ID** | G-9 |
| **Decision (question)** | Does ops approve that a routine database backup / snapshot is taken and its identifier recorded **immediately before** the Phase 1 additive migration is applied to any shared environment (staging, then production), per `DEPLOYMENT.md §3`? |
| **Owner** | Ops |
| **Date** | 2026-09-06 |
| **Status** | **APPROVED** |
| **Decision (approved option)** | **APPROVE** the routine pre-migration snapshot requirement for shared-environment deployments. |
| **Rationale** | The owner has explicitly approved the requirement. It is standard `DEPLOYMENT.md §3` practice and a recorded restore point even for an additive, compensating-reversible migration. **This is NOT the full verified restore drill** — that remains a hard precondition for **Phase 4** (destructive constraint waves), not Phase 1. |
| **Source document / section** | `docs/ops/DEPLOYMENT.md §3`, §11 (Prisma forward-only); `docs/ops/BACKUP-RESTORE.md` ("DOCUMENTED — NOT VERIFIED"); Master Plan Principle #5 (verified restore only before *destructive* migrations); `PHASE-0-DECISION-RESOLUTION-AND-PHASE-1-SPEC.md §B.12 (G-9)`; `PHASE-0.5-DECISION-CLOSURE.md §11`. |
| **Consequences** | The Phase 1 additive migration will be applied to shared environments only with a recorded snapshot id. Local-dev application is unaffected. The requirement is an **execution-time condition** — it does not gate the *start* of Phase 1 coding, but it gates *deploying* the migration to staging/production. |
| **Affected phase(s)** | Phase 1 execution (applying the migration). The verified restore drill is separately gated before Phase 4. |
| **Reversibility** | N/A (safety step). |
| **Currently verified** | Render managed PostgreSQL backups exist; `pg_dump` path documented; the Phase 1 migration is compensating-reversible (`DROP TABLE` while unreferenced). |
| **Currently NOT verified** | Any actual restore; Render backup cadence / retention / PITR; RTO. (Unchanged — G-9 approval does not verify these.) |
| **Explicit approval wording (recorded)** | `"G-9: APPROVE — APPROVE the routine pre-migration snapshot requirement for shared-environment deployments."` (project owner, 2026-09-06). |
| **Not to be implemented until this record is `APPROVED`** | ~~Applying the Phase 1 migration to staging or production.~~ **Requirement APPROVED 2026-09-06.** Applying the Phase 1 migration to a shared environment is now permitted **provided** a snapshot is taken and its id recorded first, per `DEPLOYMENT.md §3`. |

### G-9 — Decision Log

| Date | Owner | Choice (APPROVE / REJECT) | Approval wording (verbatim) | Reference |
|---|---|---|---|---|
| 2026-09-06 | Ops (project owner) | **APPROVE** | `"G-9: APPROVE"` → *"APPROVE the routine pre-migration snapshot requirement for shared-environment deployments."* | `DEPLOYMENT.md §3` |

---

## G-10 — Additive-only migration CI check approval

| Field | Content |
|---|---|
| **ID** | G-10 |
| **Decision (question)** | Does the architecture owner approve adding a CI gate — **as part of the Phase 1 work** — that asserts the Phase 1 migration `.sql` contains no `ALTER TABLE` on an existing table, no `DROP`, and no `NOT NULL`-add (spec acceptance criterion AC-10)? |
| **Owner** | Architecture owner |
| **Date** | 2026-09-06 |
| **Status** | **APPROVED** |
| **Decision (approved option)** | **APPROVE** inclusion of the additive-only migration CI check in Phase 1 scope. |
| **Rationale** | The owner has explicitly approved the scope inclusion. The check makes spec AC-10 machine-enforced and mitigates Phase 1 risk P1-R6 (scope creep). **It is built during Phase 1** (landing with the Phase 1 migration) — it is not a prerequisite artifact and is not built by any documentation task. |
| **Source document / section** | `PHASE-0-DECISION-RESOLUTION-AND-PHASE-1-SPEC.md §B.12 (G-10)`, AC-10, risk P1-R6, §B.8 (migration boundary); `PHASE-0.5-DECISION-CLOSURE.md §12`. |
| **Consequences** | The additive-only boundary is machine-enforced from Phase 1 onward, and also guards Phase 4 expand steps and Phase 10 additions. |
| **Affected phase(s)** | Phase 1 (scope); beneficially guards every later additive wave. |
| **Reversibility** | Yes — a CI check can be removed or relaxed later via a recorded change. |
| **Explicit approval wording (recorded)** | `"G-10: APPROVE — APPROVE inclusion of the additive-only migration CI check in Phase 1 scope."` (project owner, 2026-09-06). |
| **Not to be implemented until this record is `APPROVED`** | ~~The CI check itself (and, more broadly, any Phase 1 code).~~ **CLEARED 2026-09-06** — the CI check is in Phase 1 scope and is built during Phase 1, landing with the Phase 1 migration. |

### G-10 — Decision Log

| Date | Owner | Choice (APPROVE / REJECT) | Approval wording (verbatim) | Reference |
|---|---|---|---|---|
| 2026-09-06 | Architecture owner (project owner) | **APPROVE** | `"G-10: APPROVE"` → *"APPROVE inclusion of the additive-only migration CI check in Phase 1 scope."* | `PHASE-0-DECISION-RESOLUTION-AND-PHASE-1-SPEC.md §B.12 (G-10)`, AC-10 |

---

## Summary Table

| ID | Topic | Owner | Status | Blocks |
|---|---|---|:-:|---|
| **D1** | Supersede `BLUEPRINT-v1.2` via `§38` ACR | Atharva + Harshad | **RESOLVED — APPROVED** | ~~Phase 1~~ *(cleared)* + governance umbrella Phases 2–15 |
| **D3** | Existing deployment → Tenant #1 (A) vs not adopted (B) | Business owner | **RESOLVED — OPTION A** | ~~Phase 1 seed framing~~ *(cleared)* + **Phase 4 (defining; also gated on D2)** |
| **D5** | Customer identity: separate `Customer` (a) vs global `User` + profile (b) | Product + architecture owner | **RESOLVED — OPTION (a)** | ~~Phase 1 design~~ *(cleared)* + **Phase 2 (defining)** + Phase 4 |
| **G-4** | Approve Phase 1 spec §B.2–B.8 | Architecture owner | **APPROVED** | ~~Phase 1~~ *(cleared)* |
| **G-5** | Ratify enum value sets | Architecture owner | **APPROVED** | ~~Phase 1 migration `CREATE TYPE`s~~ *(cleared)* |
| **G-9** | Pre-migration snapshot for shared-env deploys | Ops | **APPROVED** | Applying the Phase 1 migration to staging/production (execution-time condition) |
| **G-10** | Additive-only migration CI check in Phase 1 scope | Architecture owner | **APPROVED** | (scope inclusion; enforces spec AC-10; built during Phase 1) |

**7 of 7 records tracked here are `RESOLVED` / `APPROVED` (recorded 2026-09-06).**

---

## Decisions from earlier documents NOT recorded here as resolved (and why)

Tracked in `PHASE-0-DECISION-RESOLUTION-AND-PHASE-1-SPEC.md §A.1`; **no owner decision has been
supplied** for any of them, so they remain `OPEN` (this task recorded only the seven items it
was given):

| ID | Topic | Status | Note |
|---|---|:-:|---|
| **D2** | Does the deployed DB hold real production data? | **OPEN** | `REQUIRES DATA ACCESS` / `REQUIRES AUTHORIZED ACCESS`. **Not a Phase 1 blocker.** **Hard blocker for Phase 4.** No D2 answer has been supplied; none is invented here. D3=A does not resolve D2. |
| **D4** | Isolation mechanism (app-layer / RLS / both) | **OPEN** | Phase 0.5 §A.1-D4 carries a documentation-level classification of "RESOLVED (both)", but **no owner has ratified it**, so it is `OPEN` in this canonical register. Not a Phase 1 blocker (gates Phase 3). Not inferred as approved. |
| **D6** | Tenant-context derivation for merchant console | **OPEN** | Gates Phase 3. |
| **D7** | `WebhookEvent` split | **OPEN** | Gates Phase 7/8. |
| **D8** | Hosting / staging / worker topology | **OPEN** | Gates Phase 4 (staging + restore drill). Provisioning should start in parallel — lead time. |
| **D9** | Merchant payment-credential storage | **OPEN** | Gates Phase 8. |
| **D10** | Per-tenant order/invoice numbering + statutory format | **OPEN** | `REQUIRES LEGAL DECISION`. Gates Phase 4 (W4). |
| **D11** | `AppSetting` per-key ownership classification | **OPEN** | Gates Phase 4 (W4). |
| **D12** | Per-tenant tax model | **OPEN** | Gates Phase 12. |
| **D13** | Object storage provider/interface | **OPEN** | Gates Phase 10. |
| **D14** | SaaS billing provider | **OPEN** | `REQUIRES PROVIDER DECISION`. Gates Phase 7. |
| **D15** | Queue technology | **OPEN** | Gates Phase 11 (governed by D1). |

When owners record decisions for any of these, add a full record above using the same template.

---

*End of `docs/saas/DECISIONS.md` v1.1. D1, D3, D5, G-4, G-5, G-9, G-10 have explicit owner
decisions recorded (2026-09-06). D2, D4, and D6–D15 remain OPEN pending owner decisions.*
