-- Phase 7 — D7 SaaS Billing Webhooks wave.
-- docs/saas/DECISIONS.md, record P7-D3 Part B (two-table design — this is
-- the "BillingWebhookEvent" half; `subscription_events`, already created
-- by 20260912120000_phase7_stage1_subscription_state_machine, is never
-- touched by this migration and never merged with this table).
--
-- Purely additive: one new enum, one new table with its own indexes — no
-- G-19 restriction applies to any of it, since nothing here is an
-- ALTER TABLE on a table created by an earlier migration.
--
-- Platform-scoped, deliberately no `tenantId` column and no foreign key to
-- `subscriptions` (see schema.prisma's own comment on `BillingWebhookEvent`
-- for why) — a structural sibling of `webhook_events` (Phase 1), kept as an
-- entirely separate table/enum per P7-D3 Part B (frozen SaaS invariant 6:
-- SaaS subscription billing and merchant commerce payments are separate)
-- rather than extended onto the commerce table.
--
-- No existing table altered. No existing enum altered. No RLS migration
-- applied or touched.

-- CreateEnum
CREATE TYPE "BillingWebhookEventStatus" AS ENUM ('RECEIVED', 'PROCESSED', 'PROCESSING_FAILED', 'IGNORED', 'FAILED');

-- CreateTable
CREATE TABLE "billing_webhook_events" (
    "id" TEXT NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "BillingWebhookEventStatus" NOT NULL DEFAULT 'RECEIVED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "billing_webhook_events_providerEventId_key" ON "billing_webhook_events"("providerEventId");

-- CreateIndex
CREATE INDEX "billing_webhook_events_status_availableAt_idx" ON "billing_webhook_events"("status", "availableAt");
