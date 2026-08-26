import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AppConfig } from './common/config/configuration';
import { API_PREFIX } from './common/constants/app.constants';

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

  // Exact origin, credentialed — never a wildcard (§23).
  app.enableCors({
    origin: configService.get('frontendUrl', { infer: true }),
    credentials: true,
  });

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
