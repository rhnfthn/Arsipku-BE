import { ValidationPipe } from '@nestjs/common';
import { NestFactory, Reflector } from '@nestjs/core';
import { AppModule } from './app.module';
import { HttpExceptionFilter, AllExceptionsFilter } from './common/filters';
import { TransformResponseInterceptor } from './common/interceptors';

async function bootstrap() {
  const PORT = process.env.PORT;
  console.log(`Running Server on PORT : ${PORT}`);
  const app = await NestFactory.create(AppModule);

  // Global Exception Filters
  app.useGlobalFilters(
    new AllExceptionsFilter(),
    new HttpExceptionFilter(),
  );

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

  await app.listen(PORT ?? 3000);
}
bootstrap();
