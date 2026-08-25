import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/database/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  // TODO(users): findByEmail, findById, updateProfile — see BLUEPRINT-v1.2.md §15 (users table).
}
