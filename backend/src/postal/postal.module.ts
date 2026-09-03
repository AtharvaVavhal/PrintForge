import { Module } from '@nestjs/common';
import { PostalController } from './postal.controller';
import { PostalLookupService } from './postal.service';

/**
 * Standalone leaf module (same shape as HealthModule) — nothing else in
 * the app depends on postal lookup server-side; checkout never calls it,
 * only the frontend shipping form does. No Prisma, no cross-module imports.
 */
@Module({
  controllers: [PostalController],
  providers: [PostalLookupService],
})
export class PostalModule {}
