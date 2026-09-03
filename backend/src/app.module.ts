import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
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
import { AppSettingModule } from './app-setting/app-setting.module';
import { InvoicesModule } from './invoices/invoices.module';
import { AuthModule } from './auth/auth.module';
import { CartModule } from './cart/cart.module';
import { CheckoutModule } from './checkout/checkout.module';
import { CouponsModule } from './coupons/coupons.module';
import { NotificationsModule } from './notifications/notifications.module';
import { OrdersModule } from './orders/orders.module';
import { PaymentsModule } from './payments/payments.module';
import { PostalModule } from './postal/postal.module';
import { ProductsModule } from './products/products.module';
import { ReviewsModule } from './reviews/reviews.module';
import { UploadsModule } from './uploads/uploads.module';
import { UsersModule } from './users/users.module';

/**
 * Root module. Wiring order below follows the corrected, acyclic module
 * dependency graph reported alongside this scaffold, extended for Phase 10's
 * Reviews half (PHASE-10-PROPOSAL.md §1.3 — a new top-level module sitting
 * after `orders`, not nested under `products/`; see reviews.module.ts's own
 * doc comment for why) and Coupons half (§2.3 — coupons is base-layer,
 * same tier as users/notifications/uploads, no cross-module import at
 * all; see coupons.module.ts's own doc comment for why):
 *   users, notifications, uploads, coupons, app-setting  (base layer)
 *   -> products -> cart
 *   -> orders -> payments -> checkout (-> coupons)
 *   -> reviews (-> orders)
 *   -> admin (-> orders, products, users, reviews, coupons), auth
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
    // skipIf disables throttling only under NODE_ENV=test (test/e2e/support/
    // env.setup.ts sets this from .env.test) — every e2e request originates
    // from the same loopback address, so without this the shared 20-req/60s
    // IP limit trips well before it's the thing actually under test (§27).
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: 20 }],
      skipIf: () => process.env.NODE_ENV === 'test',
    }),
    // Registered exactly once, app-wide. The ScheduleExplorer it installs
    // discovers every @Cron/@Interval provider across all feature modules
    // (payments reconciliation, notifications outbox, webhook retry) — a
    // second forRoot() in a feature module registers the explorer twice and
    // runs every job twice (see the double "ScheduleModule initialized" /
    // reconciliation-ran-twice symptom).
    ScheduleModule.forRoot(),
    PrismaModule,
    HealthModule,
    UsersModule,
    NotificationsModule,
    UploadsModule,
    CouponsModule,
    AppSettingModule,
    InvoicesModule,
    ProductsModule,
    CartModule,
    OrdersModule,
    PaymentsModule,
    CheckoutModule,
    PostalModule,
    ReviewsModule,
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
