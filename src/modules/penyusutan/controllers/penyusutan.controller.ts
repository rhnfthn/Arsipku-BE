import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PenyusutanService } from '../services/penyusutan.service';
import {
  AjukanPenyusutanDto,
  VerifyPenyusutanDto,
  SimpanPenataanDto,
  PemusnahanDto,
  BackupDataDto,
} from '../dto/penyusutan.dto';
import { JwtAuthGuard, RolesGuard } from '../../../common/guards';
import { CurrentUser, Roles, Public } from '../../../common/decorators';
import {
  RequireAnyPermission,
  RequirePermission,
} from '../../../common/decorators/require-permission.decorator';
import { AllowViewerWrite } from '../../../common/decorators/allow-viewer-write.decorator';
import { RoleName } from '../../../common/enums';
import { PositionStatus } from '../../../common/enums/position-status.enum';
import { TuGuard } from '../../tu-verifikasi/guards/tu-guard';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';

/**
 * Controller API Penyusutan Arsip.
 * Unit Dokumen (TU) → Atasan Managerial TU (verifikasi berjenjang)
 *   → Penataan (permanen) / Pemusnahan (musnah).
 */
@ApiTags('Penyusutan')
@ApiBearerAuth()
@Controller('penyusutan')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PenyusutanController {
  constructor(private readonly service: PenyusutanService) {}

  /** Cek apakah user adalah atasan managerial TU (terdaftar sebagai verifikator). */
  @Get('is-atasan')
  async isAtasan(@CurrentUser() user: JwtPayload) {
    const isAtasan = await this.service.isAtasanManagerialTu(user);
    return { success: true, data: { isAtasan } };
  }

  /** Daftar pengajuan penyusutan untuk Unit Dokumen (TU). */
  @Get('pengajuan')
  @Roles(RoleName.USER, RoleName.ADMIN, RoleName.SUPERADMIN)
  @RequirePermission('pemeliharaan.penyusutan.pengajuan', 'read')
  async findAllForTu(
    @Query('status') status?: string,
    @Query('search') search?: string,
    @CurrentUser() user?: JwtPayload,
  ) {
    return {
      success: true,
      data: await this.service.findAllForTu(user, { status, search }),
    };
  }

  /** Daftar pengajuan untuk verifikasi oleh Atasan Managerial TU. */
  @Get('verifikasi')
  @Roles(RoleName.USER, RoleName.ADMIN, RoleName.SUPERADMIN)
  @RequirePermission('pemeliharaan.penyusutan.verifikasi', 'read')
  async findAllForAtasan(
    @Query('status') status?: string,
    @Query('search') search?: string,
    @CurrentUser() user?: JwtPayload,
  ) {
    await this.assertPenyusutanVerifier(user);
    return {
      success: true,
      data: await this.service.findAllForAtasan(user, { status, search }),
    };
  }

  /** Daftar untuk penataan/pemusnahan (status DITERIMA atau SELESAI). */
  @Get('penataan')
  @Roles(RoleName.USER, RoleName.ADMIN, RoleName.SUPERADMIN)
  @RequirePermission('pemeliharaan.penyusutan.penataan-pemusnahan', 'read')
  async findAllForPenataan(
    @Query('search') search?: string,
    @CurrentUser() user?: JwtPayload,
  ) {
    return {
      success: true,
      data: await this.service.findAllForPenataan(user, { search }),
    };
  }

  /** Get fresh presigned URLs for berita acara and foto dokumentasi. */
  @Get(':id/file-urls')
  @RequireAnyPermission(
    { resource: 'pemeliharaan.penyusutan.pengajuan', action: 'read' },
    { resource: 'pemeliharaan.penyusutan.penataan-pemusnahan', action: 'read' },
    { resource: 'pemeliharaan.penyusutan.verifikasi', action: 'read' },
  )
  async getFileUrls(@Param('id') id: string) {
    return {
      success: true,
      data: await this.service.getFileUrls(id),
    };
  }

  /** Detail pengajuan penyusutan + verifikator. */
  @Get(':id')
  @RequireAnyPermission(
    { resource: 'pemeliharaan.penyusutan.pengajuan', action: 'read' },
    { resource: 'pemeliharaan.penyusutan.penataan-pemusnahan', action: 'read' },
    { resource: 'pemeliharaan.penyusutan.verifikasi', action: 'read' },
  )
  async findOne(@Param('id') id: string) {
    return { success: true, data: await this.service.findOne(id) };
  }

  /** Ambil daftar verifikator untuk penyusutan. */
  @Get(':id/verifikators')
  @RequireAnyPermission(
    { resource: 'pemeliharaan.penyusutan.pengajuan', action: 'read' },
    { resource: 'pemeliharaan.penyusutan.verifikasi', action: 'read' },
  )
  async getVerifikators(@Param('id') id: string) {
    return {
      success: true,
      data: await this.service.getVerifikators(id),
    };
  }

  /** Ajukan penyusutan (dari halaman Ajukan Penyusutan). */
  @Post('ajukan')
  @Roles(RoleName.USER, RoleName.ADMIN, RoleName.SUPERADMIN)
  @RequirePermission('pemeliharaan.penyusutan.pengajuan', 'create')
  // Sekretaris TU dapat mengajukan penyusutan saat bekerja melalui profil SE.
  // Pengecualian ini sengaja hanya dipasang pada endpoint pengajuan; aksi
  // verifikasi, penataan, pemusnahan, dan backup tetap read-only untuk SE.
  @AllowViewerWrite(PositionStatus.SE)
  async ajukan(
    @Body() dto: AjukanPenyusutanDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return { success: true, data: await this.service.ajukan(dto, user) };
  }

  /** Verifikasi: setujui. */
  @Patch(':id/approve')
  @Roles(RoleName.USER, RoleName.ADMIN, RoleName.SUPERADMIN)
  @RequirePermission('pemeliharaan.penyusutan.verifikasi', 'approve')
  async approve(
    @Param('id') id: string,
    @Body() dto: VerifyPenyusutanDto,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.assertPenyusutanVerifier(user);
    return {
      success: true,
      data: await this.service.verify(id, dto, user, true),
    };
  }

  /** Verifikasi: tolak. */
  @Patch(':id/reject')
  @Roles(RoleName.USER, RoleName.ADMIN, RoleName.SUPERADMIN)
  @RequirePermission('pemeliharaan.penyusutan.verifikasi', 'reject')
  async reject(
    @Param('id') id: string,
    @Body() dto: VerifyPenyusutanDto,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.assertPenyusutanVerifier(user);
    return {
      success: true,
      data: await this.service.verify(id, dto, user, false),
    };
  }

  /** Simpan penataan arsip permanen. */
  @Patch(':id/penataan')
  @Roles(RoleName.USER, RoleName.ADMIN, RoleName.SUPERADMIN)
  @RequirePermission('pemeliharaan.penyusutan.penataan-pemusnahan', 'complete')
  @UseGuards(TuGuard)
  @AllowViewerWrite(PositionStatus.SE)
  async simpanPenataan(
    @Param('id') id: string,
    @Body() dto: SimpanPenataanDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return {
      success: true,
      data: await this.service.simpanPenataan(id, dto, user),
    };
  }

  /** Pemusnahan arsip. */
  @Patch(':id/pemusnahan')
  @Roles(RoleName.USER, RoleName.ADMIN, RoleName.SUPERADMIN)
  @RequirePermission('pemeliharaan.penyusutan.penataan-pemusnahan', 'complete')
  @UseGuards(TuGuard)
  @AllowViewerWrite(PositionStatus.SE)
  async pemusnahan(
    @Param('id') id: string,
    @Body() dto: PemusnahanDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return {
      success: true,
      data: await this.service.pemusnahan(id, dto, user),
    };
  }

  /** Backup data arsip musnah ke DB arsip + hapus master berkas dari DB inti. */
  @Post(':id/backup-data')
  @Roles(RoleName.USER, RoleName.ADMIN, RoleName.SUPERADMIN)
  @RequirePermission('pemeliharaan.penyusutan.penataan-pemusnahan', 'complete')
  @UseGuards(TuGuard)
  @AllowViewerWrite(PositionStatus.SE)
  async backupData(
    @Param('id') id: string,
    @Body() dto: BackupDataDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return {
      status: 'success',
      message: 'Data berhasil dibackup dan berkas telah dimusnahkan',
      data: await this.service.backupData(id, dto, user),
    };
  }

  /** Update foto dokumentasi (untuk edit setelah penataan selesai). */
  @Patch(':id/foto-dokumentasi')
  @Roles(RoleName.USER, RoleName.ADMIN, RoleName.SUPERADMIN)
  @RequirePermission('pemeliharaan.penyusutan.penataan-pemusnahan', 'update')
  @UseGuards(TuGuard)
  @AllowViewerWrite(PositionStatus.SE)
  async updateFotoDokumentasi(
    @Param('id') id: string,
    @Body() dto: { fotoDokumentasi: string },
    @CurrentUser() user: JwtPayload,
  ) {
    return {
      success: true,
      data: await this.service.updateFotoDokumentasi(
        id,
        dto.fotoDokumentasi,
        user,
      ),
    };
  }

  /** Update berita acara (untuk edit setelah penataan/pemusnahan selesai). */
  @Patch(':id/berita-acara')
  @Roles(RoleName.USER, RoleName.ADMIN, RoleName.SUPERADMIN)
  @RequirePermission('pemeliharaan.penyusutan.penataan-pemusnahan', 'update')
  @UseGuards(TuGuard)
  @AllowViewerWrite(PositionStatus.SE)
  async updateBeritaAcara(
    @Param('id') id: string,
    @Body() dto: { beritaAcara: string },
    @CurrentUser() user: JwtPayload,
  ) {
    return {
      success: true,
      data: await this.service.updateBeritaAcara(id, dto.beritaAcara, user),
    };
  }

  private async assertPenyusutanVerifier(user?: JwtPayload): Promise<void> {
    if (!(await this.service.isAtasanManagerialTu(user))) {
      throw new ForbiddenException(
        'Verifikasi Penyusutan hanya dapat dilakukan oleh Atasan Unit Dokumen atau Sekretaris TU',
      );
    }
  }
}
