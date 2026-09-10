-- Phase 4 (W7) — Contract: tenantId NOT NULL + drop superseded legacy
-- uniques. Decision P4-D2 (docs/saas/DECISIONS.md; backend/src/
-- migration-safety.spec.ts, commit f67e6d1) authorizes exactly the 20
-- CHECK-NOT-VALID -> VALIDATE -> SET-NOT-NULL sequences below (tenantId
-- only; outbox_events.tenantId, storeId, and customerId are explicitly
-- out of scope) plus the 5 legacy DROP statements at the end.
--
-- Preceded by a REQUIRED preflight (prisma/backfill/w7-preflight.ts) that
-- must PASS (zero tenantId nulls across all 20 tables; all 5 legacy
-- unique indexes present; all 5 W6 composite uniques present) before this
-- migration is ever applied to a real database.
--
-- ─── ROOT-CAUSE CORRECTION vs. the original P4-D2 docket wording ─────────
-- The docket (PHASE-4-DECISION-DOCKET.md §4) and the already-implemented
-- guard's DROP-CONSTRAINT exemption both assumed the 5 legacy uniques are
-- named table CONSTRAINTs. Verified directly against a real database
-- (pg_constraint / pg_indexes, not assumed): all 5 are plain Postgres
-- UNIQUE INDEXES — Prisma's `@unique` scalar attribute compiles to
-- `CREATE UNIQUE INDEX`, never a named table constraint, and the original
-- 20260825190725_init / 20260827204110_add_coupons / 20260902031308_
-- order_tax_snapshot_and_invoices migrations confirm this (`CREATE UNIQUE
-- INDEX "categories_slug_key" ON "categories"("slug")`, etc.). `ALTER
-- TABLE ... DROP CONSTRAINT "categories_slug_key"` therefore fails against
-- the real schema ("constraint ... does not exist"); the correct,
-- semantically-equivalent statement is `DROP INDEX "<name>"`. This is a
-- genuine defect in the original decision text and in the already-
-- committed guard's DROP-CONSTRAINT-shaped exemption (f67e6d1), not a
-- scope change — the INTENT (remove these 5 exact legacy uniques, only
-- these 5, nothing else) is unchanged. Flagged prominently; the guard
-- itself is NOT modified by this migration file (out of today's scope) —
-- see the accompanying report for the required follow-up.
--
-- Nothing here is destructive beyond exactly what P4-D2 authorizes: no
-- other column, table, or constraint is touched. storeId/customerId are
-- untouched; outbox_events.tenantId stays nullable; the 5 W6 composite
-- uniques (products_storeId_slug_key, categories_storeId_slug_key,
-- coupons_storeId_code_key, orders_tenantId_orderNumber_key,
-- invoices_tenantId_invoiceNumber_key) are untouched.

-- ─── 20 x (CHECK NOT VALID -> VALIDATE CONSTRAINT -> SET NOT NULL) ────────

ALTER TABLE "categories" ADD CONSTRAINT "categories_tenantId_not_null_check" CHECK ("tenantId" IS NOT NULL) NOT VALID;
ALTER TABLE "categories" VALIDATE CONSTRAINT "categories_tenantId_not_null_check";
ALTER TABLE "categories" ALTER COLUMN "tenantId" SET NOT NULL;

ALTER TABLE "products" ADD CONSTRAINT "products_tenantId_not_null_check" CHECK ("tenantId" IS NOT NULL) NOT VALID;
ALTER TABLE "products" VALIDATE CONSTRAINT "products_tenantId_not_null_check";
ALTER TABLE "products" ALTER COLUMN "tenantId" SET NOT NULL;

ALTER TABLE "product_images" ADD CONSTRAINT "product_images_tenantId_not_null_check" CHECK ("tenantId" IS NOT NULL) NOT VALID;
ALTER TABLE "product_images" VALIDATE CONSTRAINT "product_images_tenantId_not_null_check";
ALTER TABLE "product_images" ALTER COLUMN "tenantId" SET NOT NULL;

ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_tenantId_not_null_check" CHECK ("tenantId" IS NOT NULL) NOT VALID;
ALTER TABLE "product_variants" VALIDATE CONSTRAINT "product_variants_tenantId_not_null_check";
ALTER TABLE "product_variants" ALTER COLUMN "tenantId" SET NOT NULL;

ALTER TABLE "customization_fields" ADD CONSTRAINT "customization_fields_tenantId_not_null_check" CHECK ("tenantId" IS NOT NULL) NOT VALID;
ALTER TABLE "customization_fields" VALIDATE CONSTRAINT "customization_fields_tenantId_not_null_check";
ALTER TABLE "customization_fields" ALTER COLUMN "tenantId" SET NOT NULL;

ALTER TABLE "uploaded_files" ADD CONSTRAINT "uploaded_files_tenantId_not_null_check" CHECK ("tenantId" IS NOT NULL) NOT VALID;
ALTER TABLE "uploaded_files" VALIDATE CONSTRAINT "uploaded_files_tenantId_not_null_check";
ALTER TABLE "uploaded_files" ALTER COLUMN "tenantId" SET NOT NULL;

ALTER TABLE "carts" ADD CONSTRAINT "carts_tenantId_not_null_check" CHECK ("tenantId" IS NOT NULL) NOT VALID;
ALTER TABLE "carts" VALIDATE CONSTRAINT "carts_tenantId_not_null_check";
ALTER TABLE "carts" ALTER COLUMN "tenantId" SET NOT NULL;

ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_tenantId_not_null_check" CHECK ("tenantId" IS NOT NULL) NOT VALID;
ALTER TABLE "cart_items" VALIDATE CONSTRAINT "cart_items_tenantId_not_null_check";
ALTER TABLE "cart_items" ALTER COLUMN "tenantId" SET NOT NULL;

ALTER TABLE "cart_item_customizations" ADD CONSTRAINT "cart_item_customizations_tenantId_not_null_check" CHECK ("tenantId" IS NOT NULL) NOT VALID;
ALTER TABLE "cart_item_customizations" VALIDATE CONSTRAINT "cart_item_customizations_tenantId_not_null_check";
ALTER TABLE "cart_item_customizations" ALTER COLUMN "tenantId" SET NOT NULL;

ALTER TABLE "orders" ADD CONSTRAINT "orders_tenantId_not_null_check" CHECK ("tenantId" IS NOT NULL) NOT VALID;
ALTER TABLE "orders" VALIDATE CONSTRAINT "orders_tenantId_not_null_check";
ALTER TABLE "orders" ALTER COLUMN "tenantId" SET NOT NULL;

ALTER TABLE "invoices" ADD CONSTRAINT "invoices_tenantId_not_null_check" CHECK ("tenantId" IS NOT NULL) NOT VALID;
ALTER TABLE "invoices" VALIDATE CONSTRAINT "invoices_tenantId_not_null_check";
ALTER TABLE "invoices" ALTER COLUMN "tenantId" SET NOT NULL;

ALTER TABLE "order_items" ADD CONSTRAINT "order_items_tenantId_not_null_check" CHECK ("tenantId" IS NOT NULL) NOT VALID;
ALTER TABLE "order_items" VALIDATE CONSTRAINT "order_items_tenantId_not_null_check";
ALTER TABLE "order_items" ALTER COLUMN "tenantId" SET NOT NULL;

ALTER TABLE "order_item_customizations" ADD CONSTRAINT "order_item_customizations_tenantId_not_null_check" CHECK ("tenantId" IS NOT NULL) NOT VALID;
ALTER TABLE "order_item_customizations" VALIDATE CONSTRAINT "order_item_customizations_tenantId_not_null_check";
ALTER TABLE "order_item_customizations" ALTER COLUMN "tenantId" SET NOT NULL;

ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_tenantId_not_null_check" CHECK ("tenantId" IS NOT NULL) NOT VALID;
ALTER TABLE "payment_attempts" VALIDATE CONSTRAINT "payment_attempts_tenantId_not_null_check";
ALTER TABLE "payment_attempts" ALTER COLUMN "tenantId" SET NOT NULL;

ALTER TABLE "refunds" ADD CONSTRAINT "refunds_tenantId_not_null_check" CHECK ("tenantId" IS NOT NULL) NOT VALID;
ALTER TABLE "refunds" VALIDATE CONSTRAINT "refunds_tenantId_not_null_check";
ALTER TABLE "refunds" ALTER COLUMN "tenantId" SET NOT NULL;

ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_tenantId_not_null_check" CHECK ("tenantId" IS NOT NULL) NOT VALID;
ALTER TABLE "order_status_history" VALIDATE CONSTRAINT "order_status_history_tenantId_not_null_check";
ALTER TABLE "order_status_history" ALTER COLUMN "tenantId" SET NOT NULL;

ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_tenantId_not_null_check" CHECK ("tenantId" IS NOT NULL) NOT VALID;
ALTER TABLE "idempotency_keys" VALIDATE CONSTRAINT "idempotency_keys_tenantId_not_null_check";
ALTER TABLE "idempotency_keys" ALTER COLUMN "tenantId" SET NOT NULL;

ALTER TABLE "reviews" ADD CONSTRAINT "reviews_tenantId_not_null_check" CHECK ("tenantId" IS NOT NULL) NOT VALID;
ALTER TABLE "reviews" VALIDATE CONSTRAINT "reviews_tenantId_not_null_check";
ALTER TABLE "reviews" ALTER COLUMN "tenantId" SET NOT NULL;

ALTER TABLE "coupons" ADD CONSTRAINT "coupons_tenantId_not_null_check" CHECK ("tenantId" IS NOT NULL) NOT VALID;
ALTER TABLE "coupons" VALIDATE CONSTRAINT "coupons_tenantId_not_null_check";
ALTER TABLE "coupons" ALTER COLUMN "tenantId" SET NOT NULL;

ALTER TABLE "coupon_usages" ADD CONSTRAINT "coupon_usages_tenantId_not_null_check" CHECK ("tenantId" IS NOT NULL) NOT VALID;
ALTER TABLE "coupon_usages" VALIDATE CONSTRAINT "coupon_usages_tenantId_not_null_check";
ALTER TABLE "coupon_usages" ALTER COLUMN "tenantId" SET NOT NULL;

-- ─── 5 x legacy unique DROP (superseded by W6's composite uniques) ────────
-- See the root-cause note above: these 5 are plain UNIQUE INDEXES, not
-- named CONSTRAINTs (verified: zero rows in pg_constraint for any of
-- these 5 names; all 5 present in pg_indexes instead) — DROP INDEX is the
-- correct statement, not ALTER TABLE ... DROP CONSTRAINT.

DROP INDEX "categories_slug_key";
DROP INDEX "products_slug_key";
DROP INDEX "coupons_code_key";
DROP INDEX "orders_orderNumber_key";
DROP INDEX "invoices_invoiceNumber_key";
