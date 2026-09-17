import {
  Controller,
  Get,
  Put,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ConfigSearchService } from '../services';
import { UpdateSearchConfigDto } from '../dto/update-search-config.dto';
import { ConfigSearch } from '../entities/config-search.entity';
import { JwtAuthGuard } from '../../../common/guards';
import { RequirePermission } from '../../../common/decorators';

/**
 * Admin Controller untuk konfigurasi mesin pencarian
 * Endpoint: /admin/config/search
 * Note: PermissionGuard berjalan global (APP_GUARD), cukup @RequirePermission di method.
 */
@Controller('admin/config/search')
@UseGuards(JwtAuthGuard)
export class AdminConfigSearchController {
  constructor(private readonly configSearchService: ConfigSearchService) {}

  /**
   * GET /admin/config/search
   * Mengambil konfigurasi mesin pencarian
   */
  @Get()
  @RequirePermission('smart-search', 'read')
  async getConfig(): Promise<ConfigSearch> {
    return this.configSearchService.getConfig();
  }

  /**
   * PUT /admin/config/search
   * Update konfigurasi mesin pencarian (mode: v3 | meili)
   */
  @Put()
  @HttpCode(HttpStatus.OK)
  @RequirePermission('konfigurasi', 'update')
  async update(@Body() dto: UpdateSearchConfigDto): Promise<ConfigSearch> {
    return this.configSearchService.update(dto);
  }
}
