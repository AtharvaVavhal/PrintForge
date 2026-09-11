import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

/**
 * Dedicated, gap-free invoice sequence (Phase 13.4 §8; Phase 5 W9, decision
 * D11 — "invoice numbering is tenant-owned and sequential"). Atomically
 * bumped via INSERT ... ON CONFLICT DO UPDATE ... RETURNING, the same
 * pattern `OrdersService.generateOrderNumber` already uses for its own
 * (deliberately platform-scoped, out of W9's scope) order-number counter —
 * only now keyed by `(tenantId, key)` against `tenant_counters`
 * (`TenantCounter`, Phase 4 W3/W4, decision D10) instead of the global
 * `app_settings` table this method used before W9.
 *
 * Phase 4 W4's own backfill (`prisma/backfill/w4-backfill.ts`,
 * `seedTenantCounters`) already seeded a `tenant_counters` row for
 * `invoice_number_counter`, cross-checked at the time against the real
 * `MAX(invoices.invoiceNumber)` before being created — this method is
 * simply its first real application-code consumer. The old
 * `app_settings.invoice_number_counter` row is left physically in place,
 * untouched, but no application code reads or writes it anymore —
 * existing invoice numbers are never rewritten, and the next number
 * continues sequentially from wherever `tenant_counters` already stood.
 *
 * Concurrency-safe with no extra lock statement; must be called with the
 * invoice-creation transaction's own client so the increment commits/rolls
 * back with the Invoice row.
 *
 * The `prefix` is admin-configurable (`invoice.numberPrefix`, tenant-owned,
 * default "INV-"). The full statutory format (financial-year series etc.)
 * is PENDING CLIENT CONFIRMATION — this produces `${prefix}${000001}`.
 */
const INVOICE_NUMBER_COUNTER_KEY = 'invoice_number_counter';

@Injectable()
export class InvoiceNumberService {
  async allocate(
    tx: Prisma.TransactionClient,
    tenantId: string,
    prefix: string,
  ): Promise<string> {
    const rows = await tx.$queryRaw<{ value: number }[]>`
      INSERT INTO tenant_counters (id, "tenantId", key, value, "updatedAt")
      VALUES (gen_random_uuid()::text, ${tenantId}, ${INVOICE_NUMBER_COUNTER_KEY}, 1, now())
      ON CONFLICT ("tenantId", key) DO UPDATE
        SET value = (tenant_counters.value + 1), "updatedAt" = now()
      RETURNING value
    `;
    return `${prefix}${String(rows[0].value).padStart(6, '0')}`;
  }
}
