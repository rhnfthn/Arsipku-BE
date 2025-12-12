import { Module } from '@nestjs/common';
import { GeneratePdfController } from './generate_pdf.controller';
import { GeneratePdfService } from './generate_pdf.service';

@Module({
  controllers: [GeneratePdfController],
  providers: [GeneratePdfService],
  exports: [GeneratePdfService],
})
export class GeneratePdfModule {}
