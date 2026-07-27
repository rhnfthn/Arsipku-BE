import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { SentryUserInterceptor } from '../../common/interceptors/sentry-user.interceptor';

/**
 * SentryModule — modul global untuk integrasi Sentry.
 *
 * Mendaftarkan SentryUserInterceptor sebagai APP_INTERCEPTOR global
 * agar setiap request yang sudah ter-authenticate otomatis set user context
 * di Sentry.
 *
 * Sentry inisialisasi dilakukan di main.ts (initSentry()) SEBELUM
 * NestFactory.create() agar error saat bootstrap juga tertangkap.
 *
 * Jika SENTRY_DSN tidak di-set, semua operasi Sentry no-op (aman).
 */
@Module({
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: SentryUserInterceptor,
    },
  ],
})
export class SentryModule {}