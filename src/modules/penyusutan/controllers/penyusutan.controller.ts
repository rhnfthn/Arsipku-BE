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
import { PenyusutanService } from '../services/penyusutan.service';
import {
  AjukanPenyusutanDto,
  VerifyPenyusutanDto,
  SimpanPenataanDto,
  PemusnahanDto,
} from '../dto/penyusutan.dto';
import { JwtAuthGuard, RolesGuard } from '../../../common/guards';
import { CurrentUser, Roles, Public } from '../../../common/decorators';
import { RoleName } from '../../../common/enums';
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
  async findAllForAtasan(
    @Query('status') status?: string,
    @Query('search') search?: string,
    @CurrentUser() user?: JwtPayload,
  ) {
    return {
      success: true,
      data: await this.service.findAllForAtasan(user, { status, search }),
    };
  }

  /** Daftar untuk penataan/pemusnahan (status DITERIMA atau SELESAI). */
  @Get('penataan')
  @Roles(RoleName.USER, RoleName.ADMIN, RoleName.SUPERADMIN)
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
  async getFileUrls(@Param('id') id: string) {
    return {
      success: true,
      data: await this.service.getFileUrls(id),
    };
  }

  /** Detail pengajuan penyusutan + verifikator. */
  @Get(':id')
  async findOne(@Param('id') id: string) {
    return { success: true, data: await this.service.findOne(id) };
  }

  /** Ambil daftar verifikator untuk penyusutan. */
  @Get(':id/verifikators')
  async getVerifikators(@Param('id') id: string) {
    return {
      success: true,
      data: await this.service.getVerifikators(id),
    };
  }

  /** Ajukan penyusutan (dari halaman Ajukan Penyusutan). */
  @Post('ajukan')
  @Roles(RoleName.USER, RoleName.ADMIN, RoleName.SUPERADMIN)
  async ajukan(
    @Body() dto: AjukanPenyusutanDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return { success: true, data: await this.service.ajukan(dto, user) };
  }

  /** Verifikasi: setujui. */
  @Patch(':id/approve')
  @Roles(RoleName.USER, RoleName.ADMIN, RoleName.SUPERADMIN)
  async approve(
    @Param('id') id: string,
    @Body() dto: VerifyPenyusutanDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return {
      success: true,
      data: await this.service.verify(id, dto, user, true),
    };
  }

  /** Verifikasi: tolak. */
  @Patch(':id/reject')
  @Roles(RoleName.USER, RoleName.ADMIN, RoleName.SUPERADMIN)
  async reject(
    @Param('id') id: string,
    @Body() dto: VerifyPenyusutanDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return {
      success: true,
      data: await this.service.verify(id, dto, user, false),
    };
  }

  /** Simpan penataan arsip permanen. */
  @Patch(':id/penataan')
  @Roles(RoleName.USER, RoleName.ADMIN, RoleName.SUPERADMIN)
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

  /** Update foto dokumentasi (untuk edit setelah penataan selesai). */
  @Patch(':id/foto-dokumentasi')
  @Roles(RoleName.USER, RoleName.ADMIN, RoleName.SUPERADMIN)
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
}
