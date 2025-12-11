import { Controller, Get, Post, Put, Param, ParseIntPipe, Query, Body, HttpException, HttpStatus, UseGuards } from '@nestjs/common';
import { SuratDinasEksternalService } from '../services/surat-dinas-eksternal.service';
import { SdeRecipientResponseDto, GetSdeRecipientQueryDto } from '../dto/sde-recipient-response.dto';
import { CreateSuratDinasEksternalDto, UpdateSdeDraftDto, FinalizeSdeDraftDto } from '../dto/create-surat-dinas-eksternal.dto';
import { SdeSendMessageResponseDto } from '../dto/send-message-response.dto';
import { UserLevelGuard } from '../../../common/guards';
import { UserLevels } from '../../../common/decorators';
import { UserLevel } from '../../../common/enums';

@Controller('SDE')
export class SuratDinasEksternalController {
  constructor(
    private readonly sdeService: SuratDinasEksternalService,
  ) {}

  /**
   * GET /SDE/get-recipient/:positionId
   * Get Surat Dinas Eksternal (SDE) recipients for a sender
   *
   * SDE Rules:
   * - Pengirim: dari org_data (positionId), harus managerial (chief=1)
   * - Penerima: dari tabel eksternal (pihak luar perusahaan)
   * 
   * @param positionId - Position ID of the sender
   * @param query - Optional query params (tgl in format YYYY-MM-DD)
   */
  @Get('get-recipient/:positionId')
  async getSdeRecipients(
    @Param('positionId', ParseIntPipe) positionId: number,
    @Query() query: GetSdeRecipientQueryDto,
  ): Promise<SdeRecipientResponseDto> {
    return this.sdeService.getSdeRecipients(positionId, query.tgl);
  }

  /**
   * POST /SDE/send-message
   * Send Surat Dinas Eksternal (create and send immediately)
   * 
   * Status:
   * - 'final': jika tanpa tanda_tangan
   * - 'final_tte': jika dengan tanda_tangan
   *
   * @param dto - CreateSuratDinasEksternalDto
   * @returns SdeSendMessageResponseDto
   */
  // @UseGuards(UserLevelGuard)
  // @UserLevels(UserLevel.DIREKSI)
  @Post('send-message')
  async sendMessage(
    @Body() dto: CreateSuratDinasEksternalDto,
  ): Promise<SdeSendMessageResponseDto> {
    try {
      return await this.sdeService.sendMessage(dto);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        {
          success: false,
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Failed to send SDE',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * POST /SDE/save-draft
   * Save Surat Dinas Eksternal as draft
   * 
   * Status: 'draf'
   * Nomor: DRAFT-{timestamp}
   *
   * @param dto - CreateSuratDinasEksternalDto
   * @returns SdeSendMessageResponseDto
   */
  // @UseGuards(UserLevelGuard)
  // @UserLevels(UserLevel.DIREKSI)
  @Post('save-draft')
  async saveDraft(
    @Body() dto: CreateSuratDinasEksternalDto,
  ): Promise<SdeSendMessageResponseDto> {
    try {
      return await this.sdeService.saveDraft(dto);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        {
          success: false,
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Failed to save SDE draft',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * PUT /SDE/update-draft/:id
   * Update existing draft Surat Dinas Eksternal
   *
   * Partial update - only provided fields will be updated
   * Status remains 'draf'
   *
   * @param id - Naskah ID (UUID)
   * @param dto - UpdateSdeDraftDto (all fields optional)
   * @returns SdeSendMessageResponseDto with updated data
   *
   * @throws 404 - Not Found (naskah not found)
   * @throws 400 - Bad Request (not a draft or not SDE)
   */
  // @UseGuards(UserLevelGuard)
  // @UserLevels(UserLevel.DIREKSI)
  @Put('update-draft/:id')
  async updateDraft(
    @Param('id') id: string,
    @Body() dto: UpdateSdeDraftDto,
  ): Promise<SdeSendMessageResponseDto> {
    try {
      return await this.sdeService.updateDraft(id, dto);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        {
          success: false,
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Failed to update SDE draft',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * PUT /SDE/send-draft/:id
   * Finalize and send a draft Surat Dinas Eksternal
   *
   * - Generate official nomor surat
   * - Update status to 'final' or 'final_tte' (if tanda_tangan provided)
   * - Set isDraft = false in sirkulasi
   *
   * @param id - Naskah ID (UUID)
   * @param dto - FinalizeSdeDraftDto
   * @returns SdeSendMessageResponseDto with finalized data
   *
   * @throws 404 - Not Found (naskah not found)
   * @throws 400 - Bad Request (not a draft or not SDE)
   */
  // @UseGuards(UserLevelGuard)
  // @UserLevels(UserLevel.DIREKSI)
  @Put('send-draft/:id')
  async sendDraft(
    @Param('id') id: string,
    @Body() dto: FinalizeSdeDraftDto,
  ): Promise<SdeSendMessageResponseDto> {
    try {
      return await this.sdeService.finalizeDraft(id, dto);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        {
          success: false,
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Failed to send SDE draft',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * GET /SDE/draft-list/:positionId
   * Get all draft SDE by position (where position is pengirim)
   *
   * Returns list of drafts with full data for editing
   *
   * @param positionId - Position ID of the sender
   * @param tgl - Optional date for org_data validation (query param)
   * @returns List of draft SDE
   */
  @Get('draft-list/:positionId')
  async getDraftList(
    @Param('positionId', ParseIntPipe) positionId: number,
    @Query('tgl') tgl?: string,
  ): Promise<any> {
    try {
      return await this.sdeService.getDraftList(positionId, tgl);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        {
          success: false,
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Failed to get SDE draft list',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
