import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { CacheInterceptor, CacheTTL } from '@nestjs/cache-manager';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AuditAnomalyService } from '../services/audit-anomaly.service';
import { AnomalyFilterDto } from '../dto/anomaly-filter.dto';
import { UpdateAnomalyDto } from '../dto/update-anomaly.dto';
import { JwtAuthGuard, RolesGuard } from '../../../common/guards';
import { Roles, CurrentUser } from '../../../common/decorators';
import { RoleName } from '../../../common/enums/role-name.enum';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';

/**
 * Controller API Audit Anomaly — Super Admin only.
 *
 * Semua endpoint dilindungi JwtAuthGuard + RolesGuard(SUPERADMIN).
 */
@ApiTags('Audit')
@ApiBearerAuth()
@Controller('audit')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleName.SUPERADMIN)
export class AuditAnomalyController {
  constructor(private readonly anomalyService: AuditAnomalyService) {}

  /**
   * GET /audit/anomalies — list alert anomali.
   */
  @Get('anomalies')
  async listAnomalies(@Query() filter: AnomalyFilterDto) {
    const result = await this.anomalyService.findAll(filter);
    return { success: true, ...result };
  }

  /**
   * GET /audit/anomalies/summary — ringkasan count anomali.
   * PENTING: route ini harus dideklarasikan SEBELUM anomalies/:id
   * agar tidak tertangkap sebagai :id="summary".
   */
  @Get('anomalies/summary')
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(300_000)
  async getAnomalySummary() {
    const summary = await this.anomalyService.getSummary();
    return { success: true, data: summary };
  }

  /**
   * GET /audit/anomalies/unread-count — jumlah anomali belum dibaca (NEW).
   * Dipakai oleh badge notifikasi topbar Super Admin.
   * PENTING: route ini juga harus dideklarasikan SEBELUM anomalies/:id.
   */
  @Get('anomalies/unread-count')
  async getUnreadCount() {
    const count = await this.anomalyService.getUnreadCount();
    return { success: true, data: { count } };
  }

  /**
   * GET /audit/anomalies/:id — detail alert.
   */
  @Get('anomalies/:id')
  async getAnomaly(@Param('id') id: string) {
    const anomaly = await this.anomalyService.findOne(id);
    if (!anomaly) {
      return { success: false, message: 'Anomali tidak ditemukan', data: null };
    }
    return { success: true, data: anomaly };
  }

  /**
   * PATCH /audit/anomalies/:id — update status alert.
   */
  @Patch('anomalies/:id')
  async updateAnomaly(
    @Param('id') id: string,
    @Body() dto: UpdateAnomalyDto,
    @CurrentUser() user?: JwtPayload,
  ) {
    // handledBy: gunakan persnum jika ada (snapshot siapa yang handle)
    const handledBy = user?.persnum ? String(user.persnum) : null;
    const updated = await this.anomalyService.updateStatus(id, dto, handledBy);
    if (!updated) {
      return { success: false, message: 'Anomali tidak ditemukan', data: null };
    }
    return { success: true, data: updated };
  }

  /**
   * GET /audit/notifications — notifikasi anomali terbaru untuk Super Admin.
   */
  @Get('notifications')
  async getNotifications(@Query('limit') limit?: string) {
    const parsedLimit = limit ? parseInt(limit, 10) : 10;
    const safeLimit =
      isNaN(parsedLimit) || parsedLimit < 1 ? 10 : Math.min(parsedLimit, 50);
    const data = await this.anomalyService.getRecentNotifications(safeLimit);
    return { success: true, data };
  }
}
