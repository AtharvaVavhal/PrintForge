import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { InvoicesService } from './invoices.service';

/**
 * Phase 13.4 §7/§12/§13 — invoice projection, the paid-only gate, and
 * ownership. Idempotent creation + the real number sequence are covered
 * against Postgres in test/e2e/tax-and-invoicing.e2e-spec.ts.
 */
describe('InvoicesService', () => {
  function dec(v: string) {
    return new Prisma.Decimal(v);
  }

  const orderBase = {
    id: 'order-1',
    userId: 'user-1',
    orderNumber: 'PF-000042',
    status: 'PAID',
    currency: 'INR',
    subtotal: dec('199.00'),
    discountAmount: dec('0.00'),
    shippingFee: dec('49.00'),
    taxableAmount: dec('150.00'),
    taxAmount: dec('0.00'),
    total: dec('199.00'),
    taxMode: 'INCLUSIVE',
    taxRateSnapshot: null as Prisma.Decimal | null,
    taxBreakdown: null,
    createdAt: new Date('2026-02-01T00:00:00Z'),
    shippingRecipientName: 'Jane Doe',
    shippingPhone: '9876543210',
    shippingAddressLine1: '1 Test Rd',
    shippingAddressLine2: null,
    shippingCity: 'Pune',
    shippingState: 'MH',
    shippingPostalCode: '411001',
    shippingCountry: 'India',
    items: [
      {
        productNameSnapshot: 'Ceramic Mug',
        variantLabelSnapshot: '11oz',
        unitPriceSnapshot: dec('199.00'),
        quantity: 1,
        lineTotal: dec('199.00'),
      },
    ],
  };

  const existingInvoice = {
    id: 'inv-1',
    invoiceNumber: 'INV-000001',
    orderId: 'order-1',
    issuedAt: new Date('2026-02-02T00:00:00Z'),
    currency: 'INR',
    subtotal: dec('199.00'),
    discountAmount: dec('0.00'),
    shippingFee: dec('49.00'),
    taxableAmount: dec('150.00'),
    taxAmount: dec('0.00'),
    grandTotal: dec('199.00'),
    taxMode: 'INCLUSIVE',
    taxRateSnapshot: null,
    taxBreakdown: null,
    sellerSnapshot: { legalName: '', address: '', gstin: '', state: '' },
  };

  function build(order: unknown) {
    const prisma = {
      order: { findUnique: jest.fn().mockResolvedValue(order) },
    };
    const appSettings = { get: jest.fn(), getMany: jest.fn() };
    const invoiceNumber = { allocate: jest.fn() };
    const service = new InvoicesService(
      prisma as never,
      appSettings as never,
      invoiceNumber,
    );
    return { service, prisma, appSettings, invoiceNumber };
  }

  it('projects an existing invoice from persisted snapshots, with pending-notice notes', async () => {
    const { service } = build({ ...orderBase, invoice: existingInvoice });

    const view = await service.getInvoiceForOrder('order-1', {
      userId: 'user-1',
      isAdmin: false,
    });

    expect(view.invoiceNumber).toBe('INV-000001');
    expect(view.grandTotal).toBe('199.00');
    expect(view.taxAmount).toBe('0.00');
    expect(view.taxRatePercent).toBeNull();
    expect(view.seller.detailsPending).toBe(true);
    expect(view.lines).toHaveLength(1);
    expect(view.lines[0]).toMatchObject({
      description: 'Ceramic Mug',
      lineTotal: '199.00',
    });
    expect(view.notes.join(' ')).toMatch(/not yet a valid tax invoice/i);
    expect(view.notes.join(' ')).toMatch(/No GST rate is configured/i);
    expect(view.notes.join(' ')).toMatch(/HSN\/SAC/i);
  });

  it('surfaces a configured rate on the projection', async () => {
    const { service } = build({
      ...orderBase,
      invoice: {
        ...existingInvoice,
        taxAmount: dec('30.00'),
        taxableAmount: dec('169.00'),
        taxRateSnapshot: dec('0.1800'),
        sellerSnapshot: {
          legalName: 'X',
          address: 'Y',
          gstin: '22AAAAA0000A1Z5',
          state: 'MH',
        },
      },
    });

    const view = await service.getInvoiceForOrder('order-1', {
      userId: 'user-1',
      isAdmin: false,
    });
    expect(view.taxRatePercent).toBe('18.00');
    expect(view.seller.detailsPending).toBe(false);
    expect(view.notes.join(' ')).not.toMatch(/not yet a valid tax invoice/i);
  });

  it('refuses to create an invoice for an unpaid order', async () => {
    const { service } = build({
      ...orderBase,
      status: 'PENDING_PAYMENT',
      invoice: null,
    });

    await expect(
      service.getInvoiceForOrder('order-1', {
        userId: 'user-1',
        isAdmin: false,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("hides another customer's order (404, not 403 — no existence leak)", async () => {
    const { service } = build({ ...orderBase, invoice: existingInvoice });

    await expect(
      service.getInvoiceForOrder('order-1', {
        userId: 'someone-else',
        isAdmin: false,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lets an admin read any order’s invoice', async () => {
    const { service } = build({ ...orderBase, invoice: existingInvoice });

    const view = await service.getInvoiceForOrder('order-1', {
      userId: 'admin-9',
      isAdmin: true,
    });
    expect(view.invoiceNumber).toBe('INV-000001');
  });

  it('404s a missing order', async () => {
    const { service } = build(null);
    await expect(
      service.getInvoiceForOrder('nope', { userId: 'user-1', isAdmin: false }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
