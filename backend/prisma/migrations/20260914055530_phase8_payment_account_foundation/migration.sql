-- Phase 8 — Merchant Payment Account foundation (P8-D3/P8-D6, P8-3 architecture spec).
--
-- HAND-EDITED after `prisma migrate dev` generation: the raw generated
-- migration also proposed DROP CONSTRAINT/DROP INDEX statements against
-- unrelated W6-era composite ownership FKs (categories, products,
-- product_variants, customization_fields, cart_items, coupons,
-- coupon_usages, order_items, invoices, payment_attempts, refunds,
-- order_status_history, reviews, store_settings). Those are PRE-EXISTING
-- drift between `schema.prisma`'s declarative model and hand-added W6
-- migration SQL (composite FKs Prisma's DSL was deliberately left not
-- modeling — see `schema.prisma`'s own `model Category` comment: "scalars,
-- no @relation yet — composite FKs are W6, NOT NULL is W7") — NOT a Phase 8
-- change, and NEVER intended by this migration. Removed entirely, exactly
-- the same "Prisma will not regenerate/remove a manually-added SQL
-- statement... as long as it isn't reintroduced by a schema change to this
-- model" discipline `PaymentAttempt`'s own partial-unique-index comment
-- already documents for this repo. This migration contains ONLY additive
-- Phase 8 statements.

-- CreateEnum
CREATE TYPE "PaymentProviderType" AS ENUM ('RAZORPAY');

-- CreateEnum
CREATE TYPE "PaymentAccountStatus" AS ENUM ('PENDING', 'ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "PaymentAccountMode" AS ENUM ('TEST', 'LIVE');

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "paymentAccountId" TEXT;

-- AlterTable
ALTER TABLE "payment_attempts" ADD COLUMN     "paymentAccountId" TEXT;

-- AlterTable
ALTER TABLE "refunds" ADD COLUMN     "paymentAccountId" TEXT;

-- AlterTable
ALTER TABLE "webhook_events" ADD COLUMN     "paymentAccountId" TEXT;

-- CreateTable
CREATE TABLE "payment_accounts" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "provider" "PaymentProviderType" NOT NULL,
    "status" "PaymentAccountStatus" NOT NULL DEFAULT 'PENDING',
    "mode" "PaymentAccountMode" NOT NULL,
    "displayName" TEXT,
    "credentialsEncrypted" BYTEA,
    "credentialsUpdatedAt" TIMESTAMP(3),
    "connectedAt" TIMESTAMP(3),
    "disabledAt" TIMESTAMP(3),
    "disabledReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payment_accounts_tenantId_idx" ON "payment_accounts"("tenantId");

-- CreateIndex
CREATE INDEX "payment_accounts_status_idx" ON "payment_accounts"("status");

-- CreateIndex
CREATE UNIQUE INDEX "payment_accounts_storeId_provider_key" ON "payment_accounts"("storeId", "provider");

-- CreateIndex
CREATE INDEX "orders_paymentAccountId_idx" ON "orders"("paymentAccountId");

-- CreateIndex
CREATE INDEX "payment_attempts_paymentAccountId_idx" ON "payment_attempts"("paymentAccountId");

-- CreateIndex
CREATE INDEX "refunds_paymentAccountId_idx" ON "refunds"("paymentAccountId");

-- CreateIndex
CREATE INDEX "webhook_events_paymentAccountId_idx" ON "webhook_events"("paymentAccountId");

-- AddForeignKey
ALTER TABLE "payment_accounts" ADD CONSTRAINT "payment_accounts_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_accounts" ADD CONSTRAINT "payment_accounts_tenantId_storeId_fkey" FOREIGN KEY ("tenantId", "storeId") REFERENCES "stores"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
