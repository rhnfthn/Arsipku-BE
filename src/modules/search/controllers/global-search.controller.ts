import {
  Controller,
  Get,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { GlobalSearchService } from '../services/global-search.service';
import { GlobalSearchDto, GlobalSearchResponseDto } from '../dto/global-search.dto';
import { JwtAuthGuard } from '../../../common/guards';
import { CurrentUser } from '../../../common/decorators';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';

/**
 * Controller untuk Global Search
 * 
 * Endpoints:
 * - GET /search - Pencarian global dengan berbagai filter
 * - GET /search/suggestions - Autocomplete suggestions
 * - GET /search/filter-options - Get filter options for dropdown
 */
@Controller('search')
@UseGuards(JwtAuthGuard)
export class GlobalSearchController {
  constructor(private readonly globalSearchService: GlobalSearchService) {}

  /**
   * GET /search
   * 
   * Pencarian global seperti Gmail Advanced Search
   * 
   * Query params:
   * - keyword: Pencarian global di semua field
   * - perihal: Pencarian di perihal/subject
   * - hasWords: Harus mengandung kata-kata ini
   * - doesntHave: Tidak boleh mengandung kata-kata ini
   * - from: Pengirim (nama/jabatan/organization)
   * - to: Penerima (nama/jabatan/organization)
   * - jenis: ND, SDI, SDE, DI, KA, K
   * - sifat: sangat_rahasia, rahasia, terbatas, biasa, terbuka
   * - status: draf, final, final_tte
   * - klasifikasi: Klasifikasi dokumen
   * - dateFrom: Tanggal mulai (YYYY-MM-DD)
   * - dateTo: Tanggal akhir (YYYY-MM-DD)
   * - dateWithin: Rentang waktu (1_day, 3_days, 1_week, dll)
   * - dateReference: Tanggal referensi untuk dateWithin
   * - nomor: Nomor surat
   * - hasAttachment: true/false
   * - scope: all, inbox, sent, draft, archived, favorite
   * - page: Halaman (default: 1)
   * - limit: Jumlah per halaman (default: 20, max: 100)
   * - sortBy: tanggal, nomor, perihal, jenis
   * - sortOrder: ASC, DESC
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  async search(
    @Query() dto: GlobalSearchDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<GlobalSearchResponseDto> {
    return this.globalSearchService.search(dto, user.persnum);
  }
}
