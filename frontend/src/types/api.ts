/**
 * Mirrors backend/src/common/types/api-response.interface.ts — every
 * AB Creations REST response is one of these two shapes (BLUEPRINT-v1.2.md
 * §21). Kept as a hand-written mirror rather than a shared package since
 * frontend/backend are separate npm projects with no workspace linking.
 */
export interface ApiSuccessResponse<T> {
  success: true
  data: T
  meta?: Record<string, unknown> | PaginationMeta
}

export interface ApiErrorResponse {
  success: false
  error: {
    code: string
    message: string
    details: unknown[]
  }
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse

export interface PaginationMeta {
  page: number
  limit: number
  total: number
  totalPages: number
}
