import { Module } from '@nestjs/common';
import { JwtModule, JwtModuleOptions, JwtSignOptions } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { NotificationsModule } from '../notifications/notifications.module';
import { UsersModule } from '../users/users.module';
import { AppConfig } from '../common/config/configuration';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';

/**
 * Depends on: users (credential lookup), notifications
 * (PASSWORD_RESET_REQUESTED outbox event). Does not depend on orders,
 * payments, checkout, cart, products, uploads, or admin.
 */
@Module({
  imports: [
    UsersModule,
    NotificationsModule,
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (
        configService: ConfigService<AppConfig, true>,
      ): JwtModuleOptions => ({
        secret: configService.get('auth', { infer: true }).accessTokenSecret,
        signOptions: {
          // JWT_ACCESS_EXPIRES_IN is a duration string (e.g. "15m"). @nestjs/jwt
          // narrows `expiresIn` to `ms`'s template-literal StringValue type,
          // which a plain env-sourced `string` can't satisfy structurally —
          // cast, not a runtime concern (jsonwebtoken parses it permissively).
          expiresIn: configService.get('auth', { infer: true })
            .accessTokenExpiresIn as JwtSignOptions['expiresIn'],
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
