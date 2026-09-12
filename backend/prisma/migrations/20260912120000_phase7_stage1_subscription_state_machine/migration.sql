-- Phase 7 (Stage 1) — Subscription state machine foundation.
-- docs/saas/DECISIONS.md, record P7-D1.
--
-- Purely additive: seven separate, single-action, bare-nullable ADD COLUMN
-- statements on the pre-existing `subscriptions` table (migration-safety
-- .spec.ts's G-19 rule permits ONLY this shape for a table an earlier
-- migration created — no DEFAULT, no NOT NULL, one column per statement;
-- same convention `20260912000000_phase6_w1_entitlement_engine_schema`
-- already established for `plans`), two `CREATE UNIQUE INDEX` statements
-- (a bare CREATE, not an ALTER TABLE — unconditionally permitted by the
-- guard regardless of target table), one new enum, one new table
-- (`subscription_events`) with its own indexes and foreign key (no G-19
-- restriction at all — the ALTER TABLE below targets a table created in
-- THIS SAME file).
--
-- Hand-written rather than a raw `prisma migrate diff` dump: this
-- environment's `prisma migrate dev` cannot run non-interactively, and a
-- `migrate diff` against either the live dev database or the migration
-- history folder also surfaces a large amount of PRE-EXISTING, UNRELATED
-- drift (a long list of `storeId`-composite-FK/index DROP statements that
-- predate this change entirely and are not part of Phase 7) — this file
-- contains ONLY the Phase 7 Stage 1 delta, verified by hand against
-- schema.prisma's own new fields/models, with the unrelated drift
-- deliberately excluded (not fixed, not touched — out of scope).
--
-- No `pendingPlanId` foreign key is created here — see schema.prisma's own
-- comment on `Subscription.pendingPlanId` for why a real FK on this
-- pre-existing table is not achievable within migration-safety.spec.ts's
-- current guard, and is deferred to a separate, later, explicitly-
-- authorized decision rather than invented here.
--
-- No `BillingWebhookEvent` table (D7 still OPEN). No SaaS invoice or
-- payment-method table. No RLS change. No data backfill (there are no
-- existing rows anywhere that need one — every new column is nullable and
-- every new table starts empty).

-- CreateEnum
CREATE TYPE "SubscriptionEventType" AS ENUM ('created', 'activated', 'upgraded', 'downgrade_scheduled', 'downgrade_applied', 'payment_failed', 'paused', 'resumed', 'cancelled', 'expired', 'reactivated');

-- AlterTable — seven separate, single-action, bare-nullable ADD COLUMN
-- statements (G-19's exact permitted shape).
ALTER TABLE "subscriptions" ADD COLUMN "providerCustomerId" TEXT;
ALTER TABLE "subscriptions" ADD COLUMN "providerSubscriptionId" TEXT;
ALTER TABLE "subscriptions" ADD COLUMN "cancelAtPeriodEnd" BOOLEAN;
ALTER TABLE "subscriptions" ADD COLUMN "trialEndsAt" TIMESTAMP(3);
ALTER TABLE "subscriptions" ADD COLUMN "pendingPlanId" TEXT;
ALTER TABLE "subscriptions" ADD COLUMN "graceEndsAt" TIMESTAMP(3);
ALTER TABLE "subscriptions" ADD COLUMN "updatedAt" TIMESTAMP(3);

-- CreateIndex — bare CREATE UNIQUE INDEX statements, never an ALTER TABLE
-- ADD CONSTRAINT, so migration-safety.spec.ts's per-table ALTER TABLE
-- restriction never applies to these regardless of which table they
-- target (Postgres/Prisma's own nullable+unique semantics: multiple NULLs
-- coexist, same precedent as the pre-existing
-- `payment_attempts.razorpayPaymentId`).
CREATE UNIQUE INDEX "subscriptions_providerCustomerId_key" ON "subscriptions"("providerCustomerId");
CREATE UNIQUE INDEX "subscriptions_providerSubscriptionId_key" ON "subscriptions"("providerSubscriptionId");

-- CreateTable
CREATE TABLE "subscription_events" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" "SubscriptionEventType" NOT NULL,
    "fromStatus" "SubscriptionStatus",
    "toStatus" "SubscriptionStatus" NOT NULL,
    "fromPlanId" TEXT,
    "toPlanId" TEXT,
    "providerEventId" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "subscription_events_subscriptionId_idx" ON "subscription_events"("subscriptionId");

-- CreateIndex
CREATE INDEX "subscription_events_tenantId_idx" ON "subscription_events"("tenantId");

-- CreateIndex — deliberately NOT unique (P7-D1 Part F): providerEventId
-- dedup belongs to the future BillingWebhookEvent boundary, not here.
CREATE INDEX "subscription_events_providerEventId_idx" ON "subscription_events"("providerEventId");

-- AddForeignKey — targets `subscription_events`, a table created in THIS
-- migration, so migration-safety.spec.ts's per-existing-table ALTER TABLE
-- restriction does not apply.
ALTER TABLE "subscription_events" ADD CONSTRAINT "subscription_events_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
