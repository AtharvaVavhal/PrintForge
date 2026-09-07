# D8 Owner/Ops Handoff

**Status: HANDOFF DOCUMENT — NOT EXECUTED.** This document does not
authorize, perform, or imply any part of the D8 restore drill. It exists
so the owner/Ops team has one concise, unambiguous list of what to
provide before anyone — human or Claude — begins
[`D8-RESTORE-DRILL-RUNBOOK.md`](./D8-RESTORE-DRILL-RUNBOOK.md), which
remains the sole execution authority (see §5 below).

No prerequisite listed here has been created, discovered, or assumed to
exist. Every "MISSING" below was confirmed by inspecting this session's
own environment and the repository — never by contacting production.

## Current Gate

D2: RESOLVED
D8: BLOCKED
G-16: PENDING
Phase 2b: BLOCKED

## Required Before D8 Execution

### 1. Named Operator

Provide:
- Full operator identity (a specific individual, not a role like "the
  project owner" or a generic account).
- Confirmation that the operator is authorized by the project owner
  specifically for this operation.
- Date of authorization.

### 2. Production Access

Provide:
- A sanctioned access mechanism — the owner's own Render account, or a
  service account the owner names explicitly, in writing, for this task.
- Legitimate Render production-project access under that mechanism.
- The ability for the authorized operator to retrieve the production
  `DATABASE_URL` (per [`ENVIRONMENT.md`](./ENVIRONMENT.md)) directly from
  the Render dashboard **at execution time** — not in advance, not stored
  anywhere else.

**IMPORTANT:**
- Never ask the operator to paste `DATABASE_URL` into Git, documentation,
  Claude, or chat, at any point, for any reason.
- The Render CLI session already authenticated on this machine (account
  `claude` / `claudeuservit@gmail.com`) is **not** authorized for this
  purpose and must not be used unless the owner explicitly names that
  exact account, in writing, as the approved mechanism — a generic
  "proceed" instruction does not authorize it.

### 3. Scratch PostgreSQL

Provide:
- A separate PostgreSQL instance — not a schema or database name on the
  production server.
- A PostgreSQL major version compatible with the production Render
  Postgres add-on.
- Sufficient storage capacity for the production dump.
- No connection to any application traffic (Render, Vercel, `.env`, or
  CI) at any point.
- Explicit confirmation that the instance is disposable — created solely
  for this drill, with no other consumer.
- A disposal plan (deletion immediately after evidence capture, or a
  short, explicitly bounded retention window).

### 4. Artifact Storage

Provide:
- Access-controlled storage for the `pg_dump` artifact.
- Encryption at rest, or an equivalent protection the owner already
  trusts for secrets of this sensitivity.
- A retention policy (how long the artifact and its checksum are kept,
  and by whom).
- Checksum (SHA-256) retention alongside the artifact.
- Restricted access — not a shared drive, not email, not chat.

**The production dump contains all customer PII and password hashes**
(per [`BACKUP-RESTORE.md`](./BACKUP-RESTORE.md) §5) and must be handled
as a secret at every stage — creation, transfer, storage, and eventual
disposal.

## Authorization Record

Recorded by the owner/operator on 2026-09-07. This record authorizes
**only** the D8 restore drill described below — it does not extend to
Phase 2b, G-16, or any production data modification (see "Critical
boundary" below).

```
Owner: Atharva
Operator: Atharva
Approved access mechanism: Authorized production database credentials
  supplied through the approved secret/environment mechanism at
  execution time. Credentials are never placed in the repository or in
  documentation.
Authorization date: 2026-09-07
Purpose: D8 verified backup-and-restore drill for Phase 2 governance
Scope: READ-ONLY production backup, restore into a separate disposable
  scratch PostgreSQL database, and verification of the restored copy
Approval reference: Atharva — owner/operator authorization for D8
  restore drill, 2026-09-07
```

### Critical boundary

This authorization is **only** for the D8 restore drill above. It does
**not** authorize:
- Phase 2b backfill
- production data modification
- production migrations
- Phase 3
- G-16
- tenant/customer backfill
- `User` modification
- `Customer` creation in production
- `TenantMembership` creation in production

**G-16 remains a separate authorization gate.** Recording this
authorization does not, by itself, supply the actual sanctioned access
mechanism, scratch database, or secure artifact storage the runbook's
preflight checks require — those are separate, still-outstanding
provisioning steps (see the "Required Before D8 Execution" sections
above).

---

## Execution Entry Criteria

All of the following must be true before the operator opens
`D8-RESTORE-DRILL-RUNBOOK.md` and begins Step 1:

```
[ ] Owner authorization recorded
[ ] Named operator identified
[ ] Sanctioned production access established
[ ] Production source can be safely identified
[ ] Scratch PostgreSQL exists
[ ] Scratch target is proven disposable
[ ] Secure artifact storage exists
[ ] Artifact retention is defined
```

**If any checkbox is false: D8 = BLOCKED.** Partial readiness does not
permit a partial start — the runbook's own pre-flight checks (§1–§3 of
`D8-RESTORE-DRILL-RUNBOOK.md`) enforce this again at execution time, but
the operator should not attempt to begin until every item above is
already true.

## Execution Sequence

This handoff document does not duplicate the runbook's exact commands —
`D8-RESTORE-DRILL-RUNBOOK.md` remains authoritative for the how. The
sequence, at a glance:

```
Authorization
  → Production identity verification
  → Production pg_dump
  → SHA-256 checksum
  → Secure artifact retention
  → Scratch target verification
  → Scratch restore
  → Load/structural verification
  → Evidence package
  → Owner/Ops verification
  → D8 RESOLVED
```

**No production application migration or backfill is part of D8.** D8
is a read-only-against-production, backup-and-restore-into-scratch
exercise only. It never writes to production, never runs
`prisma migrate deploy` against production, and never touches Phase 2b.

## D8 Success Does Not Authorize Phase 2b

After a successful D8, the gate state becomes:

```
D2 = RESOLVED
D8 = RESOLVED
G-16 = PENDING
Phase 2b = BLOCKED
```

The next gate is the **Phase 2b dry run / reconciliation against the
verified restore copy**, followed by the **separate G-16 authorization
process** (its own dated owner sign-off, per
`docs/saas/DECISIONS.md`'s G-16 record). **D8 approval and G-16
authorization are never combined into one sign-off.**

## Security Rules

- Never put `DATABASE_URL` into Git.
- Never put `DATABASE_URL` into governance documents.
- Never put passwords, tokens, or API keys into evidence.
- Never include customer PII in the D8 report — aggregate row counts
  only.
- Never use an unauthorized Render account (see §2 above).
- Never restore production data into an unverified target.
- Never treat the CI PostgreSQL test container as the production restore
  target — it is rebuilt empty from migrations for tests and was never
  designed as a restore destination.
- Never modify production to solve a restore problem — a failed restore,
  checksum mismatch, or missing table is a STOP condition, not something
  worked around by touching the source database.
- Never mark D8 resolved based only on documentation or a stated
  intention — only a completed, evidenced restore-and-verify cycle
  (`D8-RESTORE-DRILL-RUNBOOK.md` §9–§10) satisfies D8.
