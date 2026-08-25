import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiSuccessResponse } from '../types/api-response.interface';

/**
 * Wraps every successful controller return value in the frozen
 * {success, data, meta} envelope (§21). Error shaping is the mirror-image
 * responsibility of HttpExceptionFilter — the two must be kept in sync.
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
    // TODO(common): once list endpoints exist, detect a {data, meta} return
    // shape from the handler and lift `meta` (pagination) to the envelope
    // top level instead of nesting it inside `data`.
    return next.handle().pipe(
      map((data) => ({
        success: true as const,
        data,
      })),
    );
  }
}
