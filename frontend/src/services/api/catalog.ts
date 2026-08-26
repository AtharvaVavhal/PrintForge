import type { ApiSuccessResponse, PaginationMeta } from '@/types/api'
import type { Category, ListProductsParams, Product } from '@/types/catalog'
import { apiClient } from './client'

/**
 * Thin wrappers over the public catalog routes
 * (backend/src/products/products.controller.ts,
 * backend/src/products/categories/categories.controller.ts). Same pattern
 * as services/api/auth.ts — unwrap the {success, data[, meta]} envelope
 * (§21), return just the payload.
 */

export async function fetchCategories(): Promise<Category[]> {
  const res = await apiClient.get<ApiSuccessResponse<Category[]>>('/categories')
  return res.data.data
}

export interface ProductListResult {
  items: Product[]
  meta: PaginationMeta
}

/** GET /products only accepts page/limit/categoryId (ListProductsQueryDto)
 * — no search or sort param exists server-side. */
export async function fetchProducts(
  params: ListProductsParams = {},
): Promise<ProductListResult> {
  const res = await apiClient.get<ApiSuccessResponse<Product[]>>('/products', { params })
  return { items: res.data.data, meta: res.data.meta as PaginationMeta }
}

export async function fetchProductBySlug(slug: string): Promise<Product> {
  const res = await apiClient.get<ApiSuccessResponse<Product>>(
    `/products/${encodeURIComponent(slug)}`,
  )
  return res.data.data
}
