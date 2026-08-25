import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../common/database/prisma.service';
import { UsersService } from '../users/users.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly notificationsService: NotificationsService,
    private readonly jwtService: JwtService,
  ) {}

  // TODO(auth): register/login/refresh(rotation + reuse-detection)/logout/
  // logout-all/password-reset. bcrypt cost 12; tokenVersion bump on
  // password change/logout-all; progressive per-account login delay driven
  // by failedLoginAttempts (no hard lockout — §23).
}
