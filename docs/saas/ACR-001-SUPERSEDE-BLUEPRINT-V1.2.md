# ACR-001 — PrintForge SaaS Architecture v1.0 Supersedes `BLUEPRINT-v1.2`

> **Architecture Change Request** raised under **`docs/architecture/BLUEPRINT-v1.2.md §38`
> (Architecture Change Procedure)**.
>
> **This artifact records the ACR. It does not itself modify `BLUEPRINT-v1.2.md`.** The
> follow-through edits (the `schema.prisma` header comment and
> `docs/architecture/ARCHITECTURE-FREEZE.md`) are made in the **Phase 1 implementation PR**,
> not by any documentation task.

---

## Document Control

| Field | Value |
|---|---|
| ACR ID | ACR-001 |
| Title | PrintForge SaaS Architecture v1.0 supersedes `BLUEPRINT-v1.2` in full |
| Procedure | `BLUEPRINT-v1.2.md §38` (5-element proposal; joint Atharva + Harshad review) |
| Raised | 2026-09-06 |
| Status | **APPROVED** (owner decision D1, recorded in `docs/saas/DECISIONS.md`, 2026-09-06) |
| Approvers | Atharva + Harshad (project owner) |
| Implemented? | **NO.** The ACR is approved and documented. The `schema.prisma` header + `ARCHITECTURE-FREEZE.md` updates are the **first change of the Phase 1 PR** and have not been made. `BLUEPRINT-v1.2.md` is **unchanged**. |
| Related | `docs/saas/DECISIONS.md` (D1); `PHASE-0.5-DECISION-CLOSURE.md §6`; Master Plan `§4.4-D1`; `PHASE-1-START-GATE-RESULT.md` |

---

## §38 element 1 — Section(s) of `BLUEPRINT-v1.2` affected

`BLUEPRINT-v1.2 §38` makes changes to sections **6, 10–17, 20–25, 30–31, or 34** conditional
on an ACR. This ACR affects effectively the whole freeze-protected surface:

| Section | Why affected |
|---|---|
| **§2** (prohibited-technology list) | The SaaS async/worker tier (Phase 11) is sanctioned in principle. **Phase 1 introduces no prohibited technology.** See element 4. |
| **§6** (roles / RBAC — "two roles") | Replaced by `SUPER_ADMIN` (platform) + `TenantRole {OWNER, ADMIN, STAFF, VIEWER}` on `TenantMembership` + store-scoped `Customer` (D5-a). Enforcement is Phase 2. |
| **§10–17** (incl. **§15 Complete Schema**, §16 single deployable, §17 async/outbox) | The schema gains multi-tenancy models; the deployment model gains a worker tier + staging (D8); the async model gains tenant context (Phase 11). |
| **§20–25** (API contract, security) | Endpoints gain tenant/store context resolution; nothing is deleted. |
| **§30–31** (deployment topology, environment strategy) | Render single-instance → stateless + independently scalable workers + 3 environments (frozen SaaS §17). |
| **§34** (roadmap) | Replaced by the approved `PRINTFORGE-SAAS-IMPLEMENTATION-MASTER-PLAN-v1.0.md` (16 phases). |

## §38 element 2 — The problem being solved

`BLUEPRINT-v1.2` describes a **single-tenant, single-store** custom-printing e-commerce
application. The approved, frozen **PrintForge SaaS Architecture v1.0** requires a
**general-purpose multi-tenant e-commerce SaaS platform** (ForgeBuilds → PrintForge → shared
platform → many independent tenants → stores). The existing frozen architecture is the wrong
architecture for the approved direction, and `schema.prisma` lines 4–5 + `§38` block adding the
foundational multi-tenancy models (`Tenant`, `Store`, `StoreDomain`, `TenantMembership`, `Plan`,
`Subscription`) that every later phase depends on.

## §38 element 3 — The proposed change

> **"PrintForge SaaS Architecture v1.0 supersedes `docs/architecture/BLUEPRINT-v1.2.md` in
> full. `BLUEPRINT-v1.2.md` is retained as a historical record. Authoritative going forward
> are: PrintForge SaaS Architecture v1.0 (FROZEN) and
> `docs/saas/PRINTFORGE-SAAS-IMPLEMENTATION-MASTER-PLAN-v1.0.md` (APPROVED). The
> `backend/prisma/schema.prisma` header comment and `docs/architecture/ARCHITECTURE-FREEZE.md`
> are updated in the Phase 1 implementation PR to cite these as authoritative."**

## §38 element 4 — Why it does not violate the §2 prohibited-technology list

- **Phase 1 introduces no prohibited technology.** It adds only PostgreSQL tables/enums (via
  Prisma) and NestJS modules — no Redis, Kafka, RabbitMQ, microservices, Kubernetes, GraphQL,
  event bus, queue broker, additional framework, additional database, or global state library.
- **The eventual async/worker tier (Phase 11)** is planned as a **Postgres-backed queue**
  extending the existing transactional-outbox pattern (`src/notifications/outbox/`) — which
  introduces **none** of the §2-named technologies (Master Plan §4.4-D15).
- **If a broker (e.g. Redis/BullMQ) is ever proposed** for the worker tier, it requires its own
  ACR at that time, with its own §2 justification.
- The additional environments (staging) and a separate worker **service** are deployment
  topology, not new technology categories.

## §38 element 5 — Impact on the frozen schema / API contract

- **Schema:** grows from **25 models → ~50** across Phases 1–15 (Phase 1: **+6** —
  `Tenant`, `Store`, `StoreDomain`, `TenantMembership`, `Plan` shell, `Subscription` shell —
  plus 6 enums). The existing 25 models are **not removed**. Full target list:
  `PHASE-0-REPOSITORY-INVENTORY.md §6.10` + Master Plan §3.16.
- **API contract:** existing endpoints are **re-scoped** (server-derived tenant/store context)
  across Phases 3/5/12; **none are deleted** in Phase 1 (Phase 1 adds no HTTP route at all).
- **Migrations:** remain forward-only; the expand→migrate→contract discipline applies; Phase 1
  is **additive-only** (`CREATE TABLE`/`CREATE TYPE`/`CREATE INDEX` on new objects only —
  enforced by the G-10 CI check).

---

## Approval

| Date | Approver | Decision | Verbatim |
|---|---|---|---|
| 2026-09-06 | Atharva + Harshad (project owner) | **APPROVED** | `"D1: APPROVE — APPROVE the required ACR under BLUEPRINT-v1.2 §38 to permit the Phase 1 tenancy models."` |

## Post-approval actions (Phase 1 PR — NOT yet done)

1. Update `backend/prisma/schema.prisma` header comment (lines 1–5) to cite SaaS Architecture
   v1.0 + `PRINTFORGE-SAAS-IMPLEMENTATION-MASTER-PLAN-v1.0.md` as authoritative, replacing the
   `BLUEPRINT-v1.2 §15/§12/§14` references.
2. Update `docs/architecture/ARCHITECTURE-FREEZE.md` to record that `BLUEPRINT-v1.2` is
   superseded by SaaS Architecture v1.0 and retained as history.
3. Link this ACR (`ACR-001`) from both.

**These are Phase 1 implementation-PR changes. This ACR being APPROVED does not mean they have
been performed. `BLUEPRINT-v1.2.md` remains unchanged as of this document.**

---

*End of ACR-001.*
