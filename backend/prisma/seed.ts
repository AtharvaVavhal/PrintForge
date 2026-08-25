import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Idempotent seed script (§16): admin user, 2–3 categories, 6–10 products
 * with variants/customization fields incl. surcharge config, app_settings
 * shipping fee.
 *
 * TODO(prisma): implement seed data. Left as a stub for this scaffolding
 * pass — populating realistic product/category/pricing data is business
 * content, not architecture, and belongs to a later task.
 */
async function main(): Promise<void> {
  // TODO(prisma): implement.
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
