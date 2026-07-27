import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
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

    const status =
      exception instanceof Error
        ? HttpStatus.INTERNAL_SERVER_ERROR
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof Error ? exception.message : 'Internal server error';

    // Log full stack trace ke console agar error 500 terlihat di terminal BE
    const request = ctx.getRequest<{ method?: string; url?: string }>();
    const method = request?.method ?? 'UNKNOWN';
    const url = request?.url ?? 'UNKNOWN';
    this.logger.error(
      `${method} ${url} → ${status} ${message}`,
      exception instanceof Error ? exception.stack : undefined,
    );

    // Capture ke Sentry (no-op jika SENTRY_DSN tidak di-set)
    captureAuditError(exception, {
      module: 'global',
      controller: 'AllExceptionsFilter',
      endpoint: `${method} ${url}`,
      extra: {
        statusCode: status,
        message,
      },
    });

    response.status(status).json({
      success: false,
      statusCode: status,
      timestamp: new Date().toISOString(),
      message,
      error: 'Internal Server Error',
    });
  }
}
