import { Controller, Get, Param } from '@nestjs/common';
import { InjectConnection } from '@nestjs/typeorm';
import { Connection } from 'typeorm';
import { ArsipService } from '../services/arsip.service';

@Controller('api/arsip')
export class ArsipController {
  constructor(
    @InjectConnection('archiveConnection')
    private readonly archiveConnection: Connection,
    private readonly arsipService: ArsipService,
  ) {}

  /**
   * Daftar arsip yang sudah dibackup (untuk halaman tracking backup).
   */
  @Get('backup-status')
  async backupStatus() {
    return {
      status: 'success',
      data: await this.arsipService.getBackupStatus(),
    };
  }

  /**
   * Detail berkas + naskah dari DB arsip (fallback saat berkas sudah
   * soft-deleted di DB inti). GET /api/arsip/berkas/:id
   */
  @Get('berkas/:id')
  async getArchivedBerkas(@Param('id') id: string) {
    return {
      status: 'success',
      data: await this.arsipService.getArchivedBerkasDetail(id),
    };
  }

  /**
   * Health check koneksi ke database arsipku_arsip_local.
   */
  @Get('health')
  async healthCheck() {
    try {
      const result = await this.archiveConnection.query('SELECT 1 AS ok');
      const tables = await this.archiveConnection.query(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() ORDER BY table_name`,
      );
      return {
        status: 'success',
        message: 'Koneksi ke database arsip berhasil',
        database: (
          await this.archiveConnection.query('SELECT DATABASE() AS db')
        )[0].db,
        ok: result[0]?.ok === 1,
        tables: tables.map((t: any) => t.table_name),
      };
    } catch (error: any) {
      return {
        status: 'error',
        message: 'Gagal koneksi ke database arsip',
        error: error?.message ?? String(error),
      };
    }
  }
}
