import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  ConfigNaskahLainnyaService,
  type UpdateNaskahLainnyaConfigDto,
} from '../services';
import { ConfigNaskahLainnya } from '../entities';
import { JwtAuthGuard } from '../../../common/guards';
import { RequirePermission } from '../../../common/decorators';

/**
 * Admin Controller untuk konfigurasi Naskah Lainnya (Legal Drafting default +
 * default klasifikasi per jenis).
 * Endpoint: /admin/config/naskah-lainnya
 */
@Controller('admin/config/naskah-lainnya')
@UseGuards(JwtAuthGuard)
export class AdminConfigNaskahLainnyaController {
  constructor(
    private readonly configNaskahLainnyaService: ConfigNaskahLainnyaService,
  ) {}

  /** GET /admin/config/naskah-lainnya — semua jenis (yang belum diset → default). */
  @Get()
  @RequirePermission('konfigurasi', 'read-naskah-lainnya')
  async findAll(): Promise<ConfigNaskahLainnya[]> {
    return this.configNaskahLainnyaService.findAll();
  }

  /** PUT /admin/config/naskah-lainnya/:jenis — set/timpa konfigurasi satu jenis. */
  @Put(':jenis')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('konfigurasi', 'update')
  async update(
    @Param('jenis') jenis: string,
    @Body() dto: UpdateNaskahLainnyaConfigDto,
  ): Promise<ConfigNaskahLainnya> {
    return this.configNaskahLainnyaService.update(jenis.toUpperCase(), dto);
  }
}
