/**
 * Mirrors backend/src/invoices/dto/invoice-view.interface.ts (Phase 13.4).
 * Every monetary field is a server-computed major-unit decimal string;
 * the frontend only ever displays these, never recomputes tax. `notes`
 * lists what is still pending client confirmation.
 */
export interface InvoiceSellerView {
  legalName: string
  address: string
  gstin: string
  state: string
  detailsPending: boolean
}

export interface InvoiceBuyerView {
  name: string
  phone: string
  addressLine1: string
  addressLine2: string | null
  city: string
  state: string
  postalCode: string
  country: string
}

export interface InvoiceLineView {
  description: string
  variantLabel: string | null
  unitPrice: string
  quantity: number
  lineTotal: string
}

export interface InvoiceView {
  invoiceNumber: string
  issuedAt: string
  currency: string
  orderId: string
  orderNumber: string
  orderPlacedAt: string
  seller: InvoiceSellerView
  buyer: InvoiceBuyerView
  lines: InvoiceLineView[]
  subtotal: string
  discountAmount: string
  shippingFee: string
  taxableAmount: string
  taxAmount: string
  taxMode: string
  taxRatePercent: string | null
  grandTotal: string
  notes: string[]
}
