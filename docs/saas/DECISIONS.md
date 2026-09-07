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
> - Do not overwrite history — append. Corrections to narrative fields are struck through, not
>   deleted, and carry a dated correction note.

---

## Document Control

| Field | Value |
|---|---|
| Document | PrintForge SaaS — Canonical Decision Register (`docs/saas/DECISIONS.md`) |
| Version | 1.2 |
| Created | 2026-09-06 |
| Last updated | 2026-09-07 — recorded explicit owner decision for **D2** (RESOLVED — OPTION A: deployed Render database holds real merchant/customer production data); D8 and G-16 remain OPEN — PENDING. *(2026-09-06 — recorded explicit owner decisions for **P2-D1…P2-D13**, **G-11, G-12, G-15, G-17, G-18, G-19** (APPROVED), **G-13 / G-14** (NOT REQUIRED for Phase 2), **G-16** (OPEN — gated on D2/D8), **D6** (DEFERRED — Phase 3 re-scope); applied the **G-18** correction to the D5 narrative fields.)* |
| Repository | `AtharvaVavhal/PrintForge`, branch `main`, HEAD `5609fa8` |
| Records held | 31 — D1, D2, D3, D5, D6, G-4, G-5, G-9, G-10, P2-D1…P2-D13, G-11…G-19 |
| Records `RESOLVED` / `APPROVED` | **27** (D1, D2, D3, D5, G-4, G-5, G-9, G-10, P2-D1…P2-D13, G-11, G-12, G-15, G-17, G-18, G-19) |
| Records `NOT REQUIRED` (for their phase) | **2** (G-13, G-14 — see records) |
| Records `OPEN` / `DEFERRED` | **G-16** OPEN (gated on D8; D2 resolved 2026-09-07); **D6** DEFERRED (Phase 3, re-scope approved); **D4, D7–D15** OPEN (bottom table) |
| Companion | `docs/saas/PHASE-0.5-DECISION-STATUS.md`; `docs/saas/PHASE-1-START-GATE-RESULT.md`; `docs/saas/PHASE-2-DECISION-CLOSURE.md`; `docs/saas/PHASE-2-START-GATE-RESULT.md`; `docs/saas/PHASE-2-DECISION-RESOLUTION-AND-SPEC.md`; `docs/saas/ACR-001-SUPERSEDE-BLUEPRINT-V1.2.md` |

**Status vocabulary:** `OPEN` (no owner decision yet) · `RESOLVED` (decision made — for D-items)
· `APPROVED` / `REJECTED` / `NOT REQUIRED` (for G-items) · `DEFERRED` (owner explicitly postponed
to a later phase).

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
| **Rationale** | The approved PrintForge SaaS Architecture v1.0 and the approved Master Plan require multi-tenant foundational models that `BLUEPRINT-v1.2 §15` does not contain, and `§38` + `schema.prisma:4-5` make any such schema addition conditional on a signed ACR. The owner has explicitly approved raising that ACR (Master Plan §4.4-D1 path; content drafted in `PHASE-0.5-DECISION-CLOSURE.md §6.4`). This resolves the Phase 1 governance blocker. **The ACR is APPROVED and documented; its follow-through actions (updating the `schema.prisma` header comment and `ARCHITECTURE-FREEZE.md`) are performed in the Phase 1 PR.** |
| **Source document / section** | `BLUEPRINT-v1.2.md §38` (Architecture Change Procedure), §2 (prohibited technology), §15 (Complete Schema); `backend/prisma/schema.prisma` lines 4–5; Master Plan `§4.4-D1`; `PHASE-0-REPOSITORY-INVENTORY.md §19` (D1); `PHASE-0-DECISION-RESOLUTION-AND-PHASE-1-SPEC.md §A.1-D1`, §B.12 (G-1); `PHASE-0.5-DECISION-CLOSURE.md §5 (D1)`, §6; `docs/saas/ACR-001-SUPERSEDE-BLUEPRINT-V1.2.md`. |
| **Consequences** | The Phase 1 governance blocker is cleared. One governance action covers Phases 1–15. In the Phase 1 PR: the `schema.prisma` header comment and `docs/architecture/ARCHITECTURE-FREEZE.md` are updated to cite SaaS Architecture v1.0 + the Master Plan as authoritative; `BLUEPRINT-v1.2` is retained as a historical document. The schema is permitted to grow from 25 → ~50 models across the programme (Phase 1: +6). No prohibited technology (§2) is introduced by Phase 1; the eventual queue tier is planned as a Postgres-backed queue (Master Plan §4.4-D15) and, if a broker is ever proposed, needs its own ACR at that time. |
| **Affected phase(s)** | **Phase 1 (blocker — now cleared)** and, as a governance umbrella, Phases 2–15. Re-referenced before Phase 11 (async/worker tier) per Master Plan §4.4-D1. |
| **Reversibility** | The ACR is a governance record — reversible only by a further ACR; in practice not reverted. |
| **Explicit approval wording (recorded)** | `"D1: APPROVE — APPROVE the required ACR under BLUEPRINT-v1.2 §38 to permit the Phase 1 tenancy models."` (project owner, 2026-09-06). |
| **Not to be implemented until this record is `APPROVED`** | ~~Any `schema.prisma` model addition; any migration; `TenancyModule`/`PlansModule`; any edit to the `schema.prisma` header comment or `ARCHITECTURE-FREEZE.md`.~~ **CLEARED 2026-09-06.** Those actions are now permitted **within Phase 1 scope** (`PHASE-0-DECISION-RESOLUTION-AND-PHASE-1-SPEC.md §B.8`). *(Phase 1 is now ACCEPTED — `76fd26e`.)* |

### D1 — Decision Log

| Date | Owner | Choice | Approval wording (verbatim) | Reference |
|---|---|---|---|---|
| 2026-09-06 | Atharva + Harshad (project owner) | **APPROVE the ACR** | `"D1: APPROVE"` → *"APPROVE the required ACR under BLUEPRINT-v1.2 §38 to permit the Phase 1 tenancy models."* | `docs/saas/ACR-001-SUPERSEDE-BLUEPRINT-V1.2.md` |

---

## D2 — Deployed database production-data status

| Field | Content |
|---|---|
| **ID** | D2 |
| **Decision (question)** | Does the currently-deployed Render database hold real merchant/customer production data, or only test/demo data? |
| **Owner** | Ops owner (project owner) |
| **Date** | 2026-09-07 |
| **Status** | **RESOLVED — OPTION A** |
| **Decision (approved option)** | **Option A** — the currently-deployed Render database **contains real merchant/customer production data**. |
| **Rationale** | The owner has explicitly confirmed that the deployed database holds live production data, not test/demo scaffolding. This resolves the question originally framed in `PHASE-0-DECISION-RESOLUTION-AND-PHASE-1-SPEC.md §A.1` and referenced as a hard blocker throughout the D3, Phase 2b, and Phase 4 records. |
| **Source document / section** | `PHASE-0-DECISION-RESOLUTION-AND-PHASE-1-SPEC.md §A.1` (original D2 framing); D3 record (Dependency row, unchanged); G-16 record (unchanged); Master Plan §8 (Phase 2b gating). |
| **Consequences** | Planning for **Phase 2b** (identity backfill) and **Phase 4** (data-ownership migration) may now proceed on the assumption of a real, live production dataset — the anomaly classes named in the Phase 2b contract (duplicate emails, admin-who-also-shopped, inactive users, partial addresses, etc.) must be treated as live possibilities requiring owner review, not hypotheticals. **This decision, by itself, authorizes no production access, no backup, no restore, and no backfill execution.** Phase 2b **execution** additionally requires **D8** (a verified restore artifact) and **G-16** (ops backfill authorization) — both remain **OPEN — PENDING**, unchanged by this record. No production credentials, production database, or production rows were accessed, read, or modified in the course of recording this decision; the answer was supplied directly by the project owner. |
| **Affected phase(s)** | **Phase 2b** (backfill planning may proceed; execution remains blocked on D8 + G-16); **Phase 4** (data-ownership migration planning; execution remains blocked on D8 and its own gates). |
| **Reversibility** | This is a factual record of the deployed environment's data status, not a design choice — not reversible in the ordinary sense. It would only be re-opened if the deployed database were replaced or its contents materially changed. |
| **Dependency (still open)** | **D8** (verified restore artifact — staging + restore drill) and **G-16** (Phase 2b backfill authorization) remain **OPEN — PENDING**, independently of this record. **D2 = A does not resolve D8 or G-16, and does not itself authorize Phase 2b execution.** |
| **Explicit approval wording (recorded)** | `"D2: A — The currently deployed Render database contains real merchant/customer production data."` (project owner, 2026-09-07). |
| **Not to be implemented until this record is `RESOLVED`** | ~~Any Phase 2b or Phase 4 planning that assumes a specific production-data shape.~~ **CLEARED 2026-09-07 — planning may proceed on the assumption of real production data.** Phase 2b/Phase 4 **execution** (backup, restore, backfill, migration) remains gated on **D8 + G-16** (and Phase 4's own gates) and is **not** cleared by this record. |

### D2 — Decision Log

| Date | Owner | Choice (A / B) | Approval wording (verbatim) | Reference |
|---|---|---|---|---|
| 2026-09-07 | Ops owner (project owner) | **A** — real merchant/customer production data | `"D2: A"` → *"The currently deployed Render database contains real merchant/customer production data."* | D3 record (Dependency row); G-16 record; `PHASE-0-DECISION-RESOLUTION-AND-PHASE-1-SPEC.md §A.1` |

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
| **Consequences** | **Phase 1:** the bootstrap seed / test fixture is framed as "Tenant #1 = the existing merchant" (dev/test only; no production data touched). **Phase 4:** existing catalog / orders / invoices / payments / settings are backfilled to Tenant #1 with verified restore, maintenance window, and pre/post revenue-sum + count reconciliation (Master Plan §25 waves W3–W7). **Phase 2b:** the existing `role=ADMIN` user is migrated to an `OWNER` `TenantMembership` of Tenant #1 (from the D2 live inventory, not before). The chosen tenant display name / slug is to be supplied by the business (see Decision Log "name/slug" note) and is not `default_tenant`. |
| **Affected phase(s)** | Phase 1 (seed framing — now decided), **Phase 4 (defining)**, Phase 15 (production-migration validation); **Phase 2b** (`role=ADMIN` → `OWNER` backfill, D2-gated). |
| **Reversibility** | The *direction* is reversible on paper until Phase 4 executes. After Phase 4 backfills legacy rows and runs the destructive constraint waves, reverting requires a restore from backup (Prisma forward-only). |
| **Dependency (still open)** | **D2 remains unresolved.** Option A is now the chosen direction, but the *scope and rigor* of the Phase 4 migration — and the Phase 2b backfill — still depend on D2 ("does the deployed DB hold real merchant/customer data?"), which **requires authorized data access**. Recording D3=A does **not** imply any statement about the deployed data. |
| **Explicit approval wording (recorded)** | `"D3: A — The existing deployment/store becomes Tenant #1."` (project owner, 2026-09-06). |
| **Not to be implemented until this record is `RESOLVED`** | ~~The Phase 1 bootstrap seed's framing; any Phase 4 backfill; any assignment of a live `role=ADMIN` user to an `OWNER` membership.~~ **The seed framing is decided (Phase 1, dev/test only).** Phase 4 backfill and the **Phase 2b** live `role=ADMIN` → `OWNER` assignment remain gated on **D2 + the verified restore drill (D8) + G-16**. |

### D3 — Decision Log

| Date | Owner | Choice (A / B) | Approval wording (verbatim) | Reference |
|---|---|---|---|---|
| 2026-09-06 | Business owner (project owner) | **A** — existing deployment becomes Tenant #1 | `"D3: A"` → *"The existing deployment/store becomes Tenant #1."* | Phase 1 spec §B.3; Master Plan §4.4-D3. Tenant display name / slug: **to be supplied by the business before the Phase 4 backfill** (must not be `default_tenant`). |
| 2026-09-06 | (cross-reference) | **P2-D7 re-scope preserves D3** | Owner note on P2-D7: *"D3's 'no implicit privileges' rule remains intact. Do NOT use Tenant #1 as an implicit customer-auth context."* | P2-D7 record; `PHASE-2-DECISION-CLOSURE.md §6.4` |

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
| **Consequences** | **Phase 1:** `User` is documented as platform/merchant identity only; `TenantMembership` as merchant-only; the Phase 1 doc comments name the future storefront-identity root (`Customer`) without creating it. **Phase 2:** ~~adds `Customer` (`(storeId, email)` unique) + `CustomerRefreshToken` + a store-scoped customer auth flow + separate token audiences; adds `customerId` (nullable) alongside every `userId` on tenant-owned tables.~~ **[CORRECTED — see below]** adds the `Customer` model (`(storeId, email)` unique) as the store-scoped storefront-identity root, plus a D2-gated identity **backfill** of additive rows (`role='ADMIN'` → `OWNER` membership; `role='CUSTOMER'` → `Customer` rows under Tenant #1's primary store). **Customer authentication runtime + `CustomerRefreshToken` table + customer token issuance are deferred to Phase 9/12 (P2-D7).** **Phase 4:** adds `customerId` (nullable) to the six commerce tables (`orders`, `carts`, `reviews`, `coupon_usages`, `idempotency_keys`, `uploaded_files`) + `OrderStatusHistory` actor columns, and re-points those FK families from `userId` to `customerId`; count reconciliation. **Phase 15:** drops the legacy `userId` columns and the `CUSTOMER` enum value (wave W9). **Phase 12:** storefront auth is store-contextual. |
| **Affected phase(s)** | Phase 1 (design — now decided), **Phase 2 (Customer model + backfill)**, **Phase 4 (large — `customerId` columns + re-pointing)**, **Phase 9/12 (customer auth runtime)**, Phase 15 (legacy removal). |
| **Reversibility** | ~~Direction is reversible until Phase 2 adds `Customer` + `customerId`.~~ **[CORRECTED — see below]** Direction is reversible until **Phase 2 creates the `Customer` model** and **Phase 2b backfills `Customer` rows**; after that (and the Phase 4 `customerId` re-pointing) reverting = schema surgery + restore. |
| **Correction (2026-09-06 — approved via G-18)** | The original **Consequences** and **Reversibility** wording (struck through above) stated that **Phase 2** *"adds `customerId` (nullable) alongside every `userId` on tenant-owned tables"* and was reversible *"until Phase 2 adds `Customer` + `customerId`"*. This **misattributed** the `customerId`-column work. Per **Master Plan §10** (Phase 4 — Data Ownership Migration, which lists `customerId` on `Cart`/`Order`/`Review`/`UploadedFile`/`CouponUsage`/`IdempotencyKey`/`OrderStatusHistory` **by name**) and **Master Plan §8** (twice defers the re-pointing *"to Phase 4"*), the authoritative boundary is: **Phase 2 = `Customer` identity foundation** (model + D2-gated additive backfill of rows); **Phase 4 = `customerId`/ownership columns on existing commerce tables + re-pointing of existing commerce data**; **D2 = production reconciliation/backfill authorization, tracked separately**. This correction does **not** change the owner's D5 decision (a separate store-scoped `Customer` entity). |
| **Explicit approval wording (recorded)** | `"D5: A — Use a separate store-scoped Customer entity."` (project owner, 2026-09-06). Correction: `"G-18: APPROVE — correct the D5 consequence/reversibility wording"` (project owner, 2026-09-06). |
| **Not to be implemented until this record is `RESOLVED`** | ~~Any `Customer` table; any `customerId` column; any customer-auth flow; the Phase 1 doc comments that name the future storefront-identity root.~~ **The identity direction is decided.** The **`Customer` model** is Phase 2 (see P2-D11, P2-D12); the **`customerId` columns** on commerce tables are **Phase 4** (see the correction); the **customer-auth flow** is **Phase 9/12** (see P2-D7). |

### D5 — Decision Log

| Date | Owner | Choice (a / b) | Approval wording (verbatim) | Reference |
|---|---|---|---|---|
| 2026-09-06 | Product + architecture owner (project owner) | **(a)** — separate store-scoped `Customer` entity | `"D5: A"` → *"Use a separate store-scoped Customer entity."* | Phase 1 spec §B.4, §B.6; Master Plan §4.4-D5; frozen architecture ("customer identity is store-scoped"). |
| 2026-09-06 | Architecture owner (project owner) | **G-18 correction to narrative fields** | `"G-18: APPROVE — correct the D5 consequence/reversibility wording"` → *"…so it no longer incorrectly states that customerId is added to existing tenant-owned tables in Phase 2."* | `PHASE-2-DECISION-RESOLUTION-AND-SPEC.md §A.4`; `PHASE-2-DECISION-CLOSURE.md §17.1`; Master Plan §8, §10. The owner's D5 decision (option a) is unchanged. |

---

## D6 — Tenant-context derivation for the merchant console

| Field | Content |
|---|---|
| **ID** | D6 |
| **Decision (question)** | How does a merchant-console request derive **which tenant** it is operating on (host / subdomain / an explicit `X-Active-Tenant` header that must match a membership, else 403), so that a tenant-scoped `PermissionsGuard` can select the membership whose permissions to check? |
| **Owner** | Architecture owner + product |
| **Date** | 2026-09-06 |
| **Status** | **DEFERRED — Phase 3 (Phase 2 re-scoped; approved via G-17)** |
| **Decision (approved option)** | **DEFER WITH APPROVED RE-SCOPE.** D6 is **not resolved** here. Instead, **Phase 2 is explicitly re-scoped** (G-17) so that all D6-dependent work — tenant-context derivation, the `@Roles → @RequirePermission` swap, `PermissionsGuard` activation, cross-tenant enforcement, scoped Prisma / query enforcement — is **deferred to Phase 3**. No tenant-context mechanism is chosen, invented, or implemented in Phase 2. |
| **Rationale** | The owner explicitly directed: *"D6: DEFER WITH APPROVED RE-SCOPE. Do not invent tenant-context behavior. Do not implement tenant-context middleware. Do not implement scoped Prisma. Do not implement cross-tenant authorization."* Master Plan §8 lists D6 as a Phase 2 dependency **and** lists "permission guard live" as a Phase 2 exit criterion — not both satisfiable while D6 is OPEN. The re-scope resolves that tension by moving the permission machinery to Phase 3 (Master Plan §9), where `TenantContext` is built and which already lists *"Phase 2 (membership + permissions + Customer)"* as its input. |
| **Source document / section** | Master Plan §8 DEPENDENCIES ("D6 (context derivation)"), §8 EXIT CRITERIA; Master Plan §9 (Phase 3 — Tenant Context & Authorization); `PHASE-0.5-DECISION-STATUS.md` (D6 "SAFE TO DEFER"); `PHASE-2-DECISION-RESOLUTION-AND-SPEC.md §A.6`; `PHASE-2-DECISION-CLOSURE.md §11, §15.2`; P2-D9 record. |
| **Consequences** | **Phase 2:** the merchant `JwtStrategy` loads membership **facts** + `platformRole` into `AuthenticatedUser` (identity representation only — no active-tenant selection); `RolesGuard` + `@Roles(Role.ADMIN)` remain the **unchanged** live authorization mechanism for the single global admin surface. **Phase 3:** D6 is resolved (host / subdomain / `X-Active-Tenant`), `TenantContext` is built, the guard swap happens, `PermissionsGuard` goes live. **The Phase 2 START GATE gains a Phase 2a / Phase 2b split** (documented under G-17) as a consequence of this re-scope. |
| **Affected phase(s)** | **Phase 3 (defining — D6 resolved and consumed there)**. Phase 2 is re-scoped to exclude D6-dependent work. |
| **Reversibility** | Fully reversible — D6 is deferred, not decided. Phase 3 records the actual owner decision on the derivation mechanism. |
| **Explicit approval wording (recorded)** | `"D6: DEFER WITH APPROVED RE-SCOPE"` → *"Phase 2 is explicitly re-scoped so D6-dependent tenant context and customer-auth activation are deferred to Phase 3/9/12 as documented."* (project owner, 2026-09-06). |
| **Not to be implemented until this record is `RESOLVED`** | Any tenant-context middleware / interceptor; any active-tenant resolution or `X-Active-Tenant` handling; any tenant-scoped Prisma client; any `PermissionsGuard` wired to a route; any `@Roles → @RequirePermission` swap. **All of the above are Phase 3.** |

### D6 — Decision Log

| Date | Owner | Choice | Approval wording (verbatim) | Reference |
|---|---|---|---|---|
| 2026-09-06 | Architecture owner + product (project owner) | **DEFER WITH APPROVED RE-SCOPE** | `"D6: DEFER WITH APPROVED RE-SCOPE"`; `"G-17: APPROVE — Phase 2 is explicitly re-scoped so D6-dependent tenant context and customer-auth activation are deferred to Phase 3/9/12 as documented."` | `PHASE-2-DECISION-CLOSURE.md §11`; Master Plan §9; P2-D9 / G-17 records |

---

## G-4 — Phase 1 specification approval

| Field | Content |
|---|---|
| **ID** | G-4 |
| **Decision (question)** | Does the architecture owner approve `PHASE-0-DECISION-RESOLUTION-AND-PHASE-1-SPEC.md` **§B.2–B.8** as the contract for Phase 1 implementation? |
| **Owner** | Architecture owner |
| **Date** | 2026-09-06 |
| **Status** | **APPROVED** |
| **Decision (approved option)** | **APPROVE** — `PHASE-0-DECISION-RESOLUTION-AND-PHASE-1-SPEC.md §B.2–B.8` is accepted, unchanged, as the Phase 1 contract. |
| **Rationale** | The owner has explicitly approved the spec. It is a faithful decomposition of Master Plan §7 (Phase 1): the six named models only, additive-only, non-enforcing, one-primary-store-per-tenant, roles on `TenantMembership`, `SUPER_ADMIN` deferred to Phase 2. |
| **Source document / section** | `PHASE-0-DECISION-RESOLUTION-AND-PHASE-1-SPEC.md §B.2–B.8`, §B.12 (G-4); Master Plan §7; `PHASE-0.5-DECISION-CLOSURE.md §9`. |
| **Consequences** | Phase 1 has an agreed contract. *(Phase 1 is now ACCEPTED — `c3fc160` + `76fd26e`.)* |
| **Affected phase(s)** | Phase 1 directly; the foundational models are consumed by Phases 2–9. |
| **Reversibility** | The spec can be re-versioned before or during implementation via a recorded change. |
| **Explicit approval wording (recorded)** | `"G-4: APPROVE — APPROVE the Phase 1 specification."` (project owner, 2026-09-06). |
| **Not to be implemented until this record is `APPROVED`** | ~~Any Phase 1 model, migration, module, or seed.~~ **CLEARED 2026-09-06.** |

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
| **Decision (approved option)** | **APPROVE as proposed.** Ratified: `TenantStatus` = {ACTIVE, SUSPENDED, PENDING_DELETION, DELETED}; `StoreStatus` = {ACTIVE, DISABLED, DRAFT}; `MembershipStatus` = {ACTIVE, INVITED, SUSPENDED}; `DomainVerificationStatus` = {PENDING, VERIFIED, FAILED}. Confirmed verbatim: `TenantRole` = {OWNER, ADMIN, STAFF, VIEWER}; `SubscriptionStatus` = {PENDING, TRIALING, ACTIVE, PAST_DUE, PAUSED, CANCELLED, EXPIRED} (7 states, no additions). |
| **Rationale** | The owner has explicitly approved the proposed sets. The four `*Status` sets map cleanly to frozen §7/§12/§18; the two role/subscription enums are non-negotiable and are confirmed used verbatim. |
| **Source document / section** | `PHASE-0-DECISION-RESOLUTION-AND-PHASE-1-SPEC.md §B.6`, §B.12 (G-5); Master Plan §7; frozen architecture §7, §12, §18; `PHASE-0.5-DECISION-CLOSURE.md §10`. |
| **Consequences** | The Phase 1 migration writes exactly these `CREATE TYPE`s. |
| **Affected phase(s)** | Phase 1 (`CREATE TYPE`s); `TenantStatus`/`StoreStatus`/`SubscriptionStatus` read by Phase 5 control planes and Phase 7 billing; `DomainVerificationStatus` by Phase 9. |
| **Reversibility** | Enum additions later are possible; renames/removals after data exists are not clean — hence the gate is satisfied pre-migration. |
| **Explicit approval wording (recorded)** | `"G-5: APPROVE — APPROVE the proposed lifecycle/status enum sets and ratify TenantRole and SubscriptionStatus as specified."` (project owner, 2026-09-06). |
| **Not to be implemented until this record is `APPROVED`** | ~~The `CREATE TYPE` statements in the Phase 1 migration.~~ **CLEARED 2026-09-06.** |

### G-5 — Decision Log

| Date | Owner | Choice | Approval wording (verbatim) | Reference |
|---|---|---|---|---|
| 2026-09-06 | Architecture owner (project owner) | **APPROVE AS PROPOSED** | `"G-5: APPROVE"` → *"APPROVE the proposed lifecycle/status enum sets and ratify TenantRole and SubscriptionStatus as specified."* | `PHASE-0-DECISION-RESOLUTION-AND-PHASE-1-SPEC.md §B.6` |

---

## G-9 — Pre-migration snapshot approval

| Field | Content |
|---|---|
| **ID** | G-9 |
| **Decision (question)** | Does ops approve that a routine database backup / snapshot is taken and its identifier recorded **immediately before** the Phase 1 additive migration is applied to any shared environment, per `DEPLOYMENT.md §3`? |
| **Owner** | Ops |
| **Date** | 2026-09-06 |
| **Status** | **APPROVED** |
| **Decision (approved option)** | **APPROVE** the routine pre-migration snapshot requirement for shared-environment deployments. |
| **Rationale** | Standard `DEPLOYMENT.md §3` practice and a recorded restore point even for an additive, compensating-reversible migration. **This is NOT the full verified restore drill** — that remains a hard precondition for **Phase 4** and for the **Phase 2b backfill** (see D8 / G-16). |
| **Source document / section** | `docs/ops/DEPLOYMENT.md §3`, §11; `docs/ops/BACKUP-RESTORE.md` ("DOCUMENTED — NOT VERIFIED"); Master Plan Principle #5; `PHASE-0-DECISION-RESOLUTION-AND-PHASE-1-SPEC.md §B.12 (G-9)`; `PHASE-0.5-DECISION-CLOSURE.md §11`. |
| **Consequences** | The Phase 1 additive migration is applied to shared environments only with a recorded snapshot id. Execution-time condition. |
| **Affected phase(s)** | Phase 1 execution. The verified restore drill is separately gated before Phase 4 and Phase 2b. |
| **Reversibility** | N/A (safety step). |
| **Explicit approval wording (recorded)** | `"G-9: APPROVE — APPROVE the routine pre-migration snapshot requirement for shared-environment deployments."` (project owner, 2026-09-06). |
| **Not to be implemented until this record is `APPROVED`** | ~~Applying the Phase 1 migration to staging or production.~~ **Requirement APPROVED 2026-09-06.** |

### G-9 — Decision Log

| Date | Owner | Choice (APPROVE / REJECT) | Approval wording (verbatim) | Reference |
|---|---|---|---|---|
| 2026-09-06 | Ops (project owner) | **APPROVE** | `"G-9: APPROVE"` → *"APPROVE the routine pre-migration snapshot requirement for shared-environment deployments."* | `DEPLOYMENT.md §3` |

---

## G-10 — Additive-only migration CI check approval

| Field | Content |
|---|---|
| **ID** | G-10 |
| **Decision (question)** | Does the architecture owner approve adding a CI gate — as part of the Phase 1 work — that asserts the Phase 1 migration `.sql` contains no `ALTER TABLE` on an existing table, no `DROP`, and no `NOT NULL`-add (spec AC-10)? |
| **Owner** | Architecture owner |
| **Date** | 2026-09-06 |
| **Status** | **APPROVED** *(see G-19 for the Phase 2 evolution)* |
| **Decision (approved option)** | **APPROVE** inclusion of the additive-only migration CI check in Phase 1 scope. Implemented as `backend/src/migration-safety.spec.ts` (`findAdditiveOnlyViolations`). |
| **Rationale** | Makes spec AC-10 machine-enforced; mitigates Phase 1 risk P1-R6 (scope creep). |
| **Source document / section** | `PHASE-0-DECISION-RESOLUTION-AND-PHASE-1-SPEC.md §B.12 (G-10)`, AC-10, risk P1-R6; `PHASE-0.5-DECISION-CLOSURE.md §12`; `backend/src/migration-safety.spec.ts`. |
| **Consequences** | The additive-only boundary is machine-enforced from Phase 1 onward. **The detector as built rejects any `ALTER TABLE` on a table not created in the same migration file** — which conflicts with Phase 2's additive `users ADD COLUMN "platformRole"`. That evolution is decided in **G-19**. |
| **Affected phase(s)** | Phase 1 (built); every later additive wave. **Phase 2 (evolution — G-19).** |
| **Reversibility** | Yes — a CI check can be refined or relaxed via a recorded change (that record is G-19). |
| **Explicit approval wording (recorded)** | `"G-10: APPROVE — APPROVE inclusion of the additive-only migration CI check in Phase 1 scope."` (project owner, 2026-09-06). |
| **Not to be implemented until this record is `APPROVED`** | ~~The CI check itself.~~ **CLEARED 2026-09-06.** *(Now in `main` at `76fd26e`.)* |

### G-10 — Decision Log

| Date | Owner | Choice (APPROVE / REJECT) | Approval wording (verbatim) | Reference |
|---|---|---|---|---|
| 2026-09-06 | Architecture owner (project owner) | **APPROVE** | `"G-10: APPROVE"` → *"APPROVE inclusion of the additive-only migration CI check in Phase 1 scope."* | `PHASE-0-DECISION-RESOLUTION-AND-PHASE-1-SPEC.md §B.12 (G-10)`, AC-10 |
| 2026-09-06 | Architecture owner (project owner) | **G-19: extend for approved additive `ALTER … ADD COLUMN`** | see G-19 record | `PHASE-2-DECISION-CLOSURE.md §17.2` |

---

# Phase 2 Decision Records (recorded 2026-09-06)

> Source: owner decisions supplied to the "PRINTFORGE — RECORD PHASE 2 OWNER DECISIONS + RE-SCOPE"
> task (2026-09-06). Analysis basis: `PHASE-2-DECISION-RESOLUTION-AND-SPEC.md`,
> `PHASE-2-DECISION-CLOSURE.md`, Master Plan §8/§9/§10.

---

## P2-D1 — Platform super-admin representation

| Field | Content |
|---|---|
| **ID** | P2-D1 |
| **Decision (question)** | Represent the platform super-admin role as (i) a nullable `PlatformRole` enum field on `User`, or (ii) a boolean `User.isPlatformSuperAdmin` (+ audit)? |
| **Owner** | Architecture owner |
| **Date** | 2026-09-06 |
| **Status** | **RESOLVED — OPTION (i)** |
| **Decision (approved option)** | **`PlatformRole` will be represented as a `PlatformRole` enum field on `User`.** New enum `PlatformRole { SUPER_ADMIN }`. |
| **Rationale** | Owner's explicit choice. Matches Master Plan §8 verbatim: *"propose a `PlatformRole` nullable field on `User` so it's extensible."* Keeps `SUPER_ADMIN` first-class (invariant 4) and extensible without a boolean explosion. |
| **Source document / section** | Master Plan §8 DATABASE/DATA IMPACT; `PHASE-2-DECISION-RESOLUTION-AND-SPEC.md §A.2 (P2-D1), §B.3, §B.6`; `PHASE-2-DECISION-CLOSURE.md §5 (P2-D1), §8`. |
| **Consequences** | **Phase 2a:** `CREATE TYPE "PlatformRole" AS ENUM ('SUPER_ADMIN')`; `ALTER TABLE "users" ADD COLUMN "platformRole" "PlatformRole"` (nullable — see P2-D2, subject to G-19); `PlatformGuard` + `@PlatformOnly()` check `platformRole === SUPER_ADMIN`. No route consumes `@PlatformOnly()` until the platform console (Phase 5). |
| **Affected phase(s)** | Phase 2a (column + guard); Phase 5 (platform console reads it). |
| **Reversibility** | Reversible pre-backfill — additive nullable column + enum; compensating `DROP COLUMN` / `DROP TYPE` safe while unreferenced. |
| **Explicit approval wording (recorded)** | `"P2-D1: PlatformRole will be represented as a PlatformRole enum field on User."` (project owner, 2026-09-06). |

### P2-D1 — Decision Log

| Date | Owner | Choice | Approval wording (verbatim) | Reference |
|---|---|---|---|---|
| 2026-09-06 | Architecture owner (project owner) | **(i) `PlatformRole` enum field** | `"P2-D1: PlatformRole will be represented as a PlatformRole enum field on User."` | Master Plan §8; `PHASE-2-DECISION-CLOSURE.md §5` |

---

## P2-D2 — `platformRole` nullability & default

| Field | Content |
|---|---|
| **ID** | P2-D2 |
| **Decision (question)** | Is `User.platformRole` nullable, and does it have a default? |
| **Owner** | Architecture owner |
| **Date** | 2026-09-06 |
| **Status** | **RESOLVED** |
| **Decision (approved option)** | **`User.platformRole` is nullable with no default.** `NULL` = not a platform admin. |
| **Rationale** | Owner's explicit choice. Matches Master Plan §8 ("nullable field"). A non-null default would silently grant/deny platform scope on migration; `NULL` default is the safe additive choice. |
| **Source document / section** | Master Plan §8; `PHASE-2-DECISION-RESOLUTION-AND-SPEC.md §A.2 (P2-D2), §B.6`; `PHASE-2-DECISION-CLOSURE.md §5 (P2-D2), §8`. |
| **Consequences** | The `ADD COLUMN` leaves every existing `users` row `platformRole = NULL`; no row rewrite. The Phase 2b backfill sets `platformRole` for **zero** users unless an owner explicitly designates a platform super-admin in writing (AC-P2-27). |
| **Affected phase(s)** | Phase 2a. |
| **Reversibility** | Reversible. |
| **Explicit approval wording (recorded)** | `"P2-D2: User.platformRole is nullable with no default."` (project owner, 2026-09-06). |

### P2-D2 — Decision Log

| Date | Owner | Choice | Approval wording (verbatim) | Reference |
|---|---|---|---|---|
| 2026-09-06 | Architecture owner (project owner) | **nullable, no default** | `"P2-D2: User.platformRole is nullable with no default."` | Master Plan §8 |

---

## P2-D3 — Customer refresh-token storage

| Field | Content |
|---|---|
| **ID** | P2-D3 |
| **Decision (question)** | Store customer refresh tokens in (i) a separate `CustomerRefreshToken` table, or (ii) a `customerId?` column on the existing `RefreshToken`? |
| **Owner** | Architecture owner |
| **Date** | 2026-09-06 |
| **Status** | **RESOLVED — OPTION (i) (design FROZEN; table creation deferred to Phase 9/12 — see Consequences)** |
| **Decision (approved option)** | **`CustomerRefreshToken` will be a separate table** (not a `customerId` column on `RefreshToken`). |
| **Rationale** | Owner's explicit choice. Matches Master Plan §8 verbatim: *"cleaner separation; propose separate table."* Also avoids an `ALTER TABLE "refresh_tokens"` that would require a G-10/G-19 carve-out; gives structural (not just logical) isolation of customer vs merchant sessions and reuse-detection scoping. |
| **Source document / section** | Master Plan §8 DATABASE/DATA IMPACT; `PHASE-2-DECISION-RESOLUTION-AND-SPEC.md §A.2 (P2-D3), §B.5, §B.11.3`; `PHASE-2-DECISION-CLOSURE.md §5 (P2-D3), §9`. |
| **Consequences** | The **design is FROZEN** (separate table, mirroring `RefreshToken`: `id, customerId FK, tokenHash, expiresAt, revokedAt?, replacedByTokenId?, createdAt`). **The table-creation migration is deferred to Phase 9/12** with the customer-auth runtime: per the owner's P2-D7 re-scope, customer authentication (the only consumer of `CustomerRefreshToken`) is deferred, and the owner's Phase 2a list qualifies this item *"if the approved architecture requires creating the table now"* — with customer auth deferred, no Phase 2a/2b code or migration references it, so it is not required now. *(If the owner prefers the empty additive table created in Phase 2a for schema forward-consistency, that is a one-line spec change — flagged in the final report.)* |
| **Affected phase(s)** | **Phase 9/12** (table creation + customer refresh runtime). Design decision recorded now so Phase 9/12 carries no ambiguity. |
| **Reversibility** | Reversible — design decision only; nothing built. |
| **Explicit approval wording (recorded)** | `"P2-D3: CustomerRefreshToken will be a separate table."` (project owner, 2026-09-06). |

### P2-D3 — Decision Log

| Date | Owner | Choice | Approval wording (verbatim) | Reference |
|---|---|---|---|---|
| 2026-09-06 | Architecture owner (project owner) | **(i) separate table** | `"P2-D3: CustomerRefreshToken will be a separate table."` | Master Plan §8; `PHASE-2-DECISION-CLOSURE.md §9` |

---

## P2-D4 — Merchant access-token payload shape

| Field | Content |
|---|---|
| **ID** | P2-D4 |
| **Decision (question)** | Fat merchant token `{ sub, email, platformRole?, memberships[], tokenVersion }` vs thin `{ sub, tokenVersion }` + fresh server-side lookup? |
| **Owner** | Architecture owner |
| **Date** | 2026-09-06 |
| **Status** | **RESOLVED — THIN** |
| **Decision (approved option)** | **Merchant tokens remain thin.** Memberships + `platformRole` are resolved fresh in `JwtStrategy.validate` each request (as the file's doc comment already prefers). |
| **Rationale** | Owner's explicit choice. Matches Master Plan §8 verbatim: *"recommend keeping the token thin and resolving memberships + active context server-side each request."* A membership revoked/added mid-session takes effect on the next request; no stale-privilege window; smaller token. |
| **Source document / section** | Master Plan §8 BACKEND IMPACT (Token/session); `PHASE-2-DECISION-RESOLUTION-AND-SPEC.md §A.2 (P2-D4), §B.9`; `PHASE-2-DECISION-CLOSURE.md §5 (P2-D4), §10`. |
| **Consequences** | **Phase 2a:** `JwtStrategy.validate` keeps the `tokenVersion` re-check and additionally loads `TenantMembership` (`status=ACTIVE`) + `platformRole`. `AuthenticatedUser` becomes `{ id, email, platformRole: PlatformRole \| null, memberships: {tenantId, role}[] }` (+ transitional `role` during the dual-read window). **No active-tenant field** (that is Phase 3). One indexed membership lookup per authenticated request. **No `tokenVersion` bump.** |
| **Affected phase(s)** | Phase 2a (token shape + strategy); Phase 3 (active-tenant resolution builds on the fresh lookup). |
| **Reversibility** | Reversible within one refresh-TTL window. |
| **Explicit approval wording (recorded)** | `"P2-D4: Merchant tokens remain thin."` (project owner, 2026-09-06). |

### P2-D4 — Decision Log

| Date | Owner | Choice | Approval wording (verbatim) | Reference |
|---|---|---|---|---|
| 2026-09-06 | Architecture owner (project owner) | **thin** | `"P2-D4: Merchant tokens remain thin."` | Master Plan §8 |

---

## P2-D5 — Customer access-token shape + audience

| Field | Content |
|---|---|
| **ID** | P2-D5 |
| **Decision (question)** | Confirm the customer access-token payload shape and its audience separation from merchant tokens. |
| **Owner** | Architecture owner + security owner |
| **Date** | 2026-09-06 |
| **Status** | **RESOLVED (design FROZEN; runtime implementation deferred to Phase 9/12 per P2-D7)** |
| **Decision (approved option)** | Customer access-token shape: **`{ sub: customerId, storeId, tokenVersion, aud }`**. The `aud` (audience) claim separates customer from merchant tokens: a token minted for one audience is rejected by the other guard (401/403, no existence leak). |
| **Rationale** | Owner's explicit choice. Matches Master Plan §8 ("Customer token is separate (`{ sub: customerId, storeId, tokenVersion }`)") plus the §8 KEY RISKS mandatory mitigation ("separate token audiences … a token minted for one audience is rejected by the other"). |
| **Source document / section** | Master Plan §8 BACKEND IMPACT, KEY RISKS; `PHASE-2-DECISION-RESOLUTION-AND-SPEC.md §A.2 (P2-D5), §B.9`; `PHASE-2-DECISION-CLOSURE.md §5 (P2-D5), §10`. |
| **Consequences** | **Design recorded now** so Phase 9/12 carries no ambiguity. **Runtime (token issuance, customer JWT strategy/guard, `AuthenticatedCustomer { id, storeId, tenantId }`) is deferred to Phase 9/12** — per P2-D7, customer authentication is not implemented in Phase 2. The `storeId` claim presupposes the store is known at login, which requires the deferred Phase 9 Domain→Store→Tenant resolution. |
| **Affected phase(s)** | **Phase 9/12** (customer auth runtime). Design fixed now. |
| **Reversibility** | Reversible (token content, one TTL window) — and nothing is built in Phase 2. |
| **Explicit approval wording (recorded)** | `"P2-D5: Customer token shape: {sub: customerId, storeId, tokenVersion, aud}"` (project owner, 2026-09-06). |

### P2-D5 — Decision Log

| Date | Owner | Choice | Approval wording (verbatim) | Reference |
|---|---|---|---|---|
| 2026-09-06 | Architecture + security owner (project owner) | **`{sub: customerId, storeId, tokenVersion, aud}`** | `"P2-D5: Customer token shape: {sub: customerId, storeId, tokenVersion, aud}"` | Master Plan §8; deferred to Phase 9/12 per P2-D7 |

---

## P2-D6 — Customer-auth route family

| Field | Content |
|---|---|
| **ID** | P2-D6 |
| **Decision (question)** | Customer auth at a new `/storefront/auth/*` route family, or store-host-scoped `/auth/*`? |
| **Owner** | Architecture owner |
| **Date** | 2026-09-06 |
| **Status** | **RESOLVED (intended route family recorded; runtime deferred to Phase 9/12 per P2-D7)** |
| **Decision (approved option)** | **The intended customer-authentication route family is `/storefront/auth/*`.** |
| **Rationale** | Owner's explicit choice. `/storefront/auth/*` keeps the customer-auth surface distinct from merchant `/auth/*`; the store-host-scoped alternative requires runtime Domain→Store→Tenant resolution, which is Phase 9. |
| **Source document / section** | Master Plan §8 BACKEND IMPACT; `PHASE-2-DECISION-RESOLUTION-AND-SPEC.md §A.2 (P2-D6), §B.8`; `PHASE-2-DECISION-CLOSURE.md §5 (P2-D6), §10`. |
| **Consequences** | **Route family recorded now.** **No `/storefront/auth/*` endpoints, login flow, refresh runtime, token issuance, or token-validation middleware are implemented in Phase 2** (P2-D7 re-scope; owner's "PHASE 2 SHALL NOT" list). Built in Phase 9/12 with store-domain-aware resolution. |
| **Affected phase(s)** | **Phase 9/12** (customer auth runtime). Route family fixed now. |
| **Reversibility** | Reversible (routing) — nothing built in Phase 2. |
| **Explicit approval wording (recorded)** | `"P2-D6: The intended customer authentication route family is: /storefront/auth/*"` (project owner, 2026-09-06). |

### P2-D6 — Decision Log

| Date | Owner | Choice | Approval wording (verbatim) | Reference |
|---|---|---|---|---|
| 2026-09-06 | Architecture owner (project owner) | **`/storefront/auth/*`** | `"P2-D6: The intended customer authentication route family is: /storefront/auth/*"` | Master Plan §8; deferred to Phase 9/12 per P2-D7 |

---

## P2-D7 — Customer-auth Store identification (CRITICAL re-scope)

| Field | Content |
|---|---|
| **ID** | P2-D7 |
| **Decision (question)** | How does a customer-auth request identify its target `Store` before Phase 9 runtime Domain→Store→Tenant resolution exists? |
| **Owner** | Architecture owner + product owner |
| **Date** | 2026-09-06 |
| **Status** | **RESOLVED — OPTION 3 (DEFER customer authentication to Phase 9/12)** |
| **Decision (approved option)** | **OPTION 3 — customer authentication is deferred to Phase 9/12.** No pre-Phase-9 Store-identification mechanism is invented. **No implicit Tenant #1 context.** **Tenant #1 is not used as an implicit customer-auth context.** D3's "no implicit privileges" rule remains intact. |
| **Rationale** | Owner's explicit choice and the critical re-scope decision. `Customer` is `@@unique([storeId, email])`; the server must know the store to create or authenticate a customer, and the only correct mechanism for that (Phase 9 host resolution) does not yet exist. Options 1 (explicit store parameter) and 2 (Tenant #1 assumption) were both rejected — the owner chose to defer customer auth entirely rather than ship an interim mechanism. This eliminates the G-14 blocker and shrinks Phase 2 to the identity/data foundation. |
| **Source document / section** | `PHASE-2-DECISION-RESOLUTION-AND-SPEC.md §A.2 (P2-D7)`; `PHASE-2-DECISION-CLOSURE.md §6, §7 (dedicated decision form)`; `PHASE-2-IMPLEMENTATION-REPORT.md §8`; Master Plan §8, §9 (Phase 9 domain resolution). |
| **Consequences** | **Phase 2 SHALL NOT implement:** customer-auth endpoints; customer login flow; customer refresh-token runtime; customer token issuance; customer token validation middleware. **Phase 2a** delivers only the identity/data foundation: `PlatformRole`, `User.platformRole?`, the **`Customer` model** (needed for the Phase 2b backfill and Phase 4 FK re-pointing), merchant `JwtStrategy` identity extension, `PlatformGuard`, compatibility structures, tests. **`CustomerRefreshToken` table + `/storefront/auth/*` + customer token issuance/validation → Phase 9/12.** **G-14 is NOT REQUIRED for Phase 2** as a direct result. |
| **Affected phase(s)** | **Defines Phase 2 scope.** **Phase 9/12** own customer authentication and store-domain-aware runtime. |
| **Reversibility** | Fully reversible — nothing is built for customer auth in Phase 2. |
| **Explicit approval wording (recorded)** | `"P2-D7: OPTION 3 — CUSTOMER AUTHENTICATION IS DEFERRED TO PHASE 9/12. Do NOT invent a pre-Phase-9 Store-identification mechanism. Do NOT use an implicit Tenant #1 context. Do NOT use Tenant #1 as an implicit customer-auth context. D3's 'no implicit privileges' rule remains intact."` (project owner, 2026-09-06). |

### P2-D7 — Decision Log

| Date | Owner | Choice | Approval wording (verbatim) | Reference |
|---|---|---|---|---|
| 2026-09-06 | Architecture + product owner (project owner) | **OPTION 3 — defer customer auth to Phase 9/12** | `"P2-D7: OPTION 3 — CUSTOMER AUTHENTICATION IS DEFERRED TO PHASE 9/12. … D3's 'no implicit privileges' rule remains intact."` | `PHASE-2-DECISION-CLOSURE.md §6–§7`; G-14 (NOT REQUIRED); G-17 (re-scope) |

---

## P2-D8 — Permission catalogue: contents + representation

| Field | Content |
|---|---|
| **ID** | P2-D8 |
| **Decision (question)** | Representation of the `TenantRole → Set<Permission>` map and the permission strings: typed constant vs data table; strings ratified how? |
| **Owner** | Architecture owner + security owner |
| **Date** | 2026-09-06 |
| **Status** | **RESOLVED — TYPED CONSTANT, strings ratified (authoring + activation are Phase 3 — see P2-D9)** |
| **Decision (approved option)** | **The permission catalogue will use the typed-constant representation, with the permission strings explicitly ratified.** |
| **Rationale** | Owner's explicit choice. Matches Master Plan §8 verbatim: *"data or a typed constant — the architecture forbids scattering role names, not a central constant."* The map is a privilege-escalation surface (§8 KEY RISKS: "reviewed as a security artifact") and its strings will be ratified the way G-5 ratified the Phase 1 enum sets. |
| **Source document / section** | Master Plan §8 BACKEND IMPACT (Permission model), KEY RISKS; `PHASE-2-DECISION-RESOLUTION-AND-SPEC.md §A.2 (P2-D8), §A.8`; `PHASE-2-DECISION-CLOSURE.md §5 (P2-D8), §11`. |
| **Consequences** | **Representation is FROZEN (typed constant).** **The catalogue is authored, its strings ratified, and `PermissionsGuard` activated in Phase 3** (P2-D9), where `TenantContext` (D6) provides the active tenant the guard needs. **G-13 is NOT REQUIRED for Phase 2.** Phase 2 does **not** author the permission catalogue — no `src/auth/permissions/` directory is created in Phase 2 (AC-P2-25). |
| **Affected phase(s)** | **Phase 3** (authoring + ratification + activation). Representation choice recorded now. |
| **Reversibility** | Reversible — a typed constant can be revised; a permission rename is a code change + test update. |
| **Explicit approval wording (recorded)** | `"P2-D8: Permission catalogue will use the typed-constant representation, with the permission strings explicitly ratified."` (project owner, 2026-09-06). |

### P2-D8 — Decision Log

| Date | Owner | Choice | Approval wording (verbatim) | Reference |
|---|---|---|---|---|
| 2026-09-06 | Architecture + security owner (project owner) | **typed constant; strings ratified (Phase 3)** | `"P2-D8: Permission catalogue will use the typed-constant representation, with the permission strings explicitly ratified."` | Master Plan §8; P2-D9; G-13 (NOT REQUIRED for Phase 2) |

---

## P2-D9 — `@Roles → @RequirePermission` swap + `PermissionsGuard` activation

| Field | Content |
|---|---|
| **ID** | P2-D9 |
| **Decision (question)** | Does the mechanical `@Roles(Role.ADMIN)` → `@RequirePermission(...)` swap and `PermissionsGuard` activation belong to Phase 2 or Phase 3? |
| **Owner** | Architecture owner + product owner |
| **Date** | 2026-09-06 |
| **Status** | **RESOLVED — PHASE 3** |
| **Decision (approved option)** | **The `@Roles → @RequirePermission` transition and permission-guard activation belongs to Phase 3.** |
| **Rationale** | Owner's explicit choice. A tenant-scoped `PermissionsGuard` needs an **active tenant** to select the membership to check — that resolver is D6, built in Phase 3. Activating the guard in Phase 2 would force an implicit Tenant #1 context (contradicting D3) or fail closed on every admin request. This resolves the internal tension in Master Plan §8 (D6 listed as a Phase 2 dependency **and** "guard live" as a Phase 2 exit criterion). |
| **Source document / section** | Master Plan §8 DEPENDENCIES/EXIT CRITERIA; Master Plan §9; `PHASE-2-DECISION-RESOLUTION-AND-SPEC.md §A.6.3, §A.8`; `PHASE-2-DECISION-CLOSURE.md §5 (P2-D9), §11`; D6 record; G-17. |
| **Consequences** | **Phase 2a:** `@Roles(Role.ADMIN)` + `RolesGuard` remain the **unchanged** live authorization mechanism for the single global admin surface (18 decorator call-sites untouched). No `PermissionsGuard`, no `@RequirePermission`, no permission catalogue authored (AC-P2-25). **Phase 3:** D6 resolved, `TenantContext` built, the swap performed, `PermissionsGuard` goes live, deny-by-default, negative e2e per permission. |
| **Affected phase(s)** | **Phase 3 (defining).** Phase 2 keeps the legacy guard. |
| **Reversibility** | Phase-scoping decision; reversible on paper before implementation. |
| **Explicit approval wording (recorded)** | `"P2-D9: The @Roles → @RequirePermission transition and permission-guard activation belongs to Phase 3."` (project owner, 2026-09-06). |

### P2-D9 — Decision Log

| Date | Owner | Choice | Approval wording (verbatim) | Reference |
|---|---|---|---|---|
| 2026-09-06 | Architecture + product owner (project owner) | **Phase 3** | `"P2-D9: The @Roles → @RequirePermission transition and permission-guard activation belongs to Phase 3."` | Master Plan §9; G-17; D6 record |

---

## P2-D10 — Legacy `User.role` retirement timing

| Field | Content |
|---|---|
| **ID** | P2-D10 |
| **Decision (question)** | When is `User.role` (and the `Role.CUSTOMER` enum value) removed — Phase 2's final contract step, or Phase 4's legacy-removal wave? |
| **Owner** | Architecture owner |
| **Date** | 2026-09-06 |
| **Status** | **RESOLVED — PHASE 4** |
| **Decision (approved option)** | **`User.role` retirement belongs to the Phase 4 legacy-removal wave.** |
| **Rationale** | Owner's explicit choice. Matches Master Plan §8 MIGRATION IMPACT step 3 and §8 KEY RISKS ("contract step is a separate, later migration"). `RolesGuard` reads `user.role` until the Phase 3 guard swap, so the earliest safe drop is after Phase 3 — i.e. Phase 4. |
| **Source document / section** | Master Plan §8 MIGRATION IMPACT, KEY RISKS; Master Plan §10; `PHASE-2-DECISION-RESOLUTION-AND-SPEC.md §A.2 (P2-D10), §B.10`; `PHASE-2-DECISION-CLOSURE.md §5 (P2-D10), §12`. |
| **Consequences** | **Phase 2: `Role` is NOT removed.** `User.role` stays written on merchant registration and read by `RolesGuard` (dual-read). **Phase 4:** destructive `DROP COLUMN "role"` (independently gated on D2 + restore drill), preceded by a CI grep-gate for `\.role` on user objects. `Role.CUSTOMER` value retired in Phase 15 (wave W9). |
| **Affected phase(s)** | **Phase 4** (`DROP COLUMN`); Phase 15 (`CUSTOMER` enum value). |
| **Reversibility** | One-way after the drop (restore-from-backup only) — hence deferred and gated. |
| **Explicit approval wording (recorded)** | `"P2-D10: User.role retirement belongs to the Phase 4 legacy-removal wave."` (project owner, 2026-09-06). |

### P2-D10 — Decision Log

| Date | Owner | Choice | Approval wording (verbatim) | Reference |
|---|---|---|---|---|
| 2026-09-06 | Architecture owner (project owner) | **Phase 4** | `"P2-D10: User.role retirement belongs to the Phase 4 legacy-removal wave."` | Master Plan §8, §10 |

---

## P2-D11 — `Customer` lifecycle field(s)

| Field | Content |
|---|---|
| **ID** | P2-D11 |
| **Decision (question)** | Does `Customer` carry only an `isActive` boolean, or a dedicated `CustomerStatus` enum? |
| **Owner** | Product owner + architecture owner |
| **Date** | 2026-09-06 |
| **Status** | **RESOLVED — `isActive` ONLY** |
| **Decision (approved option)** | **Customer lifecycle uses `isActive` only.** No `CustomerStatus` enum. |
| **Rationale** | Owner's explicit choice. Matches Master Plan §8's field list (which names `isActive` and no `CustomerStatus`) and the existing `User` pattern. Avoids an unratified enum. |
| **Source document / section** | Master Plan §8 DATABASE/DATA IMPACT; `PHASE-2-DECISION-RESOLUTION-AND-SPEC.md §A.2 (P2-D11), §B.5`; `PHASE-2-DECISION-CLOSURE.md §5 (P2-D11), §13`. |
| **Consequences** | **Phase 2a:** `Customer.isActive Boolean @default(true)` — additive column on the new `customers` table. `isActive=false` must block login when customer auth is built (Phase 9/12). If a finer lifecycle is wanted later, adding a `CustomerStatus` enum is a forward migration. |
| **Affected phase(s)** | Phase 2a (schema). |
| **Reversibility** | Reversible — additive; adding an enum later is a forward migration. |
| **Explicit approval wording (recorded)** | `"P2-D11: Customer lifecycle uses isActive only."` (project owner, 2026-09-06). |

### P2-D11 — Decision Log

| Date | Owner | Choice | Approval wording (verbatim) | Reference |
|---|---|---|---|---|
| 2026-09-06 | Product + architecture owner (project owner) | **`isActive` only** | `"P2-D11: Customer lifecycle uses isActive only."` | Master Plan §8 |

---

## P2-D12 — `Customer.tenantId` denormalization integrity

| Field | Content |
|---|---|
| **ID** | P2-D12 |
| **Decision (question)** | Is `Customer.tenantId` a plain denormalized column in Phase 2, with same-store composite-FK enforcement deferred to Phase 4? |
| **Owner** | Architecture owner |
| **Date** | 2026-09-06 |
| **Status** | **RESOLVED** |
| **Decision (approved option)** | **`Customer.tenantId` is a plain column initially; composite-FK hardening belongs to Phase 4.** |
| **Rationale** | Owner's explicit choice. Consistent with the accepted Phase 1 precedent (`Store.tenantId`, `StoreDomain.tenantId` denormalized; composite/same-store FKs deferred to Phase 4 wave W6 / Phase 1 audit NB-7). |
| **Source document / section** | Master Plan §8 ("`tenantId` (denormalized)"), wave W6; Phase 1 audit NB-7; `PHASE-2-DECISION-RESOLUTION-AND-SPEC.md §A.2 (P2-D12), §B.5`; `PHASE-2-DECISION-CLOSURE.md §5 (P2-D12), §13`. |
| **Consequences** | **Phase 2a:** `Customer.tenantId String` + FK → `tenants.id` `ON DELETE RESTRICT` + `@@index([tenantId])`. Integrity of the `(storeId, tenantId)` pair is guarded by the creation/backfill code, not the DB, until Phase 4. **Phase 4:** same-store composite-FK constraint added. Phase 3's scoped Prisma client (D4) is the primary runtime guard in the interim. |
| **Affected phase(s)** | Phase 2a (column); **Phase 4** (composite constraint). |
| **Reversibility** | Reversible; the Phase 4 constraint is the hardening step. |
| **Explicit approval wording (recorded)** | `"P2-D12: Customer.tenantId is a plain column initially; composite-FK hardening belongs to Phase 4."` (project owner, 2026-09-06). |

### P2-D12 — Decision Log

| Date | Owner | Choice | Approval wording (verbatim) | Reference |
|---|---|---|---|---|
| 2026-09-06 | Architecture owner (project owner) | **plain column now; composite FK Phase 4** | `"P2-D12: Customer.tenantId is a plain column initially; composite-FK hardening belongs to Phase 4."` | Master Plan §8; Phase 1 precedent |

---

## P2-D13 — Customer token signing secret

| Field | Content |
|---|---|
| **ID** | P2-D13 |
| **Decision (question)** | Do customer tokens sign with the existing `JWT_ACCESS_SECRET` / `REFRESH_TOKEN_SECRET`, or a distinct secret? (`REQUIRES DECISION-minor`.) |
| **Owner** | Security owner + ops |
| **Date** | 2026-09-06 |
| **Status** | **RESOLVED — DISTINCT SECRET (design FROZEN; provisioning + wiring are Phase 9/12)** |
| **Decision (approved option)** | **Customer tokens use a distinct signing secret** (new optional env var, e.g. `CUSTOMER_JWT_ACCESS_SECRET` + refresh analogue). |
| **Rationale** | Owner's explicit choice. Matches Master Plan §8 ("a distinct secret is cleaner"). A distinct signing key confines the blast radius of a leaked secret to one audience and decouples customer/merchant secret rotation. |
| **Source document / section** | Master Plan §8 INFRASTRUCTURE IMPACT ("`REQUIRES DECISION-minor`"); `PHASE-2-DECISION-RESOLUTION-AND-SPEC.md §A.3 (P2-D13)`; `PHASE-2-DECISION-CLOSURE.md §5 (P2-D13), §14`. |
| **Consequences** | **Design is FROZEN** (distinct secret). **Provisioning the secret in every environment (local, staging, prod) and wiring the customer JWT verification are Phase 9/12**, with the customer-auth runtime — per the owner: *"provisioning is required before any customer token can actually be issued."* No customer token is issued in Phase 2. `env.validation.ts` gains the optional var (defaulting to the shared secret) when customer auth is built. |
| **Affected phase(s)** | **Phase 9/12** (provisioning + wiring). Design fixed now. |
| **Reversibility** | Reversible — env change + one refresh-TTL window; nothing built in Phase 2. |
| **Explicit approval wording (recorded)** | `"P2-D13: Customer tokens use a distinct signing secret."` (project owner, 2026-09-06). |

### P2-D13 — Decision Log

| Date | Owner | Choice | Approval wording (verbatim) | Reference |
|---|---|---|---|---|
| 2026-09-06 | Security owner + ops (project owner) | **distinct secret** | `"P2-D13: Customer tokens use a distinct signing secret."` (`"G-15: APPROVE — distinct customer-token signing secret design; provisioning is required before any customer token can actually be issued."`) | Master Plan §8; G-15 |

---

## G-11 — Phase 2 specification approval

| Field | Content |
|---|---|
| **ID** | G-11 |
| **Owner** | Architecture owner |
| **Date** | 2026-09-06 |
| **Status** | **APPROVED** |
| **Decision (question)** | Approve `PHASE-2-DECISION-RESOLUTION-AND-SPEC.md §B` as the Phase 2 implementation contract, including the Phase 2a / Phase 2b split and the G-19 guard change being in Phase 2 scope? |
| **Decision (approved option)** | **APPROVE** — the Phase 2 specification is the implementation contract, **as re-scoped by P2-D7 / P2-D9 / G-17** (customer-auth runtime → Phase 9/12; permission-guard swap → Phase 3). The contract is delivered in two stages: **Phase 2a** (identity/schema foundation) and **Phase 2b** (D2-gated production identity backfill). |
| **Rationale** | Owner's explicit approval. Analogue of G-4 for Phase 1. The spec is a faithful decomposition of Master Plan §8 with the re-scope applied. |
| **Source document / section** | `PHASE-2-DECISION-RESOLUTION-AND-SPEC.md §B`; `PHASE-2-DECISION-CLOSURE.md §16, §18`; `PHASE-2-START-GATE-RESULT.md`. |
| **Consequences** | The Phase 2a scope, models, enums, migration boundary, backfill boundary, acceptance criteria (`AC-P2-01…27`), and phase deferrals are contractual. The Phase 2a START GATE is **READY** (Phase 2b remains gated on D2/D8/G-16). |
| **Affected phase(s)** | Phase 2 directly. |
| **Reversibility** | The spec can be re-versioned via a recorded change. |
| **Explicit approval wording (recorded)** | `"G-11: APPROVE — Phase 2 specification"` (project owner, 2026-09-06). |

### G-11 — Decision Log

| Date | Owner | Choice | Approval wording (verbatim) | Reference |
|---|---|---|---|---|
| 2026-09-06 | Architecture owner (project owner) | **APPROVE** | `"G-11: APPROVE — Phase 2 specification"` | `PHASE-2-DECISION-RESOLUTION-AND-SPEC.md §B` |

---

## G-12 — `PlatformRole` ratification

| Field | Content |
|---|---|
| **ID** | G-12 |
| **Owner** | Architecture owner |
| **Date** | 2026-09-06 |
| **Status** | **APPROVED** |
| **Decision (question)** | Ratify the `PlatformRole` enum + `User.platformRole?` representation (P2-D1, P2-D2)? |
| **Decision (approved option)** | **APPROVE** — `PlatformRole { SUPER_ADMIN }` enum; `User.platformRole` nullable, no default. Analogue of G-5 (pre-migration enum ratification). |
| **Rationale** | Owner's explicit approval, consistent with P2-D1 / P2-D2 and Master Plan §8. |
| **Source document / section** | P2-D1, P2-D2 records; Master Plan §8; `PHASE-2-DECISION-RESOLUTION-AND-SPEC.md §B.3, §B.6`. |
| **Consequences** | The Phase 2a migration writes `CREATE TYPE "PlatformRole" AS ENUM ('SUPER_ADMIN')` and `ALTER TABLE "users" ADD COLUMN "platformRole" "PlatformRole"` (nullable), subject to G-19. |
| **Affected phase(s)** | Phase 2a. |
| **Reversibility** | Reversible pre-backfill (additive). |
| **Explicit approval wording (recorded)** | `"G-12: APPROVE — PlatformRole ratification"` (project owner, 2026-09-06). |

### G-12 — Decision Log

| Date | Owner | Choice | Approval wording (verbatim) | Reference |
|---|---|---|---|---|
| 2026-09-06 | Architecture owner (project owner) | **APPROVE** | `"G-12: APPROVE — PlatformRole ratification"` | P2-D1, P2-D2 |

---

## G-13 — Permission catalogue ratification

| Field | Content |
|---|---|
| **ID** | G-13 |
| **Owner** | Architecture owner + security owner |
| **Date** | 2026-09-06 |
| **Status** | **NOT REQUIRED FOR PHASE 2** |
| **Decision (question)** | Ratify the permission catalogue (strings + `TenantRole → Set<Permission>` map) for Phase 2? |
| **Decision (recorded)** | **NOT REQUIRED FOR PHASE 2** — permission-catalogue authoring, ratification, and `PermissionsGuard` activation belong to **Phase 3** (per P2-D9). The **representation** choice (typed constant) is recorded in P2-D8. A G-13-equivalent ratification of the exact permission strings will be required **at the start of Phase 3**. |
| **Rationale** | Owner's explicit direction: *"G-13: NOT REQUIRED FOR PHASE 2 — permission catalogue activation belongs to Phase 3."* Full tenant-aware enforcement depends on D6 / Phase 3. |
| **Source document / section** | P2-D8, P2-D9 records; Master Plan §9; `PHASE-2-DECISION-CLOSURE.md §11, §16`. |
| **Consequences** | Phase 2 does not author `src/auth/permissions/` (AC-P2-25). Phase 3 authors + ratifies + activates the catalogue. |
| **Affected phase(s)** | **Phase 3.** |
| **Reversibility** | N/A. |
| **Explicit approval wording (recorded)** | `"G-13: NOT REQUIRED FOR PHASE 2 — permission catalogue activation belongs to Phase 3"` (project owner, 2026-09-06). |

### G-13 — Decision Log

| Date | Owner | Choice | Approval wording (verbatim) | Reference |
|---|---|---|---|---|
| 2026-09-06 | Architecture + security owner (project owner) | **NOT REQUIRED FOR PHASE 2** | `"G-13: NOT REQUIRED FOR PHASE 2 — permission catalogue activation belongs to Phase 3"` | P2-D9 |

---

## G-14 — Customer-auth store-resolution mechanism

| Field | Content |
|---|---|
| **ID** | G-14 |
| **Owner** | Architecture owner + product owner |
| **Date** | 2026-09-06 |
| **Status** | **NOT REQUIRED FOR PHASE 2** (after the approved P2-D7 re-scope) |
| **Decision (question)** | Decide the pre-Phase-9 Store-identification mechanism for customer authentication? |
| **Decision (recorded)** | **NOT REQUIRED FOR PHASE 2.** Per **P2-D7 = OPTION 3**, customer authentication is deferred to Phase 9/12, so no pre-Phase-9 Store-identification mechanism is needed or permitted. Store resolution for customer auth will be the Phase 9 Domain→Store→Tenant runtime resolver. |
| **Rationale** | Owner's explicit direction: *"G-14: NOT REQUIRED FOR PHASE 2 AFTER THE APPROVED P2-D7 RE-SCOPE."* The blocker is dissolved by deferring the work that needed it. |
| **Source document / section** | P2-D7 record; `PHASE-2-DECISION-CLOSURE.md §6, §7`; Master Plan §9. |
| **Consequences** | Phase 2 ships no customer-auth endpoints. The `Customer` **model** is still created in Phase 2a (for the Phase 2b backfill and Phase 4 FK re-pointing), but no request ever authenticates a `Customer` until Phase 9/12. |
| **Affected phase(s)** | **Phase 9/12.** |
| **Reversibility** | N/A. |
| **Explicit approval wording (recorded)** | `"G-14: NOT REQUIRED FOR PHASE 2 AFTER THE APPROVED P2-D7 RE-SCOPE"` (project owner, 2026-09-06). |

### G-14 — Decision Log

| Date | Owner | Choice | Approval wording (verbatim) | Reference |
|---|---|---|---|---|
| 2026-09-06 | Architecture + product owner (project owner) | **NOT REQUIRED FOR PHASE 2** | `"G-14: NOT REQUIRED FOR PHASE 2 AFTER THE APPROVED P2-D7 RE-SCOPE"` | P2-D7 (OPTION 3) |

---

## G-15 — Customer token signing secret

| Field | Content |
|---|---|
| **ID** | G-15 |
| **Owner** | Security owner + ops |
| **Date** | 2026-09-06 |
| **Status** | **APPROVED (design); provisioning is a Phase 9/12 execution item** |
| **Decision (question)** | Approve the customer-token signing-secret decision (P2-D13)? |
| **Decision (approved option)** | **APPROVE** — distinct customer-token signing secret **design**. **Provisioning is required before any customer token can actually be issued** (Phase 9/12, with the customer-auth runtime). |
| **Rationale** | Owner's explicit approval, consistent with P2-D13 and Master Plan §8 ("`REQUIRES DECISION-minor`"; "a distinct secret is cleaner"). |
| **Source document / section** | P2-D13 record; Master Plan §8 INFRASTRUCTURE IMPACT; `PHASE-2-DECISION-CLOSURE.md §14`. |
| **Consequences** | The design (new optional env var, e.g. `CUSTOMER_JWT_ACCESS_SECRET`, defaulting to the shared secret) is FROZEN. **No env var is added and no signing code is wired in Phase 2** — customer tokens are not issued until Phase 9/12. |
| **Affected phase(s)** | **Phase 9/12** (provisioning + wiring). |
| **Reversibility** | Reversible — env change + one refresh-TTL window. |
| **Explicit approval wording (recorded)** | `"G-15: APPROVE — distinct customer-token signing secret design; provisioning is required before any customer token can actually be issued"` (project owner, 2026-09-06). |

### G-15 — Decision Log

| Date | Owner | Choice | Approval wording (verbatim) | Reference |
|---|---|---|---|---|
| 2026-09-06 | Security owner + ops (project owner) | **APPROVE (design)** | `"G-15: APPROVE — distinct customer-token signing secret design; provisioning is required before any customer token can actually be issued"` | P2-D13 |

---

## G-16 — Phase 2b identity-backfill authorization

| Field | Content |
|---|---|
| **ID** | G-16 |
| **Owner** | Ops owner (execution-time) |
| **Date** | 2026-09-06 (status recorded) |
| **Status** | **OPEN — PENDING (gated on D2 + D8)** |
| **Decision (question)** | Authorize the Phase 2b identity backfill (`role='ADMIN'` → `OWNER` membership; `role='CUSTOMER'` → `Customer` rows), restored-copy-first, with the pre-backfill backup id recorded? |
| **Decision (recorded)** | **PENDING.** The owner explicitly held this: *"G-16: PENDING — Phase 2b backfill authorization remains gated on D2."* It also remains gated on **D8** (a verified restore artifact — the Phase 14 drill or a proven-restorable `pg_dump` copy). Analogue of G-9, at execution time. |
| **Rationale** | The backfill writes production-derived data and is the single most invasive identity change in the plan (Master Plan §8 MIGRATION IMPACT). It cannot be planned without D2 (deployed data shape) or executed without a verified backup (D8). |
| **Source document / section** | Master Plan §8 DATABASE/DATA IMPACT ("gated on D2/D3"), ROLLBACK; D2, D3, D8 records; `PHASE-2-DECISION-CLOSURE.md §15, §16`; `PHASE-2-START-GATE-RESULT.md`. |
| **Consequences** | **Phase 2b does not start** until D2 is answered, a D8 restore artifact is recorded, and G-16 is approved. Phase 2a is unaffected (additive, no data). Phase 2 **completion** is blocked until Phase 2b is done (Master Plan §8 EXIT CRITERION "backfill reconciled"). |
| **Affected phase(s)** | Phase 2b; Phase 2 completion. |
| **Reversibility** | The backfill is additive rows (`DELETE FROM customers WHERE …` + re-run); a corrupted state restores from the D8 backup. |
| **Explicit approval wording (recorded)** | `"G-16: PENDING — Phase 2b backfill authorization remains gated on D2"` (project owner, 2026-09-06). |

### G-16 — Decision Log

| Date | Owner | Choice | Approval wording (verbatim) | Reference |
|---|---|---|---|---|
| 2026-09-06 | Ops owner (project owner) | **PENDING (held — gated on D2 + D8)** | `"G-16: PENDING — Phase 2b backfill authorization remains gated on D2"` | D2, D8 records |

---

## G-17 — D6 resolution / Phase 2 re-scope

| Field | Content |
|---|---|
| **ID** | G-17 |
| **Owner** | Architecture owner + product owner |
| **Date** | 2026-09-06 |
| **Status** | **APPROVED — RE-SCOPE** |
| **Decision (question)** | Resolve D6 now (guard swap stays in Phase 2), or formally re-scope Phase 2 to move the D6-dependent work (tenant-context, `@Roles → @RequirePermission` swap, `PermissionsGuard` activation) to Phase 3? |
| **Decision (approved option)** | **APPROVE — Phase 2 is explicitly re-scoped so D6-dependent tenant context and customer-auth activation are deferred to Phase 3 / 9 / 12 as documented.** D6 is **DEFERRED** (see the D6 record), not resolved. |
| **Rationale** | Owner's explicit approval. Master Plan §8 lists D6 as a Phase 2 dependency **and** "permission guard live" as a Phase 2 exit criterion — not both satisfiable while D6 is OPEN. The re-scope resolves the tension by moving the permission machinery to Phase 3 (Master Plan §9), which already lists "Phase 2 (membership + permissions + Customer)" as its input. |
| **Source document / section** | Master Plan §8 DEPENDENCIES/EXIT CRITERIA; Master Plan §9; D6, P2-D9 records; `PHASE-2-DECISION-RESOLUTION-AND-SPEC.md §A.6`; `PHASE-2-DECISION-CLOSURE.md §11, §15.2, §20`. |
| **Consequences — including the START-GATE definition change** | Per the owner's instruction (*"If the existing gate rules require changing the gate definition to support this approved Phase 2A / Phase 2B split, document that explicitly as part of the approved G-17 re-scope. Do not silently weaken the gate."*), the **Phase 2 START GATE is redefined to three checkpoints**: **(1) Phase 2a START** — the additive identity/schema foundation; gated on G-11, G-12, G-15 (design), G-17, G-18, G-19 and P2-D1…P2-D13 recorded (**does not** require D2/D6/D8). **(2) Phase 2b START** — the production identity backfill; additionally gated on **D2 answered + D8 verified restore artifact + G-16**. **(3) Phase 2 COMPLETION** — Phase 2a done + Phase 2b done + reconciliation (Master Plan §8 EXIT CRITERIA). This is **not** a weakening: every original mandatory item still gates the stage it belongs to; the split only makes explicit that additive work does not wait on production-data access. |
| **Affected phase(s)** | Phase 2 (re-scoped); **Phase 3** (D6 + permission machinery); **Phase 9/12** (customer auth). |
| **Reversibility** | The re-scope is a governance record; D6 remains fully open for Phase 3. |
| **Explicit approval wording (recorded)** | `"G-17: APPROVE — Phase 2 is explicitly re-scoped so D6-dependent tenant context and customer-auth activation are deferred to Phase 3/9/12 as documented"` (project owner, 2026-09-06). |

### G-17 — Decision Log

| Date | Owner | Choice | Approval wording (verbatim) | Reference |
|---|---|---|---|---|
| 2026-09-06 | Architecture + product owner (project owner) | **APPROVE — re-scope; D6 deferred to Phase 3** | `"G-17: APPROVE — Phase 2 is explicitly re-scoped so D6-dependent tenant context and customer-auth activation are deferred to Phase 3/9/12 as documented"` | D6 record; P2-D9; `PHASE-2-START-GATE-RESULT.md` |

---

## G-18 — D5 narrative-wording correction

| Field | Content |
|---|---|
| **ID** | G-18 |
| **Owner** | Architecture owner |
| **Date** | 2026-09-06 |
| **Status** | **APPROVED — CORRECTION APPLIED** (this file, D5 record) |
| **Decision (question)** | Authorize the factual correction to the D5 "Consequences" / "Reversibility" narrative fields so they no longer state that `customerId` is added to existing tenant-owned tables in Phase 2? |
| **Decision (approved option)** | **APPROVE.** The D5 "Consequences" and "Reversibility" fields are corrected (struck-through original preserved; correction note added) to reflect the authoritative boundary: **Phase 2 = `Customer` identity foundation**; **Phase 4 = `customerId` / ownership columns on existing commerce tables + re-pointing**; **D2 = production reconciliation/backfill authorization, tracked separately**. The owner's D5 decision (separate store-scoped `Customer` entity) is **unchanged**. |
| **Rationale** | Owner's explicit approval. The original narrative contradicted Master Plan §8 and §10 (which lists the `customerId` columns by name under Phase 4) and was internally inconsistent (its own next sentence assigned the FK re-pointing to Phase 4). The D5 Decision Log — the owner's recorded words — never specified a phase for `customerId` columns. |
| **Source document / section** | `DECISIONS.md` D5 record (corrected); Master Plan §8, §10; `PHASE-2-DECISION-RESOLUTION-AND-SPEC.md §A.4`; `PHASE-2-DECISION-CLOSURE.md §17.1`. |
| **Consequences** | The canonical register's D5 record is now consistent with the Master Plan. No schema/code effect. |
| **Affected phase(s)** | Governance hygiene; clarifies the Phase 2 ↔ Phase 4 boundary for all downstream work. |
| **Reversibility** | A further recorded correction could revise it; the struck-through original is preserved. |
| **Explicit approval wording (recorded)** | `"G-18: APPROVE — correct the D5 consequence/reversibility wording"` (project owner, 2026-09-06). |

### G-18 — Decision Log

| Date | Owner | Choice | Approval wording (verbatim) | Reference |
|---|---|---|---|---|
| 2026-09-06 | Architecture owner (project owner) | **APPROVE — correction applied** | `"G-18: APPROVE — correct the D5 consequence/reversibility wording"` → *"…so it no longer incorrectly states that customerId is added to existing tenant-owned tables in Phase 2."* | D5 record (this file); Master Plan §8, §10 |

---

## G-19 — G-10 additive-only guard: handling for approved additive `ALTER … ADD COLUMN`

| Field | Content |
|---|---|
| **ID** | G-19 |
| **Owner** | Architecture owner |
| **Date** | 2026-09-06 |
| **Status** | **APPROVED — evolve/handle the guard for approved additive `ALTER … ADD COLUMN`** (implementation is Phase 2a work under G-11) |
| **Decision (question)** | The G-10 detector (`findAdditiveOnlyViolations`) rejects any `ALTER TABLE` on a table not created in the same migration file, which would flag Phase 2's additive `ALTER TABLE "users" ADD COLUMN "platformRole"`. How is this handled? |
| **Decision (approved option)** | **APPROVE — evolve/handle G-10 for approved additive `ALTER COLUMN` migrations.** The additive-only guard is **not weakened**: it must continue to reject `DROP`, `TRUNCATE`, `DELETE`, row `UPDATE`, `SET NOT NULL`, type changes, and every non-additive `ALTER` verb. The approved change permits **only** a nullable `ADD COLUMN` (no `NOT NULL`, no volatile `DEFAULT`) on an existing table, and only for migrations explicitly recorded as approved. Implementation approach (detector refinement vs recorded per-migration exemption) is a Phase 2a implementation detail under G-11; the recommended approach is a narrow detector refinement with positive + negative tests. |
| **Rationale** | Owner's explicit approval. Master Plan §8 places `platformRole` (an additive column on an existing table) in Phase 2; the guard's own header anticipates that "Phase 4's expand→contract work will need explicit review". Phase 2 and Phase 4 both need additive `ADD COLUMN` on pre-existing tables. |
| **Source document / section** | `backend/src/migration-safety.spec.ts` (`findAdditiveOnlyViolations`, header); Master Plan §8; G-10 record; `PHASE-2-DECISION-RESOLUTION-AND-SPEC.md §B.11.3`; `PHASE-2-DECISION-CLOSURE.md §17.2`. |
| **Consequences** | **Phase 2a:** `backend/src/migration-safety.spec.ts` is updated (detector refinement or a recorded exemption) so the Phase 2a migration passes CI; `DROP` / `SET NOT NULL` / non-additive `ALTER` remain rejected; new positive + negative tests are added (AC-P2-07, AC-P2-08). No weakening of the additive-only boundary. |
| **Affected phase(s)** | Phase 2a (implementation); beneficially covers Phase 4 expand steps. |
| **Reversibility** | Yes — a CI check can be refined again via a recorded change. |
| **Explicit approval wording (recorded)** | `"G-19: APPROVE — evolve/handle G-10 for approved additive ALTER COLUMN migrations"` (project owner, 2026-09-06). |

### G-19 — Decision Log

| Date | Owner | Choice | Approval wording (verbatim) | Reference |
|---|---|---|---|---|
| 2026-09-06 | Architecture owner (project owner) | **APPROVE — evolve/handle the guard (no weakening)** | `"G-19: APPROVE — evolve/handle G-10 for approved additive ALTER COLUMN migrations"` | G-10 record; `PHASE-2-DECISION-CLOSURE.md §17.2` |

---

## Summary Table

| ID | Topic | Owner | Status | Blocks |
|---|---|---|:-:|---|
| **D1** | Supersede `BLUEPRINT-v1.2` via `§38` ACR | Atharva + Harshad | **RESOLVED — APPROVED** | ~~Phase 1~~ *(cleared)* + governance umbrella Phases 2–15 |
| **D2** | Does the deployed DB hold real production data? | Ops owner | **RESOLVED — OPTION A (real production data)** | Phase 2b/Phase 4 **planning** (unblocked); **execution** still gated on **D8 + G-16** |
| **D3** | Existing deployment → Tenant #1 (A) vs not adopted (B) | Business owner | **RESOLVED — OPTION A** | ~~Phase 1~~ *(cleared)* + **Phase 4 (defining; gated on D2)** + **Phase 2b backfill** |
| **D5** | Customer identity: separate `Customer` (a) vs global `User` + profile (b) | Product + architecture owner | **RESOLVED — OPTION (a)** *(narrative corrected via G-18)* | ~~Phase 1~~ *(cleared)* + **Phase 2 (`Customer` model)** + **Phase 4 (`customerId` columns)** |
| **D6** | Tenant-context derivation for merchant console | Architecture owner + product | **DEFERRED — Phase 3 (re-scope approved, G-17)** | **Phase 3** |
| **G-4** | Approve Phase 1 spec §B.2–B.8 | Architecture owner | **APPROVED** | ~~Phase 1~~ *(cleared)* |
| **G-5** | Ratify Phase 1 enum value sets | Architecture owner | **APPROVED** | ~~Phase 1 migration `CREATE TYPE`s~~ *(cleared)* |
| **G-9** | Pre-migration snapshot for shared-env deploys | Ops | **APPROVED** | Applying migrations to staging/production (execution-time) |
| **G-10** | Additive-only migration CI check | Architecture owner | **APPROVED** *(extended by G-19)* | (enforces additive-only boundary) |
| **P2-D1** | `PlatformRole` enum field vs boolean | Architecture owner | **RESOLVED — (i) enum field** | Phase 2a schema |
| **P2-D2** | `platformRole` nullability/default | Architecture owner | **RESOLVED — nullable, no default** | Phase 2a schema |
| **P2-D3** | `CustomerRefreshToken` table vs column | Architecture owner | **RESOLVED — (i) separate table** *(creation → Phase 9/12)* | Phase 9/12 |
| **P2-D4** | Merchant token thin vs fat | Architecture owner | **RESOLVED — thin** | Phase 2a auth |
| **P2-D5** | Customer token shape + audience | Architecture + security owner | **RESOLVED — `{sub,storeId,tokenVersion,aud}`** *(runtime → Phase 9/12)* | Phase 9/12 |
| **P2-D6** | Customer-auth route family | Architecture owner | **RESOLVED — `/storefront/auth/*`** *(runtime → Phase 9/12)* | Phase 9/12 |
| **P2-D7** | Customer-auth Store identification | Architecture + product owner | **RESOLVED — OPTION 3 (defer customer auth to Phase 9/12)** | **Defines Phase 2 scope**; Phase 9/12 |
| **P2-D8** | Permission catalogue representation | Architecture + security owner | **RESOLVED — typed constant; strings ratified in Phase 3** | Phase 3 |
| **P2-D9** | `@Roles → @RequirePermission` + guard activation | Architecture + product owner | **RESOLVED — Phase 3** | Phase 3 |
| **P2-D10** | `User.role` retirement timing | Architecture owner | **RESOLVED — Phase 4** | Phase 4 |
| **P2-D11** | `Customer` lifecycle field(s) | Product + architecture owner | **RESOLVED — `isActive` only** | Phase 2a schema |
| **P2-D12** | `Customer.tenantId` denorm integrity | Architecture owner | **RESOLVED — plain column now; composite FK Phase 4** | Phase 2a / Phase 4 |
| **P2-D13** | Customer token signing secret | Security owner + ops | **RESOLVED — distinct secret (design); provisioning Phase 9/12** | Phase 9/12 |
| **G-11** | Approve Phase 2 specification | Architecture owner | **APPROVED** | Phase 2a START |
| **G-12** | Ratify `PlatformRole` | Architecture owner | **APPROVED** | Phase 2a START |
| **G-13** | Ratify permission catalogue | Architecture + security owner | **NOT REQUIRED FOR PHASE 2** (→ Phase 3) | Phase 3 START |
| **G-14** | Customer-auth store-resolution mechanism | Architecture + product owner | **NOT REQUIRED FOR PHASE 2** (P2-D7 re-scope) | Phase 9/12 |
| **G-15** | Customer token signing secret | Security owner + ops | **APPROVED (design)**; provisioning Phase 9/12 | Phase 9/12 |
| **G-16** | Phase 2b backfill authorization | Ops owner | **OPEN — PENDING (gated on D2 + D8)** | **Phase 2b START; Phase 2 completion** |
| **G-17** | D6 resolution / Phase 2 re-scope | Architecture + product owner | **APPROVED — RE-SCOPE** (3-checkpoint gate) | Phase 2a START |
| **G-18** | D5 narrative-wording correction | Architecture owner | **APPROVED — applied** | (governance hygiene) |
| **G-19** | G-10 guard for additive `ADD COLUMN` | Architecture owner | **APPROVED (no weakening)** | Phase 2a START |

**Phase 2a START GATE: `READY`** (see `docs/saas/PHASE-2-START-GATE-RESULT.md`).
**Phase 2b START GATE: `BLOCKED`** — D2 **RESOLVED (Option A, 2026-09-07)**, D8 PENDING, G-16 PENDING.
**Phase 2 COMPLETION: `BLOCKED`** — requires Phase 2b.

---

## Decisions from earlier documents NOT recorded here as resolved (and why)

Tracked in `PHASE-0-DECISION-RESOLUTION-AND-PHASE-1-SPEC.md §A.1`; **no owner decision has been
supplied** for these, so they remain `OPEN`:

| ID | Topic | Status | Note |
|---|---|:-:|---|
| **D4** | Isolation mechanism (app-layer / RLS / both) | **OPEN** | Doc-level classification "both"; **not owner-ratified**. Gates Phase 3. |
| **D7** | `WebhookEvent` split | **OPEN** | Gates Phase 7/8. |
| **D8** | Hosting / staging / worker topology → staging + **verified restore drill** | **OPEN — `PENDING`** | Owner status 2026-09-06: **PENDING** — the restore drill has not been performed. **Gates Phase 2b** (a verified restore artifact — Phase 14 drill or a proven-restorable `pg_dump` copy — is required before the `Customer` backfill) **and Phase 4.** Provisioning should already be in progress (lead time). |
| **D9** | Merchant payment-credential storage | **OPEN** | Gates Phase 8. |
| **D10** | Per-tenant order/invoice numbering + statutory format | **OPEN** | `REQUIRES LEGAL DECISION`. Gates Phase 4 (W4). |
| **D11** | `AppSetting` per-key ownership classification | **OPEN** | Gates Phase 4 (W4). |
| **D12** | Per-tenant tax model | **OPEN** | Gates Phase 12. |
| **D13** | Object storage provider/interface | **OPEN** | Gates Phase 10. |
| **D14** | SaaS billing provider | **OPEN** | `REQUIRES PROVIDER DECISION`. Gates Phase 7. |
| **D15** | Queue technology | **OPEN** | Gates Phase 11 (governed by D1). |

*(D6 has moved OUT of this table — it now has a full record above, status DEFERRED — Phase 3.)*

*(D2 has moved OUT of this table — it now has a full record above, status RESOLVED — OPTION A,
2026-09-07.)*

When owners record decisions for any of these, add a full record above using the same template.

---

*End of `docs/saas/DECISIONS.md` v1.2. Recorded 2026-09-06: P2-D1…P2-D13 (RESOLVED); G-11, G-12,
G-15, G-17, G-18, G-19 (APPROVED); G-13, G-14 (NOT REQUIRED for Phase 2); G-16 (OPEN — gated on
D2); D6 (DEFERRED — Phase 3). The D5 narrative fields were corrected under G-18 (the owner's D5
decision is unchanged). D2, D4, D7–D15 remain OPEN. Phase 2a START GATE = READY; Phase 2b START
GATE = BLOCKED (D2/D8/G-16); Phase 2 COMPLETION = BLOCKED.*

*Updated 2026-09-07: D2 RESOLVED — OPTION A (the currently-deployed Render database holds real
merchant/customer production data), recorded per explicit project-owner decision. This is a
documentation-only update — no production database, credentials, or rows were accessed or
modified. D2's resolution authorizes Phase 2b/Phase 4 **planning** against a real-data
assumption; it does **not** authorize Phase 2b execution, production backfill, backup, or
restore. D8 and G-16 remain OPEN — PENDING, unchanged. Phase 2b START GATE remains `BLOCKED`
(gated on D8 + G-16). Phase 2 COMPLETION remains `BLOCKED`.*
