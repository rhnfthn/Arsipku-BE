import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { TransferActiveToInactiveService } from '../services/transfer-active-to-inactive.service';
import { CreateTransferDto } from '../dto/transfer.dto';
import {
  ApproveTransferDto,
  RejectTransferDto,
  FinalVerifyTransferDto,
  VerifyPhysicalFilesDto,
  TuApproveDto,
  FinalApprovalTuDto,
} from '../dto/transfer.dto';
import { TransferFilterDto } from '../dto/transfer-filter.dto';
import { JwtAuthGuard, RolesGuard } from '../../../common/guards';
import { CurrentUser, Roles } from '../../../common/decorators';
import { RoleName } from '../../../common/enums';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';

/**
 * Controller API Pemindahan Arsip Aktif ke Inaktif.
 * 2 Unit: Unit Kerja (Sekretaris + Atasan Managerial)
 *   → Unit Tata Naskah (TU + Atasan Managerial TU).
 */
@ApiTags('Transfer Active To Inactive')
@ApiBearerAuth()
@Controller('transfer-active-to-inactive')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TransferActiveToInactiveController {
  constructor(private readonly service: TransferActiveToInactiveService) {}

  @Get('summary')
  async getSummary(@CurrentUser() user: JwtPayload) {
    return { success: true, data: await this.service.getSummary(user) };
  }

  @Get('is-atasan')
  async isAtasan(@CurrentUser() user: JwtPayload) {
    const isAtasan = await this.service.isAtasanManagerial(user);
    return { success: true, data: { isAtasan } };
  }

  /** Daftar arsip tersedia untuk pemindahan (dari Berkas Saya). */
  @Get('arsip-tersedia')
  async getArsipTersedia(@CurrentUser() user: JwtPayload) {
    return { success: true, data: await this.service.getArsipTersedia(user) };
  }

  /** Tabel gabungan: arsip Tertutup belum usulan + usulan sudah dibuat. */
  @Get('gabungan')
  async getGabungan(
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('klasifikasi') klasifikasi?: string,
    @Query('tahun') tahun?: string,
    @CurrentUser() user?: JwtPayload,
  ) {
    return {
      success: true,
      data: await this.service.getGabungan(user, {
        search,
        status,
        klasifikasi,
        tahun,
      }),
    };
  }

  /**
   * Auto-sync: berkas Tertutup dengan retensi aktif habis → buat usulan DRAFT
   * otomatis. Dipanggil dari halaman pemberkasan agar berkas yang retensinya
   * habis langsung muncul di pemindahan arsip sebagai DRAFT.
   */
  @Post('sync-draft')
  async syncDraft(@CurrentUser() _user: JwtPayload) {
    const count = await this.service.syncDraftUsulanOtomatis();
    return { success: true, data: { count } };
  }

  @Post()
  @Roles(RoleName.USER, RoleName.ADMIN, RoleName.SUPERADMIN)
  async create(
    @Body() dto: CreateTransferDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return { success: true, data: await this.service.create(dto, user) };
  }

  /** Update usulan (hanya DRAFT atau DITOLAK_ATASAN). */
  @Patch(':id')
  @Roles(RoleName.USER, RoleName.ADMIN, RoleName.SUPERADMIN)
  async update(
    @Param('id') id: string,
    @Body() dto: CreateTransferDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return { success: true, data: await this.service.update(id, dto, user) };
  }

  @Get()
  async findAll(
    @Query() filter: TransferFilterDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return { success: true, ...(await this.service.findAll(filter, user)) };
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return { success: true, data: await this.service.findOne(id, user) };
  }

  // ─── Unit Kerja ────────────────────────────────────────────────────────
  @Patch(':id/send')
  async send(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return { success: true, data: await this.service.send(id, user) };
  }

  @Patch(':id/resubmit')
  async resubmit(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return { success: true, data: await this.service.send(id, user) };
  }

  @Patch(':id/approve')
  @Roles(RoleName.USER, RoleName.ADMIN, RoleName.SUPERADMIN)
  async approve(
    @Param('id') id: string,
    @Body() dto: ApproveTransferDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return { success: true, data: await this.service.approve(id, dto, user) };
  }

  @Patch(':id/reject')
  @Roles(RoleName.USER, RoleName.ADMIN, RoleName.SUPERADMIN)
  async reject(
    @Param('id') id: string,
    @Body() dto: RejectTransferDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return { success: true, data: await this.service.reject(id, dto, user) };
  }

  @Patch(':id/final-verify')
  @Roles(RoleName.USER, RoleName.ADMIN, RoleName.SUPERADMIN)
  async finalVerify(
    @Param('id') id: string,
    @Body() dto: FinalVerifyTransferDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return {
      success: true,
      data: await this.service.finalVerify(id, dto, user),
    };
  }

  /** Endpoint verifikasi (alias approve) — PATCH /:id/verify */
  @Patch(':id/verify')
  @Roles(RoleName.USER, RoleName.ADMIN, RoleName.SUPERADMIN)
  async verify(
    @Param('id') id: string,
    @Body() dto: ApproveTransferDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return { success: true, data: await this.service.approve(id, dto, user) };
  }

  /** Ambil daftar level approval untuk usulan. */
  @Get(':id/approval-levels')
  async getApprovalLevels(@Param('id') id: string) {
    return {
      success: true,
      data: await this.service.getApprovalLevels(id),
    };
  }

  /** Daftar file dari arsip yang dipilih. */
  @Get(':id/files')
  async getFiles(@Param('id') id: string) {
    return { success: true, data: await this.service.getFiles(id) };
  }

  /** Daftar isi otomatis. */
  @Get(':id/daftar-isi')
  async getDaftarIsi(@Param('id') id: string) {
    return { success: true, data: await this.service.getDaftarIsi(id) };
  }

  /** Data Berita Acara Serah Terima (auto-generate). */
  @Get(':id/berita-acara-data')
  async getBeritaAcaraData(@Param('id') id: string) {
    return { success: true, data: await this.service.getBeritaAcaraData(id) };
  }

  /** Cek apakah user login sedang giliran verifikasi. */
  @Get(':id/is-current-turn')
  async isCurrentTurn(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    const isTurn = await this.service.isCurrentTurn(id, Number(user.persnum));
    return { success: true, data: { isCurrentTurn: isTurn } };
  }

  @Patch(':id/dispatch')
  async dispatch(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return { success: true, data: await this.service.dispatch(id, user) };
  }

  // ─── Flowchart Baru: Kirim Usul Pindah → Siapkan Berkas Fisik → Selesai ──

  @Patch(':id/kirim-usul-pindah')
  @Roles(RoleName.USER, RoleName.ADMIN, RoleName.SUPERADMIN)
  async kirimUsulPindah(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return {
      success: true,
      data: await this.service.kirimUsulPindah(id, user),
    };
  }

  @Patch(':id/siapkan-berkas-fisik')
  @Roles(RoleName.USER, RoleName.ADMIN, RoleName.SUPERADMIN)
  async siapkanBerkasFisik(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return {
      success: true,
      data: await this.service.siapkanBerkasFisik(id, user),
    };
  }

  @Patch(':id/selesai')
  @Roles(RoleName.USER, RoleName.ADMIN, RoleName.SUPERADMIN)
  async selesaikanUsulan(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return {
      success: true,
      data: await this.service.selesaikanUsulan(id, user),
    };
  }

  /** Atasan Managerial TU menyetujui penerimaan → SELESAI */
  @Patch(':id/approve-receipt')
  @Roles(RoleName.ADMIN, RoleName.SUPERADMIN)
  async approveReceipt(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return { success: true, data: await this.service.approveReceipt(id, user) };
  }

  @Patch(':id/upload-berkas')
  @Roles(RoleName.USER, RoleName.ADMIN, RoleName.SUPERADMIN)
  async uploadBerkas(
    @Param('id') id: string,
    @Body()
    dto: { berkasFisikUrl?: string; beritaAcaraSerahTerimaUrl?: string },
    @CurrentUser() user: JwtPayload,
  ) {
    return {
      success: true,
      data: await this.service.uploadBerkas(id, dto, user),
    };
  }

  // ─── Unit Tata Naskah ──────────────────────────────────────────────────
  @Patch(':id/verify-physical')
  async verifyPhysical(
    @Param('id') id: string,
    @Body() dto: VerifyPhysicalFilesDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return {
      success: true,
      data: await this.service.verifyPhysicalFiles(id, dto, user),
    };
  }

  @Patch(':id/tu-approve')
  @Roles(RoleName.ADMIN, RoleName.SUPERADMIN)
  async tuApprove(
    @Param('id') id: string,
    @Body() dto: TuApproveDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return { success: true, data: await this.service.tuApprove(id, dto, user) };
  }

  @Patch(':id/tu-reject')
  @Roles(RoleName.ADMIN, RoleName.SUPERADMIN)
  async tuReject(
    @Param('id') id: string,
    @Body() dto: RejectTransferDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return { success: true, data: await this.service.tuReject(id, dto, user) };
  }

  @Patch(':id/tu-final-approve')
  @Roles(RoleName.ADMIN, RoleName.SUPERADMIN)
  async tuFinalApprove(
    @Param('id') id: string,
    @Body() dto: FinalApprovalTuDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return {
      success: true,
      data: await this.service.tuFinalApprove(id, dto, user),
    };
  }

  @Patch(':id/tu-final-reject')
  @Roles(RoleName.ADMIN, RoleName.SUPERADMIN)
  async tuFinalReject(
    @Param('id') id: string,
    @Body() dto: RejectTransferDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return {
      success: true,
      data: await this.service.tuFinalReject(id, dto, user),
    };
  }

  @Patch(':id/receive')
  async receive(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return { success: true, data: await this.service.receiveArchive(id, user) };
  }

  @Patch(':id/arrange')
  async arrange(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return { success: true, data: await this.service.arrangeArchive(id, user) };
  }

  @Patch(':id/complete')
  async complete(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return { success: true, data: await this.service.complete(id, user) };
  }

  @Post(':id/berita-acara')
  async generateBeritaAcara(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return {
      success: true,
      data: await this.service.generateBeritaAcara(id, user),
    };
  }
}
