import { Module } from '@nestjs/common';
import { GeneratePdfController } from './generate_pdf.controller';
import { GeneratePdfService } from './generate_pdf.service';
import { GeneratePdfNodinService } from './services/generate_pdf_nodin.service';
import { GeneratePdfSudinService } from './services/generate_pdf_sudin.service';
import { GeneratePdfDispoService } from './services/generate_pdf_dispo.service';

@Module({
  controllers: [GeneratePdfController],
  providers: [
    GeneratePdfService,
    GeneratePdfNodinService,
    GeneratePdfSudinService,
    GeneratePdfDispoService,
  ],
  exports: [
    GeneratePdfService,
    GeneratePdfNodinService,
    GeneratePdfSudinService,
    GeneratePdfDispoService,
  ],
})
export class GeneratePdfModule {}
