import { Controller } from '@nestjs/common';
import { AuthService } from './auth.service';

/**
 * Owns (§20): POST /auth/register, POST /auth/login (no 423
 * ACCOUNT_LOCKED — progressive delay only, §23), POST /auth/refresh
 * (refresh cookie, rotation), POST /auth/logout, POST /auth/logout-all,
 * POST /auth/password-reset/request, POST /auth/password-reset/confirm.
 * All Public except refresh (refresh-cookie auth) and logout* (access-token
 * auth).
 *
 * TODO(auth): implement.
 */
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}
}
