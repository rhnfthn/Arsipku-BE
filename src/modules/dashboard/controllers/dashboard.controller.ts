import { Controller, Get, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
import { DashboardService } from '../services/dashboard.service';
import { RealtimeSummaryService } from '../services/realtime-summary.service';
import { DashboardResponseDto } from '../dto/dashboard.dto';
import { JwtAuthGuard } from '../../../common/guards';
import { CurrentUser, RequirePermission } from '../../../common/decorators';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';

@Controller('dashboard')
@UseGuards(JwtAuthGuard)
export class DashboardController {
  constructor(
    private readonly dashboardService: DashboardService,
    private readonly realtimeSummaryService: RealtimeSummaryService,
  ) {}

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
  @RequirePermission('dashboard', 'read')
  async getDashboard(
    @CurrentUser() user: JwtPayload,
  ): Promise<DashboardResponseDto> {
    const positionId = parseInt(user.position, 10);
    return this.dashboardService.getDashboardData(positionId, user.persnum);
  }

  /**
   * GET /dashboard/realtime
   *
   * Endpoint agregat untuk polling sidebar (counter + label counts + bsre alert).
   * In-memory cache 15 detik per user, dipakai untuk mengurangi beban DB
   * saat banyak user online.
   */
  @Get('realtime')
  @RequirePermission('dashboard', 'read')
  async getRealtimeSummary(@CurrentUser() user: JwtPayload) {
    return this.realtimeSummaryService.getSummary(user.position);
  }
}
