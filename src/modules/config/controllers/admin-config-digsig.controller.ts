import {
  Controller,
  Get,
  Put,
  Patch,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ConfigDigsigService } from '../services';
import { UpdateDigsigConfigDto, BulkUpdateDigsigConfigDto } from '../dto';
import { ConfigDigsig, JenisNaskah, TtdMode } from '../entities';
import { JwtAuthGuard } from '../../../common/guards';
import { RequirePermission } from '../../../common/decorators';

/**
 * Admin Controller untuk konfigurasi Digsig
 * Endpoint: /admin/config/digsig
 * Note: PermissionGuard berjalan global (APP_GUARD), cukup @RequirePermission di method.
 */
@Controller('admin/config/digsig')
@UseGuards(JwtAuthGuard)
export class AdminConfigDigsigController {
  constructor(private readonly configDigsigService: ConfigDigsigService) {}

  /**
   * GET /admin/config/digsig
   * Mengambil semua konfigurasi digsig
   */
  @Get()
  @RequirePermission('konfigurasi', 'read')
  async findAll(): Promise<ConfigDigsig[]> {
    return this.configDigsigService.findAll();
  }

  /**
   * GET /admin/config/digsig/:jenis
   * Mengambil konfigurasi berdasarkan jenis naskah
   */
  @Get(':jenis')
  @RequirePermission('konfigurasi', 'read')
  async findByJenis(@Param('jenis') jenis: JenisNaskah): Promise<ConfigDigsig> {
    return this.configDigsigService.findByJenis(jenis);
  }

  /**
   * PUT /admin/config/digsig
   * Update single konfigurasi
   */
  @Put()
  @HttpCode(HttpStatus.OK)
  @RequirePermission('konfigurasi', 'update')
  async update(@Body() dto: UpdateDigsigConfigDto): Promise<ConfigDigsig> {
    return this.configDigsigService.update(dto);
  }

  /**
   * PUT /admin/config/digsig/bulk
   * Bulk update konfigurasi
   */
  @Put('bulk')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('konfigurasi', 'update')
  async bulkUpdate(
    @Body() dto: BulkUpdateDigsigConfigDto,
  ): Promise<ConfigDigsig[]> {
    return this.configDigsigService.bulkUpdate(dto.configs);
  }

  /**
   * PATCH /admin/config/digsig/:jenis/toggle/:mode
   * Toggle satu mode on/off untuk jenis naskah tertentu
   */
  @Patch(':jenis/toggle/:mode')
  @RequirePermission('konfigurasi', 'update')
  async toggle(
    @Param('jenis') jenis: JenisNaskah,
    @Param('mode') mode: TtdMode,
  ): Promise<ConfigDigsig> {
    return this.configDigsigService.toggle(jenis, mode);
  }
}
