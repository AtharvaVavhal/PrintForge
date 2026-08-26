import { Body, Controller, Get, Patch } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { UsersService } from './users.service';
import { UpdateProfileDto } from './dto/update-profile.dto';

/**
 * Owns (§20): GET/PATCH /users/me — profile + the single MVP address
 * fields. No standalone /addresses/* endpoints [RECONCILED, §15].
 *
 * Ownership is implicit — no `:id` param anywhere on this controller;
 * both routes act on `@CurrentUser()`'s id from the validated JWT, never
 * a client-supplied user id in any form.
 */
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  async me(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.getProfile(user.id);
  }

  @Patch('me')
  async updateMe(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.usersService.updateProfile(user.id, dto);
  }
}
