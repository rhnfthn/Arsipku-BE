import { Controller, Get, Post, Put, Body, Param, ParseIntPipe, HttpException, HttpStatus, Query, UseGuards } from '@nestjs/common';
import { SuratDinasInternalService } from '../services/surat-dinas-internal.service';
import { CreateSuratDinasInternalDto, UpdateDraftDto, FinalizeDraftDto } from '../dto/create-surat-dinas-internal.dto';
import { SendMessageResponseDto } from '../dto/send-message-response.dto';
import { GetSendMessageResponseDto } from '../dto/get-send-message.dto';
import { GetSdiRecipientQueryDto, SdiRecipientResponseDto } from '../dto/surat-dinas-internal-recipient-response.dto';
import { UserLevelGuard } from '../../../common/guards';
import { UserLevels } from '../../../common/decorators';
import { UserLevel } from '../../../common/enums';

@Controller('SDI')
export class SuratDinasInternalController {
  constructor(private readonly suratDinasInternalService: SuratDinasInternalService) {}

  /**
   * GET /SDI/get-recipient/:positionId
   * Get eligible recipients for Surat Dinas Internal using org_data
   *
   * SDI Rules:
   * - Hanya REKAN (tidak ada ATASAN/BAWAHAN)
   * - SAMA organization_parent (satu induk organisasi)
   * - BEDA sub_area
   * - Managerial only (chief = 1)
   * - Uses cached org_data for better performance
   *
   * @param positionId - Position ID of the sender (path parameter)
   * @param tgl - Optional date in format YYYY-MM-DD (query parameter)
   * @returns SdiRecipientResponseDto
   *
   * @throws 400 - Bad Request (invalid positionId)
   * @throws 404 - Not Found (position not found)
   * @throws 403 - Forbidden (non-managerial role)
   * @throws 500 - Internal Server Error
   */
  @Get('get-recipient/:positionId')
  async getSdiRecipients(
    @Param('positionId', ParseIntPipe) positionId: number,
    @Query() query: GetSdiRecipientQueryDto,
  ): Promise<SdiRecipientResponseDto> {
    try {
      return await this.suratDinasInternalService.getSdiRecipients(positionId, query.tgl);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Failed to get SDI recipients',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * POST /SDI/send-message
   * Create and send Surat Dinas Internal (using org_data like ND)
   *
   * Rules:
   * - Pengirim must be managerial (chief=1)
   * - Penerima must be in DIFFERENT sub-area within same organization parent
   * - Penerima & tembusan must be managerial (chief=1)
   * - Tembusan follows the same rules as penerima
   *
   * @param dto - CreateSuratDinasInternalDto (request body)
   *   - pengirim: positionId
   *   - penerima: array of positionId
   *   - tembusan: array of positionId (optional)
   *   - tgl: date in YYYY-MM-DD format (optional, for org_data lookup)
   * @returns SendMessageResponseDto
   *
   * @throws 400 - Bad Request (validation failed or same sub-area)
   * @throws 404 - Not Found (position not found in org_data)
   * @throws 403 - Forbidden (non-managerial role or invalid recipient)
   * @throws 500 - Internal Server Error
   */
  // @UseGuards(UserLevelGuard)
  // @UserLevels(UserLevel.DIREKSI)
  @Post('send-message')
  async sendMessage(@Body() dto: CreateSuratDinasInternalDto): Promise<SendMessageResponseDto> {
    try {
      return await this.suratDinasInternalService.sendMessage(dto);
    } catch (error) {
      // Re-throw NestJS exceptions as-is
      if (error instanceof HttpException) {
        throw error;
      }

      // Generic error handler
      throw new HttpException(
        {
          success: false,
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Failed to send Surat Dinas Internal',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * GET /SDI/get-send-message/:positionId
   * Get all Surat Dinas Internal sent by user
   *
   * Returns list of sent SDI messages with:
   * - Nomor surat
   * - Tanggal
   * - Perihal
   * - Status (draf/final/final_tte)
   * - List penerima dengan status baca dan info area/sub-area
   *
   * @param positionId - Position ID
   * @returns GetSendMessageResponseDto
   */
  @Get('get-send-message/:positionId')
  async getSendMessage(
    @Param('positionId', ParseIntPipe) positionId: number,
  ): Promise<GetSendMessageResponseDto> {
    try {
      return await this.suratDinasInternalService.getSendMessage(positionId);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        {
          success: false,
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Failed to get sent SDI messages',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // ============================================================
  // DRAFT ENDPOINTS
  // ============================================================

  /**
   * POST /SDI/save-draft
   * Save Surat Dinas Internal as draft
   *
   * Same rules as send-message, but:
   * - Status = 'draf'
   * - No nomor surat generated (temporary DRAFT-xxx)
   * - isDraft = true in sirkulasi
   *
   * @param dto - CreateSuratDinasInternalDto
   * @returns SendMessageResponseDto with status='draf'
   */
  // @UseGuards(UserLevelGuard)
  // @UserLevels(UserLevel.DIREKSI)
  @Post('save-draft')
  async saveDraft(@Body() dto: CreateSuratDinasInternalDto): Promise<SendMessageResponseDto> {
    try {
      return await this.suratDinasInternalService.saveDraft(dto);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        {
          success: false,
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Failed to save SDI draft',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * PUT /SDI/update-draft/:id
   * Update existing draft Surat Dinas Internal
   *
   * Partial update - only provided fields will be updated
   * Status remains 'draf'
   *
   * @param id - Naskah ID (UUID)
   * @param dto - UpdateDraftDto (all fields optional)
   * @returns SendMessageResponseDto with updated data
   *
   * @throws 404 - Not Found (naskah not found)
   * @throws 400 - Bad Request (not a draft or not SDI)
   */
  // @UseGuards(UserLevelGuard)
  // @UserLevels(UserLevel.DIREKSI)
  @Put('update-draft/:id')
  async updateDraft(
    @Param('id') id: string,
    @Body() dto: UpdateDraftDto,
  ): Promise<SendMessageResponseDto> {
    try {
      return await this.suratDinasInternalService.updateDraft(id, dto);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        {
          success: false,
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Failed to update SDI draft',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * GET /SDI/draft-list/:positionId
   * Get all draft SDI by position (where position is pengirim)
   *
   * Returns list of drafts with full data for editing
   *
   * @param positionId - Position ID of the sender
   * @param tgl - Optional date for org_data validation (query param)
   * @returns GetSendMessageResponseDto with draft list
   */
  @Get('draft-list/:positionId')
  async getDraftList(
    @Param('positionId', ParseIntPipe) positionId: number,
    @Query('tgl') tgl?: string,
  ): Promise<GetSendMessageResponseDto> {
    try {
      return await this.suratDinasInternalService.getDraftList(positionId, tgl);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        {
          success: false,
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Failed to get SDI draft list',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * PUT /SDI/send-draft/:id
   * Finalize and send a draft Surat Dinas Internal
   *
   * - Generate official nomor surat
   * - Update status to 'final' or 'final_tte' (if tanda_tangan provided)
   * - Update sirkulasi jika penerima/tembusan diubah
   * - Set isDraft = false in sirkulasi
   *
   * @param id - Naskah ID (UUID)
   * @param dto - FinalizeDraftDto (penerima, tembusan, tanda_tangan, tgl)
   * @returns SendMessageResponseDto with finalized data
   *
   * @throws 404 - Not Found (naskah not found)
   * @throws 400 - Bad Request (not a draft or not SDI)
   */
  // @UseGuards(UserLevelGuard)
  // @UserLevels(UserLevel.DIREKSI)
  @Put('send-draft/:id')
  async sendDraft(
    @Param('id') id: string,
    @Body() dto: FinalizeDraftDto,
  ): Promise<SendMessageResponseDto> {
    try {
      return await this.suratDinasInternalService.finalizeDraft(id, dto);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        {
          success: false,
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Failed to send SDI draft',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
