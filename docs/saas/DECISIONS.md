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
| Last updated | 2026-09-25 (W8 STEP 1 — G-9 EXECUTED) — **⚖️ G-9 executed for Phase 9 W8 §17.2 step 1**: a fresh production PostgreSQL snapshot was taken and **independently verified against the artifact itself**, recorded as **`E-G9-1`** at spec §17.2a — `backend/printforge_prod_preP9W8_20260925T125908Z.dump`, **238,616 bytes**, SHA256 `e8d5a05b4a00f63d658a7ac8906250c29228544a9eb3d2a875a88338ba4e0f56` (recomputed and matched), PostgreSQL server and client both **18.6**, `pg_restore --list` exits **0** with **389** TOC entries and **46** `TABLE DATA` entries, all core production tables present, deep health **200** at the time of the snapshot. It is confirmed **pre-migration**: `platform_config` is **absent** from the archive, and that table is created by the W1 migration. **Two handling items are recorded, not resolved:** the dump contains customer PII and password hashes (`BACKUP-RESTORE.md` §5) and currently sits in the working tree **uncovered by any `.gitignore` rule**; and the snapshot is valid only for the §17.2 steps 2–4 window it was taken for — retake rather than reuse if that window passes. **Evidence recording only — no deploy, migration, backfill, canary, mode flip or E-3 step was performed, and no credential was exposed.** §17.2 steps 2–10 remain NOT STARTED. See spec §17.2a. *(Earlier, same day: (W8 §17.1 GATE SATISFIED) — **The §17.1 hard gate for W8 is SATISFIED — all four items `yes`.** Item 4 (Render production configuration) is recorded as **`E-RENDER-1`** at spec §17.1b: **owner-attested** on 2026-09-25, **names confirmed and no value, secret or token recorded**, corroborated by a successful production boot (`env.validation.ts` makes `VERCEL_API_TOKEN`/`VERCEL_PROJECT_ID` required in production once `PLATFORM_STOREFRONT_DOMAIN` is set, and a Render environment change redeploys the service). Separately, §16.2a's three B-3 preconditions for `www.printforge.world` are recorded as **`E-W3-1`…`E-W3-3`** — **direct observations**, not attestations: public DNS resolution from `1.1.1.1`/`8.8.8.8`/`9.9.9.9`; Vercel project-domain `verified: true` with `misconfigured: false` and `redirect: null`; and an HTTPS handshake presenting a Let's Encrypt certificate (`CN=YR1`) whose SAN is `DNS:www.printforge.world`, valid through **2026-12-24** (point-in-time — re-observe if B-3 has not run by then). **This is evidence recording only: a gate verdict, NOT an authorization to execute.** No production, DNS, Vercel, Render, code, schema, migration, backfill, G-9, E-3, deployment or mode-flip action accompanies this record; the configuration is inert until §17.2 step 7 and the mode was confirmed still `legacy_single_store` the same day. See spec §17.1/§17.1b and §16.2a. *(Earlier, same day: (P9-D11 RECORDED) — **P9-D11 RESOLVED — RATIFIED — OPTION C**: the frontend's Vercel deployment origin (`FRONTEND_URL`, currently a `*.vercel.app` URL) is an **internal deployment origin only and not a customer-facing storefront hostname**. It **must not** receive a `StoreDomain` row, must not be treated as a `PLATFORM_SUBDOMAIN` or `CUSTOM` host, and is not added to B-3; customer storefront traffic arrives only on `{store.slug}.stores.printforge.world` or a `VERIFIED`+`ISSUED` `CUSTOM` host such as `www.printforge.world`. Storefront requests to the deployment origin under `host_resolution` **intentionally** return the generic unknown-host 404, while **CORS continues to admit it as the platform/admin origin in both modes** — new §4.1.3a records that **CORS admission does not imply storefront resolution**, so the two observations are correct simultaneously. `/admin/*`, `/platform/*`, health, auth and webhooks are unaffected (they never use `Origin`). This closes the OPEN item P9-D10 raised against §4.1.3 and unblocks §17.2 step 7 with respect to it. **No** `StoreDomain` row, schema, migration, database, backfill, DNS, Vercel, Render, deployment, G-9 or mode-flip change accompanies this record; P9-D6, P9-D10, platform-subdomain derivation, the §4.3 serving gates, the host-resolution architecture and the §9 CORS behaviour are all unchanged. **Production remains frozen.** See P9-D11. *(Earlier, same day: (P9-D10 RECORDED) — **P9-D10 RESOLVED — RATIFIED — OPTION B**: Tenant #1's optional `CUSTOM` canary hostname is **`www.printforge.world`**, replacing `www.printforge.in`, whose "already served / ownership established / certificate already issued" premises were false when written (`printforge.in` is registered but never delegated — `NXDOMAIN` from three public resolvers). The new hostname is **deliberately `CUSTOM`, not a `PLATFORM_SUBDOMAIN`**, so B-3 keeps exercising the full §4.3 `VERIFIED` + `ISSUED` gate and primary/canonical behaviour; **`stores.printforge.world` and ⚖️ P9-D6 are unchanged**, as are P9-D1…P9-D9, P9-S2/P9-S7/P9-S14 and G-21. New **§16.2a** makes DNS delegation, provider attachment and an **independent HTTPS/TLS observation** binding preconditions before production B-3 may assert `VERIFIED`/`ISSUED` — a hostname in source code is not evidence of ownership or a certificate. A separate confirmed defect was corrected: `frontend/vercel.json`'s SEO rewrites pointed at the non-resolving `api.printforge.in`, which would have failed `E-5`. Two items are left explicitly **OPEN**: a `StoreDomain` row for the `FRONTEND_URL`/admin origin, and the pre-existing `sameSite: 'strict'` refresh-cookie exposure (Phase 12). **Production remains frozen** — no DNS, Vercel, Render, deployment, G-9, migration, backfill or mode-flip change accompanies this record. See P9-D10. *(Earlier, same day: (W8 §17.1 ITEM 3 CLEARED) — **§17.1 item 3 CONFIRMED `yes`** — the `*.stores.printforge.world` wildcard certificate is evidenced by **`E-DNS-4`**, a direct read-only TLS observation (`openssl s_client` → `issuer=C=US, O=Let's Encrypt, CN=YR2`; validity 2026-09-25 → 2026-12-24; `X509v3 Subject Alternative Name: DNS:*.stores.printforge.world`), which closes the certificate half that `E-DNS-3` could not establish. **§17.1 items 1, 2 and 3 are now `yes`; item 4 (Render production configuration) is the sole outstanding checklist item and W8 remains BLOCKED.** `E-DNS-4` is a *platform-wildcard* certificate and leaves exit criterion `E-3` (custom domains) untouched. **No** DNS, Vercel, Render, code, schema, migration, backfill, G-9, deployment or mode-flip change accompanies this record — evidence recording only. See spec §17.1/§17.1a. *(Earlier, same day: (P9-D9 ORDERING DECIDED) — **P9-D9 EXTENDED** — `E-3` execution environment is **PRODUCTION** and `E-3` is **sequenced LAST**: it runs only after §17.1 item 3 (wildcard certificate evidence), §17.1 item 4 (Render production configuration) and every other W8 infrastructure gate the ratified runbook requires ahead of the §17.2 `host_resolution` activation are PASS, then the §17.2 sequence, then activation **only** via the ratified runbook, then `E-3`. Verification method fixed as `DNS_TXT`; the §19.1 evidence discipline is preserved unchanged. **Execution remains NOT AUTHORIZED** and the test hostname is still not supplied; **no** implementation, schema, DNS, Vercel, Render, deployment, G-9, backfill or mode-flip change accompanies this record. See P9-D9. *(Earlier, same day: (P9-D9 RECORDED) — **P9-D9 RESOLVED — RATIFIED** — exit criterion `E-3` is satisfied by **ROUTE A** (one real owner-controlled custom domain, not under `stores.printforge.world`, not the `FRONTEND_URL` host, not the API host), demonstrating the complete `add → VERIFIED → ISSUED → served` flow; an **HTTPS observation of the test hostname is required as evidence separate from PrintForge's derived `tlsStatus=ISSUED`** (which is computed from Vercel `verified && !misconfigured` and reads no certificate field); the ratified Phase 9 implementation is not to be modified unless a separate implementation gap is proven; a ten-item evidence set is fixed and carried as unfilled slots at spec §19.1. **EXECUTION IS NOT AUTHORIZED** — the test hostname is not yet supplied and no E-3 step, DNS change, Vercel change, Render change, deployment, G-9, migration, backfill or mode flip accompanies this record. P9-D1…P9-D8, P9-S2/P9-S7/P9-S14 and G-21 stand unmodified. See P9-D9. *(Earlier, same day: (P9-D6 AMENDED) — **P9-D6 DOMAIN AMENDED — the Phase 9 platform storefront domain is `stores.printforge.world`** (registrable domain `printforge.world`, registrar GoDaddy), superseding the `stores.printforge.app` named in the 2026-09-20 ratification, which was never provisioned for this purpose. **The amendment is a hostname change only** — no architecture, decision, schema, migration or code change accompanies it: P9-D1…P9-D8, P9-S2/P9-S7/P9-S14 and G-21 all stand unmodified, and the four-item §17.1 Ops checklist remains a hard pre-execution gate for W8 with **every item still unconfirmed** (none may be carried over, since each refers to the hostname that changed). P9-D6's original 2026-09-20 owner wording is preserved verbatim in its record and Decision Log; the amendment is recorded as a new dated log row. Spec §5.2 and §17.1 updated the same day. **No production, DNS, Vercel, Render, migration, backfill or deployment action accompanies this record.** See P9-D6.* *(Earlier: 2026-09-20 (G-21) — **G-21 APPROVED — Phase 9 specification approved; Phase 9 implementation AUTHORIZED**: `docs/saas/PHASE-9-START-GATE-AND-IMPLEMENTATION-SPEC.md` accepted as the Phase 9 implementation contract after verification that P9-D1…P9-D8 are all ratified, all 14 §21 specification decisions are resolved (S-2/S-7/S-14 via P9-S2/P9-S7/P9-S14), the mandated S-1/S-5/S-6/S-7/S-9/S-14 corrections are present, no stale pre-correction text remains, and the spec's schema footprint is exactly P9-D2 + P9-D8. **Phase 9 START GATE: READY — Wave 0 NOT started; NO code, schema, migration, environment variable, infrastructure, or production change accompanies this record.** See G-21. *(Earlier, same day: **P9-S2 / P9-S7 / P9-S14 RESOLVED — RATIFIED (Phase 9 specification decisions CLOSED)**: P9-S2 = new tenant permission `store-domain:manage`, OWNER-only default, existing `PermissionsGuard` + `@RequirePermission` the boundary (G-13 / P7-D2 pattern); P9-S7 = OPTION A — sticky platform revoke (`VERIFIED → FAILED` exits only via platform override / platform re-verify; merchant on-demand verify cannot restore; audited both ways; no schema field — every `FAILED` row is platform-revoked by construction since S-6 keeps merchant failures `PENDING`); P9-S14 = OPTION B — fail closed on an invalid persisted resolution mode (error log + Sentry + last-known valid cached mode, else HTTP 503; never silently `legacy_single_store`). All other spec §21 items (S-1, S-3, S-4, S-5, S-6, S-8, S-9 corrected to mode-coupled CORS, S-10, S-11, S-12, S-13) finalised as A/B in the same review without owner records. **Phase 9 SPEC STATUS: READY FOR IMPLEMENTATION REVIEW; START GATE still requires a G-21 spec-approval record.** **NO code, schema, migration, environment variable, infrastructure, or production change accompanies these records.** See the "Phase 9 Specification Decision Records" section. *(Earlier, same day: **P9-D1…P9-D8 RESOLVED — RATIFIED (Phase 9 decision docket CLOSED)**: P9-D1 = OPTION B — Phase 12 owns all customer-auth runtime items (`CustomerRefreshToken`, `/storefront/auth/*`, customer JWT issuance, `CUSTOMER_JWT_ACCESS_SECRET`, `customerId` cutover), resolving the "Phase 9/12" label carried by P2-D3/P2-D5/P2-D6/P2-D7/P2-D13/G-14/G-15/P4-D1 to Phase 12 without reopening any of them; P9-D2 = OPTION B — `StoreDomain` gains `type`, `verificationMethod`, `lastCheckedAt`, `tlsStatus` + their new enums, while **G-5's `DomainVerificationStatus = {PENDING, VERIFIED, FAILED}` is preserved verbatim and `VERIFYING` is NOT added — no G-5 amendment authorised**; P9-D3 = OPTION A — Vercel-managed TLS, no proxy, no Cloudflare for SaaS; P9-D4 = RE-FILED UNDER PHASE 12 — no Phase 9 cookie/session change, first-party-vs-proxied left for Phase 12, merchant/platform-admin sessions stay on the fixed platform domain; P9-D5 = OPTION A — Phase 9 owns `platform-domains`; P9-D6 = `stores.printforge.app` as the platform storefront domain (intent only — ownership, wildcard DNS, Vercel and API configuration UNCONFIRMED; mandatory ops pre-execution checklist in the spec; no secrets recorded); P9-D7 = OPTION A — on-demand verification only, cron → Phase 11; P9-D8 = `PlatformConfig`-row kill-switch (runtime, no redeploy), flag semantics deferred to the spec, requiring a new additive `PlatformConfig` table (none exists) — all formally ratified, with **NO code, schema, migration, environment variable, infrastructure, or production change accompanying these records**. See the "Phase 9 Decision Records" section. *(Earlier: 2026-09-14 — **P8-D6/D9 RESOLVED — RATIFIED**: the existing `D9` stub ("Merchant payment-credential storage," OPEN, "Gates Phase 8") is formally resolved — `PaymentAccount` merchant credentials will be stored as an application-level AES-256-GCM encrypted blob, with a single symmetric master key held as one Render environment secret (Part A/B); no external KMS/secrets-manager vendor is introduced, confirmed unavailable in PrintForge's current Render-only, no-container, no-IaC deployment (Part C); plaintext credentials are never stored, logged, or serialized, decrypted only inside the payment-provider adapter (Part D); merchant-level rotation is a normal re-encryption update, master-key rotation a controlled re-encryption operation (Part E); environment-managed per-merchant secrets are explicitly rejected as violating invariant 11's "no new deployment per store" (Part F); `RAZORPAY_SAAS_*` SaaS-billing credentials remain untouched, under their own existing mechanism (Part G); and this supersedes the Master Plan's own unverified "managed KMS" sketch for D9 with a mechanism actually confirmed available (Part H) — is formally ratified, with **NO code, schema, migration, environment variable, or frontend change accompanying this record**. See P8-D6 record. *(Earlier: 2026-09-14 — **P8-D3 RESOLVED — RATIFIED**: PrintForge's Phase 8 merchant-commerce Razorpay integration model is a **Direct Merchant-Owned Razorpay Account** — Customer → Merchant Store → Merchant's Razorpay Account → Merchant's own settlement destination, with PrintForge never receiving, holding, pooling, or disbursing funds and never acting as merchant of record by architecture (Parts A–C); `PaymentAccount` is Store-associated, with the provider account belonging to the merchant and its lifecycle kept structurally distinct from PrintForge's own SaaS subscription with that merchant (Part D); only the already-integrated Orders/Payments/Refunds/webhook APIs are required, no Route or marketplace product (Part E); Razorpay Route, linked-account/platform settlement, pooled/platform-controlled settlement, and the OAuth Technology-Partner connection UX are explicitly out of scope for Phase 8, the latter deferrable only as a separate, approval-gated future capability (Part F); merchant-of-record contract language and Razorpay ToS confirmation on merchant-credential storage are explicitly preserved as OPEN business/legal items, not silently resolved (Part G); and this record's entire footprint stays outside `src/subscriptions/`, requiring no change to `money-flow-separation.spec.ts` (Part H) — is formally ratified, with **NO code, schema, migration, environment variable, or frontend change accompanying this record**. See P8-D3 record. *(Earlier: 2026-09-13 — **P7-D5 RESOLVED — RATIFIED**: based on real Razorpay TEST/SANDBOX API verification, Razorpay Subscriptions exposes no safe provider-side way to reverse a scheduled cycle-end cancellation while keeping the subscription active (Part A) — for Razorpay, `scheduleCancellation()`'s provider call is skipped entirely (local-only `cancelAtPeriodEnd` flag, no code change to the orchestration layer, Part B); `unscheduleCancellation()` is correspondingly local-only, with no Razorpay call of any kind (Part C); the real Razorpay cancellation call happens only when `reconcilePeriod()` actually reaches the confirmed boundary (Part D); Razorpay Subscriptions webhook ingestion must use the header-derived `X-Razorpay-Signature`/`X-Razorpay-Event-Id` (the JSON payload carries neither an id nor event_id field), requiring a small, necessary `billing-webhooks.controller.ts`/`BillingWebhookIngestionService`/`BillingProvider.parseWebhook` header-threading change (Part E); this is a Razorpay-adapter-specific decision that does not alter the vendor-neutral `BillingProvider` interface or `SubscriptionService` state machine (Part F); this supersedes only the Razorpay-applicability of P7-D3 Part E's provider-side-removal assumption, without rewriting or deleting P7-D3 itself (Part G); and the whole record is grounded in direct sandbox verification, not documentation inference (Part H) — is formally ratified, with **NO code, schema, migration, environment variable, or frontend change accompanying this record**. See P7-D5 record. *(Earlier: 2026-09-13 — **P7-D4 RESOLVED — RATIFIED**: the production SaaS billing provider is **Razorpay Subscriptions**, selected for an India-first launch strategy (Part A/B); the Razorpay-specific implementation must live exclusively behind the existing `BillingProvider` interface (Part C); `SubscriptionService`, `SubscriptionOrchestrationService`, `SubscriptionEvent`, `BillingWebhookEvent`, entitlement logic, and the subscription state-machine remain vendor-neutral (Part D); SaaS Razorpay credentials/webhook secret must be distinct from the Phase 8 merchant-commerce Razorpay credentials/webhook secret (Part E); SaaS billing data flow must never write to `PaymentAttempt`/`Refund`/`WebhookEvent`, and merchant commerce must never write to `SubscriptionEvent`/`BillingWebhookEvent` — already machine-enforced by `backend/src/money-flow-separation.spec.ts` (commit `10ebe24`) (Part F); the next implementation step may add a `RazorpayBillingProvider` adapter (Part G); Razorpay SaaS webhook signature verification and provider-event mapping will live inside that adapter, normalized into the existing canonical billing event model (Part H); international expansion/provider suitability may be re-evaluated later if requirements exceed Razorpay Subscriptions' supported geography/currencies (Part I); and `SaasInvoice`, `PaymentMethod`, SaaS refunds, and other provider-specific billing features remain deferred until their exact Razorpay implementation requirements are audited (Part J) — is formally ratified as a business/architecture decision, with **NO code, schema, migration, environment variable, endpoint, or frontend change accompanying this record**. This resolves **D14** (SaaS billing provider, previously an OPEN stub item) and the Part A item P7-D1/P7-D2/P7-D3 each left explicitly OPEN. Real webhook payload/signature implementation, the adapter itself, and credential provisioning remain separate, later, explicitly-authorized implementation work. See P7-D4 record. *(Earlier: 2026-09-13 — **P7-D3 RESOLVED — RATIFIED (design/policy only)**: the remaining Phase 7 billing-architecture decisions — D7 ratified toward a two-table design (`BillingWebhookEvent` platform-scoped, payload-untrusted tenant resolution via `providerSubscriptionId`/`providerCustomerId`, unique `providerEventId`, raw-payload retention, reused `WebhookProcessor` retry/dead-letter shape, separate SaaS-billing webhook secret — Part B); grace-period duration fixed at 7 days (Part C); cancellation-retention duration fixed at 30 days, with a future `retentionEndsAt` column ratified as the mechanism but explicitly NOT added by this record (Part D); cancel-at-period-end un-scheduling semantics ratified, reusing the existing `cancelled` event type via metadata, no new enum value (Part E); a stale/out-of-order webhook policy (compare event timestamp against `Subscription.updatedAt`, discard if older) (Part F); webhooks ratified as authoritative once they exist, `reconcilePeriod()` demoted to a reconciliation safety net (Part G); a default preference for reusing existing `SubscriptionEventType` values via metadata over enum growth, any future addition still requiring both its own decision and a separate migration-safety-guard extension (Part H); `TRIALING → PAST_DUE` confirmed as the sole trial-failure route, no new edge (Part I); `PAUSED`/`EXPIRED`'s existing edges reconfirmed, not altered (Part J) — is formally ratified as design/policy, with NO code, schema, or migration change. Production billing-provider selection (Part A) and every vendor-dependent detail downstream of it (final webhook payload/signature format) are explicitly recorded as still OPEN, not decided by this record. See P7-D3 record. *(Earlier: 2026-09-12 — **P7-D2 RESOLVED — RATIFIED (design only)**: the Phase 7 Stage 2 subscription-operations decisions — a new tenant `billing:manage` permission (Part A); `ACTIVE → CANCELLED` ratified as an immediate-cancellation edge, an explicit, intentional amendment to P7-D1 Part B's transition matrix (Part B); a new `scheduleCancellation()` operation for cancel-at-period-end, with un-scheduling explicitly deferred (Part C); downgrade provider-call timing — call the provider at request time, not deferred to the period boundary (Part D); a provider-timeout/ambiguous-success reconciliation policy via `getSubscription()`, no blind retries (Part E); Stage 2 owns the callable reconciliation/rollover operation but NOT the scheduler/cron, and introduces no Redis/queues/workers (Part F); and an explicit `BillingProvider` → `FakeBillingProvider` DI-wiring approach that is NOT a production vendor selection (Part G) — is formally ratified as design, with NO code, schema, or migration change. Billing-provider selection, D7, the exact grace-period/retention durations, the final webhook payload/provider contract, the un-scheduling operation, and the remaining unratified transition edges are explicitly recorded as still OPEN, not decided by this record. See P7-D2 record. *(Earlier: 2026-09-12 — **P7-D1 RESOLVED — RATIFIED (design only)**: the Phase 7 Stage 1 subscription architecture — `Subscription.pendingPlanId`'s explicit `Plan` relation + restrictive deletion; the 7-state `SubscriptionStatus` transition matrix (EXPIRED terminal, CAS-disciplined, allowlist-governed); the `SubscriptionEvent` append-only design (`providerEventId` NOT unique); the `orders_per_month` `Usage.period` canonical stamp (ISO timestamp of provider-confirmed `currentPeriodStart`); and confirmation that `EntitlementService` needs no cache/invalidation on subscription change — is formally ratified as design, with NO code, schema, or migration change. Billing-provider selection, D7 (`WebhookEvent` split), the exact grace-period duration, and the exact cancellation-retention duration are explicitly recorded as still OPEN, not decided by this record. See P7-D1 record. *(Earlier: 2026-09-12 — **P6-D4 RESOLVED — RATIFIED**: the `storage_mb` bytes→MiB conversion policy (1 MiB = 1,048,576 bytes; `amount = ceil(bytes/1_048_576)`; zero-byte file = `amount: 0`; `Usage.count` is an integer MiB counter) is formally ratified and implemented in `uploads.service.ts`, composing with the existing `LimitEnforcementService`. Production activation of `storage_mb` enforcement remains separately gated on the Free plan (and any other live plan) carrying a real `storage_mb` `PlanLimit` row — a business-owned configuration gap, not resolved by this record. See P6-D4 record. *(Earlier: 2026-09-12 — **P6-D3 RESOLVED (Part A) / RECORDED (Part B)**: the Phase 6 W3 `UsageService` unlimited-tracking contract (`PlanLimit.limitValue: NULL` → still tracked, never skipped) is formally ratified as authoritative for W5 onward; separately, `orders_per_month`'s `BILLING_PERIOD` identity is formally recorded as an UNRESOLVED Phase 7 dependency — not invented, not ratified, explicitly held open. No code, schema, or migration change accompanies this record (Part A already implemented in W3; one additional regression test added). See P6-D3 record. *(Earlier: 2026-09-12 — **P6-D2 RESOLVED — RATIFIED**: the Phase 6 W2 `EntitlementService.resolve()` public contract — `limits: Record<LimitKey, {value, period}>` (not a bare number) and a missing `PlanLimit` row resolving to `value: 0` (never `null`/unlimited, kept distinct from an explicit `limitValue: NULL` row) — is formally ratified as authoritative for W3 onward. No code, schema, or migration change accompanies this record (already implemented in W2; one additional regression test added). See P6-D2 record. *(Earlier: 2026-09-12 — **P6-D1 RESOLVED — RATIFIED**: the Phase 6 W1 `Plan.isActive`/`sortOrder`/`isEnterpriseCustom` nullable/no-default deviation (forced by G-19 on the pre-existing `plans` table — no new exemption, no guard change) is formally recorded, together with the owner's ratification of the corrective fixes a same-day read-only verification identified (query-level `COALESCE` fix for `sortOrder` NULL-ordering; explicit non-null writes added to `prisma/seed-tenant-bootstrap.ts` and `prisma/backfill/dev-scratch-seed-phase2b-equivalent.ts`). See P6-D1 record. *(Earlier: 2026-09-10 — **P4-D2 RESOLVED — IMPLEMENTED**: the migration-safety guard now permits the self-verifying W7 contract-verb trio (`CHECK … NOT VALID` + `VALIDATE CONSTRAINT` + `SET NOT NULL`, each keyed to the same `(table, "tenantId")` pair, for the 20 approved tables only — `outbox_events` permanently excluded, `storeId`/`customerId` out of scope) and a fixed five-name legacy-unique `DROP CONSTRAINT` allowlist (`categories_slug_key`, `products_slug_key`, `coupons_code_key`, `orders_orderNumber_key`, `invoices_invoiceNumber_key`). Implemented directly in `backend/src/migration-safety.spec.ts` (unlike P4-D3, this record's code change is done, not deferred) — **112/112 tests passing**. `schema.prisma`, `prisma/migrations/`, and production are untouched; the actual W7 migration remains separate, later, explicitly-authorized work. *(Earlier: 2026-09-09 (W6 decision docket closure) — **P4-D3 RESOLVED**: migration-safety guard extension for W6 composite ownership FKs, narrow shape-plus-allowlist rule (see record — not yet implemented at that time). **P4-D4 RESOLVED — OPTION A**: add nullable `storeId` to `ProductImage`/`ProductVariant`/`CustomizationField`/`CartItem`/`CartItemCustomization`/`OrderItem`, no `tenantId` substitution (not yet implemented at that time). **W6 START GATE = `NOT READY`** at that time — guard code, `storeId` columns, preflight validation, fresh backup, and a separate W6 implementation authorization all remained outstanding. P4-D2 unaffected at that time, still `OPEN`, still W7-only. *(Same day, earlier: W3 deployed to production; W4/W5 backfill executed against production, reconciled, independently audited — see `PHASE-4-IMPLEMENTATION-REPORT.md` §14–§16. 2026-09-08: D10 RESOLVED — BUSINESS DECISION; D11 RESOLVED; P4-D1 RESOLVED — OPTION B; P4-D2 OPEN — held, W7-only; Phase 4 START GATE = READY. Earlier: 2026-09-07 — G-20 APPROVED; Phase 3 decision docket (D6, D4, P3-D2 RESOLVED; G-13 RATIFIED; P3-D1 RESOLVED); D8 RESOLVED; G-16 APPROVED — AUTHORIZED; Phase 2b EXECUTED; Phase 2 COMPLETION = `COMPLETE`; D2 RESOLVED — OPTION A. 2026-09-06 — P2-D1…P2-D13, G-11/G-12/G-15/G-17/G-18/G-19 (APPROVED), G-14 (NOT REQUIRED for Phase 2); G-18 correction to D5.)*)*)*)*)*)*)*)*)*)*)*)*)*)*)* |
| Repository | `AtharvaVavhal/PrintForge`, branch `main`, HEAD `07d98ff` (as of the P9 records; earlier: `bbe1f1e` at the P8-D6 record — uncommitted working-tree changes from this session are not yet reflected in HEAD) |
| Records held | 68 — D1, D2, D3, D4, D5, D6, D8, D10, D11, G-4, G-5, G-9, G-10, P2-D1…P2-D13, G-11…G-19, P3-D1, P3-D2, G-20, P4-D1, P4-D2, P4-D3, P4-D4, P6-D1, P6-D2, P6-D3, P6-D4, P7-D1, P7-D2, P7-D3, P7-D4, P7-D5, P8-D3, P8-D6, P9-D1…P9-D8, P9-D9, P9-D10, P9-D11, P9-S2, P9-S7, P9-S14, G-21 |
| Records `RESOLVED` / `APPROVED` | **66** (D1, D2, D3, D4, D5, D6, D8, D10, D11, G-4, G-5, G-9, G-10, G-13, P2-D1…P2-D13, G-11, G-12, G-15, G-16, G-17, G-18, G-19, P3-D1, P3-D2, G-20, P4-D1, P4-D2, P4-D3, P4-D4, P6-D1, P6-D2, P6-D4, P7-D1, P7-D2, P7-D3, P7-D4, P7-D5, P8-D3, P8-D6, P9-D1…P9-D8, P9-D9, P9-D10, P9-D11, P9-S2, P9-S7, P9-S14, G-21) — P6-D3 excluded here, see the split-status row below; P7-D1, P7-D2, and P7-D3 are each RESOLVED as *design/policy*, with production billing-provider selection explicitly left OPEN inside their own records (see each record's own Unresolved Items table); **P7-D4 resolves that specific item** (provider = Razorpay Subscriptions); **P7-D5 amends only the Razorpay-applicability of P7-D3 Part E** (local-only cancellation scheduling/unscheduling, header-derived webhook event id) without rewriting P7-D3 or P7-D4 — adapter implementation, credential provisioning, and the remaining Razorpay-specific unknowns stay separate, later, explicitly-authorized work (see P7-D4's and P7-D5's own Unresolved Items tables); **P8-D3** ratifies the Phase 8 merchant-Razorpay integration model (direct merchant-owned account) and **P8-D6** ratifies the Phase 8 credential-storage mechanism and resolves **D9** — both architecture decisions only, no implementation authorized (see each record's own Unresolved Items table) |
| Records `NOT REQUIRED` (for their phase) | **1** (G-14 — see record; G-13 was ratified 2026-09-07) |
| Records `OPEN` / `DEFERRED` (with a full record) | **0** whole records; **1 split-status record** — **P6-D3 Part B** (`orders_per_month` billing-period identity) is formally recorded as an unresolved Phase 7 dependency; **P6-D3 Part A** (unlimited-tracking contract) is itself fully `RESOLVED — RATIFIED`. (P4-D2 resolved 2026-09-10 — none remain from Phase 4.) |
| Records `OPEN` (stub only, no full record yet) | **D7, D12, D13, D15** remain OPEN (bottom table). **D14** (SaaS billing provider) is resolved — moved out of that table into the full **P7-D4** record above. **D9** (merchant payment-credential storage) is resolved — moved out of that table into the full **P8-D6** record above. |
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
| **Consequences** | Planning for **Phase 2b** (identity backfill) and **Phase 4** (data-ownership migration) proceeded on the assumption of a real, live production dataset — the anomaly classes named in the Phase 2b contract (duplicate emails, admin-who-also-shopped, inactive users, partial addresses, etc.) were treated as live possibilities requiring owner review, not hypotheticals (see the recorded dry-run/anomaly results in `PHASE-2B-IMPLEMENTATION-REPORT.md`). **This decision, by itself, authorized no production access, no backup, no restore, and no backfill execution** — those required **D8** (RESOLVED 2026-09-07) and **G-16** (APPROVED — AUTHORIZED 2026-09-07), both since satisfied; Phase 2b has since **executed and reconciled**. No production credentials, production database, or production rows were accessed, read, or modified in the course of recording this decision itself; the answer was supplied directly by the project owner. |
| **Affected phase(s)** | **Phase 2b** (backfill planning and execution — complete); **Phase 4** (data-ownership migration planning; execution remains blocked on Phase 4's own separate, still-open gates: D4, D10, D11, D12). |
| **Reversibility** | This is a factual record of the deployed environment's data status, not a design choice — not reversible in the ordinary sense. It would only be re-opened if the deployed database were replaced or its contents materially changed. |
| **Dependency (still open)** | **D8** (verified restore artifact) is **RESOLVED** as of 2026-09-07 (see D8 record below). **G-16** (Phase 2b backfill authorization) remains **OPEN — PENDING**, independently of this record. **D2 = A does not resolve G-16, and does not itself authorize Phase 2b execution.** |
| **Explicit approval wording (recorded)** | `"D2: A — The currently deployed Render database contains real merchant/customer production data."` (project owner, 2026-09-07). |
| **Not to be implemented until this record is `RESOLVED`** | ~~Any Phase 2b or Phase 4 planning that assumes a specific production-data shape.~~ **CLEARED 2026-09-07.** Phase 2b **execution** (backfill) was subsequently cleared the same day (D8 + G-16 both satisfied) and has executed — see G-16 record and `PHASE-2B-IMPLEMENTATION-REPORT.md`. Phase 4 **execution** remains gated on Phase 4's own separate gates (D4, D10, D11, D12) and is **not** cleared by this record. |

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
| **Dependency (still open)** | D2 and D8 are now **RESOLVED**. Tenant #1's name/slug were supplied by the business on 2026-09-07 (see Decision Log). **Production creation of the Tenant #1 / primary Store rows is executed under this explicit 2026-09-07 owner authorization**, ahead of the general Phase 4 data-ownership migration — the owner was informed that `backend/prisma/seed-tenant-bootstrap.ts`'s own guard comment places this step in Phase 4, and explicitly chose to proceed now rather than defer. This does **not** pull forward any other Phase 4 work (no `customerId` columns, no FK re-pointing, no `User.role` drop, no isolation/tax/numbering decisions — D4/D10/D11/D12 remain OPEN and ungated by this record). |
| **Explicit approval wording (recorded)** | `"D3: A — The existing deployment/store becomes Tenant #1."` (project owner, 2026-09-06). Tenant naming: `"Tenant #1: Name: PrintForge, Slug: printforge. Primary Store: Name: PrintForge Store, Slug: printforge."` (project owner, 2026-09-07). |
| **Not to be implemented until this record is `RESOLVED`** | ~~The Phase 1 bootstrap seed's framing; any Phase 4 backfill; any assignment of a live `role=ADMIN` user to an `OWNER` membership.~~ **The seed framing is decided (Phase 1, dev/test only).** Phase 2b live `role=ADMIN` → `OWNER` assignment and the Tenant #1/Store production creation are **CLEARED 2026-09-07** (D2 + D8 + G-16 satisfied; naming supplied). The broader Phase 4 backfill (existing catalog/orders/invoices/payments/settings ownership migration) remains gated on Phase 4's own separate gates. |

### D3 — Decision Log

| Date | Owner | Choice (A / B) | Approval wording (verbatim) | Reference |
|---|---|---|---|---|
| 2026-09-06 | Business owner (project owner) | **A** — existing deployment becomes Tenant #1 | `"D3: A"` → *"The existing deployment/store becomes Tenant #1."* | Phase 1 spec §B.3; Master Plan §4.4-D3. Tenant display name / slug: **to be supplied by the business before the Phase 4 backfill** (must not be `default_tenant`). |
| 2026-09-06 | (cross-reference) | **P2-D7 re-scope preserves D3** | Owner note on P2-D7: *"D3's 'no implicit privileges' rule remains intact. Do NOT use Tenant #1 as an implicit customer-auth context."* | P2-D7 record; `PHASE-2-DECISION-CLOSURE.md §6.4` |
| 2026-09-07 | Project Owner / Ops Owner (Atharva) | **Tenant #1 naming supplied; production creation authorized now** | `"Tenant #1: Name: PrintForge, Slug: printforge. Primary Store for Tenant #1: Name: PrintForge Store, Slug: printforge."` — explicit written decision accompanying the G-16 authorization. | This entry; G-16 record; `backend/prisma/seed-tenant-bootstrap.ts` (matched idempotent pattern: Free Plan + Tenant + primary Store + Subscription) |

---

## D4 — Tenant isolation mechanism

| Field | Content |
|---|---|
| **ID** | D4 |
| **Decision (question)** | Should tenant isolation be enforced by (i) application-layer scoping only (a Prisma client extension injecting `where: { tenantId }`), (ii) Postgres Row-Level Security only, or (iii) both, app-layer primary and RLS as defense-in-depth? |
| **Owner** | Architecture owner + Ops owner |
| **Date** | 2026-09-07 |
| **Status** | **RESOLVED — OPTION (iii), BOTH, app-layer primary** |
| **Decision (approved option)** | **BOTH — application-layer scoping is the primary enforcement mechanism; PostgreSQL Row-Level Security is enabled as defense-in-depth** on the Phase 1/2a tenancy tables (`tenants`, `stores`, `store_domains`, `tenant_memberships`, `subscriptions`, `customers`), per Master Plan §9's original design intent, **now factually confirmed viable by P3-D2** (see that record) rather than merely assumed. |
| **Rationale** | Per `PHASE-3-DECISION-DOCKET.md` item 2's recommendation, adopted following the owner's explicit instruction not to finalize D4 until P3-D2 was factually answered. **P3-D2's findings support RLS**: the production application role (`printforge_db_user`) is confirmed non-superuser and non-`BYPASSRLS` (RLS policies would actually apply to it, not be silently bypassed), and an empirical connection-topology probe found no evidence of transaction-mode connection pooling (the same backend PID persisted across multiple transactions within one client connection; a `SET LOCAL` value was correctly scoped to its own transaction and did not leak to a second, independent connection) — the two preconditions Master Plan §9 KEY RISKS/INFRASTRUCTURE IMPACT named as required before RLS could be trusted. With both preconditions holding, defense-in-depth (app-layer bug caught by RLS, RLS misconfiguration caught by app-layer) is preferred over either single mechanism alone, matching the general principle for the highest-consequence bug class in a multi-tenant system (cross-tenant data leak). |
| **Source document / section** | `PHASE-3-DECISION-DOCKET.md` item 2; P3-D2 record (this file, immediately following); `PHASE-3-START-GATE-AND-IMPLEMENTATION-SPEC.md` §2, §12–§13; Master Plan §9 DATABASE/DATA IMPACT, INFRASTRUCTURE IMPACT, KEY RISKS. |
| **Consequences** | Phase 3 ships one additive migration enabling RLS + policies on the six tenancy tables named above (enable-only, no data/enforcement change to business tables — RLS on business/commerce tables waits for Phase 4's `tenantId` backfill, per the Phase 3 spec's exclusion list). The tenant-scoped Prisma client (app-layer) remains the primary, always-on enforcement point that every domain service uses; RLS is a backstop that fires only if the app-layer path is somehow bypassed. |
| **Affected phase(s)** | **Phase 3 (defining)** — tenant-scoped client design and the RLS-enabling migration; **Phase 4** — RLS enforcement extends to business/commerce tables once `tenantId` is backfilled onto them. |
| **Reversibility** | RLS is reversible via `DISABLE ROW LEVEL SECURITY` / `DROP POLICY` (additive-safe, no data loss). App-layer scoping is ordinary application code, reversible like any other code change. |
| **Explicit approval wording (recorded)** | Per instruction: *"Do NOT finalize D4 until P3-D2 has been factually answered… If the facts support RLS, resolve D4 as BOTH app-layer + RLS, with app-layer primary."* (project owner, 2026-09-07). P3-D2's facts (below) support RLS; D4 is resolved accordingly under that standing instruction — no separate, additional owner utterance chose "(iii)" by name beyond this conditional directive. |
| **Not to be implemented until this record is `RESOLVED`** | ~~Any RLS-enabling migration; any tenant-scoped Prisma client design assuming a specific isolation mechanism.~~ **CLEARED 2026-09-07.** |

### D4 — Decision Log

| Date | Owner | Choice | Approval wording (verbatim) | Reference |
|---|---|---|---|---|
| 2026-09-07 | Architecture + Ops owner (project owner, Atharva) | **RESOLVED — BOTH, app-layer primary** (conditional on P3-D2, which resolved favorably) | `"Do NOT finalize D4 until P3-D2 has been factually answered… If the facts support RLS, resolve D4 as BOTH app-layer + RLS, with app-layer primary."` | `PHASE-3-DECISION-DOCKET.md` item 2; P3-D2 record |

---

## P3-D2 — RLS DB-role and connection-pooler compatibility (fact-finding)

| Field | Content |
|---|---|
| **ID** | P3-D2 |
| **Owner** | Ops owner |
| **Date** | 2026-09-07 |
| **Status** | **RESOLVED — FACTS FOUND, FAVORABLE TO RLS** |
| **Decision (question)** | Is the production application database role a superuser or `BYPASSRLS`-privileged (which would make RLS policies silently inert for it), and does the actual connection path support `SET LOCAL` correctly (i.e., no transaction-mode connection pooler reassigning backend connections mid-session)? This is a fact-finding item, not a preference. |
| **Decision (recorded)** | **Findings, from safe, non-mutating, read-only inspection of production (no configuration changed, no migration run, no RLS enabled, no data written):**<br>1. `SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user;` → **`rolsuper = false`, `rolbypassrls = false`** for `printforge_db_user`. The application role is **not** exempt from RLS — policies would actually be enforced against it.<br>2. Empirical pooling-mode probe: `pg_backend_pid()` returned the **identical** backend PID at connect time, inside a first transaction, immediately after `COMMIT`, and inside a second transaction within the **same** client (psql) connection — the signature of a direct connection or session-mode pooling, **not** transaction-mode pooling (which would tend to reassign a different backend per transaction).<br>3. `SET LOCAL app.probe = 'marker-abc'` was visible inside its own transaction and **correctly reverted to empty immediately after `COMMIT`** in the same session (proper transaction-scoping), and was **not visible at all** in a second, independent connection opened concurrently (`pid_second_connection` was a different PID, `setting_seen = (null)`) — no cross-connection state bleed observed.<br>4. Connection identity confirmed unchanged from prior D8 checks: `printforge_db` @ `10.28.26.163:5432` (Render-managed PostgreSQL). |
| **Rationale** | These are exactly the two preconditions Master Plan §9 INFRASTRUCTURE IMPACT flagged as "REQUIRES DECISION-minor / ops" before RLS could be trusted as part of the isolation mechanism. Both resolved favorably from direct, safe inspection rather than being assumed. |
| **Source document / section** | `PHASE-3-DECISION-DOCKET.md` item 5; Master Plan §9 INFRASTRUCTURE IMPACT, KEY RISKS ("RLS + pooler incompatibility"); D4 record (this file, immediately preceding), which this record's findings directly feed. |
| **Consequences** | D4 is resolved to **BOTH** (app-layer primary + RLS) on the strength of these findings — see D4 record. **Caveat, stated for completeness, not as an unresolved blocker:** this is a point-in-time, single-connection empirical probe via `psql`, not a load test of Prisma's actual production connection-pool behavior at scale, and it does not consult Render's platform-level configuration directly (e.g., whether Render's optional "Connection Pooling" add-on is explicitly enabled for this database). No evidence of transaction-mode pooling was found by the safe tests available; if Render's platform configuration is later found to differ from what this probe observed, D4 should be revisited. |
| **Affected phase(s)** | **Phase 3** (gates D4, and therefore the RLS-enabling migration). |
| **Reversibility** | N/A — factual record of an inspection's findings, not a design choice. Would only be re-opened if the production connection topology changes (e.g., a pooler is added later) or if further platform-level confirmation contradicts these findings. |
| **Explicit approval wording (recorded)** | N/A (fact-finding item; no owner preference was recorded, per instruction — "Determine, using only safe non-mutating inspection… If production inspection is not authorized or cannot be performed safely, mark P3-D2 BLOCKED rather than guessing." Inspection was authorized and performed safely; findings are recorded above rather than a guess). |

### P3-D2 — Decision Log

| Date | Owner | Choice | Approval wording (verbatim) | Reference |
|---|---|---|---|---|
| 2026-09-07 | Ops owner (project owner, Atharva) | **RESOLVED — facts found, favorable to RLS** | `"Determine, using only safe non-mutating inspection, whether the production database environment is compatible with the proposed RLS design… If production inspection is not authorized or cannot be performed safely, mark P3-D2 BLOCKED rather than guessing."` | `PHASE-3-DECISION-DOCKET.md` item 5; D4 record |

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
| **Status** | **RESOLVED — BOTH mechanisms, header cross-validated** (2026-09-07) |
| **Decision (approved option)** | **BOTH tenant-resolution mechanisms are used**: (1) host/subdomain/store-domain resolution, and (2) an explicit `X-Active-Tenant` request header. The header, when present, **must be cross-validated against the authenticated `User`'s `ACTIVE` `TenantMembership` rows** — a value that does not match an existing membership is rejected (403), never silently accepted or falled back from. **No client-supplied tenant identifier (header or otherwise) may ever be trusted by itself** — the derived value is always checked server-side against the caller's actual memberships before being used as `TenantContext.tenantId`. |
| **Rationale** | The owner's explicit 2026-09-07 decision, matching the recommendation in `PHASE-3-DECISION-DOCKET.md` item 1: host/subdomain resolution is the long-run, spoof-resistant mechanism for the storefront path and for a future per-tenant admin-subdomain topology, but the current merchant console has no per-tenant host routing built yet, so a `User` holding more than one `TenantMembership` needs an explicit selector *today*. Using both, with the header always cross-checked, gets the immediate multi-membership capability without weakening the invariant that context is server-derived, not client-asserted (Master Plan §9 SECURITY IMPACT). |
| **Source document / section** | `PHASE-3-DECISION-DOCKET.md` item 1; `PHASE-3-START-GATE-AND-IMPLEMENTATION-SPEC.md` §4, §9; Master Plan §9 BACKEND IMPACT ("`TenantContext` resolution"), KEY RISKS ("Context derivation spoof"); original D6 question wording (this record, "host / subdomain / an explicit `X-Active-Tenant` header"). |
| **Consequences** | Phase 3's `TenantContext` merchant-path resolver: (a) attempts host/subdomain resolution first (`StoreDomain`/subdomain lookup, once such routing exists for the admin console); (b) reads `X-Active-Tenant` if present and cross-validates it against `AuthenticatedUser.memberships` — mismatch → 403; (c) with no header and no host-resolvable tenant, falls back to **no implicit default** (a `User` with exactly one membership may reasonably auto-select it as a convenience, but this is an implementation detail for the Phase 3 spec/PR, not a security relaxation — a `User` with zero or multiple memberships and no explicit selector gets no tenant context, not a guess). **Final, full domain-based (Host → `StoreDomain` → `Store` → `Tenant`) resolution for the admin/merchant console specifically is completed in Phase 9** (storefront domain resolution) — Phase 3 ships the mechanism and the header path now; the merchant-console host-routing half matures as admin subdomains are built. |
| **Affected phase(s)** | **Phase 3 (defining — implements both paths)**; **Phase 9** (full Domain → Store → Tenant runtime resolution, of which the merchant-console host half is completed there). |
| **Reversibility** | The header-based path can be deprecated later without a data migration once host-based routing fully covers the merchant console — purely a code/config change, no schema impact. |
| **Explicit approval wording (recorded)** | `"Use BOTH tenant-resolution mechanisms: host/subdomain/store-domain resolution, and an explicit X-Active-Tenant header. The header must be cross-validated against the authenticated user's active tenant memberships. No client-supplied tenant identifier may be trusted by itself."` (project owner, 2026-09-07). |
| **Alternatives rejected** | **Host/subdomain only** — rejected because the current admin console has no per-tenant host routing built, which would leave any `User` with more than one `TenantMembership` unable to select a non-default tenant until Phase 5's platform/console work lands; unworkable as a sole mechanism today. **Header only** — rejected because it gives up the more spoof-resistant, DNS-anchored host signal for tenants that eventually get dedicated admin subdomains, deferring rather than avoiding a second design pass. |
| **Security implications** | The header is explicitly a **hint only** — every resolution path ends in a server-side cross-check against the caller's actual `ACTIVE` memberships; a mismatch is a 403, verified by a dedicated e2e negative test (`PHASE-3-START-GATE-AND-IMPLEMENTATION-SPEC.md` §14). This directly closes the spoof risk Master Plan §9 KEY RISKS names ("attacker sets `X-Active-Tenant` to another tenant"). |
| **Backward-compatibility implications** | No token or session shape changes — Phase 2a already loads `memberships` onto every request's `AuthenticatedUser`; this decision only defines how one of those memberships becomes "active" per request. No re-login, no `tokenVersion` bump, no migration. |
| **Not to be implemented until this record is `RESOLVED`** | ~~Any tenant-context middleware / interceptor; any active-tenant resolution or `X-Active-Tenant` handling; any tenant-scoped Prisma client; any `PermissionsGuard` wired to a route; any `@Roles → @RequirePermission` swap.~~ **CLEARED 2026-09-07 — implementation may proceed once the Phase 3 start gate (G-20-equivalent spec approval) is otherwise satisfied; no code has been written under this record.** |

### D6 — Decision Log

| Date | Owner | Choice | Approval wording (verbatim) | Reference |
|---|---|---|---|---|
| 2026-09-06 | Architecture owner + product (project owner) | **DEFER WITH APPROVED RE-SCOPE** | `"D6: DEFER WITH APPROVED RE-SCOPE"`; `"G-17: APPROVE — Phase 2 is explicitly re-scoped so D6-dependent tenant context and customer-auth activation are deferred to Phase 3/9/12 as documented."` | `PHASE-2-DECISION-CLOSURE.md §11`; Master Plan §9; P2-D9 / G-17 records |
| 2026-09-07 | Architecture owner + product (project owner, Atharva) | **RESOLVED — BOTH, header cross-validated** | `"Use BOTH tenant-resolution mechanisms: host/subdomain/store-domain resolution, and an explicit X-Active-Tenant header. The header must be cross-validated against the authenticated user's active tenant memberships. No client-supplied tenant identifier may be trusted by itself."` | `PHASE-3-DECISION-DOCKET.md` item 1 |

---

## D8 — Verified production backup/restore drill

| Field | Content |
|---|---|
| **ID** | D8 |
| **Decision (question)** | Has a verified, evidenced production backup-and-restore cycle been performed — a `pg_dump` of production, checksummed, restored into a disposable scratch instance, and validated against every `D8-RESTORE-DRILL-RUNBOOK.md §6` check — proving the deployed schema is recoverable and matches this repository's committed migrations? |
| **Owner** | Ops owner (execution-time) |
| **Date** | 2026-09-07 |
| **Status** | **RESOLVED** |
| **Decision (approved option)** | **RESOLVED — all eight `D8-RESTORE-DRILL-RUNBOOK.md §10` conditions met.** A fresh, post-Phase-2a-migration production backup (`printforge_prod_20260907T171225Z.dump`, SHA-256 `dfcd2399f0136ad0ba1d75341135557abca856d6b720eaa6fe9efb73fd91cb48`) was restored into the disposable local scratch instance (`d8_scratch`) and passed every `§6` load-verification check (database-, schema-, commerce-, and SaaS-foundation-level) and every `§7` reconciliation row (production vs. scratch: 33/33 tables, 11/11 migrations, matching latest migration name, `users` 23/23, `orders` 40/40, `customers` 0/0, `tenant_memberships` 0/0 — the last two correctly zero because Phase 2b has not run). |
| **Rationale** | D8 exists to prove production is recoverable and that a restored copy matches this repo's committed schema before any identity backfill (Phase 2b) is authorized — an analogue of G-9 at execution time, but requiring a full evidenced restore-and-verify cycle rather than a routine snapshot. An earlier attempt (Entry 3, 2026-09-07) correctly **stopped** at the schema-level check because production was then still on the pre-Phase-2a 9-migration schema (missing `20260905191258_add_saas_foundation` and `20260906171709_add_customer_and_platform_role`); that gap was closed by a separately authorized production migration (distinct authorization from D8's own §1 record), after which this fresh drill (Entry 4) was run and passed in full. |
| **Source document / section** | `docs/ops/D8-RESTORE-DRILL-RUNBOOK.md` (full runbook; Entry 3 — pre-migration STOP; Entry 4 — post-migration full pass, evidence ID `D8-20260907-02`); `docs/ops/D8-OWNER-OPS-HANDOFF.md` (§1 authorization record, 2026-09-07; "Current Gate"); D2 record (this file). |
| **Consequences** | D8 no longer blocks **G-16** or **Phase 4**'s own D8 precondition. At the time of this drill, **G-16 remained a separate, independent authorization gate** — D8's resolution did not itself authorize the Phase 2b backfill; per `D8-OWNER-OPS-HANDOFF.md` "Critical boundary," the D8 authorization record explicitly does not extend to Phase 2b, `TenantMembership`/`Customer` creation, or any production data modification. No production data was modified in the course of the D8 drill itself — it is read-only against production (backup only) and restore-only against disposable scratch. **G-16 was subsequently authorized separately on 2026-09-07 (see the G-16 record) and Phase 2b has since executed** — see `PHASE-2B-IMPLEMENTATION-REPORT.md`. |
| **Affected phase(s)** | **Phase 2b** (D8 precondition satisfied; executed — see G-16 record); **Phase 4** (shares this D8 precondition; its own additional gates are unaffected and still apply). |
| **Reversibility** | This is a factual record of a completed, evidenced verification event, not a design choice — not reversible in the ordinary sense. A future schema change would require its own fresh D8 drill before being relied upon for Phase 4 execution (the artifact is a point-in-time proof, not a standing guarantee). |
| **Dependency (still open)** | None remaining from this record. **G-16** was the one dependency this record left open; it has since been **APPROVED — AUTHORIZED** (2026-09-07, see the G-16 record), and Phase 2b has executed and reconciled. |
| **Explicit approval wording (recorded)** | `"I, Atharva — Project Owner / Ops Owner, have reviewed D8 evidence package D8-20260907-02 (Entry 4) and explicitly confirm the result. Owner confirmation for §10 condition 8: MET."` (project owner, 2026-09-07). |
| **Not to be implemented until this record is `RESOLVED`** | ~~The Phase 2b identity backfill; any restore of production data outside a disposable scratch target.~~ **D8 precondition CLEARED 2026-09-07; G-16 subsequently authorized the same day; Phase 2b has executed** (see G-16 record, `PHASE-2B-IMPLEMENTATION-REPORT.md`). |

### D8 — Decision Log

| Date | Owner | Choice | Approval wording (verbatim) | Reference |
|---|---|---|---|---|
| 2026-09-07 | Ops owner (project owner) | **RESOLVED — all §10 conditions met** | `"I, Atharva — Project Owner / Ops Owner, have reviewed D8 evidence package D8-20260907-02 (Entry 4) and explicitly confirm the result. Owner confirmation for §10 condition 8: MET."` | `D8-RESTORE-DRILL-RUNBOOK.md` Entry 4, evidence ID `D8-20260907-02`; `D8-OWNER-OPS-HANDOFF.md` §1 authorization record |

---

## D10 — Per-tenant order/invoice numbering and statutory format

| Field | Content |
|---|---|
| **ID** | D10 |
| **Owner** | Business/product owner (this record — an explicit business decision, **not** legal/tax advice or statutory confirmation) |
| **Date** | 2026-09-08 (technical mechanism); **2026-09-08 (later same day) — format decided** |
| **Status** | **RESOLVED — BUSINESS DECISION.** Both the counter mechanism and the numbering format are now decided. This status is deliberately labeled "business decision," not a plain unqualified `RESOLVED`, to preserve the owner's explicit instruction that this is not to be represented as legal/tax advice or statutory confirmation — see "Residual risk" below. |
| **Decision (question)** | What is the approved per-tenant order/invoice numbering and statutory-format strategy for Phase 4? |
| **Decision (approved)** | **Sequential, tenant-scoped order and invoice numbering.** New numbers are claimed from a `TenantCounter` — one atomically-incremented counter per `(tenantId, key)`, replacing today's two single global rows in `app_settings` (`order_number_counter`, `invoice_number_counter`), each initialized from `MAX(existing number) + 1` (a direct carry-forward — one tenant exists today, zero ambiguity), claimed with the identical atomic `INSERT … ON CONFLICT DO UPDATE … RETURNING` pattern already proven in `orders.service.ts`/`invoice-number.service.ts`. **No financial-year reset** — the counter is a flat, ever-incrementing per-tenant sequence, not a `(tenantId, fiscalYear)`-scoped one. **Existing order/invoice numbers are never rewritten.** |
| **Legal/business decision vs. technical implementation consequence — kept explicitly separate, per the owner's instruction** | **Business decision (this record, non-legal):** sequential numbering, no fiscal-year reset, is the format PrintForge will use. **Technical implementation consequence (already-approved mechanism, unchanged by this record):** the `TenantCounter` structure, `MAX(existing)+1` seeding, and the existing atomic claim pattern are how that business decision is realized in the schema/backend — these were already agreed before this specific format question was answered, and this record does not reopen or re-derive them. |
| **Explicit non-legal-advice framing (owner's own words, preserved verbatim, not softened or generalized)** | *"This is a business/product decision. Do not represent it as legal/tax advice or statutory confirmation. If legal review later requires a different statutory format, handle that through the architecture-change process before production use."* |
| **Residual risk (disclosed, not hidden)** | This decision is **not** a statutory/tax-compliance determination — it is the business proceeding on a sequential-numbering format by its own choice, with an explicit, owner-acknowledged possibility that a later legal review could require a different format (e.g. a jurisdiction-mandated financial-year series) before production use. That contingency is **not** treated as blocking Phase 4 today — it is explicitly routed to "the architecture-change process," i.e. a future, separate, formal reopening of this record if and when a legal review actually requires it — not an open item Phase 4 must wait on now. |
| **Rationale** | The owner supplied a complete, unconditional format decision (sequential, tenant-scoped, no FY reset) — this is no longer a case of "the format is genuinely still required and not yet decided" (the prior 2026-09-08 entry's framing); it is a decided business choice, correctly and explicitly not dressed up as a legal guarantee. |
| **Source document / section** | `PHASE-4-DECISION-DOCKET.md` §1; `PHASE-4-START-GATE-AND-IMPLEMENTATION-SPEC.md` §5, §11 (wave W4); Master Plan §10, §25 (W4); `app-setting.constants.ts` (`invoice.numberPrefix` definition — still marked `pendingClientInput: true` in code; the *prefix string itself*, e.g. `INV-`, is a separate, smaller, already-admin-configurable detail this record does not additionally resolve). |
| **Consequences** | Wave W4's numbering-migration sub-task is **no longer blocked** — the `TenantCounter` structure, seeding, and claim mechanism can be implemented against this exact, decided format. No counter-shape rework is anticipated (no fiscal-year scoping was chosen), removing the specific "may itself need to be revisited" caveat the prior entry carried. |
| **Affected phase(s)** | **Phase 4** (wave W4 — fully unblocked on numbering). |
| **Reversibility** | Reversible only via the owner's own named process — "the architecture-change process" — if a future legal review requires a different format; not casually revisable, since by the time that would matter, live numbers may already have been issued under this format (and per this same record, those are never rewritten). |
| **Explicit approval wording (recorded)** | `"For PrintForge, use sequential tenant-scoped order and invoice numbering. Existing numbers are never rewritten. New numbers use TenantCounter with an atomic per-tenant counter. No financial-year reset is required by the current business decision. This is a business/product decision. Do not represent it as legal/tax advice or statutory confirmation. If legal review later requires a different statutory format, handle that through the architecture-change process before production use."` (project owner, 2026-09-08). |

### D10 — Decision Log

| Date | Owner | Choice | Approval wording (verbatim) | Reference |
|---|---|---|---|---|
| 2026-09-08 | Ops/architecture owner (project owner, Atharva) | **TECHNICALLY RESOLVED / LEGAL FORMAT PENDING** *(superseded same day — see next row)* | `"Keep the technical recommendation… Record D10 as: TECHNICALLY RESOLVED / LEGAL FORMAT PENDING… Do not claim Phase 4 is fully unblocked if the legal format is genuinely still required for W4."` | `PHASE-4-DECISION-DOCKET.md` §1 |
| 2026-09-08 (later same day) | Business/product owner (project owner, Atharva) | **RESOLVED — BUSINESS DECISION: sequential, tenant-scoped, no FY reset** | `"For PrintForge, use sequential tenant-scoped order and invoice numbering… This is a business/product decision. Do not represent it as legal/tax advice or statutory confirmation. If legal review later requires a different statutory format, handle that through the architecture-change process before production use."` | This entry supersedes the row above |

---

## D11 — `AppSetting` per-key ownership classification

| Field | Content |
|---|---|
| **ID** | D11 |
| **Owner** | Architecture owner |
| **Date** | 2026-09-08 |
| **Status** | **RESOLVED** |
| **Decision (question)** | How should the existing `AppSetting` records be classified — `PLATFORM`, `TENANT`, `STORE`, or `GLOBAL/SYSTEM`? |
| **Decision (approved classification)** | Every current key, found by reading the actual write paths in the codebase (`app-setting.constants.ts`, `orders.service.ts`, `invoice-number.service.ts`) — none invented: <br>**STORE** — `storeName`, `storeAdminName`, `shippingFeeFlat`, `announcement_text`, `hero_slides`, `banners`, `showcase_categories` (storefront content / per-storefront commercial policy). <br>**TENANT** — `tax.enabled`, `tax.pricingMode`, `tax.ratePercent`, `invoice.numberPrefix`, `invoice.sellerLegalName`, `invoice.sellerAddress`, `invoice.sellerGstin`, `invoice.sellerState`, `order_number_counter`, `invoice_number_counter` (legal-entity / tax / numbering identity — one GSTIN and one numbering series per tenant, not per store). <br>**No current key is `PLATFORM` or `GLOBAL/SYSTEM`** — no cross-tenant platform-wide configuration exists yet. |
| **Rationale** | Owner's explicit approval of the docket's classification (`PHASE-4-DECISION-DOCKET.md` §2), reasoned key-by-key: content/commercial-policy settings vary naturally per storefront; legal/tax/numbering facts are properties of the registered business entity (the tenant), not of any one of its storefronts. |
| **Source document / section** | `PHASE-4-DECISION-DOCKET.md` §2; `PHASE-4-START-GATE-AND-IMPLEMENTATION-SPEC.md` §6; `backend/src/app-setting/app-setting.constants.ts` (source of the exact key list). |
| **Consequences** | Confirms Phase 4's settings-split work is genuinely two-way: both a `TenantSetting` structure (for the 10 `TENANT`-classified keys, 2 of which — the counters — specifically become `TenantCounter` rows, not `TenantSetting`) and a `StoreSetting` structure (for the 7 `STORE`-classified keys) are required — neither can be skipped. Every key's existing value (where a row exists in production today) must be copied forward to Tenant #1 / its primary Store — the old `app_settings` rows are not deleted in this wave (expand→contract discipline; dropped later, if ever, not as part of Phase 4's own migration). **No data has been migrated by this record** — it authorizes the classification, not the migration itself. |
| **Affected phase(s)** | **Phase 4** (wave W4). |
| **Reversibility** | A classification is a design record, not a schema change — revisable via a further recorded correction (same discipline as G-18's D5 correction) before W4 actually executes; harder to reverse once rows have been physically migrated. |
| **Explicit approval wording (recorded)** | `"Resolve according to the docket's classification… tenant-level legal/tax/numbering identity moves to Tenant-owned configuration; storefront/content/commercial-policy settings are Store-owned; counters become TenantCounter; existing Tenant #1 / primary Store values must be preserved. D11 STATUS: RESOLVED."` (project owner, 2026-09-08). |

### D11 — Decision Log

| Date | Owner | Choice | Approval wording (verbatim) | Reference |
|---|---|---|---|---|
| 2026-09-08 | Architecture owner (project owner, Atharva) | **RESOLVED** | `"Resolve according to the docket's classification… D11 STATUS: RESOLVED."` | `PHASE-4-DECISION-DOCKET.md` §2 |

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
| 2026-09-25 | Atharva — Project & Architecture Owner / Ops | **EXECUTED for Phase 9 W8** — pre-migration snapshot taken and verified: `printforge_prod_preP9W8_20260925T125908Z.dump`, 238,616 bytes, SHA256 `e8d5a05b…ba4e0f56`, PostgreSQL 18.6, `pg_restore --list` exit 0 with 389 TOC entries, `platform_config` **absent** (proving it predates the W1 migration), deep health 200. **No value or credential recorded.** | `"G-9 is complete."` (Phase 9 §17.2 step 1) | Spec §17.2a `E-G9-1`; `DEPLOYMENT.md` §3 |

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
| **Consequences** | The Phase 2a scope, models, enums, migration boundary, backfill boundary, acceptance criteria (`AC-P2-01…27`), and phase deferrals are contractual. The Phase 2a START GATE is **READY**; Phase 2b (originally gated on D2/D8/G-16) has since executed and reconciled — see `PHASE-2B-IMPLEMENTATION-REPORT.md`. |
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
| **Status** | **APPROVED — RATIFIED** (2026-09-07) |
| **Decision (question)** | Ratify the permission catalogue (strings + `TenantRole → Set<Permission>` map) for Phase 3? |
| **Decision (approved option)** | **RATIFIED**, provided (and confirmed) internally consistent with the existing `TenantRole` enum (`OWNER`, `ADMIN`, `STAFF`, `VIEWER` — frozen, Phase 2a) and with the current backend's actual protected surface (`admin.controller.ts`, `products.controller.ts`, `products/categories/categories.controller.ts` — read directly from the tree, not assumed). Representation remains the typed constant frozen by P2-D8; this record ratifies the *contents*. <br><br>**Permission catalogue (13 strings):** `dashboard:read`, `orders:read`, `orders:transition`, `customers:read`, `reviews:moderate`, `coupons:read`, `coupons:write`, `settings:read`, `settings:write`, `products:read`, `products:write`, `members:manage` *(reserved — no current route uses it; anticipates a future team-management surface)*, `payment-account:manage` *(reserved — no current route uses it; anticipates Phase 8)`.<br><br>**Role → Permission map:**<br>• `OWNER` — all 13 permissions.<br>• `ADMIN` — all except `members:manage` and `payment-account:manage` (11 permissions) — team composition and payment-account linkage are reserved to `OWNER` as the two most sensitive, ownership-adjacent actions.<br>• `STAFF` — `dashboard:read`, `orders:read`, `orders:transition`, `customers:read`, `reviews:moderate`, `coupons:read`, `settings:read`, `products:read`, `products:write` (9 permissions) — every read, plus the two operational-write actions (fulfilling orders, managing the catalogue); excludes `coupons:write` and `settings:write` (direct revenue/configuration impact) and both `OWNER`-reserved permissions.<br>• `VIEWER` — every `:read` permission and no other (`dashboard:read`, `orders:read`, `customers:read`, `coupons:read`, `settings:read`, `products:read` — 6 permissions) — strictly read-only.<br>• `SUPER_ADMIN` (`PlatformRole`, not `TenantRole`) — **deliberately absent from this map.** A platform super-admin has no entry and therefore no tenant permission through `PermissionsGuard` under any circumstance, preserving frozen invariant 4 (`PlatformGuard` and `PermissionsGuard` stay fully independent; a `SUPER_ADMIN` with no `TenantMembership` passes the former and fails the latter). |
| **Concrete swap mapping (informative — binds §8 of the Phase 3 spec, not a separate decision)** | `admin.controller.ts` (currently one controller-level `@Roles(Role.ADMIN)`, becomes 14 per-method `@RequirePermission(...)`): `GET orders` / `GET orders/:id` / `GET orders/:id/invoice` → `orders:read`; `PATCH orders/:id/status` → `orders:transition`; `GET dashboard` → `dashboard:read`; `GET customers` / `GET customers/:id` → `customers:read`; `PATCH reviews/:id/status` → `reviews:moderate`; `GET coupons` / `GET coupons/:id` → `coupons:read`; `POST coupons` / `PATCH coupons/:id` → `coupons:write`; `GET settings` → `settings:read`; `PATCH settings/:key` → `settings:write`. `products.controller.ts` (12 sites — corrected during Phase 3 implementation from this record's original count of 8, which omitted `updateVariant` and `removeImage`; the categorization is unchanged, both are `products:write` like their siblings): admin list + admin get-by-id → `products:read`; create/update/deactivate/reactivate/create-variant/update-variant/customization-field create+update/add-image/remove-image → `products:write`. `categories.controller.ts` (5 sites, unchanged): admin list → `products:read`; create/update/delete/reactivate → `products:write`. |
| **Rejection of the legacy `@Roles`/`RolesGuard` model as the long-term mechanism** | `@Roles(Role.ADMIN)` + `RolesGuard` is a flat, single-tenant, two-value (`CUSTOMER`/`ADMIN`) role check with **no** tenant awareness and **no** distinction between different admin actions (today, e.g., viewing the dashboard and deleting a coupon require exactly the same check). This is explicitly rejected as the long-term authorization mechanism: it cannot express `STAFF`/`VIEWER`'s narrower grants, cannot select which `TenantMembership` a check applies to, and does not scale past a single global admin surface. `PermissionsGuard` + this ratified catalogue replaces it permanently — `RolesGuard`, `@Roles`, and `ROLES_KEY` are removed (not left running in parallel) once the swap lands. |
| **Rationale** | Owner's explicit instruction: ratify the docket's proposed catalogue "provided it is internally consistent with the existing platform/tenant role model and Phase 3 implementation scope." Consistency was verified against the actual `TenantRole` enum values and the actual current controller routes (both read directly from the repository for this ratification, not assumed from documentation) before being recorded here. |
| **Source document / section** | `PHASE-3-DECISION-DOCKET.md` item 3; P2-D8 (representation, frozen); P2-D9 (this phase's mandate); Master Plan §8 BACKEND IMPACT ("Permission model"), KEY RISKS ("privilege escalation via the role→permission map"); current tree: `backend/src/admin/admin.controller.ts`, `backend/src/products/products.controller.ts`, `backend/src/products/categories/categories.controller.ts`, `backend/prisma/migrations/20260905191258_add_saas_foundation/migration.sql` (`TenantRole` enum). |
| **Consequences** | Phase 3 authors `backend/src/auth/permissions/` implementing exactly this catalogue and map (a pure, unit-testable `can()` function plus the typed constants — spec §17 step 3), then performs the mechanical swap (spec §8, §17 step 9) using the concrete mapping above, then activates `PermissionsGuard` globally and removes `RolesGuard`. Any *future* permission addition or role-mapping change should go through the same ratification discipline as this record (a lightweight repeat of this process), not be added ad hoc in a feature PR. |
| **Affected phase(s)** | **Phase 3 (authoring + swap + activation).** `members:manage` is consumed when a team-management UI/route is built (likely Phase 5); `payment-account:manage` when payment-account linkage is built (Phase 8) — both permissions exist in the catalogue now so that work does not require reopening this ratification. |
| **Reversibility** | Reversible — the typed constant can be revised; adding a 14th permission or renaming one is a code change + test update, not a migration. Removing a permission a route already depends on would need the corresponding route updated in the same change. |
| **Explicit approval wording (recorded)** | `"Ratify the permission-string catalogue and role→permission mapping contained in the Phase 3 docket, provided it is internally consistent with the existing platform/tenant role model and Phase 3 implementation scope."` (project owner, 2026-09-07). Consistency confirmed as described above; catalogue ratified as recorded in this entry (expanded from the docket's illustrative sketch into the exact, complete set above, grounded in the current controller routes). |

### G-13 — Decision Log

| Date | Owner | Choice | Approval wording (verbatim) | Reference |
|---|---|---|---|---|
| 2026-09-06 | Architecture + security owner (project owner) | **NOT REQUIRED FOR PHASE 2** | `"G-13: NOT REQUIRED FOR PHASE 2 — permission catalogue activation belongs to Phase 3"` | P2-D9 |
| 2026-09-07 | Architecture + security owner (project owner, Atharva) | **APPROVED — RATIFIED** | `"Ratify the permission-string catalogue and role→permission mapping contained in the Phase 3 docket, provided it is internally consistent with the existing platform/tenant role model and Phase 3 implementation scope."` | `PHASE-3-DECISION-DOCKET.md` item 3; this record's catalogue/map |

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
| **Status** | **APPROVED — AUTHORIZED** (2026-09-07) |
| **Decision (question)** | Authorize the Phase 2b identity backfill (`role='ADMIN'` → `OWNER` membership; `role='CUSTOMER'` → `Customer` rows), restored-copy-first, with the pre-backfill backup id recorded? |
| **Decision (recorded)** | **APPROVED.** The owner explicitly authorized: *"I, Atharva — Project Owner / Ops Owner, explicitly authorize G-16 for Phase 2b production execution, subject to the already-approved Phase 2b pre-flight, dry-run, reconciliation, and fresh pre-backfill snapshot requirements."* All named preconditions were verified before execution: D2 RESOLVED, D8 RESOLVED (evidence `D8-20260907-02`), dry-run/reconciliation against the restored scratch copy passed (this session, prior turn), and a fresh pre-backfill production snapshot was taken and checksum-verified immediately before execution (`printforge_prod_prebackfill_20260907T173125Z.dump`, SHA-256 `0847ee3cf68b10990474c156bfc8870e2b100c713a48e8fe2fe17aa56f2ace24`). |
| **Rationale** | The backfill writes production-derived data and is the single most invasive identity change in the plan (Master Plan §8 MIGRATION IMPACT). It cannot be planned without D2 (deployed data shape) or executed without a verified backup (D8). Both are now satisfied. |
| **Source document / section** | Master Plan §8 DATABASE/DATA IMPACT ("gated on D2/D3"), ROLLBACK; D2, D3, D8 records; `PHASE-2-DECISION-CLOSURE.md §15, §16`; `PHASE-2-START-GATE-RESULT.md`. |
| **Consequences** | Phase 2b execution (identity backfill) is authorized to proceed against production, restored-copy-first (dry run already run against `d8_scratch`), with the pre-backfill snapshot above as the rollback point. Phase 2a is unaffected (additive, no data). Phase 2 **completion** still requires the backfill's own reconciliation report to pass (Master Plan §8 EXIT CRITERION "backfill reconciled") — see the Phase 2b implementation report for the executed result. |
| **Affected phase(s)** | Phase 2b; Phase 2 completion. |
| **Reversibility** | The backfill is additive rows (`DELETE FROM customers WHERE …` + re-run); a corrupted state restores from the `printforge_prod_prebackfill_20260907T173125Z.dump` backup taken immediately before this execution. |
| **Explicit approval wording (recorded)** | `"I, Atharva — Project Owner / Ops Owner, explicitly authorize G-16 for Phase 2b production execution, subject to the already-approved Phase 2b pre-flight, dry-run, reconciliation, and fresh pre-backfill snapshot requirements. G-16 authorization date: 2026-09-07. Authorized operator: Atharva."` (project owner, 2026-09-07). |

### G-16 — Decision Log

| Date | Owner | Choice | Approval wording (verbatim) | Reference |
|---|---|---|---|---|
| 2026-09-06 | Ops owner (project owner) | **PENDING (held — gated on D2 + D8)** | `"G-16: PENDING — Phase 2b backfill authorization remains gated on D2"` | D2, D8 records |
| 2026-09-07 | Ops owner (project owner, Atharva) | **APPROVED — AUTHORIZED** | `"I, Atharva — Project Owner / Ops Owner, explicitly authorize G-16 for Phase 2b production execution, subject to the already-approved Phase 2b pre-flight, dry-run, reconciliation, and fresh pre-backfill snapshot requirements."` | D2, D8 records (both RESOLVED); pre-backfill snapshot `printforge_prod_prebackfill_20260907T173125Z.dump` |

---

## G-17 — D6 resolution / Phase 2 re-scope

| Field | Content |
|---|---|
| **ID** | G-17 |
| **Owner** | Architecture owner + product owner |
| **Date** | 2026-09-06 |
| **Status** | **APPROVED — RE-SCOPE** |
| **Decision (question)** | Resolve D6 now (guard swap stays in Phase 2), or formally re-scope Phase 2 to move the D6-dependent work (tenant-context, `@Roles → @RequirePermission` swap, `PermissionsGuard` activation) to Phase 3? |
| **Decision (approved option)** | **APPROVE — Phase 2 is explicitly re-scoped so D6-dependent tenant context and customer-auth activation are deferred to Phase 3 / 9 / 12 as documented.** At the time of this record, D6 was **DEFERRED**, not resolved. *(D6 was subsequently resolved 2026-09-07 — see the D6 record; this G-17 record's own re-scope decision is historical and unchanged.)* |
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

# Phase 3 Decision Records (recorded 2026-09-07)

*(D6 was resolved by updating its existing record in place, above — deferred decisions keep
their original ID and location rather than being re-recorded here. D4 and P3-D2 were likewise
placed near D3/D5 above, matching the existing D-number ordering; G-13 was updated in place
above. Only genuinely new IDs with no natural prior slot are recorded in this section.)*

## P3-D1 — Rollout / advisory-flag location

| Field | Content |
|---|---|
| **ID** | P3-D1 |
| **Owner** | Architecture owner + Ops owner |
| **Date** | 2026-09-07 |
| **Status** | **RESOLVED — ENVIRONMENT VARIABLE** |
| **Decision (question)** | Where does each module's `TENANT_ENFORCEMENT[module] = 'advisory' \| 'enforced'` rollout state live: a code constant, an environment variable, or a DB-backed/feature-flag-service config? |
| **Decision (approved option)** | **Environment variable, one per module, read through the existing `ConfigService<AppConfig, true>` pattern** already used throughout `backend/src/common/config/` — e.g. `TENANT_ENFORCEMENT_ORDERS`, `TENANT_ENFORCEMENT_PRODUCTS`, `TENANT_ENFORCEMENT_PAYMENTS`, one var per domain module listed in the Phase 3 spec §11 affected-services list. Each is validated/typed the same way other `AppConfig` fields are (matches the existing `configuration.ts` idiom — no new configuration subsystem introduced). |
| **Rationale** | Owner's explicit decision, matching the docket's recommendation. This is a security-relevant but infrequently-changed setting (the rollout plan is "≥1 week advisory observation, then flip" — Master Plan §9), so a full runtime feature-flag service is disproportionate machinery for what Phase 4 is expected to retire once every module reaches `enforced` permanently. A code constant would falsify the "flip back without a deploy" rollback property (spec §16); an env var supports a restart-only rollback without introducing new infrastructure. |
| **Source document / section** | `PHASE-3-DECISION-DOCKET.md` item 4; `PHASE-3-START-GATE-AND-IMPLEMENTATION-SPEC.md` §2, §16; existing `backend/src/common/config/configuration.ts` pattern. |
| **Default behavior** | **Every module defaults to `advisory` when its environment variable is unset or unrecognized** — a missing or misconfigured variable must fail toward "logs a breadcrumb, does not throw," never toward "enforces unexpectedly" or "throws in production." This mirrors the existing `AppConfig` fail-safe conventions already in use elsewhere in the codebase. |
| **Consequences** | Each module-migration PR (Phase 3 spec §17 step 7, §19 item 4) reads its own env var through `ConfigService`; flipping a module to `enforced` in any environment is an ops action (set the var, restart) requiring no code change or redeploy. A single optional global kill-switch (e.g. `TENANT_ENFORCEMENT_GLOBAL_OVERRIDE=advisory`) may additionally be implemented as a Phase 3 implementation detail for emergency rollback, at the implementer's discretion — not itself a separate decision. |
| **Affected phase(s)** | **Phase 3** (defining); **Phase 4** (expected to retire the flag entirely once every module is permanently `enforced`). |
| **Reversibility** | Fully reversible — this is operational configuration, not schema or data. |
| **Explicit approval wording (recorded)** | `"Use an environment variable for the Phase 3 advisory/enforced rollout flag, accessed through the existing ConfigService pattern."` (project owner, 2026-09-07). |

### P3-D1 — Decision Log

| Date | Owner | Choice | Approval wording (verbatim) | Reference |
|---|---|---|---|---|
| 2026-09-07 | Architecture + Ops owner (project owner, Atharva) | **RESOLVED — environment variable via `ConfigService`** | `"Use an environment variable for the Phase 3 advisory/enforced rollout flag, accessed through the existing ConfigService pattern."` | `PHASE-3-DECISION-DOCKET.md` item 4 |

---

## G-20 — Phase 3 specification approval

| Field | Content |
|---|---|
| **ID** | G-20 |
| **Owner** | Project & Architecture Owner |
| **Date** | 2026-09-07 |
| **Status** | **APPROVED** |
| **Decision (question)** | Does the Project & Architecture Owner approve `PHASE-3-START-GATE-AND-IMPLEMENTATION-SPEC.md` as the contract for Phase 3 implementation, now that its five decision-docket dependencies (D6, D4, G-13, P3-D1, P3-D2) are resolved? |
| **Decision (approved option)** | **APPROVE.** `docs/saas/PHASE-3-START-GATE-AND-IMPLEMENTATION-SPEC.md` (all 19 sections) is accepted as the Phase 3 implementation contract, checked for internal consistency against the resolved decisions, the Master Plan, Phase 2's completed state, the existing RBAC/auth code, the frozen architecture invariants, the Phase 4 boundary, and the RLS/production facts — see the verification notes below. |
| **Verification performed (not a re-litigation of D6/D4/G-13/P3-D1/P3-D2 — checking the spec against them)** | (1) Spec §4's merchant-path resolver ("whatever D6 resolves… host/subdomain, `X-Active-Tenant` header, or both") and its "client-supplied tenant identifier is only a hint" rule match D6's resolved text verbatim. (2) Spec §12–§13's RLS scope ("`tenants`, `stores`, `store_domains`, `tenant_memberships`, `subscriptions`, `customers`") matches D4's resolved scope exactly — no business/commerce table included, consistent with the Phase 4 boundary (§15). (3) Spec §6–§8's permission-model design (typed constant, `can()`, deny-by-default, mechanical `@Roles`→`@RequirePermission` swap) matches G-13's ratified 13-permission catalogue and role map; the swap's site count grows from the current 14 `@Roles` decorator instances to 27 `@RequirePermission` sites because `admin.controller.ts`'s single controller-level decorator is deliberately replaced by 14 per-method ones — an intentional, explained granularity increase (the entire point of the permission model), not a discrepancy. (4) Spec §7's "`PermissionsGuard` independent of `PlatformGuard`, never both on one handler" and G-13's "`SUPER_ADMIN` deliberately absent from the map" both preserve frozen invariant 4. (5) Spec §16's "rollback without a redeploy" claim and P3-D1's "restart, not redeploy" both rest on an operational assumption about this project's Render deployment behavior for a routine env-var value change; **this project's own `DEPLOYMENT.md` was checked and found to document a redeploy only for a distinct, unrelated scenario (a *missing* required variable causing a boot-time crash), not for changing an already-present optional variable's value** — so no *documented* contradiction exists, but this specific operational assumption has not been empirically verified against the actual Render service configuration. **Noted as a follow-up verification item for the implementer, not a blocking inconsistency**: confirm, before relying on it for an incident-response rollback, whether flipping a `TENANT_ENFORCEMENT_*` env var on this project's Render service triggers a mere restart or a full redeploy. (6) Spec §15's Phase 4 exclusion list (no `customerId`/`tenantId`/`storeId` columns, no FK re-pointing, no `User.role` drop, no RLS enforcement on business tables) was checked against Phase 2's actual completed state (`PHASE-2B-IMPLEMENTATION-REPORT.md`) and found consistent — Phase 2b touched only `plans`/`tenants`/`stores`/`subscriptions`/`tenant_memberships`/`customers`, exactly the tables Phase 3's RLS scope also targets, and none of the excluded commerce-table work. No genuine contradiction was found. |
| **Rationale** | The owner's explicit request to perform this gate now that the decision docket is closed. Master Plan §9 and the resolved decisions were cross-checked directly (not assumed) against the spec's text before approval, per the standing instruction not to rubber-stamp. |
| **Source document / section** | `docs/saas/PHASE-3-START-GATE-AND-IMPLEMENTATION-SPEC.md` (full document); `docs/saas/PHASE-3-DECISION-DOCKET.md`; D6, D4, G-13, P3-D1, P3-D2 records (this file); Master Plan §8–§9; `PHASE-2B-IMPLEMENTATION-REPORT.md`. |
| **Scope approved** | Everything in spec §1 ("Exact Phase 3 scope"): `TenantContext` (3 resolution paths), the tenant-scoped Prisma client, object-level authorization helpers, the ratified permission catalogue + `PermissionsGuard` + `@RequirePermission`, the mechanical guard swap (removing `RolesGuard`), `tenant-isolation.e2e-spec.ts` and all named negative tests, the per-module advisory/enforced rollout (env-var based, per P3-D1), and the RLS-enabling migration on the six named tenancy tables (per D4/P3-D2). |
| **Explicit exclusions (binding, per spec §15)** | No column on any of the ~20 existing commerce tables; no FK re-pointing; no `User.role` drop or data change; no deactivation of shopper `User` rows; no RLS enforcement on business/commerce tables; no per-tenant revenue/row-count reconciliation baseline; no customer-auth routes/`CustomerRefreshToken` (P2-D7, Phase 9/12); no platform-console routes (Phase 5); no frontend Domain→Store→Tenant runtime resolution beyond the query-key-namespacing groundwork (full sweep is Phase 12). |
| **Consequences** | **Phase 3 implementation is now authorized to begin**, following the commit boundaries and implementation order in spec §17/§19. **This approval does NOT authorize Phase 4 work** — Phase 4 has its own separate, still-open gates (D7, D9–D15 remain `OPEN`) and its own start-gate process, not triggered by this record. |
| **Affected phase(s)** | **Phase 3 (defining — implementation may now begin).** |
| **Reversibility** | A spec revision can be re-approved via a recorded change, the same as G-4/G-11 for prior phases. |
| **Explicit approval wording (recorded)** | Owner's request to "perform the formal Phase 3 specification approval gate (G-20)" with the specification found internally consistent as verified above (project owner, 2026-09-07). |
| **Not to be implemented until this record is `APPROVED`** | ~~Any Phase 3 source file, `TenantContext`, scoped Prisma client, `PermissionsGuard`, `@RequirePermission` decorator, RLS migration, or `@Roles` removal.~~ **CLEARED 2026-09-07 — implementation authorized. No implementation has been performed under this record; that is separate, future work.** |

### G-20 — Decision Log

| Date | Owner | Choice | Approval wording (verbatim) | Reference |
|---|---|---|---|---|
| 2026-09-07 | Project & Architecture Owner (Atharva) | **APPROVED** | Request to perform the G-20 gate; specification verified internally consistent (one non-blocking operational-verification caveat noted, §"Verification performed" above) | `PHASE-3-START-GATE-AND-IMPLEMENTATION-SPEC.md`; D6, D4, G-13, P3-D1, P3-D2 records |

---

# Phase 4 Decision Records (recorded 2026-09-08)

*(D10 and D11 were resolved by adding their full records near D8 above,
matching the established D-number ordering, rather than re-recording them
here. The genuinely new IDs — P4-D1, P4-D2, and (added 2026-09-09) P4-D3,
P4-D4 — are recorded in this section, mirroring how the Phase 3 section
above only added P3-D1.)*

## P4-D1 — `userId` vs. `Customer` relationship pending Phase 9/12

| Field | Content |
|---|---|
| **ID** | P4-D1 |
| **Owner** | Architecture owner |
| **Date** | 2026-09-08 |
| **Status** | **RESOLVED — OPTION B** |
| **Decision (question)** | How should the Phase 4 migration handle the relationship between existing commerce `userId` references and the `Customer` entity, given customer authentication is deferred to Phase 9/12? |
| **Decision (approved option)** | **Option B.** `userId` remains the sole **live** ownership path for `Cart`, `Order`, `Review`, `CouponUsage`, `IdempotencyKey` (and the equivalent `uploadedByUserId` / `changedByUserId` actor columns). A nullable `customerId`-family column is added alongside each (`Cart.customerId?`, `Order.customerId?`, `Review.customerId?`, `CouponUsage.customerId?`, `IdempotencyKey.customerId?`, `UploadedFile.uploadedByCustomerId?`, `OrderStatusHistory.changedByCustomerId?`/`changedByMembershipId?`) and backfilled, for every row that already exists, from the same `(storeId,email)` join Phase 2b already used to create the `Customer` rows in the first place. **No constraint moves onto `customerId`** (`carts.userId @unique`, `reviews @@unique([productId,userId])` stay exactly as they are); **no customer-authentication mechanism is built**; **no dual-write of `customerId` for new rows is implemented** — new rows continue to be written with `userId` only until Phase 9/12 ships a live Customer session. |
| **Rationale** | Owner's explicit approval of the docket's Option B (`PHASE-4-DECISION-DOCKET.md` §3). Option A (full cutover now) would break checkout/cart/review submission immediately, since no live Customer session exists to populate a `NOT NULL` `customerId` for a newly created row. Option C (server-side dual-write derived from the authenticated `User`'s own email match) was noted as technically available but explicitly not adopted now, since building it would piecemeal-construct part of Phase 9/12's own customer-authentication design (P2-D5/P2-D6/P2-D7 territory) out of order. |
| **Source document / section** | `PHASE-4-DECISION-DOCKET.md` §3; `PHASE-4-START-GATE-AND-IMPLEMENTATION-SPEC.md` §4; P2-D7 record (customer auth deferred to Phase 9/12); `PHASE-2B-IMPLEMENTATION-REPORT.md` (the `User`→`Customer` join this backfill reuses). |
| **Consequences** | Phase 4's `customerId`-family columns are backfill-only compatibility columns through the end of Phase 4 — never `NOT NULL`, never the write path, never load-bearing for any constraint. The actual cutover (making `customerId` live, `NOT NULL`, and constraint-bearing) is explicitly deferred to whichever phase ships customer authentication (Phase 9/12), to be decided there with a real Customer session available to reason about. Reconciliation for this backfill checks `COUNT(customerId set)` against `COUNT(userId rows whose User.role='CUSTOMER')`, not universal non-null. |
| **Affected phase(s)** | **Phase 4** (backfill-only `customerId` columns); **Phase 9/12** (the actual cutover, not decided here). |
| **Reversibility** | Fully reversible on paper — a nullable, unused-for-writes column can be dropped or repurposed with no application-behavior impact, since nothing depends on it being populated or authoritative during Phase 4. |
| **Explicit approval wording (recorded)** | `"Resolve to Option B: keep userId as current live path, add nullable customerId-family fields where specified, backfill customerId where safely derivable, no constraint cutover, no customer-auth implementation, no dual-write customer-auth behavior. P4-D1 STATUS: RESOLVED."` (project owner, 2026-09-08). |

### P4-D1 — Decision Log

| Date | Owner | Choice | Approval wording (verbatim) | Reference |
|---|---|---|---|---|
| 2026-09-08 | Architecture owner (project owner, Atharva) | **RESOLVED — OPTION B** | `"Resolve to Option B… no dual-write customer-auth behavior. P4-D1 STATUS: RESOLVED."` | `PHASE-4-DECISION-DOCKET.md` §3 |

---

## P4-D2 — Extending the migration-safety guard for W7 contract verbs

| Field | Content |
|---|---|
| **ID** | P4-D2 |
| **Owner** | Architecture owner (Atharva — Project & Architecture Owner) |
| **Date** | 2026-09-10 |
| **Status** | **RESOLVED — IMPLEMENTED** |
| **Decision (question)** | Should the migration-safety guard (`backend/src/migration-safety.spec.ts`) be extended now to permit the exact W7 contract-step migration verbs (`ADD CONSTRAINT … CHECK … NOT VALID`, `VALIDATE CONSTRAINT`, `ALTER COLUMN … SET NOT NULL`, `DROP CONSTRAINT` on five named legacy uniques)? |
| **Decision (approved)** | **The recommended narrow, self-verifying extension, exactly as `PHASE-4-DECISION-DOCKET.md` §4 originally recommended — four independently-gated shapes, each narrower than a bare verb exemption:** (1) `ALTER TABLE <existing> ADD CONSTRAINT "<name>" CHECK ("<col>" IS NOT NULL) NOT VALID` — permitted ONLY when `(<existing>, <col>)` is one of the 20 approved `(table, "tenantId")` pairs (`categories`, `products`, `product_images`, `product_variants`, `customization_fields`, `uploaded_files`, `carts`, `cart_items`, `cart_item_customizations`, `orders`, `invoices`, `order_items`, `order_item_customizations`, `payment_attempts`, `refunds`, `order_status_history`, `idempotency_keys`, `reviews`, `coupons`, `coupon_usages`). (2) `ALTER TABLE <existing> VALIDATE CONSTRAINT "<name>"` — permitted ONLY when `<name>` was itself declared by an approved statement of shape (1), for the SAME table, anywhere in the SAME migration file. (3) `ALTER TABLE <existing> ALTER COLUMN "<col>" SET NOT NULL` — permitted ONLY when `(<existing>, <col>)` is an approved pair AND the same file also contains a matching, approved CHECK-NOT-VALID (1) whose name was also VALIDATEd (2) for that exact `(table, column)` — the self-verifying pairing that proves the safe two-step pattern was actually followed, not merely permitted in principle. (4) `ALTER TABLE <existing> DROP CONSTRAINT "<name>"` — permitted ONLY for the fixed five legacy single-column uniques, each attached to its correct table: `categories_slug_key`→`categories`, `products_slug_key`→`products`, `coupons_code_key`→`coupons`, `orders_orderNumber_key`→`orders`, `invoices_invoiceNumber_key`→`invoices`. No second action is permitted in the same statement for any of the four. |
| **Explicitly NOT introduced (per the owner's own locked scope)** | `storeId` is **not** added to the `NOT NULL` scope or to the guard, at all — the 20-pair map contains `tenantId` only. `customerId` is untouched. `carts.userId` and `reviews(productId,userId)` are **not** on the `DROP CONSTRAINT` allowlist — P4-D1 defers their cutover past Phase 4. `outbox_events.tenantId` is **permanently excluded** from the approved-columns map (`PHASE-4-START-GATE-AND-IMPLEMENTATION-SPEC.md` §3.6) — confirmed by its own dedicated negative test (a well-formed CHECK/VALIDATE/SET-NOT-NULL trio on `outbox_events` is still rejected). No generic `DROP CONSTRAINT`, generic `SET NOT NULL`, generic `ADD CONSTRAINT`, generic `VALIDATE CONSTRAINT`, generic `CHECK … NOT VALID`, or unscoped `ALTER TABLE` allowance was introduced. No migration-safety bypass. No weakening of any existing `DROP`/`TRUNCATE`/`DELETE`/`UPDATE`/RLS/FK rejection — every previously-rejected shape remains rejected (regression-tested). |
| **Rationale** | Owner's explicit approval of the docket's own recommended design (`PHASE-4-DECISION-DOCKET.md` §4) over a bare verb exemption — structurally identical in kind to P4-D3's own precedent (shape-plus-allowlist, both conditions required together), extended here with a same-file cross-statement pairing check (`CHECK NOT VALID` → `VALIDATE CONSTRAINT` → `SET NOT NULL`, all three keyed to the identical `(table, column)`) since this is the one guard extension that touches the guard's core destructive-prevention purpose (`SET NOT NULL`, `DROP CONSTRAINT`) rather than its edges. |
| **Security impact** | None negative. The 20 columns this exemption permits to become `NOT NULL` *close* a null-tenant gap (a row can no longer exist with no tenant owner); the 5 constraint drops remove uniques already superseded by the composite uniques W6 added. The guard change itself only widens CI's static-text tolerance for these four exact shapes under these exact allowlists — it touches no runtime authorization path, no `TenantContext`, no RLS policy. |
| **Data / migration-safety impact** | The guard remains a static, self-contained, per-migration-file text scanner (unchanged design principle) — it does **not** verify that a real `tenantId` backfill actually reached 100% completeness, or that the 5 legacy uniques are actually safe to drop in the live database. Those remain separate, required preflight steps (zero-null validation, verified backup, maintenance window) run by the operator immediately before the actual W7 migration is ever applied — this record does not authorize skipping them, and does not itself create, run, or apply any migration. |
| **Implementation status (this record, unlike P4-D3, includes the code change)** | `backend/src/migration-safety.spec.ts` **has been updated** in this same turn: two new fixed allowlist maps (`W7_APPROVED_TENANT_NOT_NULL_COLUMNS`, 20 entries; `W7_APPROVED_LEGACY_UNIQUE_DROPS`, 5 entries), four new statement parsers/validators, a same-file pre-scan for the CHECK/VALIDATE pairing, and wiring into `findAdditiveOnlyViolations`. Full suite: **112/112 tests passing** (41 new P4-D2 tests — positive, negative, and regression — plus every pre-existing test, including the on-disk-migration-file suite, unchanged and green). `backend/prisma/schema.prisma`, `backend/prisma/migrations/`, and production are **explicitly untouched** by this record — the actual W7 migration file, its preflight validation, a fresh pre-wave backup, and production execution remain separate, later, explicitly-authorized work, the same sequencing P4-D3 used for W6. |
| **Required tests (implemented, not merely recorded)** | Positive: each of the 20 approved `(table, tenantId)` CHECK→VALIDATE→SET-NOT-NULL sequences alone and all 20 together; each of the 5 allowlisted `DROP CONSTRAINT`s alone and all 5 together; a combined realistic full-W7-file fixture. Negative: a bare `SET NOT NULL` with no pair; a pair on an out-of-scope column (`storeId`) on the same table; an approved pair on the wrong table; a `VALIDATE CONSTRAINT` with no matching declaration (smuggled); `outbox_events.tenantId` rejected even with a well-formed trio (permanent-exception proof); an approved table with an unapproved column; a table entirely off the list; a `CHECK` with the wrong condition; a `CHECK` missing `NOT VALID`; a `VALIDATE CONSTRAINT` referencing a name declared for a different table; a `DROP CONSTRAINT` off the five-name allowlist; an allowlisted name on the wrong table; `carts.userId`/`reviews(productId,userId)` drops (P4-D1-deferred, never on this allowlist); a smuggled second action on each of the four shapes; full regression of every previously-rejected shape. |
| **Source document / section** | `PHASE-4-DECISION-DOCKET.md` §4 (original recommendation); `PHASE-4-W6-DECISION-DOCKET.md` §2 (the P4-D3 precedent this extension follows); `backend/src/migration-safety.spec.ts` (implemented). |
| **Consequences** | CI now passes for exactly the 20 named `tenantId` `NOT NULL` columns (via the self-verifying trio) and the 5 named legacy `DROP CONSTRAINT`s, and continues to reject every other non-additive shape unchanged. The actual W7 migration file, its preflight validation, a fresh pre-wave backup, and production execution remain a separate, later, explicitly-authorized implementation step. |
| **Affected phase(s)** | **Phase 4** (wave W7 only). |
| **Reversibility** | Fully reversible — this record changed only test/guard source code (`backend/src/migration-safety.spec.ts`); no schema, migration, or production data was touched, so reverting the diff fully reverts the record. |
| **Explicit approval wording (recorded)** | `"Approved. Proceed with the P4-D2 guard implementation exactly according to your plan, with the following scope locked: 1. SET NOT NULL enforcement is for tenantId only on the exact 20 approved tables. 2. outbox_events.tenantId is a permanent nullable exception and must remain excluded. 3. Do not add storeId to the W7 guard or W7 NOT NULL scope. 4. DROP CONSTRAINT is permitted only for the exact five approved legacy constraints: categories_slug_key, products_slug_key, coupons_code_key, orders_orderNumber_key, invoices_invoiceNumber_key. 5. Do not touch customerId, carts.userId, reviews(productId,userId), or any other legacy uniqueness in W7. 6. Implement only P4-D2 in this step: backend/src/migration-safety.spec.ts, docs/saas/DECISIONS.md. 7. Do NOT create the W7 migration yet. 8. Do NOT modify schema.prisma. 9. Do NOT access or modify production. 10. Do NOT stage or commit anything. Implement the self-verifying guard with the planned positive/negative/regression tests."` (Atharva — Project & Architecture Owner, 2026-09-10). |

### P4-D2 — Decision Log

| Date | Owner | Choice | Approval wording (verbatim) | Reference |
|---|---|---|---|---|
| 2026-09-08 | Architecture owner (project owner, Atharva) | **OPEN — held, W7-only** | `"Leave OPEN. Record that it is required only immediately before W7. Do not change the migration-safety guard now."` | `PHASE-4-DECISION-DOCKET.md` §4 |
| 2026-09-10 | Architecture owner (Atharva — Project & Architecture Owner) | **RESOLVED — IMPLEMENTED** | `"Approved. Proceed with the P4-D2 guard implementation exactly according to your plan, with the following scope locked: … Implement the self-verifying guard with the planned positive/negative/regression tests."` | This record; `backend/src/migration-safety.spec.ts` |

---

## P4-D3 — Extending the migration-safety guard for W6 composite ownership FKs

| Field | Content |
|---|---|
| **ID** | P4-D3 |
| **Owner** | Architecture owner (Atharva — Project & Architecture Owner) |
| **Date** | 2026-09-09 |
| **Status** | **RESOLVED** |
| **Decision (question)** | How should `backend/src/migration-safety.spec.ts`'s `findAdditiveOnlyViolations` safely permit the exact composite-FK `ALTER TABLE ... ADD CONSTRAINT ... FOREIGN KEY` statements wave W6 requires, given the guard currently rejects all of them (verified directly against the file: an `ALTER TABLE` on a pre-existing table only exempts G-19's single nullable `ADD COLUMN` or D4/G-20's bare RLS toggle — a composite FK matches neither)? |
| **Decision (approved)** | **The recommended narrow extension, exactly as specified in `PHASE-4-W6-DECISION-DOCKET.md` §2.2 — both conditions required together, neither alone:** (1) **Exact structural shape** — the statement is a single-action `ALTER TABLE` on a pre-existing table containing exactly one `ADD CONSTRAINT ... FOREIGN KEY` action, where the FK is a composite ownership key of the form `("tenantId"\|"storeId", X) REFERENCES ...("tenantId"\|"storeId", X)` with the **same** ownership-scope token appearing on both the local and referenced side (enforced via regex backreference — not merely "some ownership column on each side," but the identical one); no second action may be combined into the same `ALTER TABLE` statement. (2) **The constraint name appears on a fixed, explicit, 19-entry allowlist** — the exact composite FKs enumerated in `PHASE-4-W6-DECISION-DOCKET.md` §4.1, by name. A statement satisfying only one of the two conditions is still rejected. |
| **Explicitly NOT introduced (per the owner's own enumeration)** | No generic `ADD CONSTRAINT` allowance. No generic composite-FK allowance (any shape, any name). No name-only allowance (shape unchecked). No shape-only allowance (name unchecked). No migration-safety bypass. No weakening of any existing `DROP`, `SET NOT NULL`, or unscoped-`ALTER TABLE` rejection — every currently-rejected shape remains rejected exactly as before. |
| **Rationale** | Owner's explicit approval of the docket's own recommendation (`PHASE-4-W6-DECISION-DOCKET.md` §2.2), over the docket's own named alternatives (§2.3: allowlist-only — rejected, a reused name could front an unsafe FK shape; shape-only — rejected, this is exactly the generic "any composite ownership FK" the owner declined to authorize; bare `ADD CONSTRAINT` allowance — rejected outright; bypassing the guard for W6 — rejected, reintroduces the unreviewed-schema-change risk G-10 exists to prevent). Structurally identical in kind to the two prior narrow extensions already precedent-setting in this same file (G-19's `ADD COLUMN`, D4/G-20's RLS toggle) — narrows CI tolerance for one exact, reviewed shape, does not widen it generally. |
| **Security impact** | None negative. The 19 composite FKs this exemption permits *strengthen* cross-tenant/cross-store referential integrity (a row can no longer reference a parent belonging to a different tenant/store); the guard change itself only widens CI's static-text tolerance for that one exact SQL shape under that one exact name list — it touches no runtime authorization path, no `TenantContext`, no RLS. |
| **Data / migration-safety impact** | The guard remains a static, self-contained, per-migration-file text scanner (per its own existing design principle) — it does **not** verify live schema state (does the referenced `(scope, id)` pair actually exist and carry a unique constraint yet?) or live data safety (would any existing row violate the FK?). Those are explicitly **separate, required** verification steps — the `PHASE-4-W6-DECISION-DOCKET.md` §6/§7 preflight queries — run by the operator immediately before the migration, never by the guard itself. This decision does not authorize skipping those preflight checks. |
| **Dependency on W6 implementation** | This decision resolves the *mechanism* only. It does **not** itself modify `backend/src/migration-safety.spec.ts`, create any migration, or execute any DDL — implementation is deferred to a separate, later, explicitly-authorized turn, per the owner's own instruction ("Implement the guard extension later exactly according to this decision. For this turn, only record the decision."). W6 additionally remains blocked on P4-D4 (below) for 7 of the 19 FKs, and on its own separate start-gate authorization (`PHASE-4-W6-DECISION-DOCKET.md` §3/§10). |
| **Explicit statement — does NOT authorize W7** | This decision is scoped to W6's composite-FK verb only. It has no bearing on P4-D2 (still `OPEN`, held for W7's distinct verb set — `CHECK...NOT VALID`, `VALIDATE CONSTRAINT`, `SET NOT NULL`, `DROP CONSTRAINT`) and does not resolve, narrow, or otherwise touch P4-D2. |
| **Required tests (recorded here for implementation-time reference; not run by this decision)** | Positive: each of the 19 approved FKs alone; all 19 together in one migration file; a same-scope-token backreference check (proves both sides must match, not merely both be *an* ownership column). Negative: an on-shape, off-allowlist constraint name; an on-allowlist name with a hand-edited/unsafe shape; the FK combined with a second action in the same statement; a composite FK not starting with `tenantId`/`storeId`; full regression of every previously-rejected shape (`DROP`, `SET NOT NULL`, unscoped `ALTER TABLE`, etc.). |
| **Source document / section** | `PHASE-4-W6-DECISION-DOCKET.md` §2 (full analysis), §4.1 (the 19-entry allowlist), §2.8 (the test list reproduced above). |
| **Consequences** | `backend/src/migration-safety.spec.ts` is **not yet modified** — this record authorizes a specific, exact future change; it does not perform one. Once implemented (a separate turn), W6's composite-FK migration(s) may pass CI for exactly the 19 named constraints and no others. |
| **Affected phase(s)** | **Phase 4** (wave W6 only). |
| **Reversibility** | Fully reversible on paper before implementation (no code changed by this record). Once implemented and used, reverting the *guard* exemption has no retroactive effect on already-applied production constraints — those would need their own separate migration to drop, per W6/W7's own additive/contract discipline. |
| **Explicit approval wording (recorded)** | `"P4-D3: APPROVED. Use the recommended narrow migration-safety extension. The guard may permit a W6 composite FK only when BOTH conditions hold: (1) Exact structural shape: ALTER TABLE on a pre-existing table containing exactly one ADD CONSTRAINT ... FOREIGN KEY action where the FK is a composite ownership key of the form (\"tenantId\"|\"storeId\", X) REFERENCES ...(\"tenantId\"|\"storeId\", X). The same ownership scope token must appear on both sides. No additional action is permitted in the same ALTER TABLE statement. (2) The constraint name is present on the fixed, explicit 19-entry W6 allowlist from the approved W6 docket. Do NOT introduce: generic ADD CONSTRAINT allowance, generic composite-FK allowance, name-only allowance, shape-only allowance, migration-safety bypass, any weakening of existing DROP / SET NOT NULL / unscoped ALTER TABLE protections. Implement the guard extension later exactly according to this decision. For this turn, only record the decision."` (Atharva — Project & Architecture Owner, 2026-09-09). |

### P4-D3 — Decision Log

| Date | Owner | Choice | Approval wording (verbatim) | Reference |
|---|---|---|---|---|
| 2026-09-09 | Atharva — Project & Architecture Owner | **RESOLVED** | `"P4-D3: APPROVED. Use the recommended narrow migration-safety extension… For this turn, only record the decision."` | `PHASE-4-W6-DECISION-DOCKET.md` §2 |

---

## P4-D4 — `storeId` column-completeness gap for 7 derived-ownership tables (W6 precondition)

| Field | Content |
|---|---|
| **ID** | P4-D4 |
| **Owner** | Architecture owner (Atharva — Project & Architecture Owner) |
| **Date** | 2026-09-09 |
| **Status** | **RESOLVED** |
| **Decision (question)** | `PHASE-4-W6-DECISION-DOCKET.md` §5.1 found that 7 of W6's 19 composite FKs (and 1 of its 6 composite uniques) cannot be created because the source or referenced table is missing a physical `storeId` column — W3 only added `tenantId` to these tables, matching spec's own "SID: derived" marker for them. Should the owner (Option A) add `storeId` as a physical, nullable column to these tables, or (Option B) use `tenantId` instead of `storeId` for exactly these FKs? |
| **Decision (approved option)** | **Option A.** Add nullable `storeId` columns to the affected derived tables, exactly where the approved W6 ownership model requires direct Store-level scoping. **Affected tables (verbatim from the W6 docket §4.1/§5.1 — no table added or substituted beyond what that docket identified):** `ProductImage`, `ProductVariant`, `CustomizationField`, `CartItem`, `CartItemCustomization`, `OrderItem`, and the `Review → OrderItem` path's referenced side (i.e. `OrderItem` again — the same table, required by the `reviews_storeId_orderItemId_fkey` relationship named in the docket's §4.1 row 19). `tenantId` is **not** substituted for `storeId` on any of these — see Rationale. |
| **Rationale** | Owner's explicit instruction, verbatim: *"The approved W6 model requires Store-level ownership integrity for these relationships, and substituting tenantId would weaken the intended store-scoped isolation model and constitute an unapproved design deviation."* This matches the docket's own Option A recommendation (§5.1) — Option B was presented as an available alternative but explicitly not adopted, since it would be a permanent weakening of the *guarantee* (store-level to tenant-level isolation for exactly these 7 relationships), not merely a scheduling choice. |
| **Requirements (all explicit, owner-stated, none inferred)** | `storeId` is **nullable** at this stage — no `NOT NULL`. **No W6 FK is added in this decision-closure turn.** **No composite unique is added in this decision-closure turn.** **No existing ownership path is removed** (every existing plain FK, `tenantId` column, and `userId`/actor column on these tables stays exactly as it is). **Backfill source must use the already-proven parent-ownership relationship** — the identical `copyTenantFromParent`-style pattern `w4-backfill.ts` already uses for these same tables' `tenantId` column (e.g. `product_images.storeId` copied from `products.storeId`, `cart_items.storeId` from `carts.storeId`, `order_items.storeId` from `orders.storeId`), not a new or different derivation. **Production preflight must prove zero unresolved/`NULL` ownership and zero composite-FK violations before the FK itself is ever added** — this decision authorizes the column addition and its backfill; it does not authorize skipping `PHASE-4-W6-DECISION-DOCKET.md` §6/§7's preflight queries before the subsequent FK-creation step. |
| **Security impact** | None. A nullable column addition, backfilled from an already-verified-complete parent value, carries the same low-risk profile as every W3/W4/W5 column addition already executed this phase. |
| **Data / migration impact** | Additive only (`ADD COLUMN` — already covered by the existing G-19 exemption, no guard change needed for this part) plus a backfill step at the same risk level as W4/W5's own `tenantId` backfill (already proven, in production, with 100% ownership completeness and zero orphans per `PHASE-4-IMPLEMENTATION-REPORT.md` §16.4). Does not touch any existing column, row count, financial value, or constraint. |
| **Dependency on W6 implementation** | This decision authorizes the *column addition + backfill* step only — it is itself a small, additive precondition **before** W6's composite-FK step (§4.1's rows 3-8, 10, 19) can proceed. Neither the column addition nor the FK creation is performed by this decision; both remain separate, later, explicitly-authorized implementation turns. |
| **Explicit statement — does NOT authorize W7** | Unrelated to W7's contract-verb question (P4-D2, still `OPEN`); this decision does not touch, narrow, or resolve P4-D2. |
| **Source document / section** | `PHASE-4-W6-DECISION-DOCKET.md` §4.1 (rows 3-8, 10, 19 — the affected FKs), §5.1 (the finding and both options), §4.2 (the affected composite unique, `product_variants`). |
| **Consequences** | Once implemented (a separate turn), 7 of W6's 19 composite FKs and 1 of its 6 composite uniques become physically possible to create — closing the `PHASE-4-W6-DECISION-DOCKET.md` §10 blocker named for this finding. W6 remains additionally blocked on P4-D3's guard implementation and its own separate start-gate authorization. |
| **Affected phase(s)** | **Phase 4** (wave W6 precondition only). |
| **Reversibility** | Fully reversible on paper before implementation — a nullable, unbackfilled column carries no application dependency. Once backfilled, reversible via the same rollback posture as every other Phase 4 additive step (image revert; nothing destructive is introduced). |
| **Explicit approval wording (recorded)** | `"P4-D4: APPROVED. Use the recommended solution: Add nullable storeId columns to the affected derived tables where the approved W6 ownership model requires direct Store scoping. The affected tables identified by the W6 docket are: ProductImage, ProductVariant, CustomizationField, CartItem, CartItemCustomization, OrderItem, the Review → OrderItem-related path explicitly identified in §4.1 where the missing storeId is required by the approved FK design. Do NOT substitute tenantId for storeId merely to avoid these columns. Reason: The approved W6 model requires Store-level ownership integrity for these relationships, and substituting tenantId would weaken the intended store-scoped isolation model and constitute an unapproved design deviation. P4-D4 requirements: storeId is nullable at this stage; no NOT NULL; no W6 FK added in this decision-closure turn; no composite unique added in this decision-closure turn; no existing ownership path removed; backfill source must use the already-proven parent ownership relationship; production preflight must prove zero unresolved/null ownership and zero composite-FK violations before adding the FK."` (Atharva — Project & Architecture Owner, 2026-09-09). |

### P4-D4 — Decision Log

| Date | Owner | Choice | Approval wording (verbatim) | Reference |
|---|---|---|---|---|
| 2026-09-09 | Atharva — Project & Architecture Owner | **RESOLVED — OPTION A** | `"P4-D4: APPROVED. Use the recommended solution: Add nullable storeId columns…"` | `PHASE-4-W6-DECISION-DOCKET.md` §5.1 |

---

## P6-D1 — Plan catalogue columns (`isActive`, `sortOrder`, `isEnterpriseCustom`): G-19 application (nullable/no-default) for a pre-existing table

| Field | Content |
|---|---|
| **ID** | P6-D1 |
| **Owner** | Architecture owner (Atharva — Project & Architecture Owner) |
| **Date** | 2026-09-12 |
| **Status** | **RESOLVED — RATIFIED (implemented)** |
| **Decision (question)** | Phase 6 W1's ratified design specifies `Plan.isActive Boolean @default(true)`, `Plan.sortOrder Int @default(0)`, `Plan.isEnterpriseCustom Boolean @default(false)`. `Plan` already existed before the Phase 6 migration (created in an earlier phase's migration file). The enforced `migration-safety.spec.ts` guard (G-19) rejects any `ALTER TABLE <existing> ADD COLUMN` that carries `DEFAULT` and/or `NOT NULL` — verified directly against the guard's own code and its own positive/negative test cases (`ALTER TABLE "users" ADD COLUMN "x" TEXT DEFAULT 'y';` and `... NOT NULL;` are both explicitly rejected), with no applicable exemption among G-19 itself, D4/G-20 (bare RLS toggle), P4-D3 (one named composite-FK shape), or P4-D2 (a 20-name-hardcoded `tenantId` NOT-NULL trio from a closed Phase 4 W7 effort — none of which cover a defaulted/NOT-NULL column on `plans`). How should this conflict between the ratified schema syntax and the enforced guard be resolved? |
| **Decision (approved option)** | **Apply G-19 as already written — no new exemption, no guard change.** The three columns are added as `Boolean?` / `Int?` / `Boolean?` (nullable, no `DEFAULT`) via a single-action `ADD COLUMN` per statement, exactly matching G-19's existing permitted shape. The **intended semantic defaults remain exactly as ratified** — `isActive = true`, `sortOrder = 0`, `isEnterpriseCustom = false` — enforced at the application layer instead of the database layer: (1) every row created by `PlatformPlansService.createPlan()` writes explicit non-null values; (2) a one-time idempotent backfill script (`prisma/backfill/phase6-w1-plan-backfill.ts`) sets the intended default on any row still `NULL`; (3) `PlatformPlansService.toPlanView()` coalesces (`?? true` / `?? 0` / `?? false`) so `PlanView` never returns `null`; (4) the plan-list query orders `COALESCE("sortOrder", 0)` rather than the raw nullable column, so a `NULL` row sorts identically to an explicit `0` row (closing the gap found during the read-only G-19 verification — see Consequences); (5) every other discovered `Plan`-write call site (`prisma/seed-tenant-bootstrap.ts`, `prisma/backfill/dev-scratch-seed-phase2b-equivalent.ts`) now explicitly writes all three fields on create, so no new NULL row can be introduced by re-seeding a fresh environment. |
| **Explicitly NOT introduced (per the owner's own instruction)** | **No new G-19 exemption. No weakening of G-19 or of `migration-safety.spec.ts` in any way.** The guard's enforced behavior (reject `DEFAULT`/`NOT NULL` `ADD COLUMN` on a pre-existing table) is completely unchanged — `migration-safety.spec.ts` itself is not a file this record touches. This is an *application* of the existing rule to a real case it forces, not a change to the rule. No `SET NOT NULL`, `DROP`, or any other previously-rejected shape is newly permitted. |
| **Rationale** | The ratified Phase 6 design's literal `@default(...)` syntax cannot be expressed as an `ADD COLUMN` on `plans` (a pre-existing table) without violating G-19 exactly as it is currently enforced (see Decision (question) — mechanically confirmed, not assumed). Recreating `plans` to avoid an `ALTER` entirely is also blocked (the guard unconditionally rejects `DROP TABLE`/`DROP COLUMN`/`RENAME`). The only paths available without touching the guard are (a) the nullable-column + backfill + app-level-default pattern this record adopts, matching this repository's own established convention for "add a column to a pre-existing table under G-19," or (b) a new, separately-ratified guard exemption (the same kind of decision G-19/P4-D2/P4-D3 themselves were) — not requested or authorized here. |
| **Security impact** | None negative. No authorization path, `TenantContext`, RLS policy, or guard behavior is touched. The residual risk this record closes (query-level `NULL` semantics silently diverging from the coalesced application-level default) was a correctness/data-integrity risk, not an authorization bypass — see Consequences. |
| **Data / migration-safety impact** | Purely additive; `migration-safety.spec.ts` remains 129/129 passing, unchanged in source. `printforge_dev`/`printforge_test` only — production untouched by this record or its corrective implementation. |
| **Gap found during verification, closed by this record's corrective implementation** | A read-only G-19 deviation verification (2026-09-12, this same day) found that `PlatformView` coalescing protects only what the service *returns*, not SQL-level semantics on the raw column: (1) `listPlans()`'s `ORDER BY "sortOrder" ASC` used Postgres's default `NULLS LAST` behavior, so a legacy `NULL` row would sort to the end of the list rather than where its intended `sortOrder = 0` value would place it — fixed via `COALESCE("sortOrder", 0)` at the query level (§below). (2) `prisma/seed-tenant-bootstrap.ts` and `prisma/backfill/dev-scratch-seed-phase2b-equivalent.ts` both create/upsert a `Plan` row without setting any of the three columns, meaning a fresh-environment reseed would silently reintroduce `NULL` rows with nothing to prompt re-running the backfill — fixed by having both scripts write all three fields explicitly on create. No query-level `isActive` predicate was found anywhere in the codebase at the time of this record (grepped `src/`); none was added — that remains Phase 6 W2's own concern, not invented here. |
| **Explicit approval history** | The nullable-column + backfill + app-level-default *mechanism* was first approved mid-implementation via a structured choice (`AskUserQuestion`, option selected: "Nullable columns + backfill + app-level default (Recommended)", 2026-09-12) — that approval was **never persisted to this register** at the time, which the subsequent read-only verification flagged as a documentation gap relative to this repository's own practice for G-19/P4-D2/P4-D3. This record is that persistence, plus the owner's separate, later, explicit ratification of the deviation as a permanent Phase 6 design decision together with the corrective fixes the verification identified (see Explicit approval wording below). |
| **Source document / section** | `backend/src/migration-safety.spec.ts` (`findAdditiveOnlyViolations`, G-19 section); this same conversation's read-only "PHASE 6 W1 — G-19 DEVIATION VERIFICATION" report (2026-09-12, delivered in-session, not a separate file — see the note under Consequences); `backend/prisma/schema.prisma` (`Plan` model comment block). No standalone `PHASE-6-*.md` docket file exists in `docs/saas/` — unlike Phases 1–4, Phase 6's design-gate/ratification reports to date have been delivered only in-session, not persisted as files. This record is the first Phase 6 artifact persisted to the canonical register; the underlying design-gate/ratification content itself remains undocumented as a file, a residual gap this record does not itself close (see Remaining risks in the W1 corrective-fix report this record accompanies). |
| **Consequences** | `backend/prisma/schema.prisma`'s `Plan` model keeps `isActive Boolean?` / `sortOrder Int?` / `isEnterpriseCustom Boolean?` permanently — this is not a temporary or transitional state pending a future NOT-NULL migration; no such migration is planned or authorized. `PlatformPlansService.listPlans()`'s query and every `Plan`-creating script outside the service are corrected as described above. The Phase 6 W1 backfill script remains part of the accepted design (not removed, not superseded) — see the accompanying W1 corrective-fix report for its verified idempotency. |
| **Affected phase(s)** | **Phase 6** (wave W1 — `Plan` schema only). No bearing on Phase 6 W2 (entitlement enforcement) or Phase 7 (billing/subscription lifecycle). |
| **Reversibility** | Reversible in principle via a future, separately-authorized `NOT NULL`/`DEFAULT` migration on `plans` if G-19 is ever formally extended for that shape (not requested here) — until then, this nullable-column design is the permanent, accepted shape, not a placeholder. |
| **Explicit approval wording (recorded)** | `"C — formally ratify the nullable/no-default Plan schema deviation, AND apply the corrective fixes identified by verification. This is NOT permission to weaken or bypass G-19."` (Atharva — Project & Architecture Owner, 2026-09-12, in response to the read-only G-19 deviation verification's findings). |

### P6-D1 — Decision Log

| Date | Owner | Choice | Approval wording (verbatim) | Reference |
|---|---|---|---|---|
| 2026-09-12 | Atharva — Project & Architecture Owner | **Mechanism approved mid-implementation (structured choice; not persisted at the time)** | `AskUserQuestion` option selected: "Nullable columns + backfill + app-level default (Recommended)" | This session's Phase 6 W1 implementation turn |
| 2026-09-12 | Atharva — Project & Architecture Owner | **RESOLVED — RATIFIED, option C, plus corrective fixes** | `"C — formally ratify the nullable/no-default Plan schema deviation, AND apply the corrective fixes identified by verification. This is NOT permission to weaken or bypass G-19."` | This record; "PHASE 6 W1 — G-19 FORMALIZATION + CORRECTIVE FIX REPORT" |

---

## P6-D2 — `EntitlementService.resolve()` public contract: limit shape (`{value, period}`) and missing-`PlanLimit` semantics (`value: 0`)

| Field | Content |
|---|---|
| **ID** | P6-D2 |
| **Owner** | Architecture owner (Atharva — Project & Architecture Owner) |
| **Date** | 2026-09-12 |
| **Status** | **RESOLVED — RATIFIED (implemented)** |
| **Decision (question)** | Phase 6 W2's implementation of `EntitlementService.resolve(tenantId)` surfaced two contract-level judgment calls not literally pinned in the Design Ratification's own example shape, and flagged explicitly rather than silently treated as settled (per the W2 authorization's own §16): (1) the ratified design's literal example describes `limits` as `{ [limitKey]: number \| null }`, but Phase 6 W2 §9 separately requires that `PlanLimit.period` be "resolved and exposed" — a bare number cannot carry both a value and a period. What is the canonical shape? (2) When a catalogue `limitKey` has no `PlanLimit` row at all for the effective plan, should it resolve to `0` (denied) or `null` (unlimited) — given `PlanLimit.limitValue: NULL` on an EXISTING row already means unlimited, would resolving a MISSING row to `null` too collapse two structurally different states into the same observable value? |
| **Decision (approved)** | **Both of W2's own implemented choices are ratified as the canonical, authoritative contract for W3 onward — no code change required.** (1) **Limit shape**: `EntitlementResolution.limits: Record<LimitKey, { value: number \| null; period: LimitPeriod }>` — `value` is the finite configured limit, or `null` for unlimited; `period` is the resolved `PlanLimit.period` (`PERSISTENT` or `BILLING_PERIOD`, preserved exactly, never simplified back to a bare number). (2) **Missing `PlanLimit`**: resolves to `value: 0` with the catalogue-defined `LimitPeriod` for that key — deny-by-default, never `null`. The two states remain permanently distinct: `PlanLimit` row exists with `limitValue: NULL` → unlimited (`value: null`); `PlanLimit` row does not exist at all → denied (`value: 0`). Never conflated. |
| **Explicitly NOT introduced** | No new architecture exception. No change to G-19 (this record touches no migration, no `migration-safety.spec.ts`). No database schema change (`PlanLimit`/`Plan`/`TenantEntitlementOverride` are unmodified — this is a *service contract* ratification, not a schema one). No change to `Subscription`, no enforcement logic, no `Usage`, no HTTP API — none of those were ever part of what this record resolves. |
| **Rationale** | Owner's explicit ratification of both choices exactly as W2 implemented and flagged them ("PHASE 6 W2 — ENTITLEMENT ENGINE IMPLEMENTATION REPORT" §4/§9, and the follow-up "PHASE 6 W2 — CONTRACT RATIFICATION" instruction). (1) is the only shape that can satisfy Phase 6 W2 §9's own explicit period-exposure requirement without contradicting the literal example — an unavoidable, reasoned extension, not an arbitrary one. (2) preserves a real, meaningful distinction already present in the underlying data (a row that exists and says "no limit" vs. a row that was never configured at all) and keeps the engine's "fail closed everywhere" invariant intact — a missing entitlement must never silently become the single most permissive possible value. |
| **Security impact** | None negative — (2) is strictly a fail-closed choice (the alternative, defaulting missing limits to unlimited, would have been the fail-*open* direction). Neither decision touches authorization, tenant isolation, or any guard. |
| **Data / migration impact** | None. Zero schema change; zero migration; `PlanLimit`/`Plan` rows are read exactly as W1 left them. |
| **Implementation status** | Already implemented in `backend/src/entitlements/entitlement.service.ts`/`entitlement.types.ts` (Phase 6 W2, same day) — this record is the formal ratification of code that already exists and was already tested; no code change accompanies this record. One additional regression test was added (`entitlement.service.spec.ts` — a single test placing a missing-row limit and an explicit-NULL-row limit side by side on the same plan, asserting both the correct distinct values AND that neither equals the other) to make the non-conflation requirement mechanically unbreakable going forward, per this record's own "do not conflate these states" instruction. |
| **Source document / section** | "PHASE 6 W2 — ENTITLEMENT ENGINE IMPLEMENTATION REPORT" §4, §9, §22 (where both were first flagged); `backend/src/entitlements/entitlement.types.ts`; `backend/src/entitlements/entitlement.service.ts` (`resolvePlanLimits`, `denyByDefaultLimits`). |
| **Consequences** | `EntitlementResolution`'s limit shape and missing-row semantics are now authoritative for every later consumer — W3 (Usage/enforcement), W6 (`GET /admin/entitlements` and friends), and any future caller MUST consume `{value, period}` per limit key and MUST treat a denied limit (`value: 0`) as distinct from an explicitly unlimited one (`value: null`). Neither may be silently reinterpreted or simplified without a new, equally explicit decision record. |
| **Affected phase(s)** | **Phase 6** (W2's own public contract). Binding on W3 onward and on W6's eventual HTTP surface; no bearing on Phase 7 billing/subscription-lifecycle mutation. |
| **Reversibility** | Reversible via a future, separately-authorized decision record if a later wave finds a concrete need to change the shape — until then, this is the permanent contract, not a placeholder. |
| **Explicit approval wording (recorded)** | `"RATIFY: The canonical EntitlementResolution contract SHALL be: features: Record<FeatureKey, boolean>; limits: Record<LimitKey, { value: number \| null, period: LimitPeriod }>… Do not simplify this back to a bare number."` and `"RATIFY: A missing PlanLimit row SHALL resolve to: value: 0, with the catalogue-defined LimitPeriod for that limit key… PlanLimit exists + limitValue = NULL → unlimited; PlanLimit missing → 0 / denied. Do not conflate these states."` (Atharva — Project & Architecture Owner, 2026-09-12, "PHASE 6 — W2 CONTRACT RATIFICATION"). |

### P6-D2 — Decision Log

| Date | Owner | Choice | Approval wording (verbatim) | Reference |
|---|---|---|---|---|
| 2026-09-12 | Atharva — Project & Architecture Owner | **Both choices implemented mid-W2, flagged as not-yet-ratified** | "PHASE 6 W2 — ENTITLEMENT ENGINE IMPLEMENTATION REPORT" §4/§9/§22, `W2 STATUS: PASS WITH NOTES` | This session's Phase 6 W2 implementation turn |
| 2026-09-12 | Atharva — Project & Architecture Owner | **RESOLVED — RATIFIED, both decisions, authoritative for W3 onward** | `"RATIFY: The canonical EntitlementResolution contract SHALL be… Do not simplify this back to a bare number."` / `"RATIFY: A missing PlanLimit row SHALL resolve to: value: 0… Do not conflate these states."` | This record; "PHASE 6 W2 — CONTRACT RATIFICATION REPORT" |

---

## P6-D3 — `UsageService` unlimited-tracking contract (RATIFIED) + `orders_per_month` billing-period identity (DEFERRED — Phase 7 dependency)

| Field | Content |
|---|---|
| **ID** | P6-D3 |
| **Owner** | Architecture owner (Atharva — Project & Architecture Owner) |
| **Date** | 2026-09-12 |
| **Status** | **PART A: RESOLVED — RATIFIED (implemented). PART B: RECORDED — DEFERRED (Phase 7 dependency, not resolved, not implemented).** |
| **Decision (question)** | Phase 6 W3's `UsageService` implementation surfaced two contract-level questions, both flagged explicitly rather than silently settled (per the W3 authorization's own §9/§4): (A) when a `PlanLimit` row exists with `limitValue: NULL` (unlimited, per P6-D2's own ratified distinction from a *missing* row), should the `Usage` engine still track consumption, or skip tracking entirely since there is no limit to enforce? (B) `orders_per_month` is the sole `BILLING_PERIOD`-classified limit key — what string should identify "the current billing period" for its `Usage.period` column? |
| **Decision (approved) — PART A** | **RATIFIED.** When `PlanLimit` exists and `limitValue = NULL` (unlimited), `UsageService.reserve()` STILL creates/increments the `Usage` row — the reservation is unconditionally accepted (no limit ceiling to check against) but is never skipped. This is now the permanent, authoritative contract for every future caller (W5 enforcement, any later consumer), not a placeholder. The three-way distinction is now fully closed: finite `PlanLimit` → track + enforce; `PlanLimit` exists with `limitValue: NULL` → track, never reject on the limit; `PlanLimit` missing entirely → entitlement value `0` / denied (P6-D2, unchanged, unaffected by this record). `NULL` must never be reinterpreted as "skip Usage tracking." |
| **Decision (approved) — PART B** | **DEFERRED — recorded as an unresolved Phase 7 dependency, NOT ratified, NOT invented.** Phase 6 does not define or invent the billing-period identifier for `orders_per_month`. The authoritative billing-period identity remains a Phase 7 billing/subscription dependency and must be established before `orders_per_month` production usage enforcement is activated. `UsageService` remains fully period-string-agnostic (§ Consequences). This is explicitly NOT an architecture exception and NOT a substitute decision — it is a documented gap, held open. |
| **Explicitly NOT introduced / NOT authorized by this record** | No new G-19 exemption; `migration-safety.spec.ts` untouched. No database schema change — `Usage`/`Subscription`/`PlanLimit` are unmodified. No calendar-month (`YYYY-MM`) or any other billing-period derivation invented or authorized for production use. No billing rollover logic. No `currentPeriodStart`/`currentPeriodEnd` lifecycle management added. No billing events, billing provider integration, or Phase 7 work of any kind. The W3 test suite's use of an arbitrary example period string (e.g. `'2026-09'`) for `orders_per_month` is confirmed here to be a MECHANISM test only, proving the engine is period-format-agnostic — it is explicitly NOT the canonical production billing-period definition and must never be read as one. |
| **Rationale — Part A** | Owner's explicit ratification, exactly as W3 implemented and flagged it. `Usage` represents actual resource consumption independently of the tenant's current entitlement tier; continuing to track it under an unlimited plan prevents a loss of usage history and avoids a discontinuity if the tenant later moves to a finite-limit plan (the alternative — skipping tracking — would leave the `Usage` table silently incomplete for exactly the tenants a future downgrade would most need accurate data for). |
| **Rationale — Part B** | Owner's explicit instruction to record rather than resolve: the repository's verified current state (`currentPeriodEnd` never set anywhere; `currentPeriodStart` set once, by a seed script, never rolled over; no billing-cycle-length concept anywhere; Phase 7 not implemented) is genuinely insufficient to derive a safe, authoritative billing-period identifier without fabricating billing semantics — exactly the outcome the W3 authorization's own "STOP and report the ambiguity" instruction exists to prevent. |
| **Security impact** | None. Part A only affects which rows exist in `Usage` (data completeness), not any authorization path. Part B authorizes nothing and changes no code. |
| **Data / migration impact** | None. `Usage`, `Subscription`, and `PlanLimit` schemas are unmodified by this record. No migration created or authorized. |
| **Implementation status** | Part A: already implemented in `backend/src/usage/usage.service.ts` (`reserve()`'s `limit === null` branch) prior to this record — this record is the formal ratification of existing, tested code; one additional regression test was added (`test/e2e/usage-engine.e2e-spec.ts` — an unlimited reservation on top of a large pre-existing count, proving accumulation without artificial rejection) to make the ratified behavior mechanically explicit. Part B: no code exists and none was added — `usage-period.ts` explicitly declines to provide a billing-period-derivation helper, by design, and its own header comment now cites this record. |
| **Source document / section** | "PHASE 6 W3 — USAGE ENGINE + CAS IMPLEMENTATION REPORT" §5, §12, §28, §29 (where both were first flagged); `backend/src/usage/usage.service.ts` (`reserve()`); `backend/src/usage/usage-period.ts`. |
| **Consequences** | Part A is now binding on every future `UsageService` consumer — W5 enforcement and any later caller must rely on unlimited reservations always succeeding and always being tracked, never skipped. Part B means `orders_per_month` usage tracking/enforcement MUST NOT be activated in any real (non-test) capacity until a separate, later, explicitly-authorized decision establishes the authoritative billing-period identity — attempting to activate it beforehand (e.g., by informally picking a calendar-month convention) would be exactly the unauthorized architecture exception this record forbids. |
| **Affected phase(s)** | **Phase 6** (W3's own contract, Part A). **Phase 7** is the named owner of the Part B dependency — this record does not gate Phase 6 W4/W5 (neither wave needs the `orders_per_month` billing-period identity resolved to proceed with `products`/`team_members`/`storage_mb`/`custom_domains` enforcement). |
| **Reversibility** | Part A is reversible via a future, separately-authorized decision record if a concrete need to skip unlimited tracking is later found — until then, permanent. Part B is, by definition, not yet a decision to reverse — it will be superseded by whichever future record actually resolves it. |
| **Explicit approval wording (recorded)** | `"FORMALLY RATIFY: … PlanLimit.limitValue = NULL then the limit is UNLIMITED, but Usage SHALL STILL BE TRACKED. … Do not reinterpret NULL as 'skip Usage tracking.'"` and `"FORMALLY RECORD AS AN UNRESOLVED DEPENDENCY. Do NOT invent or ratify a billing-period identifier. … Phase 6 does not define or invent the billing-period identifier for orders_per_month. The authoritative billing-period identity remains a Phase 7 billing/subscription dependency…"` (Atharva — Project & Architecture Owner, 2026-09-12, "PHASE 6 — W3 CONTRACT RATIFICATION"). |

### P6-D3 — Decision Log

| Date | Owner | Choice | Approval wording (verbatim) | Reference |
|---|---|---|---|---|
| 2026-09-12 | Atharva — Project & Architecture Owner | **Both items implemented/investigated mid-W3, flagged as not-yet-ratified / genuinely unresolved** | "PHASE 6 W3 — USAGE ENGINE + CAS IMPLEMENTATION REPORT" §5/§12/§28/§29, `W3 STATUS: PASS WITH NOTES` | This session's Phase 6 W3 implementation turn |
| 2026-09-12 | Atharva — Project & Architecture Owner | **RESOLVED — Part A RATIFIED; Part B RECORDED AS DEFERRED (Phase 7 dependency)** | `"FORMALLY RATIFY: … Usage SHALL STILL BE TRACKED … Do not reinterpret NULL as 'skip Usage tracking.'"` / `"FORMALLY RECORD AS AN UNRESOLVED DEPENDENCY. Do NOT invent or ratify a billing-period identifier."` | This record; "PHASE 6 W3 — CONTRACT RATIFICATION REPORT" |

---

## P6-D4 — `storage_mb` bytes→MiB conversion policy (RATIFIED)

| Field | Content |
|---|---|
| **ID** | P6-D4 |
| **Owner** | Architecture owner (Atharva — Project & Architecture Owner) |
| **Date** | 2026-09-12 |
| **Status** | **RESOLVED — RATIFIED (implementation authorized)** |
| **Decision (question)** | Phase 6 W5's implementation identified that `storage_mb` (the sole byte-denominated limit key) has no ratified bytes→MiB conversion policy anywhere in this repository — a genuine gap distinct from `orders_per_month`'s billing-period dependency (P6-D3), flagged rather than silently decided (per the W5 report §9/§32). What is the canonical bytes→MiB conversion policy for `storage_mb`'s `Usage.count`? |
| **Decision (approved)** | **RATIFIED**, exactly as proposed and reviewed against existing convention: (1) **Unit**: 1 MiB = 1,048,576 bytes — matches the two existing precedents already in this codebase (`common/constants/app.constants.ts#UPLOAD_MAX_BYTES = 10 * 1024 * 1024`, documented as "10 MiB" in `docs/saas/PHASE-0-REPOSITORY-INVENTORY.md`; `products/customizations/customization-validation.service.ts`'s `maxFileSizeMb * 1024 * 1024` check) — not a new unit, an extension of one already in use. (2) **Conversion**: `amount = Math.ceil(bytes / 1_048_576)` — ceil, the conservative direction that never undercounts real storage consumed. (3) **Zero-byte file**: reserves `amount: 0` — no special-casing, uses `UsageService`'s already-ratified "amount: 0 is a valid, trivial reservation" contract (W3) as-is. (4) **`Usage.count` meaning for this key**: an integer count of whole MiB units, not raw bytes. |
| **Explicitly NOT introduced** | No new architecture exception. No change to G-19 (no migration accompanies this record). No database schema change — `Usage`/`PlanLimit`/`UploadedFile` are unmodified; `bytes` remains `UploadedFile`'s own stored column, `storage_mb` usage is derived from it at reservation time, never stored redundantly. No change to `orders_per_month`'s still-deferred (P6-D3) status, and no change to `custom_domains`'s still-deferred (no workflow exists) status — this record resolves `storage_mb` alone. |
| **Rationale** | Owner's explicit approval of the proposal exactly as presented in the prior turn's closure report, after confirming it does not conflict with any existing ratified decision and is consistent with (extends, does not invent) the codebase's own pre-existing MiB convention. Ceil (not floor or round) was the only direction consistent with a consumption-quota's own purpose — undercounting would let a tenant silently exceed the real byte ceiling a plan's `PlanLimit.limitValue` (itself MiB-denominated) is meant to enforce. |
| **Security impact** | None. Purely a counting/rounding convention; touches no authorization path, no tenant-scoping mechanism, no guard. |
| **Data / migration impact** | None. No schema or migration change — `UploadedFile.bytes` (already `Int`, already populated) is the sole authoritative byte source; the MiB conversion happens in application code at the moment of reservation, not as a stored/derived column. |
| **Implementation status** | Implemented this same turn in `backend/src/uploads/uploads.service.ts#create` — `LimitEnforcementService.assertLimit(tx, tenantId, 'storage_mb', Math.ceil(bytes / 1_048_576))` called immediately before `tx.uploadedFile.create(...)`, both inside one `prisma.$transaction`, composing with the same `LimitEnforcementService` W5 already established for `products`/`team_members`. See "PHASE 6 W5 — FINAL RATIFICATION / STORAGE IMPLEMENTATION REPORT" for the full test/regression evidence. |
| **Source document / section** | "PHASE 6 W5 — LIMIT ENFORCEMENT IMPLEMENTATION REPORT" §9/§32 (where first flagged); "W5 CLOSURE / RATIFICATION REPORT" §1-4 (the proposal); `backend/src/common/constants/app.constants.ts`; `backend/src/products/customizations/customization-validation.service.ts` (the pre-existing MiB precedent this record extends). |
| **Consequences** | `storage_mb` enforcement is now live at the actual upload boundary — every successful upload reserves `Math.ceil(bytes/1_048_576)` MiB of usage, atomically with the `UploadedFile` row's creation. This is now the authoritative, permanent contract for every future caller of `storage_mb` usage — not a placeholder. Deploying it still requires the Free plan (and any other live plan) to carry a real `storage_mb` `PlanLimit` row first (Part B of this same governance turn) — this record does not itself resolve that separate, business-owned gap. |
| **Affected phase(s)** | **Phase 6** (wave W5's `storage_mb` integration only). No bearing on `orders_per_month` (Phase 7 dependency, unchanged) or `custom_domains` (no workflow, unchanged). |
| **Reversibility** | Fully reversible — a future record could change the rounding direction or unit; existing `Usage` rows for `storage_mb` would need a one-time recomputation if the definition ever changed, but no such change is anticipated or authorized here. |
| **Explicit approval wording (recorded)** | `"I APPROVE THE FOLLOWING P6-D4 DECISION: … 1 MiB = 1,048,576 bytes; storage_mb Usage.count is denominated in whole MiB; amount = ceil(bytes / 1,048,576); zero-byte file reserves amount = 0; Usage.count remains an integer MiB counter; no database migration is required. This decision is now authorized for implementation."` (Atharva — Project & Architecture Owner, 2026-09-12, "PHASE 6 — W5 FINAL RATIFICATION + STORAGE IMPLEMENTATION AND FREE-PLAN CATALOGUE PREPARATION"). |

### P6-D4 — Decision Log

| Date | Owner | Choice | Approval wording (verbatim) | Reference |
|---|---|---|---|---|
| 2026-09-12 | Atharva — Project & Architecture Owner | **Proposed, not yet ratified** | "W5 CLOSURE / RATIFICATION REPORT" §2/§4 — proposal presented for review | This session's Phase 6 W5 closure turn |
| 2026-09-12 | Atharva — Project & Architecture Owner | **RESOLVED — RATIFIED, authorized for implementation** | `"I APPROVE THE FOLLOWING P6-D4 DECISION: … This decision is now authorized for implementation."` | This record; "PHASE 6 W5 — FINAL RATIFICATION / STORAGE IMPLEMENTATION REPORT" |

---

## P7-D1 — Phase 7 Stage 1 Subscription Architecture (RATIFIED)

First Phase 7 record in this register. Ratifies the vendor-independent architectural
design produced by the "PHASE 7 STAGE 1 DESIGN / RATIFICATION REPORT" audit — the
`Subscription` schema expansion shape, the 7-state transition matrix, CAS/idempotency
discipline, `SubscriptionEvent` semantics, the `orders_per_month` billing-period stamp
source, and the boundary between this work and still-open items (billing provider, D7,
grace/retention durations). No code, schema, or migration accompanies this record — it is
documentation-only, exactly as authorized ("PHASE 7 — STAGE 1 RATIFICATION GATE … MODE:
DOCUMENTATION ONLY").

| Field | Content |
|---|---|
| **ID** | P7-D1 |
| **Owner** | Architecture owner (Atharva — Project & Architecture Owner) |
| **Date** | 2026-09-12 |
| **Status** | **RESOLVED — RATIFIED (design only; no implementation authorized by this record)** |
| **Decision (question)** | The "PHASE 7 STAGE 1 DESIGN / RATIFICATION REPORT" (this session's prior turn) identified a `SubscriptionStateMachine`/`Subscription` schema design with 10 marked `DECISION REQUIRED` items. Which of these are now ratified as Phase 7 Stage 1's authoritative design, and which remain genuinely open? |
| **Decision (approved)** | **RATIFIED, Parts A–I below.** |
| | **Part A — `Subscription.pendingPlanId`.** `pendingPlanId` references `Plan` (same target model as the existing `planId` FK) via an **explicit, distinctly-named Prisma relation** (`Subscription` already has one `Plan` relation via `planId`; Prisma requires two named relations when a model has more than one FK to the same target). Deletion behavior is **restrictive**: a `Plan` referenced by any `Subscription.pendingPlanId` must never be hard-deletable, identical in spirit to `planId`'s own existing `onDelete: Restrict` and to the W7-ratified plan-lifecycle invariant ("a Plan that has ever been referenced by Subscription must not be hard-deleted"). Archiving (`Plan.isActive = false`) remains the sole lifecycle mechanism for retiring a plan; no second deletion policy is introduced. |
| | **Part B — Subscription State Machine.** Exactly the existing 7-value `SubscriptionStatus` enum is ratified as complete and closed: `PENDING, TRIALING, ACTIVE, PAST_DUE, PAUSED, CANCELLED, EXPIRED` — no 8th state, ever. `EXPIRED` is ratified as **terminal — no outgoing transition of any kind**. Transitions are governed by an explicit allowlist (mirroring `order-state-machine.ts`'s `Record<Status, Status[]>` pattern) — an edge not on the list is rejected, never silently allowed. A same-state "transition" (`current === target`) is an idempotent no-op, matching `OrdersService.adminTransitionStatus`'s own `if (order.status === dto.status) return …` convention. Status mutation uses the same CAS discipline as the order state machine (`UPDATE … WHERE id=$id AND status=$currentStatus`; zero rows affected = a safe no-op, a lost race, never an error). Every state mutation and its corresponding `SubscriptionEvent` insert commit in the **same** database transaction — never written separately, never one without the other. **Ratified transition matrix** (edges not listed here are rejected by the allowlist): `PENDING → TRIALING` or `PENDING → ACTIVE` (only after confirmed billing/subscription creation, never optimistic); `TRIALING → ACTIVE` (only after confirmed billing completion); `TRIALING → PAST_DUE` (failed conversion/payment failure); `ACTIVE → ACTIVE` (confirmed immediate upgrade — `planId` changes, `status` does not); `ACTIVE → ACTIVE` (downgrade scheduling — `pendingPlanId` is set, `planId`/`status` unchanged); `ACTIVE → ACTIVE` (pending plan applied at the confirmed period boundary — `planId := pendingPlanId`, `pendingPlanId` cleared); `ACTIVE → PAST_DUE` (renewal payment failure); `PAST_DUE → ACTIVE` (confirmed payment recovery only — never optimistic); `PAST_DUE → PAUSED` (grace exhaustion); `PAST_DUE → CANCELLED` (allowed); `PAUSED → ACTIVE` (confirmed payment/recovery only); `PAUSED → CANCELLED` (allowed); `PAUSED → EXPIRED` (allowed, gated on the future retention policy — duration itself is Part C/unresolved, see below); `CANCELLED → ACTIVE` (allowed before expiry, confirmed reactivation/billing only — never optimistic); `CANCELLED → EXPIRED` (after retention — duration itself unresolved, see Part D); `EXPIRED → ` *(nothing — terminal)*. |
| | **Part C — Grace period.** Phase 7 implementation **must not hardcode** a specific grace-period duration into business logic. `graceEndsAt` (the proposed `Subscription` field) is the authoritative signal for whether a grace period is currently active — code checks `now()` against the stored `graceEndsAt` value, never a recomputed/assumed duration. The actual duration is **configuration/decision-driven**, ratified separately, later — never silently invented as a number of days during implementation. |
| | **Part D — Cancellation retention.** Phase 7 implementation **must not hardcode** an arbitrary cancellation-retention duration. `CANCELLED` retains all tenant data unconditionally. `EXPIRED` is the terminal lifecycle state reached only after whatever retention policy is eventually ratified. The actual duration remains configuration/decision-driven until explicitly finalized (see Decisions Required, below). Building the state machine itself must never introduce automatic destructive data deletion — `CANCELLED`/`EXPIRED` are status values only; no code path this record ratifies deletes a `Product`/`Coupon`/`TenantMembership`/`UploadedFile`/or any other tenant row. |
| | **Part E — `orders_per_month` `Usage.period`.** For the sole `BILLING_PERIOD`-classified limit key, `Usage.period` **must** be a stable identifier **derived from the provider-confirmed `Subscription.currentPeriodStart`** — never from a calendar month, never from a local timezone boundary, never from `createdAt` arithmetic, never cron-computed. The **canonical Phase 7 representation is the ISO-8601 timestamp string of `currentPeriodStart`** at the moment it was last set by a confirmed provider event. Provider-confirmed period boundaries are the sole authority for when this value changes. A historical `Usage` row keeps the period identifier it was written under permanently — a later rollover starts a new row under the new identifier, never rewrites the old one. This record exists specifically to unblock Phase 7's eventual completion of the `orders_per_month` semantics P6-D3 Part B left deferred; it does not itself activate `orders_per_month` enforcement, which remains separate, later, explicitly-authorized implementation work. |
| | **Part F — `SubscriptionEvent.providerEventId`.** **Not unique.** Provider-event deduplication belongs to the future `BillingWebhookEvent` boundary (Part H), never to `SubscriptionEvent`. `SubscriptionEvent` is append-only **domain history** (what happened to this subscription and why) — it is never used as, and never doubles as, the provider-webhook idempotency/deduplication store. |
| | **Part G — Billing provider.** The production SaaS billing provider **remains UNDECIDED** at this stage. Phase 7 Stage 1 is, and must remain, entirely vendor-independent. `FakeBillingProvider` (mirroring the existing `FakeCloudinaryService` pattern) is the ratified deterministic test double for all Stage 1 state-machine testing. Razorpay, Stripe, Paddle, Chargebee, or any other vendor is explicitly **not** selected as the SaaS subscription provider by this record or by any prior one — a separate, explicit decision is required before any real adapter is built. The pre-existing merchant Razorpay integration (`src/payments/razorpay/`, Orders API, one-time commerce payments) is explicitly **not** evidence of, and must never be treated as, a SaaS-subscription-billing vendor decision — it is a structurally different product (one-time Orders API, not the Subscriptions API) serving a structurally different relationship (customer → merchant, not tenant → PrintForge). |
| | **Part H — Webhook boundary.** **D7 ("`WebhookEvent` split") remains formally OPEN** — this record does not ratify it and does not treat it as resolved. Phase 7 SaaS billing webhooks must remain conceptually separate from merchant commerce webhooks regardless of D7's eventual resolution; the existence of the mature merchant `webhook-processor.service.ts`/`WebhookEvent` infrastructure is not, by itself, license to collapse the two domains into one table or one processor. Stage 1 may define the *interface/contract* a future billing-webhook processor will call into (i.e., `SubscriptionStateMachine`'s own transition API, already provider-delivery-mechanism-agnostic by design) without building or ratifying the `BillingWebhookEvent` table itself — that remains a distinct, later Phase 7 design/implementation decision, gated on D7. |
| | **Part I — Entitlement integration.** `EntitlementService` (Phase 6 W2) remains the **sole** entitlement resolution authority — this record introduces, and Phase 7 Stage 1 must introduce, **no entitlement cache of any kind** (confirmed: `resolve()` is request-scoped, re-reads Postgres on every call, and therefore needs no invalidation mechanism when `Subscription` changes). Every `Subscription` state/plan mutation flows through the existing entitlement resolution model exactly as-is — no duplicated feature/limit/override logic anywhere in `billing/`. Under the **currently ratified interim semantics** (Phase 6 W2 authorization §5, unchanged by this record): `PAST_DUE` continues to resolve the tenant's **full** assigned-plan entitlement; `PAUSED`, `CANCELLED`, and `EXPIRED` fall back to the free-plan entitlement, identically to every other non-full-plan status already handled by `EntitlementService.resolveEffectivePlanId()`. This record does not redesign, extend, or reopen any part of the Phase 6 entitlement architecture. |
| **Explicitly NOT introduced** | No Prisma schema change (no migration accompanies this record). No `SubscriptionStateMachine`, `SubscriptionService`, `BillingProvider`, `FakeBillingProvider`, or webhook code. No change to `EntitlementService`. No frontend change. No test change. No billing-provider vendor selection. No concrete grace-period or cancellation-retention duration. No resolution of D7. No resolution of the missing "Handbook §7" transition table beyond what is explicitly ratified in Part B above (the DR edges the prior audit could not derive — trial-failure→terminal routing beyond `PAST_DUE`, whether `PAUSED`'s only exits are the three listed, whether an indefinitely-`PAUSED` subscription without cancellation also eventually expires — remain open exactly as before; only the edges explicitly listed in Part B are ratified). |
| **Rationale** | The prior design audit ("PHASE 7 STAGE 1 DESIGN / RATIFICATION REPORT") separated what the authoritative master plan (§13) and this codebase's existing `order-state-machine.ts` precedent already fully determine (state list, CAS mechanism, non-optimistic-upgrade rule, non-destructive-downgrade rule, append-only event history, no-cache entitlement integration) from what genuinely required a business/architecture decision this codebase could not derive on its own (durations, vendor, D7). This record ratifies the former in full and explicitly declines to invent the latter, preserving the same "flag, never silently decide" discipline every prior P6-Dn record in this register already established. |
| **Security impact** | None directly — this is a documentation-only record. Design-level: tenant identity for any future subscription mutation remains server-derived (existing `TenantContext` mechanism), never accepted from body/query/param/header; platform visibility uses the existing `PlatformGuard`/`SUPER_ADMIN` mechanism; no new role or permission is introduced or implied anywhere in this record. |
| **Data / migration impact** | None. No schema or migration change. The proposed additive `Subscription` columns (`providerCustomerId?`, `providerSubscriptionId?`, `cancelAtPeriodEnd`, `trialEndsAt?`, `pendingPlanId?`, `graceEndsAt?`, `updatedAt`) and the proposed `SubscriptionEvent` table remain **proposed only** — reported in the prior audit, not created, not applied. |
| **Implementation status** | **Not implemented.** This is a design/ratification record only, per explicit instruction ("MODE: DOCUMENTATION ONLY — NO IMPLEMENTATION"). The actual schema migration, `SubscriptionStateMachine`, `SubscriptionService`, `BillingProvider`/`FakeBillingProvider`, and vendor-independent E2E suite remain separate, later, explicitly-authorized implementation work per the prior audit's own §18 recommended sequence. |
| **Source document / section** | "PHASE 7 READINESS AUDIT" (this session, prior turn); "PHASE 7 STAGE 1 DESIGN / RATIFICATION REPORT" §3–§12, §17 (this session, prior turn) — the design this record ratifies; `backend/src/orders/state-machine/order-state-machine.ts` + `backend/src/orders/order-lifecycle.util.ts` + `OrdersService.transitionOrderWithHistory`/`adminTransitionStatus` (the CAS/transaction pattern Part B is modeled on); Master Plan §13 "Phase 7 — SaaS Subscription/Billing" (the authoritative source for the ratified transition edges and schema field list). |
| **Consequences** | Phase 7 Stage 1 implementation (schema migration, `SubscriptionStateMachine`, `SubscriptionEvent`, `SubscriptionService`, `BillingProvider`/`FakeBillingProvider`) may now proceed against a ratified design rather than an audited proposal, once separately authorized. `orders_per_month` enforcement remains blocked on that separate implementation work (Part E only fixes the *stamp format* decision, not the enforcement wiring itself). Billing-provider-dependent work (real adapter, real webhooks, `SaasInvoice`, `PaymentMethod`) remains blocked on Part G/H's still-open items. |
| **Affected phase(s)** | **Phase 7** (Stage 1 design only). No bearing on Phase 6 (W1–W8 remain unchanged and unreopened) or Phase 8+. |
| **Reversibility** | Fully reversible — this is a design ratification with zero code/schema footprint; a future record can amend any Part above (e.g., resolve a DR transition edge, pick a different `pendingPlanId` deletion policy) without needing to unwind any implementation, since none exists yet. |
| **Explicit approval wording (recorded)** | `"PHASE 7 — STAGE 1 RATIFICATION GATE … Record the following decisions clearly in docs/saas/DECISIONS.md."` followed by the itemized Parts 1–9 exactly as ratified above (pendingPlanId/Plan relation + restrictive deletion; the 7-state matrix incl. "EXPIRED is terminal … No transition out of EXPIRED"; "Phase 7 must NOT hardcode a specific grace-period duration"; "Phase 7 must NOT hardcode an arbitrary cancellation-retention duration"; "Usage.period must use a stable identifier derived from the provider-confirmed Subscription.currentPeriodStart … the canonical Phase 7 representation is the ISO timestamp of currentPeriodStart"; "SubscriptionEvent.providerEventId is NOT unique … Provider-event deduplication belongs to the future BillingWebhookEvent boundary"; "The production billing provider remains UNDECIDED at this stage … Use FakeBillingProvider as the deterministic test double"; "D7 webhook split remains OPEN … Do not collapse the two webhook domains"; "EntitlementService remains the sole entitlement authority. No entitlement cache is introduced … PAST_DUE continues to receive the full plan entitlement … PAUSED, CANCELLED, and EXPIRED fall back to the free-plan entitlement"), together with the explicit instruction to "Record unresolved items separately rather than pretending they are decided" (Atharva — Project & Architecture Owner, 2026-09-12, "PHASE 7 — STAGE 1 RATIFICATION GATE"). |

### P7-D1 — Decision Log

| Date | Owner | Choice | Approval wording (verbatim) | Reference |
|---|---|---|---|---|
| 2026-09-12 | Atharva — Project & Architecture Owner | **Audited, proposed, not yet ratified** | "PHASE 7 STAGE 1 DESIGN / RATIFICATION REPORT" — design proposed, 10 items marked DECISION REQUIRED | This session's Phase 7 Stage 1 design turn |
| 2026-09-12 | Atharva — Project & Architecture Owner | **RESOLVED — RATIFIED (Parts A–I); billing provider, D7, grace duration, and retention duration explicitly left OPEN** | `"PHASE 7 — STAGE 1 RATIFICATION GATE … Record the following decisions clearly … Record unresolved items separately rather than pretending they are decided."` | This record; "PHASE 7 — STAGE 1 RATIFICATION GATE" instruction |

### P7-D1 — Amendment Note (added 2026-09-12, via P7-D2)

**P7-D1 Part B's transition matrix is amended by P7-D2 Part B (2026-09-12): `ACTIVE → CANCELLED` is now a ratified edge** (immediate tenant-requested cancellation — provider-confirmed only, non-destructive, `SubscriptionEvent`-recorded, entitlement fallback per existing Phase 6/P7-D1 Part I semantics). This note is a pure addition — no text in the original P7-D1 record above is modified, struck through, or deleted, per this file's own append-only rule ("Do not overwrite history — append"). See P7-D2, below, for the complete amendment and its full requirements.

### P7-D1 — Unresolved Items (explicitly recorded, NOT decided by this record)

| Item | Status | Notes |
|---|---|---|
| Production SaaS billing provider selection | **OPEN** | Razorpay/Stripe/Paddle/Chargebee/other — a separate, explicit, later decision. Existing merchant Razorpay use is not evidence of this choice (Part G). |
| Exact grace-period duration (`graceEndsAt` offset) | **OPEN** | Configuration/decision-driven; not a number of days chosen here (Part C). |
| Exact cancellation-retention duration (`CANCELLED → EXPIRED` window) | **OPEN** | Configuration/decision-driven; not chosen here (Part D). |
| D7 — `WebhookEvent` split implementation details | **OPEN** | D7 itself remains OPEN in this register (stub table, below); the `BillingWebhookEvent` table/processor design is not ratified by this record (Part H). |
| Five DR transition edges the prior audit could not derive beyond what Part B explicitly lists (e.g., trial-failure routing beyond `PAST_DUE`, whether `PAUSED`'s only exits are the three ratified, `EXPIRED`'s absolute terminality beyond "no transition") | **OPEN** | Only the edges explicitly enumerated in Part B are ratified; anything not listed there is still DECISION REQUIRED, not silently assumed. |

---

## P7-D2 — Phase 7 Stage 2 Subscription Operations Decisions (RATIFIED)

Second Phase 7 record in this register. Ratifies seven Stage 2 architectural/business decisions
identified as "DECISION REQUIRED" by the "PHASE 7 — STAGE 2 DESIGN / READINESS AUDIT" (this
session's prior turn, verdict: READY WITH DECISIONS REQUIRED) — the tenant subscription-mutation
permission, an amendment to P7-D1's transition matrix (`ACTIVE → CANCELLED`), a new cancel-at-
period-end operation, downgrade provider-call timing, provider-timeout/ambiguous-success
handling, the period-rollover/reconciliation ownership boundary, and the `BillingProvider` DI
wiring approach. No code, schema, or migration accompanies this record — documentation-only,
exactly as authorized ("PHASE 7 — STAGE 2 RATIFICATION GATE … MODE: DOCUMENTATION ONLY").

| Field | Content |
|---|---|
| **ID** | P7-D2 |
| **Owner** | Architecture owner (Atharva — Project & Architecture Owner) |
| **Date** | 2026-09-12 |
| **Status** | **RESOLVED — RATIFIED (design only; no implementation authorized by this record)** |
| **Decision (question)** | The "PHASE 7 — STAGE 2 DESIGN / READINESS AUDIT" (this session's prior turn) classified Stage 2 as READY WITH DECISIONS REQUIRED and listed 7 concrete decisions blocking implementation. Which of these are now ratified as Phase 7 Stage 2's authoritative design? |
| **Decision (approved)** | **RATIFIED, Parts A–G below.** |
| | **Part A — Tenant subscription mutation permission.** A new tenant permission, `billing:manage`, is added to the ratified permission catalogue (`PERMISSIONS` in `src/auth/permissions/permission.ts`, G-13) to authorize tenant-initiated SaaS subscription mutations: upgrade, downgrade, cancellation, and resume/reactivation where applicable. `dashboard:read`/`settings:write` are NOT reused for this purpose — a distinct permission is ratified instead, following the same G-13 governance pattern (explicit catalogue ratification, not silent reuse of an existing entry for a semantically different purpose). `billing:manage` is NOT granted to `CUSTOMER` — `CUSTOMER` is not even a `TenantRole` value in this codebase's `ROLE_PERMISSIONS` map (`OWNER`/`ADMIN`/`STAFF`/`VIEWER` only), and this record does not introduce one; which of the existing tenant roles receive the grant is an implementation-time `ROLE_PERMISSIONS` edit, not decided further by this record beyond "not `CUSTOMER`". This record ratifies the permission's existence and purpose only — no source file is modified by this documentation-only record. |
| | **Part B — `ACTIVE → CANCELLED` (immediate cancellation) — AMENDS P7-D1 Part B.** `ACTIVE → CANCELLED` is now a ratified edge in the `SubscriptionStatus` transition matrix, representing an immediate tenant-requested cancellation. This is an **intentional, explicit amendment to P7-D1 Part B's transition matrix**, which did not include this edge (P7-D1 ratified only `PAST_DUE → CANCELLED` and `PAUSED → CANCELLED`). P7-D1's own text is preserved unmodified elsewhere in this register (append-only discipline) — see the Amendment Note appended to the P7-D1 record itself, above. Requirements ratified for this edge: (1) provider cancellation must be CONFIRMED before the authoritative local `CANCELLED` transition is applied — never optimistic, identical in spirit to every other confirmed-only edge P7-D1 already established; (2) all tenant data is retained — no destructive deletion of any kind; (3) a `SubscriptionEvent` (`type: cancelled`) is written, in the same transaction as the status mutation, per the existing CAS/event discipline; (4) entitlement resolution falls back per the EXISTING Phase 6 W2 / P7-D1 Part I semantics — `CANCELLED` resolves the free-plan entitlement, unchanged, no new entitlement rule introduced; (5) `EXPIRED` remains terminal — this amendment adds no new outgoing edge from `EXPIRED`. |
| | **Part C — Cancel at period end (`scheduleCancellation`).** A new Stage 2 `SubscriptionService` operation, `scheduleCancellation()`, is ratified (design only — not implemented by this record), mirroring `scheduleDowngrade()`'s existing pattern. Semantics: the provider receives the cancellation request with `mode = at_period_end`; the local subscription remains `ACTIVE`; `cancelAtPeriodEnd` becomes `true`; there is no immediate entitlement reduction and no immediate transition to `CANCELLED`; the actual `ACTIVE → CANCELLED` transition (Part B's edge) is applied only at the confirmed provider period boundary; a `SubscriptionEvent` records each lifecycle change (the scheduling itself, and later the applied cancellation). Idempotency: a repeat `scheduleCancellation()` request while cancellation is already scheduled is a safe no-op — no duplicate state mutation, no duplicate event, matching every other Stage 1 method's own idempotent-if-already-at-target-state convention. **Un-scheduling explicitly deferred, not silently invented**: if a tenant wants to resume/cancel a scheduled cancellation before the period ends, that reversal operation (e.g. an `unscheduleCancellation()`/equivalent method, and its own permission/API surface) is NOT designed or named by this record — it must be explicitly represented by a future state-machine/service contract change, separately authorized. This record ratifies only the forward (schedule → apply) path. |
| | **Part D — Downgrade provider timing.** When a tenant requests a downgrade, the ratified Stage 2 sequence is: (1) authorize the tenant; (2) call `BillingProvider.changeSubscription(providerSubscriptionId, newPlanRef, mode: 'at_period_end')`; (3) require PROVIDER ACCEPTANCE of the scheduling request before any local persistence; (4) only then persist `pendingPlanId` (via `scheduleDowngrade`); (5) the current plan remains fully active/entitled until the confirmed period boundary; (6) at the confirmed boundary, `applyScheduledDowngrade` applies `pendingPlanId`. This settles Stage 2's own prior open question (raised by the "PHASE 7 — STAGE 2 DESIGN / READINESS AUDIT" §8/§16 decision #4) in favor of calling the provider AT REQUEST TIME, not deferred to the boundary — the rationale being that the provider must receive the at-period-end instruction when the downgrade is requested, because waiting risks the provider renewing the existing plan before the downgrade is ever registered with it. This is a decision about Stage 2's own orchestration-layer timing, NOT an amendment to P7-D1 (P7-D1 Part B's `ACTIVE → ACTIVE` downgrade-scheduling edge, and its own §6 framing that "no provider confirmation is required to SCHEDULE a downgrade" for the LOCAL state machine's CAS purposes, is unchanged — `SubscriptionService.scheduleDowngrade()` still takes no `providerEventId`). `planId` remains unchanged — this is explicitly NOT an optimistic plan change — until the confirmed period boundary is reached and `applyScheduledDowngrade` runs. |
| | **Part E — Provider timeout / ambiguous success.** If a provider operation times out after the request may have already succeeded on the provider's side, Stage 2 orchestration must NOT immediately mutate authoritative local subscription state. Instead: perform a `BillingProvider.getSubscription()` reconciliation read; compare the provider-confirmed state against the requested operation; only apply the corresponding `SubscriptionService` confirmation method (e.g. `confirmUpgrade`/`confirmActivation`/`cancel`) once the provider state is SUFFICIENTLY CONFIRMED to justify it. If reconciliation cannot establish the result (the provider itself is ambiguous/unreachable), the orchestration layer returns an explicit, recoverable error to the caller — it does not blindly retry a potentially-already-successful provider mutation (which risks a double-charge/double-change on the vendor side). This record does NOT invent vendor-specific idempotency semantics (e.g., assuming any particular vendor's own idempotency-key behavior) — provider-specific idempotency behavior remains an adapter concern, deferred to whichever vendor is eventually chosen (P7-D1 Part G, still OPEN). |
| | **Part F — Period rollover / reconciliation home.** Stage 2 owns the CALLABLE orchestration/reconciliation operation (i.e., a method that, given a subscription, performs the provider-confirmed-boundary check and applies `applyScheduledDowngrade`/the new Part C cancellation-application/period-refresh as appropriate). Stage 2 does NOT own the scheduler/cron that invokes it periodically — a later Phase 7 implementation wave will invoke this reconciliation/period-rollover operation through the repository's approved scheduling mechanism (the existing `@Cron`-based pattern `WebhookProcessor`/`PaymentReconciliationService` already use, per master plan §13's `billing-reconciliation` cron — not built by this record). Stage 2 introduces NO Redis, NO queues, NO workers, and no other background infrastructure. Provider-confirmed period boundaries remain the sole authority for when a rollover/cancellation-application/downgrade-application occurs, unchanged from P7-D1 Part E's own framing. |
| | **Part G — `BillingProvider` DI wiring.** Stage 2 will bind `BillingProvider → FakeBillingProvider` through an explicit DI token/provider abstraction (e.g. a NestJS custom-provider token such as `BILLING_PROVIDER`), the same substitution point a real vendor adapter will occupy once chosen. This binding exists SOLELY to make the vendor-independent Stage 2 orchestration executable and testable — it is explicitly NOT a selection of `FakeBillingProvider` (or any vendor) as the production billing provider, and must never be read as resolving P7-D1 Part G. A future real provider adapter replaces this binding after the production vendor decision is separately ratified; no source file is modified by this record to create the binding itself (design-only). |
| **Explicitly NOT introduced** | No Prisma schema change. No source code, controller, module-wiring, or `BillingProvider` implementation change. No production billing-provider selection (P7-D1 Part G remains OPEN). No resolution of D7/`BillingWebhookEvent`. No exact grace-period or cancellation-retention duration (P7-D1 Parts C/D remain OPEN). No real webhook payload/provider contract. No resolution of any transition-matrix edge beyond the single `ACTIVE → CANCELLED` addition in Part B — the remaining DR edges P7-D1's own Unresolved Items table already lists (trial-failure routing beyond `PAST_DUE`, whether `PAUSED`'s only exits are the three already ratified, `EXPIRED`'s terminality beyond "no transition") remain exactly as open as P7-D1 left them. No `scheduleCancellation()`/DI-binding/permission-catalogue code is written by this record. |
| **Rationale** | The "PHASE 7 — STAGE 2 DESIGN / READINESS AUDIT" separated what Stage 1's existing architecture and the authoritative master plan (§13) already determine from what genuinely required a business/architecture decision (a new permission's existence, an amendment to a previously-ratified transition matrix, a new operation's semantics, provider-call sequencing, timeout-handling policy, scheduler ownership, and a DI-wiring approach). This record ratifies exactly those seven items, in the same "flag, never silently decide" discipline every prior P6-Dn/P7-D1 record in this register already established, and explicitly declines to resolve anything the audit did not present as a Stage 2 blocker (vendor selection, D7, durations, webhook contract, remaining DR edges). |
| **Security impact** | None directly — documentation-only. Design-level: `billing:manage` (Part A) is a TENANT-scoped permission checked via the existing `PermissionsGuard`/`RequirePermission` mechanism exactly like every other permission in the catalogue — no new guard, no new authentication mechanism, no `PlatformRole`/`SUPER_ADMIN` involvement. Tenant identity for every Stage 2 mutation remains server-derived (`TenantContext`), never client-supplied, unchanged from P7-D1's own security framing. |
| **Data / migration impact** | None. No schema or migration change. `billing:manage` is not yet added to `PERMISSIONS`/`ROLE_PERMISSIONS` in source; `scheduleCancellation()` is not yet added to `SubscriptionService`; no DI token/binding exists yet. All remain proposed-only, per this record's documentation-only mode. |
| **Implementation status** | **Not implemented.** Design/ratification record only, per explicit instruction ("MODE: DOCUMENTATION ONLY — NO IMPLEMENTATION"). The actual permission-catalogue edit, transition-matrix code change (`subscription-state-machine.ts`), `scheduleCancellation()` method, orchestration/controller code, and `BillingProvider` DI binding remain separate, later, explicitly-authorized implementation work. |
| **Source document / section** | "PHASE 7 — STAGE 2 DESIGN / READINESS AUDIT" (this session, prior turn) §16 (Decisions Required #1–#7) — the seven open items this record ratifies; P7-D1 (the record Part B amends); `backend/src/subscriptions/state-machine/subscription-state-machine.ts` (the code location Part B's amendment will eventually be implemented in); `backend/src/subscriptions/subscription.service.ts` (`scheduleDowngrade`, the pattern Part C's `scheduleCancellation` mirrors); `backend/src/auth/permissions/permission.ts` (G-13 catalogue, the location Part A's new permission will eventually be added to); Master Plan §13 "Phase 7 — SaaS Subscription/Billing". |
| **Consequences** | Phase 7 Stage 2 implementation (permission-catalogue edit, transition-matrix amendment, `scheduleCancellation`, orchestration/controller layer, `BillingProvider` DI binding) may now proceed against a ratified design rather than an audited-with-gaps proposal, once separately authorized. Production billing-provider-dependent work (real adapter, real webhooks, `SaasInvoice`, `PaymentMethod`) remains blocked on P7-D1 Part G/H's still-open items, unaffected by this record. |
| **Affected phase(s)** | **Phase 7** (Stage 2 design only). Amends P7-D1 (Phase 7 Stage 1) Part B's transition matrix only, as explicitly noted. No bearing on Phase 6 (W1–W8 unchanged) or Phase 8+. |
| **Reversibility** | Fully reversible — a design ratification with zero code/schema footprint; a future record can further amend any Part above (e.g., ratify the un-scheduling operation Part C explicitly deferred, or a different permission name) without needing to unwind any implementation, since none exists yet. |
| **Explicit approval wording (recorded)** | `"PHASE 7 — STAGE 2 RATIFICATION GATE … Ratify the following decisions as one Phase 7 Stage 2 decision record."` followed by the itemized Parts A–G exactly as ratified above, together with the explicit instruction to not mark production billing provider selection, D7/`BillingWebhookEvent`, exact grace-period duration, exact cancellation-retention duration, final webhook payload/provider contract, or any unresolved transition behavior not explicitly ratified above as resolved (Atharva — Project & Architecture Owner, 2026-09-12, "PHASE 7 — STAGE 2 RATIFICATION GATE"). |

### P7-D2 — Decision Log

| Date | Owner | Choice | Approval wording (verbatim) | Reference |
|---|---|---|---|---|
| 2026-09-12 | Atharva — Project & Architecture Owner | **Audited, 7 items marked DECISION REQUIRED** | "PHASE 7 — STAGE 2 DESIGN / READINESS AUDIT" — READY WITH DECISIONS REQUIRED | This session's Phase 7 Stage 2 audit turn |
| 2026-09-12 | Atharva — Project & Architecture Owner | **RESOLVED — RATIFIED (Parts A–G); billing provider, D7, grace duration, retention duration, webhook payload/provider contract, un-scheduling operation, and remaining unratified transition edges explicitly left OPEN** | `"PHASE 7 — STAGE 2 RATIFICATION GATE … Ratify the following decisions as one Phase 7 Stage 2 decision record."` | This record; "PHASE 7 — STAGE 2 RATIFICATION GATE" instruction |

### P7-D2 — Unresolved Items (explicitly recorded, NOT decided by this record)

| Item | Status | Notes |
|---|---|---|
| Production SaaS billing provider selection | **OPEN** | Unchanged from P7-D1 Part G — the Part G DI binding (this record) is explicitly NOT this decision. |
| D7 — `WebhookEvent` split / `BillingWebhookEvent` | **OPEN** | Unchanged from P7-D1 Part H. |
| Exact grace-period duration (`graceEndsAt` offset) | **OPEN** | Unchanged from P7-D1 Part C. |
| Exact cancellation-retention duration (`CANCELLED → EXPIRED` window) | **OPEN** | Unchanged from P7-D1 Part D. |
| Final webhook payload / provider contract | **OPEN** | Gated on billing-provider selection (above); `verifyWebhook`/`parseWebhook` remain interface-level contracts only. |
| Un-scheduling a scheduled cancellation before the period ends | **OPEN** | Explicitly deferred by Part C — not designed or named by this record. |
| Remaining DR transition edges beyond the single `ACTIVE → CANCELLED` addition (Part B) | **OPEN** | P7-D1's own Unresolved Items table's 5th row (trial-failure routing beyond `PAST_DUE`, `PAUSED`'s exits, `EXPIRED`'s terminality beyond "no transition") is otherwise unchanged by this record. |

---

## P7-D3 — Phase 7 Remaining Billing Architecture Decisions (RATIFIED)

Third Phase 7 record in this register. Ratifies nine of the ten items the "PHASE 7 — REMAINING BILLING ARCHITECTURE DECISION GATE" proposal (this session's prior turn) identified as requiring explicit user approval, and formally records two more as already-sufficiently-defined (no new decision). Production billing provider selection is explicitly NOT ratified by this record and remains OPEN. **This is a documentation-only record — no code, schema, migration, test, or configuration file accompanies it**, exactly as authorized ("PHASE 7 — P7-D3 BILLING ARCHITECTURE RATIFICATION … DO NOT IMPLEMENT CODE").

| Field | Content |
|---|---|
| **ID** | P7-D3 |
| **Owner** | Architecture owner (Atharva — Project & Architecture Owner) |
| **Date** | 2026-09-13 |
| **Status** | **RESOLVED — RATIFIED (design/policy only; no implementation authorized by this record)** |
| **Decision (question)** | The "PHASE 7 — REMAINING BILLING ARCHITECTURE DECISION GATE" proposal (this session's prior turn) presented ten items (D1–D9, with D9 split into three sub-items) as requiring explicit user approval or confirmation. Which of these are now ratified, and which remain genuinely open? |
| **Decision (approved)** | **RATIFIED, Parts A–J below.** |
| | **Part A — Production SaaS billing provider.** **REMAINS OPEN.** No provider is selected by this record. The existing merchant Razorpay integration (`src/payments/razorpay/`) remains structurally and conceptually separate from SaaS subscription billing (unchanged from P7-D1 Part G) — it is not, and must never be treated as, evidence of this choice. Production provider selection is a distinct, later, explicit decision. |
| | **Part B — D7 billing webhook architecture.** **D7 is RESOLVED toward the two-table design** (`CommerceWebhookEvent`/existing `webhook_events`, and a new, separate `BillingWebhookEvent`) — this record ratifies the *architecture*, not its implementation (no table is created by this record). Ratified properties of `BillingWebhookEvent`: platform-scoped (no client- or payload-supplied `tenantId` is ever trusted); tenant/subscription resolution occurs by looking up `Subscription.providerSubscriptionId`/`providerCustomerId` (both already `@unique`), never from the payload's own claimed identifiers; `providerEventId` is **unique** on this table (the deliberate opposite of `SubscriptionEvent.providerEventId`, which stays non-unique per P7-D1 Part F — deduplication belongs here, not there); the full raw, signature-verified payload is retained for audit/replay; both a verification-status and a processing-status are persisted; retry/backoff/dead-letter behavior reuses the existing `WebhookProcessor` pattern (bounded attempts, `availableAt`, `lastError`) verbatim; a dead-lettered (`FAILED`) event remains manually replayable, same as the commerce path; signature verification uses a SaaS-billing-specific secret, distinct from the merchant commerce webhook secret (invariant 6); ingestion is fast (verify + persist only), with processing happening transactionally afterward, mirroring the commerce two-phase design exactly; `BillingWebhookEvent` and `SubscriptionEvent` remain two separate, never-merged tables — processing a `BillingWebhookEvent` row invokes the existing subscription domain/orchestration logic (`SubscriptionService`/`SubscriptionOrchestrationService`), which writes its own, independent `SubscriptionEvent` row. **Vendor-dependent and explicitly NOT ratified by this record**: the exact webhook payload shape and the exact signature-verification algorithm — both depend on the still-OPEN provider choice (Part A) and remain implementation-time concerns for whichever adapter is eventually built. |
| | **Part C — Grace period.** **Duration RATIFIED: 7 days.** `graceEndsAt` remains the sole authoritative timestamp (unchanged mechanism, P7-D1 Part C). A payment failure establishes `PAST_DUE` and sets `graceEndsAt` to (the applicable failure time + 7 days) — the 7-day figure is a single ratified constant, not to be hardcoded independently in more than one place in a future implementation. A successful recovery clears `graceEndsAt` and returns the subscription to `ACTIVE` via the existing, unmodified `recoverPayment()` transition. Grace exhaustion continues to transition `PAST_DUE → PAUSED` via the existing, unmodified `exhaustGrace()`. The already-built, already-committed scheduler (`SubscriptionSchedulerService.runGraceExhaustion`, Scheduler Wave `68c290b`) remains the mechanism responsible for detecting an elapsed `graceEndsAt` — no change to that scheduler is implied or required by this record; it already consumes whatever duration is used to compute `graceEndsAt` without needing to know the number itself. |
| | **Part D — Cancellation retention.** **Duration RATIFIED: 30 days.** `CANCELLED` subscriptions continue to retain all merchant data throughout the retention window (unchanged, P7-D1 Part D) — nothing about this record authorizes destructive deletion of any kind. `EXPIRED` remains terminal (unchanged). Expiration must have an authoritative, persisted timestamp: a nullable `retentionEndsAt` field is ratified as the eventual mechanism (mirroring `graceEndsAt`'s own established shape — a G-19-compliant additive nullable column, no anticipated migration-safety obstacle), **to be added to `Subscription` only when a later, separately-authorized implementation turn actually builds this** — **no schema change accompanies this record**, and none is implied to exist yet. `retentionEndsAt` would be established at the moment cancellation becomes effective (i.e., when `SubscriptionService.cancel()` actually transitions a row to `CANCELLED`, whether immediately or via the confirmed at-period-end boundary); expiration eligibility is `retentionEndsAt <= now()`. The existing, already-built `SubscriptionService.expire()` remains the sole domain operation that performs the `CANCELLED → EXPIRED` transition — unchanged, still uninvoked by anything today. A future scheduler (not built by this record — the Scheduler Wave explicitly stopped short of this exact gap, per its own final report) will invoke `expire()` for eligible rows once `retentionEndsAt` exists. `EXPIRED` reaching this state never itself implies destructive deletion of merchant data — any future deletion behavior would require its own, separate, explicit decision, not inferred from this record. No new `SubscriptionEventType` is required for this mechanism — `expire()` already writes the existing `expired` event type. |
| | **Part E — Cancel-at-period-end unscheduling.** A merchant may unschedule a previously-scheduled at-period-end cancellation while the subscription remains `ACTIVE` and before the confirmed cancellation boundary is reached — after that boundary, the subscription has already transitioned to `CANCELLED` and there is nothing left to unschedule. Unscheduling must also remove/cancel the corresponding provider-side scheduled cancellation (symmetric with P7-D2 Part D's own "provider acceptance first" sequencing for scheduling). Provider confirmation is required before local state is considered unscheduled; the local `cancelAtPeriodEnd` flag is cleared only after that confirmation — never optimistically. The operation is idempotent (already-`false`/already-unscheduled is a safe no-op, matching every other Stage 1/2 method's own convention). The existing `SubscriptionEvent` mechanism is reused for this — the same `cancelled`-type event `scheduleCancellation()` already uses for scheduling, disambiguated via `metadata`, exactly as P7-D2's own precedent already established for that operation. **No new `SubscriptionEventType` is introduced for unscheduling** — consistent with Part H below. This record ratifies the *semantics* only; the corresponding `SubscriptionService`/`SubscriptionOrchestrationService` method(s) remain unbuilt. |
| | **Part F — Out-of-order/stale billing webhooks.** Duplicate delivery of the identical event is prevented by `BillingWebhookEvent.providerEventId`'s uniqueness (Part B) — but uniqueness alone does not solve a *different*, *older* event arriving *after* a newer one has already been processed. Ratified rule: before applying any webhook-driven subscription-state mutation, the processor must compare the provider event's own timestamp against the subscription's latest confirmed change; if the provider event is older than the authoritative subscription state, it is treated as stale and must never be permitted to regress the subscription. If a reliable provider event timestamp is unavailable, the webhook's own `receivedAt` is the ratified fallback signal. A stale event is marked `IGNORED` (an existing, already-defined status value in the `WebhookEventStatus`-shaped enum this record reuses per Part B) rather than being applied. **Exact timestamp field semantics remain vendor-dependent** and may be refined once a real provider adapter is built (Part A gate) — this record ratifies the *rule*, not the precise comparison mechanics of any specific vendor's payload. |
| | **Part G — Webhook vs. polling precedence.** Once `BillingWebhookEvent` exists (Part B), billing webhooks are ratified as the **authoritative** external signal for SaaS subscription lifecycle and period-boundary changes. The already-built, already-committed `reconcilePeriod()` (`SubscriptionOrchestrationService`) and its scheduler (`SubscriptionSchedulerService.runPeriodReconciliation`, Scheduler Wave `68c290b`) remain in place, unchanged, functioning purely as a polling/reconciliation safety net for a missed, delayed, or lost webhook — precisely the same relationship `PaymentReconciliationService` already has to commerce webhooks. If both paths ever observe and attempt to apply the same underlying lifecycle change, the existing CAS/idempotency protections already built into every `SubscriptionService` method (unchanged by this record) are sufficient to prevent a duplicate or conflicting state transition — polling must never be implemented in a way that intentionally overrides a newer, already-confirmed webhook-driven state. No second, competing state machine is introduced. |
| | **Part H — `SubscriptionEventType` growth default.** Ratified default: future subscription lifecycle moments should **prefer reusing an existing `SubscriptionEventType` value with a disambiguating `metadata` flag** wherever semantically reasonable — the exact pattern `SubscriptionService.scheduleCancellation()` already established (Stage 2) by reusing `cancelled` rather than introducing a dedicated value, and the same pattern Part E above ratifies for unscheduling. Enum values must never be added merely for convenience. If a genuinely new lifecycle event cannot be clearly represented by any existing value plus metadata, adding a new `SubscriptionEventType` remains *permitted in principle*, but only after its own explicit decision — and, structurally, only once a **separate, dedicated migration-safety-guard extension/ratification** (the same weight P4-D2/P4-D3's own guard extensions carried) is itself approved, since `migration-safety.spec.ts`'s current additive-only guard rejects `ALTER TYPE … ADD VALUE` outright for any non-legacy migration (confirmed empirically this session). **Neither the guard nor the enum is modified by this record.** |
| | **Part I — Trial failure.** `TRIALING → PAST_DUE` remains ratified as the sole, standard trial-payment-failure route (unchanged from P7-D1 Part B) — a trial that fails to convert enters the exact same payment-failure/grace mechanism (Part C above) as any other failed renewal, rather than bypassing grace or routing anywhere else. No additional trial-failure transition edge is added; the matrix is unchanged. |
| | **Part J — `PAUSED`/`EXPIRED` state edges (confirmation, not a new decision).** Recorded here for completeness, not as a new ratification: `PAUSED`'s exit set remains exactly `PAUSED → ACTIVE`, `PAUSED → CANCELLED`, `PAUSED → EXPIRED` (no more, no fewer — already fully ratified and implemented since P7-D1); `EXPIRED` remains terminal with no outgoing transition of any kind (already fully ratified, implemented, and unit-tested since P7-D1). **No matrix change of any kind is made or implied by this record.** |
| **Explicitly NOT introduced** | No Prisma schema change (no `retentionEndsAt` column exists after this record — Part D is explicit that it is a *future* implementation requirement only). No migration. No source code, controller, scheduler, or `SubscriptionEvent`/`BillingWebhookEvent` table. No production billing-provider selection (Part A remains OPEN). No migration-safety-guard modification (Part H). No new `SubscriptionEventType` value. No change to the ratified transition matrix (Part I/J confirm, never alter, the existing matrix). No vendor-specific webhook payload or signature format (Part B/F explicitly leave these to a later, vendor-gated decision). |
| **Rationale** | The "PHASE 7 — REMAINING BILLING ARCHITECTURE DECISION GATE" proposal separated what could be ratified immediately (grace/retention *mechanism*, unscheduling *semantics*, webhook-architecture *shape*, enum-growth *policy*, and confirmation of already-closed matrix edges) from what must remain genuinely open (the provider itself, and anything downstream of that choice). This record ratifies exactly the former, in the same "flag, never silently decide" discipline every prior P6-Dn/P7-Dn record in this register has established, and explicitly declines to invent a provider, a schema change, or a guard change no one has yet approved. |
| **Security impact** | None directly — documentation-only. Design-level: Part B's platform-scoped, payload-untrusted tenant resolution and separate-secret requirements directly reinforce invariant 6 and invariant 10 (already reproduced verbatim in the master plan §4.1, confirmed present in this repository during the prior readiness audit); no new role, permission, or trust boundary is introduced anywhere in this record. |
| **Data / migration impact** | None. `retentionEndsAt` is explicitly recorded as NOT currently implemented (Part D) — a future, separately-authorized schema change, not a consequence of this record. No `BillingWebhookEvent` table, no new `SubscriptionEventType` value, no other schema or migration change accompanies this record. |
| **Implementation status** | **Not implemented.** Design/policy ratification only, per explicit instruction ("DOCUMENTATION-ONLY DECISION RECORD … DO NOT IMPLEMENT CODE"). The `BillingWebhookEvent` table and processor, the `retentionEndsAt` column and its scheduler, the unscheduling method(s), the stale-webhook comparison logic, and any future `SubscriptionEventType` addition (with its own prerequisite guard extension) all remain separate, later, explicitly-authorized implementation work. |
| **Source document / section** | "PHASE 7 — REMAINING BILLING ARCHITECTURE DECISION GATE" (this session, prior turn) — the ratification proposal this record approves, items D1–D9; "PHASE 7 — PRODUCTION BILLING + WEBHOOK ARCHITECTURE READINESS AUDIT" (this session, earlier turn) — the underlying gap analysis; P7-D1/P7-D2 (the records this one extends without altering); `backend/src/subscriptions/subscription-scheduler.service.ts` (Scheduler Wave, commit `68c290b` — the existing mechanism Parts C/D/G reference); `backend/src/payments/webhooks/webhook-processor.service.ts` and `backend/src/payments/payment-reconciliation.service.ts` (the reused patterns Parts B/G cite); Master Plan §13 and §4.1 (invariants 6, 10, 19). |
| **Consequences** | The grace-period and cancellation-retention *durations* are now fixed constants (7 days, 30 days) available to any future implementation turn without re-litigating them; the D7 webhook architecture, unscheduling semantics, stale-event handling, and webhook/poll precedence all have a ratified shape ready to implement once separately authorized; the `SubscriptionEventType` growth default (prefer reuse) reduces (but does not eliminate) the odds of hitting the migration-safety-guard blocker identified in the prior audit. Production billing provider selection remains the single largest remaining blocker to any vendor-specific implementation work (Part A). |
| **Affected phase(s)** | **Phase 7** (policy/architecture only — no stage-specific code touched). Extends P7-D1/P7-D2 without altering either. No bearing on Phase 6 (unchanged) or Phase 8+. |
| **Reversibility** | Fully reversible — a design/policy ratification with zero code/schema footprint; a future record can amend any Part above (e.g., a different retention duration, a different enum-growth default) without needing to unwind any implementation, since none exists yet as a consequence of this record. |
| **Explicit approval wording (recorded)** | `"PHASE 7 — P7-D3 BILLING ARCHITECTURE RATIFICATION … This record must formally ratify the following decisions."` followed by the itemized Parts A–J exactly as ratified above, together with the explicit instructions "Do NOT select a provider" (Part A), "Do NOT add retentionEndsAt to schema in this turn" (Part D), "Do NOT introduce a new SubscriptionEventType solely for unscheduling" (Part E), and "Do NOT modify the migration-safety guard now. Do NOT add enum values now." (Part H) (Atharva — Project & Architecture Owner, 2026-09-13, "PHASE 7 — P7-D3 BILLING ARCHITECTURE RATIFICATION"). |

### P7-D3 — Decision Log

| Date | Owner | Choice | Approval wording (verbatim) | Reference |
|---|---|---|---|---|
| 2026-09-13 | Atharva — Project & Architecture Owner | **Proposed, decision-only audit, not yet ratified** | "PHASE 7 — REMAINING BILLING ARCHITECTURE DECISION GATE" — a nine-item ratification proposal, provider selection explicitly excluded from any recommendation | This session's Phase 7 remaining-decisions audit turn |
| 2026-09-13 | Atharva — Project & Architecture Owner | **RESOLVED — RATIFIED (Parts A–J); production billing provider selection explicitly left OPEN** | `"PHASE 7 — P7-D3 BILLING ARCHITECTURE RATIFICATION … This record must formally ratify the following decisions."` | This record; "PHASE 7 — P7-D3 BILLING ARCHITECTURE RATIFICATION" instruction |

### P7-D3 — Unresolved Items (explicitly recorded, NOT decided by this record)

| Item | Status | Notes |
|---|---|---|
| Production SaaS billing provider selection | **OPEN** | Unchanged from P7-D1 Part G / P7-D2 — explicitly not decided by Part A of this record. |
| Final webhook payload / signature-verification format | **OPEN** | Vendor-dependent — gated on the production provider decision above (Part B/F). |
| Exact `retentionEndsAt` schema/migration implementation | **IMPLEMENTATION GAP, not a decision** | The duration and mechanism are ratified (Part D); the column itself is explicitly not added by this record. |
| Un-scheduling method implementation | **IMPLEMENTATION GAP, not a decision** | The semantics are ratified (Part E); no code is added by this record. |
| Any future `SubscriptionEventType` addition | **CONDITIONALLY OPEN** | Permitted only after its own explicit decision AND a separate migration-safety-guard extension (Part H) — neither exists yet. |

---

## P7-D4 — Production SaaS Billing Provider Selection: Razorpay Subscriptions (RATIFIED)

Fourth Phase 7 record in this register. Resolves the single item every prior Phase 7 record (P7-D1 Part G, P7-D2 Part G, P7-D3 Part A) explicitly left OPEN: **which production SaaS billing provider PrintForge uses behind the existing `BillingProvider` abstraction.** Also resolves the legacy stub item **D14** ("SaaS billing provider," `PHASE-0-DECISION-RESOLUTION-AND-PHASE-1-SPEC.md §A.1`). **This is a business/architecture decision record — no code, schema, migration, environment variable, endpoint, or frontend change accompanies it**, exactly as authorized ("PRINTFORGE — RATIFY RAZORPAY SAAS BILLING PROVIDER … Do NOT implement Razorpay code … Do NOT modify schema.prisma … Do NOT add environment variables … Do NOT create endpoints").

| Field | Content |
|---|---|
| **ID** | P7-D4 |
| **Owner** | Architecture owner (Atharva — Project & Architecture Owner) |
| **Date** | 2026-09-13 |
| **Status** | **RESOLVED — RATIFIED (business/architecture decision; no implementation authorized by this record)** |
| **Decision (question)** | The "PRINTFORGE — SAAS BILLING PROVIDER EVALUATION" turn (this session, prior turn) evaluated Stripe, Razorpay Subscriptions, Paddle, and Chargebee against PrintForge's actual architecture and India-first/global-eventually trajectory, without selecting one. Which provider is PrintForge's production SaaS billing provider? |
| **Decision (approved)** | **RATIFIED, Parts A–J below.** |
| | **Part A — Production SaaS billing provider.** **RESOLVED: Razorpay Subscriptions.** This is PrintForge's own SaaS subscription billing (Merchant → PrintForge → Razorpay Subscriptions) — structurally and permanently distinct from the Phase 8 merchant-commerce payment integration (Customer → Merchant Store → Merchant Payment Account → Razorpay), unchanged from P7-D1 Part G / P7-D2 Part G / P7-D3 Part A's own repeated warning that the existing merchant Razorpay integration must never be treated as evidence for this choice. That the same vendor was independently selected for both is a coincidence of the Indian payments market, not a coupling — Parts E/F below make the separation mechanical, not just documented. |
| | **Part B — Strategy.** **India-first SaaS launch.** Razorpay Subscriptions is selected for PrintForge's initial launch geography and business stage; it is explicitly not ratified as PrintForge's billing provider for all time or all geographies — see Part I. |
| | **Part C — Integration boundary.** The Razorpay-specific SaaS billing implementation must live **exclusively behind the existing `BillingProvider` interface** (`backend/src/subscriptions/billing-provider.interface.ts`) — a `RazorpayBillingProvider` implementing all nine of its methods (`createCustomer`, `createSubscription`, `changeSubscription`, `cancelSubscription`, `unscheduleCancellation`, `resumeSubscription`, `getSubscription`, `verifyWebhook`, `parseWebhook`), swapped in at the single existing DI binding in `subscription.module.ts` (`{ provide: BILLING_PROVIDER, useClass: ... }`), exactly the replacement point P7-D2 Part G already anticipated. No other file is permitted to import a Razorpay SDK or reference a Razorpay-specific concept directly. |
| | **Part D — Core domain neutrality.** `SubscriptionService`, `SubscriptionOrchestrationService`, `SubscriptionEvent`, `BillingWebhookEvent`, `EntitlementService`/entitlement resolution, and the subscription state-machine (`SubscriptionStatus`'s 7 states, the CAS-disciplined transition matrix) **must remain vendor-neutral** — unchanged by this record, unchanged by the eventual adapter. None of these may reference Razorpay by name, id format, or event vocabulary; a Razorpay adapter must translate into the existing canonical shapes (`BillingProviderCustomer`/`BillingProviderSubscription`/`NormalizedBillingEvent`, the `payment_failed`/`recovered`/`cancelled`/`renewed` canonical event vocabulary), never the reverse. |
| | **Part E — Credential separation.** The SaaS Razorpay account, API key pair, and webhook signing secret **must be distinct** from the Phase 8 merchant-commerce Razorpay account/keys/webhook secret — the same "separate secret" discipline P7-D3 Part B already ratified in the abstract, now bound to a concrete vendor. Reusing a merchant-commerce credential for SaaS billing (or vice versa) is a violation of this record, regardless of technical convenience. |
| | **Part F — Data-flow separation.** SaaS billing must never write to the merchant commerce payment models `PaymentAttempt`, `Refund`, or `WebhookEvent`; merchant commerce payments must never write to `SubscriptionEvent` or `BillingWebhookEvent`. **This is not merely a stated rule — it is already mechanically enforced**: `backend/src/money-flow-separation.spec.ts` (committed `10ebe24`, Phase 7 final closeout) statically asserts no cross-import between `src/subscriptions/` and `src/payments/` and no Prisma relation between the two model groups. A `RazorpayBillingProvider` adapter living inside `src/subscriptions/` inherits this guard automatically; it must not be added anywhere else. |
| | **Part G — Provider-specific implementation.** The next implementation step **may** add a `RazorpayBillingProvider` adapter implementing the existing `BillingProvider` interface — not authorized by this record, which is a decision, not an implementation turn. |
| | **Part H — Webhooks.** Razorpay SaaS webhook signature verification (`Razorpay.validateWebhookSignature()`, the same HMAC pattern already proven in `src/payments/razorpay/` for commerce — reusable as a *pattern*, never as shared code or a shared secret, per Part E/F) and Razorpay-specific event-to-canonical-type mapping will be implemented **inside** the `RazorpayBillingProvider`'s `verifyWebhook`/`parseWebhook` methods, normalized into the existing canonical billing event model exactly as `BillingWebhookProcessor`'s already-built `RENEWAL_EVENT_TYPE` routing pattern expects — no change to `BillingWebhookIngestionService` or `BillingWebhookProcessor` is implied by this record. |
| | **Part I — Future international expansion.** Razorpay Subscriptions is selected for the current India-first strategy on the following verified basis (this session's own direct inspection of Razorpay's current documentation, not assumption): the Subscriptions product is available to merchants incorporated in India, Malaysia, Singapore, or the United States (PrintForge qualifies); a paying customer/merchant may be located in any country provided they pay by an internationally-issued card (Visa/Mastercard/Amex/Diners/Discover), with no separate customer-country whitelist found; recurring auto-debits on such international cards are explicitly confirmed supported by Razorpay's own Subscriptions FAQ ("There are no changes in processing debits for Subscriptions using international cards. The RBI guidelines apply only to domestic cards and not international cards."); settlement to PrintForge is always in INR at the prevailing exchange rate. **International expansion/provider suitability may be re-evaluated later** if a future business requirement exceeds what is verified here (e.g. a currency, payment method, or customer-country restriction Razorpay's own documentation does not currently disclose) — this record does not treat today's verification as a permanent guarantee against a vendor policy change. |
| | **Part J — Deferred items.** `SaasInvoice`, `PaymentMethod`, SaaS refunds, and any other Razorpay-specific billing feature (e.g. dunning configuration, plan-catalogue mirroring) **remain deferred** until their exact Razorpay Subscriptions implementation requirements are audited in a later, separately-authorized turn — consistent with P7-D1 Part G / P7-D2 Part G's own original deferral and the Phase 7 completion audit's own finding that building these before provider selection risks inventing a shape the chosen vendor's real API would not match. |
| **Explicitly NOT introduced** | No `RazorpayBillingProvider` class or any other Razorpay SDK usage. No `schema.prisma` change. No migration. No environment variable. No HTTP endpoint or controller route. No frontend change. No change to `SubscriptionService`, `SubscriptionOrchestrationService`, `SubscriptionEvent`, `BillingWebhookEvent`, `BillingWebhookIngestionService`, or `BillingWebhookProcessor`. No change to the `BillingProvider` interface itself (Razorpay's adapter must fit the existing nine-method shape, not the reverse). |
| **Rationale** | Per the "PRINTFORGE — SAAS BILLING PROVIDER EVALUATION" turn: Stripe's India onboarding has been invite-only since May 2024 with no general availability in 2026, and its Merchant-of-Record product explicitly excludes India — not viable as PrintForge's own account holder today. Razorpay Subscriptions offers self-serve India onboarding today, native pause/resume primitives matching this codebase's own `PAUSED` state better than Stripe's, and the engineering team's existing Razorpay integration experience (kept structurally separate per Parts E/F) — while Chargebee and Paddle both remain architecturally viable alternatives noted in that evaluation for a later international-expansion re-evaluation (Part I), neither is required to launch India-first. This record makes the launch-blocking choice; it does not foreclose revisiting the decision. |
| **Security impact** | Directly reinforces frozen invariant 6 (SaaS billing and merchant commerce payments are separate) and invariant 10 (verified webhooks): Part E's distinct-secret requirement and Part F's data-flow rule are not new policy — they restate what P7-D3 Part B already ratified in the abstract, now bound to a concrete vendor, and Part F's enforcement already exists in committed code (`money-flow-separation.spec.ts`, `10ebe24`). No new role, permission, or trust boundary is introduced by this record. |
| **Data / migration impact** | None. No schema or migration change accompanies this record. |
| **Implementation status** | **Not implemented.** Decision/policy ratification only, per explicit instruction ("Do NOT implement Razorpay code … Do NOT modify schema.prisma … Do NOT add environment variables … Do NOT create endpoints"). The `RazorpayBillingProvider` adapter, its webhook signature/payload mapping, and credential provisioning all remain separate, later, explicitly-authorized implementation work (Part G/H). |
| **Source document / section** | "PRINTFORGE — SAAS BILLING PROVIDER EVALUATION" (this session, prior turn) — the four-provider comparison this record ratifies from; the follow-up country/currency verification turn (this session) — the direct-documentation-fetch evidence cited in Part I; P7-D1 Part G / P7-D2 Part G / P7-D3 Part A (the records whose OPEN item this one resolves); `backend/src/subscriptions/billing-provider.interface.ts` (the abstraction Part C binds to); `backend/src/money-flow-separation.spec.ts` (commit `10ebe24` — the enforcement Part F cites); `PHASE-0-DECISION-RESOLUTION-AND-PHASE-1-SPEC.md §A.1` (D14, the legacy stub item this record also closes). |
| **Consequences** | Phase 7's last explicitly-OPEN architectural gate (production billing provider selection) is closed; a future implementation turn may now build `RazorpayBillingProvider` against a ratified target rather than a placeholder. `SaasInvoice`/`PaymentMethod`/SaaS refunds remain correctly unbuilt until that adapter's real payload shapes are known (Part J). The India-first strategy (Part B) means Razorpay Subscriptions' own geographic/currency limits, not an architectural constraint, now bound how soon PrintForge could bill a given international merchant — mitigated, not eliminated, by Part I's verified findings. |
| **Affected phase(s)** | **Phase 7** (closes the provider-selection gate P7-D1/P7-D2/P7-D3 each left open) and gates the future Phase 7 implementation turn that builds the actual adapter. **No bearing on Phase 8** — the merchant-commerce Razorpay integration is unaffected, unchanged, and structurally separate (Parts A/E/F). |
| **Reversibility** | Fully reversible — a decision record with zero code/schema footprint; a future record could select a different provider without unwinding any implementation, since none exists yet as a consequence of this record, exactly as P7-D3's own Reversibility field established for the same reason. |
| **Explicit approval wording (recorded)** | `"PRINTFORGE — RATIFY RAZORPAY SAAS BILLING PROVIDER … PRODUCTION SaaS BILLING PROVIDER: Razorpay Subscriptions"` together with the itemized Parts A–J exactly as ratified above (Atharva — Project & Architecture Owner, 2026-09-13, "PRINTFORGE — RATIFY RAZORPAY SAAS BILLING PROVIDER"). |

### P7-D4 — Decision Log

| Date | Owner | Choice | Approval wording (verbatim) | Reference |
|---|---|---|---|---|
| 2026-09-13 | Atharva — Project & Architecture Owner | **Proposed, evaluation-only, not yet ratified** | "PRINTFORGE — SAAS BILLING PROVIDER EVALUATION" — a four-provider comparison (Stripe, Razorpay Subscriptions, Paddle, Chargebee), explicitly not a decision | This session's SaaS billing provider evaluation turn |
| 2026-09-13 | Atharva — Project & Architecture Owner | **RESOLVED — RATIFIED (Parts A–J)** — Razorpay Subscriptions, India-first | `"PRINTFORGE — RATIFY RAZORPAY SAAS BILLING PROVIDER … PRODUCTION SaaS BILLING PROVIDER: Razorpay Subscriptions"` | This record; "PRINTFORGE — RATIFY RAZORPAY SAAS BILLING PROVIDER" instruction |

### P7-D4 — Unresolved Items (explicitly recorded, NOT decided by this record)

| Item | Status | Notes |
|---|---|---|
| `RazorpayBillingProvider` adapter implementation | **IMPLEMENTATION GAP, not a decision** | The provider is selected (Part A); no adapter code exists yet (Part G). |
| Real webhook signature verification / provider-event payload mapping | **IMPLEMENTATION GAP, not a decision** | The location and normalization target are ratified (Part H); no code exists yet. |
| SaaS Razorpay credential/webhook-secret provisioning | **IMPLEMENTATION GAP, not a decision** | The separation requirement is ratified (Part E); no environment variable or credential is provisioned by this record. |
| `SaasInvoice` / `PaymentMethod` / SaaS refunds | **DEFERRED** | Explicitly deferred until Razorpay Subscriptions' exact implementation requirements are audited (Part J). |
| Exact current Razorpay Subscriptions currency count and Amex/Diners/Discover activation requirements | **VERIFY BEFORE USE** | Core facts (merchant-eligible countries, no customer-country whitelist, recurring international-card debits supported, INR-only settlement) were directly verified against Razorpay's own documentation this session; the exact enumerated currency list and card-network activation steps were not independently re-verified and should be confirmed immediately before the adapter (Part G) is built. |
| International expansion beyond Razorpay Subscriptions' supported geography/currencies | **CONDITIONALLY OPEN** | To be re-evaluated per Part I if and when a real business requirement exceeds what is verified today — not decided now. |

---

## P7-D5 — Razorpay Scheduled-Cancellation Handling and Webhook Event Identity (RATIFIED)

Fifth Phase 7 record in this register. Amends **only** the Razorpay-specific applicability of P7-D3 Part E, based on direct Razorpay TEST/SANDBOX API verification conducted this session (not documentation inference) — see Part H. **This is a documentation-only amendment record — no `RazorpayBillingProvider` code, schema, migration, or frontend change accompanies it.** This does **not** invalidate or weaken the vendor-neutral `BillingProvider` abstraction or `SubscriptionService` state machine ratified across P7-D1–P7-D4 — see Part F.

| Field | Content |
|---|---|
| **ID** | P7-D5 |
| **Owner** | Architecture owner (Atharva — Project & Architecture Owner) |
| **Date** | 2026-09-13 |
| **Status** | **RESOLVED — RATIFIED** |
| **Decision (question)** | Sandbox verification (this session) empirically tested whether Razorpay Subscriptions exposes any provider-side way to reverse a scheduled cycle-end cancellation while keeping the subscription active, and whether Subscriptions webhooks carry a usable event identity. What must `RazorpayBillingProvider`'s cancellation-scheduling/unscheduling behavior and webhook-ingestion event-id handling be, given the verified results? |
| **Decision (approved)** | **RATIFIED, Parts A–H below.** |
| | **Part A — Provider limitation.** Sandbox verification empirically established that Razorpay Subscriptions exposes **no safe provider-side operation that reverses a cycle-end cancellation while retaining an active subscription.** Specifically observed against a real Razorpay TEST-mode subscription: `POST /subscriptions/:id/cancel` with `cancel_at_cycle_end: true` succeeds and schedules a cancellation, but no field on the subscription object (`has_scheduled_changes`/`change_scheduled_at` included) ever visibly reflects it — those fields track only a pending *plan* change; `POST /subscriptions/:id/cancel_scheduled_changes` rejects with `"No Pending update for this subscription"` when nothing but a cancellation is scheduled, confirming that endpoint's scope excludes cancellation schedules entirely; `POST /subscriptions/:id/resume` rejects with `"subscription can't be resumed as subscription is in active state"`, since a subscription with a scheduled cancellation is still reported as plain `active`, never a distinct "pending cancellation" state; re-calling `POST /subscriptions/:id/cancel` with `cancel_at_cycle_end: false` does **not** clear the schedule — it immediately, destructively cancels the subscription instead (`status: cancelled`, `ended_at` set), which Razorpay's own documentation independently confirms is terminal ("Once cancelled, you cannot renew or reactivate it"). A provider-side scheduled cancellation must therefore **never be created** for this vendor. |
| | **Part B — Local-only cancellation scheduling.** For Razorpay: the orchestration-layer call site (`SubscriptionOrchestrationService.scheduleCancellationFlow()` → `BillingProvider.cancelSubscription(providerSubscriptionId, 'at_period_end')`) requires **no code change** — the vendor-specific behavior lives entirely inside `RazorpayBillingProvider.cancelSubscription()`'s own handling of the `'at_period_end'` mode, which (for Razorpay only) resolves successfully **without calling Razorpay's cancel endpoint at all**. The existing, already-vendor-neutral `SubscriptionService.scheduleCancellation()` domain method still sets `Subscription.cancelAtPeriodEnd = true` locally exactly as it already does today (P7-D2 Part C) — that write is unchanged and remains the sole authoritative record of the merchant's cancellation intent. The Razorpay subscription itself remains genuinely active and uninterrupted, with no provider-side awareness of the pending intent, until the actual period boundary (Part D). |
| | **Part C — Unscheduling.** For Razorpay: `RazorpayBillingProvider.unscheduleCancellation()` is correspondingly a **local-only operation** — it makes **no Razorpay API call** (there is nothing provider-side to undo, per Part B), and simply returns success so the existing, unchanged `SubscriptionOrchestrationService.unscheduleCancellation()` / `SubscriptionService.unscheduleCancellation()` call chain clears the local `cancelAtPeriodEnd` flag exactly as it already does, after its existing local authorization (`billing:manage` permission) and idempotency-key checks — neither of which changes. It **MUST NOT** call `cancelSubscription(..., 'immediate')`/`cancel_at_cycle_end: false` (empirically destructive, Part A), **MUST NOT** call `resumeSubscription()` (wrong operation — no pause ever occurred), and **MUST NOT** call the `cancel_scheduled_changes` endpoint (wrong domain — empirically scoped to pending plan changes only, Part A). |
| | **Part D — Boundary cancellation.** When the confirmed period boundary is actually reached and `cancelAtPeriodEnd` is still `true` — detected by the existing, unchanged `reconcilePeriod()` / `SubscriptionSchedulerService.runPeriodReconciliation` safety net (P7-D3 Part G) — **that is the one moment** `RazorpayBillingProvider.cancelSubscription(providerSubscriptionId, 'immediate')` is actually called against Razorpay. Only after Razorpay confirms that call does local `Subscription.status` transition to `CANCELLED`, via the existing, unmodified `SubscriptionService.cancel()` — never optimistically. No new transition, no new `SubscriptionEventType`, and no change to any existing CAS/idempotency discipline is introduced; this record changes only *when*, and via *which* adapter method, Razorpay is actually called for the scheduled-cancellation case. |
| | **Part E — Webhook event identity.** Razorpay Subscriptions webhook ingestion must accept and use `X-Razorpay-Signature` (HMAC-SHA256 verification, the SaaS-specific webhook secret per P7-D4 Part E) and `X-Razorpay-Event-Id` as `providerEventId` — both **header-derived**, empirically confirmed (a live-captured `subscription.cancelled` delivery): the JSON payload body carries `entity`/`account_id`/`event`/`contains`/`payload.subscription.entity`/top-level `created_at`, but **no `id` or `event_id` field of any kind**. This refines P7-D4 Part H's framing ("no change to `BillingWebhookIngestionService`/`BillingWebhookProcessor` implied") in one small, necessary way: `billing-webhooks.controller.ts` must extract `X-Razorpay-Event-Id` alongside the existing signature header and thread it through `BillingWebhookIngestionService.receiveWebhook()` into `BillingProvider.parseWebhook()` (an additional parameter on that one interface method), mirroring the pattern `payments.controller.ts`/`PaymentsService.receiveWebhook()` already establish for merchant commerce webhooks. This does not change *where* Razorpay-specific mapping logic lives (still exclusively inside the adapter, per P7-D4 Part C) — only that the adapter's `parseWebhook` now has a header value available to use as `providerEventId`, rather than needing to synthesize a weaker payload-derived fallback. |
| | **Part F — Architectural scope.** This is a **Razorpay-adapter-specific** decision. The vendor-neutral `BillingProvider` interface (unchanged in spirit — `parseWebhook` gaining one optional parameter is still a vendor-neutral signature, not a Razorpay-specific one) and `SubscriptionService`'s state machine remain **the** architectural abstraction; nothing in this record changes any transition, any `SubscriptionEvent` type, or any schema. A future provider that *does* support genuine provider-side scheduled-cancellation reversal (P7-D4 Part I's own openness to re-evaluation) would simply implement `unscheduleCancellation()` differently inside its own adapter — calling its own provider API instead of the local-only path this record requires for Razorpay — without the orchestration layer's call sites changing at all, since they already treat every provider call as opaque behind the interface. |
| | **Part G — P7-D3 supersession.** This record supersedes **only** the Razorpay-applicability of P7-D3 Part E ("Unscheduling must also remove/cancel the corresponding provider-side scheduled cancellation") — for Razorpay specifically, empirically, no such provider-side removal operation exists (Part A), so it cannot be performed, and Parts B/C above are the resulting safe design. **P7-D3 Part E itself is NOT rewritten or deleted** — it remains the correct, original, vendor-neutral statement of intent, and remains fully binding on any future provider that *does* support it (Part F). Per this register's own established precedent (P7-D1 Part B's Summary Table entry annotated, not rewritten, when P7-D2 Part B amended it), P7-D3's Summary Table entry below is annotated to point here. |
| | **Part H — Verification basis.** This record is based on direct, real Razorpay TEST/SANDBOX API verification conducted this session, not documentation inference: `POST .../cancel` with `cancel_at_cycle_end: true` (observed: succeeds, schedule created, no visible confirming field); `POST .../cancel_scheduled_changes` (observed: rejected, `"No Pending update for this subscription"`); `POST .../resume` (observed: rejected, `"subscription can't be resumed as subscription is in active state"`); `POST .../cancel` with `cancel_at_cycle_end: false` (observed: succeeds, but as an immediate, destructive cancellation). A live webhook delivery for `subscription.cancelled` was also captured and inspected for Part E. No secrets, signatures, customer PII, or temporary webhook-inspection-tool details are recorded in this record. |
| **Explicitly NOT introduced** | No `RazorpayBillingProvider` code (still not implemented — Parts B/C/D/E describe required *future* behavior, not code added by this record). No `schema.prisma` change (`Subscription.cancelAtPeriodEnd` already exists and is already written by the existing, unmodified `scheduleCancellation()` domain method). No migration. No frontend change. No rewrite or deletion of P7-D3 (Part G). No change to `SubscriptionService`'s transition matrix, `SubscriptionEventType` enum, or any CAS/idempotency discipline. |
| **Rationale** | The "flag, never silently decide" discipline this register has applied to every P6-Dn/P7-Dn record applies equally to a vendor-specific empirical finding: P7-D3 Part E's original text assumed every provider supports removing a scheduled cancellation server-side. Razorpay does not, verified directly rather than assumed, and rather than silently building a broken `unscheduleCancellation()` (or worse, one that destructively cancels on "unschedule," per Part A's own worst-case finding), this record ratifies the one architecturally consistent, verified-safe design before any adapter code is written. |
| **Security impact** | None new. Authorization (`billing:manage` permission) and idempotency-key checks remain entirely in the existing, unchanged controller/orchestration layer (Parts B/C). One operational-visibility tradeoff is disclosed, not a security issue: Razorpay's own merchant dashboard will show no "scheduled to cancel" indicator for these subscriptions (since Razorpay is never told), making PrintForge's own local `cancelAtPeriodEnd` the sole source of truth — correct per this record, worth knowing when debugging via the Razorpay dashboard directly. |
| **Data / migration impact** | None. `Subscription.cancelAtPeriodEnd` is a pre-existing column already written by the pre-existing `scheduleCancellation()` method; no new column, no schema or migration change. |
| **Implementation status** | **Not implemented.** Decision/policy ratification only. `RazorpayBillingProvider`'s `cancelSubscription`/`unscheduleCancellation` behavior (Parts B/C/D) and `billing-webhooks.controller.ts`'s header-threading change (Part E) all remain separate, later, explicitly-authorized implementation work. |
| **Source document / section** | "RAZORPAY SAAS BILLING IMPLEMENTATION-READINESS AUDIT" (this session, prior turn) — the two blockers this record resolves; "P7-D4 RAZORPAY IMPLEMENTATION — DECISION AMENDMENT ONLY" sandbox-verification turn (this session) — the empirical evidence (Part H); P7-D4 (the record whose Parts G/H this one details); P7-D3 Part E/G (the record whose Razorpay-applicability this one supersedes); `backend/src/subscriptions/subscription-orchestration.service.ts` (`scheduleCancellationFlow`/`unscheduleCancellation` — the unchanged call sites Part B/C/F describe); `backend/src/subscriptions/billing-webhooks.controller.ts` and `backend/src/payments/payments.controller.ts` (the header-threading pattern Part E mirrors). |
| **Consequences** | `RazorpayBillingProvider` can now be implemented against a verified-correct design for cancellation scheduling/unscheduling and webhook event identity, rather than a guessed one — the two readiness-audit blockers are closed. The next implementation turn's file list is unchanged from the readiness audit's own §9, with the adapter-internal behavior for `cancelSubscription('at_period_end')` and `unscheduleCancellation()` now fully specified (Parts B/C) instead of open. |
| **Affected phase(s)** | **Phase 7** — refines P7-D3/P7-D4 without altering either's own text; gates the still-unauthorized `RazorpayBillingProvider` implementation turn. No bearing on Phase 8. |
| **Reversibility** | Fully reversible — a decision record with zero code/schema footprint; a future record could amend this again (e.g. if Razorpay later adds a real unschedule endpoint) without unwinding any implementation, since none exists yet as a consequence of this record. |
| **Explicit approval wording (recorded)** | `"P7-D4 RAZORPAY IMPLEMENTATION — DECISION AMENDMENT ONLY … NEW DECISION: P7-D5 — Razorpay Scheduled-Cancellation Handling and Webhook Event Identity … Status: RATIFIED"` together with the itemized Parts A–H exactly as ratified above (Atharva — Project & Architecture Owner, 2026-09-13). |

### P7-D5 — Decision Log

| Date | Owner | Choice | Approval wording (verbatim) | Reference |
|---|---|---|---|---|
| 2026-09-13 | Atharva — Project & Architecture Owner | **Sandbox verification requested, not yet ratified** | "P7-D4 RAZORPAY IMPLEMENTATION — DECISION AMENDMENT ONLY … Perform a sandbox-only verification of the two remaining implementation blockers" | This session's Razorpay sandbox verification turn |
| 2026-09-13 | Atharva — Project & Architecture Owner | **RESOLVED — RATIFIED (Parts A–H)** — local-only Razorpay cancellation scheduling/unscheduling; header-derived webhook event id | `"P7-D4 RAZORPAY IMPLEMENTATION — DECISION AMENDMENT ONLY … NEW DECISION: P7-D5 … Status: RATIFIED"` | This record; "P7-D4 RAZORPAY IMPLEMENTATION — DECISION AMENDMENT ONLY" instruction |

### P7-D5 — Unresolved Items (explicitly recorded, NOT decided by this record)

| Item | Status | Notes |
|---|---|---|
| `RazorpayBillingProvider` adapter implementation (all methods, including the Part B/C/D-specified behavior) | **IMPLEMENTATION GAP, not a decision** | Design is now fully specified; no code exists yet. |
| `billing-webhooks.controller.ts` / `BillingWebhookIngestionService` / `BillingProvider.parseWebhook` header-threading change (Part E) | **IMPLEMENTATION GAP, not a decision** | Required change is identified; no code exists yet. |
| Whether `X-Razorpay-Event-Id` remains stable across a genuine retry delivery of the *same* logical event | **NOT INDEPENDENTLY VERIFIED** | Only a single, successfully-first-time-delivered event was observed (no retry occurred); Razorpay's evident dedup-key convention strongly implies stability, but a forced-retry test was not performed. Low risk to leave unverified before implementation; may be confirmed opportunistically once live. |
| Every other item P7-D4's own Unresolved Items table already lists (credential provisioning, `SaasInvoice`/`PaymentMethod`/refunds, currency/country specifics) | **UNCHANGED** | Not addressed or altered by this record — see P7-D4's own table. |

---

## P8-D3 — Merchant Razorpay Integration Model: Direct Merchant-Owned Account (RATIFIED)

First Phase 8 record in this register. Resolves the merchant-Razorpay-integration-model question raised by `docs/saas/PHASE-8-START-GATE-AUDIT.md` and this session's follow-up "PHASE 8 — BLOCKING DECISION CLOSURE" brief — the single item that audit's own §16 identified as one of two genuine implementation blockers. **This is an architecture decision record — no code, schema, migration, environment variable, endpoint, or frontend change accompanies it**, exactly as authorized ("Do NOT implement Phase 8 yet. Do NOT modify application code. Do NOT modify Prisma schema. Do NOT create migrations. Do NOT modify frontend. Do NOT commit. Do NOT push.").

| Field | Content |
|---|---|
| **ID** | P8-D3 |
| **Owner** | Architecture owner (Atharva — Project & Architecture Owner) |
| **Date** | 2026-09-14 |
| **Status** | **RESOLVED — RATIFIED (architecture decision; no implementation authorized by this record)** |
| **Decision (question)** | `PHASE-8-START-GATE-AUDIT.md` §6/§7 evaluated three merchant-commerce Razorpay integration models — (A) direct merchant-owned account, (B) platform/linked-account (Razorpay Route), (C) platform-controlled/pooled settlement — and recommended (A) without ratifying it. This session's blocking-decision-closure brief (P8-D3) restated that recommendation in full. Which model does PrintForge adopt? |
| **Decision (approved)** | **RATIFIED, Parts A–H below.** |
| | **Part A — Model selected.** **Direct Merchant-Owned Razorpay Account.** Each merchant/store uses its own, independently owned Razorpay account. PrintForge is a technical integrator configured with merchant-owned credentials — never a fund custodian. |
| | **Part B — Money flow.** `Customer → Merchant Store → Merchant's Razorpay Account → Merchant's own settlement destination`. No PrintForge-owned or PrintForge-controlled account sits anywhere in this chain. |
| | **Part C — What PrintForge does not do.** PrintForge does not receive customer funds; does not hold customer funds; does not pool funds; does not disburse merchant funds; does not use Razorpay Route for Phase 8; does not use a platform-controlled settlement model; and does not act as merchant of record, by architecture. |
| | **Part D — Store ownership.** `PaymentAccount` is associated with the merchant's `Store` (not resolved to a specific FK shape by this record — schema authoring is separate, later work per P8-D1, still only PROPOSED). The underlying Razorpay provider account belongs to the merchant, not PrintForge. The provider account's lifecycle is distinct from, and structurally unrelated to, PrintForge's own SaaS subscription with that merchant (P7-D1–P7-D5) — the same separation invariant 6 already establishes between SaaS billing and merchant commerce, now extended explicitly to account *ownership*, not just data flow. |
| | **Part E — Required core Razorpay capabilities.** Orders API, Payments API, payment verification (HMAC signature), Refunds API, standard webhook delivery, and HMAC-SHA256 webhook signature verification (`X-Razorpay-Signature`, `X-Razorpay-Event-Id`) — exactly the surface `RazorpayService` (`backend/src/payments/razorpay/razorpay.service.ts`) already integrates today, to be parameterized per merchant account rather than reused as a single global instance. No Route, linked-account, or marketplace product is required. |
| | **Part F — Out of scope for Phase 8.** Razorpay Route; linked-account/platform settlement; pooled/platform-controlled settlement; the OAuth Technology-Partner connection UX. OAuth-based account connection may be considered later as a **separate, approval-gated capability** (it requires enrolling in Razorpay's Partner/Technology-Partner program) — not ratified, not scheduled, and not implied to be adopted by this record. |
| | **Part G — Legal/commercial items explicitly preserved as OPEN.** This record does **not** resolve, and does not silently treat as resolved: (i) merchant-of-record language/confirmation in PrintForge's merchant agreement or Terms of Service; (ii) confirmation against Razorpay's own terms of service regarding a SaaS platform storing/transmitting merchant-supplied API credentials on the merchant's behalf. Both remain genuinely open business/legal questions (`PHASE-8-START-GATE-AUDIT.md` §13) and require their own separate confirmation before or alongside Phase 8 implementation. |
| | **Part H — Relationship to Phase 7 money-flow separation.** This record's entire footprint stays inside `src/payments/` and the commerce Prisma models; it introduces no coupling to `src/subscriptions/` or the SaaS-billing models (`Subscription`, `SubscriptionEvent`, `BillingWebhookEvent`); `backend/src/money-flow-separation.spec.ts`'s existing checks (no cross-import, no cross-model relation, six distinct tables) remain valid and require no change as a consequence of this record. |
| **Explicitly NOT introduced** | No `PaymentAccount` Prisma model or any schema change. No migration. No `PaymentProvider` interface code or `RazorpayProvider` adapter. No new controller, route, or endpoint. No frontend change. No environment variable. No credential-storage implementation (governed separately by P8-D6). |
| **Rationale** | Per `PHASE-8-START-GATE-AUDIT.md` §5/§6: Option A requires zero new Razorpay approval and matches the frozen Master Plan §4.2 commerce-payments bullet verbatim, including its explicit exclusion of Route/linked-accounts/settlement/KYC/payout/merchant-of-record from the frozen v1.0 architecture. Current (Sept 2026) Razorpay/RBI research confirmed Route access was materially tightened by RBI's September 2025 Payment Aggregator guideline update (a "Payer-Payee Transparency" declaration, financial-threshold eligibility, and a compliance deadline after which non-compliant Route access was disabled) — Option B carries active regulatory exposure Option A does not. Option C (platform-controlled/pooled settlement) sits squarely inside RBI's Payment-Aggregator-license trigger condition ("any non-bank entity that collects customer payments on behalf of merchants"), the highest-exposure and least-architecturally-consistent choice, and the one the audit's §7 identified as the "undisclosed merchant-of-record" shape to avoid by construction. |
| **Security impact** | Reinforces invariant 8 (payment amounts server-authoritative — unaffected by this record) and invariant 9 (payment credentials remain server-side — the storage mechanism is addressed concretely by the companion P8-D6 record). No new role, permission, or trust boundary is introduced by this record itself; the `payment-account:manage` permission it will eventually rely on was already ratified pre-Phase-8 (Phase 3 permission catalogue, reserved and unused). |
| **Data / migration impact** | None. No schema or migration change accompanies this record. |
| **Implementation status** | **Not implemented.** `PaymentAccount` schema authoring (P8-D1, PROPOSED, not ratified by this record), the `PaymentProvider` interface (P8-D2, PROPOSED), the `RazorpayProvider` adapter, checkout/webhook/reconciliation wiring, and the `Order.storeId` prerequisite fix identified by the Start-Gate Audit all remain separate, later, explicitly-authorized implementation work — see `PHASE-8-START-GATE-AUDIT.md` §17's Stage 1 prompt. |
| **Source document / section** | `docs/saas/PHASE-8-START-GATE-AUDIT.md` §§5–9, §14 (P8-D3 entry), §16 (start-gate verdict); this session's "PHASE 8 — BLOCKING DECISION CLOSURE" turn (P8-D3 decision brief, items 1–9); Master Plan (`PRINTFORGE-SAAS-IMPLEMENTATION-MASTER-PLAN-v1.0.md`) §4.2 (commerce-payments frozen bullet) and §14 (Phase 8 draft); Razorpay Route/Linked Accounts documentation and RBI Payment Aggregator guideline research cited in the Start-Gate Audit §5. |
| **Consequences** | Phase 8's money-flow shape is now fixed: no future Phase 8 work may introduce a PrintForge-owned or PrintForge-pooled account into the commerce payment path without reopening this record. The `PaymentProvider` interface (P8-D2) can now be designed against a known integration model rather than a placeholder. P8-D1, P8-D2, P8-D4, P8-D5, P8-D7, and P8-D8 remain separately trackable, lower-risk items, **not ratified by this record**. |
| **Affected phase(s)** | **Phase 8** (defining). No bearing on Phase 7 (SaaS billing, P7-D1–P7-D5) — explicitly orthogonal, per Part D/H. |
| **Reversibility** | Fully reversible — a decision record with zero code/schema footprint; a future record could adopt Route or a platform-controlled model instead without unwinding any implementation, since none exists yet as a consequence of this record. |
| **Explicit approval wording (recorded)** | `"PHASE 8 — RATIFY P8-D3 AND P8-D6/D9 … P8-D3 — DIRECT MERCHANT-OWNED RAZORPAY ACCOUNT … Status: RATIFIED"` together with the itemized architecture, money flow, store-ownership, required-capabilities, out-of-scope, and preserved-OPEN-items points exactly as ratified above (Atharva — Project & Architecture Owner, 2026-09-14, "PHASE 8 — RATIFY P8-D3 AND P8-D6/D9"). |

### P8-D3 — Decision Log

| Date | Owner | Choice | Approval wording (verbatim) | Reference |
|---|---|---|---|---|
| 2026-09-14 | Atharva — Project & Architecture Owner | **Proposed (Start-Gate Audit recommendation), not yet ratified** | "PHASE 8 — MERCHANT PAYMENT ACCOUNT ARCHITECTURE / START-GATE AUDIT" — Option A recommended over Options B/C, explicitly not ratified | `docs/saas/PHASE-8-START-GATE-AUDIT.md` §7, §14 (P8-D3 entry, status OPEN) |
| 2026-09-14 | Atharva — Project & Architecture Owner | **Restated as a concise decision brief, still not yet ratified** | "PHASE 8 — BLOCKING DECISION CLOSURE … Do NOT ratify it yet." | This session's blocking-decision-closure turn, §1 (P8-D3 decision brief) |
| 2026-09-14 | Atharva — Project & Architecture Owner | **RESOLVED — RATIFIED (Parts A–H)** — Direct Merchant-Owned Razorpay Account | `"PHASE 8 — RATIFY P8-D3 AND P8-D6/D9 … P8-D3 — DIRECT MERCHANT-OWNED RAZORPAY ACCOUNT … Status: RATIFIED"` | This record; "PHASE 8 — RATIFY P8-D3 AND P8-D6/D9" instruction |

### P8-D3 — Unresolved Items (explicitly recorded, NOT decided by this record)

| Item | Status | Notes |
|---|---|---|
| `PaymentAccount` schema ownership shape (`P8-D1`) | **OPEN — PROPOSED only** | Store-owned with denormalized `tenantId` is recommended by the Start-Gate Audit §9/§14 but not ratified by this record. |
| `PaymentProvider` abstraction shape (`P8-D2`) | **OPEN — PROPOSED only** | Mirrors the existing `BillingProvider` precedent per the audit §9; not ratified by this record. |
| Per-account webhook routing (`P8-D4`) | **OPEN — PROPOSED only** | `/payments/webhook/:accountId` recommended; not ratified by this record. |
| Payment-account lifecycle states (`P8-D5`) | **OPEN — PROPOSED only** | Minimal `PENDING`/`ACTIVE`/`DISABLED` recommended; not ratified by this record. |
| Tenant/store resolution & authorization boundary (`P8-D7`) | **OPEN — PROPOSED only** | Reuse of `resolvePrimaryStoreId()` + `payment-account:manage` recommended; not ratified by this record. |
| Refund/reconciliation boundary (`P8-D8`) | **OPEN — PROPOSED only** | Deferring in-app refund automation recommended; not ratified by this record. |
| OAuth Technology-Partner connection UX | **DEFERRED, separately approval-gated** | Not part of this ratification (Part F); requires its own Razorpay partner-program approval if ever pursued. |
| Merchant-of-record language in the merchant agreement | **OPEN — legal/business, not architecture** | Explicitly preserved, not silently resolved (Part G). |
| Razorpay ToS confirmation on merchant-supplied credential storage | **OPEN — legal/commercial, not architecture** | Explicitly preserved, not silently resolved (Part G). |
| `checkout.service.ts` writing `Order.storeId` at order-creation time | **CONFIRMED PREREQUISITE, not implemented** | Code-only fix (column already exists, per Phase 4 W6); required for the store-based account resolution this model implies to function. Not performed by this record — see `PHASE-8-START-GATE-AUDIT.md` §17 Stage 1 item 5. |

---

## P8-D6 — Merchant Payment Credential Storage Mechanism (RATIFIED — resolves D9)

Second Phase 8 record in this register. Formally resolves the legacy stub decision **D9** ("Merchant payment-credential storage," `PHASE-0-DECISION-RESOLUTION-AND-PHASE-1-SPEC.md §A.1`, carried `OPEN` through Phase 4 and Phase 7 as "Gates Phase 8"). Also supersedes the Master Plan's own non-binding D9 sketch (§4.4: "data key from **a managed KMS**") with a mechanism actually verified against PrintForge's current deployment, per this session's "PHASE 8 — BLOCKING DECISION CLOSURE" comparison of Options A/B/C. **This is an architecture decision record — no code, schema, migration, environment variable, or frontend change accompanies it.**

| Field | Content |
|---|---|
| **ID** | P8-D6 |
| **Owner** | Architecture owner (Atharva — Project & Architecture Owner) |
| **Date** | 2026-09-14 |
| **Status** | **RESOLVED — RATIFIED (architecture decision; no implementation authorized by this record). Resolves D9.** |
| **Decision (question)** | `PHASE-8-START-GATE-AUDIT.md` §16 identified D9/P8-D6 (credential-storage mechanism) as the second of two genuine implementation blockers. This session's blocking-decision-closure brief compared three minimum-viable options — (A) environment-managed secrets, (B) an external secret manager/KMS, (C) application-level static-key envelope encryption — against PrintForge's actual, repository-confirmed deployment architecture (Render + Vercel + Render PostgreSQL, no containers, no IaC, no existing KMS/secrets-manager integration anywhere in the codebase). Which mechanism does PrintForge adopt for `PaymentAccount` credential storage? |
| **Decision (approved)** | **RATIFIED, Parts A–H below.** |
| | **Part A — Mechanism.** `PaymentAccount` merchant credentials (`key_id`/`key_secret`/`webhook_secret`) are stored as an **application-level AES-256-GCM encrypted blob** (conceptually `credentialsEncrypted` — the exact column name/shape is schema-authoring work, not fixed by this record). |
| | **Part B — Master key.** The encryption master key is a **single symmetric key stored as one Render environment secret** — one platform-wide key, not a per-merchant key, used to encrypt/decrypt every `PaymentAccount` row's blob. |
| | **Part C — No external vendor.** No external KMS or secrets-manager vendor (AWS KMS, GCP Secret Manager, HashiCorp Vault, Doppler, or otherwise) is introduced for Phase 8. Confirmed unavailable in PrintForge's current, ratified deployment architecture (Render + Vercel + Render PostgreSQL; "no containers, no IaC manifests in the repo — do not invent them," `docs/ops/DEPLOYMENT.md`; hosting confirmed staying on Render per the already-ratified D8 record) and not required to satisfy invariant 9. |
| | **Part D — Plaintext-never guarantees.** Plaintext merchant credentials are never stored in PostgreSQL; never logged; never serialized into any API response or job payload; decrypted only server-side, only inside the payment-provider adapter, only at the moment of an actual provider call — mirroring the redaction discipline `WebhookProcessor.safeContext`/`PaymentReconciliationService.safeContext` already establish. |
| | **Part E — Rotation.** Merchant-specific credential rotation (a merchant regenerates their own Razorpay keys) is supported by re-encrypting that one `PaymentAccount` row's blob — a normal application update, not a migration. Master-key rotation is a controlled, deliberate re-encryption operation across all `PaymentAccount` rows — not automatic, not scheduled, and not authorized or performed by this record. |
| | **Part F — Rejected alternative.** Environment-managed per-merchant secrets (Option A) are explicitly **rejected** as the storage mechanism: they do not scale to a dynamic, self-service-onboarding multi-tenant model (every new merchant would require a manual Render environment-variable addition plus redeploy) and would violate invariant 11 ("new stores do not require new backend deployments by default"). Plain environment variables remain correct **only** for the existing, small, fixed, platform-level secret sets — `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET`/`RAZORPAY_WEBHOOK_SECRET` as the Tenant #1 seed/fallback credential (per the Start-Gate Audit §12), and `RAZORPAY_SAAS_*` for SaaS billing (Part G) — never for the growing, per-tenant `PaymentAccount` credential set this record governs. |
| | **Part G — SaaS-billing credential separation preserved.** This record governs **only** merchant-commerce `PaymentAccount` credentials. `RAZORPAY_SAAS_KEY_ID`/`RAZORPAY_SAAS_KEY_SECRET`/`RAZORPAY_SAAS_WEBHOOK_SECRET` (Phase 7 SaaS subscription billing, P7-D4 Part E) are untouched, unaffected, and remain a wholly separate credential set under the existing, separately-ratified plain-Render-env-var mechanism — this record does not migrate, wrap, re-key, or otherwise change SaaS billing credential storage in any way. |
| | **Part H — D9 resolution.** This record formally resolves **D9** ("Merchant payment-credential storage"). D9's own non-binding recommendation sketch (Master Plan §4.4: "data key from a managed KMS") is **superseded** by Parts A–C above, which were verified against PrintForge's actual current deployment rather than assumed — no managed KMS is reachable from Render today (confirmed by direct repository/`package.json`/deployment-doc inspection, Start-Gate Audit §12; no `crypto-js`/`@aws-sdk`/Vault/secrets-manager dependency exists anywhere in this codebase). This record ratifies D9's *general shape* (encrypted at rest, decrypted only in the adapter, never logged or serialized — invariant 9) while replacing its specific, unverified "managed KMS" mechanism with Parts A–C's verified-available one. |
| **Explicitly NOT introduced** | No `PaymentAccount` Prisma model or `credentialsEncrypted` column. No encryption/decryption utility code. No new environment variable actually provisioned in any `.env` file or Render service (the master-key secret is named/ratified *conceptually* here; provisioning it is separate implementation work). No external KMS/secrets-manager integration, SDK, or dependency. No schema, migration, or frontend change. |
| **Rationale** | Per the Start-Gate Audit §12 and this session's comparison brief: no crypto/secrets-manager SDK dependency exists in `package.json`; no encryption/envelope utility exists anywhere in `src/` (confirmed by repository-wide search); the ratified D8 hosting decision keeps PrintForge on Render with no containers/IaC; every other secret in this application (`JWT_ACCESS_SECRET`, `REFRESH_TOKEN_SECRET`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_SAAS_KEY_SECRET`, `CLOUDINARY_API_SECRET`, `RESEND_API_KEY`) is already provisioned as a plain Render service environment secret, per `docs/ops/ENVIRONMENT.md` — Part B's single master key follows the exact same, already-proven provisioning pattern. Node's built-in `crypto` module is already used in this exact codebase (`razorpay.service.ts`'s `createHmac`/`timingSafeEqual`) — direct precedent that AES-256-GCM needs no new runtime dependency either. |
| **Security impact** | Directly resolves invariant 9 ("payment credentials remain server-side") for the Phase 8 case: plaintext credentials never reach PostgreSQL, logs, Sentry, or any API response. The single master key becomes the one artifact whose compromise would expose every merchant's stored credentials — the same blast-radius shape this application already accepts today for `JWT_ACCESS_SECRET`, not a new risk category, but worth naming explicitly as a P1 concern (Start-Gate Audit §10): access to that Render secret must be restricted exactly as tightly as `JWT_ACCESS_SECRET` already is. |
| **Data / migration impact** | None. No schema or migration change accompanies this record. |
| **Implementation status** | **Not implemented.** The encryption/decryption utility, the `PaymentAccount.credentialsEncrypted` column, and the new Render master-key environment secret itself all remain separate, later, explicitly-authorized implementation work. |
| **Source document / section** | `docs/saas/PHASE-8-START-GATE-AUDIT.md` §12 (environment-configuration audit), §14 (P8-D6 entry); this session's "PHASE 8 — BLOCKING DECISION CLOSURE" turn, §2 (Options A/B/C comparison) and §3 (existing-D9 analysis); this file's own pre-existing D9 stub and the Master Plan (`PRINTFORGE-SAAS-IMPLEMENTATION-MASTER-PLAN-v1.0.md`) §4.4 D9 sketch (the item this record resolves); `docs/ops/DEPLOYMENT.md`, `docs/ops/ENVIRONMENT.md` (deployment-architecture evidence); `backend/src/payments/razorpay/razorpay.service.ts` (existing `crypto` usage precedent); the already-ratified D8 hosting record. |
| **Consequences** | D9 is closed — a future implementation turn may design `PaymentAccount`'s credential column against a ratified mechanism rather than a placeholder or an unverified "managed KMS" assumption. A real external KMS/secrets manager remains a legitimate **future** upgrade if PrintForge's infrastructure ever changes, but would require its own new, D8-style hosting/infrastructure decision — not implied, scheduled, or pre-authorized by this record. |
| **Affected phase(s)** | **Phase 8** (defining — gates `PaymentAccount` schema authoring). No bearing on Phase 7 SaaS-billing credential storage (Part G). |
| **Reversibility** | Reversible in principle (a future record could adopt an external KMS instead), but **not free**, unlike a pure policy record: once `PaymentAccount` rows exist and are encrypted under this scheme, migrating to a different mechanism later requires a real re-encryption migration of live data, not merely a decision-text change. This asymmetry is disclosed, not hidden. |
| **Explicit approval wording (recorded)** | `"PHASE 8 — RATIFY P8-D3 AND P8-D6/D9 … P8-D6 / D9 — PAYMENT CREDENTIAL STORAGE … Status: RATIFIED"` together with the itemized mechanism, master-key, no-external-vendor, plaintext-never, rotation, rejected-alternative, and credential-separation points exactly as ratified above (Atharva — Project & Architecture Owner, 2026-09-14, "PHASE 8 — RATIFY P8-D3 AND P8-D6/D9"). |

### P8-D6 — Decision Log

| Date | Owner | Choice | Approval wording (verbatim) | Reference |
|---|---|---|---|---|
| 2026-09-14 | Atharva — Project & Architecture Owner | **Proposed (Start-Gate Audit recommendation), not yet ratified** | "PHASE 8 — MERCHANT PAYMENT ACCOUNT ARCHITECTURE / START-GATE AUDIT" — envelope encryption + KMS-availability check recommended, explicitly not ratified | `docs/saas/PHASE-8-START-GATE-AUDIT.md` §12, §14 (P8-D6 entry, status BLOCKED) |
| 2026-09-14 | Atharva — Project & Architecture Owner | **Options A/B/C compared, Option C recommended, not yet ratified** | "PHASE 8 — BLOCKING DECISION CLOSURE … Do NOT implement it." | This session's blocking-decision-closure turn, §2 (P8-D6/D9 credential-storage decision brief) |
| 2026-09-14 | Atharva — Project & Architecture Owner | **RESOLVED — RATIFIED (Parts A–H)** — application-level AES-256-GCM envelope encryption, single Render-secret master key, no external vendor. **Resolves D9.** | `"PHASE 8 — RATIFY P8-D3 AND P8-D6/D9 … P8-D6 / D9 — PAYMENT CREDENTIAL STORAGE … Status: RATIFIED"` | This record; "PHASE 8 — RATIFY P8-D3 AND P8-D6/D9" instruction |

### P8-D6 — Unresolved Items (explicitly recorded, NOT decided by this record)

| Item | Status | Notes |
|---|---|---|
| Exact master-key environment-variable name | **NOT FIXED** | Naming is implementation-time work, not decided by this record. |
| Provisioning the actual Render secret | **NOT DONE** | No environment variable has been added to any `.env`/Render service by this record. |
| Encryption/decryption utility implementation | **NOT DONE** | Code remains separate, later, explicitly-authorized implementation work. |
| Master-key custody/rotation runbook (who holds it, how it is backed up) | **OPEN — operational, not decided here** | An ops question analogous to `JWT_ACCESS_SECRET`'s own (undocumented) custody today; not resolved by this record. |
| Future external-KMS upgrade path | **EXPLICITLY NOT DECIDED, NOT RULED OUT** | Would require its own new hosting/infrastructure decision (Part C/Consequences); this record neither schedules nor forecloses it. |

---

## Phase 9 Decision Records

Phase 9 — Store / Domain Resolution (Master Plan §15). Eight records, all ratified in one pass on 2026-09-20 against the question sheet `docs/saas/PHASE-9-DECISION-DOCKET.md` (itself derived from `docs/saas/PHASE-9-START-GATE-AUDIT.md`). Every record below is a **governance decision only** — **NO code, schema, migration, environment variable, infrastructure (Render/Vercel/DNS/TLS), or production change accompanies any of them.** Implementation is authorized only by a separately-approved `PHASE-9-START-GATE-AND-IMPLEMENTATION-SPEC.md`, exactly as G-20 gated Phase 3.

Verification performed before recording (per the ratification instruction's STEP 1): each supplied decision was checked against the docket's option axis and against every existing `RESOLVED`/`APPROVED` record it touches. **No supplied decision conflicts with an existing ratified decision.** One record (P9-D2) explicitly *preserves* G-5; one record (P9-D1) resolves the "Phase 9/12" deferral label carried by eight earlier records to a single phase without reopening any of them; one record (P9-D8) is recorded as distinct from, not in conflict with, P3-D1.

---

## P9-D1 — Customer-Auth Ownership: Phase 12 (RATIFIED)

| Field | Content |
|---|---|
| **ID** | P9-D1 |
| **Owner** | Atharva — Project & Architecture Owner (architecture + product owner, the same owner who recorded P2-D7 and P4-D1) |
| **Date** | 2026-09-20 |
| **Status** | **RESOLVED — RATIFIED — OPTION B (Phase 12 owns all customer-auth runtime items).** |
| **Decision (question)** | Which phase ships the customer-authentication runtime that P2-D3, P2-D5, P2-D6, P2-D7, P2-D13, G-14, G-15 and P4-D1 all defer to **"Phase 9/12"** — a two-phase label no record resolved to a single phase (`PHASE-9-START-GATE-AUDIT.md §4`; `PHASE-9-DECISION-DOCKET.md §2`)? |
| **Options considered** | **A.** Phase 9 owns all customer-auth runtime items. **B.** Phase 12 owns all customer-auth runtime items. **C.** Explicit recorded split (item-by-item). |
| **Owner Decision** | **B — Phase 12 owns all customer-auth runtime items.** The following remain **Phase 12** responsibilities: (1) the `CustomerRefreshToken` table (P2-D3); (2) the `/storefront/auth/*` route family (P2-D6); (3) customer JWT issuance — token shape `{sub: customerId, storeId, tokenVersion, aud}`, customer JWT strategy/guard, `AuthenticatedCustomer` (P2-D5); (4) `CUSTOMER_JWT_ACCESS_SECRET` provisioning + wiring (P2-D13 / G-15); (5) the `customerId` cutover on the seven commerce/actor tables (P4-D1). |
| **Rationale** | Owner's explicit choice. No further rationale was supplied beyond the itemisation recorded above; the docket's evidence-only consequence analysis (`PHASE-9-DECISION-DOCKET.md §2.5`, Option B) stands as the recorded context, not as the owner's reasoning. |
| **Effect on earlier records (clarification, not amendment)** | The "Phase 9/12" label in P2-D3, P2-D5, P2-D6, P2-D7, P2-D13, G-14, G-15 and P4-D1 is now to be read as **Phase 12**. **None of those records is reopened, reworded, or re-decided by this record** — every frozen design they carry (separate `CustomerRefreshToken` table; token shape; `/storefront/auth/*`; distinct signing secret; Option B backfill-only `customerId`) is preserved verbatim. This record only resolves *which* of the two named phases owns the runtime. The Phase 9 prerequisite those records name — runtime `Host → StoreDomain → Store → Tenant` resolution — remains Phase 9. |
| **Dependencies** | Upstream: P2-D3, P2-D5, P2-D6, P2-D7, P2-D13, G-14, G-15, P4-D1 (frozen designs, unchanged). Downstream: **P9-D4 is re-filed under Phase 12** (see P9-D4). Master Plan §16 (Phase 12) line 2556 lists *"Phase 2 (`Customer` store-scoped auth)"* as a dependency — under this record Phase 12 *builds* customer auth rather than depending on it; this Master Plan wording mismatch is disclosed, not silently corrected (the Master Plan is not edited by this record). |
| **Affected files / systems** | **Unchanged by this record; listed for the Phase 12 spec:** `backend/test/e2e/identity-foundation.e2e-spec.ts:272` (`AC-P2-02: there is NO customer_refresh_tokens table`) — **stays green and unmodified through Phase 9**; `backend/test/e2e/support/fixtures.ts:505` — unchanged through Phase 9; `backend/prisma/schema.prisma` Customer-block comments (lines ~1670–1692) and `backend/src/common/tenant/storefront-tenant.resolver.ts:19` reference "Phase 9/12" — comment-only, updated when Phase 12 touches those files, not by Phase 9. |
| **Consequences for Phase 9** | Phase 9 is a backend/infra domain-resolution phase with a bounded frontend SEO/origin change and **no new auth surface**. Phase 9 must **not** implement customer authentication, customer cookies, `CustomerRefreshToken`, `/storefront/auth/*`, customer JWT issuance, `CUSTOMER_JWT_ACCESS_SECRET`, or the `customerId` cutover. Phases 10 and 11 run with `Customer` rows still authenticated by nothing, exactly as Phases 3–8 did. |
| **Follow-up actions** | (1) Summary-table rows for the eight upstream records keep their text; this record is the resolution pointer. (2) The Phase 9 implementation spec must state the exclusion explicitly and must not enumerate any customer-auth wave. (3) Phase 12's start-gate must pick up all five items plus P9-D4. |
| **Explicit approval wording (recorded)** | `"P9-D1: B — Phase 12 owns all customer-auth runtime items. CustomerRefreshToken, /storefront/auth/*, customer JWT issuance, CUSTOMER_JWT_ACCESS_SECRET provisioning/wiring, and customerId cutover remain Phase 12 responsibilities."` (Atharva — Project & Architecture Owner, 2026-09-20, "OWNER DECISIONS" instruction.) |

### P9-D1 — Decision Log

| Date | Owner | Choice | Approval wording (verbatim) | Reference |
|---|---|---|---|---|
| 2026-09-20 | Atharva — Project & Architecture Owner | **Question raised, not decided** | `PHASE-9-START-GATE-AUDIT.md §4` — "OWNER DECISION REQUIRED (1)" | Start-gate audit |
| 2026-09-20 | Atharva — Project & Architecture Owner | **Options A/B/C presented, none recommended** | `PHASE-9-DECISION-DOCKET.md §2` | Decision docket |
| 2026-09-20 | Atharva — Project & Architecture Owner | **RESOLVED — RATIFIED — OPTION B** | `"P9-D1: B — Phase 12 owns all customer-auth runtime items. …"` | This record; "OWNER DECISIONS" instruction |

---

## P9-D2 — `StoreDomain` Schema Reconciliation: Phase 9 fields adopted, G-5 enum preserved (RATIFIED)

| Field | Content |
|---|---|
| **ID** | P9-D2 |
| **Owner** | Atharva — Project & Architecture Owner (architecture owner — G-5's owner) |
| **Date** | 2026-09-20 |
| **Status** | **RESOLVED — RATIFIED — OPTION B (adopt the Phase 9 `StoreDomain` fields; preserve the G-5-ratified `DomainVerificationStatus` enum). G-5 is NOT amended.** |
| **Decision (question)** | Master Plan §15 DATABASE / DATA IMPACT (lines 2094–2103) describes a `StoreDomain` row with four columns (`type`, `verificationMethod`, `lastCheckedAt`, `tlsStatus`) and one enum value (`VERIFYING`) that the shipped schema (`backend/prisma/schema.prisma:1349–1367`; enum `:1183–1187`) does not have. Which shape governs Phase 9's first migration, and is amending the G-5-ratified `DomainVerificationStatus = {PENDING, VERIFIED, FAILED}` authorised? (`PHASE-9-START-GATE-AUDIT.md §5`; `PHASE-9-DECISION-DOCKET.md §3`.) |
| **Options considered** | **A.** Adopt the Phase 9 draft in full and amend the ratified enum. **B.** Adopt the Phase 9 fields but preserve the ratified enum. **C.** Adopt a subset with a new recorded decision. **D.** Other explicitly documented owner decision. |
| **Owner Decision** | **B.** **Add** to `StoreDomain`: `type`, `verificationMethod`, `lastCheckedAt`, `tlsStatus`, **plus the corresponding new enums required by those fields** (a domain-type enum for `type`, a verification-method enum for `verificationMethod`, a TLS-status enum for `tlsStatus` — exact enum/column names are schema-authoring work for the implementation spec, not fixed by this record). **DO NOT add `VERIFYING`.** `DomainVerificationStatus` remains exactly **`PENDING | VERIFIED | FAILED`**. **No amendment to G-5 is authorised.** |
| **Rationale** | Owner's explicit choice. The owner's own wording supplies the rationale for the enum half: the G-5-ratified set is preserved and no amendment is authorised. No further rationale was supplied for the field half beyond adopting the four §15 fields; the docket's evidence (`PHASE-9-DECISION-DOCKET.md §3.4` — without `type` the resolver cannot distinguish platform subdomains from custom domains; without `tlsStatus` the §15 KEY RISKS mitigation cannot be enforced) stands as recorded context. |
| **G-5 relationship (explicit)** | **This record preserves G-5 verbatim.** G-5 (`2026-09-06`, APPROVED) ratified `DomainVerificationStatus` = {PENDING, VERIFIED, FAILED}; that set is unchanged. Master Plan §15's four-value draft (`PENDING/VERIFYING/VERIFIED/FAILED`) is **not adopted** — the Master Plan's draft is superseded on this one point by the owner's decision here, and G-5 stays the governing record for the enum. `TenantStatus` and `StoreStatus` (also G-5) are likewise unchanged. |
| **Dependencies** | Upstream: G-5 (preserved). Downstream: **P9-D3** fixes the semantics of `tlsStatus` transitions (Vercel-managed provisioning); **P9-D7** (on-demand only, no scheduled worker in Phase 9) is consistent with the absence of an in-flight `VERIFYING` marker — a synchronous on-demand check moves a row `PENDING → VERIFIED` or `PENDING → FAILED` directly. Gates the first Phase 9 migration. |
| **Migration-guard consequence (disclosed)** | Option B keeps the Phase 9 schema migration entirely inside `backend/src/migration-safety.spec.ts`'s existing allowances — `CREATE TYPE` (allowed) and G-19's *single, purely-additive nullable* `ALTER TABLE <existing> ADD COLUMN` with no `NOT NULL` and no `DEFAULT` (allowed). Because the guard permits no `ALTER TYPE … ADD VALUE`, Option A would have required either a guard extension or an allowlist — Option B needs neither. Consequence for the spec: the four new columns must be **nullable with no DB default** (G-19); any application-level default (e.g. treating a null `type` as `CUSTOM` or backfilling it) follows the P6-D1 precedent — nullable column + backfill + app-level default — and must be written into the spec, not assumed. |
| **Affected files / systems** | **Unchanged by this record; to be authored under the spec:** `backend/prisma/schema.prisma:1180–1187` (enum + "Ratified (G-5)" comment — enum untouched; comment may gain a P9-D2 pointer), `:1340–1367` (`StoreDomain` model — four nullable columns + relations to three new enums); one new file under `backend/prisma/migrations/` (none exists today); `backend/src/migration-safety.spec.ts` (positive test for the new migration; no rule change expected). |
| **Explicitly NOT introduced** | No schema edit, no migration file, no enum, no column — by this record. No `VERIFYING` value, now or by Phase 9. No G-5 amendment. |
| **Follow-up actions** | (1) Spec authors the migration plan: three `CREATE TYPE`s + four G-19-shaped nullable `ADD COLUMN`s, one statement each. (2) Spec defines the app-level default/backfill for `type` on existing rows (P6-D1 pattern). (3) Spec confirms `migration-safety.spec.ts` passes without modification. |
| **Explicit approval wording (recorded)** | `"P9-D2: B — Adopt the Phase 9 StoreDomain fields while preserving the G-5-ratified DomainVerificationStatus enum. Add: type, verificationMethod, lastCheckedAt, tlsStatus. Add the corresponding new enums required by those fields. DO NOT add VERIFYING. The G-5-ratified DomainVerificationStatus set remains: PENDING | VERIFIED | FAILED. No amendment to G-5 is authorized."` (Atharva — Project & Architecture Owner, 2026-09-20.) |

### P9-D2 — Decision Log

| Date | Owner | Choice | Approval wording (verbatim) | Reference |
|---|---|---|---|---|
| 2026-09-20 | Atharva — Project & Architecture Owner | **Gap identified, not decided** | `PHASE-9-START-GATE-AUDIT.md §5` — "OWNER DECISION REQUIRED (2)" | Start-gate audit |
| 2026-09-20 | Atharva — Project & Architecture Owner | **Options A/B/C/D presented, none recommended** | `PHASE-9-DECISION-DOCKET.md §3.5` | Decision docket |
| 2026-09-20 | Atharva — Project & Architecture Owner | **RESOLVED — RATIFIED — OPTION B; G-5 preserved, no `VERIFYING`** | `"P9-D2: B — … DO NOT add VERIFYING. … No amendment to G-5 is authorized."` | This record |

---

## P9-D3 — TLS Issuer / Renewal Mechanism: Vercel-managed (RATIFIED)

| Field | Content |
|---|---|
| **ID** | P9-D3 |
| **Owner** | Atharva — Project & Architecture Owner (architecture owner + ops owner) |
| **Date** | 2026-09-20 |
| **Status** | **RESOLVED — RATIFIED — OPTION A (Vercel-managed TLS).** |
| **Decision (question)** | Which TLS certificate issuer / renewal mechanism does Phase 9 build against? Master Plan §4.3 (line 601) and §15 DEPENDENCIES (lines 2076–2078) leave this explicitly **NOT FROZEN** — *"(Vercel-managed, Let's Encrypt via a proxy, Cloudflare for SaaS, …) is an implementation choice"*; §15 INFRASTRUCTURE IMPACT (line 2139–2140) calls it "D-minor". (`PHASE-9-START-GATE-AUDIT.md §6.1`; `PHASE-9-DECISION-DOCKET.md §4`.) |
| **Options considered** | **A.** Vercel-managed. **B.** Let's Encrypt through a proxy. **C.** Cloudflare for SaaS. **D.** Other. |
| **Owner Decision** | **A — Vercel-managed TLS.** Phase 9 builds the custom-domain integration around **Vercel-managed domain/TLS provisioning**. **No separate proxy layer and no Cloudflare for SaaS layer** is introduced. |
| **Rationale** | Owner's explicit choice. The owner's wording excludes a proxy and Cloudflare for SaaS; no further rationale was supplied. Recorded context (not the owner's reasoning): the frontend is already the single shared Vercel deployment (`frontend/vercel.json`), and Master Plan §15 INFRASTRUCTURE IMPACT already names *"Vercel 'add domain' via API"* as one of its two sketched onboarding paths. |
| **What this fixes (per `PHASE-9-DECISION-DOCKET.md §4.3`)** | **TLS termination:** at Vercel, for platform subdomains and custom domains alike — the backend resolver's `Host` input is what Vercel forwards. **`tlsStatus`:** transitions (`PENDING → ISSUED`, `→ ERROR`) are driven by Vercel's reported certificate/domain state for that hostname, obtained through Vercel's domain-management API — the exact read mechanism (poll vs. inspect-on-demand) is spec work. **Domain onboarding:** registering a merchant's custom hostname with the Vercel project via API after DNS verification; the merchant's DNS instruction targets Vercel. **Renewal:** Vercel-managed; Phase 9 owns no renewal job. **Backend/provider interface:** the "TLS provisioning (provider-specific, behind an interface)" seam in §15 BACKEND IMPACT is implemented by a Vercel adapter; the interface itself remains provider-neutral so the mechanism can be revisited under a future record without a resolver redesign. |
| **Dependencies** | Downstream: P9-D2 (`tlsStatus` semantics); P9-D6 (the wildcard `*.stores.printforge.world` must be attached to the Vercel project; merchants' CNAME target is Vercel-defined); P9-D4 is unaffected in Phase 9 (re-filed under Phase 12). **Does not reopen D8** (hosting topology: Render backend, Vercel frontend — unchanged). |
| **Affected files / systems** | **Unchanged by this record; spec scope:** `frontend/vercel.json` (currently SPA rewrite only); `backend/src/main.ts:38–40` (CORS — see spec); a new provider-neutral domain/TLS interface + Vercel adapter under the backend area §15 names (`backend/src/tenancy/store-domain.service.ts` — directory does not exist today; final placement is spec work); `docs/ops/ENVIRONMENT.md` / `docs/ops/DEPLOYMENT.md` (new config surface for Vercel API access — **names only; no token/secret value is ever recorded in this register**). |
| **Explicitly NOT introduced** | No Vercel API integration, no token, no environment variable, no proxy, no Cloudflare configuration, no DNS change — by this record. |
| **Follow-up actions** | (1) Spec defines the provider-neutral interface and the Vercel adapter's responsibilities (add hostname, inspect status, remove hostname). (2) Spec names the Vercel API credential as a Render environment secret **by name only**. (3) Ops pre-execution checklist (P9-D6) confirms Vercel project/domain configuration. |
| **Explicit approval wording (recorded)** | `"P9-D3: A — Vercel-managed TLS. Phase 9 should build the custom-domain integration around Vercel-managed domain/TLS provisioning. Do not introduce a separate proxy or Cloudflare for SaaS layer."` (Atharva — Project & Architecture Owner, 2026-09-20.) |

### P9-D3 — Decision Log

| Date | Owner | Choice | Approval wording (verbatim) | Reference |
|---|---|---|---|---|
| 2026-09-20 | Atharva — Project & Architecture Owner | **Flagged NOT FROZEN, not decided** | `PHASE-9-START-GATE-AUDIT.md §6.1` — "OWNER DECISION REQUIRED (3)" | Start-gate audit |
| 2026-09-20 | Atharva — Project & Architecture Owner | **Options A/B/C/D presented, none recommended** | `PHASE-9-DECISION-DOCKET.md §4` | Decision docket |
| 2026-09-20 | Atharva — Project & Architecture Owner | **RESOLVED — RATIFIED — OPTION A (Vercel-managed)** | `"P9-D3: A — Vercel-managed TLS. …"` | This record |

---

## P9-D4 — Custom-Domain Cookie Handling: RE-FILED UNDER PHASE 12 (RATIFIED as a re-filing; mechanism NOT decided)

| Field | Content |
|---|---|
| **ID** | P9-D4 |
| **Owner** | Atharva — Project & Architecture Owner (architecture + security owner) |
| **Date** | 2026-09-20 |
| **Status** | **RESOLVED — RATIFIED — RE-FILED UNDER PHASE 12.** The first-party-vs-proxied mechanism is **explicitly NOT decided** by this record; Phase 12 must decide it. |
| **Decision (question)** | Master Plan §15 INFRASTRUCTURE IMPACT (lines 2143–2148) flags *"REQUIRES DECISION-minor on first-party vs proxied cookie handling for custom domains"* because `SameSite=Strict` on the refresh cookie relies on a shared registrable domain that custom domains break, and files the item under Phase 9. The docket (`§5.4`) noted the item is load-bearing in Phase 9 only if customer auth ships in Phase 9, and that under P9-D1 = B it *"may need to be re-filed under Phase 12"*. Which is it? |
| **Options considered** | **First-party cookie handling.** **Proxied cookie handling.** (The repository names only this axis.) Plus, per docket §5.4: decide now for Phase 12 to inherit, or re-file the decision itself under Phase 12. |
| **Owner Decision** | **Re-file under Phase 12.** Customer authentication is owned by Phase 12 under P9-D1. **Phase 9 does not implement customer-session cookie handling for custom domains.** **Phase 12 must resolve first-party vs proxied customer cookie handling as part of the customer-authentication implementation.** **Merchant/platform-admin sessions remain on the fixed platform domain.** |
| **Rationale** | Owner's explicit choice, following directly from P9-D1 = B: the only cookie §15 ties to custom domains is the customer-auth cookie, which does not exist until Phase 12 builds customer auth. The merchant refresh cookie (`backend/src/auth/auth.service.ts:398–420`: `httpOnly, secure, sameSite: 'strict', path`, no `domain` attribute) is unaffected because merchant/platform admin stays on the fixed platform domain (§15 KEY RISKS line 2166–2167 — the owner's wording adopts this mitigation verbatim). |
| **Dependencies** | Upstream: **P9-D1** (Option B — the reason for re-filing). Downstream: **Phase 12's** start-gate must carry this item as an open decision with the same two-sided axis; P9-D3 (TLS at Vercel, no proxy) is context Phase 12 must take into account when weighing "proxied". |
| **Affected files / systems** | **None in Phase 9.** `backend/src/auth/auth.service.ts:398–420` — **must not be modified by Phase 9**. The future `/storefront/auth/*` controller (does not exist) — Phase 12. |
| **Explicitly NOT introduced / NOT decided** | No cookie change, no `domain` attribute, no `SameSite` change, no customer cookie — in Phase 9. The first-party vs proxied choice is **not made** here. |
| **Follow-up actions** | (1) The Phase 9 spec states the exclusion (no cookie/session change) and confirms the merchant cookie is out of scope. (2) Phase 12's decision docket must open this item as **P12-D? — Customer cookie handling on custom domains**, citing this record. |
| **Explicit approval wording (recorded)** | `"P9-D4: Re-file under Phase 12. Customer authentication is owned by Phase 12 under P9-D1. Phase 9 does not implement customer-session cookie handling for custom domains. Phase 12 must resolve first-party/proxied customer cookie handling as part of customer authentication implementation. Merchant/platform-admin sessions remain on the fixed platform domain."` (Atharva — Project & Architecture Owner, 2026-09-20.) |

### P9-D4 — Decision Log

| Date | Owner | Choice | Approval wording (verbatim) | Reference |
|---|---|---|---|---|
| 2026-09-20 | Atharva — Project & Architecture Owner | **Flagged REQUIRES DECISION-minor, not decided** | `PHASE-9-START-GATE-AUDIT.md §6.2` — "OWNER DECISION REQUIRED (4)" | Start-gate audit |
| 2026-09-20 | Atharva — Project & Architecture Owner | **Axis presented (first-party / proxied); re-filing path noted; nothing recommended** | `PHASE-9-DECISION-DOCKET.md §5` | Decision docket |
| 2026-09-20 | Atharva — Project & Architecture Owner | **RESOLVED — RATIFIED — RE-FILED UNDER PHASE 12; mechanism undecided** | `"P9-D4: Re-file under Phase 12. …"` | This record |

---

## P9-D5 — `platform-domains` Ownership: Phase 9 (RATIFIED)

| Field | Content |
|---|---|
| **ID** | P9-D5 |
| **Owner** | Atharva — Project & Architecture Owner (architecture owner) |
| **Date** | 2026-09-20 |
| **Status** | **RESOLVED — RATIFIED — OPTION A (Phase 9 owns the `platform-domains` approve/inspect surface).** |
| **Decision (question)** | The Master Plan disagrees with itself on who builds the platform-console domain-approval surface: §15 DEPENDENCIES (line 2075) and §22.3 (line 3267) treat it as something **Phase 5 provides**; §13 Phase 5 REPOSITORY AREAS (line 1503: *"`platform-domains`: … (Phase 9)"*) and §15 REPOSITORY AREAS (line 2083) treat it as something **Phase 9 builds**; shipped Phase 5 code deferred it (`backend/src/platform/dto/platform-tenant-view.interface.ts:35`: *"deferred — no domain-review capability exists in W3 (Phase 9 concern)"*). (`PHASE-9-START-GATE-AUDIT.md §7.1`; `PHASE-9-DECISION-DOCKET.md §6`.) |
| **Options considered** | **A.** Phase 9 owns it. **B.** Reopen/extend Phase 5. **C.** Other owner decision. |
| **Owner Decision** | **A — Phase 9 owns the `platform-domains` approve/inspect surface.** The shipped Phase 5 deferral and the Master Plan §13 / §15 repository-area ownership are the **operative scope** for Phase 9. Master Plan §15 DEPENDENCIES' and §22.3's "Phase 5 provides it" wording is thereby superseded for this item (Master Plan text is not edited; this record is the pointer). |
| **Rationale** | Owner's explicit choice; the owner's wording adopts the reading the shipped code already acted on. No further rationale supplied. |
| **Dependencies** | None blocking. Affects the Phase 9 spec's wave list (a platform-console wave under `@PlatformOnly()`, mirroring `backend/src/platform/platform.controller.ts`'s existing pattern, with `PlatformAuditLog` writes via the existing `common/audit` service). The §22.2 "Phase 5" prerequisite is recorded as satisfied — the domain-approval surface was never Phase 5's to deliver under this reading. |
| **Affected files / systems** | **Unchanged by this record; spec scope:** new `backend/src/platform/platform-domains/` module (does not exist); `backend/src/platform/dto/platform-tenant-view.interface.ts:35` (comment); `PlatformAuditLog` (`schema.prisma:1789`) — new `action` values for approve/override, no schema change. |
| **Follow-up actions** | Spec defines the platform-domains routes (inspect, approve/override verification, inspect TLS state) as a numbered wave with their audit-log actions. |
| **Explicit approval wording (recorded)** | `"P9-D5: A — Phase 9 owns the platform-domains approve/inspect surface. Treat the shipped Phase 5 deferral and the Master Plan §13 / §15 repository-area ownership as the operative scope for Phase 9."` (Atharva — Project & Architecture Owner, 2026-09-20.) |

### P9-D5 — Decision Log

| Date | Owner | Choice | Approval wording (verbatim) | Reference |
|---|---|---|---|---|
| 2026-09-20 | Atharva — Project & Architecture Owner | **Conflict reported, not resolved** | `PHASE-9-START-GATE-AUDIT.md §7.1` | Start-gate audit |
| 2026-09-20 | Atharva — Project & Architecture Owner | **Options A/B/C presented** | `PHASE-9-DECISION-DOCKET.md §6` | Decision docket |
| 2026-09-20 | Atharva — Project & Architecture Owner | **RESOLVED — RATIFIED — OPTION A** | `"P9-D5: A — Phase 9 owns the platform-domains approve/inspect surface. …"` | This record |

---

## P9-D6 — Platform Storefront Domain: `stores.printforge.world` (RATIFIED as intent; **domain amended 2026-09-25**; ownership/config UNCONFIRMED — ops checklist required)

| Field | Content |
|---|---|
| **ID** | P9-D6 |
| **Owner** | Atharva — Project & Architecture Owner (ops confirmation; architecture owner records the config surface) |
| **Date** | 2026-09-20 |
| **Status** | **RESOLVED — RATIFIED (intended domain fixed); DOMAIN AMENDED 2026-09-25 to `stores.printforge.world`. Registrar ownership, wildcard DNS, Vercel configuration, and API/backend configuration are NOT confirmed by this record — an explicit pre-execution Ops confirmation checklist is mandatory in the Phase 9 spec.** |
| **Decision (question)** | Master Plan §15 uses `*.stores.printforge.app` (line 2137) as an *example* wildcard and says the platform storefront domain "is config" (lines 2099–2100). Repository evidence establishes neither the domain nor its ownership/configuration (`PHASE-9-START-GATE-AUDIT.md §7, §10`; `PHASE-9-DECISION-DOCKET.md §7`). Which registrable domain hosts platform subdomains? |
| **Options considered** | Ops confirmation — the owner supplies the domain and confirms (or records as not yet available) each of: registrable domain, wildcard DNS ownership, frontend/Vercel configuration, API/backend configuration. |
| **Owner Decision** | **AMENDED 2026-09-25 — use `stores.printforge.world` as the platform storefront domain** (registrable domain `printforge.world`, registrar GoDaddy). This supersedes the domain named in the 2026-09-20 ratification below, which is preserved verbatim as the historical record; `stores.printforge.app` was never provisioned for this purpose and is not used anywhere in Phase 9. Nothing else in this record changes — the four-item Ops checklist, its hard-gate status, and the architecture are all unaffected, and **no item may be carried over as already-confirmed**, since every one of them refers to the hostname that changed. Original wording: **Use `stores.printforge.app` as the platform storefront domain.** This is the intended platform storefront domain for Phase 9; every `Store` auto-gets `{store-slug}.stores.printforge.world` as its `PLATFORM_SUBDOMAIN` `StoreDomain`. **However, repository evidence does not currently prove** registrar ownership, wildcard DNS, Vercel configuration, or API configuration. **Therefore the Phase 9 implementation spec must include an explicit pre-execution Ops confirmation checklist for:** (1) ownership of `stores.printforge.world`; (2) `*.stores.printforge.world` wildcard DNS; (3) Vercel domain configuration; (4) API/backend configuration. **No secrets are recorded in this register.** |
| **Rationale** | Owner's explicit choice, with the owner's own caveat that the choice is intent, not proof of provisioning. |
| **Dependencies** | Downstream: the literal `hostname` written into every auto-created `PLATFORM_SUBDOMAIN` row and into the Tenant #1 backfill (§15 DATABASE / MIGRATION IMPACT); the platform origins in the CORS allow-list; **P9-D3** (the wildcard is attached to the Vercel project; the merchant CNAME target is Vercel-defined). **Nothing in Phase 9 may be executed against production until the four checklist items are confirmed** — the spec must gate its ops cutover wave on them. |
| **Affected files / systems** | **Unchanged by this record; spec scope:** a new platform-storefront-domain configuration value in `backend/src/common/config/configuration.ts` + `env.validation.ts` + `docs/ops/ENVIRONMENT.md` (none exists; name is spec work); `frontend/vercel.json`; DNS for `printforge.world` (external, ops-owned; GoDaddy). |
| **Explicitly NOT recorded** | No registrar credential, DNS-provider credential, Vercel token, API key, or any other secret. No claim that the domain is registered or that any DNS/Vercel record exists. |
| **Follow-up actions** | (1) Spec §17 carries the four-item Ops checklist as a hard pre-execution gate. (2) Ops confirms each item (yes / no / not yet) in the checklist before any production step; confirmations are recorded by reference (evidence id), never by secret. |
| **Explicit approval wording (recorded)** | `"P9-D6: Use: stores.printforge.app as the platform storefront domain. This is the intended platform storefront domain for Phase 9. However, repository evidence does not currently prove registrar ownership, wildcard DNS, Vercel configuration, or API configuration. Therefore the Phase 9 implementation spec must include an explicit pre-execution Ops confirmation checklist for: ownership of stores.printforge.app; *.stores.printforge.app wildcard DNS; Vercel domain configuration; API/backend configuration. No secrets are to be recorded in DECISIONS.md."` (Atharva — Project & Architecture Owner, 2026-09-20.) |

### P9-D6 — Decision Log

| Date | Owner | Choice | Approval wording (verbatim) | Reference |
|---|---|---|---|---|
| 2026-09-20 | Atharva — Project & Architecture Owner | **UNKNOWN — ops confirmation required** | `PHASE-9-START-GATE-AUDIT.md §7, §10` | Start-gate audit |
| 2026-09-20 | Atharva — Project & Architecture Owner | **Four-item confirmation list presented** | `PHASE-9-DECISION-DOCKET.md §7.3` | Decision docket |
| 2026-09-20 | Atharva — Project & Architecture Owner | **RESOLVED — RATIFIED — `stores.printforge.app` (intent); ops checklist mandatory** | `"P9-D6: Use: stores.printforge.app … No secrets are to be recorded in DECISIONS.md."` | This record |
| 2026-09-25 | Atharva — Project & Architecture Owner | **AMENDED — platform storefront domain is `stores.printforge.world`** (registrar GoDaddy); `stores.printforge.app` withdrawn, never provisioned | `"The actual domain I own and will use for Phase 9 platform storefronts is: printforge.world … Therefore the intended platform storefront domain is: stores.printforge.world. Do NOT use printforge.app or stores.printforge.app."` | This record; spec §5.2/§17.1 updated the same day |

---

## P9-D7 — Verification Job Timing: on-demand only in Phase 9 (RATIFIED)

| Field | Content |
|---|---|
| **ID** | P9-D7 |
| **Owner** | Atharva — Project & Architecture Owner (architecture owner) |
| **Date** | 2026-09-20 |
| **Status** | **RESOLVED — RATIFIED — OPTION A (on-demand verification only in Phase 9; scheduled/cron verification deferred to Phase 11).** |
| **Decision (question)** | Master Plan §15 BACKEND IMPACT (line 2113–2118) describes *"a verification job (Phase 11 cron / on-demand)"*. Is Phase 9 on-demand only, or does it also ship a scheduled check? (`PHASE-9-DECISION-DOCKET.md §8`.) |
| **Options considered** | **A.** On-demand only in Phase 9; cron deferred to Phase 11. **B.** Both on-demand and a scheduled check in Phase 9. **C.** Other owner decision. |
| **Owner Decision** | **A — On-demand verification only in Phase 9.** Scheduled/cron verification is **deferred to Phase 11**. Phase 9 **may expose an explicit on-demand verification operation** (merchant-triggered and/or platform-triggered), but **must not introduce the Phase 11 scheduled verification worker**. |
| **Rationale** | Owner's explicit choice, matching §15's own sequencing ("Phase 11 cron"). No further rationale supplied. |
| **Dependencies** | Coupled to **P9-D2**: with no `VERIFYING` value and no scheduled worker, the on-demand check is a synchronous `PENDING → VERIFIED | FAILED` transition (a failed check stays `PENDING`-then-`FAILED` with a recorded reason; `lastCheckedAt` records the attempt). Phase 11 (Master Plan §17) inherits the scheduled re-check. Consistent with the repository's own `ScheduleModule.forRoot()` discipline (one registration in `AppModule`) — no new cron is registered by Phase 9. |
| **Affected files / systems** | **Unchanged by this record; spec scope:** the domain-verification service (§15-named `backend/src/tenancy/store-domain.service.ts`; placement is spec work) exposing an on-demand `verify` operation; no scheduler wiring. |
| **Follow-up actions** | (1) Spec defines the on-demand operation (who may call it — merchant via the tenant admin surface, platform via `platform-domains`; rate-limiting via the existing `ThrottlerGuard`). (2) Phase 11's deferred-items list gains "scheduled domain re-verification". |
| **Explicit approval wording (recorded)** | `"P9-D7: A — On-demand verification only in Phase 9. Scheduled/cron verification is deferred to Phase 11. Phase 9 may expose an explicit on-demand verification operation, but must not introduce the Phase 11 scheduled verification worker."` (Atharva — Project & Architecture Owner, 2026-09-20.) |

### P9-D7 — Decision Log

| Date | Owner | Choice | Approval wording (verbatim) | Reference |
|---|---|---|---|---|
| 2026-09-20 | Atharva — Project & Architecture Owner | **Facts recorded, not decided** | `PHASE-9-DECISION-DOCKET.md §8.2` | Decision docket |
| 2026-09-20 | Atharva — Project & Architecture Owner | **RESOLVED — RATIFIED — OPTION A** | `"P9-D7: A — On-demand verification only in Phase 9. …"` | This record |

---

## P9-D8 — Resolver Kill-Switch: `PlatformConfig` row (RATIFIED; flag semantics deferred to the spec)

| Field | Content |
|---|---|
| **ID** | P9-D8 |
| **Owner** | Atharva — Project & Architecture Owner (architecture owner + ops owner) |
| **Date** | 2026-09-20 |
| **Status** | **RESOLVED — RATIFIED — `PlatformConfig` row.** The exact runtime flag semantics are **explicitly deferred to the Phase 9 implementation specification**, which must define them **before** the resolver fallback is removed. |
| **Decision (question)** | Master Plan §15 ROLLBACK / RECOVERY (lines 2203–2206) requires a kill-switch to *"fall back to 'single store = Tenant #1's primary store' resolution (pre-Phase-9 behavior) if multi-domain resolution regresses, without a redeploy."* Today's pre-Phase-9 behaviour is `backend/src/common/tenant/storefront-tenant.resolver.ts:57–74` (Host → `StoreDomain`; else most-recently-created `Tenant`). No runtime flag exists. Which mechanism? (`PHASE-9-START-GATE-AUDIT.md §10, §13.1`; `PHASE-9-DECISION-DOCKET.md §9`.) |
| **Options considered** | Phase 3 advisory/enforced per-module flag pattern (Master Plan §12 lines 1236–1244 — env-var based per P3-D1). Environment-variable flag. `PlatformConfig` row (Master Plan §4.4 D11: *"a `PlatformConfig` table is new in Phase 5 if needed"*). Other. |
| **Owner Decision** | **`PlatformConfig` row.** Use a **runtime-readable `PlatformConfig`-based kill-switch** so the resolver can be switched between Phase 9 domain resolution and the pre-Phase-9 single-store fallback **without requiring a redeploy**. **The exact runtime flag semantics must be defined in the Phase 9 implementation specification before the resolver fallback is removed.** |
| **Rationale** | Owner's explicit choice. The owner's wording supplies the rationale: "without requiring a redeploy" — which an environment variable on Render does not satisfy (`docs/ops/PHASE-8-PRODUCTION-ACTIVATION.md:147`: Render env-var changes *"take effect on the next deploy"*). |
| **Relationship to P3-D1 (distinct, not conflicting)** | P3-D1 (`RESOLVED — ENVIRONMENT VARIABLE`, 2026-09-07) governs the Phase 3 `TENANT_ENFORCEMENT_<MODULE>` advisory/enforced rollout flags and is **unchanged**. P9-D8 governs a different control — the storefront domain-resolution mode — whose requirement (§15: no redeploy) differs from P3-D1's ("infrequently-changed", restart acceptable). Two mechanisms for two controls; **P3-D1 is not amended, reopened, or superseded.** |
| **Dependency disclosed (schema)** | **No `PlatformConfig` model exists in `backend/prisma/schema.prisma` today** (verified by search; Phase 5 did not create it — Master Plan §4.4 D11 only named it as "new in Phase 5 if needed"). Adopting this decision therefore requires Phase 9 to introduce a `PlatformConfig` table by an **additive `CREATE TABLE`** (inside `migration-safety.spec.ts`'s existing allowances). Its shape (key/value; platform-scoped, no `tenantId`; audit on write) is spec work. Reads must be cheap (in-process cache with short TTL + explicit bust on write) so the kill-switch does not add a DB round-trip to every storefront request — a spec requirement, not decided here. Writes go through the platform console (`@PlatformOnly()`, `SUPER_ADMIN`) with a `PlatformAuditLog` entry. |
| **Dependencies** | Must be defined and shipped **before** `storefront-tenant.resolver.ts`'s most-recent-tenant fallback is replaced by unknown-host → 404 (`PHASE-9-START-GATE-AUDIT.md §13.1`); Master Plan §5 Principle 4 (paired positive/negative tests before the enforcement flip). Consumers of the current resolver — `cart`, `checkout`, `uploads`, `app-setting`, `tenant-lifecycle.guard` — inherit the switch. |
| **Affected files / systems** | **Unchanged by this record; spec scope:** `backend/prisma/schema.prisma` (new `PlatformConfig` model); one migration (`CREATE TABLE`); `backend/src/common/tenant/storefront-tenant.resolver.ts:57–74`; `backend/src/common/tenant/tenant-context.guard.ts:152–185`; `backend/src/platform/` (a `@PlatformOnly()` route to read/flip the flag, audit-logged). |
| **Explicitly NOT decided** | The flag's key name, value set, default, cache TTL, fail-open/fail-closed behaviour on read failure, and who may flip it — all spec items, per the owner's wording. |
| **Follow-up actions** | (1) Spec §15 defines the full flag semantics and the required paired tests. (2) Spec sequences the `PlatformConfig` table + flag **ahead of** any resolver behaviour change. |
| **Explicit approval wording (recorded)** | `"P9-D8: PlatformConfig row. Use a runtime-readable PlatformConfig-based kill-switch so the resolver can be switched between Phase 9 domain resolution and the pre-Phase-9 single-store fallback without requiring a redeploy. The exact runtime flag semantics must be defined in the Phase 9 implementation specification before the resolver fallback is removed."` (Atharva — Project & Architecture Owner, 2026-09-20.) |

### P9-D8 — Decision Log

| Date | Owner | Choice | Approval wording (verbatim) | Reference |
|---|---|---|---|---|
| 2026-09-20 | Atharva — Project & Architecture Owner | **Requirement recorded; precedents listed; none selected** | `PHASE-9-DECISION-DOCKET.md §9` | Decision docket |
| 2026-09-20 | Atharva — Project & Architecture Owner | **RESOLVED — RATIFIED — `PlatformConfig` row; semantics → spec** | `"P9-D8: PlatformConfig row. …"` | This record |

## P9-D9 — Exit Criterion `E-3` Evidence Route: **ROUTE A** — real owner-supplied custom domain (RATIFIED; environment = **PRODUCTION**, ordered **after** the W8 prerequisites — ordering decided 2026-09-25; **execution NOT authorized**)

| Field | Content |
|---|---|
| **ID** | P9-D9 |
| **Owner** | Atharva — Project & Architecture Owner |
| **Date** | 2026-09-25 |
| **Status** | **RESOLVED — RATIFIED** (evidence route, TLS-evidence discipline and required evidence set are fixed). **NOT AUTHORIZED FOR EXECUTION** — no E-3 step may run until the owner gives explicit execution authorization, and the test hostname has **not yet been supplied**. **ORDERING DECIDED 2026-09-25:** the environment is **PRODUCTION**, and `E-3` is **deliberately ordered last** — it runs only after (a) §17.1 item 3 (wildcard certificate evidence for `*.stores.printforge.world`), (b) §17.1 item 4 (required Render production configuration), and (c) every other W8 infrastructure gate the ratified runbook requires ahead of the §17.2 `host_resolution` activation are **PASS**; then the §17.2 sequence runs, `host_resolution` is activated **only** through the existing ratified runbook, and `E-3` executes after that. Verification method fixed as **`DNS_TXT`**. **Still NOT AUTHORIZED FOR EXECUTION**, and the test hostname is still not supplied. |
| **Decision (question)** | Spec §19 states `E-3` (*"Custom-domain verification + TLS working"*) with **two alternative** evidence routes: (A) *"One real custom domain (owner-supplied test domain) taken from add → `VERIFIED` → `ISSUED` → served, with audit rows"*, or (B) *"if no test domain is available, the e2e suite + a Vercel sandbox project run recorded"*. The spec elaborates neither route into a procedure (the word "sandbox" appears once in a Vercel sense, in the `E-3` cell itself), and it does not define what Route B's *"recorded"* must contain. Which route satisfies `E-3`, and what evidence is required? |
| **Options considered** | **Route A** — one real owner-controlled custom domain driven through the full lifecycle in the real system. **Route B** — the existing Phase 9 suites plus a recorded Vercel sandbox-project run, whose acceptance definition the spec leaves undefined and which would therefore have needed its own decision. |
| **Owner Decision** | **ROUTE A — APPROVED, using one real owner-controlled spare custom domain.** (1) **Eligibility:** the hostname must **not** be under `stores.printforge.world`, must **not** be the `FRONTEND_URL` host, and must **not** be the API host — restating spec §6.2's merchant-self-service rejections as owner-binding constraints on the test domain. (2) **Flow:** `E-3` must demonstrate the **complete** flow `add → VERIFIED → ISSUED → served`; no partial run satisfies it. (3) **TLS evidence — two independent items, not one:** in addition to PrintForge's **derived** `tlsStatus=ISSUED`, an **HTTPS observation of the test hostname showing that HTTPS is actually working** must be collected, and it must be **recorded as separate evidence from the derived Vercel `ISSUED` state**. (4) **No implementation change:** the ratified Phase 9 implementation is **not** to be modified unless a **separate implementation gap is proven**; this record does not authorize an adapter, mapping, schema or test change. (5) **Required evidence set** — all of: `StoreDomain` add response **without recording the verification token**; public-resolver DNS verification; `VERIFIED` state with `verifiedAt` and `lastCheckedAt`; `TenantAuditLog` verification evidence; the Vercel `addDomain` result; the `tlsStatus` transition; `store_domain.tls_refreshed` audit evidence; the HTTPS serving observation; a storefront response from the custom hostname; and primary-domain evidence **only if** set-primary is actually exercised. (6) **Nothing executes yet** — preparation only, then stop and wait for explicit authorization. **(7) Execution environment and ordering (added 2026-09-25):** `E-3` Route A executes against **PRODUCTION**, and **not yet** — the existing W8 prerequisites are cleared first: §17.1 item 3 (wildcard certificate evidence for `*.stores.printforge.world`), §17.1 item 4 (required Render production configuration), and any other W8 infrastructure gate the existing runbook requires before the §17.2 `host_resolution` activation. Once those are **PASS**: proceed through the existing W8 production execution sequence; activate `host_resolution` **only** through the existing ratified runbook (§17.2 — no ad-hoc flip); then execute `E-3` Route A against production. **(8) Verification method: `DNS_TXT`** — fixed, with an owner-supplied test hostname that must pass every existing §6.2 eligibility check and must not be under `stores.printforge.world`, the `FRONTEND_URL` host, or the API host. The §19.1 evidence discipline is **unchanged and preserved**: `add → VERIFIED → ISSUED → served`, with the derived `tlsStatus=ISSUED`, the independent HTTPS certificate observation, the storefront serving response, the paired generic 404 for an unverified custom host, and the required audit rows each recorded **separately**. |
| **Rationale** | Route A is the spec's first-listed and stronger option: it exercises the real verification service, the real Vercel adapter and the real §4.3 serving gate, rather than a mocked suite plus an undefined sandbox artifact. Choosing it also avoids having to invent Route B's missing acceptance definition. Requirement (3) is the substantive addition: `tlsStatus=ISSUED` is **derived**, not observed — `vercel-domain-hosting.provider.ts:118–121` computes `certificate: 'issued'` from `verified === true && !misconfigured`, reading **no** certificate field — so on its own it evidences configuration, not a working certificate. Requiring a separate HTTPS observation closes that evidential gap **without** amending §7.2's mapping row or the adapter (which 🔎 S-8 leaves free to confirm Vercel's fields at implementation time), and keeps the two facts distinguishable in the record. |
| **Dependencies** | Gates: spec §19 `E-3`, and therefore Phase 9 exit. **Independent of** §17.1 item 3 (the `*.stores.printforge.world` wildcard certificate) and item 4 (Render configuration), which remain separately blocked — `E-3` concerns `type=CUSTOM` rows, and §4.3 does not consult `tlsStatus` for `PLATFORM_SUBDOMAIN` rows, so no wildcard observation can satisfy `E-3` and `E-3` does not require the wildcard certificate to exist. Upstream: P9-D3 (Vercel-managed TLS), P9-D7 (on-demand only — §7.2 states polling is *none* in Phase 9, so `tlsStatus` advances only when an operator invokes "Refresh TLS status"), P9-S2 (the add/verify/refresh calls require an **OWNER** of the test tenant). **Ordering dependency added 2026-09-25:** although `E-3` remains *evidentially* independent of §17.1 items 3 and 4 (a wildcard observation can never satisfy it, and it does not require the wildcard certificate to exist), its **execution** is now *sequenced behind* them by owner decision, because it runs against production and its "served" evidence (§19.1 slot 9) requires `host_resolution` to be active — which is §17.2 step 7, reachable only after the §17.1 gate and the §17.2 steps 1–6 that precede it (G-9 backup, image deploy, `prisma migrate deploy`, backfill + reconciliation, CORS dry-run check, legacy-mode canary). `E-3` is therefore the **last** W8 activity, not a parallel one. |
| **Affected files / systems** | **Documentation only.** This record, plus the `E-3` evidence slots added at spec §19.1. **No** application code, schema, migration, test, environment variable, DNS record, Vercel configuration, Render configuration or deployment is changed by this record. |
| **Explicitly NOT recorded** | The test hostname — **not supplied at the time of this record**, so no domain literal appears here and none was inferred. The `verificationToken` (secret-shaped; item 5 records only that a token was issued). Any registrar, DNS-provider, Vercel or Render credential. No claim that any E-3 step has been performed. |
| **Follow-up actions** | (1) Spec §19.1 carries the ten evidence slots, unfilled. (2) Owner supplies the test hostname; it is checked against the three eligibility constraints **before** any step runs. (3) Owner gives explicit execution authorization. (4) Evidence is recorded into §19.1 as it is actually observed — no slot may be filled from expectation. (5) If execution reveals a real implementation gap, it is raised as its own record; it is **not** fixed silently under this one. **(6) Added 2026-09-25 — ordering:** the immediate work is **not** `E-3`; it is §17.1 item 3, then §17.1 item 4, then the §17.2 sequence. `E-3` is picked up only after `host_resolution` is active via the ratified runbook. (7) The environment question this record's earlier follow-up (2) left open is now **answered: production**; the test hostname remains outstanding. |
| **Explicit approval wording (recorded)** | `"OWNER DECISION — PHASE 9 W8 E-3. I approve E-3 Route A using an owner-controlled spare custom domain. … E-3 route: ROUTE A — Use one real owner-supplied custom domain. The domain must not be under stores.printforge.world. It must not be the FRONTEND_URL host. It must not be the API host. TLS evidence: E-3 must demonstrate the complete flow: add → VERIFIED → ISSUED → served. In addition to PrintForge's derived tlsStatus=ISSUED, collect an HTTPS observation of the test hostname showing that HTTPS is actually working. Record the HTTPS observation as separate evidence from the derived Vercel ISSUED state. Do not modify the ratified Phase 9 implementation unless a separate implementation gap is proven. … Do NOT execute anything yet. … Stop after preparation and wait for my explicit authorization to execute E-3."` (Atharva — Project & Architecture Owner, 2026-09-25.) **Ordering decision, 2026-09-25 (verbatim):** `"PHASE 9 W8 — OWNER DECISION: E-3 EXECUTION ORDER. … I choose to execute E-3 Route A against PRODUCTION, after the required W8 infrastructure prerequisites are cleared. E-3 environment: PRODUCTION. Execution ordering: Do NOT execute E-3 yet. First clear the existing W8 prerequisites: §17.1 item 3 — wildcard certificate evidence for *.stores.printforge.world; §17.1 item 4 — required Render production configuration; Any other explicitly required W8 infrastructure gate that the existing runbook requires before the §17.2 host_resolution activation. After those prerequisites are PASS: proceed through the existing W8 production execution sequence; activate host_resolution only through the existing ratified runbook; then execute E-3 Route A against production. E-3 execution: Verification method: DNS_TXT. Use an owner-supplied test hostname. … The hostname must pass all existing §6.2 eligibility checks. … Update the decision/evidence documentation to record this ordering decision, but make no implementation or production changes. … Stop and wait for further authorization."` (Atharva — Project & Architecture Owner, 2026-09-25.) |

### P9-D9 — Decision Log

| Date | Owner | Choice | Approval wording (verbatim) | Reference |
|---|---|---|---|---|
| 2026-09-25 | Atharva — Project & Architecture Owner | **Both `E-3` routes presented; spec shown to define no procedure for either, and no acceptance definition for Route B** | Read-only spec/code reading of §19, §6.3, §7.1–§7.3, §4.3, §14.2 | In-conversation preparation report, 2026-09-25 |
| 2026-09-25 | Atharva — Project & Architecture Owner | **RESOLVED — RATIFIED — ROUTE A; HTTPS observation required as evidence separate from the derived `ISSUED`; ten-item evidence set fixed; execution NOT authorized** | `"I approve E-3 Route A using an owner-controlled spare custom domain. … Record the HTTPS observation as separate evidence from the derived Vercel ISSUED state. … Stop after preparation and wait for my explicit authorization to execute E-3."` | This record; spec §19.1 added the same day |
| 2026-09-25 | Atharva — Project & Architecture Owner | **ORDERING DECIDED — environment = PRODUCTION; `E-3` sequenced LAST, after §17.1 items 3 and 4 and the §17.2 runbook activation of `host_resolution`; method = `DNS_TXT`; still NOT authorized to execute** | `"I choose to execute E-3 Route A against PRODUCTION, after the required W8 infrastructure prerequisites are cleared. … Do NOT execute E-3 yet. … activate host_resolution only through the existing ratified runbook; then execute E-3 Route A against production. … Verification method: DNS_TXT."` | This record; spec §19.1 updated the same day |

📐 **Post-docket record.** The Phase 9 decision docket closed 2026-09-20 with P9-D1…P9-D8. P9-D9 is a **later owner decision taking the next number in sequence** (as P7-D5 did after the Phase 7 docket); it **does not reopen, amend or supersede** P9-D1…P9-D8, P9-S2/P9-S7/P9-S14, or G-21, and it adds nothing to the spec's schema footprint.

---

## P9-D10 — Tenant #1 Custom-Domain Canary: **OPTION B — `www.printforge.world`** (RATIFIED; amends the Phase 9 implementation contract only)

| Field | Content |
|---|---|
| **ID** | P9-D10 |
| **Owner** | Atharva — Project & Architecture Owner |
| **Date** | 2026-09-25 |
| **Status** | **RESOLVED — RATIFIED.** Tenant #1's optional `CUSTOM` canary hostname is **`www.printforge.world`**, replacing `www.printforge.in`. Spec §4.1.3/§4.1.1/§9/§16.2/§17.2/§18.1/`E-5` amended and §16.2a added the same day; backfill constant and B-3 e2e test retargeted. **No production, DNS, Vercel, Render, deployment, G-9, migration, backfill or mode-flip action accompanies this record** — production remains frozen until the amended W8 gate is re-verified. |
| **Decision (question)** | §16.2 B-3 hardcoded `www.printforge.in` as Tenant #1's `CUSTOM`, `VERIFIED`, `ISSUED`, **primary** row, justified in spec and code by two claims — *"ownership is established by current production service"* and *"the certificate Vercel already serves"*. A 2026-09-25 read-only investigation found both false: `printforge.in` is registered (`whois status: ACTIVE`) but has **never been delegated** — `NXDOMAIN` from `1.1.1.1`, `8.8.8.8` and `9.9.9.9`, with no `NS`, no `A`, no `SOA` — and production `FRONTEND_URL` is the shared frontend's own Vercel origin, not `www.printforge.in`. `Readme.md` records the cutover as **not** done, and Master Plan §15 MIGRATION IMPACT calls this row **"(optionally)"**, conditional on that pending cutover. Which hostname should B-3 register? |
| **Options considered** | **A** — drop B-3 entirely (permitted by §15's "(optionally)"), exercising the `CUSTOM` path only through `E-3`'s test domain. **B** — retarget B-3 to a hostname the owner actually controls. **C** — delegate `printforge.in`, attach it at Vercel, issue a certificate, and leave B-3 as written. |
| **Owner Decision** | **OPTION B — Tenant #1's `CUSTOM` canary hostname is `www.printforge.world`.** (1) The previous `www.printforge.in` premise was **stale and incorrect**, and was wrong at the time it was written into the spec. (2) `www.printforge.world` sits under the owner-controlled, already-delegated `printforge.world`. (3) It is **intentionally a `CUSTOM` domain, not a `PLATFORM_SUBDOMAIN`** — it is not under `stores.printforge.world`, so §6.2's platform-domain rejection does not reach it and §4.3 still applies the full `VERIFIED` + `ISSUED` gate to it. (4) **Purpose:** preserve B-3's genuine `CUSTOM` verification / TLS / serving-gate and primary-canonical coverage, which a `PLATFORM_SUBDOMAIN` row could not provide — §4.3 consults neither verification nor TLS for those. (5) **`stores.printforge.world` remains the platform storefront domain**, and the platform subdomain remains `{store.slug}.stores.printforge.world`. (6) **No architecture change.** (7) This is an amendment to the **Phase 9 implementation contract** concerning Tenant #1's *optional* custom-domain canary — nothing more. (8) A **mandatory operator precondition** is attached (§16.2a): DNS delegation, hosting-provider attachment, **and an independent HTTPS/TLS observation** must all be confirmed **before** production B-3 may assert `VERIFIED`/`ISSUED`. The implementation may **not** claim ownership or TLS merely because a hostname is configured in source code. |
| **Rationale** | Option B is the only option that both removes the false premise and keeps what B-3 was for. Option A would have left the `CUSTOM` path exercised only by `E-3`, losing the primary/canonical coverage. Option C would have required provisioning a second domain (`www.` **and** an API host) purely to satisfy a canary. The decisive fact is that B-3's own stated purpose — *"so the current storefront keeps working"* (§15) — was **not being served**: the current storefront is the shared Vercel origin, and `www.printforge.in` has never served anything. Precondition (8) exists because B-3 writes ownership and TLS as *recorded facts* with no live check, and `isPrimary = true` makes the hostname Tenant #1's `canonicalOrigin` (§11) — an unreachable value there would `location.replace` live storefront traffic into a dead origin and 301 crawler files to it. |
| **Dependencies** | Unblocks §17.2 steps 4–10, which could not safely run with the previous value. Now gated on: §17.1 item 4 (Render production configuration, still outstanding) and, separately, §16.2a's three preconditions for `www.printforge.world` — **none of which is performed by this record**. Independent of `E-3`/⚖️ P9-D9, which concerns a different, owner-supplied test hostname; `E-3` remains sequenced last. |
| **Affected files / systems** | **Docs:** this record; spec §4.1.1, §4.1.3, §9, §16.2 + new §16.2a, §17.2 steps 5/9 + its note, §18.1, `E-5`; `docs/ops/ENVIRONMENT.md`; `docs/ops/PRODUCTION-SMOKE-TEST.md`; `docs/ops/DEPLOYMENT.md`. **Code/tests:** `backend/prisma/backfill/phase9-w2-store-domain-backfill.ts` (`TENANT_1_CUSTOM_HOSTNAME` + B-3 comments); `backend/test/e2e/phase9-store-domain-backfill.e2e-spec.ts`; `frontend/vercel.json`; `frontend/src/vercelRewrites.test.ts`; `frontend/.env.example`; `frontend/src/services/api/client.ts` (comment). **No** Prisma schema, migration SQL, guard, route or resolver change. **No** external system touched. |
| **Explicitly NOT recorded / NOT decided** | No DNS, Vercel, Render, certificate, deployment, G-9, migration, backfill or mode-flip action. No claim that `www.printforge.world` is currently delegated, attached or TLS-bearing — §16.2a governs that. No secret. **Two items are explicitly left OPEN:** (i) whether the `FRONTEND_URL` origin should itself carry a `StoreDomain` row so its storefront keeps serving after the §17.2 step-7 flip (see the corrected §4.1.3 row — with B-3 no longer registering the admin origin, that origin has no row and storefront routes under it would 404 in `host_resolution`); (ii) the `sameSite: 'strict'` refresh-cookie exposure noted in the Decision Log below. |
| **Follow-up actions** | (1) Re-verify the amended W8 gate before any production step. (2) Satisfy §16.2a's three preconditions and record the evidence before running B-3. (3) Decide OPEN item (i) above before §17.2 step 7. (4) `frontend/vercel.json`'s SEO rewrites now target the live API origin; keep that literal in step with `VITE_API_BASE_URL` — Vercel does not interpolate env vars into `vercel.json`, and `frontend/src/vercelRewrites.test.ts` now guards against the dead host returning. |
| **Explicit approval wording (recorded)** | `"We have made an OWNER DECISION for Phase 9 W8: Choose Option B — replace the stale Tenant #1 custom-domain canary www.printforge.in with: www.printforge.world. … printforge.in is registered but currently NXDOMAIN / not delegated. The Master Plan makes the existing custom domain optional and conditional on a DNS cutover. www.printforge.in was incorrectly hardened into the Phase 9 implementation spec as if it were already live. www.printforge.world is under the owner's already-controlled printforge.world domain. www.printforge.world is NOT under stores.printforge.world, therefore it remains a genuine CUSTOM hostname and preserves the purpose of B-3: exercising CUSTOM + VERIFIED + ISSUED + primary/canonical behavior. P9-D6 (stores.printforge.world) remains unchanged. This is a narrow Phase 9 spec/code amendment. Do not change the architecture or previously ratified P9 decisions. … Production remains frozen until the amended W8 gate is re-verified."` (Atharva — Project & Architecture Owner, 2026-09-25.) |

### P9-D10 — Decision Log

| Date | Owner | Choice | Approval wording (verbatim) | Reference |
|---|---|---|---|---|
| 2026-09-25 | Atharva — Project & Architecture Owner | **Discrepancy investigated read-only; `www.printforge.in` shown `NXDOMAIN` across three public resolvers, `whois status: ACTIVE`; Master Plan "(optionally)" and `Readme.md` "not cut over yet" established; three options presented** | Read-only investigation of §4.1.3, §16.2, §17.2, §18.1, §19, Master Plan §15, `Readme.md:399`, and the B-3 code path | In-conversation investigation report, 2026-09-25 |
| 2026-09-25 | Atharva — Project & Architecture Owner | **RESOLVED — RATIFIED — OPTION B: `www.printforge.world`, deliberately `CUSTOM`; §16.2a operator precondition binding; architecture and all prior P9 records unchanged; production frozen** | `"Choose Option B — replace the stale Tenant #1 custom-domain canary www.printforge.in with: www.printforge.world. … Do not change the architecture or previously ratified P9 decisions."` | This record; spec §16.2/§16.2a and the backfill/e2e amendments, same day |

📐 **Scope guarantee.** **P9-D1 through P9-D9 remain unchanged**, including **P9-D6** (`stores.printforge.world` is still the platform storefront domain) and **P9-D9** (`E-3` Route A, production, sequenced last). **P9-S2, P9-S7, P9-S14 and G-21 remain unchanged.** No enum, schema, migration, guard, permission, resolver or CORS rule is altered; ⚖️ G-5's `{PENDING, VERIFIED, FAILED}` is untouched. This record changes one hostname, the premises that were stated about it, and the preconditions for asserting them.

📐 **Historical records untouched.** `PHASE-9-START-GATE-AUDIT.md`, `PHASE-9-DECISION-DOCKET.md`, `PRINTFORGE-SAAS-IMPLEMENTATION-MASTER-PLAN-v1.0.md` (frozen input), `PHASE-0-*` and `docs/architecture/history/BLUEPRINT-v1.2-HARDENING.md` are **not** edited — their `www.printforge.in` references are the historical record of what was believed at the time, and the audit's own quotation of §15's "optional" wording is what made this correction findable.

⚠️ **Noted, NOT decided — refresh-cookie exposure (out of scope, pre-existing).** `auth.service.ts:403–409` sets the refresh cookie with `sameSite: 'strict'` and no `domain`. That was sound while the frontend and API shared the registrable domain `printforge.in`. With the frontend on its Vercel origin and the API on its Render origin, they are **different registrable domains**, so a `SameSite=Strict` cookie is not sent cross-site. `frontend/src/services/api/client.ts` still documents the old same-registrable-domain reasoning. This is a pre-existing consequence of the same never-completed cutover, **not** created by this record; ⚖️ P9-D4 re-filed custom-domain cookie handling to **Phase 12**, and no change is made here. Raised so it is not discovered during §17.2.

---

## P9-D11 — Frontend Vercel Deployment Origin: **OPTION C — internal deployment origin only, no `StoreDomain` row** (RATIFIED)

| Field | Content |
|---|---|
| **ID** | P9-D11 |
| **Owner** | Atharva — Project & Architecture Owner |
| **Date** | 2026-09-25 |
| **Status** | **RESOLVED — RATIFIED.** Closes the OPEN item P9-D10 recorded against §4.1.3. Spec §4.1.3 amended to a decided rule, new §4.1.3a added, §17.2 step 7 unblocked, §18.1 gains two assertions, `E-5` clarified. **No `StoreDomain` row is created**, no schema, migration, database, backfill, DNS, Vercel, Render, deployment, G-9 or mode-flip action accompanies this record — production remains frozen. |
| **Decision (question)** | ⚖️ P9-D10 moved Tenant #1's `CUSTOM` canary from `www.printforge.in` to `www.printforge.world`, which is **not** the `FRONTEND_URL` host. The spec had assumed those were the same hostname — §4.1.3's original row described the admin origin as *"also Tenant #1's storefront … registered by B-3"*, and `store-domains.service.ts:104–105` records that *"B-3's platform-side registration of the production origin, when it happens, is a platform action — W8"*. With that identity broken, the frontend's Vercel deployment origin (`https://print-forge-lemon.vercel.app`) has no `StoreDomain` row, so storefront routes under it would return the generic unknown-host 404 after the §17.2 step-7 flip. A read-only investigation confirmed the mechanism (`store-context.service.ts:resolveByOrigin` → `store-domain-resolver.service.ts:resolveHost`, no `FRONTEND_URL` exemption) and established that **no authoritative Phase 9 document addresses a `*.vercel.app` origin as a storefront hostname** — the only mention in the repository is `docs/ops/PRODUCTION-SMOKE-TEST.md` check **D3**, which treats it as the interim state the domain cutover is meant to end. Should that origin be registered, replaced, or treated as internal? |
| **Options considered** | **A** — register it as `CUSTOM` / `VERIFIED` / `ISSUED` / non-primary so it keeps serving and redirects to the canonical host; requires a backfill + test change, since §6.2's `reservedHosts` blocks merchant self-service adds and `platform-domains.controller.ts` exposes **no** add operation. **B** — replace it: storefronts reachable only through platform/custom hostnames. **C** — treat it as an internal deployment origin only, not customer-facing; no code and no database change. |
| **Owner Decision** | **OPTION C.** The current Vercel deployment origin `https://print-forge-lemon.vercel.app` is an **internal deployment origin only** and is **not a customer-facing storefront hostname**. (1) It **MUST NOT** receive a `StoreDomain` row. (2) It **MUST NOT** be treated as a `PLATFORM_SUBDOMAIN` or a `CUSTOM` storefront hostname. (3) Customer-facing storefront traffic is served through the store's configured platform/custom hostname — `{store.slug}.stores.printforge.world`, and `www.printforge.world` for the Tenant #1 `CUSTOM` canary. (4) It is **not** added to B-3. (5) **CORS behaviour is preserved unchanged:** `FRONTEND_URL` remains admitted as the platform/admin origin in both modes. **CORS admission does not imply storefront resolution** — recorded explicitly in §4.1.3a so an operator seeing `Access-Control-Allow-Origin: https://print-forge-lemon.vercel.app` alongside a 404 does not read it as evidence that the deployment URL is a storefront hostname. |
| **Rationale** | The Phase 9 architecture expects storefront traffic to arrive on **store-specific hostnames**: §4.1.1's request-flow model is built on one shared deployment serving every store on its own hostname, and §10.1 removed `DEFAULT_SITE_URL` precisely so no build-time origin could stand in for a store's own. The `*.vercel.app` URL is an interim deployment origin, not the intended canonical storefront hostname — the repository already treats it that way (`PRODUCTION-SMOKE-TEST.md` D1–D3). Registering it would bind the Vercel deployment origin to Tenant #1 unnecessarily: anonymous `@Public()` catalog reads at that origin would scope to Tenant #1 via `resolvePublicScope`, making the platform's own console origin permanently one tenant's storefront for no benefit the real hostnames do not already provide. And the current frontend deployment URL is not intended to survive as a customer-facing storefront origin after `host_resolution` activation. |
| **Consequences** | (1) After `host_resolution` activation, storefront requests made directly to `https://print-forge-lemon.vercel.app` **may return the generic 404 / `STORE_NOT_FOUND`**. **This is intentional** — §4.1.3 / 🔎 S-4, indistinguishable from any other unknown host by design. (2) `/admin/*` behaviour is **not** changed by this decision: those routes never use storefront `Origin` resolution — `TenantContextGuard` (⚖️ D6) supplies the tenant from a `TenantMembership`, and §4.1.3 already exempts them. `/platform/*`, health, auth and webhooks are likewise unaffected. (3) **No `StoreDomain` row is created** for the Vercel deployment URL. (4) **No database or backfill change is required.** (5) §17.2 step 7 is no longer gated on this item. |
| **Dependencies** | Closes the OPEN item raised by ⚖️ P9-D10 against §4.1.3, which gated §17.2 step 7. Step 7 remains gated on the §17.1 checklist (item 4 outstanding), §16.2a's preconditions for `www.printforge.world`, and §17.2 steps 1–6. |
| **Affected files / systems** | **Docs only:** this record; spec §4.1.3 (row), new §4.1.3a, §17.2 step 7, §18.1 (two added assertions), `E-5`; `docs/ops/PRODUCTION-SMOKE-TEST.md`; `docs/ops/ENVIRONMENT.md`; `docs/ops/DEPLOYMENT.md`. **Tests:** one new unit spec encoding the decision. **No** application code, Prisma schema, migration, backfill, resolver, CORS-policy or frontend change — `frontend/vercel.json`, `frontend/src/seo/*` and `frontend/src/services/api/client.ts` were inspected and contain **no** assertion contradicting Option C (no `vercel.app` reference at all), so they are untouched. |
| **Explicitly NOT recorded / NOT decided** | No production write of any kind. No new customer-facing domain mechanism. No claim about when or whether the `printforge.in` cutover happens — `PRODUCTION-SMOKE-TEST.md` D1–D3 remain an open launch prerequisite and their same-site cookie finding is preserved intact. No change to the pre-existing `sameSite: 'strict'` exposure (Phase 12 per ⚖️ P9-D4). |
| **Follow-up actions** | (1) Ensure nothing customer-facing points at the deployment URL before §17.2 step 7 — an operator check, not a code change. (2) W8 browser verification (§17.2 step 9, §18.1) uses `www.printforge.world` and `{slug}.stores.printforge.world`, never the deployment origin. (3) §18.1 now asserts the deployment origin returns 404 **while still carrying** its CORS header, so a future `200` there is caught as a misregistration. |
| **Explicit approval wording (recorded)** | `"We have made the OWNER DECISION for Phase 9 OPEN ITEM 1: OPTION C — Treat the Vercel deployment URL https://print-forge-lemon.vercel.app as an INTERNAL VERCEL DEPLOYMENT ORIGIN ONLY. It is NOT a customer-facing storefront hostname. The customer-facing storefront entry points are the configured platform/custom hostnames, including: {store.slug}.stores.printforge.world, www.printforge.world for the Tenant #1 CUSTOM canary. Do NOT create a StoreDomain row for: print-forge-lemon.vercel.app. Do NOT add it to B-3. … Preserve the existing CORS behavior: FRONTEND_URL remains admitted as the platform/admin origin by the CORS policy. Important distinction: CORS admission does NOT imply storefront resolution."` (Atharva — Project & Architecture Owner, 2026-09-25.) |

### P9-D11 — Decision Log

| Date | Owner | Choice | Approval wording (verbatim) | Reference |
|---|---|---|---|---|
| 2026-09-25 | Atharva — Project & Architecture Owner | **OPEN item raised by P9-D10**: with B-3 retargeted to `www.printforge.world`, the `FRONTEND_URL` origin has no `StoreDomain` row and its storefront routes would 404 after the flip | §4.1.3 corrected row; P9-D10 "Explicitly NOT decided" item (i) | P9-D10 record |
| 2026-09-25 | Atharva — Project & Architecture Owner | **Read-only investigation**: CORS admits `FRONTEND_URL` in both modes (`platform_admin_origin`, mode-independent) while the resolver has no exemption → 404; **no authoritative document addresses a `*.vercel.app` storefront host**; no runtime path exists to register it (§6.2 `reservedHosts`; no platform add route); three options presented | Read-only inspection of §4.1.3, §5, §9, §11, §16.2, §17.2, §18.1, `storefront-cors.policy.ts`, `store-context.service.ts`, `store-domain-resolver.service.ts`, `platform-subdomain.ts`, `store-domains.service.ts`, `platform-domains.controller.ts` | In-conversation investigation report, 2026-09-25 |
| 2026-09-25 | Atharva — Project & Architecture Owner | **RESOLVED — RATIFIED — OPTION C: internal deployment origin only; no `StoreDomain` row; 404 under `host_resolution` is intentional; CORS platform-admin-origin admission preserved and explicitly distinguished from storefront resolution** | `"OPTION C — Treat the Vercel deployment URL … as an INTERNAL VERCEL DEPLOYMENT ORIGIN ONLY. It is NOT a customer-facing storefront hostname. … Do NOT create a StoreDomain row … CORS admission does NOT imply storefront resolution."` | This record; spec §4.1.3/§4.1.3a the same day |

📐 **This decision does NOT change:** ⚖️ **P9-D6** (`stores.printforge.world` remains the platform storefront domain) · ⚖️ **P9-D10** (`www.printforge.world` remains Tenant #1's `CUSTOM` canary) · **platform subdomain derivation** (§5 / `derivePlatformSubdomain`, still `{store.slug}.{PLATFORM_STOREFRONT_DOMAIN}`) · **`StoreDomain` serving gates** (§4.3 — `CUSTOM` still requires `VERIFIED` + `ISSUED`; `PLATFORM_SUBDOMAIN` still always-on) · the **host-resolution architecture** · **CORS platform-admin-origin behaviour** (`storefront-cors.policy.ts` is untouched). P9-D1…P9-D10, P9-S2, P9-S7, P9-S14 and G-21 all stand unmodified, and no enum, schema, migration, guard, permission or resolver rule is altered.

---

### Phase 9 — Unresolved / Not-decided Items (explicitly recorded, NOT decided by these records)

| Item | Status | Notes |
|---|---|---|
| First-party vs proxied customer cookie handling on custom domains | **RE-FILED — Phase 12** (P9-D4) | Not decided; Phase 12 decides with the customer-auth implementation. |
| Exact new enum/column names for `type`, `verificationMethod`, `tlsStatus`, `lastCheckedAt` | **SPEC WORK** (P9-D2) | Names are schema-authoring work; `VERIFYING` is excluded regardless. |
| `PlatformConfig` key name, value set, default, cache TTL, failure mode | **SPEC WORK** (P9-D8) | Must be defined before the resolver fallback is removed. |
| Ownership / DNS / Vercel / API configuration of `stores.printforge.world` (amended 2026-09-25) | **CONFIRMED — all 4 ops-checklist items `yes`; §17.1 GATE SATISFIED** (P9-D6) | Items 1–3 confirmed 2026-09-25 by `E-DNS-1`…`E-DNS-4` (registrar ownership + nameserver delegation; public NS delegation; wildcard attached **and** a directly observed wildcard certificate). Item 4 confirmed the same day as **`E-RENDER-1`** — **owner-attested**, names only, corroborated by a successful production boot (`env.validation.ts` requires the Vercel keys once `PLATFORM_STOREFRONT_DOMAIN` is set). Evidence at spec §17.1/§17.1a/§17.1b; **no value, secret or token recorded anywhere**. The checklist no longer gates W8 — execution still requires owner authorization. |
| Vercel API credential provisioning (name only) | **NOT DONE** (P9-D3) | Named in the spec; provisioned as a Render secret by ops; never recorded here. |
| Tenant #1 `CUSTOM` canary hostname | **RESOLVED — `www.printforge.world`; §16.2a preconditions VERIFIED** (P9-D10) | Replaced the stale `www.printforge.in`. B-3 remains optional per Master Plan §15. All three §16.2a preconditions were **independently observed** 2026-09-25 and recorded as **`E-W3-1`** (public DNS from three resolvers), **`E-W3-2`** (Vercel `verified: true`, `misconfigured: false`, `redirect: null`) and **`E-W3-3`** (HTTPS handshake — Let's Encrypt `CN=YR1`, SAN `DNS:www.printforge.world`, valid through **2026-12-24**). `E-W3-3` is point-in-time: re-observe if B-3 has not run by that date. Execution still requires owner authorization. |
| `StoreDomain` row for the `FRONTEND_URL` / admin origin | **RESOLVED — OPTION C: no row, by decision** (P9-D11) | The Vercel deployment origin is internal-only and not a customer-facing storefront hostname; its storefront 404 under `host_resolution` is **intentional** (§4.1.3a). CORS still admits it as the platform/admin origin — admission does not imply resolution. §17.2 step 7 is no longer gated on this item. |
| Refresh cookie `sameSite: 'strict'` across different registrable domains | **NOTED — NOT DECIDED; Phase 12** (P9-D4 / P9-D10) | Pre-existing, not created by Phase 9; cookie handling on non-shared domains is Phase 12's. |
| `E-3` execution against a real custom domain (Route A) | **PREPARED — NOT AUTHORIZED, NOT EXECUTED; SEQUENCED LAST** (P9-D9) | Route, TLS-evidence discipline, evidence set, environment (**production**) and method (**`DNS_TXT`**) are ratified. Ordered **behind** §17.1 items 3 and 4 and the §17.2 runbook activation of `host_resolution`; the test hostname is not yet supplied; no step may run without explicit owner execution authorization. |
| Scheduled domain re-verification worker | **DEFERRED — Phase 11** (P9-D7) | Not built in Phase 9. |
| Master Plan text (§15 DEPENDENCIES "Phase 5 approves domains"; §16 "Phase 2 customer auth" dependency wording; §15 `VERIFYING`) | **SUPERSEDED BY POINTER, NOT EDITED** | The Master Plan is not edited by these records; this register is the pointer of record. |

**Phase 9 decision docket (2026-09-20): `CLOSED`** — P9-D1 (B), P9-D2 (B, G-5 preserved), P9-D3 (A), P9-D4 (re-filed → Phase 12), P9-D5 (A), P9-D6 (`stores.printforge.app`, ops checklist mandatory — **domain amended 2026-09-25 to `stores.printforge.world`; see P9-D6's Decision Log**), P9-D7 (A), P9-D8 (`PlatformConfig` row). **Phase 9 DECISION GATE: `SATISFIED`** — P9-D1 through P9-D4 are all ratified. **Phase 9 START GATE: `NOT YET READY`** — the implementation spec (`docs/saas/PHASE-9-START-GATE-AND-IMPLEMENTATION-SPEC.md`) is authored under these records but is **not itself approved**; a G-20-style approval record for the spec is required before implementation begins. **No Phase 9 implementation has occurred** — no source file, schema, migration, environment variable, or infrastructure has been touched under any record in this section.

---

## Phase 9 Specification Decision Records (S-2, S-7, S-14)

Three owner decisions closing the remaining §21 items of `docs/saas/PHASE-9-START-GATE-AND-IMPLEMENTATION-SPEC.md` that the 2026-09-20 spec review classified **C** (genuine architecture/security decisions). They are recorded here as **P9-S2**, **P9-S7**, **P9-S14** (the `P9-S` prefix marks a *specification-level* decision under the ratified P9-D1…P9-D8 umbrella; the number is the spec's §21 item). Every other §21 item (S-1, S-3, S-4, S-5, S-6, S-8, S-9, S-10, S-11, S-12, S-13) was classified A or B in that review and is finalised in the spec without an owner record. **NO code, schema, migration, environment variable, infrastructure, or production change accompanies any record in this section.** P9-D1…P9-D8, S-1 and S-6 are not reopened.

---

## P9-S2 — Merchant Store-Domain Management Permission: `store-domain:manage` (RATIFIED)

| Field | Content |
|---|---|
| **ID** | P9-S2 (spec §21 item S-2) |
| **Owner** | Atharva — Project & Architecture Owner |
| **Date** | 2026-09-20 |
| **Status** | **RESOLVED — RATIFIED — new tenant permission `store-domain:manage`, OWNER-only default grant.** |
| **Decision (question)** | The Phase 9 spec's merchant surface `admin/store-domains` (§6.1) needs a tenant permission. No existing catalogue entry covers domain management. Per G-13 (catalogue contents are owner-ratified) and the P7-D2 Part A precedent (`billing:manage` — "explicit catalogue ratification, not silent reuse of an existing entry for a semantically different purpose"), a new string requires an owner record. Ratify one, and which? |
| **Options considered** | (a) ratify `store-domain:manage`; (b) ratify a different name; (c) reuse an existing permission such as `settings:write` (rejected by P7-D2 precedent). |
| **Owner Decision** | **RATIFY a new tenant permission `store-domain:manage`.** The permission name is exactly `store-domain:manage`. **Default role grant: OWNER only.** Do not reuse an existing permission such as `settings:write`. The permission is used for merchant store-domain management operations including adding / managing / verification / primary-domain / removal operations as defined by the Phase 9 specification. **Existing `PermissionsGuard` + `@RequirePermission` remains the authorization boundary.** |
| **Rationale** | Owner's explicit choice, following the G-13 / P7-D2 governance pattern. OWNER-only mirrors the two other tenant-critical grants already excluded from `ADMIN` (`members:manage`, `payment-account:manage` — `permission.ts:63`). |
| **Dependencies** | Upstream: G-13 (catalogue), P2-D8 (typed-constant representation), P7-D2 Part A (precedent). Downstream: spec §6.1 / wave W6; `admin-authorization-coverage.spec.ts` (static coverage assertion) gains the new controller. |
| **Affected files / systems** | **Unchanged by this record; W6 scope:** `backend/src/auth/permissions/permission.ts` (`PERMISSIONS` tuple + `ADMIN_PERMISSIONS` exclusion filter); new `backend/src/store-domains/` (or equivalent) tenant-admin controller with class-level `@RequirePermission('store-domain:manage')`; `admin-authorization-coverage.spec.ts`. |
| **Explicitly NOT introduced** | No source change by this record. No grant to `ADMIN`, `STAFF`, `VIEWER`. No platform-side permission (platform routes stay `@PlatformOnly()`). |
| **Follow-up actions** | Spec §6.1 and §21 S-2 updated to cite this record; W6 implements the catalogue entry with positive + negative permission tests (OWNER allowed; ADMIN/STAFF/VIEWER 403). |
| **Explicit approval wording (recorded)** | `"S-2 — STORE DOMAIN MANAGEMENT PERMISSION. OWNER DECISION: RATIFY a new tenant permission: store-domain:manage. The permission name is exactly: store-domain:manage. Default role grant: OWNER only. Do not reuse an existing permission such as settings:write. … Existing PermissionsGuard + @RequirePermission remains the authorization boundary."` (Atharva — Project & Architecture Owner, 2026-09-20, "PHASE 9 — FINAL SPEC DECISIONS".) |

### P9-S2 — Decision Log

| Date | Owner | Choice | Approval wording (verbatim) | Reference |
|---|---|---|---|---|
| 2026-09-20 | Atharva — Project & Architecture Owner | **Proposed in spec as SPEC DECISION S-2, not ratified** | `PHASE-9-START-GATE-AND-IMPLEMENTATION-SPEC.md §6.1, §21` | Spec draft |
| 2026-09-20 | Atharva — Project & Architecture Owner | **Classified C — owner-ratified catalogue change required (G-13 / P7-D2 precedent)** | "PHASE 9 REMAINING SPEC DECISION REVIEW" | Spec review |
| 2026-09-20 | Atharva — Project & Architecture Owner | **RESOLVED — RATIFIED — `store-domain:manage`, OWNER only** | `"S-2 … RATIFY a new tenant permission: store-domain:manage … Default role grant: OWNER only."` | This record |

---

## P9-S7 — Platform Domain Revoke: STICKY (RATIFIED)

| Field | Content |
|---|---|
| **ID** | P9-S7 (spec §21 item S-7) |
| **Owner** | Atharva — Project & Architecture Owner |
| **Date** | 2026-09-20 |
| **Status** | **RESOLVED — RATIFIED — OPTION A (sticky platform revoke).** |
| **Decision (question)** | The spec gives the platform console a "revoke" operation (`VERIFIED → FAILED`) under P9-D5's approve/inspect surface. The review found that the spec's transition table also allowed merchant on-demand re-verification to move `FAILED → VERIFIED`, letting a merchant undo a platform revoke. Is a platform revoke sticky (platform-only restore), merchant-recoverable, or absent in Phase 9? |
| **Options considered** | (a) **sticky** — `FAILED` exits only via platform override / platform re-verify; merchant verify on a `FAILED` row is refused; (b) merchant-recoverable; (c) no revoke operation in Phase 9 (rely on tenant suspend). |
| **Owner Decision** | **OPTION A — STICKY PLATFORM REVOKE.** When a platform administrator revokes a verified domain (`VERIFIED → FAILED`), the merchant **MUST NOT** be able to restore serving by running the normal merchant on-demand DNS verification. A `FAILED` row resulting from a platform revoke may transition back to serving **only** through an explicit platform-authorized override or platform re-verification operation. The revoke is therefore a genuine platform control. **Requirements:** `PlatformGuard` authorization remains required; `PlatformAuditLog` records the revoke **and** the restoration action; the resolver serving gate refuses `FAILED` domains; merchant verification against a platform-revoked `FAILED` row must not silently restore `VERIFIED`; tests must prove both (1) merchant cannot undo a platform revoke and (2) platform can explicitly restore the domain. **Do not create a new schema field solely for this decision.** |
| **Rationale** | Owner's explicit choice: a revoke the merchant can self-undo is not a revoke; the control is placed in the same class as tenant suspend/resume (platform-only both directions). |
| **How "platform-revoked" is known without a schema field** | Per S-6 (resolved, spec §6.3), a failed merchant verification keeps the row `PENDING`; `FAILED` is entered **only** by platform revoke. Therefore in Phase 9 **every `FAILED` row is by construction platform-revoked** — no marker column is needed. Should a future phase add another `FAILED` entry path, a discriminator becomes a new decision then. `DomainVerificationStatus` stays `{PENDING, VERIFIED, FAILED}` (G-5; P9-D2). |
| **Dependencies** | Upstream: P9-D5 (platform-domains surface), P9-D2 (enum unchanged), S-6 (merchant failure stays `PENDING`), G-5. Downstream: spec §6.3 transitions, §6.4 platform operations (revoke + explicit restore), §14.2 tests; wave W6. |
| **Affected files / systems** | **Unchanged by this record; W6 scope:** `backend/src/platform/platform-domains/` (revoke, override, platform re-verify); merchant verify operation (refuses `FAILED` rows with a specific error, no state change, audit row); resolver serving gate (already refuses non-`VERIFIED` `CUSTOM` rows); `PlatformAuditLog` actions `platform.domain.revoked`, `platform.domain.restored` (override) / `platform.domain.reverified`. |
| **Explicitly NOT introduced** | No schema field, no enum value, no merchant-side "appeal" flow, no automatic un-revoke. |
| **Follow-up actions** | Spec §6.3 / §6.4 / §14.2 / §21 S-7 updated to these semantics; W6 ships the paired tests (1) and (2). |
| **Explicit approval wording (recorded)** | `"S-7 — PLATFORM DOMAIN REVOKE. OWNER DECISION: OPTION A — STICKY PLATFORM REVOKE. When a platform administrator revokes a verified domain: VERIFIED → FAILED the merchant MUST NOT be able to restore serving by running the normal merchant on-demand DNS verification. A FAILED row resulting from a platform revoke may transition back to serving only through an explicit platform-authorized override or platform re-verification operation. … Do not create a new schema field solely for this decision."` (Atharva — Project & Architecture Owner, 2026-09-20.) |

### P9-S7 — Decision Log

| Date | Owner | Choice | Approval wording (verbatim) | Reference |
|---|---|---|---|---|
| 2026-09-20 | Atharva — Project & Architecture Owner | **Proposed in spec as SPEC DECISION S-7 (revoke exists; stickiness unspecified)** | `PHASE-9-START-GATE-AND-IMPLEMENTATION-SPEC.md §6.4, §21` | Spec draft |
| 2026-09-20 | Atharva — Project & Architecture Owner | **Classified C — merchant re-verify could undo a revoke; authorization-boundary question** | "PHASE 9 REMAINING SPEC DECISION REVIEW" | Spec review |
| 2026-09-20 | Atharva — Project & Architecture Owner | **RESOLVED — RATIFIED — OPTION A (sticky)** | `"S-7 … OPTION A — STICKY PLATFORM REVOKE. …"` | This record |

---

## P9-S14 — Invalid Stored Resolution Mode: FAIL CLOSED (RATIFIED)

| Field | Content |
|---|---|
| **ID** | P9-S14 (spec §21 item S-14) |
| **Owner** | Atharva — Project & Architecture Owner |
| **Date** | 2026-09-20 |
| **Status** | **RESOLVED — RATIFIED — OPTION B (fail closed).** |
| **Decision (question)** | P9-D8 delegated the kill-switch flag semantics to the spec. The spec's S-13 makes a *read error* fail closed (last cached value, else 503), but S-14 made an *invalid stored value* fail **open** to `legacy_single_store` with alerting. The review found this inconsistent: once multiple stores exist, `legacy_single_store` is the non-isolating mode, and data corruption would silently select it. Fail open or fail closed? |
| **Options considered** | (a) fail open to `legacy_single_store` + error log + Sentry (spec as drafted); (b) fail closed — treat as a read error: error log, Sentry, last-known valid cached mode, else 503; never fall back to legacy; (c) fail closed to `host_resolution` + alert. |
| **Owner Decision** | **OPTION B — FAIL CLOSED.** Valid modes are `legacy_single_store` and `host_resolution`. If the persisted `PlatformConfig` domain-resolution mode contains an invalid or unknown value: (1) emit an error log; (2) report the configuration error to Sentry; (3) treat the mode read as a failure; (4) use the last-known **valid** cached mode if one exists; (5) if no valid cached mode exists, return HTTP **503**; (6) **NEVER** silently fall back to `legacy_single_store`. |
| **Rationale** | Owner's explicit wording: *"The `legacy_single_store` fallback is not an isolation-safe recovery mechanism once multiple stores exist. An invalid configuration value must not silently select the non-isolating resolver. This decision prioritizes tenant isolation over availability for a corrupt resolution-mode configuration."* Consistent with S-13 and Master Plan §5 Principle 4 / invariant 3. |
| **Dependencies** | Upstream: P9-D8 (`PlatformConfig` kill-switch), S-13 (read-error semantics — now the same path). Downstream: spec §15 flag table, §14.3 tests; wave W2. The only write path (platform route) validates the value set, so an invalid value can arise only from a direct database edit — this record governs that case. |
| **Affected files / systems** | **Unchanged by this record; W2 scope:** the mode-reader in `backend/src/common/tenant/store-domain-resolution/`; Sentry reporting (existing integration, `main.ts`); `storefront-resolution-mode.e2e-spec.ts`. |
| **Explicitly NOT introduced** | No change to the valid value set, default-when-absent (`legacy_single_store`, P9-D8 / spec §15 — an *absent* row is not an *invalid* row), cache TTL, or who may flip the flag. |
| **Follow-up actions** | Spec §15 "Invalid stored value" row and §14.3 tests updated; §21 S-14 marked RESOLVED. |
| **Explicit approval wording (recorded)** | `"S-14 — INVALID STORED RESOLUTION MODE. OWNER DECISION: OPTION B — FAIL CLOSED. Valid modes are: legacy_single_store, host_resolution. If the persisted PlatformConfig/domain-resolution mode contains an invalid or unknown value: 1. emit an error log; 2. report the configuration error to Sentry; 3. treat the mode read as a failure; 4. use the last-known valid cached mode if one exists; 5. if no valid cached mode exists, return HTTP 503; 6. NEVER silently fall back to legacy_single_store."` (Atharva — Project & Architecture Owner, 2026-09-20.) |

### P9-S14 — Decision Log

| Date | Owner | Choice | Approval wording (verbatim) | Reference |
|---|---|---|---|---|
| 2026-09-20 | Atharva — Project & Architecture Owner | **Proposed in spec as SPEC DECISION S-14 (fail open + alert)** | `PHASE-9-START-GATE-AND-IMPLEMENTATION-SPEC.md §15, §21` | Spec draft |
| 2026-09-20 | Atharva — Project & Architecture Owner | **Classified C — fail-open on an isolation control inconsistent with S-13** | "PHASE 9 REMAINING SPEC DECISION REVIEW" | Spec review |
| 2026-09-20 | Atharva — Project & Architecture Owner | **RESOLVED — RATIFIED — OPTION B (fail closed)** | `"S-14 … OPTION B — FAIL CLOSED. … NEVER silently fall back to legacy_single_store."` | This record |

### Phase 9 specification — spec-level items finalised without an owner record (for traceability)

| §21 item | Classification (review 2026-09-20) | Finalised as |
|---|---|---|
| S-1 | resolved by review | `Origin` as the storefront-host signal with an explicit scope-selection-only trust model (spec §4.1.1–§4.1.4) |
| S-3 | A/B | `PlatformConfig` generic key/value table (existence per P9-D8) |
| S-4 | A/B | Unknown and unverified hosts share one generic 404; unavailability reasons share one 503 |
| S-5 | B | `Store.slug` immutable in Phase 9 (no runtime mutation path exists); pre-insert hostname check; `hostname @unique` backstop |
| S-6 | resolved by review | No schema column; failure reason in response + `TenantAuditLog` + log; row stays `PENDING` |
| S-8 | A/B | Vercel adapter contract (add/get/remove); config names only |
| S-9 | B (corrected) | CORS allow-list is **mode-coupled**: `legacy_single_store` = `FRONTEND_URL` only (today's behaviour); full dynamic allow-list activates with `host_resolution`; read-only `@PlatformOnly()` dry-run predicate endpoint for pre-flip verification |
| S-10 | A (by S-1) | Bootstrap returns 200 on a non-primary host; the API never 301s |
| S-11, S-12, S-13 | B | As specified |

**Phase 9 specification decisions (2026-09-20): `CLOSED`** — P9-S2, P9-S7, P9-S14 ratified; all other §21 items finalised as A/B. **Phase 9 SPEC STATUS: `READY FOR IMPLEMENTATION REVIEW`** — the spec is complete and internally consistent with P9-D1…P9-D8, S-1/S-6 and these three records. **Phase 9 START GATE: `NOT YET READY`** — implementation still requires a G-20-style approval record for the spec (proposed **G-21**). **No Phase 9 implementation has occurred.**

---

## G-21 — Phase 9 specification approval

| Field | Content |
|---|---|
| **ID** | G-21 |
| **Owner** | Atharva — Project & Architecture Owner |
| **Date** | 2026-09-20 |
| **Status** | **APPROVED** |
| **Decision (question)** | Does the Project & Architecture Owner approve `docs/saas/PHASE-9-START-GATE-AND-IMPLEMENTATION-SPEC.md` as the contract for Phase 9 (Store / Domain Resolution) implementation, now that its eight blocking decisions (P9-D1…P9-D8), its three owner-level specification decisions (P9-S2, P9-S7, P9-S14) and its eleven review-resolved specification items (S-1, S-3, S-4, S-5, S-6, S-8, S-9, S-10, S-11, S-12, S-13) are all recorded as ratified/resolved? |
| **Decision (approved option)** | **APPROVE.** `docs/saas/PHASE-9-START-GATE-AND-IMPLEMENTATION-SPEC.md` (all 23 sections, §0–§22) is accepted as the Phase 9 implementation contract, checked for internal consistency against the ratified records as verified below. **Phase 9 implementation is authorized to proceed according to that spec**, wave by wave in the order of spec §2 (W0 → W8), each wave gated as the spec states. |
| **Verification performed (not a re-litigation of P9-D1…D8 / P9-S2 / P9-S7 / P9-S14 — checking the spec against them)** | (1) **Blocking decisions:** P9-D1, P9-D2, P9-D3, P9-D4, P9-D5, P9-D6, P9-D7, P9-D8 each present in this register with a `(RATIFIED)` heading and an owner-verbatim approval wording; spec §1 restates each with its binding effect. (2) **Specification decisions:** spec §21 carries 14 rows (S-1…S-14), every one marked `STATUS: RESOLVED`; S-2/S-7/S-14 point at P9-S2/P9-S7/P9-S14 in this register; no row leaves an owner choice open. (3) **Mandated corrections present:** S-1 — §4.1.1 request-flow model, §4.1.2 ordered validation, §4.1.3 failure table, §4.1.4 forged-`Origin` analysis, §4.4 guards never read `Origin`, W4 tenant anchoring of client-supplied ids, API never 301s (§4.3/§11); S-6 — §6.3 "Failure reason — retained operationally", no `StoreDomain` column, row stays `PENDING`; S-9 — §9 "Mode-coupled activation", `GET /platform/config/cors-check` dry-run, §14.4/§17.2 updated; S-5 — §5 "Slug immutability"; S-7 — §6.3 transition table with merchant verify refused on `FAILED` (`DOMAIN_REVOKED_BY_PLATFORM`), §6.4 restore row, §14.2 tests P9-S7-1/P9-S7-2; S-14 — §15 "FAIL CLOSED" row, §14.3 invalid-value test. (4) **No stale pre-correction text:** searched for the superseded wordings (`lastVerificationError` as a column, `REDIRECT` outcome, `FAILED → VERIFIED (pass)` via merchant, fail-open invalid mode, CORS "predicate still runs", "Owner to confirm") — none remain except the struck-through S-6 row kept for traceability. (5) **Consistency with ratified schema:** spec §3 authors exactly three `CREATE TYPE`s + four G-19-shaped nullable `ADD COLUMN`s on `store_domains` (P9-D2) + one `CREATE TABLE platform_config` (P9-D8); `DomainVerificationStatus` untouched (G-5); no `VERIFYING`; no other schema object anywhere in the spec. (6) **Consistency with P9-D1/P9-D4:** no customer-auth wave, no cookie change, `auth.service.ts:398–420` explicitly untouched, `AC-P2-02` explicitly preserved. (7) **Consistency with P9-D3/P9-D6/P9-D7:** single Vercel adapter behind a provider-neutral interface; §17.1 four-item ops checklist as a hard W8 gate; on-demand verification only, no scheduler. (8) **Consistency with P9-D8:** kill-switch defined in spec §15 and shipped in W2 **before** W3 alters resolver behaviour; default-when-absent `legacy_single_store`; invalid value fails closed (P9-S14). (9) Wave table §2 has 9 waves (W0–W8) with start/exit gates; §19 exit criteria E-1…E-10 map to §15 EXIT CRITERIA of the Master Plan. |
| **Rationale** | The owner's explicit request to perform the G-21 gate now that the Phase 9 decision docket and the specification review are both closed. The Master Plan §15, the Start-Gate Audit, the Decision Docket and every Phase 9 record in this register were cross-checked directly against the spec's text (not assumed) before approval. Sequencing mirrors G-20 for Phase 3: decisions → spec → approval → implementation. |
| **Source document / section** | `docs/saas/PHASE-9-START-GATE-AND-IMPLEMENTATION-SPEC.md` (full document); `docs/saas/PHASE-9-DECISION-DOCKET.md` (CLOSED); `docs/saas/PHASE-9-START-GATE-AUDIT.md`; P9-D1…P9-D8, P9-S2, P9-S7, P9-S14 records (this file); Master Plan §15, §22. |
| **Scope approved** | Everything in spec §2 (waves W0–W8) and the sections they reference: additive schema (§3), `PlatformConfig` kill-switch (§15), resolver + storefront context (§4), platform subdomains (§5), custom-domain onboarding/verification/platform-domains (§6), Vercel-managed TLS adapter (§7), mode-coupled CORS + dry-run (§9), frontend host-awareness foundation (§10), canonical behaviour (§11), per-store SEO routes (§12), the test surface (§13–§14), backfill B-1…B-4 (§16), ops cutover under the §17.1 checklist (§17), canary/rollback (§18). |
| **Explicit exclusions (binding, per spec §0, §8, §20, §22)** | No customer authentication of any kind (P9-D1); no cookie/session change (P9-D4); no `VERIFYING`, no G-5 amendment, no schema object beyond §3 (P9-D2, P9-D8); no proxy or Cloudflare layer (P9-D3); no scheduled verification worker (P9-D7); no Phase 12 theme/branding/hook sweep; no Phase 13 legal pages; no removal of the `legacy_single_store` strategy; no global-unique `Store.slug`; no second hosting provider. **No production action of any kind before the §17.1 checklist is all "yes" and a fresh verified backup exists (G-9).** |
| **Consequences** | **Phase 9 implementation is now authorized to begin at Wave 0** (pre-execution confirmations — which modifies nothing in production) and to proceed wave by wave per spec §2. **This approval does NOT itself start any wave, does NOT authorize any production/DNS/Vercel/Render/TLS/environment change (those are W8 operator actions gated by §17), and does NOT authorize Phase 10, 11 or 12 work.** Every §21 spec decision is closed; a spec revision, if ever needed, is re-approved via a recorded change (as G-20's reversibility clause). |
| **Affected phase(s)** | **Phase 9 (defining — implementation may now begin).** |
| **Reversibility** | A spec revision can be re-approved via a recorded change, the same as G-4/G-11/G-20 for prior phases. |
| **Explicit approval wording (recorded)** | `"PHASE 9 — G-21 SPEC APPROVAL + IMPLEMENTATION AUTHORIZATION … G-21 must explicitly approve: docs/saas/PHASE-9-START-GATE-AND-IMPLEMENTATION-SPEC.md; Phase 9 implementation to proceed according to that spec."` with the specification found internally consistent as verified above (Atharva — Project & Architecture Owner, 2026-09-20). |
| **Not to be implemented until this record is `APPROVED`** | ~~Any Phase 9 source file, migration, `PlatformConfig` model, resolver change, platform-domains module, CORS change, frontend `siteConfig` change, or `vercel.json` change.~~ **APPROVED 2026-09-20 — implementation may begin at Wave 0.** Nothing was implemented by this record. |

### G-21 — Decision Log

| Date | Owner | Choice | Approval wording (verbatim) | Reference |
|---|---|---|---|---|
| 2026-09-20 | Atharva — Project & Architecture Owner | **Spec authored — DRAFT FOR OWNER REVIEW, NOT APPROVED** | `PHASE-9-START-GATE-AND-IMPLEMENTATION-SPEC.md` status row | Spec draft under P9-D1…P9-D8 |
| 2026-09-20 | Atharva — Project & Architecture Owner | **S-1 / S-6 resolved; remaining §21 reviewed; S-2/S-7/S-14 ratified as P9-S2/P9-S7/P9-S14** | "PHASE 9 SPEC REVIEW — S-1 / S-6"; "PHASE 9 REMAINING SPEC DECISION REVIEW"; "PHASE 9 — FINAL SPEC DECISIONS" | P9-S2, P9-S7, P9-S14 records |
| 2026-09-20 | Atharva — Project & Architecture Owner | **APPROVED — spec accepted; Phase 9 implementation authorized** | `"PHASE 9 — G-21 SPEC APPROVAL + IMPLEMENTATION AUTHORIZATION"` | This record |

**Phase 9 START GATE: `READY`** (2026-09-20, per G-21) — implementation is authorized to begin at Wave 0 per the spec's §2 scope, gates and exclusions. Wave 0 has **not** been started by this record. **No Phase 9 implementation has occurred** — no source file, schema, migration, environment variable, or infrastructure has been touched under any record in this section.

---

## Summary Table

| ID | Topic | Owner | Status | Blocks |
|---|---|---|:-:|---|
| **D1** | Supersede `BLUEPRINT-v1.2` via `§38` ACR | Atharva + Harshad | **RESOLVED — APPROVED** | ~~Phase 1~~ *(cleared)* + governance umbrella Phases 2–15 |
| **D2** | Does the deployed DB hold real production data? | Ops owner | **RESOLVED — OPTION A (real production data)** | Phase 2b execution — complete (D8 + G-16 both satisfied); Phase 4 execution remains gated on Phase 4's own separate gates |
| **D3** | Existing deployment → Tenant #1 (A) vs not adopted (B) | Business owner | **RESOLVED — OPTION A** | ~~Phase 1~~ *(cleared)* + **Phase 4 (defining; gated on D2)** + **Phase 2b backfill** |
| **D5** | Customer identity: separate `Customer` (a) vs global `User` + profile (b) | Product + architecture owner | **RESOLVED — OPTION (a)** *(narrative corrected via G-18)* | ~~Phase 1~~ *(cleared)* + **Phase 2 (`Customer` model)** + **Phase 4 (`customerId` columns)** |
| **D4** | Tenant isolation mechanism (app-layer / RLS / both) | Architecture + Ops owner | **RESOLVED — BOTH, app-layer primary** (2026-09-07, per P3-D2) | Phase 3 (RLS-enabling migration + scoped-client design) |
| **D6** | Tenant-context derivation for merchant console | Architecture owner + product | **RESOLVED — BOTH mechanisms, header cross-validated** (2026-09-07) | Phase 3 (`TenantContext` merchant path) |
| **D8** | Verified production backup/restore drill | Ops owner | **RESOLVED** (2026-09-07, evidence `D8-20260907-02`) | Phase 2b execution precondition — cleared, backfill executed; Phase 4's own D8 precondition also cleared (Phase 4's other gates unaffected) |
| **D10** | Per-tenant order/invoice numbering + statutory format | Business/product owner | **RESOLVED — BUSINESS DECISION** (2026-09-08; sequential, tenant-scoped, no FY reset — not a statutory/legal confirmation) | Phase 4 wave W4 — unblocked; residual legal-review risk routed to the architecture-change process, not a current blocker |
| **D11** | `AppSetting` per-key ownership classification | Architecture owner | **RESOLVED** (2026-09-08 — STORE/TENANT classification) | Phase 4 wave W4 |
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
| **G-13** | Ratify permission catalogue | Architecture + security owner | **APPROVED — RATIFIED** (2026-09-07, 13-permission catalogue + role map) | Phase 3 (catalogue authoring + swap) |
| **G-14** | Customer-auth store-resolution mechanism | Architecture + product owner | **NOT REQUIRED FOR PHASE 2** (P2-D7 re-scope) | Phase 9/12 |
| **G-15** | Customer token signing secret | Security owner + ops | **APPROVED (design)**; provisioning Phase 9/12 | Phase 9/12 |
| **G-16** | Phase 2b backfill authorization | Ops owner | **APPROVED — AUTHORIZED (2026-09-07)** | **Phase 2b START** (unblocked); Phase 2 completion pending backfill reconciliation |
| **G-17** | D6 resolution / Phase 2 re-scope | Architecture + product owner | **APPROVED — RE-SCOPE** (3-checkpoint gate) | Phase 2a START |
| **G-18** | D5 narrative-wording correction | Architecture owner | **APPROVED — applied** | (governance hygiene) |
| **G-19** | G-10 guard for additive `ADD COLUMN` | Architecture owner | **APPROVED (no weakening)** | Phase 2a START |
| **P3-D1** | Rollout/advisory-flag location | Architecture + Ops owner | **RESOLVED — environment variable via `ConfigService`** | Phase 3 module-migration PRs |
| **P3-D2** | RLS DB-role and pooler compatibility (fact-finding) | Ops owner | **RESOLVED — facts found, favorable to RLS** (2026-09-07) | Feeds D4 |
| **G-20** | Approve Phase 3 specification | Project & Architecture Owner | **APPROVED** (2026-09-07) | Phase 3 implementation START |
| **P4-D1** | `userId` vs. `Customer` relationship pending Phase 9/12 | Architecture owner | **RESOLVED — OPTION B** (2026-09-08) | Phase 4 backfill design (W5) |
| **P4-D2** | Extend migration-safety guard for W7 contract verbs? | Architecture owner | **RESOLVED — IMPLEMENTED** — self-verifying trio + 5-name legacy-DROP allowlist, 20 approved `tenantId` columns (2026-09-10) | Phase 4 wave W7 — guard done; W7 migration/preflight/backup/production still pending, separate turn |
| **P4-D3** | Extend migration-safety guard for W6 composite ownership FKs | Architecture owner | **RESOLVED** — narrow shape+allowlist rule (2026-09-09) | Phase 4 wave W6 — guard implementation still pending, separate turn |
| **P4-D4** | `storeId` column-completeness gap (7 derived tables) | Architecture owner | **RESOLVED — OPTION A** — add nullable `storeId`, no `tenantId` substitution (2026-09-09) | Phase 4 wave W6 — column addition + backfill still pending, separate turn |
| **P6-D1** | `Plan.isActive/sortOrder/isEnterpriseCustom`: G-19 application (nullable/no-default) | Architecture owner | **RESOLVED — RATIFIED** — nullable columns + backfill + app-level default + query-level `COALESCE` fix (2026-09-12) | Phase 6 wave W1 — implemented; no bearing on W2/Phase 7 |
| **P6-D2** | `EntitlementService.resolve()` contract: limit shape `{value, period}` + missing-`PlanLimit` → `value: 0` | Architecture owner | **RESOLVED — RATIFIED** — authoritative for W3 onward (2026-09-12) | Phase 6 wave W2 — implemented; binding on W3/W6 |
| **P6-D3** | `UsageService` unlimited-tracking contract (RATIFIED) + `orders_per_month` billing-period identity (DEFERRED — Phase 7 dependency) | Architecture owner | **PART A RESOLVED — RATIFIED; PART B RECORDED — DEFERRED** (2026-09-12) | Phase 6 wave W3 — Part A implemented, binding on W5+; Part B blocks only production `orders_per_month` activation, gates Phase 7 |
| **P6-D4** | `storage_mb` bytes→MiB conversion policy: 1 MiB=1,048,576 bytes, `ceil`, zero-byte=0 | Architecture owner | **RESOLVED — RATIFIED**, implemented (2026-09-12) | Phase 6 wave W5 — implemented; production activation still gated on Free-plan `storage_mb` `PlanLimit` configuration (business-owned, separate) |
| **P7-D1** | Phase 7 Stage 1 subscription architecture: `pendingPlanId`/Plan FK, 7-state transition matrix, CAS discipline, `SubscriptionEvent` (non-unique `providerEventId`), `orders_per_month` `Usage.period` = ISO `currentPeriodStart`, no entitlement cache | Architecture owner | **RESOLVED — RATIFIED (design only)** (2026-09-12) | Phase 7 Stage 1 — design ratified, no code/schema yet; billing provider, D7, grace duration, retention duration remain OPEN; Part B amended by P7-D2 Part B (`ACTIVE → CANCELLED` added) |
| **P7-D2** | Phase 7 Stage 2 subscription operations: `billing:manage` permission, `ACTIVE → CANCELLED` (amends P7-D1 Part B), `scheduleCancellation()`, downgrade provider-call timing, provider-timeout/reconciliation policy, period-rollover/cron ownership boundary, `BillingProvider`→`FakeBillingProvider` DI wiring | Architecture owner | **RESOLVED — RATIFIED (design only)** (2026-09-12) | Phase 7 Stage 2 — design ratified, no code/schema yet; billing provider, D7, grace duration, retention duration, webhook payload/provider contract, un-scheduling operation, remaining DR transition edges remain OPEN |
| **P7-D3** | Phase 7 remaining billing architecture: D7 two-table webhook design (`BillingWebhookEvent`), grace duration = 7 days, cancellation-retention duration = 30 days (`retentionEndsAt`, not yet implemented), cancel-at-period-end unscheduling semantics, stale-webhook handling, webhook-vs-poll precedence, `SubscriptionEventType` reuse-by-default policy, trial-failure routing confirmed, `PAUSED`/`EXPIRED` edges confirmed | Architecture owner | **RESOLVED — RATIFIED (design/policy only)** (2026-09-13) | Phase 7 — design/policy ratified, no code/schema yet; production billing provider selection and vendor-dependent webhook payload/signature format remain OPEN; **Part E's provider-side-removal requirement superseded for Razorpay specifically by P7-D5** (no such Razorpay operation exists — local-only cancellation scheduling/unscheduling instead); Part E remains binding as originally written for any other provider |
| **P7-D4** | Production SaaS billing provider = Razorpay Subscriptions, India-first strategy; Razorpay implementation confined behind `BillingProvider`; core domain (`SubscriptionService`/`SubscriptionOrchestrationService`/`SubscriptionEvent`/`BillingWebhookEvent`/entitlements/state machine) stays vendor-neutral; SaaS Razorpay credentials/webhook secret separate from Phase 8 merchant Razorpay credentials/webhook secret; data-flow separation from `PaymentAttempt`/`Refund`/`WebhookEvent` (enforced by `money-flow-separation.spec.ts`); `SaasInvoice`/`PaymentMethod`/SaaS refunds remain deferred | Architecture owner | **RESOLVED — RATIFIED** (2026-09-13) | Phase 7 — resolves D14 and P7-D1/P7-D2/P7-D3's OPEN provider-selection item; `RazorpayBillingProvider` adapter, real webhook signature/payload mapping, and credential provisioning remain separate, later, explicitly-authorized implementation work; no bearing on Phase 8; **Part H's webhook-ingestion-unchanged assumption refined by P7-D5 Part E** (header-derived event id requires a small, necessary ingestion-path change) |
| **P7-D5** | Razorpay scheduled-cancellation handling and webhook event identity (sandbox-verified): no Razorpay operation reverses a scheduled cycle-end cancellation while active, so `scheduleCancellation()`/`unscheduleCancellation()` are local-only for Razorpay (no provider call either way); the real Razorpay cancel call happens only at the confirmed period boundary via `reconcilePeriod()`; webhook ingestion must use header-derived `X-Razorpay-Signature`/`X-Razorpay-Event-Id` (payload has neither) | Architecture owner | **RESOLVED — RATIFIED** (2026-09-13) | Phase 7 — amends only the Razorpay-applicability of P7-D3 Part E (P7-D3 itself unchanged); refines P7-D4 Part H's webhook-ingestion-unchanged assumption; `BillingProvider`/`SubscriptionService` unchanged; `RazorpayBillingProvider` implementation and the controller/ingestion header-threading change remain separate, later, explicitly-authorized work; no bearing on Phase 8 |
| **P8-D3** | Merchant Razorpay integration model: Direct Merchant-Owned Razorpay Account (Customer → Merchant Store → Merchant's Razorpay Account → Merchant's own settlement); PrintForge never receives/holds/pools/disburses funds; Route, linked-account/platform settlement, pooled/platform-controlled settlement, and the OAuth Technology-Partner UX are out of scope for Phase 8; merchant-of-record and Razorpay-ToS legal items explicitly preserved OPEN | Architecture owner | **RESOLVED — RATIFIED** (2026-09-14) | Phase 8 — fixes the money-flow shape; gates `PaymentAccount` schema/`PaymentProvider` interface authoring (P8-D1/P8-D2, both still PROPOSED); no bearing on Phase 7 |
| **P8-D6** | Merchant payment-credential storage: application-level AES-256-GCM encrypted blob on `PaymentAccount`, single symmetric master key held as one Render environment secret, no external KMS/secrets-manager vendor introduced; environment-managed per-merchant secrets explicitly rejected (violates invariant 11); SaaS-billing (`RAZORPAY_SAAS_*`) credentials untouched and unaffected | Architecture owner | **RESOLVED — RATIFIED** (2026-09-14) | Phase 8 — **resolves D9** ("merchant payment-credential storage," previously an OPEN stub item); gates `PaymentAccount.credentialsEncrypted` column authoring; no bearing on Phase 7 SaaS-billing credential storage |
| **P9-D1** | Customer-auth runtime ownership ("Phase 9/12" → single phase): `CustomerRefreshToken`, `/storefront/auth/*`, customer JWT issuance, `CUSTOMER_JWT_ACCESS_SECRET`, `customerId` cutover | Atharva — Project & Architecture Owner | **RESOLVED — RATIFIED — OPTION B (Phase 12 owns all five)** (2026-09-20) | Phase 9 scope (auth excluded); Phase 12 start gate |
| **P9-D2** | `StoreDomain` schema reconciliation: add `type`, `verificationMethod`, `lastCheckedAt`, `tlsStatus` + their enums; **G-5 `DomainVerificationStatus` preserved, no `VERIFYING`** | Atharva — Project & Architecture Owner | **RESOLVED — RATIFIED — OPTION B; G-5 NOT amended** (2026-09-20) | Phase 9 first migration (spec-authored, not yet written) |
| **P9-D3** | TLS issuer / renewal mechanism | Atharva — Project & Architecture Owner | **RESOLVED — RATIFIED — OPTION A (Vercel-managed; no proxy, no Cloudflare for SaaS)** (2026-09-20) | Phase 9 custom-domain onboarding + `tlsStatus` semantics |
| **P9-D4** | Custom-domain cookie handling (first-party vs proxied) | Atharva — Project & Architecture Owner | **RESOLVED — RATIFIED — RE-FILED UNDER PHASE 12; mechanism NOT decided** (2026-09-20) | Phase 12 customer-auth implementation; no Phase 9 cookie change |
| **P9-D5** | `platform-domains` approve/inspect surface ownership | Atharva — Project & Architecture Owner | **RESOLVED — RATIFIED — OPTION A (Phase 9 owns it)** (2026-09-20) | Phase 9 platform-console wave |
| **P9-D6** | Platform storefront domain | Atharva — Project & Architecture Owner | **RESOLVED — RATIFIED — `stores.printforge.world` (intent; amended 2026-09-25 from `stores.printforge.app`); ownership/DNS/Vercel/API UNCONFIRMED — ops checklist mandatory** (2026-09-20) | Phase 9 ops cutover wave (hard pre-execution gate) |
| **P9-D7** | Domain-verification job timing | Atharva — Project & Architecture Owner | **RESOLVED — RATIFIED — OPTION A (on-demand only; cron → Phase 11)** (2026-09-20) | Phase 9 verification operation; Phase 11 deferred item |
| **P9-D8** | Resolver kill-switch mechanism (revert to pre-Phase-9 single-store resolution without redeploy) | Atharva — Project & Architecture Owner | **RESOLVED — RATIFIED — `PlatformConfig` row; flag semantics → spec** (2026-09-20) | Must precede removal of the resolver fallback; requires new additive `PlatformConfig` table |
| **P9-S2** | Merchant store-domain management permission (spec §21 S-2) | Atharva — Project & Architecture Owner | **RESOLVED — RATIFIED — `store-domain:manage`, OWNER-only default** (2026-09-20) | Phase 9 wave W6 (permission catalogue entry + tenant-admin controller) |
| **P9-S7** | Platform domain revoke stickiness (spec §21 S-7) | Atharva — Project & Architecture Owner | **RESOLVED — RATIFIED — OPTION A (sticky; platform-only restore; no schema field)** (2026-09-20) | Phase 9 wave W6 (platform-domains revoke/restore + paired tests) |
| **P9-S14** | Invalid stored resolution mode semantics (spec §21 S-14) | Atharva — Project & Architecture Owner | **RESOLVED — RATIFIED — OPTION B (fail closed: log + Sentry + last valid cached mode, else 503; never legacy)** (2026-09-20) | Phase 9 wave W2 (kill-switch reader) |
| **G-21** | Approve Phase 9 specification (`PHASE-9-START-GATE-AND-IMPLEMENTATION-SPEC.md`) | Atharva — Project & Architecture Owner | **APPROVED** (2026-09-20) | Phase 9 implementation START — authorized (Wave 0 not yet started) |

**Phase 2a START GATE: `READY`** (see `docs/saas/PHASE-2-START-GATE-RESULT.md`).
**Phase 2b START GATE: `CLEARED`** — D2 **RESOLVED**, D8 **RESOLVED** (evidence `D8-20260907-02`), **G-16 APPROVED — AUTHORIZED (2026-09-07)**.
**Phase 2b: EXECUTED** (2026-09-07) — see `docs/saas/PHASE-2B-IMPLEMENTATION-REPORT.md` for the full backfill/reconciliation evidence.
**Phase 2 COMPLETION: `COMPLETE`** (2026-09-07) — Phase 2a (additive schema) + Phase 2b (identity backfill, reconciled) both done.

**Phase 3 decision docket: `RESOLVED`** (2026-09-07) — D6, D4, G-13, P3-D1, P3-D2 all recorded
above. **G-20 (Phase 3 specification approval): `APPROVED`** (2026-09-07). **Phase 3 START
GATE: `READY`** — implementation is authorized to begin per the G-20 record's scope and
exclusions. Phase 3 has since been implemented, audited, and committed (`5523df0`).

**Phase 4 decision docket (2026-09-08):** **D10** `RESOLVED — BUSINESS DECISION`
(sequential, tenant-scoped numbering, no FY reset — supplied later the same day as an
explicit business/product decision, not legal/tax advice; superseded the earlier
`TECHNICALLY RESOLVED / LEGAL FORMAT PENDING` status); **D11** `RESOLVED`; **P4-D1**
`RESOLVED — OPTION B`; **P4-D2** `OPEN — held, required only before wave W7`. **Phase 4
START GATE: `READY`** — every Phase 4 hard precondition named in
`PHASE-4-START-GATE-AND-IMPLEMENTATION-SPEC.md` §2 (D2, D3, D8/restore-drill-equivalent,
D10, D11) is now satisfied; P4-D2 remains open but was never a start-gate blocker (W7-only).
A residual risk is disclosed, not hidden: D10 is a business decision, not a statutory
confirmation — a future legal review requiring a different format is routed to the
architecture-change process (per the owner's own words in the D10 record), not treated as
blocking today. Phase 4's other named gates (D7 — `WebhookEvent` split, D9 — merchant
payment-credential storage, D12 — per-tenant tax model) remain `OPEN` but do not gate Phase
4 itself (D7/D9 gate Phase 7/8; D12 gates Phase 12) — see each record. **No Phase 4
implementation has occurred** — no source file, schema, or migration has been touched under
any record in this section; `READY` authorizes Phase 4 to *begin*, it is not itself an
implementation.

---

## Decisions from earlier documents NOT recorded here as resolved (and why)

Tracked in `PHASE-0-DECISION-RESOLUTION-AND-PHASE-1-SPEC.md §A.1`; **no owner decision has been
supplied** for these, so they remain `OPEN`:

| ID | Topic | Status | Note |
|---|---|:-:|---|
| **D7** | `WebhookEvent` split | **OPEN** | Gates Phase 7/8. |
| **D12** | Per-tenant tax model | **OPEN** | Gates Phase 12. |
| **D13** | Object storage provider/interface | **OPEN** | Gates Phase 10. |
| **D15** | Queue technology | **OPEN** | Gates Phase 11 (governed by D1). |

*(D6 has moved OUT of this table — it now has a full record above, status RESOLVED — BOTH
mechanisms, header cross-validated, 2026-09-07.)*

*(D2 has moved OUT of this table — it now has a full record above, status RESOLVED — OPTION A,
2026-09-07.)*

*(D8 has moved OUT of this table — it now has a full record above, status RESOLVED, 2026-09-07,
evidence `D8-20260907-02`.)*

*(D4 has moved OUT of this table — it now has a full record above, status RESOLVED — BOTH,
app-layer primary, 2026-09-07, per P3-D2's favorable findings.)*

*(D10 has moved OUT of this table — it now has a full record above, status RESOLVED —
BUSINESS DECISION, 2026-09-08 — sequential tenant-scoped numbering, no FY reset, explicitly
recorded as a business/product decision rather than legal/tax confirmation.)*

*(D11 has moved OUT of this table — it now has a full record above, status RESOLVED,
2026-09-08 — every current `AppSetting` key classified STORE or TENANT; none PLATFORM or
GLOBAL/SYSTEM.)*

*(D14 has moved OUT of this table — it now has a full record above as **P7-D4**, status
RESOLVED — RATIFIED, 2026-09-13 — production SaaS billing provider is Razorpay Subscriptions,
India-first strategy, confined behind the existing `BillingProvider` interface.)*

*(D9 has moved OUT of this table — it now has a full record above as **P8-D6**, status
RESOLVED — RATIFIED, 2026-09-14 — merchant `PaymentAccount` credentials stored as an
application-level AES-256-GCM encrypted blob, single symmetric master key held as one Render
environment secret, no external KMS/secrets-manager vendor introduced.)*

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

*Updated 2026-09-07 (later same day): D8 RESOLVED — a fresh production backup
(`printforge_prod_20260907T171225Z.dump`, SHA-256 `dfcd2399f0136ad0ba1d75341135557abca856d6b720eaa6fe9efb73fd91cb48`)
taken after production received the two Phase 2a migrations (a separately authorized production
migration, distinct from the D8 restore-drill authorization) was restored into the disposable
scratch instance `d8_scratch` and passed every `D8-RESTORE-DRILL-RUNBOOK.md` §6 check and §7
reconciliation row (evidence ID `D8-20260907-02`, Entry 4). All eight §10 conditions are met,
including condition 8 (explicit owner confirmation, recorded in the D8 Decision Log above).
**G-16 remains OPEN — PENDING** — D8's resolution does not authorize Phase 2b, and no
`TenantMembership`/`Customer` rows, and no `User` modification, occurred. Phase 2b START GATE
remains `BLOCKED`, now gated on **G-16 alone**. Phase 2 COMPLETION remains `BLOCKED`.*

*Updated 2026-09-07 (later same day): G-16 APPROVED — AUTHORIZED, and Phase 2b EXECUTED. The
owner supplied Tenant #1's name/slug (`PrintForge`/`printforge`) and primary Store's name/slug
(`PrintForge Store`/`printforge`) in writing (D3 Decision Log), and explicitly authorized G-16
in writing (G-16 Decision Log), subject to the pre-flight/dry-run/reconciliation/fresh-snapshot
requirements already satisfied. A fresh pre-backfill production snapshot
(`printforge_prod_prebackfill_20260907T173125Z.dump`, SHA-256
`0847ee3cf68b10990474c156bfc8870e2b100c713a48e8fe2fe17aa56f2ace24`) was taken immediately before
execution. The backfill (Free `Plan` + Tenant #1 + primary `Store` + `Subscription`, 5 `OWNER`
`TenantMembership` rows for all `role='ADMIN'` users, 18 `Customer` rows for all `role='CUSTOMER'`
users) was executed against production in one transaction, then re-run and confirmed idempotent
(zero new rows). Every existing commerce/business row count and the orders revenue sum were
verified unchanged before/after. One anomaly was recorded, not auto-resolved: 4 of 5 `ADMIN`
users have prior order history ("admin-who-also-shopped") — expected per spec, no `User` row
touched. Full evidence: `docs/saas/PHASE-2B-IMPLEMENTATION-REPORT.md`. **Phase 2b START GATE:
`CLEARED`. Phase 2 COMPLETION: `COMPLETE`.***

*Updated 2026-09-07 (Phase 3 decision docket): **D6 RESOLVED** — both tenant-resolution
mechanisms (host/subdomain + `X-Active-Tenant` header, header always cross-validated against
the caller's `ACTIVE` memberships, never trusted alone); final Domain→Store→Tenant runtime
resolution for the merchant console completes in Phase 9. **D4 RESOLVED** — both app-layer
scoping (primary) and Postgres RLS (defense-in-depth) on the Phase 1/2a tenancy tables, made
possible by **P3-D2's** favorable fact-finding: safe, read-only inspection of production found
the application role (`printforge_db_user`) is non-superuser and non-`BYPASSRLS`, and an
empirical probe (stable `pg_backend_pid()` across transactions within one connection; a
`SET LOCAL` value correctly transaction-scoped and not visible from a second, independent
connection) found no evidence of transaction-mode connection pooling. No production
configuration was changed, no role was altered, no RLS was enabled, and no data was written in
the course of this inspection. **G-13 APPROVED — RATIFIED** — a 13-permission catalogue and
`TenantRole → Set<Permission>` map, grounded in the actual current `admin.controller.ts` /
`products.controller.ts` / `categories.controller.ts` routes (not invented), with `OWNER` and
`ADMIN` differing only by two reserved, ownership-adjacent permissions
(`members:manage`, `payment-account:manage`), and `SUPER_ADMIN` deliberately holding no entry
in the map at all (frozen invariant 4 preserved). **P3-D1 RESOLVED** — the advisory/enforced
rollout flag is an environment variable per module, read via the existing `ConfigService`
pattern, defaulting to `advisory` when unset. **The Phase 3 decision docket is now closed.**
**No Phase 3 implementation has occurred** — no source file, `schema.prisma` change, migration,
or production write was made under any of these five records; a `G-20`-equivalent formal
"approve the Phase 3 specification" gate has not yet been recorded, so the **Phase 3 START GATE
is `NOT YET FORMALLY OPENED`** even though its decision prerequisites are now satisfied.*

*Updated 2026-09-08 (Phase 4 decision docket, `PHASE-4-DECISION-DOCKET.md`): **D10** recorded
**TECHNICALLY RESOLVED / LEGAL FORMAT PENDING** — the counter *mechanism* (per-tenant
`TenantCounter`, `MAX(existing)+1` seeding, existing numbers never rewritten) is decided;
the *statutory, customer-facing numbering format* is explicitly **not** invented here and
remains a separate legal/business approval item. **D11 RESOLVED** — every current
`AppSetting` key (found by reading `app-setting.constants.ts`, `orders.service.ts`,
`invoice-number.service.ts` directly, none guessed) classified `STORE` (`storeName`,
`storeAdminName`, `shippingFeeFlat`, `announcement_text`, `hero_slides`, `banners`,
`showcase_categories`) or `TENANT` (`tax.enabled`, `tax.pricingMode`, `tax.ratePercent`,
`invoice.numberPrefix`, `invoice.sellerLegalName`, `invoice.sellerAddress`,
`invoice.sellerGstin`, `invoice.sellerState`, `order_number_counter` →
`TenantCounter`, `invoice_number_counter` → `TenantCounter`); no key is `PLATFORM` or
`GLOBAL/SYSTEM` today. **P4-D1 RESOLVED — OPTION B** — `userId` stays the sole live
ownership path on `Cart`/`Order`/`Review`/`CouponUsage`/`IdempotencyKey` (and the
`uploadedByUserId`/`changedByUserId` actor columns); `customerId`-family columns are added
nullable and backfilled for existing rows only, via the same join Phase 2b already used; no
constraint moves, no customer-auth mechanism is built, no dual-write for new rows — the
actual cutover is left to Phase 9/12. **P4-D2 left OPEN, deliberately** — the
migration-safety guard is **not** modified now; this decision is required only immediately
before Phase 4 wave W7, and does not block Phase 4's start. **The Phase 4 decision docket is
now closed for these four items; no additional decision was found to be genuinely
necessary.** **No Phase 4 implementation has occurred** — no source file, schema, or
migration was touched under any of these four records. **Phase 4 START GATE: `NOT READY`** —
this record does not claim otherwise: D10's statutory format is a genuine, unresolved
legal/business input that wave W4 cannot fully complete without.*

*Updated 2026-09-08 (later same day) — D10 closure: the business/product owner supplied the
numbering format explicitly: **"For PrintForge, use sequential tenant-scoped order and
invoice numbering. Existing numbers are never rewritten. New numbers use TenantCounter with
an atomic per-tenant counter. No financial-year reset is required by the current business
decision."** — with the explicit instruction: **"This is a business/product decision. Do
not represent it as legal/tax advice or statutory confirmation. If legal review later
requires a different statutory format, handle that through the architecture-change process
before production use."** D10 is recorded **RESOLVED — BUSINESS DECISION**, superseding the
earlier `TECHNICALLY RESOLVED / LEGAL FORMAT PENDING` status — both the mechanism
(`TenantCounter`, per-tenant, `MAX(existing)+1` seeding, existing atomic claim pattern,
numbers never rewritten) and the format (sequential, no FY reset) are now decided, with the
residual legal-review risk explicitly disclosed and routed to the architecture-change
process rather than treated as a current blocker. **With D10 resolved, every Phase 4 hard
precondition named in `PHASE-4-START-GATE-AND-IMPLEMENTATION-SPEC.md` §2 is satisfied (D2,
D3, D8, D10, D11). Phase 4 START GATE: `READY`.** P4-D2 remains `OPEN` but was never a
start-gate blocker (required only immediately before wave W7). **No Phase 4 implementation
has occurred under this record** — `READY` authorizes Phase 4 to begin; it is not itself an
implementation, and none was performed.*

*Updated 2026-09-09 — W3 and W4/W5 both EXECUTED (see
`PHASE-4-IMPLEMENTATION-REPORT.md` §14/§15/§16 for full evidence): W3 deployed to production
(migration `20260908093650_w3_tenant_scoping_columns`); W4/W5 backfill run against
production with full reconciliation, idempotency proof, and independent audit, all
`PASS`. **W6 decision docket (`PHASE-4-W6-DECISION-DOCKET.md`) closed for two new items:
P4-D3 RESOLVED** — the migration-safety guard may permit a W6 composite ownership FK only
when its statement matches an exact structural shape (single-action `ALTER TABLE ... ADD
CONSTRAINT ... FOREIGN KEY` on a pre-existing table, composite key of the form
`("tenantId"|"storeId", X) REFERENCES ...("tenantId"|"storeId", X)` with the *same* scope
token on both sides) **and** the constraint name is on the fixed, named 19-entry W6
allowlist — both required together, no generic `ADD CONSTRAINT`/composite-FK/bypass
allowance introduced. **P4-D4 RESOLVED — OPTION A** — nullable `storeId` columns are to be
added to `ProductImage`, `ProductVariant`, `CustomizationField`, `CartItem`,
`CartItemCustomization`, and `OrderItem` (the tables W3 left with `tenantId` only,
matching their "derived" `SID` classification), backfilled from the same already-proven
parent-ownership relationship each table's `tenantId` already uses — `tenantId` is
explicitly **not** substituted for `storeId` on any of them, per the owner's own stated
reasoning that doing so would weaken the intended store-scoped isolation guarantee. **Neither
P4-D3 nor P4-D4 has been implemented** — no source file, `schema.prisma` change, or
migration was touched by either record; both authorize a specific, exact future change,
they do not perform one. **P4-D2 remains `OPEN`, unaffected, held for wave W7 only.** **W6
START GATE: `NOT READY`** — W6 still requires, in addition to what P4-D3/P4-D4 resolved:
the actual guard-code implementation, the actual `storeId` column addition + backfill, the
composite-FK and composite-unique preflight validations (`PHASE-4-W6-DECISION-DOCKET.md`
§6/§7), a fresh production backup immediately before W6, and its own separate, explicit W6
implementation authorization. **No implementation, schema change, or migration was
performed by this record.***

*Updated 2026-09-10 — **P4-D2 RESOLVED — IMPLEMENTED.** Per explicit owner approval
(scope locked exactly as: `tenantId`-only `NOT NULL` enforcement on the 20 approved
tables; `outbox_events.tenantId` permanently excluded; `storeId` not added to the W7
guard or scope; `DROP CONSTRAINT` permitted only for the exact five approved legacy
names — `categories_slug_key`, `products_slug_key`, `coupons_code_key`,
`orders_orderNumber_key`, `invoices_invoiceNumber_key`; `customerId`/`carts.userId`/
`reviews(productId,userId)` untouched), `backend/src/migration-safety.spec.ts` was
extended with a self-verifying `CHECK ... NOT VALID` → `VALIDATE CONSTRAINT` →
`SET NOT NULL` pairing check (all three keyed to the identical `(table, column)`,
same-file-scoped) plus the fixed legacy-unique `DROP CONSTRAINT` allowlist — both
gated exactly as the docket originally recommended, no bare verb exemption. **This is
the first P4-record whose guard-code implementation is done in the same turn as its
resolution** (P4-D3/P4-D4 deferred theirs to a later turn). Full suite: **112/112
tests passing** — 41 new P4-D2 tests (positive: all 20 `tenantId` sequences alone and
together, all 5 legacy drops alone and together, a combined realistic file; negative:
every pairing/scope/shape/allowlist violation named in the docket's own required-test
list, plus a dedicated `outbox_events` permanent-exception proof and smuggled-second-
action coverage for all four shapes) plus the complete pre-existing regression suite,
unchanged and green, including the real on-disk migration files. **`schema.prisma` was
NOT modified. No `prisma/migrations/` file was created. Production was NOT accessed.
Nothing was staged or committed by this record** — the actual W7 migration file, its
preflight validation, a fresh pre-wave backup, and production execution remain a
separate, later, explicitly-authorized implementation step, the same sequencing P4-D3
established for W6. **No other record (D10, D11, P4-D1, P4-D3, P4-D4) was touched,
reopened, or reworded by this update.***
