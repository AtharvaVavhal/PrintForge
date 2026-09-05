# PrintForge SaaS — Phase 0.5 Decision Closure

> **Mode:** analysis / documentation only. No source code, Prisma schema, migration, seed,
> environment file, dependency, or `BLUEPRINT-v1.2.md` was changed by the task that produced
> this document. **Phase 1 has not been implemented and has not started.**
>
> **Purpose of this document:** present the outstanding Phase 1 START-GATE items — three
> BLOCKED decisions (**D1, D3, D5**) and four approval items (**G-4, G-5, G-9, G-10**) — in a
> form the project owners can decide/approve directly. This document **does not resolve** any
> of them; resolution requires human (business / architecture-owner / legal) input.

---

## 1. Document Control

| Field | Value |
|---|---|
| Document | PrintForge SaaS — Phase 0.5 Decision Closure |
| Version | 1.0 |
| Status | AWAITING HUMAN DECISIONS · Phase 1 START GATE = **BLOCKED** |
| Date | 2026-09-06 |
| Repository | `AtharvaVavhal/PrintForge`, branch `main`, HEAD `b20c849` |
| Supersedes | — (companion to `PHASE-0-DECISION-RESOLUTION-AND-PHASE-1-SPEC.md`) |
| Items presented for decision | 7 — D1, D3, D5 (BLOCKED decisions); G-4, G-5, G-9, G-10 (required approvals) |
| Decisions this document resolves | **0** (by design — all require human input) |
| Phase 1 readiness after this document | **BLOCKED** — unchanged until the 7 items are decided/approved and recorded in `docs/saas/DECISIONS.md` |

---

## 2. Purpose

`PHASE-0-DECISION-RESOLUTION-AND-PHASE-1-SPEC.md` §B.12 established the Phase 1 START GATE and
found it **BLOCKED** on:

- **3 BLOCKED decisions** that require a human choice: **D1** (governance / ACR), **D3**
  (initial tenant framing), **D5** (customer identity model).
- **4 REQUIRES EXPLICIT APPROVAL items**: **G-4** (approve the Phase 1 spec), **G-5** (approve
  the lifecycle-enum value sets), **G-9** (approve the pre-migration backup step), **G-10**
  (approve including an additive-only-migration CI check in Phase 1 scope).

This document:

1. Re-states each item with the exact question, the options **that the authoritative documents
   already support** (no new options invented), the consequences of each, and — only where the
   approved architecture / Master Plan already provides a basis — a recommendation.
2. Gives D1, D3, D5 focused treatment (governance conflict; data/migration/rollback
   implications; identity-model effects across `User` / `Customer` / `TenantMembership` /
   isolation / Phase 2 / Phase 12).
3. Re-evaluates the START GATE and confirms it remains **BLOCKED**.
4. Ends with a compact approval form for the project owners.

**It changes nothing in the repository except adding this file.**

---

## 3. Authoritative Sources

| # | Document | Role here |
|---|---|---|
| 1 | `docs/saas/PHASE-0-REPOSITORY-INVENTORY.md` (APPROVED) | Current-state facts: 25 models, `Role {CUSTOMER, ADMIN}`, no tenant column anywhere, single admin control plane, ownership entirely inferred, production data not inspectable from the repo. |
| 2 | `docs/saas/PHASE-0-DECISION-RESOLUTION-AND-PHASE-1-SPEC.md` (APPROVED) | The 15-decision register, the Phase 1 spec (§B.2–B.11), and the START GATE (§B.12) this document closes. |
| 3 | `docs/saas/PRINTFORGE-SAAS-IMPLEMENTATION-MASTER-PLAN-v1.0.md` (APPROVED) | §4.4 open-decisions register (D1–D13 + non-binding recommendations); Phase 1 scope (§7); expand→migrate→contract principle; "no destructive migration without a verified, restore-tested backup" (Principle #5). |
| 4 | `docs/architecture/BLUEPRINT-v1.2.md` (FROZEN v1.2, 25 Aug 2026) | §2 prohibited-technology list; §15 Complete Schema; **§38 Architecture Change Procedure** (the ACR requirement central to D1). |
| 5 | PrintForge SaaS Architecture v1.0 (FROZEN, external handbook) | The target model: one central `User`; `SUPER_ADMIN` mandatory; tenant roles `OWNER/ADMIN/STAFF/VIEWER` on `TenantMembership`; `CUSTOMER` store-scoped; 7 subscription states; one primary storefront per tenant (v1). |
| — | `docs/ops/DEPLOYMENT.md` §3, §11; `docs/ops/BACKUP-RESTORE.md` | Backup-before-migration practice (G-9); "Prisma has no down-migrations"; backup/restore currently **UNVERIFIED**. |
| — | `backend/prisma/schema.prisma` lines 1–5 | Header: *"Do not add tables/fields beyond what §15 specifies without an Architecture Change Request."* |

**No new architecture decisions are invented in this document.** Every option listed is drawn
from source 2, 3, or 4/5.

---

## 4. Current Phase Status

| Phase | Status |
|---|---|
| Phase 0 — Repository / Schema / Data Inventory | **COMPLETE** (`PHASE-0-REPOSITORY-INVENTORY.md`) |
| Phase 0.5 — Decision Resolution & Phase 1 Spec | **COMPLETE** (`PHASE-0-DECISION-RESOLUTION-AND-PHASE-1-SPEC.md`) |
| **Phase 0.5 — Decision Closure (this document)** | **COMPLETE as a presentation** — awaiting 7 human decisions/approvals |
| **Phase 1 — Foundational Tenant / Store / Membership** | **NOT STARTED. START GATE = BLOCKED.** No schema, migration, module, or seed exists. |

---

## 5. Decision Register

*(Per-item fields as required by the task. "Options" are only those the authoritative
documents already support.)*

---

### D1 — Governance: supersede `BLUEPRINT-v1.2` via the repo's ACR process

| Field | Content |
|---|---|
| **ID** | D1 |
| **Current status** | **BLOCKED** (START GATE G-1). Classification in Phase 0.5: `REQUIRES BUSINESS DECISION` (project-owner governance action). |
| **Exact question requiring resolution** | *Do the project owners (Atharva + Harshad, per `BLUEPRINT-v1.2 §38`) approve raising and signing one Architecture Change Request that declares "PrintForge SaaS Architecture v1.0 supersedes `docs/architecture/BLUEPRINT-v1.2.md` in full", thereby permitting SaaS models to be added to `schema.prisma` and sanctioning the SaaS async/worker tier?* |
| **Why it matters** | `schema.prisma:4-5` and `BLUEPRINT-v1.2 §38` **forbid adding any table to §15 (the Complete Schema) without a joint Atharva+Harshad ACR.** Phase 1's entire deliverable is six new models. Without the ACR, implementing Phase 1 would violate the repository's own frozen governance clause. `BLUEPRINT-v1.2 §2` also **permanently prohibits** background-queue infrastructure "absent a formal Architecture Change Request" — relevant to Phase 11 but part of the same conflict. |
| **What Phase 1 depends on** | Everything. Phase 1 cannot write a single `model` block, migration, or `TenancyModule` until D1 is signed. |
| **Options explicitly supported by the documents** | **Option A** — Raise one ACR superseding `BLUEPRINT-v1.2` in full; keep it as a historical document (Master Plan §4.4-D1 recommendation; Phase 0.5 §A.1-D1 recommended next action). **Option B** — Raise a narrower ACR scoped only to "§15 may add the SaaS foundational models" now, deferring the queue-tier sanction to a second ACR before Phase 11 (implied fallback in Phase 0.5 §A.1-D1: *"a Postgres-backed queue avoids all named prohibited tech"*). **Option C** — Do not proceed (SaaS programme halts). |
| **Consequences of each option** | **A:** cleanest — one governance action covers all 15 phases; `schema.prisma` header + `ARCHITECTURE-FREEZE.md` updated once (in the Phase 1 PR). **B:** unblocks Phase 1 sooner with a smaller review surface, but requires a second ACR before Phase 11 and leaves two partially-superseded frozen documents coexisting for longer. **C:** the approved SaaS Architecture v1.0 and Master Plan cannot be executed. |
| **Recommended option (only where the documents already provide a basis)** | **Option A.** Directly supported: Master Plan §4.4-D1 ("Raise one ACR: 'SaaS Architecture v1.0 supersedes BLUEPRINT-v1.2 in full.' Keep BLUEPRINT as historical") and Phase 0.5 §A.1-D1. The ACR content is already drafted in outline (see §6). |
| **Exact approval required** | A **`BLUEPRINT-v1.2 §38` ACR**: a written proposal stating (1) sections affected, (2) problem, (3) proposed change, (4) why it doesn't violate §2, (5) schema/API-contract impact — **submitted for joint Atharva + Harshad review and signed before merge.** |
| **Affects later phases?** | **Yes** — it is the governance umbrella for Phases 1–15. Specifically re-confirmed as needed before Phase 11 (queue tier) by Master Plan §4.4-D1. |
| **Reversible?** | The ACR itself is a governance record — reversible only by a further ACR. In practice: not something you revert. |
| **What must NOT be implemented until approval** | Any `model` added to `schema.prisma`; any migration; `TenancyModule` / `PlansModule`; any change to the `schema.prisma` header comment or `ARCHITECTURE-FREEZE.md`. |

---

### D3 — Does the existing store/catalog become **Tenant #1**, or is the deployment not adopted?

| Field | Content |
|---|---|
| **ID** | D3 |
| **Current status** | **BLOCKED** (START GATE G-2). Classification: `REQUIRES BUSINESS DECISION`. |
| **Exact question requiring resolution** | *Does the business direct that the existing deployed catalog + admin user + settings become the platform's first real merchant — modelled as an ordinary, explicitly-named `Tenant` with no implicit privileges — **or** is the current deployment treated as disposable dev/demo scaffolding, with tenants created empty from Phase 5 onward?* |
| **Why it matters** | Phase 1's acceptance criterion AC-14 requires *"a dev/test seed that bootstraps a full tenant"*, and its framing ("Tenant #1" as a migrated merchant vs a synthetic example) depends on this. Phase 4's data-ownership backfill has a **target** only under Option A. |
| **What Phase 1 depends on** | The **seed / test-fixture shape** and the doc framing of "Tenant #1". The six model shapes are identical under either option. |
| **Options explicitly supported by the documents** | **Option A** — The existing catalog + admin + settings become **Tenant #1**, an ordinary tenant (Master Plan §4.4-D3 suggests the display name *"ForgeBuilds Demo Store"*), with an ordinary `Free`/`ACTIVE` subscription, **no `default_tenant` name, no implicit cross-tenant privileges**. Existing `role=ADMIN` user → `OWNER` `TenantMembership` (Master Plan §4.4-D5). **Option B** — The deployment is disposable; Phase 4's existing-data migration is dropped/minimised; tenants are created empty from Phase 5. |
| **Consequences of each option** | See §7 (special treatment). Summary: **A** = Phase 4 is a true production migration (verified restore, maintenance window, pre/post reconciliation of order counts + revenue sums); existing e2e coverage stays meaningful; **needs the D2 answer to be done responsibly**. **B** = Phase 4 is a much smaller, lower-risk clean bootstrap; existing catalog/orders/settings are abandoned; existing e2e specs are rewritten as synthetic multi-tenant tests. |
| **Recommended option (only where the documents provide a basis)** | Master Plan §4.4-D3 **recommends Option A** ("so existing e2e coverage stays meaningful"), **but** its own D2 recommendation says this is only correct *"if real data exists"*. **This document does not decide it** — it is a business call and is contingent on D2. |
| **Exact approval required** | A recorded business decision: **A** or **B**. If **A**: the chosen tenant display name + slug (not `default_tenant`, not `tenant-1`), and explicit confirmation it receives no special privileges. |
| **Affects later phases?** | **Yes** — Phase 4 (defining), Phase 15 (production-migration validation). Phase 2's identity backfill (`role=ADMIN` → `OWNER`) also depends on it. |
| **Reversible?** | **Partially.** The *direction* is reversible on paper before Phase 4 executes. Once Phase 4 backfills existing rows to Tenant #1's id (Option A) and the destructive constraint waves run, reverting means restoring from backup (Prisma is forward-only). |
| **What must NOT be implemented until approval** | The Phase 1 bootstrap seed's framing; any Phase 4 backfill; any assignment of the real live `role=ADMIN` user to an `OWNER` membership. |

---

### D5 — Customer identity model: store-scoped `Customer` entity vs global `User` + `Customer` profile

| Field | Content |
|---|---|
| **ID** | D5 |
| **Current status** | **BLOCKED** (START GATE G-3). Classification: `REQUIRES BUSINESS DECISION` (product / identity architecture). |
| **Exact question requiring resolution** | *The frozen architecture states "customer identity is store-scoped." Does the product direction adopt **(a)** a separate `Customer` entity keyed by `(storeId, email)` with its own auth — leaving `User` as platform/merchant identity only — **or (b)** a single global `User` with a per-store `Customer` profile/link record?* |
| **Why it matters** | Every storefront shopper is currently a `User` row (`role=CUSTOMER`, the default on `POST /auth/register`). Six FK families point at `users.id` for customer-owned data (`orders`, `carts`, `reviews`, `coupon_usages`, `idempotency_keys`, `uploaded_files`). Phase 1 must model how `User` relates to `TenantMembership` so that Option (b) would not later have to be unwound (under (a) a storefront `Customer` **never** holds a membership). |
| **What Phase 1 depends on** | The **doc semantics** of `User` (merchant/platform-only vs global) and `TenantMembership` (merchant-only vs potentially shopper-holding). Phase 1 adds **no** `Customer` table either way (that is Phase 2). |
| **Options explicitly supported by the documents** | **Option (a)** — separate `Customer` per store, `(storeId, email)` unique, own auth; `User` = platform/merchant identity only (Master Plan §4.4-D5 recommendation; frozen architecture "customer identity is store-scoped"; Phase 0.5 §A.2-D5). **Option (b)** — global `User` + thin per-store `Customer` profile/link (Master Plan §4.4-D5 lists it as the alternative). |
| **Consequences of each option** | See §8 (special treatment). Summary: **(a)** = larger Phase 2/4 refactor (new `Customer` + `CustomerRefreshToken` + separate auth flow + token audiences; Phase 4 re-points 6 FK families; drop `role=CUSTOMER` in Phase 15) — but matches the frozen model and cleanly separates privileged merchant auth from shopper auth. **(b)** = smaller Phase 2 (thin `Customer` profile); merchant and shopper auth stay entangled in one `User` table; store-scoping is simulated via the link table and needs extra isolation care. |
| **Recommended option (only where the documents provide a basis)** | **Option (a).** This follows **directly** from the approved architecture ("customer identity is store-scoped") **and** Master Plan §4.4-D5 ("(a) separate `Customer` per store … matches the frozen model"). Of the three blocked decisions, D5 has the strongest documented basis for a recommendation. |
| **Exact approval required** | A recorded product + architecture-owner decision: **(a)** or **(b)**. |
| **Affects later phases?** | **Yes** — Phase 2 (defining), Phase 4 (large), Phase 12 (storefront auth behaviour). |
| **Reversible?** | **Direction is reversible before Phase 2.** After Phase 2 adds `Customer` + `customerId` columns and Phase 4 backfills, reverting = schema surgery + restore. |
| **What must NOT be implemented until approval** | Any `Customer` table; any `customerId` column; any customer-auth flow; the Phase 1 doc comments that name the future storefront-identity root. |

---

### G-4 — Approve the Phase 1 specification

| Field | Content |
|---|---|
| **ID** | G-4 |
| **Current status** | **REQUIRES EXPLICIT APPROVAL** (START GATE G-4). |
| **Exact question requiring resolution** | *Does the architecture owner approve §B.2–B.8 of `PHASE-0-DECISION-RESOLUTION-AND-PHASE-1-SPEC.md` as the scope, model shapes, ownership buckets, and migration boundary for Phase 1?* |
| **Why it matters** | Phase 1 implementation is executed against this spec. Without sign-off, the model shapes (Tenant / Store / StoreDomain / TenantMembership / Plan-shell / Subscription-shell), the Platform/Tenant/Store ownership buckets, and the "additive-only, non-enforcing" boundary are proposals, not an agreed contract. |
| **What Phase 1 depends on** | The whole implementation plan. |
| **Options explicitly supported by the documents** | **Approve** (spec conforms to Master Plan §7 Phase 1). **Approve with changes** (record deltas in `docs/saas/DECISIONS.md`). **Reject** (spec is re-drafted). |
| **Consequences** | **Approve:** Phase 1 has an agreed contract; combined with D1/D3/D5 resolution, implementation can begin. **Approve with changes:** minor deltas recorded, then proceed. **Reject:** Phase 0.5 spec returns for revision. |
| **Recommended option (documented basis)** | **Approve.** The spec is a faithful decomposition of Master Plan Phase 1 (§7) — no new models beyond the six the Master Plan names, additive-only, non-enforcing, one-primary-store-per-tenant, roles on `TenantMembership`, `SUPER_ADMIN` deferred to Phase 2. |
| **Exact approval required** | Architecture owner sign-off recorded in `docs/saas/DECISIONS.md`. |
| **Affects later phases?** | Indirectly — the foundational models are consumed by Phases 2–9. |
| **Reversible?** | Yes on paper before implementation; the spec can be re-versioned. |
| **What must NOT be implemented until approval** | Any Phase 1 model, migration, module, or seed. |

---

### G-5 — Approve the lifecycle-enum value sets

| Field | Content |
|---|---|
| **ID** | G-5 |
| **Current status** | **REQUIRES EXPLICIT APPROVAL** (START GATE G-5). |
| **Exact question requiring resolution** | *Does the architecture owner approve the four proposed status-enum value sets for the new models, and confirm the two frozen enums are used verbatim?* |
| **Why it matters** | Prisma enum changes on a populated table are awkward, and migrations are forward-only. Getting the value sets right **before** the Phase 1 migration ships avoids a later enum-alter migration. |
| **What Phase 1 depends on** | The exact `CREATE TYPE` statements in the Phase 1 migration. |
| **Proposed value sets already present in the Phase 1 spec (§B.6)** | **`TenantStatus` = {ACTIVE, SUSPENDED, PENDING_DELETION, DELETED}** — needs approval. **`StoreStatus` = {ACTIVE, DISABLED, DRAFT}** — needs approval. **`MembershipStatus` = {ACTIVE, INVITED, SUSPENDED}** — needs approval. **`DomainVerificationStatus` = {PENDING, VERIFIED, FAILED}** — needs approval. **`TenantRole` = {OWNER, ADMIN, STAFF, VIEWER}** — **fixed by the frozen architecture; confirm verbatim, no approval discretion.** **`SubscriptionStatus` = {PENDING, TRIALING, ACTIVE, PAST_DUE, PAUSED, CANCELLED, EXPIRED}** — **the 7 frozen states; confirm verbatim, no additions.** |
| **Architecture decision or implementation detail?** | **Mixed.** `TenantRole` and `SubscriptionStatus` are **architecture** (frozen — not open). The four `*Status` sets are a **minor design decision** the Master Plan Phase 1 flagged as *"REQUIRES DECISION-minor"* — they are derived from frozen concepts (§7 subscription states, §12 "store status", §18 "controlled tenant deletion") but the exact tokens are the architecture owner's to ratify. |
| **Options explicitly supported by the documents** | **Approve as proposed** (the sets in §B.6). **Approve with adjustments** (e.g. add/rename a `*Status` token — must be recorded). **Reject** (re-propose). |
| **Consequences** | **Approve:** Phase 1 migration writes these `CREATE TYPE`s once. **Adjust:** small recorded delta. **Reject:** spec §B.6 revised before the migration. |
| **Recommended option (documented basis)** | **Approve as proposed.** The four `*Status` sets are minimal and map cleanly to frozen §7/§12/§18; `TenantRole`/`SubscriptionStatus` are non-negotiable. |
| **Exact approval required** | Architecture owner sign-off on the six enum value sets, recorded in `docs/saas/DECISIONS.md`. |
| **Affects later phases?** | Yes — `TenantStatus`/`StoreStatus`/`SubscriptionStatus` are read by the Phase 5 control planes and Phase 7 billing; `DomainVerificationStatus` by Phase 9. |
| **Reversible?** | Adding an enum value later is a forward migration (feasible but avoidable); removing/renaming one after rows exist is painful. Hence the pre-migration gate. |
| **What must NOT be implemented until approval** | The `CREATE TYPE` statements in the Phase 1 migration. |

---

### G-9 — Approve the pre-migration backup step

| Field | Content |
|---|---|
| **ID** | G-9 |
| **Current status** | **REQUIRES EXPLICIT APPROVAL** (START GATE G-9) — *operational step performed at execution time, not now.* |
| **Exact question requiring resolution** | *Does ops approve that a routine database backup / snapshot is taken immediately before the Phase 1 additive migration is applied to any shared environment (staging, then production), per `DEPLOYMENT.md §3`?* |
| **Why it is a gate** | `DEPLOYMENT.md §3`: *"Before every deploy that includes a migration: trigger / confirm a … backup … Record the backup identifier + timestamp."* `DEPLOYMENT.md §11`: **Prisma has no down-migrations.** Even for an additive migration, a recorded restore point is the standard safety net. |
| **What Phase 1 depends on** | Nothing in the *model design*. This is an execution-time operational precondition for *applying* the migration. |
| **What IS currently verified** | Render provides managed PostgreSQL backups; a manual `pg_dump` path is documented (`BACKUP-RESTORE.md §5`); the Phase 1 migration is **additive-only and reversible by a compensating `DROP TABLE` while nothing references the new tables** (true through end of Phase 1). |
| **What is NOT currently verified** | `BACKUP-RESTORE.md` status: **"DOCUMENTED — NOT VERIFIED. No restore has been performed or tested."** Render backup cadence / retention / PITR **unconfirmed**. RTO **undefined**. |
| **Does Phase 1 need a *verified* restore drill?** | **No.** Master Plan Principle #5 requires a verified, restore-tested backup only before a **destructive** migration. Phase 1 is non-destructive/additive. The **full restore drill remains a hard precondition for Phase 4** (destructive constraint waves), not Phase 1. G-9 for Phase 1 = *take and record a routine snapshot*, nothing more. |
| **Options explicitly supported by the documents** | **Approve** (routine snapshot per `DEPLOYMENT.md §3` before applying the additive migration). **Reject** (Phase 1 migration is not applied to a shared environment until a broader backup posture is agreed). |
| **Consequences** | **Approve:** the additive migration is applied with a recorded restore point — minimal risk, standard practice. **Reject:** Phase 1 code can still be written and merged, but the migration is not deployed. |
| **Recommended option (documented basis)** | **Approve.** Standard `DEPLOYMENT.md §3` practice; the additive migration is inherently low-risk and compensating-reversible. |
| **Exact approval required** | Ops confirmation that the snapshot-before-migration step will be performed and its identifier recorded, per `DEPLOYMENT.md §3`. |
| **Affects later phases?** | Sets the operational habit; the *verified restore drill* is separately gated before Phase 4. |
| **Reversible?** | N/A (it is a safety step). |
| **What must NOT be implemented until approval** | Applying the Phase 1 migration to staging or production. (Local-dev application is unaffected.) |

---

### G-10 — Approve including an additive-only-migration CI check in Phase 1 scope

| Field | Content |
|---|---|
| **ID** | G-10 |
| **Current status** | **REQUIRES EXPLICIT APPROVAL** (START GATE G-10) — *to be built as part of Phase 1, not before it.* |
| **Exact question requiring resolution** | *Does the architecture owner approve adding a CI gate — as part of the Phase 1 work — that asserts the Phase 1 migration `.sql` contains no `ALTER TABLE` on an existing table, no `DROP`, and no `NOT NULL`-add (spec acceptance criterion AC-10)?* |
| **Expected purpose and boundary** | Enforce the Phase 1 migration boundary (spec §B.8) automatically: the migration may only `CREATE TABLE` / `CREATE TYPE` / `CREATE INDEX` on **new** objects. It does **not** need to be a general-purpose migration linter — just a guard on the Phase 1 (and subsequent additive) migration(s). |
| **What it protects against** | Phase 1 risk **P1-R6** (scope creep — "just also add `tenantId` to `products` while we're here") and accidental destructive change. It makes AC-10 machine-checked rather than review-only. |
| **Is implementation Phase 1 or approval-only?** | **The CI check is a Phase 1 implementation task** (spec §B.12: *"add as part of Phase 1"*). G-10 is the **approval to include it in Phase 1 scope**. It is **not** something to build now — this task is documentation-only and Phase 1 has not started. Sequencing note: the check should land in the same PR as (or immediately before) the Phase 1 migration so it guards that migration. |
| **What Phase 1 depends on** | Nothing blocks on G-10; it is a scope-inclusion approval. If rejected, AC-10 is enforced by human review only. |
| **Options explicitly supported by the documents** | **Approve** (include the check in Phase 1 — spec §B.12 / AC-10). **Reject** (rely on review-only enforcement of the additive-only boundary). |
| **Consequences** | **Approve:** the additive-only boundary is continuously enforced from Phase 1 onward. **Reject:** the boundary is enforced by reviewer diligence only (higher P1-R6 risk). |
| **Recommended option (documented basis)** | **Approve.** Low cost, directly supports spec AC-10 and mitigates P1-R6. |
| **Exact approval required** | Architecture owner agreement that the CI check is in Phase 1 scope, recorded in `docs/saas/DECISIONS.md`. |
| **Affects later phases?** | Yes (beneficially) — the same check guards every additive wave through Phase 4's expand steps and Phase 10's `PaymentAccount`/asset additions. |
| **Reversible?** | Yes — a CI check can be removed or relaxed later. |
| **What must NOT be implemented until approval** | The CI check itself (and, more broadly, any Phase 1 code). |

---

## 6. D1 — Governance Decision (special treatment)

### 6.1 What `BLUEPRINT-v1.2` currently requires

- **`BLUEPRINT-v1.2 §38` (Architecture Change Procedure)** — verbatim:
  > *"Any change to sections 6, 10–17, 20–25, 30–31, or 34 of this document requires an
  > **Architecture Change Request (ACR)**: a short written proposal stating (1) the section(s)
  > affected, (2) the problem being solved, (3) the proposed change, (4) why it doesn't violate
  > the prohibited-technology list (§2), (5) impact on the frozen schema/API contract,
  > submitted for **joint Atharva+Harshad review** before merge. No architectural decision in
  > this document is altered silently during implementation…"*
- **§15** is "Complete Schema" — within the protected range **10–17**.
- **`backend/prisma/schema.prisma` lines 4–5** operationalize this:
  > *"Do not add tables/fields beyond what §15 specifies without an Architecture Change
  > Request."*
- **§2** — verbatim, the permanently-prohibited list:
  > *"Explicitly prohibited, permanently, absent a formal Architecture Change Request: Redis,
  > Kafka, RabbitMQ, microservices, Kubernetes, GraphQL, event buses, background queue
  > infrastructure (Bull/BullMQ/etc.), additional frameworks … unnecessary additional
  > databases … Redux or any global state library beyond React Context + TanStack Query."*
- **Precedent:** `docs/architecture/PHASE-10-PROPOSAL.md` is itself an approved ACR that added
  the `Review` and `Coupon` model families after the original freeze — so the ACR mechanism is
  real, used, and sufficient.

### 6.2 Why Phase 1 requires new models

Phase 1's scope (spec §B.2–B.6) is to add **six models** — `Tenant`, `Store`, `StoreDomain`,
`TenantMembership`, `Plan` (shell), `Subscription` (shell) — plus six enums. These are the
ownership roots the entire SaaS conversion attaches to (frozen §4, §5, §10, §11). There is no
way to introduce multi-tenancy without them, and the approved Master Plan Phase 1 names exactly
this set.

### 6.3 Why the existing ACR requirement blocks implementation

Adding **any** of those six models is a change to `BLUEPRINT-v1.2 §15`, which §38 makes
conditional on a signed joint ACR. Implementing Phase 1 without that ACR would be *"altering an
architectural decision silently during implementation"* — precisely what §38 forbids. Note the
Master Plan's §4.4-D1 "Blocks" column lists *"Phase 5+ governance, Phase 11"* — this
**under-scopes** the conflict; Phase 0 §19 and Phase 0.5 §A.1-D1 correctly escalate D1 to a
**Phase 1 hard blocker** because the schema-header + §38 gate every table addition, not just
the queue tier. *(This under-scoping is logged as an authoritative-document ambiguity — see
§14.)*

### 6.4 What approval/action is necessary to legally proceed under repository governance

One **`BLUEPRINT-v1.2 §38` ACR**, jointly reviewed and signed by Atharva + Harshad, containing
the five required elements:

| §38 element | Proposed content for the D1 ACR |
|---|---|
| (1) Sections affected | §2 (prohibited-tech — queue tier), §6 (roles/RBAC), §10–17 (incl. §15 schema, §16 deployment, §17 async/outbox), §20–25 (API contract, security), §30–31 (deployment topology, environment), §34 (roadmap). Effectively: the whole freeze-protected surface. |
| (2) Problem being solved | The single-tenant application must become the approved **PrintForge SaaS Architecture v1.0** (FROZEN) — a general-purpose multi-tenant e-commerce platform. `BLUEPRINT-v1.2` describes the wrong architecture. |
| (3) Proposed change | **"PrintForge SaaS Architecture v1.0 supersedes `BLUEPRINT-v1.2.md` in full. `BLUEPRINT-v1.2.md` is retained as a historical record. The `schema.prisma` header and `ARCHITECTURE-FREEZE.md` are updated to cite SaaS Architecture v1.0 + the approved Master Plan as authoritative."** |
| (4) Why it doesn't violate §2 | Phase 1 adds **no** prohibited technology (pure Postgres schema + NestJS modules). The eventual async/worker tier (Phase 11) is planned as a **Postgres-backed queue** (extending the existing outbox pattern) which introduces **none** of the §2-named technologies; if a broker is ever proposed, it needs its own ACR at that time (Master Plan §4.4-D15). |
| (5) Impact on frozen schema/API contract | Schema grows from **25 models → ~50** across Phases 1–15 (Phase 1: +6). Existing 25 models are **not** removed; existing API endpoints are re-scoped (tenant/store context) but not deleted. Full model list: Phase 0 §6.10 + Master Plan §3.16. |

### 6.5 Do the existing documents already define a proposed path?

**Yes.** Master Plan §4.4-D1 states the exact ACR text to raise. Phase 0.5 §A.1-D1 lists the
recommended next action (draft the ACR, joint sign-off, update the header + freeze doc in the
Phase 1 PR). This document (§6.4) fills in the five §38 elements. **What remains is the human
governance action: Atharva + Harshad review and sign.** `BLUEPRINT-v1.2` is **not** modified by
this task — the update happens in the Phase 1 PR, only after the ACR is signed.

---

## 7. D3 — Existing Store Decision (special treatment)

*Using only Phase 0 and Phase 0.5 findings. This document does not decide it.*

### 7.1 The two documented possibilities

| | **Option A — existing store becomes Tenant #1** | **Option B — existing store/data not adopted** |
|---|---|---|
| **Source** | Master Plan §4.4-D3 recommendation; Phase 0.5 §A.1-D3 Option (a) | Master Plan §4.4-D3 alternative; Phase 0.5 §A.1-D3 Option (b) |
| **Framing** | The existing catalog + `role=ADMIN` user + `AppSetting` rows are an ordinary `Tenant` (proposed name *"ForgeBuilds Demo Store"*), ordinary `Free`/`ACTIVE` subscription, **no `default_tenant`, no implicit privileges** | The deployment is disposable dev/demo scaffolding; tenants are created empty from Phase 5 |

### 7.2 Data implications

| Aspect | Option A | Option B |
|---|---|---|
| Existing catalog (`Category`, `Product`, images, variants, customization fields) | Backfilled to Tenant #1 / its primary `Store` in Phase 4 | Abandoned (or manually re-created inside a fresh tenant) |
| Existing `role=CUSTOMER` users | Migrated to `Customer` rows under Tenant #1's store (if D5=(a)) | Abandoned |
| Existing `Order`/`Invoice`/`PaymentAttempt`/`Refund`/`OrderStatusHistory` | Backfilled; revenue-sum + count reconciliation required (Phase 4) | Abandoned |
| Existing `AppSetting` rows + the two counters | Split into Tenant #1's tenant/store settings; counters reseeded from `MAX+1` | Discarded; fresh per-tenant settings from Phase 4/5 defaults |
| **Precondition** | **D2 must confirm whether this data is real or QA fixtures.** Phase 0 §15.3: the *dev* DB is "8 categories, 9 products, almost all QA/smoke-test fixtures, 1 active product"; the *deployed* DB is **not inspectable from the repo**. | D2 answer is less critical (nothing is preserved) |

### 7.3 Migration implications (Phase 4)

- **Option A** → Phase 4 is a **true production data migration**: compatibility columns →
  verified backfill (catalog, settings, commerce, customer data) → validation queries → composite
  constraints/FKs → `NOT NULL` + unique-swap. Needs the Phase 14 restore drill as a precondition
  (Master Plan Principle #5, §25 waves W3–W7).
- **Option B** → Phase 4 is a **clean bootstrap**: compatibility columns are still added to the
  existing tables (the code still queries them), but there is **no backfill of legacy rows** —
  the tables may even be truncated. Far smaller risk surface; the destructive constraint waves
  still run but on effectively-empty or synthetic data.

### 7.4 Seed / test-fixture implications (Phase 1)

- **Option A** → the Phase 1 bootstrap seed frames "Tenant #1" as *the existing merchant*; the
  15 existing e2e specs (`backend/test/e2e/`) can be adapted to run *inside* Tenant #1 and stay
  meaningful.
- **Option B** → the Phase 1 seed is *purely synthetic* ("create an example tenant"); the
  existing e2e specs are rewritten as synthetic single-tenant-within-multi-tenant cases with no
  "existing store" concept.

### 7.5 Rollback implications

- **Option A** → once Phase 4 backfills legacy rows and runs the destructive waves, rollback =
  **restore from the pre-wave verified backup** (Prisma forward-only). The restore drill (D8
  staging + Phase 14) is on the critical path.
- **Option B** → rollback surface is much smaller (little/no legacy data at stake); a code
  revert + `DROP TABLE` of the new models covers most of it through Phase 3.

### 7.6 Effect on Phase 4

**This is the decisive difference.** Option A gives Phase 4 a **backfill target** and makes it a
gated production migration. Option B removes most of Phase 4's data work. **Phase 1 is
unaffected in model shape either way** — only the seed framing and doc language change.

### 7.7 Dependency note

D3 is a Phase 1 blocker (seed framing) **and** logically depends on **D2** ("is there real data
to preserve"). The business *can* choose Option B without D2 (a decision to discard is valid
regardless). Choosing Option A *responsibly* wants the D2 answer first. → *This coupling is
logged as an authoritative-document nuance in §14.*

---

## 8. D5 — Customer Identity Decision (special treatment)

*Two options only — both from Master Plan §4.4-D5. No third model is introduced.*

### 8.1 Effect on each concern

| Concern | **Option (a): separate store-scoped `Customer` entity** | **Option (b): global `User` + per-store `Customer` profile/link** |
|---|---|---|
| **`User`** | Becomes **platform/merchant identity only** — merchant logins, `TenantMembership` holders, future `SUPER_ADMIN`. `users.email` stays globally unique. Eligible for stronger controls (MFA) without affecting shoppers. | Stays **global and dual-purpose** — one row is both a possible merchant and a possible shopper. `role=CUSTOMER` retained longer. |
| **`Customer`** | New entity: own `id`, own `passwordHash`/sessions (`CustomerRefreshToken`), `@@unique([storeId, email])`. The storefront-identity root that Phase 4 re-points orders/carts/reviews/… to. **Added in Phase 2, not Phase 1.** | Thin record: `(userId, storeId)` link + store-scoped profile fields (address, etc.). No separate auth. Also **Phase 2**. |
| **`TenantMembership`** | **Merchant-only by construction.** A `Customer` has no `userId` and therefore *can never* hold a membership — the isolation between "shopper" and "merchant console" is structural. | A shopper is a `User`, and a `User` *can* hold a `TenantMembership` — so the "shopper cannot reach the tenant console" rule is enforced by **guard logic**, not by the data model. |
| **Tenant isolation** | Customer-owned rows are keyed by `storeId` (+ `tenantId`) from the start — the scoped-Prisma path (D4) covers them uniformly. | `User`-level data (the shared row) is not store-scoped; the link table must be joined on every customer query, and cross-store leakage of `User`-level fields must be actively prevented. |
| **Store-scoped identity** | **Native** — the same email at Store A and Store B is two `Customer` rows, two carts, two order histories (matches frozen "customer identity is store-scoped"). | **Simulated** — one `User`, filtered by `storeId` via the link. Same email across stores is one identity with per-store profiles. |
| **Future Phase 2 identity migration** | Larger: add `Customer` + `CustomerRefreshToken` + a store-scoped register/login flow + separate token audiences; backfill `role=CUSTOMER` users → `Customer` rows under Tenant #1's store (Option A of D3); keep `userId` columns during the window. | Smaller: add the thin `Customer` link table + profile; storefront keeps using the global `User` session, scoped by store. |
| **Future Phase 12 storefront behaviour** | Storefront auth is **store-contextual** (register/login *within* a store); a session for Store A is not usable on Store B. Matches the frozen storefront model. | Storefront auth is a **global `User` session** filtered by the active store; extra care to ensure Store B's data never renders under Store A's session. |

### 8.2 Recommendation (only because it follows directly from the approved architecture)

**Option (a).** The frozen PrintForge SaaS Architecture v1.0 states plainly that *"customer
identity is store-scoped"*, and Master Plan §4.4-D5's recommendation is *"(a) separate
`Customer` per store … matches the frozen model."* Of the three blocked decisions, D5's
recommendation has the **most direct** basis in the approved architecture. **The product +
architecture owners must still confirm it** — it is classified `REQUIRES BUSINESS DECISION`
because it commits the larger Phase 2/4 refactor.

### 8.3 What Phase 1 must encode regardless

Phase 1 adds **no** `Customer` table under either option. What Phase 1 must get right **now** is
the **doc semantics**: the Phase 1 spec (§B.4, §B.6) already models `User` as *platform/merchant
identity* and `TenantMembership` as *merchant-only*, and names a future storefront-identity root
without creating it. Under Option (a) that framing is exactly right; under Option (b) the
"merchant-only" note on `TenantMembership` would need a caveat. **This is why D5 must be decided
before Phase 1 finalizes.**

---

## 9. G-4 Approval — see §5 (Decision Register) row **G-4**

Approval requested: architecture-owner sign-off on `PHASE-0-DECISION-RESOLUTION-AND-PHASE-1-SPEC.md`
**§B.2–B.8** (Tenant, Store, TenantMembership, Roles, Platform/Tenant/Store ownership, conceptual
data model, migration boundary). Artifact being approved: the **Phase 1 Foundational Tenant /
Store / Membership Specification**. Recommended: **Approve** (faithful to Master Plan §7).

---

## 10. G-5 Approval — see §5 (Decision Register) row **G-5**

Approval requested: architecture-owner ratification of the four proposed `*Status` enum value
sets (`TenantStatus`, `StoreStatus`, `MembershipStatus`, `DomainVerificationStatus`) and
confirmation that `TenantRole` and `SubscriptionStatus` are used **verbatim** from the frozen
architecture. The four `*Status` sets are a **minor design decision** (Master Plan flagged
*"REQUIRES DECISION-minor"*); the two role/subscription enums are **fixed architecture**.
Recommended: **Approve as proposed**.

---

## 11. G-9 Approval — see §5 (Decision Register) row **G-9**

Approval requested: ops confirmation that a routine backup/snapshot is taken and its identifier
recorded **immediately before** the Phase 1 additive migration is applied to any shared
environment, per `DEPLOYMENT.md §3`. **Not required now** (execution-time step). **Does not
require the full verified restore drill** — that remains a **Phase 4** precondition. Currently
verified: managed Render backups + documented `pg_dump` path + the migration is
compensating-reversible. Currently **not** verified: any actual restore, Render
cadence/retention/PITR, RTO. Recommended: **Approve**.

---

## 12. G-10 Approval — see §5 (Decision Register) row **G-10**

Approval requested: architecture-owner agreement that a CI check enforcing the additive-only
migration boundary (no `ALTER TABLE <existing>` / no `DROP` / no `NOT NULL`-add; spec AC-10) is
**included in Phase 1 scope**. It is **built during Phase 1**, not now, and **not by this task**.
Protects against P1-R6 (scope creep) and accidental destructive change. Recommended: **Approve**.

---

## 13. Phase 1 START GATE Re-evaluation

Rule (from `PHASE-0-DECISION-RESOLUTION-AND-PHASE-1-SPEC.md` §B.12):
> *"Phase 1 implementation cannot begin until every **BLOCKED** item is resolved and every
> **REQUIRES EXPLICIT APPROVAL** item is explicitly approved and recorded in
> `docs/saas/DECISIONS.md`."*

| ID | Current Status | Required Human Action | Phase 1 Impact | Resolved? | Evidence |
|---|---|---|---|:-:|---|
| **D1** | **BLOCKED** | Atharva + Harshad raise & sign a `BLUEPRINT-v1.2 §38` ACR superseding `BLUEPRINT-v1.2` (content outlined in §6.4) | **Hard blocker** — no model may be added to `schema.prisma` without it | **NO** | `BLUEPRINT-v1.2 §38`; `schema.prisma:4-5`; Master Plan §4.4-D1; Phase 0.5 §A.1-D1 / §B.12 G-1 |
| **D3** | **BLOCKED** | Business selects Option A (existing → Tenant #1) or Option B (not adopted); if A, name the tenant | **Blocker (soft)** — sets Phase 1 seed/fixture framing; **defining** for Phase 4 | **NO** | Master Plan §4.4-D3; Phase 0.5 §A.1-D3 / §B.12 G-2; §7 above |
| **D5** | **BLOCKED** | Product + architecture owner select Option (a) separate `Customer` or (b) global `User` + profile | **Blocker (design)** — fixes `User` ↔ `TenantMembership` semantics; **defining** for Phase 2 | **NO** | Frozen architecture ("customer identity is store-scoped"); Master Plan §4.4-D5; Phase 0.5 §A.2-D5 / §B.12 G-3; §8 above |
| **G-4** | **REQUIRES EXPLICIT APPROVAL** | Architecture owner approves `PHASE-0-DECISION-RESOLUTION-AND-PHASE-1-SPEC.md` §B.2–B.8 | Contract for the whole Phase 1 implementation | **NO** | Phase 0.5 §B.12 G-4 |
| **G-5** | **REQUIRES EXPLICIT APPROVAL** | Architecture owner ratifies the 4 `*Status` enum sets; confirms `TenantRole`/`SubscriptionStatus` verbatim | Fixes the Phase 1 migration's `CREATE TYPE`s | **NO** | Phase 0.5 §B.6, §B.12 G-5; frozen §7/§12/§18 |
| **G-9** | **REQUIRES EXPLICIT APPROVAL** | Ops approves the pre-migration snapshot step (`DEPLOYMENT.md §3`) — performed at execution time | Gates *applying* the migration to shared envs (not local dev) | **NO** | `DEPLOYMENT.md §3`, §11; `BACKUP-RESTORE.md`; Phase 0.5 §B.12 G-9 |
| **G-10** | **REQUIRES EXPLICIT APPROVAL** | Architecture owner approves adding the additive-only CI check to Phase 1 scope (built during Phase 1) | Enforces spec AC-10 / mitigates P1-R6 | **NO** | Phase 0.5 §B.12 G-10; spec AC-10, risk P1-R6 |

### 13.1 Resulting START GATE status

| Classification | Count | Items | All resolved? |
|---|:-:|---|:-:|
| BLOCKED (must be **resolved**) | 3 | D1, D3, D5 | **NO** |
| REQUIRES EXPLICIT APPROVAL (must be **approved & recorded**) | 4 | G-4, G-5, G-9, G-10 | **NO** |
| READY (no action for Phase 1) | — | D4 *(resolved)*; D2/D6/D8/D10/D11 *(gate later phases)* | n/a |

**PHASE 1 START GATE = `BLOCKED`.**

- Not `READY`: 3 BLOCKED decisions are unresolved and 4 approvals are outstanding.
- Not merely `REQUIRES EXPLICIT APPROVAL`: the presence of unresolved **BLOCKED** decisions
  (D1, D3, D5) makes the gate `BLOCKED`, which is the stronger state.

**Phase 1 implementation cannot begin.** This document does not and cannot change that — the 7
items require human decisions/approvals.

---

## 14. Human Decisions Required

| # | Owner | Item | Decision needed |
|---|---|---|---|
| 1 | **Atharva + Harshad** (joint, `BLUEPRINT-v1.2 §38`) | **D1** | Approve raising & signing the ACR superseding `BLUEPRINT-v1.2` (§6.4 has the drafted content). Recommended: **APPROVE**. |
| 2 | **Business owner** | **D3** | Select **Option A** (existing deployment → Tenant #1, ordinary tenant, chosen name, no privileges) or **Option B** (not adopted; empty tenants from Phase 5). Master Plan recommends A; A is contingent on D2. |
| 3 | **Product + architecture owner** | **D5** | Select **Option (a)** (separate store-scoped `Customer` entity) or **Option (b)** (global `User` + `Customer` profile). Recommended (from frozen architecture): **(a)**. |
| 4 | **Architecture owner** | **G-4** | Approve `PHASE-0-DECISION-RESOLUTION-AND-PHASE-1-SPEC.md` §B.2–B.8. Recommended: **APPROVE**. |
| 5 | **Architecture owner** | **G-5** | Ratify the 4 `*Status` enum sets (§5 / §10); confirm `TenantRole` + `SubscriptionStatus` verbatim. Recommended: **APPROVE AS PROPOSED**. |
| 6 | **Ops** | **G-9** | Approve the pre-migration snapshot step for shared-environment deploys (`DEPLOYMENT.md §3`). Recommended: **APPROVE**. |
| 7 | **Architecture owner** | **G-10** | Approve including the additive-only migration CI check in Phase 1 scope. Recommended: **APPROVE**. |

### 14.1 Ambiguities discovered in the authoritative documents

| # | Ambiguity | Where | Handling in this document |
|---|---|---|---|
| AMB-1 | **Master Plan §4.4-D1 "Blocks" column says *"Phase 5+ governance, Phase 11"*** — it does **not** list Phase 1. But `schema.prisma:4-5` + `BLUEPRINT-v1.2 §38` gate **every** table addition, making D1 a **Phase 1** hard blocker. | Master Plan §4.4 vs `schema.prisma` header vs `BLUEPRINT-v1.2 §38` | Phase 0 §19 and Phase 0.5 §A.1-D1 already escalated D1 to a Phase 1 blocker; this document (§6.3) confirms and flags the Master Plan under-scoping. **No documents changed.** |
| AMB-2 | **D3 is a Phase 1 blocker but logically depends on D2** (which is *not* a Phase 1 blocker). Can D3 be answered before D2? | Phase 0.5 §A.1-D2, §A.1-D3 | §7.7: Option B is decidable without D2; Option A is decidable but only *responsible* with the D2 answer. Presented as a coupling, not resolved. |
| AMB-3 | **G-9 wording ("backup taken before applying the additive migration") could be read as requiring the full verified restore drill**, given `BACKUP-RESTORE.md` is "NOT VERIFIED" and Master Plan Principle #5 requires a restore-tested backup before *destructive* migrations. | Phase 0.5 §B.12 G-9 vs Master Plan Principle #5 vs `BACKUP-RESTORE.md` | §11 / §5-G9: Phase 1 is **additive/non-destructive**, so only a routine snapshot is required; the verified restore drill remains a **Phase 4** precondition. Clarified, not a document change. |
| AMB-4 | **G-10 says "add as part of Phase 1"** — but the check is meant to guard the Phase 1 migration itself (chicken-and-egg on sequencing). | Phase 0.5 §B.12 G-10 | §12: the check should land in the same PR as (or immediately before) the Phase 1 migration. Sequencing clarified. |
| AMB-5 | **`Plan` shell vs `Plan` rows.** Phase 1 spec adds a `Plan` *shell model*; for a tenant to get a `Free`/`ACTIVE` `Subscription` at creation (spec §B.6, AC-14), at least one `Plan` row (`key='free'`) must exist. Whether Phase 1 *seeds* that row or Phase 6 does is not stated explicitly. | Master Plan §7 Phase 1 vs Phase 6; spec §B.6 / AC-14 | Noted for the Phase 1 implementer: Phase 1 must seed at minimum the `Free` `Plan` row (dev/test), full plan catalogue + features/limits = Phase 6. Not a blocking ambiguity. |
| AMB-6 | **`TenantRole.ADMIN` vs `Role.ADMIN` name collision** persists from Phase 1 until Phase 2 retires `Role`. | Spec §B.5, risk P1-R4 | Already documented as intentional/temporary in the spec; noted here so approvers are aware the collision is a known, time-boxed state. |

---

## 15. Exact Next Action After Approval

Once the seven items in §14 are decided/approved and **recorded in a new
`docs/saas/DECISIONS.md`** (ID, decision, chosen option, approver, date), the sequence is:

1. **Record** every decision + approval in `docs/saas/DECISIONS.md` (D1 with a link to the
   signed ACR; D3 with the chosen tenant name if Option A; D5 with the chosen option; G-4/G-5/
   G-9/G-10 with approver + date).
2. **Land the D1 ACR** and, in the **same PR that begins Phase 1**, update the
   `backend/prisma/schema.prisma` header comment and `docs/architecture/ARCHITECTURE-FREEZE.md`
   to cite SaaS Architecture v1.0 + the Master Plan as authoritative. *(This is the first
   Phase 1 change — it does not happen in this task.)*
3. **Re-run the Phase 0 inventory diff** against `HEAD` (Master Plan risk R20 — the repo is
   under active development) and refresh `docs/saas/CHANGE-MAP.md`.
4. **Provision the staging environment** (D8) in parallel — lead time; it gates Phase 4, not
   Phase 1, but should start now.
5. **Begin Phase 1 implementation** strictly within spec §B.8's migration boundary:
   - one additive forward migration: `CREATE TABLE` / `CREATE TYPE` / `CREATE INDEX` on the six
     new models + six enums only;
   - `TenancyModule` + `PlansModule` (services only — no controller, no guard, no interceptor);
   - the additive-only CI check (G-10);
   - dev/test seed bootstrapping a full tenant (framing per D3);
   - new unit tests + the full existing suite still green (spec AC-1…AC-17).
6. **Produce `docs/saas/PHASE-1-COMPLETION-REPORT.md`** and re-verify every Phase 1 acceptance
   criterion.

**Until step 1 is complete, no Phase 1 code, schema, migration, module, or seed may be
written.**

---

## 16. Phase 1 Implementation Status

**Phase 1 implementation has NOT started.**

- No new model exists in `backend/prisma/schema.prisma` (still 25 models, 12 enums).
- No migration has been created (still 9 under `backend/prisma/migrations/`).
- No `TenancyModule` / `PlansModule` / tenancy source exists in `backend/src/`.
- No seed data has been created or modified.
- `docs/architecture/BLUEPRINT-v1.2.md` has **not** been changed by this task.
- The only artifact produced by this task is **this document**,
  `docs/saas/PHASE-0.5-DECISION-CLOSURE.md`.

---

## Human Decision Form

> Project owners: fill in each bracket, then have this recorded in `docs/saas/DECISIONS.md`.
> Recommendations are shown for the items where the approved architecture / Master Plan already
> provides a basis; they are **not** pre-filled.

```
────────────────────────────────────────────────────────────────────────
PRINTFORGE SaaS — PHASE 1 START-GATE DECISIONS
Date: __________        Recorded by: __________

D1  Governance ACR (supersede BLUEPRINT-v1.2 in full, per §6.4)
    Owner: Atharva + Harshad (joint, BLUEPRINT-v1.2 §38)
    Recommendation: APPROVE
    Decision: [ APPROVE — raise & sign the ACR
             / APPROVE NARROW — ACR scoped to §15 schema additions only
             / REJECT
             / NEED DISCUSSION ]
    ACR link / ref: __________________________________
    Signed by: Atharva ____________  Harshad ____________

D3  Initial Tenant / Store framing
    Owner: Business
    Recommendation: OPTION A (per Master Plan; contingent on D2)
    Decision: [ OPTION A — existing deployment becomes Tenant #1
             / OPTION B — not adopted; tenants created empty
             / NEED D2 ANSWER FIRST ]
    If OPTION A — tenant display name: ________________  slug: ____________
    Confirm: Tenant #1 receives NO implicit privileges  [ YES / NO ]

D5  Customer identity model
    Owner: Product + Architecture owner
    Recommendation: OPTION (a) (follows directly from frozen architecture)
    Decision: [ OPTION (a) — separate store-scoped Customer entity
             / OPTION (b) — global User + per-store Customer profile
             / NEED DISCUSSION ]

G-4 Approve Phase 1 specification (§B.2–B.8)
    Owner: Architecture owner
    Recommendation: APPROVE
    Decision: [ APPROVE / APPROVE WITH CHANGES / REJECT ]
    Changes (if any): _______________________________________________

G-5 Approve lifecycle-enum value sets
    Owner: Architecture owner
    Recommendation: APPROVE AS PROPOSED
    TenantStatus  {ACTIVE, SUSPENDED, PENDING_DELETION, DELETED}   [ OK / CHANGE: ______ ]
    StoreStatus   {ACTIVE, DISABLED, DRAFT}                        [ OK / CHANGE: ______ ]
    MembershipStatus {ACTIVE, INVITED, SUSPENDED}                  [ OK / CHANGE: ______ ]
    DomainVerificationStatus {PENDING, VERIFIED, FAILED}           [ OK / CHANGE: ______ ]
    TenantRole {OWNER, ADMIN, STAFF, VIEWER}       (frozen — confirm verbatim)  [ CONFIRM ]
    SubscriptionStatus {PENDING, TRIALING, ACTIVE, PAST_DUE,
                        PAUSED, CANCELLED, EXPIRED} (frozen — confirm verbatim) [ CONFIRM ]
    Decision: [ APPROVE / APPROVE WITH CHANGES / REJECT ]

G-9 Pre-migration backup step (DEPLOYMENT.md §3) for shared-environment deploys
    Owner: Ops
    Recommendation: APPROVE
    Decision: [ APPROVE / REJECT ]
    Note: this is NOT the full verified restore drill (that is a Phase 4 precondition).

G-10 Include additive-only migration CI check in Phase 1 scope
    Owner: Architecture owner
    Recommendation: APPROVE
    Decision: [ APPROVE / REJECT ]

────────────────────────────────────────────────────────────────────────
Once all seven are decided and recorded in docs/saas/DECISIONS.md,
the Phase 1 START GATE is re-evaluated. Phase 1 implementation may begin
only when the gate reads READY.
────────────────────────────────────────────────────────────────────────
```

---

*End of PrintForge SaaS — Phase 0.5 Decision Closure.*
*Analysis / documentation only. No source code, Prisma schema, migration, seed, environment
file, dependency, or `BLUEPRINT-v1.2.md` was changed. Phase 1 has not started.*
