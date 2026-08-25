import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiErrorResponse } from '../types/api-response.interface';

/**
 * Mirror-image of ResponseInterceptor: shapes every thrown error into the
 * frozen {success:false, error:{code, message, details}} envelope (§21).
 * Catches everything (not just HttpException) so an unexpected error never
 * leaks a raw stack trace to the client.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const isHttpException = exception instanceof HttpException;
    const status = isHttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    const body: ApiErrorResponse = {
      success: false,
      error: {
        code: HttpStatus[status] ?? 'INTERNAL_SERVER_ERROR',
        message: isHttpException
          ? this.extractMessage(exception)
          : 'Internal server error',
        details: isHttpException ? this.extractDetails(exception) : [],
      },
    };

    if (!isHttpException) {
      // Unexpected (non-HttpException) errors are always logged with full detail server-side.
      this.logger.error(
        exception instanceof Error ? exception.stack : exception,
      );
    }

    response.status(status).json(body);
  }

  private extractMessage(exception: HttpException): string {
    const res = exception.getResponse();
    if (typeof res === 'string') return res;
    if (typeof res === 'object' && res !== null && 'message' in res) {
      const m = res.message;
      return Array.isArray(m) ? exception.message : String(m);
    }
    return exception.message;
  }

  private extractDetails(exception: HttpException): unknown[] {
    const res = exception.getResponse();
    if (typeof res === 'object' && res !== null && 'message' in res) {
      const m = res.message;
      return Array.isArray(m) ? m : [];
    }
    return [];
  }
}
