-- AlterTable: add shippingFee as nullable first — orders already has rows,
-- and a required column can't be added in one step without a default.
ALTER TABLE "orders" ADD COLUMN     "shippingFee" DECIMAL(10,2);

-- Backfill: shippingFee = total - subtotal. Safe for every existing row —
-- discountAmount does not exist yet, so every order to date was priced as
-- total = subtotal + shippingFee, meaning this exactly reproduces the value
-- checkout.service.ts's toOrderView() has always derived on read. No
-- historical order's effective shipping fee changes, only where it's stored
-- (docs/architecture/PHASE-10-PROPOSAL.md §2.5).
UPDATE "orders" SET "shippingFee" = "total" - "subtotal";

-- AlterTable: now that every row has a value, enforce NOT NULL to match
-- subtotal/total's own column style.
ALTER TABLE "orders" ALTER COLUMN "shippingFee" SET NOT NULL;
