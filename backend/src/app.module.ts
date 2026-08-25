import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import configuration from './common/config/configuration';
import { validateEnv } from './common/config/env.validation';
import { PrismaModule } from './common/database/prisma.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { HealthModule } from './common/health/health.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';

import { AdminModule } from './admin/admin.module';
import { AuthModule } from './auth/auth.module';
import { CartModule } from './cart/cart.module';
import { CheckoutModule } from './checkout/checkout.module';
import { NotificationsModule } from './notifications/notifications.module';
import { OrdersModule } from './orders/orders.module';
import { PaymentsModule } from './payments/payments.module';
import { ProductsModule } from './products/products.module';
import { UploadsModule } from './uploads/uploads.module';
import { UsersModule } from './users/users.module';

/**
 * Root module. Wiring order below follows the corrected, acyclic module
 * dependency graph reported alongside this scaffold:
 *   users, notifications, uploads  (base layer)
 *   -> products -> cart
 *   -> orders -> payments -> checkout
 *   -> admin, auth
 *
 * JwtAuthGuard + RolesGuard + ThrottlerGuard are global (§17/§23): every
 * route is protected and IP-throttled by default; routes opt out
 * individually with @Public().
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate: validateEnv,
    }),
    // TODO(common): move ttl/limit to AppConfig if per-environment tuning is
    // needed later; a static config is sufficient for scaffolding.
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: 20 }],
    }),
    PrismaModule,
    HealthModule,
    UsersModule,
    NotificationsModule,
    UploadsModule,
    ProductsModule,
    CartModule,
    OrdersModule,
    PaymentsModule,
    CheckoutModule,
    AdminModule,
    AuthModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
})
export class AppModule {}
