import { Controller, Get, Post, Body, Param, ParseIntPipe, HttpException, HttpStatus } from '@nestjs/common';
import { SuratDinasInternalService } from '../services/surat-dinas-internal.service';
import { SuratDinasInternalRecipientResponseDto } from '../dto/surat-dinas-internal/surat-dinas-internal-recipient-response.dto';
import { CreateSuratDinasInternalDto } from '../dto/surat-dinas-internal/create-surat-dinas-internal.dto';
import { SendMessageResponseDto } from '../dto/surat-dinas-internal/send-message-response.dto';
import { GetSendMessageResponseDto } from '../dto/surat-dinas-internal/get-send-message.dto';

@Controller('SDI')
export class SuratDinasInternalController {
  constructor(private readonly suratDinasInternalService: SuratDinasInternalService) {}

  /**
   * GET /SDI/get-recipient/{persnum}
   * Get eligible recipients for Surat Dinas Internal based on persnum
   *
   * Rules:
   * - Managerial to managerial across DIFFERENT areas within same company
   * - OR managerial to managerial across DIFFERENT sub-areas within same area
   * - Recipients are treated as REKAN (peers) since it's horizontal distribution
   *
   * @param persnum - Personnel ID (path parameter)
   * @returns NotaDinasRecipientResponseDto (with recipients in REKAN group)
   *
   * @throws 400 - Bad Request (invalid persnum format)
   * @throws 404 - Not Found (person or position not found)
   * @throws 403 - Forbidden (non-managerial role)
   * @throws 500 - Internal Server Error
   */
  @Get('get-recipient/:persnum')
  async getSuratDinasInternalRecipients(
    @Param('persnum', ParseIntPipe) persnum: number,
  ): Promise<SuratDinasInternalRecipientResponseDto> {
    try {
      return await this.suratDinasInternalService.getSuratDinasInternalRecipients(persnum);
    } catch (error) {
      // Re-throw NestJS exceptions as-is
      if (error instanceof HttpException) {
        throw error;
      }

      // Generic error handler
      throw new HttpException(
        {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Failed to get Surat Dinas Internal recipients',
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
   * - Penerima must be in DIFFERENT sub-area within same area OR DIFFERENT area within same company
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
