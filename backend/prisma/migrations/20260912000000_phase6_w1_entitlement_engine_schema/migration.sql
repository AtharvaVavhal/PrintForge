-- Phase 6 (W1) — Entitlement engine schema + platform catalogue CRUD.
--
-- Purely additive: one new enum, three new nullable columns on the
-- existing `plans` table (see schema.prisma's own comment on `Plan` for
-- why these are nullable rather than the ratified design's literal
-- `NOT NULL DEFAULT` syntax — migration-safety.spec.ts's G-19 rule permits
-- ONLY a bare nullable ADD COLUMN, one column per statement, on a table
-- created by an earlier migration; there is no exemption for a defaulted/
-- NOT-NULL addition, and the repo's one two-phase NOT-NULL mechanism
-- (P4-D2's CHECK/VALIDATE/SET-NOT-NULL trio) is hard-scoped by name to 20
-- pre-approved `(table, "tenantId")` pairs from an already-closed effort),
-- four brand-new tables, their indexes/FKs, and one hand-added CHECK
-- constraint Prisma's own schema DSL cannot express (see below).
--
-- Data backfill (setting the one pre-existing `Plan` row's three new
-- nullable columns to their real default values) is a SEPARATE,
-- non-migration step — prisma/backfill/phase6-w1-plan-backfill.ts — same
-- convention every prior backfill in this repo already establishes:
-- migration-safety.spec.ts forbids INSERT/UPDATE of existing rows in a
-- migration.sql file outright, no exemption at all.

-- CreateEnum
CREATE TYPE "LimitPeriod" AS ENUM ('PERSISTENT', 'BILLING_PERIOD');

-- AlterTable — three separate, single-action, bare-nullable ADD COLUMN
-- statements (G-19's exact permitted shape: no DEFAULT, no NOT NULL, one
-- column per statement).
ALTER TABLE "plans" ADD COLUMN "isActive" BOOLEAN;
ALTER TABLE "plans" ADD COLUMN "sortOrder" INTEGER;
ALTER TABLE "plans" ADD COLUMN "isEnterpriseCustom" BOOLEAN;

-- CreateTable
CREATE TABLE "plan_features" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "featureKey" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "plan_features_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_limits" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "limitKey" TEXT NOT NULL,
    "limitValue" INTEGER,
    "period" "LimitPeriod" NOT NULL,

    CONSTRAINT "plan_limits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "limitKey" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_entitlement_overrides" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "featureKey" TEXT,
    "limitKey" TEXT,
    "boolValue" BOOLEAN,
    "intValue" INTEGER,
    "reason" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "revokedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_entitlement_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "plan_features_planId_featureKey_key" ON "plan_features"("planId", "featureKey");

-- CreateIndex
CREATE UNIQUE INDEX "plan_limits_planId_limitKey_key" ON "plan_limits"("planId", "limitKey");

-- CreateIndex
CREATE UNIQUE INDEX "usage_tenantId_limitKey_period_key" ON "usage"("tenantId", "limitKey", "period");

-- CreateIndex
CREATE INDEX "tenant_entitlement_overrides_tenantId_idx" ON "tenant_entitlement_overrides"("tenantId");

-- AddForeignKey
ALTER TABLE "plan_features" ADD CONSTRAINT "plan_features_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_limits" ADD CONSTRAINT "plan_limits_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage" ADD CONSTRAINT "usage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_entitlement_overrides" ADD CONSTRAINT "tenant_entitlement_overrides_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_entitlement_overrides" ADD CONSTRAINT "tenant_entitlement_overrides_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_entitlement_overrides" ADD CONSTRAINT "tenant_entitlement_overrides_revokedByUserId_fkey" FOREIGN KEY ("revokedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CheckConstraint — hand-added (Prisma's schema DSL has no native
-- multi-column CHECK attribute), same "Prisma will never touch a
-- hand-added SQL statement" convention as every other manually-added
-- constraint in this schema (the partial unique index on `stores`, every
-- composite ownership FK). Enforces "exactly one of featureKey / limitKey"
-- at the database level — the actual authority; the platform service adds
-- the same check at the application layer purely for a clean error message.
ALTER TABLE "tenant_entitlement_overrides" ADD CONSTRAINT "tenant_entitlement_overrides_exactly_one_key" CHECK (("featureKey" IS NOT NULL) <> ("limitKey" IS NOT NULL));
