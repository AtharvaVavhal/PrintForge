import cookieParser from 'cookie-parser';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../../src/app.module';
import { API_PREFIX } from '../../../src/common/constants/app.constants';
import { PrismaService } from '../../../src/common/database/prisma.service';
import { CloudinaryService } from '../../../src/uploads/cloudinary/cloudinary.service';
import { FakeCloudinaryService } from './fake-cloudinary.service';

export interface TestApp {
  app: INestApplication;
  prisma: PrismaService;
}

/**
 * One real Nest app per test file (§27 — "supertest against the real
 * running app + real Postgres, not mocked"), wired the same way main.ts
 * does (rawBody for the webhook route's signature check, ValidationPipe's
 * whitelist/forbidNonWhitelisted so tampered request bodies are actually
 * exercised, same global prefix) — only CloudinaryService is swapped for a
 * network-free stub (see fake-cloudinary.service.ts's doc comment).
 * EmailService is deliberately NOT overridden here: it's spied on
 * per-test with jest.spyOn so each test controls its own call-count
 * assertions and outage simulation (#15).
 *
 * Throttling is disabled via app.module.ts's ThrottlerModule `skipIf:
 * NODE_ENV === 'test'` (env.setup.ts sets that), not a guard override here
 * — `.overrideGuard(ThrottlerGuard)` does NOT intercept a guard registered
 * globally via `{ provide: APP_GUARD, useClass: ThrottlerGuard }`
 * (confirmed empirically: it silently no-ops and the real 20-req/60s IP
 * limit still fires once a test file's request count crosses it, which the
 * #7 admin-RBAC block — 7 tests × 2 registrations each in one file — did).
 */
export async function createTestApp(): Promise<TestApp> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(CloudinaryService)
    .useClass(FakeCloudinaryService)
    .compile();

  const app = moduleRef.createNestApplication({ rawBody: true });
  app.setGlobalPrefix(API_PREFIX);
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  await app.init();

  const prisma = app.get(PrismaService);
  return { app, prisma };
}
