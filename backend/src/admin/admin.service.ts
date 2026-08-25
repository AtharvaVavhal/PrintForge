import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/database/prisma.service';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  // TODO(admin): dashboard aggregation (order count/revenue/recent orders —
  // minimal, no charts, §19), customer list (read-only).
}
