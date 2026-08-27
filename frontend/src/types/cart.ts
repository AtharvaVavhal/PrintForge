/**
 * Mirrors backend/src/cart/dto/cart-view.interface.ts exactly — read-side
 * response shapes only, no request DTOs here (those are the payload types
 * in services/api/cart.ts, matching AddCartItemDto/UpdateCartItemDto).
 * Money fields (unitPrice, lineTotal, subtotal) are decimal strings,
 * server-computed on every read/mutation (§11) — never derived here.
 */

export type UnavailableReason = 'PRODUCT_INACTIVE' | 'VARIANT_UNAVAILABLE'

export interface CartItemCustomizationView {
  fieldId: string
  label: string
  textValue: string | null
  uploadedFileId: string | null
  surcharge: string
}

export interface CartItemView {
  id: string
  productId: string
  productName: string
  variantId: string | null
  variantLabel: string | null
  quantity: number
  unitPrice: string
  lineTotal: string
  isAvailable: boolean
  unavailableReason: UnavailableReason | null
  customizations: CartItemCustomizationView[]
}

export interface CartView {
  id: string
  items: CartItemView[]
  itemCount: number
  subtotal: string
}

/**
 * Mirrors ResultWithMeta<CartItemView>'s `meta` on the three mutation
 * endpoints (cart.controller.ts) — CartService.getCartTotals()'s return
 * shape. Attached to every add/update/remove response so the frontend can
 * patch its cached CartView without a follow-up GET /cart.
 */
export interface CartMutationMeta {
  subtotal: string
  itemCount: number
}
