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
 * Endpoint: GET /search/v3
 */
@Controller('search')
@UseGuards(JwtAuthGuard)
export class SearchV3Controller {
    constructor(private readonly searchV3Service: SearchV3Service) { }

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
}