import { Controller, Get, Param, ParseIntPipe, HttpException, HttpStatus } from '@nestjs/common';
import { SuratDinasInternalService } from '../services/surat-dinas-internal.service';
import { SuratDinasInternalRecipientResponseDto } from '../dto/surat-dinas-internal/surat-dinas-internal-recipient-response.dto';

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
}
