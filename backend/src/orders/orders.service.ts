import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/database/prisma.service';

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  // TODO(orders): all Order.status transitions go through the state-machine
  // helper (orders/state-machine/) via compare-and-swap UPDATE ... WHERE
  // status IN (allowed_from) — never a plain UPDATE. See §14, §24 invariant 3.
}
