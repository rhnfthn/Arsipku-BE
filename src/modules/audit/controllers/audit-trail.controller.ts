import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Res,
  BadRequestException,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { CacheInterceptor, CacheTTL } from '@nestjs/cache-manager';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import type { Response } from 'express';
import { AuditTrailService } from '../services/audit-trail.service';
import { AuditFilterDto } from '../dto/audit-filter.dto';
import { MyActivityFilterDto } from '../dto/my-activity-filter.dto';
import { JwtAuthGuard, RolesGuard } from '../../../common/guards';
import { Roles, CurrentUser, RequirePermission } from '../../../common/decorators';
import { RoleName } from '../../../common/enums/role-name.enum';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';

/**
 * Controller API Audit Trail — Super Admin only.
 *
 * Semua endpoint dilindungi JwtAuthGuard + RolesGuard(SUPERADMIN).
 * Tidak mengubah logic bisnis utama Arsipku.
 */
@ApiTags('Audit')
@ApiBearerAuth()
@Controller('audit')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleName.SUPERADMIN)
export class AuditTrailController {
  constructor(private readonly auditTrailService: AuditTrailService) {}

  /**
   * GET /audit/logs — list log dengan filter dan pagination.
   */
  @Get('logs')
  @RequirePermission('audit', 'read-log')
  async listLogs(@Query() filter: AuditFilterDto) {
    const result = await this.auditTrailService.findAll(filter);
    return { success: true, ...result };
  }

  /**
   * GET /audit/active-users — akun dengan sesi login yang masih berlaku.
   */
  @Get('active-users')
  @RequirePermission('audit', 'read-log')
  async listActiveUsers() {
    const data = await this.auditTrailService.findActiveUsers();
    return { success: true, data };
  }

  /**
   * GET /audit/logs/:id — detail log.
   */
  @Get('logs/:id')
  @RequirePermission('audit', 'read-log')
  async getLog(@Param('id') id: string) {
    const log = await this.auditTrailService.findOne(id);
    if (!log) {
      return { success: false, message: 'Log tidak ditemukan', data: null };
    }
    return { success: true, data: log };
  }

  /**
   * GET /audit/logs/:id/metadata — metadata lengkap (old_value, new_value, metadata).
   */
  @Get('logs/:id/metadata')
  @RequirePermission('audit', 'read-log')
  async getLogMetadata(@Param('id') id: string) {
    const log = await this.auditTrailService.findOne(id);
    if (!log) {
      return { success: false, message: 'Log tidak ditemukan', data: null };
    }
    return {
      success: true,
      data: {
        id: (log as any)._id?.toString?.() ?? (log as any).id,
        oldValue: log.oldValue,
        newValue: log.newValue,
        metadata: log.metadata,
        errorMessage: log.errorMessage,
      },
    };
  }

  /**
   * GET /audit/report/summary — ringkasan dashboard.
   */
  @Get('report/summary')
  @RequirePermission('audit', 'read-report')
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(300_000)
  async getSummary(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('action') action?: string,
    @Query('module') module?: string,
    @Query('userRole') userRole?: string,
    @Query('search') search?: string,
  ) {
    const summary = await this.auditTrailService.getSummary(
      startDate,
      endDate,
      action,
      module,
      userRole,
      search,
    );
    return { success: true, data: summary };
  }

  /**
   * GET /audit/report/daily-activity — aktivitas harian untuk chart (default 7 hari).
   */
  @Get('report/daily-activity')
  @RequirePermission('audit', 'read-report')
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(300_000)
  async getDailyActivity(@Query('days') days?: string) {
    const parsedDays = days ? parseInt(days, 10) : 7;
    const safeDays =
      isNaN(parsedDays) || parsedDays < 1 ? 7 : Math.min(parsedDays, 90);
    const data = await this.auditTrailService.getDailyActivity(safeDays);
    return { success: true, data };
  }

  /**
   * POST /audit/report/export — export laporan (mock CSV).
   *
   * Mengembalikan CSV sederhana dari log sesuai filter.
   * Integrasi PDF/Excel library bisa ditambahkan kemudian tanpa mengubah
   * endpoint ini.
   */
  @Post('report/export')
  @RequirePermission('audit', 'export')
  async exportReport(@Query() filter: AuditFilterDto, @Res() res: Response) {
    // Ambil semua data sesuai filter (limit tinggi untuk export)
    const exportFilter: AuditFilterDto = {
      ...filter,
      page: 1,
      limit: 1000,
    };
    const result = await this.auditTrailService.findAll(exportFilter);
    const rows = result.data;

    const header = [
      'id',
      'created_at',
      'user_name',
      'user_role',
      'action',
      'module',
      'entity_type',
      'entity_id',
      'description',
      'status',
      'ip_address',
      'request_method',
      'request_url',
    ].join(',');

    const escapeCsv = (val: any) => {
      if (val === null || val === undefined) return '';
      const s = String(val).replace(/"/g, '""');
      return `"${s}"`;
    };

    const lines = rows.map((r: any) =>
      [
        (r._id ?? r.id)?.toString?.() ?? '',
        r.createdAt ? new Date(r.createdAt).toISOString() : '',
        r.userName,
        r.userRole,
        r.action,
        r.module,
        r.entityType,
        r.entityId,
        r.description,
        r.status,
        r.ipAddress,
        r.requestMethod,
        r.requestUrl,
      ]
        .map(escapeCsv)
        .join(','),
    );

    const csv = [header, ...lines].join('\n');
    const filename = `audit-trail-${Date.now()}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  }

  /**
   * GET /audit/my-activities — riwayat aktivitas user yang sedang login.
   *
   * Endpoint ini TIDAK memerlukan role Super Admin.
   * Hanya butuh JWT valid (JwtAuthGuard). RolesGuard di-override dengan
   * @Roles() kosong agar semua role (ADMIN, USER, SUPERADMIN) bisa akses.
   * Filter strict: hanya log milik user_id atau persnum dari JWT.
   */
  @Get('my-activities')
  @Roles() // override class-level @Roles(SUPERADMIN) → semua role boleh
  async getMyActivities(
    @CurrentUser() user: JwtPayload,
    @Query() filter: MyActivityFilterDto,
  ) {
    // persnum wajib ada di JWT; userId tidak selalu ada → gunakan persnum sebagai fallback
    const userId = (user as any)?.id ?? (user as any)?.sub ?? null;
    const persnum = user?.persnum ?? null;
    const result = await this.auditTrailService.findMyActivities(
      userId,
      persnum,
      filter,
    );
    return { success: true, ...result };
  }

  /**
   * GET /audit/my-activities/:id — detail aktivitas saya.
   *
   * Hanya mengembalikan data jika log milik user yang login.
   * Tidak menampilkan field sensitif (oldValue, newValue, metadata, dll).
   */
  @Get('my-activities/:id')
  @Roles() // override class-level @Roles(SUPERADMIN) → semua role boleh
  async getMyActivityDetail(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    const userId = (user as any)?.id ?? (user as any)?.sub ?? null;
    const persnum = user?.persnum ?? null;
    const data = await this.auditTrailService.findOneMyActivity(
      id,
      userId,
      persnum,
    );
    if (!data) {
      return { success: false, message: 'Aktivitas tidak ditemukan', data: null };
    }
    return { success: true, data };
  }
}
