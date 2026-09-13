-- Phase 7 — Cancellation Retention + Unscheduling wave (docs/saas/DECISIONS.md
-- P7-D3 Part D). Single, purely additive, nullable ADD COLUMN on the
-- pre-existing `subscriptions` table — G-19 compliant (no DEFAULT, no NOT
-- NULL, one column, one action), the same shape already used for
-- `graceEndsAt`/`pendingPlanId`/`cancelAtPeriodEnd` in the Stage 1 migration.
-- No enum change, no other table touched, no destructive statement of any
-- kind.

-- AlterTable
ALTER TABLE "subscriptions" ADD COLUMN "retentionEndsAt" TIMESTAMP(3);
