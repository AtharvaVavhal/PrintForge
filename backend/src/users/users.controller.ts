import { Controller } from '@nestjs/common';
import { UsersService } from './users.service';

/**
 * Owns (§20): GET/PATCH /users/me — profile + the single MVP address fields.
 * No standalone /addresses/* endpoints [RECONCILED, §15].
 *
 * TODO(users): implement the routes above once DTOs are finalized.
 */
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}
}
