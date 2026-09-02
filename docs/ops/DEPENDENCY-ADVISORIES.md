# Dependency Advisories

CI runs `npm audit` on both packages:

| Package | CI step | Policy |
|---|---|---|
| `frontend` | `npm audit --omit=dev --audit-level=high` | **Blocking.** Runtime tree is currently clean (`0 vulnerabilities`). A new high/critical runtime advisory fails the build. |
| `backend` | `npm audit --omit=dev` (`continue-on-error: true`) | **Advisory.** Surfaces new issues without breaking the build on the known, accepted set below. |

Last reviewed: **2026-09-02** (Phase 15.0).

---

## Accepted backend advisories

`npm audit --omit=dev` currently reports **5** (4 high, 1 critical), all
transitive through build/CLI tooling that is **not on the request path**:

### 1. `tar` (critical) ← `@mapbox/node-pre-gyp` ← `bcrypt`

- Multiple `node-tar` path-traversal / DoS advisories (GHSA-34x7-hfp2-rc4v, GHSA-8qq5-rm4j-mr97, GHSA-83g3-92jg-28cx, and others).
- `bcrypt@5.1.1` uses `@mapbox/node-pre-gyp` **only at install time** to fetch a prebuilt native binary. `tar` is not called at runtime, and PrintForge never extracts archives from user input.
- Fix requires `bcrypt@6.x` (a major bump of the password-hashing library). Out of scope for a production-hardening phase whose rule is "smallest correct change" and "CI must remain reliable". Tracked for a dedicated dependency phase.

### 2. `deepmerge-ts` (high) ← `@prisma/config` ← `prisma`

- GHSA-ggr8-5vv4-36mx — stack exhaustion merging recursive object graphs.
- `prisma` is a **devDependency** (the CLI used for `generate` / `migrate deploy`), not a runtime import. `@prisma/client` (the runtime) is unaffected.
- `npm audit --omit=dev` still surfaces it because the resolver walks the CLI. Fixed by a future `prisma` minor; will be picked up on the next routine Prisma bump.

## Why not `npm audit fix`

- `npm audit fix` (without `--force`) proposes bumps that, for this tree,
  reach into `prisma` / `bcrypt` major ranges.
- Dependency upgrades are explicitly **out of scope** for Phase 15.0
  (production configuration + ops readiness), and an unrelated `bcrypt` major
  bump on the auth path is a real regression risk.
- No advisory here is exploitable in the deployed request path.

## Review cadence

- Re-run `npm audit --omit=dev` in both packages at the start of any
  dependency-maintenance phase.
- If a **new** advisory appears that is on the runtime request path, treat it
  as a P1 and address it directly (not deferred).
- When `bcrypt` and `prisma` are next bumped, delete the corresponding entry
  above and, if the backend tree comes fully clean, switch the backend CI step
  to blocking (`--audit-level=high`, drop `continue-on-error`).
