import { Controller, Get, Post, Body, Param, ParseIntPipe, HttpException, HttpStatus } from '@nestjs/common';
import { NotaDinasService } from '../services/nota-dinas.service';
import { NotaDinasRecipientResponseDto } from '../dto/nota-dinas/nota-dinas-recipient-response.dto';
import { CreateNotaDinasDto } from '../dto/nota-dinas/create-nota-dinas.dto';
import { SendMessageResponseDto } from '../dto/nota-dinas/send-message-response.dto';
import { GetSendMessageResponseDto } from '../dto/nota-dinas/get-send-message.dto';

@Controller('ND')
export class NotaDinasController {
  constructor(private readonly notaDinasService: NotaDinasService) {}

  /**
   * GET /ND/get-recipient/{persnum}
   * Get eligible recipients for Nota Dinas based on persnum
   *
   * @param persnum - Personnel ID (path parameter)
   * @returns NotaDinasRecipientResponseDto
   *
   * @throws 400 - Bad Request (invalid persnum format)
   * @throws 404 - Not Found (person or position not found)
   * @throws 403 - Forbidden (non-managerial role)
   * @throws 500 - Internal Server Error
   */
  @Get('get-recipient/:persnum')
  async getNotaDinasRecipients(
    @Param('persnum', ParseIntPipe) persnum: number,
  ): Promise<NotaDinasRecipientResponseDto> {
    try {
      return await this.notaDinasService.getNotaDinasRecipients(persnum);
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
   * POST /ND/send-message
   * Create and send Nota Dinas
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
      // Re-throw NestJS exceptions as-is
      if (error instanceof HttpException) {
        throw error;
      }

      // Generic error handler
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
   * GET /ND/get-send-message/:persnum
   * Get all Nota Dinas sent by user
   *
   * Returns list of sent messages with:
   * - Nomor surat
   * - Tanggal
   * - Perihal
   * - Status (draf/final/final_tte)
   * - List penerima dengan status baca
   *
   * @param persnum - Personnel ID
   * @returns GetSendMessageResponseDto
   */
  @Get('get-send-message/:persnum')
  async getSendMessage(
    @Param('persnum', ParseIntPipe) persnum: number,
  ): Promise<GetSendMessageResponseDto> {
    try {
      return await this.notaDinasService.getSendMessage(persnum);
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
