import {
  Controller,
  Post,
  Get,
  Body,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  DigsigService,
  SignResultResponse,
  SignInternalResultResponse,
} from '../services';
import {
  SignNotaDinasDto,
  SignSuratDinasInternalDto,
  SignSuratDinasEksternalDto,
  SignInternalDto,
  CreateDigsigDto,
} from '../dto';

@Controller('digsig')
export class DigsigController {
  constructor(private readonly digsigService: DigsigService) {}

  // ============================================
  // SIGN DENGAN DIGSIG (BSrE) - Coming Soon
  // ============================================

  @Post('sign')
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() CreateDigsigDto: CreateDigsigDto) {
    const filename = '1767861265056-1767779306136-nd-030-goo1-ops.02-xii-2025-1767779306135.pdf';
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
      no_wa: '',
    });
    return digsig;
  }

  /**
   * POST /digsig/sign-nota-dinas/:id
   * Tandatangani Nota Dinas dengan Digsig (BSrE)
   * @deprecated Sementara tidak digunakan, gunakan endpoint internal
   */
  @Post('sign-nota-dinas/:id')
  @HttpCode(HttpStatus.OK)
  async signNotaDinas(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SignNotaDinasDto,
  ): Promise<SignResultResponse> {
    return this.digsigService.signNotaDinas(id, dto);
  }

  /**
   * POST /digsig/sign-surat-internal/:id
   * Tandatangani Surat Dinas Internal dengan Digsig (BSrE)
   * @deprecated Sementara tidak digunakan, gunakan endpoint internal
   */
  @Post('sign-surat-internal/:id')
  @HttpCode(HttpStatus.OK)
  async signSuratDinasInternal(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SignSuratDinasInternalDto,
  ): Promise<SignResultResponse> {
    return this.digsigService.signSuratDinasInternal(id, dto);
  }

  /**
   * POST /digsig/sign-surat-eksternal/:id
   * Tandatangani Surat Dinas Eksternal dengan Digsig (BSrE)
   * @deprecated Sementara tidak digunakan, gunakan endpoint internal
   */
  @Post('sign-surat-eksternal/:id')
  @HttpCode(HttpStatus.OK)
  async signSuratDinasEksternal(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SignSuratDinasEksternalDto,
  ): Promise<SignResultResponse> {
    return this.digsigService.signSuratDinasEksternal(id, dto);
  }

  // ============================================
  // SIGN INTERNAL (Tanpa BSrE) - Untuk Testing
  // ============================================

  /**
   * POST /digsig/internal/nota-dinas/:idNaskah
   * Tandatangani Nota Dinas dengan Internal (tanpa BSrE)
   * Passphrase default: 12345
   */
  @Post('internal/nota-dinas/:idNaskah')
  @HttpCode(HttpStatus.OK)
  async signNotaDinasInternal(
    @Param('idNaskah', ParseUUIDPipe) idNaskah: string,
    @Body() dto: SignInternalDto,
  ): Promise<SignInternalResultResponse> {
    return this.digsigService.signNotaDinasInternal(idNaskah, dto);
  }

  /**
   * POST /digsig/internal/surat-internal/:idNaskah
   * Tandatangani Surat Dinas Internal dengan Internal (tanpa BSrE)
   * Passphrase default: 12345
   */
  @Post('internal/surat-internal/:idNaskah')
  @HttpCode(HttpStatus.OK)
  async signSdiInternal(
    @Param('idNaskah', ParseUUIDPipe) idNaskah: string,
    @Body() dto: SignInternalDto,
  ): Promise<SignInternalResultResponse> {
    return this.digsigService.signSdiInternal(idNaskah, dto);
  }

  /**
   * POST /digsig/internal/surat-eksternal/:idNaskah
   * Tandatangani Surat Dinas Eksternal dengan Internal (tanpa BSrE)
   * Passphrase default: 12345
   */
  @Post('internal/surat-eksternal/:idNaskah')
  @HttpCode(HttpStatus.OK)
  async signSdeInternal(
    @Param('idNaskah', ParseUUIDPipe) idNaskah: string,
    @Body() dto: SignInternalDto,
  ): Promise<SignInternalResultResponse> {
    return this.digsigService.signSdeInternal(idNaskah, dto);
  }

  @Get('ktp')
  @HttpCode(HttpStatus.CREATED)
  async getktp(@Body() CreateDigsigDto: CreateDigsigDto) {
    const digsig = await this.digsigService.getKTPUser({
      persnum: '10013173',
    });
    return digsig;
  }
}
