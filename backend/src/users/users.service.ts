import { Injectable } from '@nestjs/common';
import { User } from '@prisma/client';
import { PrismaService } from '../common/database/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  // Identity read primitives consumed by AuthService (§17 dependency graph:
  // auth -> users for credential lookup). Writes that must compose
  // transactionally with other tables (refresh_tokens, outbox_events) stay
  // in AuthService against its own injected PrismaService — see §13.A/C/E.
  // Profile read/update (GET/PATCH /users/me, §20) is a separate,
  // not-yet-built phase.

  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  // TODO(users): updateProfile — see BLUEPRINT-v1.2.md §15 (users table).
}
