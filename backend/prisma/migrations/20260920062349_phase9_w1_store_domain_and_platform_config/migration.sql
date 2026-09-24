-- Phase 9 — Wave 1: schema foundation (decisions P9-D2 OPTION B, P9-D8;
-- spec docs/saas/PHASE-9-START-GATE-AND-IMPLEMENTATION-SPEC.md §3; G-21).
--
-- HAND-AUTHORED (not the raw `prisma migrate dev` output), following the
-- Phase 8 migration's own discipline: the generator would also emit DROP
-- CONSTRAINT/DROP INDEX statements against unrelated W6-era composite
-- ownership FKs that `schema.prisma`'s DSL deliberately does not model —
-- pre-existing drift, never part of this change. This file contains ONLY
-- the approved Phase 9 W1 statements, every one inside the additive-only
-- guard's existing allowances (`backend/src/migration-safety.spec.ts`):
--   3 x CREATE TYPE                                  (spec §3.1)
--   4 x single-action nullable ADD COLUMN, no DEFAULT (spec §3.2, G-19 shape)
--   1 x CREATE TABLE + its own unique index + FK      (spec §3.3, §3.4)
--
-- NOT here, by decision: no ALTER TYPE of any kind — the G-5-ratified
-- `DomainVerificationStatus` = {PENDING, VERIFIED, FAILED} is untouched and
-- `VERIFYING` is NOT added (P9-D2); no verification-reason column (S-6);
-- no revoke-marker column (S-7); no RLS on platform_config (platform-owned,
-- spec §3.3); no data backfill (W2/W8, spec §16).

-- CreateEnum
CREATE TYPE "StoreDomainType" AS ENUM ('PLATFORM_SUBDOMAIN', 'CUSTOM');

-- CreateEnum
CREATE TYPE "DomainVerificationMethod" AS ENUM ('DNS_TXT', 'CNAME');

-- CreateEnum
CREATE TYPE "TlsStatus" AS ENUM ('PENDING', 'ISSUED', 'ERROR');

-- AlterTable
ALTER TABLE "store_domains" ADD COLUMN     "type" "StoreDomainType";

-- AlterTable
ALTER TABLE "store_domains" ADD COLUMN     "verificationMethod" "DomainVerificationMethod";

-- AlterTable
ALTER TABLE "store_domains" ADD COLUMN     "lastCheckedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "store_domains" ADD COLUMN     "tlsStatus" "TlsStatus";

-- CreateTable
CREATE TABLE "platform_config" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_config_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "platform_config_key_key" ON "platform_config"("key");

-- AddForeignKey
ALTER TABLE "platform_config" ADD CONSTRAINT "platform_config_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
