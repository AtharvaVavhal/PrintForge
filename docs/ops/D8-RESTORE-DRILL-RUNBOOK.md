# D8 — Verified Restore Artifact: Operator Runbook

**Status: PREPARED — NOT EXECUTED.** This document is a runbook only. No
step in it has been run. It does not authorize anyone to run it. It exists
so that when an authorized owner/Ops operator decides to close the **D8**
governance gate (`docs/saas/DECISIONS.md`), there is an exact, safe,
non-improvised procedure to follow, extending the existing
[`BACKUP-RESTORE.md`](./BACKUP-RESTORE.md) §4–§6 and
[`DEPLOYMENT.md`](./DEPLOYMENT.md) §3–§4 procedures — not replacing them.

This runbook satisfies **Option B** of the D8 requirement as defined in
`docs/saas/DECISIONS.md`, Master Plan §8 ROLLBACK, and
`PHASE-2-DECISION-CLOSURE.md §15–16`: *"a verified restore artifact — the
Phase 14 drill **or** a proven-restorable `pg_dump` copy."* Option A (the
Phase 14 restore drill) is a separate, later-phase event and is out of
scope here.

**This runbook, once executed, resolves D8 only.** It does not resolve or
imply **G-16** (Phase 2b backfill authorization), and it does not
authorize Phase 2b execution. See §11.

---

## 0. Non-authorization statement

Nothing in this document is standing authorization to:
- access the production Render PostgreSQL database,
- provision any infrastructure,
- run `pg_dump` or `pg_restore`,
- create a scratch database,
- modify production in any way.

Every step below requires the explicit, dated, named authorization
recorded in §1 **before** it is performed.

---

## 1. Authorization

D8 execution requires an explicit owner/Ops decision recorded **before**
any command in this runbook is run — the same standard already applied to
D1–D3 and G-16 in `docs/saas/DECISIONS.md`.

| Item | Requirement |
|---|---|
| **Authorized operator** | A named individual with legitimate Render account access to the PrintForge production project (per `docs/ops/README.md` deployment topology — Render dashboard access, not an ambient/unrelated CLI session). Explicitly **not** any Render CLI or account that has not been named and approved by the project owner for this purpose — this repeats the finding of the prior D8 audit, which discovered an already-authenticated `render` CLI session under an account **not** belonging to the project owner and **not** authorized for this operation. |
| **Sanctioned production access mechanism** | Access must come through the project owner's own Render account/dashboard, or a service account the owner has explicitly named for this task, in writing, in the authorization record below. No credential discovery, guessing, or use of an ambient/inherited session is acceptable. |
| **Required Render/database permissions** | Read access to the production PostgreSQL connection string (`DATABASE_URL`, per `docs/ops/ENVIRONMENT.md`) sufficient to run `pg_dump`. No write/admin action against the production database is required or permitted by this runbook. |
| **Required scratch database permissions** | Full owner/admin rights on a newly-provisioned, disposable PostgreSQL instance (see §3) — connect, create schema, `pg_restore`, drop. |
| **Who may approve** | The project owner (or an Ops owner the project owner has explicitly designated), matching the existing `docs/saas/DECISIONS.md` owner taxonomy ("Ops owner (project owner)" — the same role that owns D8 and G-16 today). |
| **Where approval is recorded** | A new dated authorization entry must be added to this runbook's §1 (below) *before* execution, and the completed run's evidence package (§9) is what ultimately supports updating `docs/saas/DECISIONS.md` (§10) — governance status is never updated on the basis of an unrecorded or verbal approval. |

**Authorization record (fill in before execution — leave blank until then):**

```
Date:              2026-09-07
Authorized by:     Atharva — Project Owner / Ops Owner
Authorized operator: Atharva
Approved access mechanism: authorized Render service account
Authorized Render account: claudeuservit@gmail.com
Scope confirmed:   D8 production PostgreSQL read-only access, specifically:
                   (1) the §2 read-only identity check and migration-state
                       inspection;
                   (2) creation of a pg_dump backup artifact from
                       production (§4);
                   (3) checksum/hash generation for that backup artifact
                       (§4);
                   (4) restoration of that backup artifact ONLY into the
                       disposable local D8 scratch PostgreSQL instance
                       (printforge-d8-scratch) (§5);
                   (5) verification of the restored scratch database (§6);
                   (6) creation/update of D8 evidence required by this
                       runbook (§9).
                   Production DATABASE_URL read access ONLY — no write
                   access requested or granted.
Explicitly prohibited (unchanged by this scope): NO production writes; NO
                   Prisma migrations against production; NO `prisma db
                   push` against production; NO Phase 2b execution; NO
                   Tenant #1 membership backfill; NO Customer backfill; NO
                   modification or deletion of existing production
                   business data; NO credential discovery from `.env`,
                   shell history, shell profiles, or any ambient/inherited
                   session; the production credential is NEVER recorded or
                   printed anywhere (chat, files, logs, or the evidence
                   package). Production remains a read-only source for the
                   entire duration of this runbook.
```

---

## 2. Production database access

The operator must establish access to the **real** production Render
PostgreSQL database through the mechanism authorized in §1 — never by
searching for, guessing, or reusing an unrelated credential.

**What connection information is needed:**
- The production `DATABASE_URL` (per `docs/ops/ENVIRONMENT.md`), obtained
  directly from the Render dashboard (Environment tab) of the authorized
  account, or from the owner's sealed secret store if one exists
  (`BACKUP-RESTORE.md` §2 notes this is currently **not confirmed to
  exist** — if it doesn't, the owner must retrieve the value from Render
  directly at execution time).

**What must never be printed:**
- The `DATABASE_URL` value itself, in full or in part (it embeds the DB
  password).
- Any other secret listed in `docs/ops/ENVIRONMENT.md` (`JWT_ACCESS_SECRET`,
  `REFRESH_TOKEN_SECRET`, Razorpay/Cloudinary/Resend keys) — none of these
  are needed for this runbook and none should be touched.
- Terminal history, CI logs, or shared documents must not retain the
  connection string in plaintext beyond the operator's immediate shell
  session.

**How to verify the target is production (before any command):**
1. Confirm the host/database name shown in the Render dashboard for the
   connection string matches the known production service name exactly
   (not a preview/staging service, not a personal test project).
2. Run a **read-only** identity check before `pg_dump`, e.g.
   `psql "<PRODUCTION_DATABASE_URL>" -c "select current_database(), inet_server_addr();"`
   and confirm the returned database name/host matches the expected
   production identity recorded in §9 — do this once, record the
   non-secret result, and do not otherwise browse the database.
3. Do **not** run any `INSERT`/`UPDATE`/`DELETE`/`ALTER`/`DROP` statement
   against this connection at any point in this runbook.

**How to record non-secret DB identity (for the evidence package, §9):**
- Provider: `Render PostgreSQL (managed)`
- Environment: `production`
- Database name: `<as shown in Render dashboard — not the connection string>`
- Host (may be redacted to just the region/plan tier if the operator
  prefers not to record even the hostname): `<value or "redacted">`
- Timestamp of access: `<ISO 8601>`

**How to prevent accidentally targeting scratch/development:**
- Use two distinctly-named shell variables during the session,
  `PRODUCTION_DATABASE_URL` and `SCRATCH_DATABASE_URL` — never a single
  reused `DATABASE_URL` variable — so a copy-paste error cannot silently
  point a command at the wrong database.
- `pg_dump` is only ever run against `PRODUCTION_DATABASE_URL`.
  `pg_restore` is only ever run against `SCRATCH_DATABASE_URL`. No command
  in this runbook uses both on the same line.

---

## 3. Scratch database

The scratch database is a **new, disposable, throwaway** PostgreSQL
instance. It must satisfy every item below before it is used as a restore
target:

- [ ] It is a **separate database instance/server** from production —
      not merely a separate schema or database name on the same server.
- [ ] It is **explicitly identified** in the evidence package (§9) by
      provider, instance name/id, and creation timestamp.
- [ ] It is **safe to overwrite/drop** — provisioned specifically for this
      drill, with no other purpose or consumer.
- [ ] It runs a **PostgreSQL major version compatible with production**
      (match the version used by the Render PostgreSQL add-on; check via
      the Render dashboard or `psql --version` against production during
      the read-only identity check in §2 — do not guess).
- [ ] It has **disk capacity comfortably larger** than the production
      dump size (check the dump file size after §4 before attempting
      restore).
- [ ] It is **never referenced by any application `DATABASE_URL`** — not
      in Render, not in Vercel, not in any `.env` file, not in CI.
- [ ] It **receives no application traffic** — the backend is never
      pointed at it, except optionally for the read-only verification
      described in §6, and only for the duration of that check.
- [ ] It has a **defined disposal plan** (deleted immediately after
      evidence capture, or at most retained for a short, explicitly
      bounded window) so it never becomes an unmanaged, forgotten copy of
      real production data.

**Mandatory pre-restore target verification:**
Before running `pg_restore`, the operator must run the same read-only
identity check as §2, step 2, against `SCRATCH_DATABASE_URL`, and confirm
the returned database name/host is the scratch instance's identity
recorded above — **not** the production identity recorded in §2.

**If the operator cannot prove the target is disposable: STOP.** Do not
proceed with `pg_restore`. Record the STOP condition per §8.

---

## 4. Backup artifact

Extends `BACKUP-RESTORE.md` §5 exactly — same command shape, same flags,
placeholders only.

**Format:** `pg_dump --format=custom` (matches the existing documented
fallback; produces a compressed, `pg_restore`-compatible artifact, not
plain SQL).

**Command structure (placeholders only — never substitute real values in
any file, log, or chat):**

```
pg_dump --format=custom --no-owner --no-privileges \
  "<PRODUCTION_DATABASE_URL>" \
  > <BACKUP_ARTIFACT_PATH>/printforge_prod_<TIMESTAMP>.dump
```

**Output artifact naming convention:**
`printforge_prod_<TIMESTAMP>.dump`, where `<TIMESTAMP>` is
`YYYYMMDDTHHMMSSZ` (UTC), matching the convention already used in
`BACKUP-RESTORE.md` §5 (`printforge_$(date +%Y%m%dT%H%M%SZ).dump`).

**Checksum/hash capture (required — not in the original doc, added for D8
evidentiary rigor):**
```
shasum -a 256 <BACKUP_ARTIFACT_PATH>/printforge_prod_<TIMESTAMP>.dump \
  > <BACKUP_ARTIFACT_PATH>/printforge_prod_<TIMESTAMP>.dump.sha256
```

**Artifact retention:**
- Retain in access-controlled storage only (per `BACKUP-RESTORE.md` §5:
  *"They contain all customer PII and password hashes — treat as a
  secret"*).
- Do **not** commit the dump file, or its path if the path itself reveals
  anything sensitive, to the git repository.
- Retention window: at minimum until D8 is recorded RESOLVED and the
  evidence package (§9) is filed; a longer retention decision (e.g. as a
  standing disaster-recovery artifact) is a separate owner decision, not
  implied by this runbook.

**Secure artifact storage / permissions:**
- File permissions `600` (owner read/write only) on the host that created
  it.
- Stored in the same class of access-controlled location the owner
  already uses for other production secrets — not a shared drive, not an
  email attachment, not a chat upload.

**Encryption:**
- Given the artifact contains "all customer PII and password hashes"
  (`BACKUP-RESTORE.md` §5), encrypt at rest if the storage location does
  not already provide encryption-at-rest guarantees the owner trusts (this
  matches the existing doc's own secret-handling standard — it does not
  introduce a new requirement not already implied by that classification).

**Metadata to accompany the artifact (record alongside, not inside, the
dump — the dump itself must not be edited):**
```
Artifact:          printforge_prod_<TIMESTAMP>.dump
SHA-256:           <checksum>
Created:           <ISO 8601 UTC>
Source:            production Render PostgreSQL (non-secret identity per §2)
Created by:        <operator, per §1 authorization record>
pg_dump version:   <output of `pg_dump --version`>
Size:              <bytes>
```

---

## 5. Restore

Restore targets **only** the disposable scratch database verified in §3.
Never restore into, or alongside, any database an application connects to.

**Procedure:**

1. **Confirm source artifact** — locate `printforge_prod_<TIMESTAMP>.dump`
   and its accompanying `.sha256` file from §4.
2. **Confirm checksum:**
   ```
   shasum -a 256 -c <BACKUP_ARTIFACT_PATH>/printforge_prod_<TIMESTAMP>.dump.sha256
   ```
   If this fails: **STOP** (§8) — do not restore a dump that fails
   integrity verification.
3. **Confirm scratch target** — the connection string in
   `SCRATCH_DATABASE_URL` matches the scratch instance identified in §3.
4. **Confirm scratch target is NOT production** — repeat the read-only
   identity check from §3; the returned database name/host must match the
   scratch identity, never the production identity recorded in §2.
5. **Restore:**
   ```
   pg_restore --no-owner --no-privileges --clean --if-exists \
     --dbname "<SCRATCH_DATABASE_URL>" \
     <BACKUP_ARTIFACT_PATH>/printforge_prod_<TIMESTAMP>.dump
   ```
   (Identical flags to `BACKUP-RESTORE.md` §5 — `--clean --if-exists`
   allows re-running against the same scratch target idempotently if a
   prior attempt partially completed.)
6. **Capture restore output/errors** — redirect and retain
   `pg_restore`'s full stdout/stderr for the evidence package (§9); a
   restore with unexpected errors (not the routine `--if-exists`
   drop-warnings) is a STOP condition (§8), not something to work around.
7. **Do not connect the application to the restored database** unless a
   specific verification step in §6 explicitly requires it, and only for
   the duration of that check, using a **temporary, isolated** backend
   configuration — never the real production or staging deployment's
   `DATABASE_URL`.
8. **Verify database structure and data** — proceed to §6.

---

## 6. Load verification

None of the checks below may be satisfied by modifying the restored
database. If a check fails, the failure is recorded (§7, §9) — the
database is not "fixed" to make verification pass, per the task's own
explicit rule.

### Database-level
- [ ] Connection to `SCRATCH_DATABASE_URL` succeeds:
      `psql "<SCRATCH_DATABASE_URL>" -c "select 1;"`
- [ ] PostgreSQL version recorded: `psql "<SCRATCH_DATABASE_URL>" -c "select version();"`
- [ ] Database is accessible for subsequent queries without error.

### Schema-level
- [ ] Expected tables exist — compare `\dt` output (or
      `select tablename from pg_tables where schemaname='public';`)
      against the current `backend/prisma/schema.prisma` model list
      (32 models as of the Phase 2a state — see
      `docs/saas/PHASE-2A-CHANGE-MAP.md`).
- [ ] Prisma migration history exists and is complete:
      `select migration_name, finished_at from "_prisma_migrations" order by started_at;`
      — expect all 11 migrations currently committed under
      `backend/prisma/migrations/` to appear, most recently
      `20260906171709_add_customer_and_platform_role`, with no row showing
      a null `finished_at` (a failed/rolled-back migration).
- [ ] Expected enums/types exist — spot-check via
      `select typname from pg_type where typtype='e';` for at least
      `Role`, `PlatformRole`, `TenantRole`, `MembershipStatus`, and the
      commerce enums (`OrderStatus`, etc.) already defined in
      `schema.prisma`.
- [ ] Important indexes/constraints intact — spot-check the unique
      constraints this runbook and the Phase 2b design depend on:
      `tenant_memberships (userId, tenantId)`,
      `customers (storeId, email)`, and the partial unique index on
      `stores (tenantId) where "isPrimary"`.

### Commerce-level
- [ ] Existing commerce tables exist: `orders`, `carts`, `reviews`,
      `coupon_usages`, `idempotency_keys`, `uploaded_files`,
      `payment_attempts`, `invoices`, `order_status_history`,
      `app_settings` (per `BACKUP-RESTORE.md` §6's own row-count checklist
      — reused here, not reinvented).
- [ ] Representative row counts are queryable (not compared to a specific
      expected number here — that comparison belongs to §7 reconciliation,
      against the production count captured at dump time):
      `select count(*) from "orders";` etc. for each table above.

### SaaS foundation
- [ ] `tenants`, `stores`, `store_domains`, `tenant_memberships`,
      `subscriptions`, `customers` tables exist (Phase 1 + Phase 2a
      additions).
- [ ] `users.platformRole` column exists (nullable `PlatformRole` enum,
      added in migration `20260906171709_add_customer_and_platform_role`
      per `docs/saas/PHASE-2A-CHANGE-MAP.md`).
- [ ] No `customerId`/`tenantId`/`storeId` columns exist yet on the six
      existing commerce tables (`orders`, `carts`, `reviews`,
      `coupon_usages`, `idempotency_keys`, `uploaded_files`) — those are
      Phase 4 scope; their presence in a restored production copy would
      indicate the source database is **ahead of** what this repository's
      schema expects, which is itself worth flagging in §9, not silently
      accepted.

---

## 7. Reconciliation evidence

A minimal, safe comparison between the production source and the restored
scratch copy — structural/count evidence only, never customer content.

| Evidence | Production (captured at/near dump time) | Scratch (post-restore) | Match? |
|---|---|---|---|
| Table inventory (count of tables in `public` schema) | `<n>` | `<n>` | [ ] |
| `_prisma_migrations` row count | `<n>` | `<n>` | [ ] |
| Latest applied migration name | `<name>` | `<name>` | [ ] |
| `users` row count | `<n>` | `<n>` | [ ] |
| `orders` row count | `<n>` | `<n>` | [ ] |
| `customers` row count | `<n>` | `<n>` | [ ] |
| `tenant_memberships` row count | `<n>` | `<n>` | [ ] |
| Dump file SHA-256 | `<hash>` | *(n/a — hash is of the artifact, not the live restored DB)* | — |
| Restore completion status | — | `<pg_restore exit code + summary>` | [ ] |

**Explicitly out of scope for this evidence table:** any customer name,
email, address, order content, or payment detail. Row counts and
migration/table metadata are sufficient to prove recoverability; they do
not require inspecting or copying any actual record.

---

## 8. Failure handling — STOP conditions

Any of the following halts the runbook immediately. **D8 remains BLOCKED.**
No STOP condition is worked around by modifying production, relaxing a
check, or improvising a substitute step.

- [ ] Wrong source database identified during the §2 identity check.
- [ ] Wrong scratch target identified during the §3/§5 identity check.
- [ ] Required credentials unavailable through the authorized mechanism
      (§1/§2) — do not fall back to an unauthorized/ambient credential.
- [ ] Scratch target cannot be proven disposable (§3).
- [ ] `pg_dump` fails or exits non-zero.
- [ ] Checksum mismatch between the recorded `.sha256` and the artifact
      at restore time (§5, step 2).
- [ ] `pg_restore` fails, exits non-zero, or reports errors beyond the
      routine `--if-exists` drop-warnings.
- [ ] Any expected table, enum, or migration row (§6) is missing.
- [ ] Migration history in the restored copy does not match the
      migrations committed in `backend/prisma/migrations/` (extra,
      missing, or out-of-order entries).
- [ ] Unexpected structural differences from the current
      `backend/prisma/schema.prisma` (e.g. columns from a phase not yet
      implemented in this repository).
- [ ] Unexplained row-count mismatch between production and the restored
      copy that isn't attributable to normal write activity between dump
      and restore (e.g. an entire table reporting zero rows when
      production has data).
- [ ] Any accidental connection — read or write — from an application
      instance to the scratch or production database outside the exact
      steps this runbook defines.

On any STOP: record the condition, the step it occurred at, and the exact
(non-secret) diagnostic output in the evidence package (§9) with a verdict
of **FAILED**, and report to the owner. Do not re-attempt against
production. Do not attempt an undocumented workaround.

---

## 9. Evidence package

Every completed (or failed) attempt produces this package, retained
alongside — never inside — `docs/saas/DECISIONS.md`.

```
D8 Evidence ID:            D8-<YYYYMMDD>-<sequence>
Operator:                  <name>
Owner authorization ref:   <§1 authorization record date/name>
Date/time (UTC):           <ISO 8601>
Source environment:        production
Source DB identity:        provider=Render PostgreSQL; database=<name>;
                            host=<value or "redacted">   [NO CONNECTION STRING]
Scratch DB identity:       provider=<...>; instance=<...>; created=<...>
                            [NO CONNECTION STRING]
PostgreSQL version:        <from §6>
Dump method:                pg_dump --format=custom --no-owner --no-privileges
Artifact identifier:       printforge_prod_<TIMESTAMP>.dump
Artifact checksum:         <SHA-256>
Artifact storage location: <access-controlled location, described not linked
                            if the description itself would be sensitive>
Restore method:             pg_restore --no-owner --no-privileges --clean --if-exists
Restore result:             SUCCESS | FAILED (see §8)
Verification results:       PASS | FAIL per §6 checklist (attach filled checklist)
Table/schema verification:  <summary>
Row-count verification:     <summary, referencing §7 table>
Errors/warnings:            <verbatim non-secret output, or "none">
Final D8 verdict:           RESOLVED | BLOCKED (unchanged)
```

**Never included:** `DATABASE_URL` (production or scratch), passwords,
tokens, API keys, or any customer PII beyond aggregate row counts.

### Interim evidence log (partial checks — not a full D8 evidence package)

This log records individual pieces of D8-related evidence as they occur,
before a complete restore-and-verify cycle exists. Each entry states
plainly how it was performed and by whom. **An entry here does not, by
itself, satisfy any part of §10's RESOLVED criteria** — it is a partial
record only.

**Entry 1 — 2026-09-07 — §2 production identity check**
```
Type:                         MANUAL OPERATOR VERIFICATION — performed by
                               the operator outside Claude Code, in their
                               own local terminal. Not executed, observed,
                               or independently verified by the Claude
                               Code session; recorded here solely on the
                               operator's own attestation.
Operator:                     Atharva
Date:                         2026-09-07
Method:                       local terminal, psql, against the Render
                               production database
Query:                         SELECT current_database(), inet_server_addr();
Result — current_database():  printforge_db
Result — inet_server_addr():  10.28.26.163
Query executed successfully:  YES (per operator attestation)
Production writes:            NONE
Phase 2b:                     NOT EXECUTED
Scope:                        Confirms only the §2 identity check
                               (production reachable; database identity
                               matches expected). Does NOT constitute a
                               backup, a restore, or a completed §9
                               evidence package — those still require a
                               pg_dump artifact, a scratch restore, and
                               full §6 verification, none of which have
                               occurred.
```

**Entry 2 — 2026-09-07 — Execution attempt halted at §2 (STOP, §8)**
```
Type:                         CLAUDE CODE EXECUTION ATTEMPT — operator
                               instructed this session to execute §2–§10
                               of this runbook directly.
Operator:                     Atharva (per §1 authorization record)
Date:                         2026-09-07
Pre-checks performed:
  - PostgreSQL 18.6 binaries verified at the specified paths
    (psql, pg_dump, pg_restore) — OK.
  - Environment variable presence checked (values never read into any
    command output or file):
      PRODUCTION_DATABASE_URL:  NOT SET in this process's environment.
      SCRATCH_DATABASE_URL:     SET (non-empty).
STOP condition triggered:      §8 — "Required credentials unavailable
                               through the authorized mechanism (§1/§2)
                               — do not fall back to an unauthorized/
                               ambient credential."
Action taken:                  Execution halted immediately after the
                               environment check. No connection to
                               production or scratch was attempted. No
                               pg_dump, pg_restore, or psql command was
                               run against any database. No credential
                               discovery (.env, shell history, shell
                               profile, Render CLI, or any ambient
                               session) was attempted, per the explicit
                               prohibition in §1.
Production writes:             NONE (no production access occurred at all)
Phase 2b:                      NOT EXECUTED
D8 verdict this attempt:       BLOCKED — not a §10 evidence package;
                               this entry records only that the attempt
                               did not proceed past §2 due to missing
                               credential material in the execution
                               environment. D8 status is unchanged from
                               before this attempt.
Next step (not taken here):    The operator must re-establish
                               PRODUCTION_DATABASE_URL in the same
                               process this session's tools execute in,
                               via the §1-authorized mechanism, before
                               this runbook can proceed past §2.
```

**Entry 3 — 2026-09-07 — §4–§7 backup, restore, and load verification (STOP at §6, schema-level)**
```
Type:                          CLAUDE CODE EXECUTION — production backup
                               (artifact + checksum) had already been
                               produced by the operator via the §1-
                               authorized mechanism before this entry;
                               this session verified the checksum,
                               restored the existing artifact into the
                               already-provisioned disposable scratch
                               instance, and ran the §6 checklist. No
                               production connection was made or
                               attempted by this session at any point.
Operator:                      Atharva (per §1 authorization record)
Date:                          2026-09-07

Backup artifact (pre-existing, produced under §1 authorization):
  Artifact:                    printforge_prod_20260907T163013Z.dump
  SHA-256:                     252a17f269549259c4eb8cd9e9764f4521173579073e4bab8a78bd56614fb38e
  Checksum verify (this entry): shasum -a 256 -c → OK
  Size:                        127,919 bytes
  Permissions:                 600 (owner read/write only)
  Format:                      pg_dump --format=custom (TOC 175 entries)
  Dumped from:                 PostgreSQL 18.6 (Debian 18.6-1.pgdg12+2) — dbname printforge_db
  pg_dump version:             18.6 (Homebrew)

Scratch target (pre-existing, provisioned under §1 authorization):
  Provider:                    local disposable PostgreSQL 18.6 instance
                                (Homebrew postgresql@18), port 55432 —
                                separate server process, not the app's
                                dev/test Postgres instance, no
                                application DATABASE_URL points at it.
  Database:                    d8_scratch
  Identity check:               confirmed non-production (local instance,
                                distinct host/port from the production
                                identity recorded in §2/Entry 1).

Restore (this entry — re-run for a fresh, captured log; idempotent
per §5 note, `--clean --if-exists`):
  Command:                     pg_restore --no-owner --no-privileges
                                --clean --if-exists --dbname
                                <scratch, local, non-production>
                                printforge_prod_20260907T163013Z.dump
  Exit code:                   0
  stderr:                      empty (no warnings, no errors)
  Production writes:           NONE (restore target was scratch only)

§6 Load verification results:
  Database-level:               PASS — connects; `select 1` succeeds;
                                queryable without error.
  Schema-level:                 FAIL —
    - Table count:              26 present vs. 32 expected (Phase 2a
                                model count per PHASE-2A-CHANGE-MAP.md).
    - _prisma_migrations:       9 rows, latest =
                                `20260902031308_order_tax_snapshot_and_invoices`.
                                MISSING: `20260905191258_add_saas_foundation`,
                                `20260906171709_add_customer_and_platform_role`
                                (11 migrations exist on disk under
                                backend/prisma/migrations/).
    - Enums:                    `PlatformRole`, `TenantRole`,
                                `MembershipStatus`, `TenantStatus`,
                                `StoreStatus`, `DomainVerificationStatus`,
                                `SubscriptionStatus` — ALL ABSENT.
    - users.platformRole:       ABSENT.
  Commerce-level:                PASS — orders, carts, reviews,
                                coupon_usages, idempotency_keys,
                                uploaded_files, payment_attempts,
                                invoices, order_status_history,
                                app_settings all present and queryable;
                                no `customerId`/`tenantId`/`storeId`
                                columns present on any of them (correct
                                — that is Phase 4 scope, not yet applied,
                                consistent with the source being genuine
                                unmigrated production).
  SaaS foundation:               FAIL — `tenants`, `stores`,
                                `store_domains`, `tenant_memberships`,
                                `subscriptions`, `customers`, `plans` —
                                ALL ABSENT.

STOP condition triggered:      §8 — schema-level verification failure.
                                This is the real, expected consequence of
                                production being 2 migrations behind the
                                11 committed in this repository — not a
                                restore defect. Per §6's own instruction,
                                the failure is recorded, not "fixed" by
                                modifying the restored database.

§7 Reconciliation (structural/count only, no PII):
  Table inventory (public schema):     scratch = 26  (production, same
                                        dump = 26 by construction)
  _prisma_migrations row count:        scratch = 9   (production = 9)
  Latest applied migration:            scratch = production =
                                        `20260902031308_order_tax_snapshot_and_invoices`
  users row count:                     23
  orders row count:                    40
  customers row count:                 table does not exist (expected —
                                        pre-Phase-2a-migration production)
  tenant_memberships row count:        table does not exist (expected)
  Restore completion status:           SUCCESS, exit code 0, no errors
  Note:                                the dump IS the production source
                                        at capture time, so a scratch
                                        count equal to a fresh live
                                        production count is guaranteed by
                                        a clean restore (exit 0, empty
                                        stderr) and was not re-verified
                                        by a second live production query
                                        — no additional production access
                                        was made or sought for this entry.

Production writes:             NONE
Phase 2b:                      NOT EXECUTED
D8 verdict this entry:         BLOCKED (unchanged). §10 requires ALL
                                eight conditions, including "load
                                verification succeeded against every
                                check in §6" (condition 6) — the
                                schema-level and SaaS-foundation checks
                                above FAILED, so D8 cannot be marked
                                RESOLVED from this entry. The backup and
                                restore mechanics themselves are proven
                                sound (checksum verified, restore exit 0,
                                commerce-level data intact); what remains
                                outstanding is that production has not
                                yet received the two additive migrations
                                already committed to this repository.
Next step (not taken here):    Apply `20260905191258_add_saas_foundation`
                                and `20260906171709_add_customer_and_platform_role`
                                to production via `prisma migrate deploy`
                                — this requires its own explicit
                                production-migration authorization,
                                separate from the §1 D8 authorization
                                record (see D8-OWNER-OPS-HANDOFF.md
                                "Critical boundary": the existing
                                authorization explicitly does not extend
                                to production migrations). Not requested
                                or performed here. Once applied, this
                                drill must be re-run against a fresh
                                post-migration production backup before
                                D8 can be marked RESOLVED.
```

**Entry 4 — 2026-09-07 — Fresh post-migration §2–§9 drill (full pass)**
```
Context:                       Production received the two additive
                                migrations named in Entry 3 via an
                                explicitly authorized, separately scoped
                                production-migration authorization
                                (distinct from the §1 D8 authorization),
                                executed and verified in this session.
                                Entry 3's artifact (`printforge_prod_
                                20260907T163013Z.dump`) now represents a
                                stale, pre-migration snapshot and was not
                                reused, per instruction.
Operator:                      Atharva (per §1 authorization record)
Date:                          2026-09-07

§2 — Identity check (read-only):
  Production:                  database=printforge_db, host=10.28.26.163
                                (matches Entry 1/Entry 3 production
                                identity — same production instance).
  Scratch:                     database=d8_scratch, host=::1 (localhost),
                                port=55432 — confirmed distinct from
                                production before restore.

§4 — Fresh backup artifact:
  Artifact:                    printforge_prod_20260907T171225Z.dump
  Created:                     2026-09-07 22:42:25 IST (2026-09-07T17:12:25Z)
  Size:                        149,660 bytes
  Permissions:                 600 (chmod applied immediately after dump)
  Format:                      pg_dump --format=custom --no-owner
                                --no-privileges (TOC: 231 entries, up from
                                175 pre-migration — consistent with the
                                6 new tables + new enums)
  Dumped from:                 PostgreSQL 18.6 (Debian 18.6-1.pgdg12+2),
                                dbname printforge_db
  pg_dump version:             18.6 (Homebrew)
  SHA-256:                     dfcd2399f0136ad0ba1d75341135557abca856d6b720eaa6fe9efb73fd91cb48
  Checksum verify:              shasum -a 256 -c → OK

§5 — Restore (into d8_scratch only):
  Command:                     pg_restore --no-owner --no-privileges
                                --clean --if-exists --dbname <scratch,
                                local, non-production> printforge_prod_
                                20260907T171225Z.dump
  Exit code:                   0
  stderr:                      empty (0 lines — no warnings, no errors)
  Production writes:           NONE (restore target was scratch only;
                                production was never written to)

§6 — Load verification: ALL CHECKS PASS
  Database-level:               PASS — connects; `select 1` succeeds;
                                version PostgreSQL 18.6 confirmed.
  Schema-level:                 PASS —
    - Table count:              33 (32 Prisma models + `_prisma_migrations`
                                — matches Phase 2a's documented 32-model
                                schema).
    - _prisma_migrations:       11 rows, latest =
                                `20260906171709_add_customer_and_platform_role`,
                                0 rows with null `finished_at` or non-null
                                `rolled_back_at`.
    - Enums:                    all present — `PlatformRole`,
                                `TenantRole`, `TenantStatus`,
                                `StoreStatus`, `MembershipStatus`,
                                `DomainVerificationStatus`,
                                `SubscriptionStatus`, plus all pre-existing
                                commerce enums (19 total).
    - users.platformRole:       present — nullable, `PlatformRole` enum.
    - Key indexes:              `tenant_memberships_userId_tenantId_key`,
                                `customers_storeId_email_key`,
                                `stores_tenant_primary_unique` — all
                                present.
  Commerce-level:                PASS — all 10 legacy commerce tables
                                present and queryable; no `customerId` /
                                `tenantId` / `storeId` column exists on
                                any of them yet (correct — Phase 4 scope,
                                not this migration).
  SaaS foundation:               PASS — `tenants`, `stores`,
                                `store_domains`, `tenant_memberships`,
                                `subscriptions`, `customers`, `plans` —
                                ALL PRESENT.

§7 — Reconciliation (structural/count only, no PII; production values via
a fresh read-only query, not inferred from the dump):
  | Evidence                          | Production | Scratch | Match |
  |------------------------------------|-----------|---------|-------|
  | Table inventory (public schema)   | 33        | 33      | ✅ |
  | `_prisma_migrations` row count    | 11        | 11      | ✅ |
  | Latest applied migration          | `20260906171709_add_customer_and_platform_role` | same | ✅ |
  | `users` row count                 | 23        | 23      | ✅ |
  | `orders` row count                | 40        | 40      | ✅ |
  | `customers` row count             | 0         | 0       | ✅ (table exists, no backfill run — expected, Phase 2b not executed) |
  | `tenant_memberships` row count    | 0         | 0       | ✅ (same reason) |
  | Restore completion status         | —         | exit 0, 0 stderr lines | ✅ |

§9 — Evidence package:
```
D8 Evidence ID:            D8-20260907-02
Operator:                  Atharva
Owner authorization ref:   D8-OWNER-OPS-HANDOFF.md Authorization Record,
                            2026-09-07 (D8 restore-drill scope; production
                            migration itself was authorized separately,
                            not under this record — see the dedicated
                            production-migration authorization recorded
                            in this session's conversation log)
Date/time (UTC):           2026-09-07T17:12:25Z (dump) /
                            2026-09-07T17:1x (restore+verify, same session)
Source environment:        production
Source DB identity:        provider=Render PostgreSQL; database=printforge_db;
                            host=10.28.26.163   [NO CONNECTION STRING]
Scratch DB identity:       provider=local Homebrew PostgreSQL 18.6;
                            instance=localhost:55432; database=d8_scratch
                            [NO CONNECTION STRING]
PostgreSQL version:        18.6 (both source and scratch)
Dump method:                pg_dump --format=custom --no-owner --no-privileges
Artifact identifier:       printforge_prod_20260907T171225Z.dump
Artifact checksum:         dfcd2399f0136ad0ba1d75341135557abca856d6b720eaa6fe9efb73fd91cb48
Artifact storage location: local access-controlled path (600 perms),
                            /Users/atharva/PrintForge/d8-artifacts/
                            (outside the git repository; not committed)
Restore method:             pg_restore --no-owner --no-privileges --clean --if-exists
Restore result:             SUCCESS (exit 0, 0 stderr lines)
Verification results:       PASS — all §6 checks (database, schema,
                            commerce, SaaS foundation)
Table/schema verification:  33/33 tables, 11/11 migrations, all required
                            enums and the `platformRole` column present
Row-count verification:     users/orders match production exactly (23/40);
                            customers/tenant_memberships correctly 0/0
                            pre-backfill
Errors/warnings:            none
Final D8 verdict:           RESOLVED — conditions 1–7 met by this
                            evidence; condition 8 satisfied by explicit
                            owner confirmation (below).
```

Owner confirmation (condition 8):
```
Owner:                      Atharva — Project Owner / Ops Owner
Date:                        2026-09-07
Confirmation text:          "I, Atharva — Project Owner / Ops Owner, have
                             reviewed D8 evidence package D8-20260907-02
                             (Entry 4) and explicitly confirm the result.
                             Owner confirmation for §10 condition 8: MET."
Recorded in:                 DECISIONS.md D8 record (Decision Log),
                             this session's conversation log
```

Production writes:             NONE
Phase 2b:                      NOT EXECUTED
D8 verdict this entry:         **RESOLVED** — all eight §10 conditions
                                met (1–7 by this entry's evidence, 8 by
                                the owner confirmation above). See
                                `docs/saas/DECISIONS.md` D8 record for the
                                canonical governance entry.
```

---

## 10. D8 governance update

D8 may be marked **RESOLVED** in `docs/saas/DECISIONS.md` only after
**all** of the following are true and evidenced by a completed §9 package:

1. Authorized access existed and was used (§1, §2).
2. A production backup artifact exists (§4).
3. The artifact is identified and checksummed (§4, §9).
4. The scratch database was proven disposable before use (§3).
5. The restore succeeded with no unresolved errors (§5).
6. Load verification succeeded against every check in §6 (no unchecked
   or failed item silently dropped).
7. The evidence package (§9) is complete and retained.
8. The owner/Ops named in §1 has reviewed and confirmed the result.

**Until all eight conditions are met, D8 stays BLOCKED/PENDING** — a
partially-run drill, a dump that was never restored, a restore into a CI
test container, or a restore that produced any unresolved STOP condition
(§8) does **not** satisfy D8, regardless of how far the procedure got.

When all eight conditions are met, the update to `docs/saas/DECISIONS.md`
should follow the same pattern used for D2's resolution: a dated Decision
Log entry citing this runbook and the §9 evidence ID, with D8's Status
field changed to `RESOLVED`, its Consequences field noting the artifact
reference, and explicit confirmation that **G-16 remains PENDING** (§11).
That edit is a separate, future task — not part of this preparation.

---

## 11. After D8 — G-16 stays separate

A resolved D8 changes the gate state to:

```
D2 = RESOLVED
D8 = RESOLVED
G-16 = PENDING
Phase 2b = BLOCKED
```

**D8's resolution does not authorize Phase 2b.** Per
`docs/saas/DECISIONS.md`'s G-16 record and `PHASE-2-DECISION-CLOSURE.md
§20.3`, G-16 requires its own, separate owner authorization, which itself
depends on:
- D2 resolved (done),
- D8 resolved (this runbook, once executed),
- a clean Phase 2b dry run and reconciliation performed **against this
  verified restore copy** (see the Phase 2b pre-flight package's §7
  restored-copy dry-run design),
- a **fresh** pre-backfill production snapshot taken immediately before
  any production execution (not the same artifact used for the dry run),
- an explicit, dated owner authorization recorded as G-16's own Decision
  Log entry.

**Do not collapse D8 and G-16 into one approval.** A single sign-off that
casually says "backups are fine, go ahead" does not satisfy the separate,
narrower G-16 requirement — G-16 is about authorizing the backfill
specifically, not about the existence of a restore artifact.

---

## 12. Operational checklist

```
[ ] Owner authorization recorded (§1)
[ ] Sanctioned production DB access established (§2)
[ ] Production DB identity verified (§2)
[ ] Scratch DB provisioned (§3)
[ ] Scratch DB identity verified (§3)
[ ] Scratch DB confirmed disposable (§3)
[ ] pg_dump completed (§4)
[ ] Artifact checksum captured (§4)
[ ] Artifact securely retained (§4)
[ ] Scratch restore completed (§5)
[ ] Restore errors reviewed (§5)
[ ] Schema verified (§6)
[ ] Prisma migration history verified (§6)
[ ] Commerce tables verified (§6)
[ ] SaaS foundation verified (§6)
[ ] Row-count checks completed (§7)
[ ] No production mutation confirmed
[ ] Evidence package retained (§9)
[ ] D8 owner verification completed (§10)
[ ] Only then mark D8 RESOLVED in docs/saas/DECISIONS.md
```
