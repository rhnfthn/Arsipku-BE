import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { DashboardService } from '../services/dashboard.service';
import { DashboardResponseDto } from '../dto/dashboard.dto';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  /**
   * GET /dashboard/:position_id
   * 
   * Mendapatkan data dashboard berdasarkan position_id
   * 
   * Response:
   * - summary: pesan_baru, surat_terkirim, disposisi_masuk, draft_tersimpan
   * - surat_masuk_terbaru: 10 surat terbaru yang diterima
   * - statistik: statistik surat masuk & keluar 6 bulan terakhir
   */
  @Get(':position_id')
  async getDashboard(
    @Param('position_id', ParseIntPipe) positionId: number,
  ): Promise<DashboardResponseDto> {
    return this.dashboardService.getDashboardData(positionId);
  }
}
