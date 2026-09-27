/**
 * Controller reset database development — halaman konfigurasi superadmin.
 *
 * Endpoint: /admin/config/db-reset
 * Akses: SUPERADMIN saja (RolesGuard) + permission konfigurasi.
 * Hanya aktif di environment development.
 */
import {
  Controller,
  Get,
  Post,
  Param,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { DbResetService } from '../services/db-reset.service';
import { Roles, RequirePermission } from '../../../common/decorators';
import { RolesGuard, JwtAuthGuard } from '../../../common/guards';

@Controller('admin/config/db-reset')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminDbResetController {
  constructor(private readonly dbResetService: DbResetService) {}

  /**
   * GET /admin/config/db-reset/stats/:level
   * Ringkasan jumlah baris tabel target (read-only) untuk ditampilkan di UI.
   */
  @Roles('superadmin')
  @RequirePermission('konfigurasi', 'read')
  @Get('stats/:level')
  async getStats(@Param('level') level: 'level1' | 'level2' | 'level3') {
    return this.dbResetService.getStats(level);
  }

  /**
   * POST /admin/config/db-reset/execute/:level
   * Eksekusi reset sesuai level runbook.
   * DELETE berurutan dalam satu transaction + verifikasi + commit/rollback.
   */
  @Roles('superadmin')
  @RequirePermission('konfigurasi', 'update')
  @HttpCode(HttpStatus.OK)
  @Post('execute/:level')
  async execute(@Param('level') level: 'level1' | 'level2' | 'level3') {
    return this.dbResetService.execute(level);
  }
}