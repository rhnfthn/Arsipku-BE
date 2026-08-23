import { Module } from '@nestjs/common';
import { GeneratePdfController } from './generate_pdf.controller';
import { GeneratePdfService } from './generate_pdf.service';
import { GeneratePdfNodinService } from './services/generate_pdf_nodin.service';
import { GeneratePdfSudinService } from './services/generate_pdf_sudin.service';
import { GeneratePdfDispoService } from './services/generate_pdf_dispo.service';
import { GeneratePdfKajianService } from './services/generate_pdf_kajian.service';
import { GeneratePdfLpdService } from './services/generate_pdf_lpd.service';
import { GeneratePdfBlankoVerbalService } from './services/generate_pdf_blanko_verbal.service';

@Module({
  controllers: [GeneratePdfController],
  providers: [
    GeneratePdfService,
    GeneratePdfNodinService,
    GeneratePdfSudinService,
    GeneratePdfDispoService,
    GeneratePdfKajianService,
    GeneratePdfLpdService,
    GeneratePdfBlankoVerbalService,
  ],
  exports: [
    GeneratePdfService,
    GeneratePdfNodinService,
    GeneratePdfSudinService,
    GeneratePdfDispoService,
    GeneratePdfKajianService,
    GeneratePdfLpdService,
    GeneratePdfBlankoVerbalService,
  ],
})
export class GeneratePdfModule {}
