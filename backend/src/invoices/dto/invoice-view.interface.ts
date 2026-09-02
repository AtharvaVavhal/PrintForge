/**
 * Read-side invoice representation (Phase 13.4). Every monetary field is a
 * major-unit decimal string snapshot; nothing here is recomputed from
 * live Product/Category/settings state. `notes` explicitly lists what is
 * still pending client confirmation so the document can never be mistaken
 * for a finalised statutory tax invoice.
 */
export interface InvoiceSellerView {
  legalName: string;
  address: string;
  gstin: string;
  state: string;
  /** True while any of the above is blank (not yet supplied by the client). */
  detailsPending: boolean;
}

export interface InvoiceBuyerView {
  name: string;
  phone: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

export interface InvoiceLineView {
  description: string;
  variantLabel: string | null;
  unitPrice: string;
  quantity: number;
  lineTotal: string;
}

export interface InvoiceView {
  invoiceNumber: string;
  issuedAt: Date;
  currency: string;
  orderId: string;
  orderNumber: string;
  orderPlacedAt: Date;

  seller: InvoiceSellerView;
  buyer: InvoiceBuyerView;
  lines: InvoiceLineView[];

  subtotal: string;
  discountAmount: string;
  shippingFee: string;
  taxableAmount: string;
  taxAmount: string;
  taxMode: string;
  /** Human-readable combined rate, e.g. "18.00", or null when no rate was applied. */
  taxRatePercent: string | null;
  grandTotal: string;

  notes: string[];
}
