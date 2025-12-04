import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { DashboardUserService } from './dashboard-user.service';
import { DashboardUserResponseDto } from './dashboard-user.dto';

@Controller('dashboard/user')
export class DashboardUserController {
  constructor(private readonly dashboardUserService: DashboardUserService) {}

  /**
   * GET /dashboard/user/:position_id
   * 
   * Mendapatkan data dashboard untuk user berdasarkan position_id
   * 
   * Response:
   * - summary: pesan_baru, surat_terkirim, disposisi_masuk, draft_tersimpan
   * - surat_masuk_terbaru: 10 surat terbaru yang diterima
   * - statistik: statistik surat masuk & keluar 6 bulan terakhir
   */
  @Get(':position_id')
  async getDashboard(
    @Param('position_id', ParseIntPipe) positionId: number,
  ): Promise<DashboardUserResponseDto> {
    return this.dashboardUserService.getDashboardData(positionId);
  }
}
