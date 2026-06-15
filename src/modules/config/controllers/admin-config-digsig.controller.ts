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
import { JwtAuthGuard, RolesGuard } from '../../../common/guards';
import { Roles } from '../../../common/decorators';

/**
 * Admin Controller untuk konfigurasi Digsig
 * Endpoint: /admin/config/digsig
 */
@Controller('admin/config/digsig')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'superadmin')
export class AdminConfigDigsigController {
  constructor(private readonly configDigsigService: ConfigDigsigService) {}

  /**
   * GET /admin/config/digsig
   * Mengambil semua konfigurasi digsig
   */
  @Get()
  async findAll(): Promise<ConfigDigsig[]> {
    return this.configDigsigService.findAll();
  }

  /**
   * GET /admin/config/digsig/:jenis
   * Mengambil konfigurasi berdasarkan jenis naskah
   */
  @Get(':jenis')
  async findByJenis(@Param('jenis') jenis: JenisNaskah): Promise<ConfigDigsig> {
    return this.configDigsigService.findByJenis(jenis);
  }

  /**
   * PUT /admin/config/digsig
   * Update single konfigurasi
   */
  @Put()
  @HttpCode(HttpStatus.OK)
  async update(@Body() dto: UpdateDigsigConfigDto): Promise<ConfigDigsig> {
    return this.configDigsigService.update(dto);
  }

  /**
   * PUT /admin/config/digsig/bulk
   * Bulk update konfigurasi
   */
  @Put('bulk')
  @HttpCode(HttpStatus.OK)
  async bulkUpdate(@Body() dto: BulkUpdateDigsigConfigDto): Promise<ConfigDigsig[]> {
    return this.configDigsigService.bulkUpdate(dto.configs);
  }

  /**
   * PATCH /admin/config/digsig/:jenis/toggle/:mode
   * Toggle satu mode on/off untuk jenis naskah tertentu
   */
  @Patch(':jenis/toggle/:mode')
  async toggle(
    @Param('jenis') jenis: JenisNaskah,
    @Param('mode') mode: TtdMode,
  ): Promise<ConfigDigsig> {
    return this.configDigsigService.toggle(jenis, mode);
  }
}
