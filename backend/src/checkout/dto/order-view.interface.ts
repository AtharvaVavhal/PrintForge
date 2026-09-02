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
  /** Major-unit decimal string, "0.00" when no coupon was applied — never
   * null, mirrors the stored orders.discountAmount column's own
   * never-null default (PHASE-10-PROPOSAL.md §2.1/C7). */
  discountAmount: string;
  /** Tax snapshot (Phase 13.4). `taxAmount` is "0.00" until a
   * client-confirmed GST rate is enabled in admin settings; with
   * tax-INCLUSIVE pricing `total` is unchanged either way. `taxRatePercent`
   * is the human-readable rate (e.g. "18.00") or null when no rate was
   * applied. */
  taxableAmount: string;
  taxAmount: string;
  taxMode: string;
  taxRatePercent: string | null;
  /** Denormalized snapshot of the applied coupon's code, null when none
   * was applied. Never a live join back to `coupons` — same reasoning as
   * every other order-display snapshot field. */
  couponCode: string | null;
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

/** POST /checkout/validate's response (§2.2) — a preview only, never
 * authoritative. Deliberately has no `id`/`orderNumber`/`items` etc.:
 * nothing is created, this is a pricing computation against the caller's
 * current cart, not an order snapshot. */
export interface CheckoutPreviewView {
  subtotal: string;
  shippingFee: string;
  discountAmount: string;
  /** Tax preview (Phase 13.4) — "0.00" until a client-confirmed rate is
   * enabled; never authoritative, the real split is whatever the checkout
   * transaction persists. */
  taxableAmount: string;
  taxAmount: string;
  taxMode: string;
  total: string;
  /** Normalized (uppercased) echo of the coupon code that was actually
   * applied — null if none was provided. A provided-but-invalid code
   * throws instead of silently returning null here (same "backend owns
   * all price calculation" principle applied to a preview). */
  couponCode: string | null;
}
