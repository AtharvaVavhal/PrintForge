-- CreateEnum
CREATE TYPE "PlatformRole" AS ENUM ('SUPER_ADMIN');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "platformRole" "PlatformRole";

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "tokenVersion" INTEGER NOT NULL DEFAULT 0,
    "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
    "passwordResetTokenHash" TEXT,
    "passwordResetExpiresAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "city" TEXT,
    "state" TEXT,
    "postalCode" TEXT,
    "country" TEXT,
    "phone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "customers_storeId_idx" ON "customers"("storeId");

-- CreateIndex
CREATE INDEX "customers_tenantId_idx" ON "customers"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "customers_storeId_email_key" ON "customers"("storeId", "email");

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
