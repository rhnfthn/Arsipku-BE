process.env.TZ = 'Asia/Jakarta';

// Load .env SEBELUM modul dievaluasi — dipakai untuk conditional module
// registration (mis. MONGODB_ENABLED di AppModule/AuditModule).
import 'dotenv/config';

// ─── Sentry inisialisasi (SEBELUM NestFactory agar error bootstrap tertangkap) ───
// initSentry() no-op jika SENTRY_DSN tidak di-set → tidak mengubah behavior lama.
import { initSentry } from './config/sentry.config';
initSentry();

import { ValidationPipe } from '@nestjs/common';
import { NestFactory, Reflector } from '@nestjs/core';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { AppModule } from './app.module';
import { HttpExceptionFilter, AllExceptionsFilter } from './common/filters';
import { TransformResponseInterceptor } from './common/interceptors';
import * as express from 'express';

async function bootstrap() {
  const PORT = Number(process.env.PORT) || 3000;
  console.log(`Running Server on PORT : ${PORT}`);
  // commit check: minor code comment inserted here
  const app = await NestFactory.create(AppModule);
  app.use(express.json({ limit: '25mb' }));
  app.use(express.urlencoded({ extended: true, limit: '25mb' }));

  // WebSocket adapter (Socket.IO) untuk NotificationGateway
  app.useWebSocketAdapter(new IoAdapter(app));

  // Global Exception Filters
  // Match specific HTTP exceptions first; the catch-all filter handles only
  // non-HTTP/unhandled errors.
  app.useGlobalFilters(new HttpExceptionFilter(), new AllExceptionsFilter());

  // Global Interceptors
  const reflector = app.get(Reflector);
  app.useGlobalInterceptors(new TransformResponseInterceptor(reflector));

  // Global Validation Pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // hapus field yang tidak didefinisikan di DTO
      forbidNonWhitelisted: true, // tolak kalau ada field asing
      transform: true, // auto cast tipe data sesuai DTO
    }),
  );

  // Auth v2 memakai cookie HttpOnly dari origin frontend, sehingga browser
  // membutuhkan origin eksplisit dan credentials=true (wildcard tidak valid).
  const corsOrigins = [process.env.FRONTEND_URL, process.env.WS_CORS_ORIGIN]
    .flatMap((value) => (value || '').split(','))
    .map((value) => value.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  app.enableCors({
    origin: corsOrigins.length > 0 ? corsOrigins : true,
    credentials: true,
  });

  // Trust proxy agar Express membaca x-forwarded-for / x-real-ip dengan benar
  // (diperlukan untuk audit trail IP address yang akurat di balik reverse proxy)
  const httpAdapter = app.getHttpAdapter();
  if (
    httpAdapter &&
    typeof (httpAdapter.getInstance() as any).set === 'function'
  ) {
    (httpAdapter.getInstance() as any).set('trust proxy', true);
  }

  await app.listen(PORT);

  // TypeORM's shutdown hook can race with Nest CLI's child replacement in
  // watch mode and look up a DataSource that is already being torn down.
  // Let the watcher terminate its development child directly; production
  // process managers still receive graceful cleanup hooks.
  if (process.env.NEST_WATCH_MODE !== 'true') {
    app.enableShutdownHooks(['SIGINT', 'SIGTERM']);
  }
}

bootstrap().catch((error) => {
  console.error('Backend gagal dijalankan:', error);
  process.exitCode = 1;
});
