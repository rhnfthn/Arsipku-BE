import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  HttpException,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { DisposisiService } from '../services/disposisi.service';
import { DisposisiRecipientResponseDto } from '../dto/disposisi/disposisi-recipient-response.dto';

@Controller('DI')
export class DisposisiController {
  constructor(private readonly disposisiService: DisposisiService) {}

  /**
   * GET /DI/get-recipient/{persnum}
   * Get eligible recipients for Disposisi based on persnum
   *
   * @param persnum - Personnel ID (path parameter)
   * @param maxDepth - Maximum depth of organization hierarchy (query parameter, default: 3)
   * @param includeStaff - Include staff in recipients (query parameter, default: true)
   * @returns DisposisiRecipientResponseDto
   *
   * @throws 400 - Bad Request (invalid persnum format)
   * @throws 404 - Not Found (person or position not found)
   * @throws 403 - Forbidden (non-managerial role)
   * @throws 500 - Internal Server Error
   */
  @Get('get-recipient/:persnum')
  async getDisposisiRecipients(
    @Param('persnum', ParseIntPipe) persnum: number,
    @Query('maxDepth') maxDepth?: string,
  ): Promise<DisposisiRecipientResponseDto> {
    try {
      const depth = maxDepth ? parseInt(maxDepth, 10) : 3;
      // Validate maxDepth
      if (isNaN(depth) || depth < 0 || depth > 5) {
        throw new BadRequestException(
          'maxDepth must be a number between 0 and 5',
        );
      }

      return await this.disposisiService.getDisposisiRecipients(persnum, depth);
    } catch (error) {
      // Re-throw NestJS exceptions as-is
      if (error instanceof HttpException) {
        throw error;
      }

      // Generic error handler
      throw new HttpException(
        {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Failed to get Disposisi recipients',
          error: error instanceof Error ? error.message : String(error),
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
