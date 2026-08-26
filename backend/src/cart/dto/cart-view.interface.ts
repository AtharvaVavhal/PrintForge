/**
 * Read-side response shapes — not request DTOs, so no class-validator here.
 * Money fields are major-unit decimal strings (§21); the paise/bigint math
 * that produces them never crosses the HTTP boundary.
 */

export type UnavailableReason = 'PRODUCT_INACTIVE' | 'VARIANT_UNAVAILABLE';

export interface CartItemCustomizationView {
  fieldId: string;
  label: string;
  textValue: string | null;
  uploadedFileId: string | null;
  surcharge: string;
}

export interface CartItemView {
  id: string;
  productId: string;
  productName: string;
  variantId: string | null;
  variantLabel: string | null;
  quantity: number;
  unitPrice: string;
  lineTotal: string;
  isAvailable: boolean;
  unavailableReason: UnavailableReason | null;
  customizations: CartItemCustomizationView[];
}

export interface CartView {
  id: string;
  items: CartItemView[];
  itemCount: number;
  subtotal: string;
}
