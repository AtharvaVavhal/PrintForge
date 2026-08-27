import type { ApiSuccessResponse } from '@/types/api'
import type { CartItemView, CartMutationMeta, CartView } from '@/types/cart'
import type { CustomizationValueDto } from '@/types/customization'
import { apiClient } from './client'

/**
 * Thin wrappers over backend/src/cart/cart.controller.ts — always
 * authenticated (JwtAuthGuard is global, no @Public() anywhere on this
 * controller; no guest cart §10). Same unwrap-the-envelope pattern as
 * services/api/catalog.ts.
 */

export async function fetchCart(): Promise<CartView> {
  const res = await apiClient.get<ApiSuccessResponse<CartView>>('/cart')
  return res.data.data
}

export interface AddCartItemPayload {
  productId: string
  variantId?: string
  quantity: number
  customizations?: CustomizationValueDto[]
}

export interface CartMutationResult {
  item: CartItemView
  meta: CartMutationMeta
}

/** The 3 mutation endpoints return {data: CartItemView, meta:
 * {subtotal, itemCount}} (ResultWithMeta) — meta is lifted to the
 * envelope's top level by the backend's ResponseInterceptor, same
 * mechanism catalog.ts's fetchProducts relies on for pagination meta. */
export async function addCartItem(payload: AddCartItemPayload): Promise<CartMutationResult> {
  const res = await apiClient.post<ApiSuccessResponse<CartItemView>>('/cart/items', payload)
  return { item: res.data.data, meta: res.data.meta as unknown as CartMutationMeta }
}

export async function updateCartItem(
  itemId: string,
  quantity: number,
): Promise<CartMutationResult> {
  const res = await apiClient.patch<ApiSuccessResponse<CartItemView>>(
    `/cart/items/${itemId}`,
    { quantity },
  )
  return { item: res.data.data, meta: res.data.meta as unknown as CartMutationMeta }
}

export interface RemoveCartItemResult {
  meta: CartMutationMeta
}

export async function removeCartItem(itemId: string): Promise<RemoveCartItemResult> {
  const res = await apiClient.delete<ApiSuccessResponse<{ message: string }>>(
    `/cart/items/${itemId}`,
  )
  return { meta: res.data.meta as unknown as CartMutationMeta }
}
