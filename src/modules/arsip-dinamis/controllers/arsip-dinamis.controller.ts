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
  @RequirePermission('pemeliharaan.pemberkasan', 'read')
  async getKlasifikasiDenganRetensi() {
    const data = await this.klasifikasiRepository.find({
      where: { active: 1 },
      select: [
        'id',
        'klasifikasi',
        'klasifikasi_text',
        'retensi_aktif_tahun',
        'retensi_inaktif_tahun',
      ],
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
  @RequirePermission('pemeliharaan.pemberkasan', 'create')
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
  @RequirePermission('pemeliharaan.pemberkasan', 'create')
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
  @RequirePermission('pemeliharaan.pemberkasan', 'read')
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
  @RequirePermission('pemeliharaan.pemberkasan', 'read')
  async findAllBerkas(
    @CurrentUser() user: any,
    @Query('status') status?: string,
    @Query('klasifikasi') klasifikasi?: string,
    @Query('tahun') tahun?: string,
    @Query('search') search?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.arsipDinamisService.findAllBerkas(user.persnum, {
      status,
      klasifikasi,
      tahun,
      search,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
    });
  }

  /**
   * Daftar berkas milik user dengan retensi aktif habis & status Tertutup.
   * Dipakai oleh modul Pemindahan Arsip Aktif ke Inaktif.
   * GET /arsip-dinamis/berkas-saya/retensi-habis
   */
  @Get('berkas-saya/retensi-habis')
  @RequirePermission('pemeliharaan.pemberkasan', 'read')
  async findBerkasRetensiHabis(
    @CurrentUser() user: any,
    @Query('search') search?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.arsipDinamisService.findBerkasRetensiHabis(user.persnum, {
      search,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 100,
    });
  }

  /**
   * Statistik berkas (summary cards)
   * GET /arsip-dinamis/berkas/statistik
   */
  @Get('berkas/statistik')
  @RequirePermission('pemeliharaan.pemberkasan', 'read')
  async getStatistikBerkas(@CurrentUser() user: any) {
    return this.arsipDinamisService.getStatistikBerkas(user.persnum);
  }

  /**
   * Detail berkas
   * GET /arsip-dinamis/berkas/:id
   */
  @Get('berkas/:id')
  @RequirePermission('pemeliharaan.pemberkasan', 'read')
  async findOneBerkas(@Param('id') id: string) {
    return this.arsipDinamisService.getDetailBerkas(id);
  }

  /**
   * Update berkas
   * PUT /arsip-dinamis/berkas/:id
   */
  @Put('berkas/:id')
  @RequirePermission('pemeliharaan.pemberkasan', 'update')
  async updateBerkas(
    @Param('id') id: string,
    @Body() dto: UpdateArsipDinamisBerkasDto,
    @CurrentUser() user: any,
  ) {
    return this.arsipDinamisService.updateBerkas(id, dto, user.persnum);
  }

  /**
   * Aktifkan berkas (Draft → Aktif)
   * PATCH /arsip-dinamis/berkas/:id/activate
   */
  @Patch('berkas/:id/activate')
  @RequirePermission('pemeliharaan.pemberkasan', 'update')
  async activateBerkas(@Param('id') id: string, @CurrentUser() user: any) {
    return this.arsipDinamisService.activateBerkas(id, user.persnum);
  }

  /**
   * Soft delete berkas (hanya Draft)
   * DELETE /arsip-dinamis/berkas/:id
   */
  @Delete('berkas/:id')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('pemeliharaan.pemberkasan', 'delete')
  async softDeleteBerkas(@Param('id') id: string, @CurrentUser() user: any) {
    return this.arsipDinamisService.softDeleteBerkas(id, user.persnum);
  }

  // ── Naskah dalam Berkas ─────────────────────────────────────────

  /**
   * Daftar naskah dalam berkas
   * GET /arsip-dinamis/berkas/:id/naskah
   */
  @Get('berkas/:id/naskah')
  @RequirePermission('pemeliharaan.pemberkasan', 'read')
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
   * Tambah naskah ke berkas
   * POST /arsip-dinamis/berkas/:id/naskah
   */
  @Post('berkas/:id/naskah')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('pemeliharaan.pemberkasan', 'add-naskah')
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
  @RequirePermission('pemeliharaan.pemberkasan', 'add-naskah')
  async removeNaskahFromBerkas(
    @Param('id') id: string,
    @Param('naskahId') naskahId: string,
    @CurrentUser() user: any,
  ) {
    return this.arsipDinamisService.removeNaskahFromBerkas(
      id,
      naskahId,
      user.persnum,
    );
  }

  /**
   * Naskah siap arsip (filtered view untuk tab "Siap Arsip")
   * GET /arsip-dinamis/berkas/:id/naskah-siap-arsip
   */
  @Get('berkas/:id/naskah-siap-arsip')
  @RequirePermission('pemeliharaan.pemberkasan', 'read')
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
    return this.arsipDinamisService.getNaskahSaya(
      user.persnum,
      t as 'kotak_masuk' | 'terkirim',
      {
        search,
        page: page ? Number(page) : 1,
        limit: limit ? Number(limit) : 50,
      },
    );
  }

  // ── Penutupan & Verifikasi ──────────────────────────────────────

  /**
   * Ajukan penutupan berkas
   * POST /arsip-dinamis/berkas/:id/ajukan-tutup
   */
  @Post('berkas/:id/ajukan-tutup')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('pemeliharaan.pemberkasan', 'ajukan-tutup')
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
  @RequirePermission('pemeliharaan.pemberkasan', 'read')
  async getVerifikasiDetail(@Param('id') id: string) {
    return this.arsipDinamisService.getVerifikasiDetail(id);
  }

  /**
   * Approve verifikasi penutupan (Manager)
   * POST /arsip-dinamis/berkas/:id/approve
   */
  @Post('berkas/:id/approve')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('pemeliharaan.verifikasi', 'approve')
  async approveVerifikasi(
    @Param('id') id: string,
    @Body() dto: VerifikasiBerkasDto,
    @CurrentUser() user: any,
  ) {
    return this.arsipDinamisService.approveVerifikasi(
      id,
      String(user.persnum),
      dto,
    );
  }

  /**
   * Reject verifikasi penutupan (Manager)
   * POST /arsip-dinamis/berkas/:id/reject
   */
  @Post('berkas/:id/reject')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('pemeliharaan.verifikasi', 'reject')
  async rejectVerifikasi(
    @Param('id') id: string,
    @Body() dto: VerifikasiBerkasDto,
    @CurrentUser() user: any,
  ) {
    return this.arsipDinamisService.rejectVerifikasi(
      id,
      String(user.persnum),
      dto,
    );
  }

  // ── Manager Views ───────────────────────────────────────────────

  /**
   * Statistik persetujuan (kartu dashboard manager)
   * GET /arsip-dinamis/persetujuan/statistik
   */
  @Get('persetujuan/statistik')
  @RequirePermission('pemeliharaan.verifikasi', 'read')
  async getStatistikPersetujuan(@CurrentUser() user: any) {
    return this.arsipDinamisService.getStatistikPersetujuan(
      String(user.persnum),
    );
  }

  /**
   * Daftar pengajuan penutupan (Manager)
   * GET /arsip-dinamis/persetujuan
   */
  @Get('persetujuan')
  @RequirePermission('pemeliharaan.verifikasi', 'read')
  async getPengajuanPenutupan(
    @CurrentUser() user: any,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.arsipDinamisService.getPengajuanPenutupan(
      String(user.persnum),
      {
        page: page ? Number(page) : 1,
        limit: limit ? Number(limit) : 20,
      },
    );
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
