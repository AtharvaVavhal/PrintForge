import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import {
  ApiSuccessResponse,
  PaginatedResult,
  ResultWithMeta,
} from '../types/api-response.interface';

function isPaginatedResult(value: unknown): value is PaginatedResult<unknown> {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Partial<PaginatedResult<unknown>>;
  return (
    Array.isArray(candidate.items) &&
    typeof candidate.meta === 'object' &&
    candidate.meta !== null
  );
}

function isResultWithMeta(value: unknown): value is ResultWithMeta<unknown> {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Partial<ResultWithMeta<unknown>>;
  return (
    'data' in candidate &&
    typeof candidate.meta === 'object' &&
    candidate.meta !== null
  );
}

/**
 * Wraps every successful controller return value in the frozen
 * {success, data, meta} envelope (§21). Error shaping is the mirror-image
 * responsibility of HttpExceptionFilter — the two must be kept in sync.
 *
 * A handler returning a `PaginatedResult<T>` (`{items, meta}`) is detected
 * here and its `meta` is lifted to the envelope's top level, with `items`
 * becoming `data` — so list endpoints still return a plain array under
 * `data`, per §21. A handler returning a `ResultWithMeta<T>` (`{data,
 * meta}`) gets the same top-level `meta` lift for a single-resource
 * response that also needs side-channel summary data (e.g. a cart-item
 * mutation returning the item plus the cart's current subtotal/itemCount).
 */
@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<
  T,
  ApiSuccessResponse<T>
> {
  intercept(
    _context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ApiSuccessResponse<T>> {
    return next.handle().pipe(
      map((result) => {
        if (isPaginatedResult(result)) {
          return {
            success: true as const,
            data: result.items as T,
            meta: result.meta,
          };
        }
        if (isResultWithMeta(result)) {
          return {
            success: true as const,
            data: result.data as T,
            meta: result.meta,
          };
        }
        return {
          success: true as const,
          data: result,
        };
      }),
    );
  }
}
