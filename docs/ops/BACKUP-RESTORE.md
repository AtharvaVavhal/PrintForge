# Backup & Restore

**Status: DOCUMENTED — NOT VERIFIED.** No restore has been performed or
tested from this repository. This document records assumptions and the
intended procedure so a real restore can be executed and then this file
updated with a **VERIFIED** date.

---

## 1. Database hosting assumptions

- PostgreSQL is hosted on **Render PostgreSQL** (managed).
- It is the **single source of truth** for all business state (orders,
  payments, invoices, catalog, users, settings). There is no secondary
  store; Cloudinary holds only product image binaries (re-uploadable),
  Razorpay and Resend hold their own transaction/message logs.
- Connection is via `DATABASE_URL` (see [`ENVIRONMENT.md`](./ENVIRONMENT.md)).

## 2. Backup responsibility

| Layer | Backup mechanism | Owner | Verified? |
|---|---|---|---|
| Database | Render PostgreSQL automated daily backups (retention per Render plan) | Render (managed) + PrintForge ops to confirm plan/retention | ❌ not confirmed in repo |
| Database (pre-deploy) | Manual snapshot / `pg_dump` before any migration (see [`DEPLOYMENT.md`](./DEPLOYMENT.md) §3) | PrintForge ops | ❌ |
| Cloudinary media | Cloudinary account (originals retained); not independently backed up | Cloudinary | ❌ |
| Code | Git / GitHub `origin` | GitHub | ✅ |
| Secrets / env | Render + Vercel dashboards; **no offline copy committed anywhere** | PrintForge ops | ❌ — a sealed offline copy of production secrets should exist |

**Action item (business/ops):** confirm the Render plan's backup frequency
and retention window, and whether point-in-time recovery (PITR) is available.

## 3. RPO / RTO

| Metric | Target | Basis |
|---|---|---|
| RPO (max acceptable data loss) | **Assumed ≤ 24 h** (daily managed backup). **Unconfirmed.** If Render PITR is on the plan, RPO drops to minutes. | Render managed backup cadence |
| RTO (max acceptable downtime to restore) | **Not defined.** Estimate: restore a managed backup to a new instance + repoint `DATABASE_URL` + redeploy ≈ 30–90 min, untested. | estimate only |

These are **targets to ratify with the business**, not measured values.

## 4. Restore procedure (intended — UNVERIFIED)

1. Declare the incident; stop write traffic if the DB is corrupt rather than lost (put backend in maintenance / scale to zero).
2. In Render, restore the chosen backup to a **new** PostgreSQL instance (do not overwrite the live one until the restore is validated).
3. Obtain the new instance's connection string.
4. Point a **staging** backend at it (`DATABASE_URL`) and run validation (§6).
5. If valid: update the production backend's `DATABASE_URL` to the restored instance and redeploy; or promote per Render's restore flow.
6. Run `npm run prisma:migrate:deploy` — the restored DB may predate the latest migrations; this brings the schema current. (Forward-only; see [`DEPLOYMENT.md`](./DEPLOYMENT.md) §11.)
7. Full [`PRODUCTION-SMOKE-TEST.md`](./PRODUCTION-SMOKE-TEST.md).
8. Reconcile external systems (§7).
9. Resume traffic. Write the post-incident report.

## 5. `pg_dump` / `pg_restore` fallback (intended — UNVERIFIED)

```
# Backup
pg_dump --format=custom --no-owner --no-privileges "$DATABASE_URL" > printforge_$(date +%Y%m%dT%H%M%SZ).dump

# Restore into an empty database
pg_restore --no-owner --no-privileges --clean --if-exists --dbname "$TARGET_DATABASE_URL" printforge_<ts>.dump
```

Store dumps in access-controlled storage. They contain **all customer PII and
password hashes** — treat as a secret.

## 6. Required verification after a restore

- [ ] `GET /api/v1/health/deep` → `200`.
- [ ] Row counts sane vs expectation: `users`, `orders`, `payment_attempts`, `invoices`, `products`.
- [ ] Latest `orders.createdAt` and `order_status_history.createdAt` — how much recent data was lost? Record it.
- [ ] `app_settings` intact (shipping fee, tax config, seller snapshot fields).
- [ ] `prisma migrate status` shows no pending/failed migrations after step 6.
- [ ] Log in as a known admin and a known customer.
- [ ] Partial-unique / unique constraints intact: attempt a duplicate would-be `orderNumber` / `invoiceNumber` mentally against `app_settings` counters — ensure the counter rows are present and ahead of the max used.
- [ ] Full smoke test.

## 7. Post-restore reconciliation of external systems

A restore rewinds the database but **not** Razorpay / Resend / Cloudinary.

- **Payments:** any payment captured *after* the backup point is missing from
  the restored DB. The `PaymentReconciliationService` cron re-queries Razorpay
  for pending orders and will re-mark them `PAID` — but orders created entirely
  after the backup are gone and cannot be reconstructed automatically. Cross-check
  the Razorpay dashboard payment list against `payment_attempts` for the gap window and rebuild manually if needed.
- **Invoices:** re-issued idempotently per order (`orderId @unique`) on demand.
- **Email:** `outbox_events` after the backup point are lost; some
  confirmation emails may have already been sent (customer has them) or never
  will be (re-send manually if required).
- **Media:** Cloudinary still holds the images; `product_images` rows may
  point at assets fine, or reference assets deleted after the backup — spot check.

## 8. What is NOT verified

- Render backup cadence, retention, and PITR availability.
- That a Render backup restore actually works end to end.
- Restore timing (RTO).
- The `pg_dump`/`pg_restore` fallback against this schema.
- Any automated backup of secrets/env.

Until a restore drill is run and this section is replaced with a
**VERIFIED &lt;date&gt;** note, assume backup/restore is best-effort managed
infrastructure only.
