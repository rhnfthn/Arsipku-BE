import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  HttpException,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { DisposisiService } from '../services/disposisi.service';
import { DisposisiRecipientResponseDto } from '../dto/disposisi/disposisi-recipient-response.dto';
import { CreateDisposisiDto } from '../dto/disposisi/create-disposisi.dto';
import { SendDisposisiResponseDto } from '../dto/disposisi/send-disposisi-response.dto';
import { GetSendMessageResponseDto } from '../dto/disposisi/get-send-message-response.dto';
import {
  UpdateMessageStatusDto,
  UpdateMessageStatusResponseDto,
} from '../dto/disposisi/update-message-status.dto';
import {
  UpdateDraftDisposisiDto,
  UpdateDraftDisposisiResponseDto,
} from '../dto/disposisi/update-draft-disposisi.dto';
import {
  SendDraftDisposisiDto,
  SendDraftDisposisiResponseDto,
} from '../dto/disposisi/send-draft-disposisi.dto';

@Controller('DI')
export class DisposisiController {
  constructor(private readonly disposisiService: DisposisiService) {}

  /**
   * GET /DI/get-recipient/:position_id
   * Get eligible recipients for Disposisi based on position_id
   *
   * Rules: Managerial ke managerial/fungsional/staf di bawahnya
   * (langsung/tidak langsung) dalam Company yang sama
   * 
   * Barrier depth otomatis berdasarkan level pengirim:
   * - EVP (Level 0) → depth 3 (dapat kirim ke Level 1, 2, 3)
   * - VP (Level 1) → depth 2 (dapat kirim ke Level 2, 3)
   * - Manager (Level 2) → depth 1 (dapat kirim ke Level 3)
   * - Staff (Level 3) → tidak bisa kirim Disposisi
   *
   * @param position_id - Position ID (path parameter)
   * @returns DisposisiRecipientResponseDto
   *
   * @throws 400 - Bad Request (invalid position_id)
   * @throws 404 - Not Found (position not found)
   * @throws 403 - Forbidden (non-managerial role or level 3)
   * @throws 500 - Internal Server Error
   */
  @Get('get-recipient/:position_id')
  async getDisposisiRecipients(
    @Param('position_id') positionId: string,
  ): Promise<DisposisiRecipientResponseDto> {
    try {
      const position = parseInt(positionId, 10);
      if (isNaN(position)) {
        throw new BadRequestException('position_id must be a valid number');
      }

      return await this.disposisiService.getDisposisiRecipients(position);
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

  /**
   * POST /DI/send-message
   * Create and send Disposisi
   *
   * @param dto - CreateDisposisiDto
   * @returns SendDisposisiResponseDto
   *
   * @throws 400 - Bad Request (validation error)
   * @throws 404 - Not Found (pengirim/penerima not found)
   * @throws 403 - Forbidden (pengirim is not managerial)
   * @throws 500 - Internal Server Error
   */
  @Post('send-message')
  async sendMessage(
    @Body() dto: CreateDisposisiDto,
  ): Promise<SendDisposisiResponseDto> {
    try {
      return await this.disposisiService.sendMessage(dto);
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
          message: 'Failed to send Disposisi',
          error: error instanceof Error ? error.message : String(error),
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * POST /DI/save-draft
   * Simpan Disposisi sebagai draft
   *
   * @param dto - CreateDisposisiDto
   * @returns SendDisposisiResponseDto
   *
   * @throws 400 - Bad Request (validation error)
   * @throws 404 - Not Found (pengirim/penerima not found)
   * @throws 500 - Internal Server Error
   */
  @Post('save-draft')
  async saveDraft(
    @Body() dto: CreateDisposisiDto,
  ): Promise<SendDisposisiResponseDto> {
    try {
      return await this.disposisiService.saveDraft(dto);
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
          message: 'Failed to save draft Disposisi',
          error: error instanceof Error ? error.message : String(error),
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * GET /DI/get-send-message?position_id=xxx
   * Get all Disposisi messages sent by user
   *
   * Kondisi: User sudah berhasil mengirimkan message dan ingin melihat
   * pesan yang sudah dikirim
   *
   * Deskripsi: Untuk get semua pesan tipe Disposisi yang sudah dikirimkan
   * oleh user beserta statusnya
   *
   * @param position_id - Position ID pengirim (path parameter)
   * @returns GetSendMessageResponseDto
   *
   * @throws 400 - Bad Request (invalid position_id)
   * @throws 404 - Not Found (position not found)
   * @throws 500 - Internal Server Error
   */
  @Get('get-send-message/:position_id')
  async getSendMessage(
    @Param('position_id') positionId: string,
  ): Promise<GetSendMessageResponseDto> {
    try {
      const position = parseInt(positionId, 10);
      if (isNaN(position)) {
        throw new BadRequestException('position_id must be a valid number');
      }

      return await this.disposisiService.getSendMessage(position);
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
          message: 'Failed to get sent messages',
          error: error instanceof Error ? error.message : String(error),
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * PUT /DI/update-message-status
   * Update status pesan menjadi terbaca
   *
   * Kondisi: Ketika user berhasil mengirimkan pesan namun penerima belum membaca
   *
   * Deskripsi: Untuk update status pesan menjadi terbaca atau tidak.
   * - Default nota saat dikirimkan adalah tidak (send_read_time = NULL)
   * - Jika penerima membuka pesan maka otomatis status sudah terupdate
   *
   * @param dto - UpdateMessageStatusDto (id_naskah, position_id, user_id?)
   * @returns UpdateMessageStatusResponseDto
   *
   * @throws 404 - Not Found (pesan tidak ditemukan)
   * @throws 500 - Internal Server Error
   */
  @Put('update-message-status')
  async updateMessageStatus(
    @Body() dto: UpdateMessageStatusDto,
  ): Promise<UpdateMessageStatusResponseDto> {
    try {
      return await this.disposisiService.updateMessageStatus(dto);
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
          message: 'Failed to update message status',
          error: error instanceof Error ? error.message : String(error),
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * PUT /DI/send-draft/:id
   * Kirim draft disposisi (mengubah status dari draf ke final)
   *
   * Kondisi: User sudah membuat disposisi sebagai draft dan ingin mengirim
   *
   * Deskripsi: Sama seperti update-draft tapi dengan status langsung 'final'.
   * - Bisa update semua field sekaligus kirim
   * - Hanya naskah dengan status 'draf' yang bisa dikirim
   * - Hanya pengirim asli yang bisa mengirim
   * - Akan set status = 'final' dan is_draft = false pada semua sirkulasi
   *
   * @param id - ID Naskah (UUID)
   * @param dto - SendDraftDisposisiDto (sama seperti UpdateDraftDisposisiDto tanpa id_naskah dan action)
   * @returns SendDraftDisposisiResponseDto
   *
   * @throws 404 - Not Found (naskah tidak ditemukan)
   * @throws 403 - Forbidden (bukan draft atau bukan pengirim asli)
   * @throws 500 - Internal Server Error
   */
  @Put('send-draft/:id')
  async sendDraft(
    @Param('id') id: string,
    @Body() dto: SendDraftDisposisiDto,
  ): Promise<SendDraftDisposisiResponseDto> {
    try {
      return await this.disposisiService.sendDraft(id, dto);
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
          message: 'Failed to send draft disposisi',
          error: error instanceof Error ? error.message : String(error),
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * PUT /DI/update-draft/:id
   * Update disposisi yang masih berstatus draft
   *
   * Kondisi: User sudah membuat disposisi sebagai draft dan ingin mengupdate
   *
   * Deskripsi: Untuk update data disposisi yang masih draft.
   * - Hanya naskah dengan status 'draf' yang bisa diupdate
   * - Hanya pengirim asli yang bisa mengupdate
   * - Jika action = 'kirim', status akan berubah menjadi 'final'
   *
   * @param id - ID Naskah (UUID) dari path parameter
   * @param dto - UpdateDraftDisposisiDto
   * @returns UpdateDraftDisposisiResponseDto
   *
   * @throws 404 - Not Found (naskah tidak ditemukan)
   * @throws 403 - Forbidden (bukan draft atau bukan pengirim asli)
   * @throws 500 - Internal Server Error
   */
  @Put('update-draft/:id')
  async updateDraft(
    @Param('id') id: string,
    @Body() dto: UpdateDraftDisposisiDto,
  ): Promise<UpdateDraftDisposisiResponseDto> {
    try {
      return await this.disposisiService.updateDraft(id, dto);
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
          message: 'Failed to update draft disposisi',
          error: error instanceof Error ? error.message : String(error),
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
