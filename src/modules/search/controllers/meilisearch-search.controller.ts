import {
  Controller,
  Get,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { MeilisearchSearchService } from '../services/meilisearch-search.service';
import { MeilisearchService } from '../services/meilisearch.service';
import {
  GlobalSearchDto,
  GlobalSearchResponseDto,
} from '../dto/global-search.dto';
import { JwtAuthGuard } from '../../../common/guards';
import { CurrentUser, RequirePermission } from '../../../common/decorators';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';

/**
 * Controller untuk Meilisearch Global Search (v2)
 *
 * Endpoints:
 * - GET /search/v2 - Pencarian menggunakan Meilisearch
 * - GET /search/v2/stats - Statistik index Meilisearch
 */
@ApiTags('Search v2 (Meilisearch)')
@Controller('search/v2')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class MeilisearchSearchController {
  constructor(
    private readonly meilisearchSearchService: MeilisearchSearchService,
    private readonly meilisearchService: MeilisearchService,
  ) {}

  /**
   * GET /search/v2
   *
   * Pencarian global menggunakan Meilisearch
   * Mendukung semua filter yang sama dengan /search (SQL)
   *
   * Keunggulan dibanding SQL:
   * - Typo-tolerant search
   * - Faster full-text search
   * - Better relevance ranking
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Search with Meilisearch (v2)' })
  @RequirePermission('smart-search', 'search')
  async search(
    @Query() dto: GlobalSearchDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<GlobalSearchResponseDto> {
    // Check if Meilisearch is available
    if (!this.meilisearchService.isAvailable()) {
      return {
        success: false,
        message: 'Meilisearch is not available. Please check configuration.',
        data: {
          items: [],
          pagination: {
            page: dto.page || 1,
            limit: dto.limit || 20,
            total: 0,
            totalPages: 0,
          },
          filters: {
            applied: [],
            keyword: dto.keyword,
          },
        },
      };
    }

    const positionId = dto.position_id || user.position;
    return this.meilisearchSearchService.search(dto, positionId, user.persnum);
  }

  /**
   * GET /search/v2/stats
   *
   * Get Meilisearch index statistics
   */
  @Get('stats')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get Meilisearch index stats' })
  @RequirePermission('smart-search', 'search')
  async getStats() {
    if (!this.meilisearchService.isAvailable()) {
      return {
        success: false,
        message: 'Meilisearch is not available',
        data: null,
      };
    }

    const stats = await this.meilisearchService.getStats();
    return {
      success: true,
      message: 'Index stats retrieved',
      data: stats,
    };
  }

  /**
   * GET /search/v2/health
   *
   * Check Meilisearch health
   */
  @Get('health')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Check Meilisearch health' })
  @RequirePermission('smart-search', 'search')
  async health() {
    const isAvailable = this.meilisearchService.isAvailable();
    return {
      success: true,
      message: isAvailable
        ? 'Meilisearch is healthy'
        : 'Meilisearch is not available',
      data: {
        available: isAvailable,
      },
    };
  }
}
