import { Injectable, NotFoundException } from '@nestjs/common';
import { User } from '@prisma/client';
import { PrismaService } from '../common/database/prisma.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UserProfileView } from './dto/user-profile-view.interface';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  // Identity read primitives consumed by AuthService (§17 dependency graph:
  // auth -> users for credential lookup). Writes that must compose
  // transactionally with other tables (refresh_tokens, outbox_events) stay
  // in AuthService against its own injected PrismaService — see §13.A/C/E.

  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  // ─── GET/PATCH /users/me (§20) ─────────────────────────────────────────
  // Ownership is implicit — userId always comes from the validated JWT
  // (@CurrentUser in the controller), never a client-supplied id.

  async getProfile(userId: string): Promise<UserProfileView> {
    const user = await this.getUserOrThrow(userId);
    return this.toProfileView(user);
  }

  /**
   * Every field on the DTO is independently optional; a key simply
   * absent from the request body stays `undefined` after validation,
   * and Prisma's `update` leaves an `undefined` field untouched rather
   * than nulling it — true partial update, not "resend the whole address."
   */
  async updateProfile(
    userId: string,
    dto: UpdateProfileDto,
  ): Promise<UserProfileView> {
    await this.getUserOrThrow(userId);
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        addressLine1: dto.addressLine1,
        addressLine2: dto.addressLine2,
        city: dto.city,
        state: dto.state,
        postalCode: dto.postalCode,
        country: dto.country,
        phone: dto.phone,
      },
    });
    return this.toProfileView(updated);
  }

  private async getUserOrThrow(userId: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  /**
   * Assembled field-by-field — never `{...user}` — so passwordHash,
   * tokenVersion, failedLoginAttempts, passwordResetTokenHash,
   * passwordResetExpiresAt, isActive can never leak into a response just
   * because a future schema/field gets added to User.
   */
  private toProfileView(user: User): UserProfileView {
    return {
      id: user.id,
      email: user.email,
      addressLine1: user.addressLine1,
      addressLine2: user.addressLine2,
      city: user.city,
      state: user.state,
      postalCode: user.postalCode,
      country: user.country,
      phone: user.phone,
      role: user.role,
      createdAt: user.createdAt,
    };
  }
}
