-- Phase 4 (W6-B) — additive, nullable `storeId` on the 6 derived commerce
-- tables the W3 pass left with `tenantId` only (docs/saas/PHASE-4-W6-
-- DECISION-DOCKET.md §5.1 / decision P4-D4, Option A). Every ALTER TABLE
-- below is a single, nullable, no-default ADD COLUMN (G-19 exemption in
-- migration-safety.spec.ts requires exactly one such action per statement
-- — hence one ALTER TABLE per column, matching the W3 migration's style).
-- No backfill here (W6-C, application-level), no FKs/uniques yet (a later
-- W6 migration, gated on 100% backfill completeness + preflight checks),
-- no NOT NULL, no contract changes (W7).

-- AlterTable: product_images
ALTER TABLE "product_images" ADD COLUMN "storeId" TEXT;

-- AlterTable: product_variants
ALTER TABLE "product_variants" ADD COLUMN "storeId" TEXT;

-- AlterTable: customization_fields
ALTER TABLE "customization_fields" ADD COLUMN "storeId" TEXT;

-- AlterTable: cart_items
ALTER TABLE "cart_items" ADD COLUMN "storeId" TEXT;

-- AlterTable: cart_item_customizations
ALTER TABLE "cart_item_customizations" ADD COLUMN "storeId" TEXT;

-- AlterTable: order_items
ALTER TABLE "order_items" ADD COLUMN "storeId" TEXT;

-- CreateIndex
CREATE INDEX "product_images_storeId_idx" ON "product_images"("storeId");

-- CreateIndex
CREATE INDEX "product_variants_storeId_idx" ON "product_variants"("storeId");

-- CreateIndex
CREATE INDEX "customization_fields_storeId_idx" ON "customization_fields"("storeId");

-- CreateIndex
CREATE INDEX "cart_items_storeId_idx" ON "cart_items"("storeId");

-- CreateIndex
CREATE INDEX "cart_item_customizations_storeId_idx" ON "cart_item_customizations"("storeId");

-- CreateIndex
CREATE INDEX "order_items_storeId_idx" ON "order_items"("storeId");
