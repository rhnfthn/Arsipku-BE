import {
  Controller,
  Get,
  Put,
  Delete,
  Post,
  Body,
  Param,
  Query,
  HttpException,
  HttpStatus,
  BadRequestException,
  UseGuards,
} from '@nestjs/common';
import { DraftService } from '../services/draft.service';
import {
  GetDraftListQueryDto,
  GetDraftListResponseDto,
  GetDraftDetailResponseDto,
  DeleteDraftResponseDto,
  SignDraftDto,
  SignDraftResponseDto,
  BulkDeleteDraftDto,
  BulkDeleteDraftResponseDto,
} from '../dto/draft/draft.dto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { CurrentUser, RequirePermission } from '../../../common/decorators';

@Controller('draft')
export class DraftController {
  constructor(private readonly draftService: DraftService) {}

  /**
   * GET /draft/list
   * Get list of draft naskah for a position (from JWT token)
   *
   * @param user - User dari JWT token (contains position)
   * @query jenis - Filter by jenis: ND, DI, SDI, SDE, KA, K (optional)
   * @query favorite - Filter favorit (optional)
   * @query lock - Filter yang dikunci (optional)
   * @query note - Filter yang punya catatan (optional)
   * @query arsip - Filter arsip. Default false = exclude archived (optional)
   * @query priority - Filter disposisi prioritas, khusus jenis DI (optional)
   * @query search - Search by perihal/nomor (optional)
   * @query days - Filter by days, default 30 (optional) - DEPRECATED, use preset instead
   * @query start_date - Start date filter YYYY-MM-DD (optional)
   * @query end_date - End date filter YYYY-MM-DD (optional)
   * @query preset - Date preset: 7_hari, 30_hari, 60_hari, 1_tahun, semua (optional)
   * @query page - Page number, default 1 (optional)
   * @query limit - Items per page, default 10 (optional)
   *
   * @returns GetDraftListResponseDto
   */
  @UseGuards(JwtAuthGuard)
  @Get('list')
  @RequirePermission('naskah-dinas', 'read')
  async getDraftList(
    @CurrentUser() user: any,
    @Query() query: GetDraftListQueryDto,
  ): Promise<GetDraftListResponseDto> {
    try {
      // Get position_id from JWT token
      const position = parseInt(user.position, 10);
      if (isNaN(position)) {
        throw new BadRequestException('Invalid position in token');
      }

      // Parse days (deprecated, for backward compatibility)
      const daysNum = query.days ? parseInt(query.days, 10) : undefined;

      // Parse pagination
      const pageNum = query.page ?? 1;
      const limitNum = query.limit ?? 10;

      // Normalize preset
      const normalizedPreset = query.preset
        ? (String(query.preset).toLowerCase().trim().replace(/\s+/g, '_') as
            | '7_hari'
            | '30_hari'
            | '60_hari'
            | '1_tahun'
            | 'semua')
        : undefined;

      return await this.draftService.getDraftList(
        position,
        query.jenis,
        query.favorite,
        query.lock,
        query.note,
        query.arsip,
        query.priority,
        query.search,
        daysNum,
        query.start_date,
        query.end_date,
        normalizedPreset,
        query.sort,
        pageNum,
        limitNum,
      );
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        {
          success: false,
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Failed to get draft list',
          error: error instanceof Error ? error.message : String(error),
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * GET /draft/detail/:id
   * Get detail of a draft naskah
   *
   * @param id - ID Naskah (UUID)
   * @param user - User dari JWT token (contains position)
   *
   * @returns GetDraftDetailResponseDto
   */
  @UseGuards(JwtAuthGuard)
  @Get('detail/:id')
  @RequirePermission('naskah-dinas', 'read-detail')
  async getDraftDetail(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ): Promise<GetDraftDetailResponseDto> {
    try {
      // Get position_id from JWT token
      const position = parseInt(user.position, 10);
      if (isNaN(position)) {
        throw new BadRequestException('Invalid position in token');
      }

      return await this.draftService.getDraftDetail(id, position);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        {
          success: false,
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Failed to get draft detail',
          error: error instanceof Error ? error.message : String(error),
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * DELETE /draft/delete/:id
   * Delete a draft naskah (position_id from JWT token)
   *
   * @param id - ID Naskah (UUID)
   * @param user - User dari JWT token (contains position)
   *
   * @returns DeleteDraftResponseDto
   */
  @UseGuards(JwtAuthGuard)
  @Delete('delete/:id')
  @RequirePermission('naskah-dinas', 'delete')
  async deleteDraft(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ): Promise<DeleteDraftResponseDto> {
    try {
      // Get position_id from JWT token
      const position = parseInt(user.position, 10);
      if (isNaN(position)) {
        throw new BadRequestException('Invalid position in token');
      }

      return await this.draftService.deleteDraft(id, position);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        {
          success: false,
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Failed to delete draft',
          error: error instanceof Error ? error.message : String(error),
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * PUT /draft/sign/:id
   * Sign a naskah with TTE (Tanda Tangan Elektronik)
   * Changes status from 'final' to 'final_tte'
   *
   * @param id - ID Naskah (UUID)
   * @body SignDraftDto - position_id dan signature_data
   *
   * @returns SignDraftResponseDto
   */
  @Put('sign/:id')
  @RequirePermission('naskah-dinas', 'sign')
  async signDraft(
    @Param('id') id: string,
    @Body() dto: SignDraftDto,
  ): Promise<SignDraftResponseDto> {
    try {
      return await this.draftService.signDraft(
        id,
        dto.position_id,
        dto.signature_data,
      );
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        {
          success: false,
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Failed to sign draft',
          error: error instanceof Error ? error.message : String(error),
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * POST /draft/bulk-delete
   * Bulk delete draft naskah (select all or beberapa draft lalu hapus)
   *
   * @body BulkDeleteDraftDto - position_id dan naskah_ids
   *
   * @returns BulkDeleteDraftResponseDto
   */
  @Post('bulk-delete')
  @RequirePermission('naskah-dinas', 'delete')
  async bulkDeleteDraft(
    @Body() dto: BulkDeleteDraftDto,
  ): Promise<BulkDeleteDraftResponseDto> {
    try {
      return await this.draftService.bulkDeleteDraft(
        dto.naskah_ids,
        dto.position_id,
      );
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        {
          success: false,
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Failed to bulk delete drafts',
          error: error instanceof Error ? error.message : String(error),
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
