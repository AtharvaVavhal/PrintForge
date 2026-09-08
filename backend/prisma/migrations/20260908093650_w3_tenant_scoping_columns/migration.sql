-- Phase 4 (W3) — additive, nullable SaaS-ownership columns + TenantCounter.
-- Master Plan W3 ("ADD COLUMN ... NULL; additive indexes CONCURRENTLY").
-- Every ALTER TABLE below is a single, nullable, no-default ADD COLUMN
-- (G-19 exemption in migration-safety.spec.ts requires exactly one such
-- action per statement — hence one ALTER TABLE per column instead of
-- Prisma's default comma-batched form). No backfill, no NOT NULL, no FK
-- re-pointing, no composite FKs/uniques (W6), no contract changes (W7).

-- AlterTable: cart_item_customizations
ALTER TABLE "cart_item_customizations" ADD COLUMN "tenantId" TEXT;

-- AlterTable: cart_items
ALTER TABLE "cart_items" ADD COLUMN "tenantId" TEXT;

-- AlterTable: carts
ALTER TABLE "carts" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "carts" ADD COLUMN "storeId" TEXT;
ALTER TABLE "carts" ADD COLUMN "customerId" TEXT;

-- AlterTable: categories
ALTER TABLE "categories" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "categories" ADD COLUMN "storeId" TEXT;

-- AlterTable: coupon_usages
ALTER TABLE "coupon_usages" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "coupon_usages" ADD COLUMN "storeId" TEXT;
ALTER TABLE "coupon_usages" ADD COLUMN "customerId" TEXT;

-- AlterTable: coupons
ALTER TABLE "coupons" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "coupons" ADD COLUMN "storeId" TEXT;

-- AlterTable: customization_fields
ALTER TABLE "customization_fields" ADD COLUMN "tenantId" TEXT;

-- AlterTable: idempotency_keys
ALTER TABLE "idempotency_keys" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "idempotency_keys" ADD COLUMN "customerId" TEXT;

-- AlterTable: invoices
ALTER TABLE "invoices" ADD COLUMN "tenantId" TEXT;

-- AlterTable: order_item_customizations
ALTER TABLE "order_item_customizations" ADD COLUMN "tenantId" TEXT;

-- AlterTable: order_items
ALTER TABLE "order_items" ADD COLUMN "tenantId" TEXT;

-- AlterTable: order_status_history
ALTER TABLE "order_status_history" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "order_status_history" ADD COLUMN "changedByCustomerId" TEXT;
ALTER TABLE "order_status_history" ADD COLUMN "changedByMembershipId" TEXT;

-- AlterTable: orders
ALTER TABLE "orders" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "orders" ADD COLUMN "storeId" TEXT;
ALTER TABLE "orders" ADD COLUMN "customerId" TEXT;

-- AlterTable: outbox_events
ALTER TABLE "outbox_events" ADD COLUMN "tenantId" TEXT;

-- AlterTable: payment_attempts
ALTER TABLE "payment_attempts" ADD COLUMN "tenantId" TEXT;

-- AlterTable: product_images
ALTER TABLE "product_images" ADD COLUMN "tenantId" TEXT;

-- AlterTable: product_variants
ALTER TABLE "product_variants" ADD COLUMN "tenantId" TEXT;

-- AlterTable: products
ALTER TABLE "products" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "products" ADD COLUMN "storeId" TEXT;

-- AlterTable: refunds
ALTER TABLE "refunds" ADD COLUMN "tenantId" TEXT;

-- AlterTable: reviews
ALTER TABLE "reviews" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "reviews" ADD COLUMN "storeId" TEXT;
ALTER TABLE "reviews" ADD COLUMN "customerId" TEXT;

-- AlterTable: uploaded_files
ALTER TABLE "uploaded_files" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "uploaded_files" ADD COLUMN "uploadedByCustomerId" TEXT;

-- CreateTable: tenant_counters (brand-new, empty table — decision D10)
CREATE TABLE "tenant_counters" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_counters_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenant_counters_tenantId_key_key" ON "tenant_counters"("tenantId", "key");

-- CreateIndex
CREATE INDEX "cart_item_customizations_tenantId_idx" ON "cart_item_customizations"("tenantId");

-- CreateIndex
CREATE INDEX "cart_items_tenantId_idx" ON "cart_items"("tenantId");

-- CreateIndex
CREATE INDEX "carts_tenantId_idx" ON "carts"("tenantId");

-- CreateIndex
CREATE INDEX "carts_storeId_idx" ON "carts"("storeId");

-- CreateIndex
CREATE INDEX "carts_customerId_idx" ON "carts"("customerId");

-- CreateIndex
CREATE INDEX "categories_tenantId_idx" ON "categories"("tenantId");

-- CreateIndex
CREATE INDEX "categories_storeId_idx" ON "categories"("storeId");

-- CreateIndex
CREATE INDEX "coupon_usages_tenantId_idx" ON "coupon_usages"("tenantId");

-- CreateIndex
CREATE INDEX "coupon_usages_storeId_idx" ON "coupon_usages"("storeId");

-- CreateIndex
CREATE INDEX "coupon_usages_customerId_idx" ON "coupon_usages"("customerId");

-- CreateIndex
CREATE INDEX "coupons_tenantId_idx" ON "coupons"("tenantId");

-- CreateIndex
CREATE INDEX "coupons_storeId_idx" ON "coupons"("storeId");

-- CreateIndex
CREATE INDEX "customization_fields_tenantId_idx" ON "customization_fields"("tenantId");

-- CreateIndex
CREATE INDEX "idempotency_keys_tenantId_idx" ON "idempotency_keys"("tenantId");

-- CreateIndex
CREATE INDEX "idempotency_keys_customerId_idx" ON "idempotency_keys"("customerId");

-- CreateIndex
CREATE INDEX "invoices_tenantId_idx" ON "invoices"("tenantId");

-- CreateIndex
CREATE INDEX "order_item_customizations_tenantId_idx" ON "order_item_customizations"("tenantId");

-- CreateIndex
CREATE INDEX "order_items_tenantId_idx" ON "order_items"("tenantId");

-- CreateIndex
CREATE INDEX "order_status_history_tenantId_idx" ON "order_status_history"("tenantId");

-- CreateIndex
CREATE INDEX "orders_tenantId_idx" ON "orders"("tenantId");

-- CreateIndex
CREATE INDEX "orders_storeId_idx" ON "orders"("storeId");

-- CreateIndex
CREATE INDEX "orders_customerId_idx" ON "orders"("customerId");

-- CreateIndex
CREATE INDEX "outbox_events_tenantId_idx" ON "outbox_events"("tenantId");

-- CreateIndex
CREATE INDEX "payment_attempts_tenantId_idx" ON "payment_attempts"("tenantId");

-- CreateIndex
CREATE INDEX "product_images_tenantId_idx" ON "product_images"("tenantId");

-- CreateIndex
CREATE INDEX "product_variants_tenantId_idx" ON "product_variants"("tenantId");

-- CreateIndex
CREATE INDEX "products_tenantId_idx" ON "products"("tenantId");

-- CreateIndex
CREATE INDEX "products_storeId_idx" ON "products"("storeId");

-- CreateIndex
CREATE INDEX "refunds_tenantId_idx" ON "refunds"("tenantId");

-- CreateIndex
CREATE INDEX "reviews_tenantId_idx" ON "reviews"("tenantId");

-- CreateIndex
CREATE INDEX "reviews_storeId_idx" ON "reviews"("storeId");

-- CreateIndex
CREATE INDEX "reviews_customerId_idx" ON "reviews"("customerId");

-- CreateIndex
CREATE INDEX "uploaded_files_tenantId_idx" ON "uploaded_files"("tenantId");

-- CreateIndex
CREATE INDEX "uploaded_files_uploadedByCustomerId_idx" ON "uploaded_files"("uploadedByCustomerId");

-- AddForeignKey
ALTER TABLE "tenant_counters" ADD CONSTRAINT "tenant_counters_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
