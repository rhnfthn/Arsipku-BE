import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { UsulanAksesBerkasService } from '../services';
import {
  CreateUsulanAksesBerkasDto,
  VerifikasiPengusulDto,
  VerifikasiPemberiDto,
  PilihBerkasDto,
  PersetujuanPemberiDto,
} from '../dto';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';

@Controller('usulan-akses-berkas')
export class UsulanAksesBerkasController {
  constructor(private readonly service: UsulanAksesBerkasService) {}

  // ── Verifikator: list managerial di divisi sendiri ─────────────

  /**
   * GET /usulan-akses-berkas/verifikator
   * Return semua managerial (chief=1) di divisi yang sama dengan currentUser
   */
  @Get('verifikator')
  @RequirePermission('usulan-akses-berkas', 'read')
  async getVerifikator(@CurrentUser() user: any) {
    const result = await this.service.getVerifikator(Number(user.organization));
    return { success: true, data: result, total: result.length };
  }

  // ── CREATE: Buat usulan baru ──────────────────────────────────

  /**
   * POST /usulan-akses-berkas
   * Buat usulan akses berkas baru
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('usulan-akses-berkas', 'create')
  async create(@Body() dto: CreateUsulanAksesBerkasDto, @CurrentUser() user: any) {
    return this.service.create(dto, user);
  }

  // ── READ: List usulan ─────────────────────────────────────────

  /**
   * GET /usulan-akses-berkas
   * List usulan dengan filter
   */
  @Get()
  @RequirePermission('usulan-akses-berkas', 'read')
  async findAll(@CurrentUser() user: any, @Query() query: any) {
    return this.service.findAll(user, query);
  }

  // ── READ: Detail usulan ───────────────────────────────────────

  /**
   * GET /usulan-akses-berkas/:id
   * Detail usulan + steps + selectedBerkas
   */
  @Get(':id')
  @RequirePermission('usulan-akses-berkas', 'read')
  async findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  // ── Verifikasi Pengusul (per jenjang) ─────────────────────────

  /**
   * PATCH /usulan-akses-berkas/:id/verifikasi-pengusul
   * Verifikasi AVP pengusul (jenjang 1)
   */
  @Patch(':id/verifikasi-pengusul')
  @RequirePermission('usulan-akses-berkas', 'verify-pengusul')
  async verifikasiPengusulJ1(
    @Param('id') id: string,
    @Body() dto: VerifikasiPengusulDto,
    @CurrentUser() user: any,
  ) {
    return this.service.verifikasiPengusul(id, dto, user, 1);
  }

  /**
   * PATCH /usulan-akses-berkas/:id/verifikasi-pengusul-vp
   * Verifikasi VP pengusul (jenjang 2)
   */
  @Patch(':id/verifikasi-pengusul-vp')
  @RequirePermission('usulan-akses-berkas', 'verify-pengusul')
  async verifikasiPengusulJ2(
    @Param('id') id: string,
    @Body() dto: VerifikasiPengusulDto,
    @CurrentUser() user: any,
  ) {
    return this.service.verifikasiPengusul(id, dto, user, 2);
  }

  /**
   * PATCH /usulan-akses-berkas/:id/verifikasi-pengusul-evp
   * Verifikasi EVP pengusul (jenjang 3)
   */
  @Patch(':id/verifikasi-pengusul-evp')
  @RequirePermission('usulan-akses-berkas', 'verify-pengusul')
  async verifikasiPengusulJ3(
    @Param('id') id: string,
    @Body() dto: VerifikasiPengusulDto,
    @CurrentUser() user: any,
  ) {
    return this.service.verifikasiPengusul(id, dto, user, 3);
  }

  // ── Verifikasi Pemberi (Sekretaris Pemberi) ───────────────────

  /**
   * PATCH /usulan-akses-berkas/:id/verifikasi-pemberi
   * Verifikasi Sekretaris Pemberi (ketersediaan + durasi)
   */
  @Patch(':id/verifikasi-pemberi')
  @RequirePermission('usulan-akses-berkas', 'verify-pemberi')
  async verifikasiPemberi(
    @Param('id') id: string,
    @Body() dto: VerifikasiPemberiDto,
    @CurrentUser() user: any,
  ) {
    return this.service.verifikasiPemberi(id, dto, user);
  }

  // ── Pilih Berkas (Sekretaris Pemberi) ─────────────────────────

  /**
   * POST /usulan-akses-berkas/:id/pilih-berkas
   * Pilih berkas + set verifikator pemberi
   */
  @Post(':id/pilih-berkas')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('usulan-akses-berkas', 'select-files')
  async pilihBerkas(
    @Param('id') id: string,
    @Body() dto: PilihBerkasDto,
    @CurrentUser() user: any,
  ) {
    return this.service.pilihBerkas(id, dto, user);
  }

  // ── Persetujuan Pemberi (per jenjang) ──────────────────────────

  /**
   * PATCH /usulan-akses-berkas/:id/persetujuan-pemberi
   * Persetujuan AVP pemberi (jenjang 1)
   */
  @Patch(':id/persetujuan-pemberi')
  @RequirePermission('usulan-akses-berkas', 'approve-pemberi')
  async persetujuanPemberiJ1(
    @Param('id') id: string,
    @Body() dto: PersetujuanPemberiDto,
    @CurrentUser() user: any,
  ) {
    return this.service.persetujuanPemberi(id, dto, user, 1);
  }

  /**
   * PATCH /usulan-akses-berkas/:id/persetujuan-pemberi-vp
   * Persetujuan VP pemberi (jenjang 2)
   */
  @Patch(':id/persetujuan-pemberi-vp')
  @RequirePermission('usulan-akses-berkas', 'approve-pemberi')
  async persetujuanPemberiJ2(
    @Param('id') id: string,
    @Body() dto: PersetujuanPemberiDto,
    @CurrentUser() user: any,
  ) {
    return this.service.persetujuanPemberi(id, dto, user, 2);
  }

  /**
   * PATCH /usulan-akses-berkas/:id/persetujuan-pemberi-evp
   * Persetujuan EVP pemberi (jenjang 3) → terbitkan akses
   */
  @Patch(':id/persetujuan-pemberi-evp')
  @RequirePermission('usulan-akses-berkas', 'approve-pemberi')
  async persetujuanPemberiJ3(
    @Param('id') id: string,
    @Body() dto: PersetujuanPemberiDto,
    @CurrentUser() user: any,
  ) {
    return this.service.persetujuanPemberi(id, dto, user, 3);
  }

  // ── Audit Trail ───────────────────────────────────────────────

  /**
   * GET /usulan-akses-berkas/:id/trail
   * Audit trail verifikasi
   */
  @Get(':id/trail')
  @RequirePermission('usulan-akses-berkas', 'read')
  async getTrail(@Param('id') id: string) {
    return this.service.getTrail(id);
  }
}