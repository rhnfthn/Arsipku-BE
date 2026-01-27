import { Controller, Get, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
import { DashboardService } from '../services/dashboard.service';
import { DashboardResponseDto } from '../dto/dashboard.dto';
import { JwtAuthGuard } from '../../../common/guards';
import { CurrentUser } from '../../../common/decorators';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';

@Controller('dashboard')
@UseGuards(JwtAuthGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  /**
   * GET /dashboard
   * 
   * Mendapatkan data dashboard berdasarkan user yang login (dari JWT)
   * Menggunakan position dan persnum dari JWT untuk query
   * 
   * Response:
   * - summary: pesan_baru, surat_terkirim, disposisi_masuk, draft_tersimpan
   * - surat_masuk_terbaru: 10 surat terbaru yang diterima
   * - statistik: statistik surat masuk & keluar 6 bulan terakhir
   */
  @Get()
  async getDashboard(
    @CurrentUser() user: JwtPayload,
  ): Promise<DashboardResponseDto> {
    const positionId = parseInt(user.position, 10);
    return this.dashboardService.getDashboardData(positionId, user.persnum);
  }
}
