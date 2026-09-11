import { InvoiceNumberService } from './invoice-number.service';

/**
 * Phase 13.4 §8 — invoice numbers come from a DEDICATED counter, never the
 * order-number counter, never a client value. Concurrency safety comes
 * from the atomic INSERT ... ON CONFLICT DO UPDATE RETURNING (exercised
 * against real Postgres in test/e2e/tax-and-invoicing.e2e-spec.ts).
 *
 * Phase 5 W9 (decision D11) — the counter moved from the global
 * `app_settings` table to `TenantCounter` (`tenant_counters`, keyed by
 * `(tenantId, key)`), so `allocate` now takes the caller's own already
 * server-derived `tenantId` as well.
 */
describe('InvoiceNumberService.allocate', () => {
  function build(counterValue: string) {
    const queryRaw = jest.fn().mockResolvedValue([{ value: counterValue }]);
    return {
      service: new InvoiceNumberService(),
      tx: { $queryRaw: queryRaw },
      queryRaw,
    };
  }

  it('formats prefix + zero-padded counter', async () => {
    const { service, tx } = build('7');
    expect(await service.allocate(tx as never, 'tenant-a', 'INV-')).toBe(
      'INV-000007',
    );
  });

  it('does not truncate a counter longer than the pad width', async () => {
    const { service, tx } = build('1234567');
    expect(await service.allocate(tx as never, 'tenant-a', 'INV-')).toBe(
      'INV-1234567',
    );
  });

  it('honours a configured prefix', async () => {
    const { service, tx } = build('3');
    expect(await service.allocate(tx as never, 'tenant-a', 'PF/INV/')).toBe(
      'PF/INV/000003',
    );
  });

  it('scopes the counter to the caller tenant — the tenantId is part of the raw query parameters', async () => {
    const { service, tx, queryRaw } = build('1');
    await service.allocate(tx as never, 'tenant-b', 'INV-');
    const params = (queryRaw.mock.calls[0] as unknown[]).slice(1);
    expect(params).toContain('tenant-b');
  });

  // The counter KEY is `invoice_number_counter` (distinct from
  // `order_number_counter`) and the ON CONFLICT increment is atomic — both
  // are verified end-to-end against real Postgres in
  // test/e2e/tax-and-invoicing.e2e-spec.ts.
});
