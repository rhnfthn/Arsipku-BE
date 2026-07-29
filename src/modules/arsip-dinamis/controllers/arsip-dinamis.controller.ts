import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Patch,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  BadRequestException,
  UploadedFile,
  UseInterceptors,
  Res,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ArsipDinamisService } from '../services';
import { KlasifikasiEntity } from '../../klasifikasi/entities/klasifikasi.entity';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { PemeliharaanAccess } from '../../../common/decorators/pemeliharaan-access.decorator';
import { AllowViewerWrite } from '../../../common/decorators/allow-viewer-write.decorator';
import { PositionStatus } from '../../../common/enums/position-status.enum';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import {
  CreateArsipDinamisBerkasDto,
  UpdateArsipDinamisBerkasDto,
  AddNaskahToBerkasDto,
  AjukanTutupBerkasDto,
  VerifikasiBerkasDto,
} from '../dto';

@Controller('arsip-dinamis')
export class ArsipDinamisController {
  constructor(
    private readonly arsipDinamisService: ArsipDinamisService,
    @InjectRepository(KlasifikasiEntity)
    private readonly klasifikasiRepository: Repository<KlasifikasiEntity>,
  ) {}

  // ── Klasifikasi (untuk auto-fill retensi) ───────────────────────

  /**
   * Ambil daftar klasifikasi beserta nilai retensi (untuk form)
   * GET /arsip-dinamis/klasifikasi
   */
  @Get('klasifikasi')
  @PemeliharaanAccess('pemberkasan')
  async getKlasifikasiDenganRetensi() {
    const data = await this.klasifikasiRepository.find({
      where: { active: 1 },
      select: ['id', 'klasifikasi', 'klasifikasi_text', 'retensi_aktif_tahun', 'retensi_inaktif_tahun'],
      order: { klasifikasi: 'ASC' },
    });
    return data;
  }

  /**
   * Status berkas untuk sekumpulan naskah (kolom "Status Berkas" di KM/Terkirim)
   * GET /arsip-dinamis/berkas-naskah?naskah_ids=a,b,c
   */
  @Get('berkas-naskah')
  @RequirePermission('pemeliharaan.pemberkasan', 'read')
  async getBerkasStatusByNaskah(@Query('naskah_ids') naskahIds?: string) {
    const ids = (naskahIds || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return this.arsipDinamisService.getBerkasStatusByNaskah(ids);
  }

  // ── Berkas CRUD ─────────────────────────────────────────────────

  /**
   * Membuat berkas baru (Sekretaris)
   * POST /arsip-dinamis/berkas
   */
  @Post('berkas')
  @HttpCode(HttpStatus.CREATED)
  @PemeliharaanAccess('pemberkasan')
  @AllowViewerWrite(PositionStatus.SE)
  async createBerkas(
    @Body() dto: CreateArsipDinamisBerkasDto,
    @CurrentUser() user: any,
  ) {
    return this.arsipDinamisService.createBerkas(dto, user.persnum);
  }

  /**
   * Upload file pendukung berkas (foto lokasi fisik / dokumen pendukung)
   * POST /arsip-dinamis/berkas/upload-file
   */
  @Post('berkas/upload-file')
  @HttpCode(HttpStatus.CREATED)
  @PemeliharaanAccess('pemberkasan')
  @AllowViewerWrite(PositionStatus.SE)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 25 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const allowed = [
          'image/jpeg',
          'image/png',
          'image/webp',
          'image/gif',
          'application/pdf',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ];
        if (allowed.includes(file.mimetype)) cb(null, true);
        else
          cb(
            new BadRequestException(
              `Tipe file tidak diizinkan: ${file.mimetype}`,
            ),
            false,
          );
      },
    }),
  )
  async uploadBerkasFile(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('File tidak ditemukan');
    const data = await this.arsipDinamisService.uploadBerkasFile(file);
    return { success: true, data };
  }

  /**
   * Ambil/preview file pendukung berkas (inline)
   * GET /arsip-dinamis/berkas/file?key=
   */
  @Get('berkas/file')
  @PemeliharaanAccess('pemberkasan', 'persetujuan')
  async getBerkasFile(
    @Query('key') key: string,
    @Res() res: Response,
  ): Promise<void> {
    const { buffer, contentType } =
      await this.arsipDinamisService.getBerkasFile(key);
    const filename = key.split('/').pop() || 'berkas-file';
    res.set({
      'Content-Type': contentType,
      'Content-Disposition': `inline; filename="${filename}"`,
    });
    res.send(buffer);
  }

  /**
   * Daftar berkas milik user
   * GET /arsip-dinamis/berkas
   */
  @Get('berkas')
  @PemeliharaanAccess('pemberkasan')
  async findAllBerkas(
    @CurrentUser() user: any,
    @Query('status') status?: string,
    @Query('klasifikasi') klasifikasi?: string,
    @Query('tahun') tahun?: string,
    @Query('search') search?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('sortBy') sortBy?: string,
    @Query('sortDir') sortDir?: string,
  ) {
    return this.arsipDinamisService.findAllBerkas(user.persnum, {
      status,
      klasifikasi,
      tahun,
      search,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
      sortBy,
      sortDir,
    });
  }

  /**
   * Statistik berkas (summary cards)
   * GET /arsip-dinamis/berkas/statistik
   */
  @Get('berkas/statistik')
  @PemeliharaanAccess('pemberkasan')
  async getStatistikBerkas(@CurrentUser() user: any) {
    return this.arsipDinamisService.getStatistikBerkas(user.persnum);
  }

  /**
   * Detail berkas
   * GET /arsip-dinamis/berkas/:id
   */
  @Get('berkas/:id')
  @PemeliharaanAccess('pemberkasan', 'persetujuan')
  async findOneBerkas(@Param('id') id: string) {
    return this.arsipDinamisService.getDetailBerkas(id);
  }

  /**
   * Update berkas
   * PUT /arsip-dinamis/berkas/:id
   */
  @Put('berkas/:id')
  @PemeliharaanAccess('pemberkasan')
  @AllowViewerWrite(PositionStatus.SE)
  async updateBerkas(
    @Param('id') id: string,
    @Body() dto: UpdateArsipDinamisBerkasDto,
    @CurrentUser() user: any,
  ) {
    return this.arsipDinamisService.updateBerkas(id, dto, user.persnum);
  }

  /**
   * Soft delete berkas (hanya Terbuka tanpa naskah)
   * DELETE /arsip-dinamis/berkas/:id
   */
  @Delete('berkas/:id')
  @HttpCode(HttpStatus.OK)
  @PemeliharaanAccess('pemberkasan')
  @AllowViewerWrite(PositionStatus.SE)
  async softDeleteBerkas(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ) {
    return this.arsipDinamisService.softDeleteBerkas(id, user.persnum);
  }

  // ── Naskah dalam Berkas ─────────────────────────────────────────

  /**
   * Daftar naskah dalam berkas
   * GET /arsip-dinamis/berkas/:id/naskah
   */
  @Get('berkas/:id/naskah')
  @PemeliharaanAccess('pemberkasan', 'persetujuan')
  async getDaftarNaskah(
    @Param('id') id: string,
    @Query('search') search?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.arsipDinamisService.getDaftarNaskah(id, {
      search,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
    });
  }

  /**
   * Detail naskah tunggal dalam konteks berkas (sebagai anggota pemberkasan/
   * persetujuan) — tanpa cek peserta korespondensi. Akses: PemeliharaanAccess.
   * GET /arsip-dinamis/berkas/:id/naskah/:naskahId/detail
   */
  @Get('berkas/:id/naskah/:naskahId/detail')
  @PemeliharaanAccess('pemberkasan', 'persetujuan')
  async getNaskahDetailInBerkas(
    @Param('id') id: string,
    @Param('naskahId') naskahId: string,
  ) {
    return this.arsipDinamisService.getNaskahDetailInBerkas(id, naskahId);
  }

  /**
   * Tambah naskah ke berkas
   * POST /arsip-dinamis/berkas/:id/naskah
   */
  @Post('berkas/:id/naskah')
  @HttpCode(HttpStatus.CREATED)
  @PemeliharaanAccess('pemberkasan')
  @AllowViewerWrite(PositionStatus.SE)
  async addNaskahToBerkas(
    @Param('id') id: string,
    @Body() dto: AddNaskahToBerkasDto,
    @CurrentUser() user: any,
  ) {
    return this.arsipDinamisService.addNaskahToBerkas(id, dto, user.persnum);
  }

  /**
   * Hapus naskah dari berkas
   * DELETE /arsip-dinamis/berkas/:id/naskah/:naskahId
   */
  @Delete('berkas/:id/naskah/:naskahId')
  @HttpCode(HttpStatus.OK)
  @PemeliharaanAccess('pemberkasan')
  @AllowViewerWrite(PositionStatus.SE)
  async removeNaskahFromBerkas(
    @Param('id') id: string,
    @Param('naskahId') naskahId: string,
    @CurrentUser() user: any,
  ) {
    return this.arsipDinamisService.removeNaskahFromBerkas(id, naskahId, user.persnum);
  }

  /**
   * Naskah siap arsip (filtered view untuk tab "Siap Arsip")
   * GET /arsip-dinamis/berkas/:id/naskah-siap-arsip
   */
  @Get('berkas/:id/naskah-siap-arsip')
  @PemeliharaanAccess('pemberkasan')
  async getNaskahSiapArsip(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Query('search') search?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.arsipDinamisService.getNaskahSiapArsip(user.persnum, id, {
      search,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
    });
  }

  /**
   * Naskah user per tab (semua status) untuk modal Tambah Naskah
   * GET /arsip-dinamis/naskah-saya?tab=kotak_masuk|terkirim
   */
  @Get('naskah-saya')
  @RequirePermission('pemeliharaan.pemberkasan', 'read')
  async getNaskahSaya(
    @CurrentUser() user: any,
    @Query('tab') tab: string,
    @Query('search') search?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    const t = tab === 'terkirim' ? 'terkirim' : 'kotak_masuk';
    return this.arsipDinamisService.getNaskahSaya(user.persnum, t as 'kotak_masuk' | 'terkirim', {
      search,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 50,
    });
  }

  // ── Penutupan & Verifikasi ──────────────────────────────────────

  /**
   * Ajukan penutupan berkas
   * POST /arsip-dinamis/berkas/:id/ajukan-tutup
   */
  @Post('berkas/:id/ajukan-tutup')
  @HttpCode(HttpStatus.OK)
  @PemeliharaanAccess('pemberkasan')
  @AllowViewerWrite(PositionStatus.SE)
  async ajukanTutupBerkas(
    @Param('id') id: string,
    @Body() dto: AjukanTutupBerkasDto,
    @CurrentUser() user: any,
  ) {
    return this.arsipDinamisService.ajukanTutupBerkas(id, dto, user.persnum);
  }

  /**
   * Detail verifikasi (stepper)
   * GET /arsip-dinamis/berkas/:id/verifikasi
   */
  @Get('berkas/:id/verifikasi')
  @PemeliharaanAccess('pemberkasan', 'persetujuan')
  async getVerifikasiDetail(@Param('id') id: string) {
    return this.arsipDinamisService.getVerifikasiDetail(id);
  }

  /**
   * Approve verifikasi penutupan (Manager)
   * POST /arsip-dinamis/berkas/:id/approve
   */
  @Post('berkas/:id/approve')
  @HttpCode(HttpStatus.OK)
  @PemeliharaanAccess('persetujuan')
  async approveVerifikasi(
    @Param('id') id: string,
    @Body() dto: VerifikasiBerkasDto,
    @CurrentUser() user: any,
  ) {
    return this.arsipDinamisService.approveVerifikasi(id, String(user.persnum), dto);
  }

  /**
   * Reject verifikasi penutupan (Manager)
   * POST /arsip-dinamis/berkas/:id/reject
   */
  @Post('berkas/:id/reject')
  @HttpCode(HttpStatus.OK)
  @PemeliharaanAccess('persetujuan')
  async rejectVerifikasi(
    @Param('id') id: string,
    @Body() dto: VerifikasiBerkasDto,
    @CurrentUser() user: any,
  ) {
    return this.arsipDinamisService.rejectVerifikasi(id, String(user.persnum), dto);
  }

  // ── Manager Views ───────────────────────────────────────────────

  /**
   * Statistik persetujuan (kartu dashboard manager)
   * GET /arsip-dinamis/persetujuan/statistik
   */
  @Get('persetujuan/statistik')
  @PemeliharaanAccess('persetujuan')
  async getStatistikPersetujuan(@CurrentUser() user: any) {
    return this.arsipDinamisService.getStatistikPersetujuan(String(user.persnum));
  }

  /**
   * Riwayat persetujuan (keputusan lampau manager: approved + rejected)
   * GET /arsip-dinamis/persetujuan/riwayat
   */
  @Get('persetujuan/riwayat')
  @PemeliharaanAccess('persetujuan')
  async getRiwayatPersetujuan(
    @CurrentUser() user: any,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.arsipDinamisService.getRiwayatPersetujuan(String(user.persnum), {
      search,
      status,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
    });
  }

  /**
   * Persetujuan Saya (unified: menunggu + approved + rejected + all)
   * GET /arsip-dinamis/persetujuan/saya?status=menunggu|approved|rejected|all
   */
  @Get('persetujuan/saya')
  @PemeliharaanAccess('persetujuan')
  async getPersetujuanSaya(
    @CurrentUser() user: any,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('sortBy') sortBy?: string,
    @Query('sortDir') sortDir?: string,
  ) {
    return this.arsipDinamisService.getPersetujuanSaya(String(user.persnum), {
      search,
      status,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
      sortBy,
      sortDir,
    });
  }

  /**
   * Daftar pengajuan penutupan (Manager)
   * GET /arsip-dinamis/persetujuan
   */
  @Get('persetujuan')
  @PemeliharaanAccess('persetujuan')
  async getPengajuanPenutupan(
    @CurrentUser() user: any,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.arsipDinamisService.getPengajuanPenutupan(String(user.persnum), {
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
    });
  }

  /**
   * Riwayat & retensi (Manager)
   * GET /arsip-dinamis/riwayat-retensi
   */
  @Get('riwayat-retensi')
  @RequirePermission('pemeliharaan.retensi', 'read')
  async getRiwayatRetensi(
    @Query('search') search?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.arsipDinamisService.getRiwayatRetensi({
      search,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
    });
  }
}
