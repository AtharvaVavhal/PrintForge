import { OrderStatus } from '@prisma/client';

/**
 * Read-side response shape for the just-created order — not a request DTO,
 * so no class-validator here. Money fields are major-unit decimal strings
 * (§21); the paise/bigint math that produces them never crosses the HTTP
 * boundary. Unlike the cart view, every field here is a snapshot read back
 * from the Order/OrderItem/OrderItemCustomization rows themselves — never
 * live-recomputed from current catalog state (§13.G).
 */

export interface OrderItemCustomizationView {
  fieldLabel: string;
  textValue: string | null;
  uploadedFileId: string | null;
}

export interface OrderItemView {
  id: string;
  productId: string | null;
  productName: string;
  variantLabel: string | null;
  unitPrice: string;
  quantity: number;
  lineTotal: string;
  customizations: OrderItemCustomizationView[];
}

export interface OrderView {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  subtotal: string;
  /** Read from the stored `orders.shippingFee` column (added post-MVP,
   * docs/architecture/PHASE-10-PROPOSAL.md §2.5) — no longer derived as
   * `total - subtotal` on read. That derivation was only correct while
   * discount was hardcoded to zero; it silently breaks the moment a
   * non-zero discount exists, since total = subtotal - discount +
   * shippingFee, not subtotal + shippingFee. */
  shippingFee: string;
  total: string;
  currency: string;
  shippingRecipientName: string;
  shippingPhone: string;
  shippingAddressLine1: string;
  shippingAddressLine2: string | null;
  shippingCity: string;
  shippingState: string;
  shippingPostalCode: string;
  shippingCountry: string;
  items: OrderItemView[];
  createdAt: Date;
}
