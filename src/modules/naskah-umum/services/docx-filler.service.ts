import { Injectable } from '@nestjs/common';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';

@Injectable()
export class DocxFillerService {
  /**
   * Fill {{key}} placeholders in a docx template buffer with data.
   * Uses {{ }} delimiters (matching gdocs-service placeholder style).
   */
  fill(
    templateBuffer: Buffer,
    data: Record<string, string | string[]>,
  ): Buffer {
    const zip = new PizZip(templateBuffer);
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      delimiters: { start: '{{', end: '}}' },
    });
    doc.render(data);
    return doc.getZip().generate({ type: 'nodebuffer' });
  }
}
