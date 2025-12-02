import { Controller, Get, Post, Body, Param, ParseIntPipe, HttpException, HttpStatus, Query } from '@nestjs/common';
import { SuratDinasInternalService } from '../services/surat-dinas-internal.service';
import { CreateSuratDinasInternalDto } from '../dto/surat-dinas-internal/create-surat-dinas-internal.dto';
import { SendMessageResponseDto } from '../dto/surat-dinas-internal/send-message-response.dto';
import { GetSendMessageResponseDto } from '../dto/surat-dinas-internal/get-send-message.dto';
import { GetSdiRecipientQueryDto, SdiRecipientResponseDto } from '../dto/surat-dinas-internal/surat-dinas-internal-recipient-response.dto';

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
   * Create and send Surat Dinas Internal
   *
   * Rules:
   * - Pengirim must be managerial
   * - Penerima must be in DIFFERENT sub-area within same organization parent
   * - Tembusan follows the same rules as penerima
   *
   * @param dto - CreateSuratDinasInternalDto (request body)
   * @returns SendMessageResponseDto
   *
   * @throws 400 - Bad Request (validation failed or same sub-area)
   * @throws 404 - Not Found (person or position not found)
   * @throws 403 - Forbidden (non-managerial role)
   * @throws 500 - Internal Server Error
   */
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
   * GET /SDI/get-send-message/:persnum
   * Get all Surat Dinas Internal sent by user
   *
   * Returns list of sent SDI messages with:
   * - Nomor surat
   * - Tanggal
   * - Perihal
   * - Status (draf/final/final_tte)
   * - List penerima dengan status baca dan info area/sub-area
   *
   * @param persnum - Personnel ID
   * @returns GetSendMessageResponseDto
   */
  @Get('get-send-message/:persnum')
  async getSendMessage(
    @Param('persnum', ParseIntPipe) persnum: number,
  ): Promise<GetSendMessageResponseDto> {
    try {
      return await this.suratDinasInternalService.getSendMessage(persnum);
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
}
