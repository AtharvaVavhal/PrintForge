-- Phase 4 (W6-D / W6-E) — composite ownership FKs + composite unique
-- indexes. Decision P4-D3 (docs/saas/DECISIONS.md; migration-safety.spec.ts)
-- authorizes exactly the 19 composite FKs below, by exact name/shape, on
-- top of the existing G-19 (nullable ADD COLUMN) and D4/G-20 (RLS toggle)
-- exemptions. Every FK/unique here matches docs/saas/PHASE-4-W6-DECISION-
-- DOCKET.md §4.1/§4.2 exactly. Preceded by a REQUIRED preflight (19 FK +
-- 6 unique checks, prisma/backfill/w6-preflight.ts) that must return zero
-- rows before this migration is ever applied to a real database.
--
-- Nothing here is destructive: no SET NOT NULL, no DROP CONSTRAINT/INDEX,
-- no removal of any legacy single-column unique or plain FK (§4.3) — those
-- all stay exactly as-is. This migration only ADDs constraints/indexes
-- alongside what already exists.
--
-- ─── Necessary technical prerequisite (NOT additional scope) ──────────────
-- A composite FK's referenced columns `(scopeCol, id)` require an EXPLICIT
-- unique constraint/index on exactly that pair — Postgres does not infer
-- this from the narrower `id`-only PRIMARY KEY, even though `id` alone
-- already uniquely identifies the row (verified empirically: `REFERENCES
-- parent("storeId", id)` fails with "no unique constraint matching given
-- keys" without it). The 8 `CREATE UNIQUE INDEX ... ("<scope>", id)`
-- statements below exist solely to satisfy this Postgres requirement for
-- the 8 distinct (table, scope column) pairs referenced anywhere in the 19
-- FKs — they are not named in §4.1 because §4.1 only enumerates FK pairs,
-- not this supporting mechanical prerequisite.
--
-- ─── ON DELETE / ON UPDATE actions ─────────────────────────────────────────
-- Each composite FK mirrors the ON DELETE/ON UPDATE action already defined
-- on the corresponding EXISTING single-column FK for the same relationship
-- (e.g. `products_categoryId_fkey` is `RESTRICT` -> so is
-- `products_storeId_categoryId_fkey`) — matching established behavior, not
-- inventing new cascade semantics. Where the existing action is `SET
-- NULL`, the composite FK uses Postgres 15+'s column-specific
-- `ON DELETE SET NULL ("<col>")` form (verified empirically on this
-- server's Postgres 18.6) so that ONLY the non-scope FK column is ever
-- nulled — the bare (unqualified) `ON DELETE SET NULL` on a multi-column
-- FK would null out BOTH columns, including `storeId`/`tenantId`, which
-- must never be cleared as an unrelated side effect of a delete elsewhere.

-- ─── Supporting unique indexes (scopeCol, id) — prerequisite for the FKs below ───

-- CreateIndex
CREATE UNIQUE INDEX "categories_storeId_id_key" ON "categories"("storeId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "products_storeId_id_key" ON "products"("storeId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "product_variants_storeId_id_key" ON "product_variants"("storeId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "customization_fields_storeId_id_key" ON "customization_fields"("storeId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "coupons_storeId_id_key" ON "coupons"("storeId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "orders_tenantId_id_key" ON "orders"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_attempts_tenantId_id_key" ON "payment_attempts"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "order_items_storeId_id_key" ON "order_items"("storeId", "id");

-- ─── Composite ownership FKs (19 total, §4.1) ──────────────────────────────

-- AddForeignKey (#1) — self-referential; mirrors categories_parentCategoryId_fkey (SET NULL / CASCADE)
ALTER TABLE "categories" ADD CONSTRAINT "categories_storeId_parentCategoryId_fkey" FOREIGN KEY ("storeId", "parentCategoryId") REFERENCES "categories"("storeId", "id") ON DELETE SET NULL ("parentCategoryId") ON UPDATE CASCADE;

-- AddForeignKey (#2) — mirrors products_categoryId_fkey (RESTRICT / CASCADE)
ALTER TABLE "products" ADD CONSTRAINT "products_storeId_categoryId_fkey" FOREIGN KEY ("storeId", "categoryId") REFERENCES "categories"("storeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey (#3) — mirrors product_images_productId_fkey (RESTRICT / CASCADE)
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_storeId_productId_fkey" FOREIGN KEY ("storeId", "productId") REFERENCES "products"("storeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey (#4) — mirrors product_variants_productId_fkey (RESTRICT / CASCADE)
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_storeId_productId_fkey" FOREIGN KEY ("storeId", "productId") REFERENCES "products"("storeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey (#5) — mirrors customization_fields_productId_fkey (RESTRICT / CASCADE)
ALTER TABLE "customization_fields" ADD CONSTRAINT "customization_fields_storeId_productId_fkey" FOREIGN KEY ("storeId", "productId") REFERENCES "products"("storeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey (#6) — mirrors cart_items_productId_fkey (RESTRICT / CASCADE)
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_storeId_productId_fkey" FOREIGN KEY ("storeId", "productId") REFERENCES "products"("storeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey (#7) — mirrors cart_items_variantId_fkey (RESTRICT / CASCADE)
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_storeId_variantId_fkey" FOREIGN KEY ("storeId", "variantId") REFERENCES "product_variants"("storeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey (#8) — mirrors cart_item_customizations_customizationFieldId_fkey (RESTRICT / CASCADE)
ALTER TABLE "cart_item_customizations" ADD CONSTRAINT "cart_item_customizations_storeId_customizationFieldId_fkey" FOREIGN KEY ("storeId", "customizationFieldId") REFERENCES "customization_fields"("storeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey (#9) — mirrors orders_couponId_fkey (SET NULL / CASCADE); column-specific SET NULL preserves storeId
ALTER TABLE "orders" ADD CONSTRAINT "orders_storeId_couponId_fkey" FOREIGN KEY ("storeId", "couponId") REFERENCES "coupons"("storeId", "id") ON DELETE SET NULL ("couponId") ON UPDATE CASCADE;

-- AddForeignKey (#10) — mirrors order_items_productId_fkey (SET NULL / CASCADE); column-specific SET NULL preserves storeId
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_storeId_productId_fkey" FOREIGN KEY ("storeId", "productId") REFERENCES "products"("storeId", "id") ON DELETE SET NULL ("productId") ON UPDATE CASCADE;

-- AddForeignKey (#11) — mirrors invoices_orderId_fkey (RESTRICT / CASCADE)
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_tenantId_orderId_fkey" FOREIGN KEY ("tenantId", "orderId") REFERENCES "orders"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey (#12) — mirrors payment_attempts_orderId_fkey (RESTRICT / CASCADE)
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_tenantId_orderId_fkey" FOREIGN KEY ("tenantId", "orderId") REFERENCES "orders"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey (#13) — mirrors refunds_paymentAttemptId_fkey (RESTRICT / CASCADE)
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_tenantId_paymentAttemptId_fkey" FOREIGN KEY ("tenantId", "paymentAttemptId") REFERENCES "payment_attempts"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey (#14) — mirrors order_status_history_orderId_fkey (RESTRICT / CASCADE)
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_tenantId_orderId_fkey" FOREIGN KEY ("tenantId", "orderId") REFERENCES "orders"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey (#15) — mirrors coupons_categoryId_fkey (SET NULL / CASCADE); column-specific SET NULL preserves storeId
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_storeId_categoryId_fkey" FOREIGN KEY ("storeId", "categoryId") REFERENCES "categories"("storeId", "id") ON DELETE SET NULL ("categoryId") ON UPDATE CASCADE;

-- AddForeignKey (#16) — mirrors coupon_usages_couponId_fkey (RESTRICT / CASCADE)
ALTER TABLE "coupon_usages" ADD CONSTRAINT "coupon_usages_storeId_couponId_fkey" FOREIGN KEY ("storeId", "couponId") REFERENCES "coupons"("storeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey (#17) — mirrors coupon_usages_orderId_fkey (RESTRICT / CASCADE)
ALTER TABLE "coupon_usages" ADD CONSTRAINT "coupon_usages_tenantId_orderId_fkey" FOREIGN KEY ("tenantId", "orderId") REFERENCES "orders"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey (#18) — mirrors reviews_productId_fkey (RESTRICT / CASCADE)
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_storeId_productId_fkey" FOREIGN KEY ("storeId", "productId") REFERENCES "products"("storeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey (#19) — mirrors reviews_orderItemId_fkey (RESTRICT / CASCADE)
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_storeId_orderItemId_fkey" FOREIGN KEY ("storeId", "orderItemId") REFERENCES "order_items"("storeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── Composite unique indexes (6 total, §4.2) — legacy single-column uniques are NOT dropped (§4.3, W7's job) ───

-- CreateIndex
CREATE UNIQUE INDEX "products_storeId_slug_key" ON "products"("storeId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "categories_storeId_slug_key" ON "categories"("storeId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "coupons_storeId_code_key" ON "coupons"("storeId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "orders_tenantId_orderNumber_key" ON "orders"("tenantId", "orderNumber");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_tenantId_invoiceNumber_key" ON "invoices"("tenantId", "invoiceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "product_variants_storeId_productId_label_key" ON "product_variants"("storeId", "productId", "label");
