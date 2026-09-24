import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import * as Sentry from '@sentry/node';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AppConfig } from './common/config/configuration';
import { API_PREFIX } from './common/constants/app.constants';
import { buildCorsOptions } from './common/tenant/store-domain-resolution/cors/cors-options';
import { StorefrontCorsPolicy } from './common/tenant/store-domain-resolution/cors/storefront-cors.policy';

// §30 "Sentry (both apps)" — initialized before Nest bootstraps (so it's
// live for any error during module init too), guarded by SENTRY_DSN: a
// no-op when unset, so local dev and the e2e suite (.env.test never sets
// this) are unaffected. Error tracking only — no tracesSampleRate, so no
// performance/tracing data is collected. Read from process.env directly
// (not ConfigService) because the Nest DI container doesn't exist yet at
// this point in bootstrap.
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV ?? 'development',
  });
}

async function bootstrap(): Promise<void> {
  // rawBody: true — POST /payments/webhook needs the exact undecoded bytes
  // Razorpay signed (§12.3 "capture raw body before body-parsing
  // middleware"); this Nest/Express option exposes it as req.rawBody
  // without disabling normal JSON parsing for every other route.
  const app = await NestFactory.create(AppModule, { rawBody: true });
  const configService = app.get(ConfigService<AppConfig, true>);

  app.setGlobalPrefix(API_PREFIX);

  app.use(helmet());
  app.use(cookieParser());

  // Phase 9 W7 (spec §9, ⚖️ S-9) — an origin PREDICATE in place of the single
  // static `frontendUrl` string. Still credentialed, still never a wildcard:
  // the `cors` package echoes the request's own origin only when the
  // predicate returns true, and adds `Vary: Origin` for us.
  //
  // In `legacy_single_store` mode the predicate admits only the `FRONTEND_URL`
  // origin, which is byte-for-byte the previous behaviour — the dynamic
  // storefront allow-list activates only once the resolver is flipped to
  // `host_resolution` (mode coupling; see the policy's own doc comment).
  //
  // The options live in `buildCorsOptions` so the e2e harness can install the
  // identical wiring rather than a look-alike (see that function's comment).
  app.enableCors(buildCorsOptions(app.get(StorefrontCorsPolicy)));

  // whitelist + forbidNonWhitelisted: unexpected/extra fields are rejected,
  // never silently dropped or trusted (§23).
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = configService.get('port', { infer: true });
  await app.listen(port);
}

void bootstrap();
