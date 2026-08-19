import {
  Controller, Get, Post, Put, Delete, Body, Param, Query, Res, UploadedFile, UseInterceptors, UseGuards,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { NaskahLainnyaService } from '../services/naskah-lainnya.service';
import type { CurrentUser as CurrentUserType } from '../services/naskah-lainnya.service';
import {
  BuatNaskahDto, UpdateNaskahDto, ApprovalActionDto, EvaluasiDto, BlankoDto, TandaTanganDto,
  KirimApprovalLegalDto,
} from '../dto/index.dto';
import { CurrentUser } from '../../../common/decorators';
import { JwtAuthGuard } from '../../../common/guards';
import { NaskahLainnyaAccessGuard } from '../../../common/guards/naskah-lainnya-access.guard';

@UseGuards(JwtAuthGuard, NaskahLainnyaAccessGuard)
@Controller('naskah-lainnya')
export class NaskahLainnyaController {
  constructor(private readonly service: NaskahLainnyaService) {}

  @Get()
  getList(@Query() q: any, @CurrentUser() user: CurrentUserType) {
    return this.service.getList(q, user);
  }

  @Post()
  create(@Body() dto: BuatNaskahDto, @CurrentUser() user: CurrentUserType) {
    return this.service.createDraft(dto, user);
  }

  @Get('persetujuan')
  getPersetujuan(@Query('status') status: string, @CurrentUser() user: CurrentUserType) {
    return this.service.getPersetujuan(user, status);
  }

  @Get('legal-drafting')
  getLegalDrafting(@Query('status') status: string, @CurrentUser() user: CurrentUserType) {
    return this.service.getLegalDrafting(user, status);
  }

  @Get('template/:jenis')
  getTemplate(@Param('jenis') jenis: string) {
    return this.service.getTemplateUrl(jenis);
  }

  @Get('template-signers/:jenis')
  getTemplateSigners(@Param('jenis') jenis: string) {
    return this.service.getTemplateSigners(jenis);
  }

  @Get(':id')
  getDetail(@Param('id') id: string, @CurrentUser() user: CurrentUserType) {
    return this.service.getDetail(id, user);
  }

  @Get(':id/riwayat')
  getRiwayat(@Param('id') id: string) {
    return this.service.getRiwayat(id);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateNaskahDto) {
    return this.service.updateDraft(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.deleteDraft(id);
  }

  @Post(':id/kirim')
  kirim(@Param('id') id: string, @CurrentUser() user: CurrentUserType) {
    return this.service.kirim(id, user);
  }

  @Post(':id/dokumen')
  @UseInterceptors(FileInterceptor('file'))
  upload(@Param('id') id: string, @UploadedFile() file: Express.Multer.File, @CurrentUser() user: CurrentUserType) {
    return this.service.uploadDokumen(id, file, user);
  }

  @Get(':id/file')
  async downloadFile(@Param('id') id: string, @Res() res: Response) {
    const { buffer, mimetype } = await this.service.downloadFile(id);
    res.setHeader('Content-Type', mimetype);
    res.setHeader('Content-Disposition', 'inline');
    res.send(buffer);
  }

  // ---------- Dokumen Pendukung / Naskah Fisik ----------

  @Post(':id/dokumen/:tipe')
  @UseInterceptors(FileInterceptor('file'))
  uploadDokumenTambahan(
    @Param('id') id: string,
    @Param('tipe') tipe: 'naskah_fisik' | 'pendukung',
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.service.uploadDokumenTambahan(id, tipe, file);
  }

  @Delete(':id/dokumen/:dokumenId')
  deleteDokumenTambahan(@Param('id') id: string, @Param('dokumenId') dokumenId: string) {
    return this.service.deleteDokumenTambahan(id, dokumenId);
  }

  @Get(':id/dokumen/:dokumenId/download')
  async downloadDokumenTambahan(@Param('id') id: string, @Param('dokumenId') dokumenId: string, @Res() res: Response) {
    const { buffer, mimetype, nama } = await this.service.downloadDokumenTambahan(id, dokumenId);
    res.setHeader('Content-Type', mimetype);
    res.setHeader('Content-Disposition', `attachment; filename="${nama}"`);
    res.send(buffer);
  }

  @Post(':id/approval/:approvalId/setuju')
  setuju(@Param('id') id: string, @Param('approvalId') approvalId: string, @Body() dto: ApprovalActionDto, @CurrentUser() user: CurrentUserType) {
    return this.service.setuju(id, approvalId, dto.catatan, user);
  }

  @Post(':id/approval/:approvalId/tolak')
  tolak(@Param('id') id: string, @Param('approvalId') approvalId: string, @Body() dto: ApprovalActionDto, @CurrentUser() user: CurrentUserType) {
    return this.service.tolak(id, approvalId, dto.catatan ?? '', user);
  }

  @Post(':id/approval/:approvalId/kembalikan')
  kembalikan(@Param('id') id: string, @Param('approvalId') approvalId: string, @Body() dto: ApprovalActionDto, @CurrentUser() user: CurrentUserType) {
    return this.service.kembalikan(id, approvalId, dto.catatan ?? '', user);
  }

  @Post(':id/legal-drafting/mulai')
  mulaiLegal(@Param('id') id: string) {
    // P0: legal drafting dimulai otomatis saat tahap masuk legal_drafting.
    return { success: true, data: { id } };
  }

  @Post(':id/legal-drafting/kirim-approval')
  kirimApprovalLegal(@Param('id') id: string, @Body() dto: KirimApprovalLegalDto, @CurrentUser() user: CurrentUserType) {
    return this.service.kirimApprovalLegal(id, dto.approval, user);
  }

  @Post(':id/legal-drafting/kembalikan')
  kembalikanLegal(@Param('id') id: string, @Body() dto: { catatan: string }, @CurrentUser() user: CurrentUserType) {
    return this.service.kembalikanLegal(id, dto.catatan, user);
  }

  @Post(':id/evaluasi')
  evaluasi(@Param('id') id: string, @Body() dto: EvaluasiDto, @CurrentUser() user: CurrentUserType) {
    return this.service.evaluasi(id, dto, user);
  }

  @Post(':id/blanko-verbal')
  simpanBlanko(@Param('id') id: string, @Body() dto: BlankoDto, @CurrentUser() user: CurrentUserType) {
    return this.service.simpanBlanko(id, dto, user);
  }

  @Post(':id/blanko-verbal/kirim-approval')
  kirimApprovalBlanko(@Param('id') id: string, @CurrentUser() user: CurrentUserType) {
    return this.service.kirimApprovalBlanko(id, user);
  }

  @Post(':id/tanda-tangan')
  tandaTangan(@Param('id') id: string, @Body() dto: TandaTanganDto, @CurrentUser() user: CurrentUserType) {
    return this.service.tandaTangan(id, dto.passphrase, user);
  }

  @Post(':id/unggah-ttd-fisik')
  @UseInterceptors(FileInterceptor('file'))
  unggahTtdFisik(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.service.unggahTtdFisik(id, file, user);
  }
}
