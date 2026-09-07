# D8 Infrastructure Setup Checklist

**Status: CHECKLIST — NOTHING PROVISIONED.** This document tells
Owner/Ops exactly what to set up, outside this repository and outside
any Claude Code session, before the D8 restore drill
([`D8-RESTORE-DRILL-RUNBOOK.md`](./D8-RESTORE-DRILL-RUNBOOK.md)) can
begin. It provisions nothing itself.

Written authorization is already recorded in
[`D8-OWNER-OPS-HANDOFF.md`](./D8-OWNER-OPS-HANDOFF.md) (Owner/Operator:
Atharva, 2026-09-07). This document covers the three remaining,
purely infrastructural prerequisites.

---

## Production DB Access

### A. What Owner/Ops must provision
A way for the named operator (Atharva) to obtain the production
`DATABASE_URL` at the moment of execution, through Render's own
dashboard/secret handling — not through any copy stored elsewhere.

### B. Minimum requirements
- Legitimate Render dashboard access to the actual PrintForge production
  project, under Atharva's own account or an account Atharva has
  explicitly named in the authorization record.
- The connection string is retrieved fresh, at execution time, directly
  from Render — never from a file, a prior chat message, or any
  intermediate copy. If there is ever any doubt about whether a
  credential has been handled outside that path, rotate it in Render
  before use.

### C. Security requirements
- Read-only use for the D8 drill: the credential is used for `pg_dump`
  only, never for any `INSERT`/`UPDATE`/`DELETE`/`ALTER`/`DROP`, and
  never for `prisma migrate deploy` against production.
- No application production writes of any kind occur as part of D8.

### D. What Claude needs at execution time
A `DATABASE_URL`-shaped value made available through the approved
secret/environment mechanism (e.g. an environment variable set in the
execution shell) — supplied by the operator, not typed into chat.

### E. What must NEVER be placed in chat/repository
- The connection string itself, in full or in part.
- The database password, in isolation or embedded in a URL.
- Any Render API token or personal access token.

### F. Verification criteria
- A read-only identity check (per `D8-RESTORE-DRILL-RUNBOOK.md` §2)
  confirms the connected database's name/host matches the known
  production identity before any `pg_dump` runs.

### G. Evidence required for D8
Non-secret identity only: provider, database name, host identifier
(redacted if the operator prefers), PostgreSQL version, timestamp of
access — never the connection string itself.

### H. Cleanup/disposal requirements
The credential is used for the duration of the drill only and is not
retained anywhere (not in shell history persisted to disk, not in a
file, not in a log) beyond the operator's own secret-management
practice.

---

## Scratch PostgreSQL

### A. What Owner/Ops must provision
One new, disposable PostgreSQL instance, provisioned specifically for
this drill.

### B. Minimum requirements
- A separate instance/server — not a schema or database name on the
  production server.
- PostgreSQL major version compatible with the production Render
  Postgres add-on.
- Storage capacity comfortably larger than the production dump.
- No connection to any application (Render, Vercel, `.env`, or CI) at
  any point.

### C. Security requirements
- Its own, separate credentials — never the production `DATABASE_URL`
  reused as a restore target.
- Access restricted to the named operator.

### D. What Claude needs at execution time
A `SCRATCH_DATABASE_URL`-shaped value, distinct from the production one,
made available the same way — through the environment, never pasted
into chat.

### E. What must NEVER be placed in chat/repository
The scratch connection string or its credentials, same as production.

### F. Verification criteria
- A read-only identity check confirms the scratch target's name/host is
  the scratch instance, not production, immediately before restore
  (`D8-RESTORE-DRILL-RUNBOOK.md` §3, §5 step 4).
- Explicit confirmation the instance is disposable — created solely for
  this drill, with no other consumer.

### G. Evidence required for D8
Non-secret scratch identity: provider, instance name/id, creation
timestamp, PostgreSQL version.

### H. Cleanup/disposal requirements
A defined disposal plan — deletion immediately after evidence capture,
or a short, explicitly bounded retention window — per the approved
policy the operator sets, so the scratch instance never becomes an
unmanaged, forgotten copy of production data.

---

## Secure Artifact Storage

### A. What Owner/Ops must provision
One access-controlled storage location to hold the `pg_dump` artifact
and its checksum.

### B. Minimum requirements
- Private/access-controlled — restricted to the named operator (and
  owner, if separately named).
- Sufficient capacity for the dump file.

### C. Security requirements
- Encryption at rest, or an equivalent protection already trusted for
  secrets of this sensitivity — the dump contains all customer PII and
  password hashes.
- **No Git/repository storage** — the artifact must never be committed,
  never placed under version control.
- **No public URLs** — no shared links, no publicly-readable buckets.
- **No credentials embedded in artifact metadata** — filenames,
  timestamps, and checksums only; no connection strings recorded
  alongside the file.

### D. What Claude needs at execution time
A path or reference to the storage location where the artifact should
be written — not the storage credentials themselves, if the storage
system requires separate auth.

### E. What must NEVER be placed in chat/repository
Storage access credentials (e.g. a cloud storage key), and — as above —
the artifact itself must never enter the git repository.

### F. Verification criteria
- The artifact exists at the designated location after `pg_dump`
  completes.
- Its SHA-256 checksum is captured and independently re-verifiable
  before restore (`D8-RESTORE-DRILL-RUNBOOK.md` §4, §5 step 2).

### G. Evidence required for D8
Artifact identifier, size, SHA-256 checksum, and a description of the
storage location (not a public link) — per the evidence template in
`D8-RESTORE-DRILL-RUNBOOK.md` §9.

### H. Cleanup/disposal requirements
Retention until D8's evidence package is filed and reviewed, at
minimum; a longer retention decision (e.g. as a standing
disaster-recovery artifact) is a separate owner decision, not implied
by this checklist. Disposal, when it happens, follows the operator's
approved retention policy — not an ad hoc deletion.

---

## D8 Execution Gate

D8 execution may begin only when all six of the following are true:

```
[ ] Atharva is the named operator
[ ] Written authorization is complete
[ ] A production credential is available through the approved
    secret/environment mechanism (obtained fresh, at execution time)
[ ] Scratch PostgreSQL exists
[ ] Scratch PostgreSQL is verified separate/disposable
[ ] Secure artifact storage exists
```

**Until all six are true: D8 = BLOCKED.**

As of this checklist:
- Named operator: **true** (Atharva, recorded in `D8-OWNER-OPS-HANDOFF.md`)
- Written authorization: **true** (recorded 2026-09-07)
- Production credential available through the approved mechanism: **false**
- Scratch PostgreSQL exists: **false**
- Scratch PostgreSQL verified separate/disposable: **not evaluable** (doesn't exist yet)
- Secure artifact storage exists: **false**

**After all six are true, the D8 execution prompt will be issued
separately** — this checklist does not itself trigger execution.
