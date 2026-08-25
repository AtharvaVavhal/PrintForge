/**
 * API Response Standard — see docs/architecture/BLUEPRINT-v1.2.md §21.
 * Every REST endpoint responds with one of these two shapes.
 */
export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  meta?: Record<string, unknown> | PaginationMeta;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details: unknown[];
  };
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

/** Pagination metadata — lifted to the envelope's top-level `meta` (§21). */
export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/**
 * A handler returns this shape for a paginated list; ResponseInterceptor
 * detects it and lifts `meta` out of `data` to the envelope top level,
 * so the client always sees a plain array under `data` for list endpoints.
 */
export interface PaginatedResult<T> {
  items: T[];
  meta: PaginationMeta;
}
