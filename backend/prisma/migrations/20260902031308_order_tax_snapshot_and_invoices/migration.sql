-- AlterTable: Phase 13.4 order tax snapshot.
-- New columns are all DEFAULT/nullable so no existing row is invalidated
-- and no table rewrite is needed (constant defaults, Postgres 11+).
ALTER TABLE "orders" ADD COLUMN     "taxAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "taxBreakdown" JSONB,
ADD COLUMN     "taxMode" TEXT NOT NULL DEFAULT 'INCLUSIVE',
ADD COLUMN     "taxRateSnapshot" DECIMAL(5,4),
ADD COLUMN     "taxableAmount" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- Backfill existing orders: with no tax rate ever configured, every past
-- order's taxAmount is 0 and its taxable base is the tax-inclusive goods
-- value (subtotal − discountAmount). This keeps the invariant
-- `total = taxableAmount + taxAmount + shippingFee` true for historical
-- rows without changing any customer-facing total. taxRateSnapshot stays
-- NULL (no rate was applied); taxMode stays 'INCLUSIVE'.
UPDATE "orders"
SET "taxableAmount" = "subtotal" - "discountAmount"
WHERE "taxableAmount" = 0;

-- CreateTable
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "currency" TEXT NOT NULL,
    "subtotal" DECIMAL(10,2) NOT NULL,
    "discountAmount" DECIMAL(10,2) NOT NULL,
    "shippingFee" DECIMAL(10,2) NOT NULL,
    "taxableAmount" DECIMAL(10,2) NOT NULL,
    "taxAmount" DECIMAL(10,2) NOT NULL,
    "grandTotal" DECIMAL(10,2) NOT NULL,
    "taxMode" TEXT NOT NULL,
    "taxRateSnapshot" DECIMAL(5,4),
    "taxBreakdown" JSONB,
    "sellerSnapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "invoices_invoiceNumber_key" ON "invoices"("invoiceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_orderId_key" ON "invoices"("orderId");

-- CreateIndex
CREATE INDEX "invoices_issuedAt_idx" ON "invoices"("issuedAt");

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
