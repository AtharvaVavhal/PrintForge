-- AlterTable
ALTER TABLE "product_images" ADD COLUMN     "deliveryType" TEXT NOT NULL DEFAULT 'upload',
ADD COLUMN     "resourceType" TEXT NOT NULL DEFAULT 'image';
