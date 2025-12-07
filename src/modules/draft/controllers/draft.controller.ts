import {
  Controller,
  Get,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpException,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { DraftService } from '../services/draft.service';
import {
  GetDraftListResponseDto,
  GetDraftDetailResponseDto,
  DeleteDraftResponseDto,
  SignDraftDto,
  SignDraftResponseDto,
} from '../dto/draft/draft.dto';

@Controller('draft')
export class DraftController {
  constructor(private readonly draftService: DraftService) {}

  /**
   * GET /draft/list/:position_id
   * Get list of draft naskah for a position
   *
   * @param position_id - Position ID pengirim (required)
   * @query jenis - Filter by jenis: ND, DI, SDI, SDE, KA (optional)
   * @query search - Search by perihal/nomor (optional)
   * @query days - Filter by days, default 30 (optional)
   *
   * @returns GetDraftListResponseDto
   */
  @Get('list/:position_id')
  async getDraftList(
    @Param('position_id') positionId: string,
    @Query('jenis') jenis?: 'ND' | 'DI' | 'SDI' | 'SDE' | 'KA',
    @Query('search') search?: string,
    @Query('days') days?: string,
  ): Promise<GetDraftListResponseDto> {
    try {
      // Validate position_id
      const position = parseInt(positionId, 10);
      if (isNaN(position)) {
        throw new BadRequestException('position_id must be a valid number');
      }

      // Parse days
      const daysNum = days ? parseInt(days, 10) : 30;

      return await this.draftService.getDraftList(position, jenis, search, daysNum);
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
   * @query position_id - Position ID untuk validasi ownership (required)
   *
   * @returns GetDraftDetailResponseDto
   */
  @Get('detail/:id')
  async getDraftDetail(
    @Param('id') id: string,
    @Query('position_id') positionId?: string,
  ): Promise<GetDraftDetailResponseDto> {
    try {
      // Validate position_id
      if (!positionId) {
        throw new BadRequestException('position_id is required');
      }
      const position = parseInt(positionId, 10);
      if (isNaN(position)) {
        throw new BadRequestException('position_id must be a valid number');
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
   * DELETE /draft/delete/:position_id/:id
   * Delete a draft naskah
   *
   * @param position_id - Position ID untuk validasi ownership (required)
   * @param id - ID Naskah (UUID)
   *
   * @returns DeleteDraftResponseDto
   */
  @Delete('delete/:position_id/:id')
  async deleteDraft(
    @Param('position_id') positionId: string,
    @Param('id') id: string,
  ): Promise<DeleteDraftResponseDto> {
    try {
      // Validate position_id
      const position = parseInt(positionId, 10);
      if (isNaN(position)) {
        throw new BadRequestException('position_id must be a valid number');
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
  async signDraft(
    @Param('id') id: string,
    @Body() dto: SignDraftDto,
  ): Promise<SignDraftResponseDto> {
    try {
      return await this.draftService.signDraft(id, dto.position_id, dto.signature_data);
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
}
