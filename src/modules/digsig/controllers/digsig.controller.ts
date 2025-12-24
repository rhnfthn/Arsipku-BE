import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { DigsigService } from '../services';
import { CreateDigsigDto, UpdateDigsigDto } from '../dto';

@Controller('digsig')
export class DigsigController {
  constructor(private readonly digsigService: DigsigService) {}

  /**
   * POST /berkas
   * Membuat berkas baru
   */
  @Post('sign')
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() CreateDigsigDto: CreateDigsigDto) {
    const filename = '1765428155683-aturan_penomoran_naskah_dinas.pdf';
    const keypathfile = `/nota-dinas/final/${filename}`;
    const digsig = await this.digsigService.hitDigsigEndpoint({
      key: keypathfile,
      filename: filename,
      nomorDokumen: '001/ABC/KLH.00/XII/2025',
      tanggalDokumen: '2025-12-23',
      klasifikasi: 'Biasa',
      jenisNaskah: 'Nota Dinas',
      perihal: 'Test from New Arsipku',
      nik: '1234567890123452',
      passphrase: 'Bsre2025.#!',
      path_dokumen: 'nota-dinas/digsig/',
      no_wa: '085231953983',
    });
    return digsig;
  }
}
