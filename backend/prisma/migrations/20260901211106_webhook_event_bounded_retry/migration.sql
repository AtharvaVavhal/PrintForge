-- AlterEnum
ALTER TYPE "WebhookEventStatus" ADD VALUE 'FAILED';

-- DropIndex
DROP INDEX "webhook_events_status_idx";

-- AlterTable
ALTER TABLE "webhook_events" ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "lastError" TEXT,
ADD COLUMN     "processedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "webhook_events_status_availableAt_idx" ON "webhook_events"("status", "availableAt");
