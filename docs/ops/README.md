# PrintForge — Operations Documentation

Operational runbooks for the **single-tenant** PrintForge deployment. These
documents describe how the system is *actually* built and deployed today; they
do not introduce new infrastructure.

| Document | Purpose |
|---|---|
| [`ENVIRONMENT.md`](./ENVIRONMENT.md) | Every backend and frontend environment variable — required-when, purpose, format, where it is provisioned. |
| [`DEPLOYMENT.md`](./DEPLOYMENT.md) | Pre-deploy checklist, migration procedure, deploy + rollback steps, incident basics. |
| [`BACKUP-RESTORE.md`](./BACKUP-RESTORE.md) | Database backup responsibility, RPO/RTO assumptions, restore procedure, what is not yet verified. |
| [`PRODUCTION-SMOKE-TEST.md`](./PRODUCTION-SMOKE-TEST.md) | Post-deploy checklist across infrastructure, auth, commerce, payment, email, admin, upload, security. |
| [`DEPENDENCY-ADVISORIES.md`](./DEPENDENCY-ADVISORIES.md) | Known `npm audit` findings, why they are accepted for now, and the CI policy around them. |

## Status legend

Throughout these docs:

- **DOCUMENTED** — the intended/expected configuration or procedure, written down but not confirmed against live infrastructure in this repository's history.
- **VERIFIED** — actually executed/confirmed, with a date.

As of the Phase 15.0 hardening pass, everything here is **DOCUMENTED**. No
step has been executed against live production infrastructure from this
repository. See each document for specifics.

## Deployment topology (frozen — BLUEPRINT-v1.2 §16, §30)

| Layer | Host | Notes |
|---|---|---|
| Backend | Render (Node web service) | one instance; `@nestjs/schedule` cron jobs assume a single instance |
| Frontend | Vercel (static SPA) | Vite build output |
| Database | Render PostgreSQL | single database, single source of truth |
| Payments | Razorpay | one merchant account |
| Media | Cloudinary | one account |
| Email | Resend | one verified sender domain |
| Errors | Sentry | optional, error-tracking only |

There are **no** Dockerfiles, `render.yaml`, or `vercel.json` in the
repository. Deployment is performed through the Render and Vercel dashboards
(git-integration auto-deploy on push to `develop`/`main`, or manual deploy).
That is the accurate current state — these docs describe that flow rather
than a containerised one.
