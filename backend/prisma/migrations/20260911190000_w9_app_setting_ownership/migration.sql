-- Phase 5 (W9) — AppSetting tenant/store ownership (decision D11).
--
-- Purely additive: two brand-new tables (tenant_settings, store_settings)
-- plus their indexes/FKs, and one new supporting unique index on the
-- pre-existing `stores` table. The pre-existing `app_settings` table is
-- untouched by this migration — it cannot be altered in place (no
-- migration-safety.spec.ts exemption covers giving it a NOT NULL
-- tenantId/storeId outside that guard's own fixed, already-ratified W7
-- allowlist), and its remaining legitimate use
-- (`OrdersService.generateOrderNumber`'s `order_number_counter`) is out of
-- scope for this decision — see the W9 implementation report.
--
-- Data backfill (mapping the pre-existing global app_settings rows for the
-- 15 frozen D11 keys onto Tenant #1 / its primary Store) is a SEPARATE,
-- non-migration step — prisma/backfill/w9-app-setting-backfill.ts — same
-- convention prisma/backfill/w6-preflight.ts and w4-backfill.ts already
-- establish: migration-safety.spec.ts's additive-only guard forbids
-- INSERT/UPDATE of rows in a migration.sql file (only CREATE and a few
-- narrow, named ALTER exemptions are permitted), so any data movement
-- happens via a standalone, explicitly-run Prisma Client script, never a
-- tracked migration.

-- CreateTable
CREATE TABLE "tenant_settings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "store_settings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "store_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tenant_settings_tenantId_idx" ON "tenant_settings"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_settings_tenantId_key_key" ON "tenant_settings"("tenantId", "key");

-- CreateIndex
CREATE INDEX "store_settings_storeId_idx" ON "store_settings"("storeId");

-- CreateIndex
CREATE INDEX "store_settings_tenantId_idx" ON "store_settings"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "store_settings_storeId_key_key" ON "store_settings"("storeId", "key");

-- Supporting unique index for the composite ownership FK below — the same
-- "(scopeCol, id) is not inferred from the id-only PRIMARY KEY" Postgres
-- prerequisite the Phase 4 W6 composite-FK migration documents for 8
-- other tables (categories, products, product_variants, ...). `stores`
-- was not previously a referenced side of any composite FK, so it never
-- needed this index before now.
-- CreateIndex
CREATE UNIQUE INDEX "stores_tenantId_id_key" ON "stores"("tenantId", "id");

-- AddForeignKey
ALTER TABLE "tenant_settings" ADD CONSTRAINT "tenant_settings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_settings" ADD CONSTRAINT "store_settings_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Composite ownership FK (Phase 4 W6 shape, hand-added — same convention
-- as every other composite ownership FK in this schema): guarantees a
-- store-owned setting's `storeId` genuinely belongs to the SAME tenant as
-- the setting's own (denormalized) `tenantId` column. This constraint is
-- on `store_settings`, a table CREATED in this same migration file, so it
-- is not subject to migration-safety.spec.ts's W6-named-allowlist check
-- (that check applies only to composite FKs retrofitted onto a
-- PRE-EXISTING table) — any shape/name is permitted here, same as Prisma's
-- own plain FK creation on a brand-new table.
-- AddForeignKey
ALTER TABLE "store_settings" ADD CONSTRAINT "store_settings_tenantId_storeId_fkey" FOREIGN KEY ("tenantId", "storeId") REFERENCES "stores"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
