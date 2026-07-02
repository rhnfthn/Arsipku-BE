import { Controller, Post, Body, Res, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import { GeneratePdfService } from './generate_pdf.service';
import { CreateGeneratePdfDto } from './dto/create-generate_pdf.dto';
import { RequirePermission } from '../../common/decorators';

@Controller('generate-pdf')
export class GeneratePdfController {
  constructor(private readonly pdfService: GeneratePdfService) {}

  @Post()
  @RequirePermission('naskah-dinas', 'read-detail')
  async create(@Body() body: CreateGeneratePdfDto, @Res() res: Response) {
    try {
      const pdfBuffer = await this.pdfService.generatePdf(body);

      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${body.filename || 'document.pdf'}"`,
        'Content-Length': pdfBuffer.length,
      });

      return res.status(HttpStatus.OK).send(pdfBuffer);
    } catch (e) {
      return res
        .status(HttpStatus.INTERNAL_SERVER_ERROR)
        .json({ error: 'Failed to generate PDF', detail: e.message });
    }
  }
}
