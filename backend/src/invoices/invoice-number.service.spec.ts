import { InvoiceNumberService } from './invoice-number.service';

/**
 * Phase 13.4 §8 — invoice numbers come from a DEDICATED counter, never the
 * order-number counter, never a client value. Concurrency safety comes
 * from the atomic INSERT ... ON CONFLICT DO UPDATE RETURNING (exercised
 * against real Postgres in test/e2e/tax-and-invoicing.e2e-spec.ts).
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
    expect(await service.allocate(tx as never, 'INV-')).toBe('INV-000007');
  });

  it('does not truncate a counter longer than the pad width', async () => {
    const { service, tx } = build('1234567');
    expect(await service.allocate(tx as never, 'INV-')).toBe('INV-1234567');
  });

  it('honours a configured prefix', async () => {
    const { service, tx } = build('3');
    expect(await service.allocate(tx as never, 'PF/INV/')).toBe(
      'PF/INV/000003',
    );
  });

  // The counter KEY is `invoice_number_counter` (distinct from
  // `order_number_counter`) and the ON CONFLICT increment is atomic — both
  // are verified end-to-end against real Postgres in
  // test/e2e/tax-and-invoicing.e2e-spec.ts.
});
