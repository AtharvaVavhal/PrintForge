import cookieParser from 'cookie-parser';
import {
  DynamicModule,
  ForwardReference,
  INestApplication,
  Type,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../../src/app.module';
import { API_PREFIX } from '../../../src/common/constants/app.constants';
import { PrismaService } from '../../../src/common/database/prisma.service';
import { CloudinaryService } from '../../../src/uploads/cloudinary/cloudinary.service';
import { FakeCloudinaryService } from './fake-cloudinary.service';
import { BILLING_PROVIDER } from '../../../src/subscriptions/billing-provider.token';
import { FakeBillingProvider } from '../../../src/subscriptions/fake-billing-provider';
import { DOMAIN_DNS_RESOLVER } from '../../../src/store-domains/dns/domain-dns-resolver';
import { DOMAIN_HOSTING_PROVIDER } from '../../../src/common/tenant/store-domain-resolution/hosting/domain-hosting-provider';
import { FakeDomainHostingProvider } from '../../../src/common/tenant/store-domain-resolution/hosting/fake-domain-hosting.provider';
import { FakeDnsResolver } from './fake-dns-resolver';

export interface TestApp {
  app: INestApplication;
  prisma: PrismaService;
}

/**
 * One real Nest app per test file (§27 — "supertest against the real
 * running app + real Postgres, not mocked"), wired the same way main.ts
 * does (rawBody for the webhook route's signature check, ValidationPipe's
 * whitelist/forbidNonWhitelisted so tampered request bodies are actually
 * exercised, same global prefix) — CloudinaryService and (as of
 * `RazorpayBillingProvider`, docs/saas/DECISIONS.md P7-D4/P7-D5) the
 * `BILLING_PROVIDER` DI token are each swapped for a network-free stub.
 * EmailService is deliberately NOT overridden here: it's spied on
 * per-test with jest.spyOn so each test controls its own call-count
 * assertions and outage simulation (#15).
 *
 * `BILLING_PROVIDER` -> `FakeBillingProvider`: production `subscription
 * .module.ts` now binds this token to `RazorpayBillingProvider` (a real
 * network client requiring real Razorpay SaaS credentials) — every
 * existing subscription/billing-webhook e2e suite was written against,
 * and extensively uses, `FakeBillingProvider`'s own test-control surface
 * (`advancePeriod`, `buildWebhookEventBody`, `isCancellationScheduled`,
 * `emitDuplicateEvent`, etc.), which no real adapter can or should
 * provide. Overriding here — the exact same mechanism already
 * established for `CloudinaryService` immediately above — means every
 * such suite keeps running exactly as before, with zero real Razorpay
 * network calls and zero test-file changes, regardless of which
 * `BillingProvider` production actually binds.
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
    .overrideProvider(BILLING_PROVIDER)
    .useClass(FakeBillingProvider)
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

/**
 * Phase 6 W4 — identical to `createTestApp()` above (same overrides, same
 * pipes/prefix/cookie setup) but additionally compiles one or more
 * test-only modules alongside the real `AppModule`. Every `APP_GUARD`/
 * `APP_FILTER`/`APP_INTERCEPTOR` Nest global enhancer `AppModule` registers
 * (`ThrottlerGuard` through `EntitlementGuard` to `PlatformGuard`,
 * `HttpExceptionFilter`, `ResponseInterceptor`) applies application-wide
 * regardless of which module a controller is declared in — this is how a
 * test-only controller (e.g. `EntitlementTestController`) can exercise the
 * REAL, globally-registered guard chain end-to-end without mocking any
 * guard, while never being wired into the real shipped `app.module.ts`.
 * `createTestApp()` itself is untouched — every other e2e file's behavior
 * is unaffected by this addition.
 */
export async function createTestAppWithExtraModules(
  extraModules: Array<Type<unknown> | DynamicModule | ForwardReference>,
): Promise<TestApp> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule, ...extraModules],
  })
    .overrideProvider(CloudinaryService)
    .useClass(FakeCloudinaryService)
    .overrideProvider(BILLING_PROVIDER)
    .useClass(FakeBillingProvider)
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

/**
 * Phase 9 W5/W6 — identical to `createTestApp()` (same overrides, pipes,
 * prefix and cookie setup) but additionally swaps the two Phase 9 external
 * seams for shared, test-controlled instances, both returned alongside the
 * app:
 *
 *   `DOMAIN_DNS_RESOLVER`    → `FakeDnsResolver`           (spec §6.3, §14.2)
 *   `DOMAIN_HOSTING_PROVIDER`→ `FakeDomainHostingProvider` (spec §7.1)
 *
 * Both are returned rather than merely bound, because W5/W6's central
 * assertions are about what the production code ACTUALLY did to them — that a
 * platform-revoked row triggers zero DNS lookups (P9-S7), and that a domain
 * only becomes serveable once the hosting provider really reports an issued
 * certificate (§7.2). An instance whose calls are recorded is the only way to
 * observe that.
 *
 * A separate entry point rather than a parameter on `createTestApp()` for the
 * same reason `createTestAppWithExtraModules` is separate: every existing e2e
 * file keeps its exact current wiring, unmodified. Production binds
 * `NodeDnsResolver` and `UnprovisionedDomainHostingProvider` — no test-only
 * provider is ever wired into the shipped app.
 */
export async function createTestAppWithDomainFakes(): Promise<
  TestApp & { dns: FakeDnsResolver; hosting: FakeDomainHostingProvider }
> {
  const dns = new FakeDnsResolver();
  const hosting = new FakeDomainHostingProvider();
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(CloudinaryService)
    .useClass(FakeCloudinaryService)
    .overrideProvider(BILLING_PROVIDER)
    .useClass(FakeBillingProvider)
    .overrideProvider(DOMAIN_DNS_RESOLVER)
    .useValue(dns)
    .overrideProvider(DOMAIN_HOSTING_PROVIDER)
    .useValue(hosting)
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
  return { app, prisma, dns, hosting };
}
