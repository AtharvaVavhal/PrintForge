# D8 Ops Provisioning Guide

**Status: GUIDANCE — NOTHING PROVISIONED.** This is a how-to document for
the owner/operator (Atharva). It provisions nothing itself and does not
execute any part of the D8 drill. It complements
[`D8-INFRASTRUCTURE-SETUP-CHECKLIST.md`](./D8-INFRASTRUCTURE-SETUP-CHECKLIST.md)
(what to provision) with the practical *how*, and remains subordinate to
[`D8-RESTORE-DRILL-RUNBOOK.md`](./D8-RESTORE-DRILL-RUNBOOK.md) for the
actual execution procedure once every prerequisite below is real.

No real credential, connection string, hostname, username, password, or
secret appears anywhere in this document. Every value is a placeholder.

---

## 1. Production Database Access

**How to obtain fresh credentials:**
1. Log into the Render dashboard yourself, under your own account (per
   `docs/ops/README.md`'s deployment topology — this repository has no
   CLI/API-token-based access to production; the dashboard is the
   authoritative source).
2. Open the production backend service's **Environment** tab.
3. Copy the current `DATABASE_URL` value directly from there, at the
   moment you're about to run the drill — not in advance, not into a
   note-taking app, not into this repository.

**Credential freshness / rotation:**
- If there's ever a reason to doubt how a credential has been handled —
  it was typed somewhere it shouldn't have been, shared over an
  insecure channel, or simply hasn't been rotated in a long time —
  rotate it in Render *before* using it for this drill. Render supports
  regenerating the database's password/connection string from its own
  dashboard; follow Render's own rotation flow, then update the
  service's environment variable to match.
- This drill does not itself require rotation as a precondition unless
  you have a specific reason to believe the current credential is
  compromised.

**How to supply it to the execution environment:**
- Export it as a shell environment variable in the terminal session
  where the drill will run, e.g. (placeholder only):
  ```
  export PRODUCTION_DATABASE_URL="<value pasted directly from Render, never from a file>"
  ```
- Use a variable name distinct from the scratch target's
  (`PRODUCTION_DATABASE_URL`, not a shared `DATABASE_URL`) so a
  copy-paste error can't silently point a command at the wrong database
  (see `D8-RESTORE-DRILL-RUNBOOK.md` §2).
- Never paste the value into chat with Claude, into a markdown file, or
  into a commit.

**Read-only operational requirement:**
- The credential is used for exactly one purpose in this drill:
  `pg_dump` reading production. Nothing in the D8 procedure issues a
  write, an `ALTER`, or a migration against production.

**Credential handling rules:**
- Never commit it.
- Never put it in documentation (including this guide, its filled-in
  evidence, or the D8 evidence package).
- Never print it to a terminal that's being logged or screen-shared.
- Clear it from shell history / unset the variable once the drill
  completes.

**Verification checklist:**
```
[ ] Credential obtained directly from Render dashboard, just now
[ ] Stored only in a shell environment variable, not a file
[ ] Variable name is PRODUCTION_DATABASE_URL (or equally unambiguous)
[ ] No copy of it exists in chat, git, or any document
```

---

## 2. Scratch PostgreSQL

**How to provision a separate instance (pick one, provider-neutral):**
- A new Render PostgreSQL instance, separate from the production one.
- A PostgreSQL instance from any other managed provider (e.g. a
  throwaway instance on Supabase, Neon, ElephantSQL, or similar).
- A local PostgreSQL instance you control directly (e.g. via `docker run
  postgres:16` on your own machine — Docker is confirmed available on
  this machine), **provided** it's never reachable by anything other
  than the operator performing the drill.

**Version compatibility check:**
- Confirm the production Postgres major version (visible in the Render
  dashboard for the production database, or via the read-only `select
  version();` check in the runbook's §2) and provision the scratch
  instance with the **same major version** — a restore across major
  versions is not what this drill is meant to validate.

**Sufficient storage/capacity:**
- Give the scratch instance disk headroom comfortably larger than the
  production dump's expected size (check the dump file size after it's
  created, before attempting restore, per the runbook §3).

**Separate credentials:**
- The scratch instance has its own connection string, generated when
  you provision it — never derived from or related to the production
  one.

**Network/access isolation:**
- Do not add the scratch instance's connection string to Render,
  Vercel, any `.env` file, or any CI configuration. It should be
  reachable only from the operator's own machine/session for the
  duration of the drill.

**Verification that the target is NOT production (mandatory, before
restore):**
- Run the read-only identity check from `D8-RESTORE-DRILL-RUNBOOK.md`
  §3/§5 step 4 against the scratch connection string and confirm the
  returned database name/host is the scratch instance — never the
  production one.

**Disposable lifecycle and disposal procedure:**
- Decide *before* provisioning how long the scratch instance will live
  (e.g. "deleted within 24 hours of evidence capture").
- After the evidence package (§9 of the runbook) is captured and
  reviewed, delete the scratch instance through its provider's own
  deletion flow (Render dashboard, Docker `rm`, or equivalent) — don't
  leave it running indefinitely as an unmanaged copy of production
  structure/data.

**Evidence required:**
- Provider, instance name/id, creation timestamp, PostgreSQL version —
  recorded in the D8 evidence package (runbook §9), never the
  connection string.

---

## 3. Secure Artifact Storage

**How to set up private, access-controlled storage (provider-neutral):**
- A private cloud storage bucket (S3, GCS, or similar) with access
  restricted to the operator's own account/IAM identity — not a
  publicly-readable bucket.
- Alternatively, an encrypted local disk/volume under the operator's
  exclusive control, if no cloud storage is preferred for a one-off
  drill.

**Encryption / equivalent protection:**
- If using cloud storage, enable server-side encryption at rest (most
  providers enable this by default — confirm it's on, don't assume).
- If using local storage, use a full-disk-encrypted volume or an
  encrypted container/archive.

**Retention policy:**
- Decide up front how long the artifact and its checksum are kept —
  minimally until the D8 evidence package is filed and reviewed; a
  longer disaster-recovery retention is a separate owner decision.

**Checksum storage:**
- Store the `.sha256` checksum file (per `D8-RESTORE-DRILL-RUNBOOK.md`
  §4) alongside the artifact in the same access-controlled location.

**Restricted operator access:**
- Only the named operator (and owner, if separately named) can read
  from this location — not a team-wide shared drive, not a channel
  anyone can access.

**No public URLs, no Git/repository storage:**
- Never generate a public/shareable link to the artifact.
- Never place the dump file (or a pointer that reveals its exact
  location if that location itself is sensitive) inside this git
  repository.

**Controlled deletion after retention:**
- When the retention period ends, delete the artifact through the
  storage provider's own deletion mechanism (not just "let it expire"
  unless a lifecycle policy is explicitly configured to do so), and
  record that disposal in the D8 evidence package.

---

## 4. Final Preflight

```
[ ] Atharva named operator
[ ] Written authorization
[ ] Fresh production credential obtained directly from Render at execution time
[ ] Credential supplied only through an approved secret/environment mechanism
[ ] Scratch PostgreSQL provisioned
[ ] Scratch PostgreSQL version confirmed compatible with production
[ ] Scratch verified separate from production
[ ] Scratch confirmed disposable
[ ] Secure artifact storage provisioned
[ ] Artifact retention/disposal policy defined
```

Every item above must be true before opening
`D8-RESTORE-DRILL-RUNBOOK.md` and beginning Step 1. As of this guide's
writing: only the first two are true (see
`D8-OWNER-OPS-HANDOFF.md`'s authorization record). The remaining eight
are still outstanding, real-world provisioning steps.

---

## 5. D8 Execution Boundary

**D8 is exactly this, and nothing more:**
```
backup production (read-only) → restore to scratch → verify
```

**D8 does NOT authorize:**
- Phase 2b (identity backfill)
- Any production write of any kind
- Data backfill
- Production migrations
- Phase 3
- G-16

A successful D8 changes the gate state to `D2 = RESOLVED, D8 = RESOLVED,
G-16 = PENDING, Phase 2b = BLOCKED` — nothing more. G-16 is its own,
separately-authorized gate (see `D8-OWNER-OPS-HANDOFF.md` §11 / the
runbook §11).

---

## 6. Troubleshooting

For every failure below, the response is the same: **STOP. Diagnose.
Do not touch production.** No failure is worked around by modifying,
writing to, or migrating production.

| Situation | Response |
|---|---|
| Production credential unavailable | STOP. Do not substitute an unrelated/ambient credential (e.g. an already-authenticated but unauthorized CLI session). Return to the Render dashboard and re-obtain it, or escalate to whoever holds the account. |
| Scratch DB unavailable | STOP. Do not fall back to restoring into any database an application uses, including the CI test database. Provision the scratch instance first. |
| Version mismatch (scratch ≠ production major version) | STOP. Re-provision the scratch instance with the matching version before proceeding; do not attempt the restore anyway and hope `pg_restore` copes. |
| Scratch identity uncertain (can't confirm it isn't production) | STOP. Per the runbook's own rule: "If the operator cannot prove the target is disposable: STOP." Do not proceed on an assumption. |
| Storage unavailable | STOP. Do not write the dump to an ad hoc location (a laptop's Downloads folder, a shared drive) as a workaround — provision the access-controlled location first. |
| Insufficient storage capacity | STOP. Resize or re-provision before running `pg_dump`; do not let the dump fail partway through. |
| Restore failure | STOP. Capture the full `pg_restore` output for the evidence package. Do not attempt to "fix" the restore by modifying the source dump or production. |
| Checksum mismatch | STOP. The artifact is not trustworthy — do not restore it. Re-run the backup from production (read-only) to produce a fresh, verified artifact. |

---

## Current Status

D2: RESOLVED
D8: BLOCKED
G-16: PENDING
Phase 2b: BLOCKED
