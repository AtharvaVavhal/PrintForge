import { randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/database/prisma.service';

const ORDER_NUMBER_COUNTER_KEY = 'order_number_counter';

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * §37 TODO ("Order-number generation mechanism — Postgres sequence or a
   * locked counter row in app_settings; either is acceptable, pick one
   * during Phase 1" — never picked): implemented as the app_settings
   * option, via an atomic INSERT...ON CONFLICT DO UPDATE...RETURNING
   * against a counter row — race-safe under concurrent checkouts without a
   * separate lock statement, no migration needed since app_settings
   * already exists (§15).
   *
   * Must be called with the caller's own transaction client so the
   * increment commits/rolls back atomically with the Order it numbers —
   * checkout owns order creation (§17); this is the one thing orders
   * exposes for it to consume (the checkout→orders dependency arrow, §17).
   */
  async generateOrderNumber(tx: Prisma.TransactionClient): Promise<string> {
    const rows = await tx.$queryRaw<{ value: string }[]>`
      INSERT INTO app_settings (id, key, value, "updatedAt")
      VALUES (${randomUUID()}, ${ORDER_NUMBER_COUNTER_KEY}, '1', now())
      ON CONFLICT (key) DO UPDATE
        SET value = (app_settings.value::integer + 1)::text, "updatedAt" = now()
      RETURNING value
    `;
    const counter = rows[0].value;
    return `PF-${counter.padStart(6, '0')}`;
  }

  // TODO(orders): all Order.status transitions go through the state-machine
  // helper (orders/state-machine/) via compare-and-swap UPDATE ... WHERE
  // status IN (allowed_from) — never a plain UPDATE. See §14, §24 invariant 3.
}
