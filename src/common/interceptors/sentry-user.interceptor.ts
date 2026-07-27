import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Optional,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { Request } from 'express';
import { setSentryUser } from '../../config/sentry.config';

/**
 * SentryUserInterceptor — set user context di Sentry untuk setiap request.
 *
 * Interceptor ini membaca user dari request.user (di-set oleh JwtAuthGuard)
 * dan mengirim ke Sentry via setSentryUser().
 *
 * Jika Sentry tidak dikonfigurasi (SENTRY_DSN kosong), setSentryUser() no-op.
 * Interceptor ini aman dipasang global — tidak mengubah response apa pun.
 *
 * Terdaftar sebagai APP_INTERCEPTOR global di SentryModule.
 */
@Injectable()
export class SentryUserInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<Request>();
    const user = (request as any).user;

    if (user) {
      setSentryUser({
        id: user.id ?? user.sub ?? null,
        persnum: user.persnum ?? null,
        username: user.name ?? user.username ?? null,
        role: user.role ?? null,
      });
    }

    return next.handle();
  }
}