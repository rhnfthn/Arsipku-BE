import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { captureAuditError } from '../../config/sentry.config';

/**
 * Global All Exceptions Filter
 * Catches all unhandled exceptions
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    // Keep the status/message from known Nest HTTP exceptions. This filter is
    // registered alongside HttpExceptionFilter and must not turn 4xx/5xx
    // responses such as 401, 403, or 429 into a generic 500 response.
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const exceptionResponse =
      exception instanceof HttpException ? exception.getResponse() : null;
    const message =
      typeof exceptionResponse === 'string'
        ? exceptionResponse
        : ((exceptionResponse as { message?: string | string[] } | null)
            ?.message ??
          (exception instanceof Error
            ? exception.message
            : 'Internal server error'));
    const error =
      typeof exceptionResponse === 'object' && exceptionResponse !== null
        ? (exceptionResponse as { error?: string }).error
        : undefined;

    const request = ctx.getRequest<{ method?: string; url?: string }>();
    const method = request?.method ?? 'UNKNOWN';
    const url = request?.url ?? 'UNKNOWN';
    this.logger.error(
      `${method} ${url} → ${status} ${message}`,
      exception instanceof Error ? exception.stack : undefined,
    );

    // Capture only server-side failures. Client errors are expected API
    // responses and should not create Sentry errors.
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      captureAuditError(exception, {
        module: 'global',
        controller: 'AllExceptionsFilter',
        endpoint: `${method} ${url}`,
        extra: {
          statusCode: status,
          message,
        },
      });
    }

    response.status(status).json({
      success: false,
      statusCode: status,
      timestamp: new Date().toISOString(),
      message,
      error,
    });
  }
}
