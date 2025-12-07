import { Controller, Get, Post, Put, Body, Param, ParseIntPipe, HttpException, HttpStatus, Query } from '@nestjs/common';
import { NotaDinasService } from '../services/nota-dinas.service';
import { NotaDinasRecipientResponseDto, GetRecipientQueryDto } from '../dto/nota-dinas-recipient-response.dto';
import { CreateNotaDinasDto, FinalizeDraftDto, UpdateDraftDto } from '../dto/create-nota-dinas.dto';
import { SendMessageResponseDto } from '../dto/send-message-response.dto';
import { GetSendMessageResponseDto } from '../dto/get-send-message.dto';

@Controller('ND')
export class NotaDinasController {
  constructor(private readonly notaDinasService: NotaDinasService) {}

  /**
   * GET /ND/get-recipient/{positionId}
   * Get eligible recipients for Nota Dinas based on position ID (using org_data)
   *
   * @param positionId - Position ID (path parameter)
   * @param query - Query parameters (optional: tgl in format YYYY-MM-DD)
   * @returns NotaDinasRecipientResponseDto
   *
   * Response format mengikuti struktur position_json dari org_data:
   * - sender: OrgDataPositionDto (data posisi pengirim)
   * - recipients: { ATASAN, REKAN, BAWAHAN } (grouped recipients)
   *
   * @throws 404 - Not Found (position or org data not found)
   * @throws 403 - Forbidden (non-managerial position)
   * @throws 500 - Internal Server Error
   */
  @Get('get-recipient/:positionId')
  async getNotaDinasRecipients(
    @Param('positionId', ParseIntPipe) positionId: number,
    @Query() query: GetRecipientQueryDto,
  ): Promise<NotaDinasRecipientResponseDto> {
    try {
      return await this.notaDinasService.getNotaDinasRecipients(positionId, query.tgl);
    } catch (error) {
      // Re-throw NestJS exceptions as-is
      if (error instanceof HttpException) {
        throw error;
      }

      // Generic error handler
      throw new HttpException(
        {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Failed to get Nota Dinas recipients',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * POST /ND/save-draft
   * Save Nota Dinas as draft
   * Status: 'draf'
   *
   * @param dto - CreateNotaDinasDto
   * @returns SendMessageResponseDto
   *
   * @throws 400 - Bad Request (validation error)
   * @throws 404 - Not Found (pengirim/penerima not found)
   * @throws 403 - Forbidden (pengirim is not managerial)
   * @throws 500 - Internal Server Error
   */
  @Post('save-draft')
  async saveDraft(@Body() dto: CreateNotaDinasDto): Promise<SendMessageResponseDto> {
    try {
      return await this.notaDinasService.saveDraft(dto);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        {
          success: false,
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Failed to save draft Nota Dinas',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * POST /ND/send-message
   * Send Nota Dinas
   * Status: 'final' (tanpa tanda_tangan) atau 'final_tte' (dengan tanda_tangan)
   *
   * @param dto - CreateNotaDinasDto
   * @returns SendMessageResponseDto
   *
   * @throws 400 - Bad Request (validation error)
   * @throws 404 - Not Found (pengirim/penerima not found)
   * @throws 403 - Forbidden (pengirim is not managerial)
   * @throws 500 - Internal Server Error
   */
  @Post('send-message')
  async sendMessage(@Body() dto: CreateNotaDinasDto): Promise<SendMessageResponseDto> {
    try {
      return await this.notaDinasService.sendMessage(dto);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        {
          success: false,
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Failed to send Nota Dinas',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * PUT /ND/update-draft/:id
   * Update draft Nota Dinas (status tetap draf)
   * Bisa partial update - hanya field yang diisi yang akan diupdate
   *
   * @param id - Naskah ID (UUID)
   * @param dto - UpdateDraftDto
   * @returns SendMessageResponseDto
   *
   * @throws 400 - Bad Request (naskah bukan draf atau bukan ND)
   * @throws 404 - Not Found (naskah tidak ditemukan)
   * @throws 500 - Internal Server Error
   */
  @Put('update-draft/:id')
  async updateDraft(
    @Param('id') id: string,
    @Body() dto: UpdateDraftDto,
  ): Promise<SendMessageResponseDto> {
    try {
      return await this.notaDinasService.updateDraft(id, dto);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        {
          success: false,
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Failed to update draft',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * PUT /ND/send-draft/:id
   * Finalize draft Nota Dinas (update status dari draf ke final/final_tte)
   * - Bisa update semua field sebelum finalize (clone dari update-draft)
   * - Generate nomor surat resmi
   * - Update status: draf -> final (tanpa tanda_tangan) atau final_tte (dengan tanda_tangan)
   * - Update isDraft = false pada semua sirkulasi
   *
   * @param id - Naskah ID (UUID)
   * @param dto - FinalizeDraftDto (semua field optional, sama seperti UpdateDraftDto)
   * @returns SendMessageResponseDto
   *
   * Status:
   * - 'final': jika tanpa tanda_tangan
   * - 'final_tte': jika dengan tanda_tangan
   *
   * @throws 400 - Bad Request (naskah bukan draf atau bukan ND)
   * @throws 404 - Not Found (naskah tidak ditemukan)
   * @throws 500 - Internal Server Error
   */
  @Put('send-draft/:id')
  async sendDraft(
    @Param('id') id: string,
    @Body() dto: FinalizeDraftDto,
  ): Promise<SendMessageResponseDto> {
    try {
      return await this.notaDinasService.finalizeDraft(id, dto);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        {
          success: false,
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Failed to finalize draft',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * GET /ND/draft-list/:positionId
   * Get all draft Nota Dinas by position
   *
   * Returns list of draft messages
   *
   * @param positionId - Position ID
   * @param query - Query parameters (optional: tgl in format YYYY-MM-DD)
   * @returns GetSendMessageResponseDto
   */
  @Get('draft-list/:positionId')
  async getDraftList(
    @Param('positionId', ParseIntPipe) positionId: number,
    @Query() query: GetRecipientQueryDto,
  ): Promise<GetSendMessageResponseDto> {
    try {
      return await this.notaDinasService.getDraftList(positionId, query.tgl);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        {
          success: false,
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Failed to get draft list',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * GET /ND/get-send-message/:positionId
   * Get all Nota Dinas sent by position
   *
   * Returns list of sent messages with:
   * - Nomor surat
   * - Tanggal
   * - Perihal
   * - Status (draf/final/final_tte)
   * - List penerima dengan status baca
   *
   * @param positionId - Position ID
   * @param query - Query parameters (optional: tgl in format YYYY-MM-DD)
   * @returns GetSendMessageResponseDto
   */
  @Get('get-send-message/:positionId')
  async getSendMessage(
    @Param('positionId', ParseIntPipe) positionId: number,
    @Query() query: GetRecipientQueryDto,
  ): Promise<GetSendMessageResponseDto> {
    try {
      return await this.notaDinasService.getSendMessage(positionId, query.tgl);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        {
          success: false,
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Failed to get sent messages',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
