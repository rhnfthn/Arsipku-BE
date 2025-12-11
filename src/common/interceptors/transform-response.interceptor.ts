import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { SKIP_TRANSFORM_KEY } from '../decorators/skip-transform.decorator';

export interface Response<T> {
  success: boolean;
  data: T;
  message?: string;
}

/**
 * Transform Response Interceptor
 * Wraps all successful responses in a consistent format
 */
@Injectable()
export class TransformResponseInterceptor<T>
  implements NestInterceptor<T, Response<T>>
{
  constructor(private reflector: Reflector) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<Response<T>> {
    const skipTransform = this.reflector.getAllAndOverride<boolean>(
      SKIP_TRANSFORM_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (skipTransform) {
      return next.handle();
    }

    return next.handle().pipe(
      map((data) => {
        // If response already has success property, return as is
        if (data && typeof data === 'object' && 'success' in data) {
          return data;
        }

        // Otherwise, wrap in standard response format
        return {
          success: true,
          data,
        };
      }),
    );
  }
}
