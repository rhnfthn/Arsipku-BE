import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Res,
  UploadedFile,
  UploadedFiles,
  UseInterceptors,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  FileFieldsInterceptor,
  FileInterceptor,
} from '@nestjs/platform-express';
import type { Response } from 'express';
import { NaskahLainnyaService } from '../services/naskah-lainnya.service';
import type { CurrentUser as CurrentUserType } from '../services/naskah-lainnya.service';
import {
  BuatNaskahDto,
  UpdateNaskahDto,
  ApprovalActionDto,
  EvaluasiDto,
  KirimEvaluasiDto,
  KeputusanEvaluasiDto,
  TeruskanPersetujuanDto,
  BlankoDto,
  TandaTanganDto,
  KirimApprovalLegalDto,
  ManualFinalStatusDto,
  ManualFinalNomorDto,
  UpdatePenandatanganFisikDto,
  SheetDataDto,
  AssignDelegasiDireksiDto,
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
  getPersetujuan(
    @Query('status') status: string,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.service.getPersetujuan(user, status);
  }

  @Get('legal-drafting')
  getLegalDrafting(
    @Query('status') status: string,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.service.getLegalDrafting(user, status);
  }

  @Get('template/:jenis')
  getTemplate(
    @Param('jenis') jenis: string,
    @Query('signOption') signOption?: string,
  ) {
    return this.service.getTemplateUrl(jenis, signOption);
  }

  @Get('template-signers/:jenis')
  getTemplateSigners(
    @Param('jenis') jenis: string,
    @Query('signOption') signOption?: string,
  ) {
    return this.service.getTemplateSigners(jenis, signOption);
  }

  /** Baca parameter docx (perihal/tanggal) tanpa persist — untuk auto-fill
   *  perihal di halaman tulis sebelum naskah benar-benar dikirim. */
  @Post('parse-docx')
  @UseInterceptors(FileInterceptor('file'))
  parseDocx(@UploadedFile() file: Express.Multer.File) {
    return this.service.parseDokumen(file);
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
  upload(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.service.uploadDokumen(id, file, user);
  }

  @Post(':id/dokumen/revisi')
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'docx', maxCount: 1 },
      { name: 'pdf', maxCount: 1 },
    ]),
  )
  uploadRevisi(
    @Param('id') id: string,
    @UploadedFiles()
    files: { docx?: Express.Multer.File[]; pdf?: Express.Multer.File[] },
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.service.uploadRevisiDokumen(
      id,
      files?.docx?.[0],
      files?.pdf?.[0],
      user,
    );
  }

  @Get(':id/file')
  async downloadFile(
    @Param('id') id: string,
    @Query('preview') preview: string,
    @Res() res: Response,
  ) {
    const { buffer, mimetype } = await this.service.downloadFile(
      id,
      preview === '1',
    );
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
  deleteDokumenTambahan(
    @Param('id') id: string,
    @Param('dokumenId') dokumenId: string,
  ) {
    return this.service.deleteDokumenTambahan(id, dokumenId);
  }

  @Get(':id/dokumen/:dokumenId/download')
  async downloadDokumenTambahan(
    @Param('id') id: string,
    @Param('dokumenId') dokumenId: string,
    @Query('inline') inline: string,
    @Res() res: Response,
  ) {
    const { buffer, mimetype, nama } =
      await this.service.downloadDokumenTambahan(id, dokumenId, inline === '1');
    res.setHeader('Content-Type', mimetype);
    const disposition = inline === '1' ? 'inline' : 'attachment';
    res.setHeader('Content-Disposition', `${disposition}; filename="${nama}"`);
    res.send(buffer);
  }

  @Post(':id/approval/:approvalId/setuju')
  setuju(
    @Param('id') id: string,
    @Param('approvalId') approvalId: string,
    @Body() dto: ApprovalActionDto,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.service.setuju(id, approvalId, dto.catatan, user);
  }

  @Post(':id/approval/:approvalId/tolak')
  tolak(
    @Param('id') id: string,
    @Param('approvalId') approvalId: string,
    @Body() dto: ApprovalActionDto,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.service.tolak(id, approvalId, dto.catatan ?? '', user);
  }

  @Post(':id/approval/:approvalId/kembalikan')
  kembalikan(
    @Param('id') id: string,
    @Param('approvalId') approvalId: string,
    @Body() dto: ApprovalActionDto,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.service.kembalikan(id, approvalId, dto.catatan ?? '', user);
  }

  @Post(':id/legal-drafting/mulai')
  mulaiLegal(@Param('id') id: string) {
    // P0: legal drafting dimulai otomatis saat tahap masuk legal_drafting.
    return { success: true, data: { id } };
  }

  @Post(':id/legal-drafting/kirim-approval')
  kirimApprovalLegal(
    @Param('id') id: string,
    @Body() dto: KirimApprovalLegalDto,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.service.kirimApprovalLegal(
      id,
      dto.approval,
      user,
      dto.catatan,
      dto.catatan_legal,
    );
  }

  @Post(':id/legal-drafting/kembalikan')
  kembalikanLegal(
    @Param('id') id: string,
    @Body() dto: { catatan: string },
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.service.kembalikanLegal(id, dto.catatan, user);
  }

  @Post(':id/evaluasi')
  evaluasi(
    @Param('id') id: string,
    @Body() dto: EvaluasiDto,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.service.evaluasi(id, dto, user);
  }

  @Post(':id/evaluasi/kirim')
  kirimEvaluasi(
    @Param('id') id: string,
    @Body() dto: KirimEvaluasiDto,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.service.kirimEvaluasi(id, dto, user);
  }

  @Post(':id/evaluasi/keputusan')
  keputusanEvaluasi(
    @Param('id') id: string,
    @Body() dto: KeputusanEvaluasiDto,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.service.keputusanEvaluasi(id, dto, user);
  }

  @Get(':id/persetujuan-lanjutan/kandidat')
  kandidatPersetujuanLanjutan(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.service.getKandidatPersetujuanLanjutan(id, user);
  }

  @Post(':id/persetujuan-lanjutan/teruskan')
  teruskanPersetujuan(
    @Param('id') id: string,
    @Body() dto: TeruskanPersetujuanDto,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.service.teruskanPersetujuan(id, dto, user);
  }

  @Post(':id/persetujuan-lanjutan/selesai')
  selesaiPersetujuan(
    @Param('id') id: string,
    @Body() dto: ApprovalActionDto,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.service.selesaiPersetujuan(id, dto.catatan, user);
  }

  @Post(':id/evaluasi/kembalikan')
  kembalikanEvaluasi(
    @Param('id') id: string,
    @Body() dto: ApprovalActionDto,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.service.kembalikanEvaluasi(id, dto.catatan, user);
  }

  @Post(':id/blanko-verbal')
  simpanBlanko(
    @Param('id') id: string,
    @Body() dto: BlankoDto,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.service.simpanBlanko(id, dto, user);
  }

  @Post(':id/blanko-verbal/kirim-approval')
  kirimApprovalBlanko(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.service.kirimApprovalBlanko(id, user);
  }

  @Post(':id/tanda-tangan')
  tandaTangan(
    @Param('id') id: string,
    @Body() dto: TandaTanganDto,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.service.tandaTangan(id, dto.passphrase, user);
  }

  @Post(':id/tanda-tangan/tolak')
  tolakTandaTangan(
    @Param('id') id: string,
    @Body() dto: ApprovalActionDto,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.service.tolakTandaTangan(id, dto.catatan, user);
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

  /**
   * Setelah seluruh penandatangan menyetujui Naskah Draft dan nomor terbit,
   * pemrakarsa mengunggah dokumen yang sudah ditandatangani secara fisik.
   */
  @Post(':id/dokumen-final-manual')
  @UseInterceptors(FileInterceptor('file'))
  unggahDokumenFinalManual(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.service.unggahTtdFisik(id, file, user);
  }

  @Put(':id/status-final-manual')
  ubahStatusFinalManual(
    @Param('id') id: string,
    @Body() dto: ManualFinalStatusDto,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.service.ubahStatusFinalManual(id, dto.final, user);
  }

  @Put(':id/nomor-final-manual')
  ubahNomorFinalManual(
    @Param('id') id: string,
    @Body() dto: ManualFinalNomorDto,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.service.ubahNomorFinalManual(id, dto.nomor, user);
  }

  @Put(':id/metadata-penandatangan-fisik')
  updateMetadataPenandatanganFisik(
    @Param('id') id: string,
    @Body() dto: UpdatePenandatanganFisikDto,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.service.updateMetadataPenandatanganFisik(
      id,
      dto.penandatangan,
      user,
    );
  }

  // ---------- Lembar Persetujuan Direksi ----------

  @Post(':id/lembar-persetujuan-direksi/preview')
  previewLembarPersetujuanDireksi(
    @Param('id') id: string,
    @Body() dto: SheetDataDto,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.service.previewLembarPersetujuanDireksi(id, dto, user);
  }

  @Post(':id/lembar-persetujuan-direksi/kirim')
  kirimLembarPersetujuanDireksi(
    @Param('id') id: string,
    @Body() dto: SheetDataDto,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.service.kirimLembarPersetujuanDireksi(id, dto, user);
  }

  @Post(':id/lembar-persetujuan-direksi/paraf')
  parafLembarPersetujuanDireksi(
    @Param('id') id: string,
    @Body() dto: SheetDataDto,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.service.parafLembarPersetujuanDireksi(id, dto, user);
  }

  @Post(':id/lembar-persetujuan-direksi/tolak')
  tolakLembarPersetujuanDireksi(
    @Param('id') id: string,
    @Body() dto: ApprovalActionDto,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.service.tolakLembarPersetujuanDireksi(
      id,
      dto.catatan ?? '',
      user,
    );
  }

  // ---------- Blanko Verbal ----------

  @Post(':id/blanko-verbal/preview')
  previewBlankoVerbal(
    @Param('id') id: string,
    @Body() dto: SheetDataDto,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.service.previewBlankoVerbal(id, dto, user);
  }

  @Post(':id/blanko-verbal/kirim')
  kirimBlankoVerbal(
    @Param('id') id: string,
    @Body() dto: SheetDataDto,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.service.kirimBlankoVerbal(id, dto, user);
  }

  @Post(':id/blanko-verbal/paraf')
  parafBlankoVerbal(
    @Param('id') id: string,
    @Body() dto: SheetDataDto,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.service.parafBlankoVerbal(id, dto, user);
  }

  @Post(':id/blanko-verbal/tolak')
  tolakBlankoVerbal(
    @Param('id') id: string,
    @Body() dto: ApprovalActionDto,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.service.tolakBlankoVerbal(id, dto.catatan ?? '', user);
  }

  @Put(':id/approval/:approvalId/delegasi')
  assignDelegasiDireksi(
    @Param('id') id: string,
    @Param('approvalId') approvalId: string,
    @Body() dto: AssignDelegasiDireksiDto,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.service.assignDelegasiDireksi(id, approvalId, dto, user);
  }

  @Delete(':id/approval/:approvalId/delegasi')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeDelegasiDireksi(
    @Param('id') id: string,
    @Param('approvalId') approvalId: string,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.service.removeDelegasiDireksi(id, approvalId, user);
  }
}
