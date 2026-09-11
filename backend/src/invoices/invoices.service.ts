import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Invoice, OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../common/database/prisma.service';
import {
  decimalToPaise,
  paiseToDecimalString,
} from '../cart/pricing/money.util';
import { AppSettingService } from '../app-setting/app-setting.service';
import { InvoiceNumberService } from './invoice-number.service';
import { InvoiceView } from './dto/invoice-view.interface';

/** An invoice is available once payment has actually succeeded — the order
 * has reached PAID or a later fulfilment state. Never for PENDING_PAYMENT /
 * PAYMENT_FAILED / CANCELLED. Payment state itself is owned entirely by the
 * payment system; generating an invoice never changes it (§12). */
const INVOICEABLE_STATUSES: ReadonlySet<OrderStatus> = new Set([
  OrderStatus.PAID,
  OrderStatus.CONFIRMED,
  OrderStatus.IN_PRODUCTION,
  OrderStatus.SHIPPED,
  OrderStatus.DELIVERED,
  OrderStatus.REFUNDED,
]);

const ORDER_INCLUDE = {
  items: { orderBy: { id: 'asc' as const } },
  invoice: true,
} satisfies Prisma.OrderInclude;

type OrderWithInvoice = Prisma.OrderGetPayload<{
  include: typeof ORDER_INCLUDE;
}>;

interface SellerSnapshot {
  legalName: string;
  address: string;
  gstin: string;
  state: string;
}

export interface InvoiceActor {
  userId: string;
  isAdmin: boolean;
  /** Required when `isAdmin` is true (the caller's own already
   * server-derived tenant) — W10 hardening: `isAdmin: true` used to bypass
   * ownership entirely, letting any tenant's admin read any OTHER
   * tenant's invoice by order id. Unused for a non-admin caller, who is
   * still scoped by `userId` alone (a customer has no tenant identity of
   * its own to check against). */
  tenantId?: string;
}

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly appSettings: AppSettingService,
    private readonly invoiceNumber: InvoiceNumberService,
  ) {}

  /**
   * Idempotent: returns the order's existing invoice, or creates exactly
   * one and returns it. `orderId @unique` on Invoice + a P2002 catch make
   * concurrent first-requests converge on a single row. Ownership is
   * enforced here — a non-admin caller only ever sees their own order's
   * invoice, and a missing/foreign order is indistinguishable from "not
   * found".
   */
  async getInvoiceForOrder(
    orderId: string,
    actor: InvoiceActor,
  ): Promise<InvoiceView> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: ORDER_INCLUDE,
    });
    // W10 hardening (P0) — `isAdmin: true` used to skip ownership checking
    // entirely; it must instead check the ADMIN's OWN tenant against the
    // order's tenant, exactly the same shape the non-admin branch already
    // checks userId against.
    const crossTenantAdmin =
      actor.isAdmin && order && order.tenantId !== actor.tenantId;
    if (
      !order ||
      (!actor.isAdmin && order.userId !== actor.userId) ||
      crossTenantAdmin
    ) {
      throw new NotFoundException('Order not found');
    }

    if (order.invoice) {
      return this.project(order, order.invoice);
    }

    if (!INVOICEABLE_STATUSES.has(order.status)) {
      throw new ConflictException(
        'An invoice is only available once the order has been paid',
      );
    }

    const invoice = await this.createInvoice(order);
    return this.project(order, invoice);
  }

  private async createInvoice(order: OrderWithInvoice): Promise<Invoice> {
    // Phase 5 W9 (decision D11) — `invoice.numberPrefix` and the seller
    // identity fields are TENANT-owned; `order.tenantId` is the order's own
    // already-persisted, server-derived ownership column, never a
    // client-supplied value (Phase 4 W7 / P4-D2) — the same value this
    // method already trusts two lines below for the Invoice row itself.
    const prefix =
      (
        await this.appSettings.getTenantValue(
          order.tenantId,
          'invoice.numberPrefix',
        )
      )?.trim() || 'INV-';
    const seller = await this.buildSellerSnapshot(order.tenantId);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const invoiceNumber = await this.invoiceNumber.allocate(
          tx,
          order.tenantId,
          prefix,
        );
        return tx.invoice.create({
          data: {
            invoiceNumber,
            orderId: order.id,
            // Derived from the order this invoice belongs to — never a
            // client-supplied value (Phase 4 W7 / P4-D2).
            tenantId: order.tenantId,
            currency: order.currency,
            subtotal: order.subtotal,
            discountAmount: order.discountAmount,
            shippingFee: order.shippingFee,
            taxableAmount: order.taxableAmount,
            taxAmount: order.taxAmount,
            grandTotal: order.total,
            taxMode: order.taxMode,
            taxRateSnapshot: order.taxRateSnapshot,
            taxBreakdown: order.taxBreakdown ?? Prisma.JsonNull,
            sellerSnapshot: seller as unknown as Prisma.InputJsonValue,
          },
        });
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        const existing = await this.prisma.invoice.findUnique({
          where: { orderId: order.id },
        });
        if (existing) {
          return existing;
        }
      }
      throw err;
    }
  }

  private async buildSellerSnapshot(tenantId: string): Promise<SellerSnapshot> {
    const stored = await this.appSettings.getManyTenantValues(tenantId, [
      'invoice.sellerLegalName',
      'invoice.sellerAddress',
      'invoice.sellerGstin',
      'invoice.sellerState',
    ]);
    return {
      legalName: stored['invoice.sellerLegalName'] ?? '',
      address: stored['invoice.sellerAddress'] ?? '',
      gstin: stored['invoice.sellerGstin'] ?? '',
      state: stored['invoice.sellerState'] ?? '',
    };
  }

  private project(order: OrderWithInvoice, invoice: Invoice): InvoiceView {
    const seller = this.readSeller(invoice);
    const detailsPending =
      !seller.legalName || !seller.address || !seller.gstin;

    const taxRatePercent = invoice.taxRateSnapshot
      ? new Prisma.Decimal(invoice.taxRateSnapshot).mul(100).toFixed(2)
      : null;

    const notes: string[] = [];
    if (detailsPending) {
      notes.push(
        'Seller legal name / address / GSTIN are pending — this document is not yet a valid tax invoice.',
      );
    }
    if (taxRatePercent === null) {
      notes.push(
        'No GST rate is configured. Tax is shown as ₹0.00 and is not itemised. Prices are treated as tax-inclusive (blueprint §4).',
      );
    }
    notes.push(
      'HSN/SAC codes and the CGST/SGST/IGST breakdown are not included — pending client confirmation of the tax regime.',
    );

    return {
      invoiceNumber: invoice.invoiceNumber,
      issuedAt: invoice.issuedAt,
      currency: invoice.currency,
      orderId: order.id,
      orderNumber: order.orderNumber,
      orderPlacedAt: order.createdAt,
      seller: { ...seller, detailsPending },
      buyer: {
        name: order.shippingRecipientName,
        phone: order.shippingPhone,
        addressLine1: order.shippingAddressLine1,
        addressLine2: order.shippingAddressLine2,
        city: order.shippingCity,
        state: order.shippingState,
        postalCode: order.shippingPostalCode,
        country: order.shippingCountry,
      },
      lines: order.items.map((item) => ({
        description: item.productNameSnapshot,
        variantLabel: item.variantLabelSnapshot,
        unitPrice: this.decStr(item.unitPriceSnapshot),
        quantity: item.quantity,
        lineTotal: this.decStr(item.lineTotal),
      })),
      subtotal: this.decStr(invoice.subtotal),
      discountAmount: this.decStr(invoice.discountAmount),
      shippingFee: this.decStr(invoice.shippingFee),
      taxableAmount: this.decStr(invoice.taxableAmount),
      taxAmount: this.decStr(invoice.taxAmount),
      taxMode: invoice.taxMode,
      taxRatePercent,
      grandTotal: this.decStr(invoice.grandTotal),
      notes,
    };
  }

  private readSeller(invoice: Invoice): SellerSnapshot {
    const raw = (invoice.sellerSnapshot ?? {}) as Record<string, unknown>;
    const s = (v: unknown): string => (typeof v === 'string' ? v : '');
    return {
      legalName: s(raw.legalName),
      address: s(raw.address),
      gstin: s(raw.gstin),
      state: s(raw.state),
    };
  }

  private decStr(value: Prisma.Decimal): string {
    return paiseToDecimalString(decimalToPaise(value));
  }
}
