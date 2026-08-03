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
import { CurrentUser } from '../../../common/decorators/current-user.decorator';

/**
 * Controller Usulan Akses Berkas — actor-based access control.
 *
 * Tidak ada @RequirePermission decorator. Akses dikontrol sepenuhnya oleh
 * service layer berdasarkan position_status (SE/Managerial) dan organization
 * divisi dari JWT. Semua user yang authenticated bisa mengakses endpoint,
 * tapi service layer yang menentukan apakah aksi diizinkan untuk actor ini.
 */
@Controller('usulan-akses-berkas')
export class UsulanAksesBerkasController {
  constructor(private readonly service: UsulanAksesBerkasService) {}

  // ── Verifikator: list managerial di divisi sendiri ─────────────

  /**
   * GET /usulan-akses-berkas/verifikator
   * Return semua managerial (chief=1) di divisi yang sama dengan currentUser.
   * Query param:
   *  - divisiId: number (opsional) — kalau diisi, fetch managerial di divisi ini
   *    (untuk Pilih Berkas: pakai divisiPemberiId dari usulan, bukan user.organization)
   */
  @Get('verifikator')
  async getVerifikator(@CurrentUser() user: any, @Query('divisiId') divisiId?: string) {
    const orgId = divisiId ? Number(divisiId) : Number(user.organization);
    const result = await this.service.getVerifikator(orgId);
    return { success: true, data: result, total: result.length };
  }

  // ── Verifikator BOD: list BOD/BOD-1/BOD-2/BOD-3 + delegasi aktif (PT/PH/PS) ──

  /**
   * GET /usulan-akses-berkas/verifikator-bod
   * Return semua BOD (BOD, BOD-1, BOD-2, BOD-3) di divisi tertentu,
   * digabung dengan managerial yang sedang didelegasikan (PT/PH/PS aktif)
   * di divisi tersebut.
   * Query param:
   *  - divisiId: number (opsional) — kalau kosong, pakai divisi currentUser
   */
  @Get('verifikator-bod')
  async getVerifikatorBod(
    @CurrentUser() user: any,
    @Query('divisiId') divisiId?: string,
  ) {
    const orgId = divisiId ? Number(divisiId) : Number(user.organization);
    const result = await this.service.getVerifikatorBod(orgId);
    return { success: true, data: result, total: result.length };
  }

  // ── Eligible penerima akses tambahan (orang di divisi pengusul) ──

  /**
   * GET /usulan-akses-berkas/eligible-penerima-tambahan
   * List orang-orang yang eligible sebagai penerima akses tambahan di form
   * usulan. Hanya user yang ada di divisi pengusul (orgId dari token user,
   * atau override via query param divisiId).
   *
   * Return: { persnum, nama, positionId, positionText, organizationText }
   */
  @Get('eligible-penerima-tambahan')
  async getEligiblePenerimaTambahan(
    @CurrentUser() user: any,
    @Query('divisiId') divisiId?: string,
  ) {
    const orgId = divisiId ? Number(divisiId) : Number(user.organization);
    const result = await this.service.getEligiblePenerimaTambahan(orgId, user);
    return { success: true, data: result, total: result.length };
  }

  // ── CREATE: Buat usulan baru ──────────────────────────────────

  /**
   * POST /usulan-akses-berkas
   * Buat usulan akses berkas baru
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateUsulanAksesBerkasDto, @CurrentUser() user: any) {
    return this.service.create(dto, user);
  }

  // ── READ: My Entitlements (akses berkas yang sudah diterbitkan) ──

  /**
   * GET /usulan-akses-berkas/my-entitlements
   * List entitlement (akses berkas) untuk user yang login.
   * Hanya yang belum revoked. Di-group by berkas.
   */
  @Get('my-entitlements')
  async myEntitlements(@CurrentUser() user: any) {
    const result = await this.service.getMyEntitlements(user);
    return { success: true, data: result, total: result.length };
  }

  /**
   * GET /usulan-akses-berkas/naskah/:naskahId
   * Detail naskah untuk SE pengusul yang punya entitlement.
   * Cek: naskah ada di berkas yang user punya entitlement-nya.
   */
  @Get('naskah/:naskahId')
  async getNaskahDetail(@Param('naskahId') naskahId: string, @CurrentUser() user: any) {
    const result = await this.service.getNaskahDetailForEntitlement(naskahId, user);
    return { success: true, data: result };
  }

  /**
   * GET /usulan-akses-berkas/berkas/:berkasId
   * Detail berkas untuk SE pengusul yang punya entitlement.
   */
  @Get('berkas/:berkasId')
  async getBerkasDetail(@Param('berkasId') berkasId: string, @CurrentUser() user: any) {
    const result = await this.service.getBerkasDetailForEntitlement(berkasId, user);
    return { success: true, data: result };
  }

  /**
   * GET /usulan-akses-berkas/berkas/:berkasId/naskah
   * List naskah di dalam berkas tertentu (untuk Pemberian).
   * Cek entitlement user sebelum return.
   */
  @Get('berkas/:berkasId/naskah')
  async getNaskahByBerkas(
    @Param('berkasId') berkasId: string,
    @CurrentUser() user: any,
  ) {
    const result = await this.service.getNaskahByBerkas(berkasId, user);
    return { success: true, data: result, total: result.length };
  }

  /**
   * GET /usulan-akses-berkas/eligible-berkas
   * List berkas yang eligible untuk dipilih SE Pemberi pada modal
   * "Pilih Berkas & Verifikator".
   *
   * - Untuk jenisBerkas AKTIF: hanya berkas milik divisi pemberi
   *   (unit_pencipta_id = divisiPemberiId) dengan status "closed_retensi_aktif".
   * - Untuk jenisBerkas INAKTIF: semua berkas status "closed_retensi_aktif"
   *   di divisi TU (Corporate Secretary).
   *
   * Filter unit dilakukan di BE — FE hanya menampilkan list ini.
   */
  @Get('eligible-berkas')
  async getEligibleBerkas(
    @CurrentUser() user: any,
    @Query('jenisBerkas') jenisBerkas?: string,
    @Query('divisiPemberiId') divisiPemberiId?: string,
  ) {
    const result = await this.service.getEligibleBerkasForPemberi(
      user,
      jenisBerkas,
      divisiPemberiId ? Number(divisiPemberiId) : undefined,
    );
    return { success: true, data: result, total: result.length };
  }

  // ── READ: List usulan ─────────────────────────────────────────

  /**
   * GET /usulan-akses-berkas/counts
   * Hitung jumlah usulan per kategori untuk badge notifikasi sidebar.
   * Kategori:
   *  - menungguVerifikasi: usulan yang menunggu verifikasi user (scope=verify-me, status menunggu)
   *  - pilihBerkas: usulan yang menunggu SE pemberi pilih berkas (scope=verify-pemberi, status PEMILIHAN_BERKAS/MENUNGGU_VERIFIKASI_PEMBERI)
   *  - aksesDiterbitkanBaru: entitlement baru yang belum dilihat (isRead=false)
   */
  @Get('counts')
  async getCounts(@CurrentUser() user: any) {
    const result = await this.service.getCounts(user);
    return { success: true, data: result };
  }

  /**
   * PATCH /usulan-akses-berkas/mark-entitlements-read
   * Tandai semua entitlement user sebagai sudah dibaca (isRead=true).
   * Dipanggil saat user membuka halaman Pemberian.
   */
  @Patch('mark-entitlements-read')
  @HttpCode(HttpStatus.OK)
  async markEntitlementsRead(@CurrentUser() user: any) {
    const result = await this.service.markEntitlementsRead(user);
    return { success: true, data: result };
  }

  /**
   * PATCH /usulan-akses-berkas/:id/mark-viewed
   * Tandai usulan sebagai sudah dibuka/dilihat oleh user (SE/managerial).
   * User disimpan di viewedBy[persnum] dengan timestamp ISO.
   * Counts badge notifikasi akan exclude usulan ini untuk user tsb.
   */
  @Patch(':id/mark-viewed')
  @HttpCode(HttpStatus.OK)
  async markViewed(@Param('id') id: string, @CurrentUser() user: any) {
    const result = await this.service.markViewed(id, user);
    return { success: true, data: result };
  }

  /**
   * GET /usulan-akses-berkas
   * List usulan dengan filter
   */
  @Get()
  async findAll(@CurrentUser() user: any, @Query() query: any) {
    return this.service.findAll(user, query);
  }

  // ── READ: Detail usulan ───────────────────────────────────────

  /**
   * GET /usulan-akses-berkas/:id
   * Detail usulan + steps + selectedBerkas
   */
  @Get(':id')
  async findOne(@Param('id') id: string, @CurrentUser() user: any) {
    return this.service.findOne(id, user);
  }

  // ── Verifikasi Pengusul (per jenjang) ─────────────────────────

  /**
   * PATCH /usulan-akses-berkas/:id/verifikasi-pengusul
   * Verifikasi AVP pengusul (jenjang 1)
   */
  @Patch(':id/verifikasi-pengusul')
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
  async getTrail(@Param('id') id: string, @CurrentUser() user: any) {
    return this.service.getTrail(id, user);
  }
}