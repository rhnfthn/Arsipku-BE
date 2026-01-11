import { Module } from '@nestjs/common';
import { GeneratePdfController } from './generate_pdf.controller';
import { GeneratePdfService } from './generate_pdf.service';
import { GeneratePdfNodinService } from './services/generate_pdf_nodin.service';
import { GeneratePdfSudinService } from './services/generate_pdf_sudin.service';
import { GeneratePdfDispoService } from './services/generate_pdf_dispo.service';
import { GeneratePdfKajianService } from './services/generate_pdf_kajian.service';

@Module({
  controllers: [GeneratePdfController],
  providers: [
    GeneratePdfService,
    GeneratePdfNodinService,
    GeneratePdfSudinService,
    GeneratePdfDispoService,
    GeneratePdfKajianService,
  ],
  exports: [
    GeneratePdfService,
    GeneratePdfNodinService,
    GeneratePdfSudinService,
    GeneratePdfDispoService,
    GeneratePdfKajianService,
  ],
})
export class GeneratePdfModule {}
