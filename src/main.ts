process.env.TZ = 'Asia/Jakarta';

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
  app.useGlobalFilters(new AllExceptionsFilter(), new HttpExceptionFilter());

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

  // Enable CORS if needed
  app.enableCors();

  // Trust proxy agar Express membaca x-forwarded-for / x-real-ip dengan benar
  // (diperlukan untuk audit trail IP address yang akurat di balik reverse proxy)
  const httpAdapter = app.getHttpAdapter();
  if (httpAdapter && typeof (httpAdapter.getInstance() as any).set === 'function') {
    (httpAdapter.getInstance() as any).set('trust proxy', true);
  }

  await app.listen(PORT);
}
bootstrap();
