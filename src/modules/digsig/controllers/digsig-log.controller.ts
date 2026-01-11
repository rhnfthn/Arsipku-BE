import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
  ParseUUIDPipe,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { DigsigLogService } from '../services/digsig-log.service';
import {
  CreateDigsigLogDto,
  FilterDigsigLogDto,
  DigsigLogPaginatedResponseDto,
} from '../dto/digsig-log.dto';
import { DigsigLogEntity } from '../entities/digsig-log.entity';
import { JwtAuthGuard } from '../../../common/guards';
import { CurrentUser } from '../../../common/decorators';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';

@Controller('digsig/log')
@UseGuards(JwtAuthGuard)
export class DigsigLogController {
  constructor(private readonly digsigLogService: DigsigLogService) {}

  /**
   * GET /digsig/log
   * Get all digsig logs with filtering and pagination
   * 
   * Query params:
   * - userPersnum: Filter by user persnum
   * - userName: Filter by user name (partial match)
   * - idNaskah: Filter by naskah ID
   * - nomorNaskah: Filter by nomor naskah (partial match)
   * - jenisNaskah: Filter by jenis naskah (ND, SDI, SDE, DI, KA)
   * - action: Filter by action (sign, verify, download, upload)
   * - status: Filter by status (sukses, gagal, pending)
   * - startDate: Filter from date (YYYY-MM-DD)
   * - endDate: Filter to date (YYYY-MM-DD)
   * - search: Search across nomor_naskah, user_name, note
   * - page: Page number (default: 1)
   * - limit: Items per page (default: 10)
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  async findAll(
    @Query() filter: FilterDigsigLogDto,
  ): Promise<DigsigLogPaginatedResponseDto> {
    return this.digsigLogService.findAll(filter);
  }

  /**
   * GET /digsig/log/statistics
   * Get statistics/summary for digsig dashboard
   */
  @Get('statistics')
  @HttpCode(HttpStatus.OK)
  async getStatistics(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('userPersnum') userPersnum?: number,
  ) {
    return this.digsigLogService.getStatistics({
      startDate,
      endDate,
      userPersnum,
    });
  }

  /**
   * GET /digsig/log/bsre-health
   * Check BSrE service health based on recent log failures
   * Used for "Gangguan BsrE" indicator in UI
   */
  @Get('bsre-health')
  @HttpCode(HttpStatus.OK)
  async checkBsreHealth() {
    return this.digsigLogService.checkBsreHealth();
  }

  /**
   * GET /digsig/log/my-logs
   * Get logs for current logged-in user
   */
  @Get('my-logs')
  @HttpCode(HttpStatus.OK)
  async getMyLogs(
    @CurrentUser() user: JwtPayload,
    @Query() filter: FilterDigsigLogDto,
  ): Promise<DigsigLogPaginatedResponseDto> {
    return this.digsigLogService.findByUser(user.persnum, filter);
  }

  /**
   * GET /digsig/log/naskah/:idNaskah
   * Get all logs for a specific naskah
   */
  @Get('naskah/:idNaskah')
  @HttpCode(HttpStatus.OK)
  async findByNaskah(
    @Param('idNaskah', ParseUUIDPipe) idNaskah: string,
    @Query() filter: FilterDigsigLogDto,
  ): Promise<DigsigLogPaginatedResponseDto> {
    return this.digsigLogService.findByNaskah(idNaskah, filter);
  }

  /**
   * GET /digsig/log/:id
   * Get single log by ID (includes bsreResponse for debugging)
   */
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<DigsigLogEntity> {
    return this.digsigLogService.findOne(id);
  }

  /**
   * POST /digsig/log
   * Manually create a log entry (for admin/testing purposes)
   * Normally logs are created automatically by DigsigService
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createLog(
    @Body() dto: CreateDigsigLogDto,
    @Req() req: Request,
  ): Promise<DigsigLogEntity> {
    // Auto-fill IP address from request if not provided
    if (!dto.ipAddress) {
      dto.ipAddress = this.getClientIp(req);
    }
    return this.digsigLogService.createLog(dto);
  }

  /**
   * Helper: Extract client IP from request
   */
  private getClientIp(req: Request): string {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') {
      return forwarded.split(',')[0].trim();
    }
    if (Array.isArray(forwarded)) {
      return forwarded[0];
    }
    return req.ip || req.socket?.remoteAddress || 'unknown';
  }
}
