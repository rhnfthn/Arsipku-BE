import {
  Controller,
  Get,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { SearchV3Service } from '../services/search-v3.service';
import { GlobalSearchDto, SearchV3ResponseDto } from '../dto/search-v3.dto';
import {
  SearchSuggestionDto,
  SearchSuggestionResponseDto,
} from '../dto/search-suggestion.dto';
import { JwtAuthGuard } from '../../../common/guards';
import { CurrentUser } from '../../../common/decorators';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';

/**
 * Controller for Search V3
 *
 * SQL-only search with Meilisearch-like features:
 * - Typo tolerance (LIKE-based)
 * - Relevance ranking
 * - Highlighting
 * - Faceted search
 *
 * Endpoints:
 * - GET /search/v3 - Main search
 * - GET /search/v3/suggestions - Autocomplete suggestions
 */
@Controller('search')
@UseGuards(JwtAuthGuard)
export class SearchV3Controller {
  constructor(private readonly searchV3Service: SearchV3Service) {}

  /**
   * GET /search/v3
   *
   * Search naskah with all filters and Meilisearch-like features.
   * Same query parameters as /search/v2 (Meilisearch)
   *
   * @param dto - GlobalSearchDto with all filter options
   * @param user - JWT payload with user info
   * @returns SearchV3ResponseDto with items, pagination, filters, and facets
   */
  @Get('v3')
  @HttpCode(HttpStatus.OK)
  async search(
    @Query() dto: GlobalSearchDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<SearchV3ResponseDto> {
    const positionId = dto.position_id || user.position;
    return this.searchV3Service.search(dto, positionId, user.persnum);
  }

  /**
   * GET /search/v3/suggestions
   *
   * Autocomplete suggestions for pengirim/penerima.
   * Search by nama or jabatan (position_text).
   *
   * Query params:
   * - q: Search query (min 3 characters)
   * - type: pengirim | penerima | all (default: all)
   * - limit: Max results (default: 10, max: 30)
   *
   * Examples:
   * - GET /search/v3/suggestions?q=ahmad&type=pengirim
   * - GET /search/v3/suggestions?q=kepala&type=penerima
   * - GET /search/v3/suggestions?q=manajer
   */
  @Get('v3/suggestions')
  @HttpCode(HttpStatus.OK)
  async getSuggestions(
    @Query() dto: SearchSuggestionDto,
  ): Promise<SearchSuggestionResponseDto> {
    return this.searchV3Service.getSuggestions(dto);
  }
}
