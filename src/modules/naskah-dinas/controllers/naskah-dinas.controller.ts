 import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Query,
  Body,
  HttpException,
  HttpStatus,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { NaskahDinasService } from '../services/naskah-dinas.service';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import {
  CreateNaskahDinasDto,
  GetNaskahDinasRecipientQueryDto,
  NaskahDinasRecipientResponseDto,
  NdSendMessageResponseDto,
  NdGetAllResponseDto,
  NdGetDetailResponseDto,
} from '../dto';

@Controller('naskah-dinas')
export class NaskahDinasController {
  constructor(private readonly naskahDinasService: NaskahDinasService) {}

  /**
   * GET /naskah-dinas/get-recipient
   * Get available senders (eksternal) and recipients (internal positions)
   *
   * @param query - Optional query params (tgl in format YYYY-MM-DD)
   */
  @Get('get-recipient')
  async getRecipients(
    @Query() query: GetNaskahDinasRecipientQueryDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<NaskahDinasRecipientResponseDto> {
    try {
      return await this.naskahDinasService.getRecipients(query.tgl, user);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        {
          success: false,
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Failed to get Naskah Dinas recipients',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * POST /naskah-dinas/send-message
   * Send a new Naskah Dinas
   *
   * Accepts: form-data with:
   * - pengirim: eksternal.id (UUID)
   * - penerima: array of positionId (JSON or comma-separated)
   * - klasifikasi, sifat, perihal, konten
   * - file_attachment: optional PDF file (goes directly to final_pdf)
   *
   * @returns NdSendMessageResponseDto
   */
  @Post('send-message')
  @UseInterceptors(FileInterceptor('file_attachment'))
  async sendMessage(
    @Body() body: any,
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<NdSendMessageResponseDto> {
    try {
      // Parse form-data to DTO
      const { dto, file: parsedFile } = await this.naskahDinasService.parseFormDataToCreateDto(body, file);
      return await this.naskahDinasService.sendMessage(dto, parsedFile);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        {
          success: false,
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Failed to send Naskah Dinas',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * GET /naskah-dinas
   * Get all Naskah Dinas (tanpa pagination)
   *
   * @param user - Current logged-in user from JWT token
   * @param positionId - Optional filter by penerima position
   */
  @Get()
  async getAll(
    @CurrentUser() user: JwtPayload,
    @Query('positionId') positionId?: string,
  ): Promise<NdGetAllResponseDto> {
    try {
      const posId = positionId ? parseInt(positionId, 10) : undefined;

      return await this.naskahDinasService.getAll(posId, user.area);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        {
          success: false,
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Failed to get Naskah Dinas list',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * GET /naskah-dinas/verifikator
   * Get naskah masuk that need verification by current user
   */
  @Get('verifikator')
  async getMyVerificationList(
    @CurrentUser() user: JwtPayload,
    @Query() query: any,
  ) {
    try {
      return await this.naskahDinasService.getMyVerificationList(user, query);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        {
          success: false,
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Failed to get Naskah Dinas verification list',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * GET /naskah-dinas/verifikator/:id
   * Get detail for current verifier
   */
  @Get('verifikator/:id')
  async getVerificationDetail(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    try {
      return await this.naskahDinasService.getVerificationDetail(id, user);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        {
          success: false,
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Failed to get Naskah Dinas verification detail',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * POST /naskah-dinas/verifikator/:id/verify
   */
  @Post('verifikator/:id/verify')
  async verifyNaskah(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body('keterangan') keterangan?: string,
  ) {
    try {
      return await this.naskahDinasService.verifyNaskah(id, user, keterangan);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        {
          success: false,
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Failed to verify Naskah Dinas',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * POST /naskah-dinas/verifikator/:id/reject
   */
  @Post('verifikator/:id/reject')
  async rejectNaskah(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body('alasan') alasan: string,
  ) {
    try {
      return await this.naskahDinasService.rejectNaskah(id, user, alasan);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        {
          success: false,
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Failed to reject Naskah Dinas',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * PUT /naskah-dinas/:id
   * Update existing Naskah Dinas
   */
  @Put(':id')
  @UseInterceptors(FileInterceptor('file_attachment'))
  async updateMessage(
    @Param('id') id: string,
    @Body() body: any,
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<NdGetDetailResponseDto> {
    try {
      const { dto, file: parsedFile } = await this.naskahDinasService.parseFormDataToCreateDto(body, file);
      return await this.naskahDinasService.updateMessage(id, dto, parsedFile);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        {
          success: false,
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Failed to update Naskah Dinas',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * GET /naskah-dinas/:id
   * Get detail of a single Naskah Dinas
   *
   * @param id - Naskah ID (UUID)
   */
  @Get(':id')
  async getDetail(@Param('id') id: string): Promise<NdGetDetailResponseDto> {
    try {
      return await this.naskahDinasService.getDetail(id);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        {
          success: false,
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Failed to get Naskah Dinas detail',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
