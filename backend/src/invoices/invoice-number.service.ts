import { randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

const INVOICE_NUMBER_COUNTER_KEY = 'invoice_number_counter';

/**
 * Dedicated, gap-free invoice sequence (Phase 13.4 §8) — a locked counter
 * row in app_settings, atomically bumped via INSERT ... ON CONFLICT DO
 * UPDATE ... RETURNING, exactly like OrdersService.generateOrderNumber but
 * a SEPARATE key (`invoice_number_counter`) so invoice numbers are never
 * derived from, or entangled with, order numbers. Concurrency-safe with no
 * extra lock statement; must be called with the invoice-creation
 * transaction's own client so the increment commits/rolls back with the
 * Invoice row.
 *
 * The `prefix` is admin-configurable (`invoice.numberPrefix`, default
 * "INV-"). The full statutory format (financial-year series etc.) is
 * PENDING CLIENT CONFIRMATION — this produces `${prefix}${000001}`.
 */
@Injectable()
export class InvoiceNumberService {
  async allocate(
    tx: Prisma.TransactionClient,
    prefix: string,
  ): Promise<string> {
    const rows = await tx.$queryRaw<{ value: string }[]>`
      INSERT INTO app_settings (id, key, value, "updatedAt")
      VALUES (${randomUUID()}, ${INVOICE_NUMBER_COUNTER_KEY}, '1', now())
      ON CONFLICT (key) DO UPDATE
        SET value = (app_settings.value::integer + 1)::text, "updatedAt" = now()
      RETURNING value
    `;
    return `${prefix}${rows[0].value.padStart(6, '0')}`;
  }
}
