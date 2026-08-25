/**
 * API Response Standard — see docs/architecture/BLUEPRINT-v1.2.md §21.
 * Every REST endpoint responds with one of these two shapes.
 */
export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  meta?: Record<string, unknown>;
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
