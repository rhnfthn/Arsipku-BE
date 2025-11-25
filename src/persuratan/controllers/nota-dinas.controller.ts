import { Controller, Get, Param, ParseIntPipe, HttpException, HttpStatus } from '@nestjs/common';
import { NotaDinasService } from '../services/nota-dinas.service';
import { NotaDinasRecipientResponseDto } from '../dto/nota-dinas/nota-dinas-recipient-response.dto';

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
}
