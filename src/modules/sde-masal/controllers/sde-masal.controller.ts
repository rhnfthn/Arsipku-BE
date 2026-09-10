import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  Res,
  UseInterceptors,
  UseGuards,
  HttpStatus,
  HttpException,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { AnyFilesInterceptor, FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import type { Response } from 'express';
import { SdeMasalService } from '../services/sde-masal.service';
import { UpdateSdeMasalDto } from '../dto/update-sde-masal.dto';
import { SdeMasalFilterDto } from '../dto/sde-masal-filter.dto';
import { JwtAuthGuard } from '../../../common/guards';
import { CurrentUser } from '../../../common/decorators';
import { SuratDinasEksternalService } from '../../surat-dinas-eksternal/services/surat-dinas-eksternal.service';
import { CreateSdeMasalFolderDto } from '../dto/create-sde-masal-folder.dto';

/** 
 * Endpoint:
 * - POST   /sde-masal/folder                — buat folder
 * - PATCH  /sde-masal/folder/:folderId      — update folder
 * - GET    /sde-masal/folders               — daftar folder
 * - GET    /sde-masal/folder/:folderId/naskah — daftar naskah dalam folder
 * - POST   /sde-masal/generate              — parse Excel → insert sde_masal
 * - POST   /sde-masal/finalize              — langsung kirim (pembuat = penandatangan)
 * - POST   /sde-masal/submit-verification   — submit ke verifikator
 * - GET    /sde-masal/verification          — list verifikasi untuk user
 * - PATCH  /sde-masal/:id/approve-verification
 * - PATCH  /sde-masal/:id/reject-verification
 * - POST   /sde-masal/preview-pdf           — preview PDF surat
 * - GET    /sde-masal/template              — download template Excel
 * - GET    /sde-masal/naskah/:naskahId      — detail naskah SDE individual
 * - GET    /sde-masal                       — list item dengan filter
 * - GET    /sde-masal/summary               — ringkasan dashboard
 * - GET    /sde-masal/:id                   — detail item
 * - PATCH  /sde-masal/:id                   — update item
 * - DELETE /sde-masal/:id                   — hapus item
 */
@ApiTags('SDE Masal')
@ApiBearerAuth()
@Controller('sde-masal')
@UseGuards(JwtAuthGuard)
export class SdeMasalController {
  constructor(
    private readonly sdeMasalService: SdeMasalService,
    private readonly sdeService: SuratDinasEksternalService,
  ) {}

  @Post('folder')
  async createFolder(
    @Body() dto: CreateSdeMasalFolderDto,
    @CurrentUser() user: any,
  ) {
    // Scope per-akun: catat position ID pembuat folder
    dto.createdBy =
      String(user?.position ?? user?.positionId ?? '') || dto.createdBy;
    const data = await this.sdeMasalService.createFolder(
      dto,
      user?.position ?? user?.positionId,
    );
    return { success: true, data };
  }

  @Patch('folder/:folderId')
  async updateFolder(
    @Param('folderId') folderId: string,
    @Body() dto: Partial<CreateSdeMasalFolderDto>,
    @CurrentUser() user: any,
  ) {
    const data = await this.sdeMasalService.updateFolder(
      folderId,
      dto,
      user?.position ?? user?.positionId,
    );
    return { success: true, data };
  }

  @Post('parent/:parentNaskahId/sync-follow-up')
  async syncDispositionFollowUp(
    @Param('parentNaskahId') parentNaskahId: string,
    @CurrentUser() user: any,
  ) {
    const positionId = String(user?.position ?? user?.positionId ?? '');
    const data = await this.sdeMasalService.syncDispositionFollowUp(
      parentNaskahId,
      positionId,
    );
    return { success: true, data };
  }

  @Get('folders')
  async findFolders(@Query() filter: any, @CurrentUser() user: any) {
    // Scope per-akun: hanya folder milik pengirim (position user) atau
    // folder dimana user adalah penerima/tembusan.
    const positionId = String(user?.position ?? user?.positionId ?? '');
    const result = await this.sdeMasalService.findFolders(filter, positionId);
    return { success: true, ...result };
  }

  @Get('folder/:folderId/naskah')
  async findNaskahInFolder(
    @Param('folderId') folderId: string,
    @CurrentUser() user: any,
  ) {
    const positionId = String(user?.position ?? user?.positionId ?? '');
    const persnum = String(user?.persnum ?? '');
    const data = await this.sdeMasalService.findNaskahInFolder(
      folderId,
      positionId,
      persnum,
    );
    return { success: true, data };
  }

  @Post('finalize')
  async finalizeDirect(
    @Body()
    body: {
      folderId: string;
      penerimaList: any[];
      signOption: 'digsig' | 'qr_only' | 'ttd_basah';
      passphrase?: string;
      itemIds?: string[];
    },
    @CurrentUser() user: any,
  ) {
    const data = await this.sdeMasalService.finalizeDirect(
      body.folderId,
      body.penerimaList,
      body.signOption,
      body.passphrase,
      user?.position ?? user?.positionId,
      user?.persnum ? Number(user.persnum) : undefined,
      body.itemIds,
    );
    return {
      success: true,
      data,
      message: `${data.success} naskah berhasil difinalisasi, ${data.failed} gagal.`,
    };
  }

  @Post('folder/:folderId/reject')
  async rejectFolder(
    @Param('folderId') folderId: string,
    @Body() body: { reason?: string },
    @CurrentUser() user: any,
  ) {
    const data = await this.sdeMasalService.rejectFolder(
      folderId,
      user?.position ?? user?.positionId,
      body?.reason,
    );
    return { success: true, data, message: 'SDE Massal dikembalikan ke konseptor' };
  }

  @Post('folder/:folderId/lampiran-masal/prepare')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 50 * 1024 * 1024 } }),
  )
  async prepareMassAttachments(
    @Param('folderId') folderId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('requestedFileNames') requestedFileNames: string | string[],
    @CurrentUser() user: any,
  ) {
    let names: string[] = [];
    if (Array.isArray(requestedFileNames)) names = requestedFileNames;
    else if (requestedFileNames) {
      try {
        names = JSON.parse(requestedFileNames);
      } catch {
        throw new BadRequestException('Daftar nama lampiran tidak valid');
      }
    }
    if (!Array.isArray(names)) {
      throw new BadRequestException('Daftar nama lampiran tidak valid');
    }
    const data = await this.sdeMasalService.prepareMassAttachments(
      folderId,
      file,
      names,
      user?.position ?? user?.positionId,
    );
    return { success: true, data };
  }

  @Post('folder/:folderId/lampiran-masal/commit')
  async commitMassAttachments(
    @Param('folderId') folderId: string,
    @Body() body: { items: Array<{ itemId: string; attachments: any[] }> },
    @CurrentUser() user: any,
  ) {
    const data = await this.sdeMasalService.commitMassAttachments(
      folderId,
      body?.items || [],
      user?.position ?? user?.positionId,
    );
    return { success: true, data };
  }

  /**
   * POST /sde-masal/:id/retry — kirim ulang naskah yang gagal (status GAGAL).
   * Hanya penandatangan folder yang boleh mengirim ulang.
   */
  @Post(':id/retry')
  async retryNaskah(@Param('id') id: string, @CurrentUser() user: any) {
    const data = await this.sdeMasalService.retryNaskah(
      id,
      user?.position ?? user?.positionId,
      user?.persnum ? Number(user.persnum) : undefined,
    );
    return {
      success: true,
      data,
      message: 'Naskah berhasil dikirim ulang',
    };
  }

  /**
   * POST /sde-masal/:id/lampiran — upload lampiran per item (pdf/zip).
   */
  @Post(':id/lampiran')
  @UseInterceptors(FileInterceptor('file'))
  async uploadLampiran(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const data = await this.sdeMasalService.uploadLampiran(id, file);
    return { success: true, data };
  }

  /**
   * GET /sde-masal/:id/lampiran — download lampiran per item.
   */
  @Get(':id/lampiran')
  async downloadLampiran(@Param('id') id: string, @Res() res: Response) {
    const { buffer, mimetype, filename } =
      await this.sdeMasalService.downloadLampiran(id);
    res.set({
      'Content-Type': mimetype,
      'Content-Disposition': `inline; filename="${filename}"`,
    });
    return res.send(buffer);
  }

  @Get(':id/lampiran/:index')
  async downloadMassAttachment(
    @Param('id') id: string,
    @Param('index') index: string,
    @Res() res: Response,
    @CurrentUser() user: any,
  ) {
    const attachmentIndex = Number(index);
    if (!Number.isInteger(attachmentIndex) || attachmentIndex < 0) {
      throw new BadRequestException('Index lampiran tidak valid');
    }
    const { buffer, mimetype, filename } =
      await this.sdeMasalService.downloadMassAttachment(
        id,
        attachmentIndex,
        user?.position ?? user?.positionId,
        user?.persnum,
      );
    res.set({
      'Content-Type': mimetype,
      'Content-Disposition': `inline; filename="${filename}"`,
    });
    return res.send(buffer);
  }

  /**
   * POST /sde-masal/generate — generate massal dari data wizard.
   * Body: { folderId, konsep, penerimaList, template }
   * Hanya insert record sde_masal (folderId + recipientData). Naskah dibuat saat finalize.
   */
  @Post('generate')
  async generateMassal(@Body() body: any, @CurrentUser() user: any) {
    // Scope per-akun: catat position ID pembuat item
    body.createdBy =
      String(user?.position ?? user?.positionId ?? '') || body.createdBy;
    const result = await this.sdeMasalService.generateMassal(
      body,
      user?.position ?? user?.positionId,
    );
    return { success: true, data: result };
  }

  @Post('submit-verification')
  async submitVerification(
    @Body() body: { ids: string[]; verifikators?: any[]; folderId?: string; sendToSigner?: boolean },
    @CurrentUser() user: any,
  ) {
    if (body?.sendToSigner && body?.folderId) {
      const data = await this.sdeMasalService.sendFolderToSigner(
        body.folderId,
        user?.position ?? user?.positionId,
      );
      return { success: true, data, message: 'SDE Massal berhasil dikirim ke pengirim' };
    }
    const result = await this.sdeMasalService.submitVerification(
      body?.ids,
      body?.verifikators || [],
      user?.position ?? user?.positionId,
    );
    return {
      success: true,
      data: result,
      message: `${result.total} SDE Massal berhasil diajukan ke verifikator.`,
    };
  }

  @Get('verification')
  async findVerification(@CurrentUser() user: any) {
    const data = await this.sdeMasalService.findVerificationForUser(user);
    return { success: true, data };
  }

  /**
   * GET /sde-masal/verification-folders — daftar folder yang perlu diverifikasi
   * oleh user (verifikator). Dipakai halaman verifikasi agar tampil per folder.
   */
  @Get('verification-folders')
  async findVerificationFolders(@CurrentUser() user: any) {
    const data =
      await this.sdeMasalService.findVerificationFoldersForUser(user);
    return { success: true, data };
  }

  @Patch(':id/approve-verification')
  async approveVerification(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body() body: { catatan?: string },
  ) {
    const data = await this.sdeMasalService.approveVerification(
      id,
      user,
      body?.catatan,
    );
    return { success: true, data, message: 'SDE Massal berhasil diverifikasi' };
  }

  @Patch('folder/:folderId/approve-verification')
  async approveFolderVerification(
    @Param('folderId') folderId: string,
    @CurrentUser() user: any,
    @Body() body: { catatan?: string },
  ) {
    const data = await this.sdeMasalService.approveFolderVerification(
      folderId,
      user,
      body?.catatan,
    );
    return { success: true, data, message: 'Folder SDE Massal berhasil diverifikasi' };
  }

  @Patch('folder/:folderId/reject-verification')
  async rejectFolderVerification(
    @Param('folderId') folderId: string,
    @CurrentUser() user: any,
    @Body() body: { catatan?: string },
  ) {
    const data = await this.sdeMasalService.rejectFolderVerification(
      folderId,
      user,
      body?.catatan,
    );
    return { success: true, data, message: 'Folder SDE Massal ditolak' };
  }

  @Patch(':id/reject-verification')
  async rejectVerification(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body() body: { catatan?: string },
  ) {
    const data = await this.sdeMasalService.rejectVerification(
      id,
      user,
      body?.catatan,
    );
    return { success: true, data, message: 'SDE Massal ditolak' };
  }

  /**
   * POST /sde-masal/preview-pdf — generate preview PDF surat SDE Masal.
   * Hanya butuh JWT (tanpa permission naskah-dinas) agar semua user BOD
   * yang bisa mengakses wizard SDE Masal dapat melihat preview.
   * Body (multipart/form-data): htmlContent, perihal, sifat, penerima (JSON array),
   * tembusan (JSON array), nama_tempat, tgl.
   */
  @Post('preview-pdf')
  @UseInterceptors(AnyFilesInterceptor())
  async previewPdf(
    @Body() body: any,
    @CurrentUser() user: any,
    @Res() res: Response,
  ) {
    try {
      if (!body?.htmlContent) {
        return res.status(HttpStatus.BAD_REQUEST).json({
          success: false,
          message: ['htmlContent harus diisi'],
        });
      }

      let penerimaArray = body.tertuju || body.penerima || [];
      if (typeof penerimaArray === 'string') {
        try {
          penerimaArray = JSON.parse(penerimaArray);
        } catch {
          penerimaArray = [penerimaArray];
        }
      }

      let tembusanArray = body.tembusan || [];
      if (typeof tembusanArray === 'string') {
        try {
          tembusanArray = JSON.parse(tembusanArray);
        } catch {
          tembusanArray = [tembusanArray];
        }
      }

      // Resolve tembusan_eksternal + tembusan_internal menjadi array nama
      // (urutan: eksternal dulu, lalu internal) untuk di-hardcode di kanvas PDF.
      const tembusanEksternal =
        body.tembusan_eksternal || body.tembusanEksternal || '';
      const tembusanInternal =
        body.tembusan_internal || body.tembusanInternal || '';
      // Fallback: tembusan lama (array dari body.tembusan) dipakai sebagai
      // eksternal bila kolom baru tidak diisi (kompatibel Excel lama).
      const legacyTembusan = Array.isArray(tembusanArray)
        ? tembusanArray.filter(Boolean).join(',')
        : String(tembusanArray || '');

      // Resolve nama untuk {{tembusan_internal}} dan {{tembusan_eksternal}}
      // secara terpisah. Masing-masing di-resolve ke list bernomor.
      const [internalNames, externalNames] = await Promise.all([
        this.sdeMasalService.resolveTembusanForPreview(
          '',
          tembusanInternal || legacyTembusan,
          body.tgl || body.tanggal,
        ),
        this.sdeMasalService.resolveTembusanForPreview(
          tembusanEksternal || legacyTembusan,
          '',
          body.tgl || body.tanggal,
        ),
      ]);

      // Gabungan untuk blok "Tembusan Yth:" di kanvas PDF (eksternal dulu).
      tembusanArray = [...externalNames, ...internalNames];

      let lampiranDirectRefs: Array<{ fileName: string; key: string }> = [];
      if (body.lampiran_direct_refs) {
        try {
          const parsed = typeof body.lampiran_direct_refs === 'string'
            ? JSON.parse(body.lampiran_direct_refs)
            : body.lampiran_direct_refs;
          if (Array.isArray(parsed)) {
            lampiranDirectRefs = parsed
              .filter((ref) => ref?.fileName && ref?.key)
              .map((ref) => ({ fileName: String(ref.fileName), key: String(ref.key) }));
          }
        } catch {
          return res.status(HttpStatus.BAD_REQUEST).json({
            success: false,
            message: ['Referensi lampiran tidak valid'],
          });
        }
      }

      const headerInfo = await this.sdeService.getHeaderInfoByUser(
        {
          company: user?.company,
          area: user?.area,
          subArea: user?.subArea,
        },
        body.tgl || body.tanggal,
      );

      // Replace placeholder tembusan di htmlContent:
      // {{tembusan_internal}} → list bernomor nama internal
      // {{tembusan_eksternal}} → list bernomor nama eksternal
      // {{tembusan}} → gabungan (eksternal dulu, lalu internal)
      let htmlContent = body.htmlContent || '';
      const buildNumberedList = (names: string[]): string =>
        names.length > 0
          ? names.map((nama, idx) => `${idx + 1}. ${nama}`).join('<br>')
          : '';
      const allNames = [...externalNames, ...internalNames];
      htmlContent = htmlContent
        .replace(/\{\{tembusan_internal\}\}/g, buildNumberedList(internalNames))
        .replace(
          /\{\{tembusan_eksternal\}\}/g,
          buildNumberedList(externalNames),
        )
        .replace(/\{\{tembusan\}\}/g, buildNumberedList(allNames));

      const pdfBuffer = await this.sdeService.generatePdfFromHtml(
        htmlContent,
        penerimaArray,
        headerInfo?.kota || body.nama_tempat || 'Tangerang',
        body.tanggal || body.tgl || '',
        body.nama_jabatan || user?.positionText || '',
        body.nama_lengkap || user?.nama || '',
        tembusanArray,
        [],
        body.perihal || '',
        body.sifat || 'Biasa',
        body.nomor || '',
        body.lampiran || '-',
        headerInfo || undefined,
        body.english === true || body.english === 'true',
        body.atas_nama || '',
        lampiranDirectRefs,
      );

      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="preview-sde-masal.pdf"`,
        'Content-Length': pdfBuffer.length,
      });
      return res.status(HttpStatus.OK).send(pdfBuffer);
    } catch (error) {
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: 'Gagal generate preview PDF',
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * GET /sde-masal/template — download template Excel.
   * Query param `skema` untuk memilih skema template (default / KEUANGAN).
   */
  @Get('template')
  async downloadTemplate(
    @Query('skema') skema: string | undefined,
    @Res() res: Response,
  ) {
    const normalizedSkema =
      skema?.toUpperCase() === 'KEUANGAN' ? 'KEUANGAN' : 'UMUM';
    const buf = await this.sdeMasalService.generateTemplate(normalizedSkema);
    const filename = `template-sde-masal-${normalizedSkema.toLowerCase()}.xlsx`;
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buf);
  }

  /**
   * GET /sde-masal/naskah/:naskahId — detail naskah SDE individual by naskahId.
   * Mengembalikan data naskah + sirkulasi lengkap untuk ditampilkan di detail.
   */
  @Get('naskah/:naskahId')
  async findNaskahDetail(
    @Param('naskahId') naskahId: string,
    @CurrentUser() user: any,
  ) {
    const data = await this.sdeMasalService.findNaskahDetail(
      naskahId,
      user?.position ?? user?.positionId,
      user?.persnum,
    );
    if (!data) {
      return { success: false, message: 'Naskah tidak ditemukan', data: null };
    }
    return { success: true, data };
  }

  /**
   * GET /sde-masal/naskah/:naskahId/preview-pdf — generate ulang preview
   * naskah SDE Massal dari data Excel penerima.
   *
   * PDF final lama tidak diubah. Endpoint ini dipakai agar preview/print dari
   * Terkirim tetap menampilkan seluruh placeholder, termasuk nama dan alamat,
   * meskipun PDF historis dibuat sebelum data Excel dinormalisasi.
   */
  @Get('naskah/:naskahId/preview-pdf')
  async previewSentNaskah(
    @Param('naskahId') naskahId: string,
    @CurrentUser() user: any,
    @Res() res: Response,
  ) {
    try {
      const pdf = await this.sdeMasalService.generateSentNaskahPreviewPdf(
        naskahId,
        user,
      );
      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="preview-sde-masal-${naskahId}.pdf"`,
        'Content-Length': pdf.length,
      });
      return res.status(HttpStatus.OK).send(pdf);
    } catch (error) {
      const status =
        error instanceof HttpException
          ? error.getStatus()
          : HttpStatus.INTERNAL_SERVER_ERROR;
      return res.status(status).json({
        success: false,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * GET /sde-masal — list item dengan filter dan pagination.
   */
  @Get()
  async findAll(@Query() filter: SdeMasalFilterDto) {
    const result = await this.sdeMasalService.findAll(filter);
    return { success: true, ...result };
  }

  /**
   * GET /sde-masal/summary — ringkasan dashboard.
   */
  @Get('summary')
  async getSummary() {
    const data = await this.sdeMasalService.getSummary();
    return { success: true, data };
  }

  /**
   * GET /sde-masal/:id — detail item.
   */
  @Get(':id')
  async findOne(@Param('id') id: string) {
    const data = await this.sdeMasalService.findOne(id);
    if (!data) {
      return { success: false, message: 'Data tidak ditemukan', data: null };
    }
    return { success: true, data };
  }

  /**
   * PATCH /sde-masal/:id — update item.
   */
  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateSdeMasalDto) {
    const data = await this.sdeMasalService.update(id, dto);
    if (!data) {
      return { success: false, message: 'Data tidak ditemukan', data: null };
    }
    return { success: true, data };
  }

  /**
   * DELETE /sde-masal/:id — hapus item.
   */
  @Delete(':id')
  async remove(@Param('id') id: string) {
    const ok = await this.sdeMasalService.remove(id);
    if (!ok) {
      return { success: false, message: 'Data tidak ditemukan' };
    }
    return { success: true, message: 'Data berhasil dihapus' };
  }
}
