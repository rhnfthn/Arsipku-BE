import { Module } from '@nestjs/common';
import { ShortUrlController } from './controllers/short-url.controller';
import { ShortUrlService } from './services/short-url.service';

@Module({
  controllers: [ShortUrlController],
  providers: [ShortUrlService],
  exports: [ShortUrlService],
})
export class ShortUrlModule {}
