import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Body,
  Param,
  Query,
  HttpException,
  HttpStatus,
  BadRequestException,
  NotFoundException,
  UseGuards,
  UseInterceptors,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DisposisiService } from '../services/disposisi.service';
import { CurrentUser } from '../../../common/decorators';
import { JwtAuthGuard } from '../../../common/guards';
import { UserLevelGuard } from '../../../common/guards';
import { UserLevels } from '../../../common/decorators';
import { UserLevel } from '../../../common/enums';
import { DisposisiRecipientResponseDto } from '../dto/disposisi-recipient-response.dto';
import { CreateDisposisiDto } from '../dto/create-disposisi.dto';
import { SendDisposisiResponseDto } from '../dto/send-disposisi-response.dto';
import { GetSendMessageResponseDto } from '../dto/get-send-message-response.dto';
import { GeneratePdfDisposisiDto } from '../dto/generate-pdf.dto';
import {
  UpdateMessageStatusDto,
  UpdateMessageStatusResponseDto,
} from '../dto/update-message-status.dto';
import {
  UpdateDraftDisposisiDto,
  UpdateDraftDisposisiResponseDto,
} from '../dto/update-draft-disposisi.dto';
import {
  SendDraftDisposisiDto,
  SendDraftDisposisiResponseDto,
} from '../dto/send-draft-disposisi.dto';
import {
  ForwardDisposisiDto,
  ForwardDisposisiResponseDto,
} from '../dto/forward-disposisi.dto';
import { assertDateNotInFuture } from '../../../common/helpers/date-validation.helper';

@Controller('DI')
export class DisposisiController {
  constructor(private readonly disposisiService: DisposisiService) {}

  /**
   * GET /DI/get-recipient
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
   * @param user - User dari JWT token (contains position)
   * @param pengirim - Optional position_id pengirim (untuk kasus konsep/draft)
   * @returns DisposisiRecipientResponseDto
   *
   * @example
   * GET /DI/get-recipient (gunakan position dari JWT)
   * GET /DI/get-recipient?pengirim=70016742 (gunakan pengirim yang dipilih)
   *
   * @throws 400 - Bad Request (invalid position_id)
   * @throws 404 - Not Found (position not found)
   * @throws 403 - Forbidden (non-managerial role or level 3)
   * @throws 500 - Internal Server Error
   */
  @UseGuards(JwtAuthGuard)
  @Get('get-recipient')
  async getDisposisiRecipients(
    @CurrentUser() user: any,
    @Query('pengirim') pengirim?: string,
  ): Promise<DisposisiRecipientResponseDto> {
    try {
      // Jika pengirim ada di query, gunakan itu; jika tidak, gunakan position dari JWT
      const position = pengirim ? parseInt(pengirim, 10) : parseInt(user.position, 10);
      if (isNaN(position)) {
        throw new BadRequestException('Invalid position');
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
   * GET /DI/:id
   * Get flow lengkap disposisi dari awal sampai akhir
   *
   * Kondisi: User ingin melihat flow disposisi lengkap
   *
   * Deskripsi: Mengembalikan array flow disposisi lengkap dengan urutan:
   * - Paling atas = disposisi terbaru (level tertinggi)
   * - Paling bawah = disposisi awal (level 0 / root)
   * 
   * Setiap item flow berisi:
   * - Data naskah (id, nomor, tanggal, perihal, status, sifat)
   * - Data DI (disposisi, catatan, kop, nomor agenda, dll)
   * - Pengirim dengan info lengkap (position, nama, organization)
   * - Penerima dengan status baca (terbaca/belum_dibaca, read_time)
   * - Lampiran files dengan URL download
   * - Final PDF dengan URL
   * - Level dalam chain
   *
   * @param id - ID Naskah (UUID) - bisa dari level mana saja, sistem akan trace ke root
   * @returns Flow disposisi lengkap (descending: terbaru → awal)
   *
   * @throws 404 - Not Found (naskah tidak ditemukan / bukan disposisi)
   * @throws 500 - Internal Server Error
   */
  @Get(':id')
  async getDisposisiDetail(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ): Promise<any> {
    try {
      return await this.disposisiService.getDisposisiDetail(id, String(user.position));
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        {
          success: false,
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Failed to get Disposisi detail',
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
  // @UseGuards(UserLevelGuard)
  // @UserLevels(UserLevel.MANAGERIAL, UserLevel.DIREKSI)
  @UseInterceptors(AnyFilesInterceptor())
  @Post('send-message')
  async sendMessage(
    @Body() body: any,
    @CurrentUser() user: any,
  ): Promise<SendDisposisiResponseDto> {
    try {
      console.log('[send-message] Raw body:', JSON.stringify(body, null, 2));
      console.log('[send-message] body.pengirim:', body.pengirim);
      console.log('[send-message] typeof body.pengirim:', typeof body.pengirim);

      // Parse pengirim from form-data (bisa 'pengirim' atau 'pengirim_position_id')
      if (body.pengirim) {
        body.pengirim_position_id = parseInt(body.pengirim, 10);
        console.log('[send-message] Parsed pengirim to pengirim_position_id:', body.pengirim_position_id);
      } else if (body.pengirim_position_id && typeof body.pengirim_position_id === 'string') {
        body.pengirim_position_id = parseInt(body.pengirim_position_id, 10);
      }

      body.pengirim_position_id = parseInt(user.position, 10);
      body.pengirim = String(user.position);
      console.log('[send-message] Final pengirim_position_id:', body.pengirim_position_id);

      // Parse tertuju/penerima from form-data
      if (body.tertuju && !body.penerima_position_ids) {
        if (typeof body.tertuju === 'string') {
          try {
            body.penerima_position_ids = JSON.parse(body.tertuju);
          } catch {
            body.penerima_position_ids = [parseInt(body.tertuju, 10)];
          }
        } else {
          body.penerima_position_ids = body.tertuju;
        }
      }

      // Parse penerima_position_ids if it's a string from form-data
      if (body.penerima_position_ids && typeof body.penerima_position_ids === 'string') {
        try {
          body.penerima_position_ids = JSON.parse(body.penerima_position_ids);
        } catch {
          body.penerima_position_ids = [parseInt(body.penerima_position_ids, 10)];
        }
      }

      // Ensure penerima_position_ids are numbers
      if (Array.isArray(body.penerima_position_ids)) {
        body.penerima_position_ids = body.penerima_position_ids.map((id: any) => 
          typeof id === 'string' ? parseInt(id, 10) : id
        );
      }

      // Parse tanggal_disposisi from form-data
      if (!body.tanggal_disposisi && body.tanggal) {
        body.tanggal_disposisi = body.tanggal;
      }

      // Parse ref.nomor dan ref.perihal from form-data (dot notation)
      if (!body.ref_nomor_surat && body['ref.nomor']) {
        body.ref_nomor_surat = body['ref.nomor'];
      }
      if (!body.perihal && body['ref.perihal']) {
        body.perihal = body['ref.perihal'];
      }

      // Parse disposisi array to string if needed
      if (body.disposisi && typeof body.disposisi === 'string') {
        try {
          const disposisiArr = JSON.parse(body.disposisi);
          if (Array.isArray(disposisiArr)) {
            body.disposisi = disposisiArr.join('\n');
          }
        } catch {
          // Already a string, keep as is
        }
      }

      // Parse lampiran_temp_ids if it's a string from form-data
      if (body.lampiran_temp_ids && typeof body.lampiran_temp_ids === 'string') {
        try {
          body.lampiran_temp_ids = JSON.parse(body.lampiran_temp_ids);
        } catch {
          body.lampiran_temp_ids = [body.lampiran_temp_ids];
        }
      }

      // Parse is_priority from form-data (string 'true'/'false' to actual boolean)
      if (body.is_priority !== undefined) {
        body.is_priority = body.is_priority === 'true' || body.is_priority === true;
      }

      return await this.disposisiService.sendMessage(
        body as CreateDisposisiDto,
        user?.persnum ? Number(user.persnum) : undefined,
      );
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
  // @UseGuards(UserLevelGuard)
  // @UserLevels(UserLevel.MANAGERIAL, UserLevel.DIREKSI)
  @UseInterceptors(AnyFilesInterceptor())
  @Post('save-draft')
  async saveDraft(
    @Body() body: any,
    @CurrentUser() user: any,
  ): Promise<SendDisposisiResponseDto> {
    try {
      // Parse pengirim from form-data (bisa 'pengirim' atau 'pengirim_position_id')
      if (body.pengirim && !body.pengirim_position_id) {
        body.pengirim_position_id = parseInt(body.pengirim, 10);
      } else if (body.pengirim_position_id && typeof body.pengirim_position_id === 'string') {
        body.pengirim_position_id = parseInt(body.pengirim_position_id, 10);
      }

      // Parse tertuju/penerima from form-data
      if (body.tertuju && !body.penerima_position_ids) {
        if (typeof body.tertuju === 'string') {
          try {
            body.penerima_position_ids = JSON.parse(body.tertuju);
          } catch {
            body.penerima_position_ids = [parseInt(body.tertuju, 10)];
          }
        } else {
          body.penerima_position_ids = body.tertuju;
        }
      }

      // Parse penerima_position_ids if it's a string from form-data
      if (body.penerima_position_ids && typeof body.penerima_position_ids === 'string') {
        try {
          body.penerima_position_ids = JSON.parse(body.penerima_position_ids);
        } catch {
          body.penerima_position_ids = [parseInt(body.penerima_position_ids, 10)];
        }
      }

      // Ensure penerima_position_ids are numbers
      if (Array.isArray(body.penerima_position_ids)) {
        body.penerima_position_ids = body.penerima_position_ids.map((id: any) => 
          typeof id === 'string' ? parseInt(id, 10) : id
        );
      }

      // Parse tanggal_disposisi from form-data
      if (!body.tanggal_disposisi && body.tanggal) {
        body.tanggal_disposisi = body.tanggal;
      }

      // Parse ref.nomor dan ref.perihal from form-data (dot notation)
      if (!body.ref_nomor_surat && body['ref.nomor']) {
        body.ref_nomor_surat = body['ref.nomor'];
      }
      if (!body.perihal && body['ref.perihal']) {
        body.perihal = body['ref.perihal'];
      }

      // Parse disposisi array to string if needed
      if (body.disposisi && typeof body.disposisi === 'string') {
        try {
          const disposisiArr = JSON.parse(body.disposisi);
          if (Array.isArray(disposisiArr)) {
            body.disposisi = disposisiArr.join('\n');
          }
        } catch {
          // Already a string, keep as is
        }
      }

      // Parse lampiran_temp_ids if it's a string from form-data
      if (body.lampiran_temp_ids && typeof body.lampiran_temp_ids === 'string') {
        try {
          body.lampiran_temp_ids = JSON.parse(body.lampiran_temp_ids);
        } catch {
          body.lampiran_temp_ids = [body.lampiran_temp_ids];
        }
      }

      // Parse is_priority from form-data (string 'true'/'false' to actual boolean)
      if (body.is_priority !== undefined) {
        body.is_priority = body.is_priority === 'true' || body.is_priority === true;
      }

      body.pengirim_position_id = parseInt(user.position, 10);
      body.pengirim = String(user.position);

      return await this.disposisiService.saveDraft(body as CreateDisposisiDto);
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
    @CurrentUser() user: any,
  ): Promise<GetSendMessageResponseDto> {
    try {
      const position = parseInt(positionId, 10);
      if (isNaN(position)) {
        throw new BadRequestException('position_id must be a valid number');
      }
      if (String(position) !== String(user.position)) {
        throw new BadRequestException('position_id harus sesuai dengan user yang login');
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
    @CurrentUser() user: any,
  ): Promise<UpdateMessageStatusResponseDto> {
    try {
      dto.position_id = String(user.position);
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
  // @UseGuards(UserLevelGuard)
  // @UserLevels(UserLevel.MANAGERIAL, UserLevel.DIREKSI)
  @UseInterceptors(AnyFilesInterceptor())
  @Put('send-draft/:id')
  async sendDraft(
    @Param('id') id: string,
    @Body() body: any,
    @CurrentUser() user: any,
  ): Promise<SendDraftDisposisiResponseDto> {
    try {
      // Parse pengirim from form-data (bisa 'pengirim' atau 'pengirim_position_id')
      if (body.pengirim && !body.pengirim_position_id) {
        body.pengirim_position_id = parseInt(body.pengirim, 10);
      } else if (body.pengirim_position_id && typeof body.pengirim_position_id === 'string') {
        body.pengirim_position_id = parseInt(body.pengirim_position_id, 10);
      }

      body.pengirim_position_id = parseInt(user.position, 10);
      body.pengirim = String(user.position);

      // Parse tertuju/penerima from form-data
      if (body.tertuju && !body.penerima_position_ids) {
        if (typeof body.tertuju === 'string') {
          try {
            body.penerima_position_ids = JSON.parse(body.tertuju);
          } catch {
            body.penerima_position_ids = [parseInt(body.tertuju, 10)];
          }
        } else {
          body.penerima_position_ids = body.tertuju;
        }
      }

      // Parse penerima_position_ids if it's a string from form-data
      if (body.penerima_position_ids && typeof body.penerima_position_ids === 'string') {
        try {
          body.penerima_position_ids = JSON.parse(body.penerima_position_ids);
        } catch {
          body.penerima_position_ids = [parseInt(body.penerima_position_ids, 10)];
        }
      }

      // Ensure penerima_position_ids are numbers
      if (Array.isArray(body.penerima_position_ids)) {
        body.penerima_position_ids = body.penerima_position_ids.map((id: any) => 
          typeof id === 'string' ? parseInt(id, 10) : id
        );
      }

      // Parse tanggal_disposisi from form-data
      if (!body.tanggal_disposisi && body.tanggal) {
        body.tanggal_disposisi = body.tanggal;
      }

      // Parse ref.nomor dan ref.perihal from form-data (dot notation)
      if (!body.ref_nomor_surat && body['ref.nomor']) {
        body.ref_nomor_surat = body['ref.nomor'];
      }
      if (!body.perihal && body['ref.perihal']) {
        body.perihal = body['ref.perihal'];
      }

      // Parse disposisi array to string if needed
      if (body.disposisi && typeof body.disposisi === 'string') {
        try {
          const disposisiArr = JSON.parse(body.disposisi);
          if (Array.isArray(disposisiArr)) {
            body.disposisi = disposisiArr.join('\n');
          }
        } catch {
          // Already a string, keep as is
        }
      }

      // Parse lampiran_temp_ids if it's a string from form-data
      if (body.lampiran_temp_ids && typeof body.lampiran_temp_ids === 'string') {
        try {
          body.lampiran_temp_ids = JSON.parse(body.lampiran_temp_ids);
        } catch {
          body.lampiran_temp_ids = [body.lampiran_temp_ids];
        }
      }

      // Parse is_priority from form-data (string 'true'/'false' to actual boolean)
      if (body.is_priority !== undefined) {
        body.is_priority = body.is_priority === 'true' || body.is_priority === true;
      }

      return await this.disposisiService.sendDraft(
        id,
        body as SendDraftDisposisiDto,
        user?.persnum ? Number(user.persnum) : undefined,
      );
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
   * PATCH /DI/update-draft/:id
   * Update disposisi yang masih berstatus draft (partial update)
   *
   * Kondisi: User sudah membuat disposisi sebagai draft dan ingin mengupdate
   *
   * Deskripsi: Untuk update data disposisi yang masih draft.
   * - Hanya naskah dengan status 'draf' yang bisa diupdate
   * - Hanya pengirim asli yang bisa mengupdate
   * - Partial update - hanya field yang diisi yang akan diupdate
   * - Status tetap 'draf'
   *
   * @param id - ID Naskah (UUID) dari path parameter
   * @param dto - UpdateDraftDisposisiDto
   * @returns UpdateDraftDisposisiResponseDto
   *
   * @throws 404 - Not Found (naskah tidak ditemukan)
   * @throws 403 - Forbidden (bukan draft atau bukan pengirim asli)
   * @throws 500 - Internal Server Error
   */
  // @UseGuards(UserLevelGuard)
  // @UserLevels(UserLevel.MANAGERIAL, UserLevel.DIREKSI)
  @UseInterceptors(AnyFilesInterceptor())
  @Patch('update-draft/:id')
  async updateDraft(
    @Param('id') id: string,
    @Body() body: any,
    @CurrentUser() user: any,
  ): Promise<UpdateDraftDisposisiResponseDto> {
    try {
      // Parse pengirim from form-data (bisa 'pengirim' atau 'pengirim_position_id')
      if (body.pengirim && !body.pengirim_position_id) {
        body.pengirim_position_id = parseInt(body.pengirim, 10);
      } else if (body.pengirim_position_id && typeof body.pengirim_position_id === 'string') {
        body.pengirim_position_id = parseInt(body.pengirim_position_id, 10);
      }

      body.pengirim_position_id = parseInt(user.position, 10);
      body.pengirim = String(user.position);

      // Parse tertuju/penerima from form-data
      if (body.tertuju && !body.penerima_position_ids) {
        if (typeof body.tertuju === 'string') {
          try {
            body.penerima_position_ids = JSON.parse(body.tertuju);
          } catch {
            body.penerima_position_ids = [parseInt(body.tertuju, 10)];
          }
        } else {
          body.penerima_position_ids = body.tertuju;
        }
      }

      // Parse penerima_position_ids if it's a string from form-data
      if (body.penerima_position_ids && typeof body.penerima_position_ids === 'string') {
        try {
          body.penerima_position_ids = JSON.parse(body.penerima_position_ids);
        } catch {
          body.penerima_position_ids = [parseInt(body.penerima_position_ids, 10)];
        }
      }

      // Ensure penerima_position_ids are numbers
      if (Array.isArray(body.penerima_position_ids)) {
        body.penerima_position_ids = body.penerima_position_ids.map((id: any) => 
          typeof id === 'string' ? parseInt(id, 10) : id
        );
      }

      // Parse tanggal_disposisi from form-data
      if (!body.tanggal_disposisi && body.tanggal) {
        body.tanggal_disposisi = body.tanggal;
      }

      // Parse ref.nomor dan ref.perihal from form-data (dot notation)
      if (!body.ref_nomor_surat && body['ref.nomor']) {
        body.ref_nomor_surat = body['ref.nomor'];
      }
      if (!body.perihal && body['ref.perihal']) {
        body.perihal = body['ref.perihal'];
      }

      // Parse disposisi array to string if needed
      if (body.disposisi && typeof body.disposisi === 'string') {
        try {
          const disposisiArr = JSON.parse(body.disposisi);
          if (Array.isArray(disposisiArr)) {
            body.disposisi = disposisiArr.join('\n');
          }
        } catch {
          // Already a string, keep as is
        }
      }

      // Parse lampiran_temp_ids if it's a string from form-data
      if (body.lampiran_temp_ids && typeof body.lampiran_temp_ids === 'string') {
        try {
          body.lampiran_temp_ids = JSON.parse(body.lampiran_temp_ids);
        } catch {
          body.lampiran_temp_ids = [body.lampiran_temp_ids];
        }
      }

      // Parse is_priority from form-data (string 'true'/'false' to actual boolean)
      if (body.is_priority !== undefined) {
        body.is_priority = body.is_priority === 'true' || body.is_priority === true;
      }

      return await this.disposisiService.updateDraft(
        id,
        body as UpdateDraftDisposisiDto,
        user?.persnum ? Number(user.persnum) : undefined,
      );
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

  /**
   * POST /DI/forward
   * Forward/Teruskan disposisi yang diterima ke bawahan
   *
   * Kondisi: User sudah menerima disposisi dan ingin meneruskan ke bawahannya
   *
   * Deskripsi: Endpoint khusus untuk disposisi lanjutan (forward).
   * - User harus merupakan penerima dari naskah yang akan di-forward
   * - User harus managerial (bisa kirim disposisi)
   * - Penerima baru harus bawahan valid dari user
   * - Otomatis membuat referensi ke naskah disposisi yang diterima
   * - Nomor surat otomatis dari naskah sebelumnya
   *
   * Flow:
   * 1. User A kirim disposisi ke User B (disposisi pertama)
   * 2. User B menerima disposisi dari inbox
   * 3. User B klik "Forward" dan pilih bawahan (User C)
   * 4. Sistem buat naskah baru dengan referensi ke naskah yang diterima User B
   *
   * @param body - Form data dengan field ForwardDisposisiDto
   * @returns ForwardDisposisiResponseDto
   *
   * @throws 400 - Bad Request (validation error / naskah bukan disposisi)
   * @throws 403 - Forbidden (bukan penerima / bukan managerial)
   * @throws 404 - Not Found (naskah/position not found)
   * @throws 500 - Internal Server Error
   */
  // @UseGuards(UserLevelGuard)
  // @UserLevels(UserLevel.MANAGERIAL, UserLevel.DIREKSI)
  @UseInterceptors(AnyFilesInterceptor())
  @Post('forward')
  async forwardDisposisi(
    @Body() body: any,
    @CurrentUser() user: any,
  ): Promise<ForwardDisposisiResponseDto> {
    try {
      console.log('[forward] Raw body:', JSON.stringify(body, null, 2));

      // Parse pengirim from form-data (bisa 'pengirim' atau 'pengirim_position_id')
      if (body.pengirim && !body.pengirim_position_id) {
        body.pengirim_position_id = parseInt(body.pengirim, 10);
      } else if (body.pengirim_position_id && typeof body.pengirim_position_id === 'string') {
        body.pengirim_position_id = parseInt(body.pengirim_position_id, 10);
      }

      body.pengirim_position_id = parseInt(user.position, 10);
      body.pengirim = String(user.position);
      console.log('[forward] Parsed pengirim_position_id:', body.pengirim_position_id);

      // Parse tertuju/penerima from form-data
      if (body.tertuju && !body.penerima_position_ids) {
        if (typeof body.tertuju === 'string') {
          try {
            body.penerima_position_ids = JSON.parse(body.tertuju);
          } catch {
            body.penerima_position_ids = [parseInt(body.tertuju, 10)];
          }
        } else {
          body.penerima_position_ids = body.tertuju;
        }
      }

      // Parse penerima_position_ids if it's a string from form-data
      if (body.penerima_position_ids && typeof body.penerima_position_ids === 'string') {
        try {
          body.penerima_position_ids = JSON.parse(body.penerima_position_ids);
        } catch {
          body.penerima_position_ids = [parseInt(body.penerima_position_ids, 10)];
        }
      }

      // Ensure penerima_position_ids are numbers
      if (Array.isArray(body.penerima_position_ids)) {
        body.penerima_position_ids = body.penerima_position_ids.map((id: any) => 
          typeof id === 'string' ? parseInt(id, 10) : id
        );
      }

      // Parse tanggal_disposisi from form-data
      if (!body.tanggal_disposisi && body.tanggal) {
        body.tanggal_disposisi = body.tanggal;
      }

      // Parse disposisi array to string if needed
      if (body.disposisi && typeof body.disposisi === 'string') {
        try {
          const disposisiArr = JSON.parse(body.disposisi);
          if (Array.isArray(disposisiArr)) {
            body.disposisi = disposisiArr.join('\n');
          }
        } catch {
          // Already a string, keep as is
        }
      }

      // Parse lampiran_temp_ids if it's a string from form-data
      if (body.lampiran_temp_ids && typeof body.lampiran_temp_ids === 'string') {
        try {
          body.lampiran_temp_ids = JSON.parse(body.lampiran_temp_ids);
        } catch {
          body.lampiran_temp_ids = [body.lampiran_temp_ids];
        }
      }

      // Parse copy_lampiran_from_previous (default: true jika tidak ada lampiran baru)
      if (body.copy_lampiran_from_previous === undefined || body.copy_lampiran_from_previous === null) {
        // Default: copy lampiran dari naskah sebelumnya jika tidak ada lampiran baru
        body.copy_lampiran_from_previous = !body.lampiran_temp_ids || body.lampiran_temp_ids.length === 0;
      } else if (typeof body.copy_lampiran_from_previous === 'string') {
        body.copy_lampiran_from_previous = body.copy_lampiran_from_previous === 'true' || body.copy_lampiran_from_previous === '1';
      }

      // Parse is_priority from form-data (string 'true'/'false' to actual boolean)
      if (body.is_priority !== undefined) {
        body.is_priority = body.is_priority === 'true' || body.is_priority === true;
      }

      console.log('[forward] Parsed body:', JSON.stringify(body, null, 2));

      return await this.disposisiService.forwardDisposisi(body as ForwardDisposisiDto);
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
          message: 'Failed to forward disposisi',
          error: error instanceof Error ? error.message : String(error),
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * POST /DI/preview-pdf
   * Generate preview PDF Disposisi untuk di-lihat sebelum dikirim
   * PDF di-generate tanpa save ke database
   * Support temporary lampiran system (lampiran_temp_ids)
   * 
   * @param body - GeneratePdfDisposisiDto dengan semua field dinamis
   * @param user - Current user dari JWT token
   * @param res - Express Response untuk send PDF
   */
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(AnyFilesInterceptor())
  @Post('preview-pdf')
  async previewPdf(
    @Body() body: any,
    @CurrentUser() user: any,
    @Res() res: Response,
  ) {
    try {
      // Transform & Validate DTO
      const dto = plainToInstance(GeneratePdfDisposisiDto, body);
      const errors = await validate(dto);
      if (errors.length > 0) {
        return res
          .status(HttpStatus.BAD_REQUEST)
          .json({ 
            error: 'Validation failed', 
            message: errors.map(e => Object.values(e.constraints || {})).flat() 
          });
      }

      // htmlContent is now optional - use empty string as default for catatan section
      const htmlContent = dto.htmlContent || '';

      try {
        assertDateNotInFuture(dto.tanggal_disposisi, 'Tanggal disposisi');
      } catch (error) {
        return res.status(HttpStatus.BAD_REQUEST).json({
          success: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: [error.message],
          error: 'Bad Request',
        });
      }

      // Helper function untuk format tanggal ke DD-MM-YYYY
      const formatDateToDDMMYYYY = (dateInput: string): string => {
        if (!dateInput) return '';
        try {
          if (/^\d{2}-\d{2}-\d{4}$/.test(dateInput)) return dateInput;
          if (/^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
            const dateObj = new Date(dateInput + 'T00:00:00');
            if (!isNaN(dateObj.getTime())) {
              const day = String(dateObj.getDate()).padStart(2, '0');
              const month = String(dateObj.getMonth() + 1).padStart(2, '0');
              const year = dateObj.getFullYear();
              return `${day}-${month}-${year}`;
            }
          }
          if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dateInput)) {
            const [day, month, year] = dateInput.split('/');
            return `${day.padStart(2, '0')}-${month.padStart(2, '0')}-${year}`;
          }
          if (/januari|februari|maret|april|mei|juni|juli|agustus|september|oktober|november|desember/i.test(dateInput)) {
            const monthMap: { [key: string]: string } = {
              'januari': '01', 'februari': '02', 'maret': '03', 'april': '04',
              'mei': '05', 'juni': '06', 'juli': '07', 'agustus': '08',
              'september': '09', 'oktober': '10', 'november': '11', 'desember': '12'
            };
            const match = dateInput.match(/(\d{1,2})\s+(\w+)\s+(\d{4})/);
            if (match) {
              return `${match[1].padStart(2, '0')}-${monthMap[match[2].toLowerCase()] || '01'}-${match[3]}`;
            }
          }
          return dateInput;
        } catch (e) { return dateInput; }
      };

      // Format tanggal disposisi ke DD-MM-YYYY
      let formattedDate = '';
      if (dto.tanggal_disposisi) {
        formattedDate = formatDateToDDMMYYYY(dto.tanggal_disposisi);
      } else {
        const now = new Date();
        const day = String(now.getDate()).padStart(2, '0');
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const year = now.getFullYear();
        formattedDate = `${day}-${month}-${year}`;
      }

      // Parse ref.nomor dan ref.perihal dari body (form-data uses dot notation)
      const refNomor = dto.ref_nomor || body['ref.nomor'] || '';
      const refPerihal = dto.ref_perihal || body['ref.perihal'] || '';

      // Check if tertuju are position_ids and convert to names
      let tertujuArray = dto.tertuju || [];
      const isPositionId = (value: any): boolean => {
        return typeof value === 'number' || 
               (typeof value === 'string' && /^\d+$/.test(value));
      };

      if (tertujuArray.length > 0 && isPositionId(tertujuArray[0])) {
        tertujuArray = await this.disposisiService.convertPositionIdsToNames(tertujuArray);
      }

      // Check if pengirim is position_id and convert to name
      let pengirimName = dto.pengirim || user?.positionText || '';
      if (pengirimName && isPositionId(pengirimName)) {
        const converted = await this.disposisiService.convertPositionIdsToNames([pengirimName]);
        pengirimName = converted[0] || pengirimName;
      }

      // Data referensi untuk kotak tengah PDF:
      // - Surat dari: pengirim saat ini (jabatan) - hanya jabatan tanpa organisasi
      // - Tanggal: tanggal disposisi saat ini (formatted)
      // - Nomor: dari input form (ref_nomor)
      // - Perihal: dari input form (ref_perihal)
      
      // Extract jabatan saja dari pengirimName (format bisa "Jabatan - Organisasi" atau "Jabatan")
      let refPengirimName = pengirimName;
      if (refPengirimName.includes(' - ')) {
        refPengirimName = refPengirimName.split(' - ')[0].trim();
      }

      // Format tanggal disposisi untuk refTanggal (Indonesian long format)
      const formatDateToIndonesian = (dateStr: string): string => {
        if (!dateStr) return '';
        try {
          const monthNames = [
            'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
            'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
          ];
          // Parse DD-MM-YYYY format
          if (/^\d{2}-\d{2}-\d{4}$/.test(dateStr)) {
            const [day, month, year] = dateStr.split('-');
            return `${parseInt(day)} ${monthNames[parseInt(month) - 1]} ${year}`;
          }
          return dateStr;
        } catch (e) {
          return dateStr;
        }
      };

      const refTanggal = formatDateToIndonesian(formattedDate);

      const pdfBuffer = await this.disposisiService.generatePdfFromHtml(
        htmlContent,
        tertujuArray,
        dto.disposisi || [],
        dto.sifat || 'Biasa',
        pengirimName,
        dto.tembusan || [],
        dto.lampiran_temp_ids || [],
        {
          refNomor,
          refPerihal,
          refTanggal,
          refPengirim: refPengirimName,
          tanggalDisposisi: formattedDate,
          catatan: dto.catatan || '',
        },
      );

      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="preview-disposisi.pdf"`,
        'Content-Length': pdfBuffer.length,
      });

      return res.status(HttpStatus.OK).send(pdfBuffer);
    } catch (error) {
      return res
        .status(HttpStatus.INTERNAL_SERVER_ERROR)
        .json({
          error: 'Failed to generate preview', 
          detail: error instanceof Error ? error.message : String(error) 
        });
    }
  }

  /**
   * POST /DI/generate-pdf
   * Generate PDF Disposisi dinamis dengan data dari request body
   * Mendukung semua field dari form UI:
   * - htmlContent: konten catatan
   * - pengirim: nama pengirim
   * - tertuju: array penerima
   * - tanggal_disposisi: tanggal disposisi
   * - sifat: klasifikasi (Biasa, Terbatas, Rahasia, Sangat Rahasia)
   * - ref.nomor: nomor surat referensi
   * - ref.perihal: perihal surat referensi
   * - disposisi: array checkbox yang dipilih
   * - lampiran_temp_ids: ID lampiran temporary
   * - final_pdf: flag untuk generate final atau preview
   * 
   * @param body - GeneratePdfDisposisiDto
   * @param user - Current user dari JWT token
   * @param res - Express Response untuk send PDF file
   */
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(AnyFilesInterceptor())
  @Post('generate-pdf')
  async generatePdf(
    @Body() body: any,
    @CurrentUser() user: any,
    @Res() res: Response,
  ) {
    try {
      // Transform & Validate DTO
      const dto = plainToInstance(GeneratePdfDisposisiDto, body);
      const errors = await validate(dto);
      if (errors.length > 0) {
        return res
          .status(HttpStatus.BAD_REQUEST)
          .json({ 
            error: 'Validation failed', 
            message: errors.map(e => Object.values(e.constraints || {})).flat() 
          });
      }

      // htmlContent is now optional - use empty string as default for catatan section
      const htmlContent = dto.htmlContent || '';

      try {
        assertDateNotInFuture(dto.tanggal_disposisi, 'Tanggal disposisi');
      } catch (error) {
        return res.status(HttpStatus.BAD_REQUEST).json({
          success: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: [error.message],
          error: 'Bad Request',
        });
      }

      // Helper function untuk format tanggal ke DD-MM-YYYY
      const formatDateToDDMMYYYY = (dateInput: string): string => {
        if (!dateInput) return '';
        try {
          if (/^\d{2}-\d{2}-\d{4}$/.test(dateInput)) return dateInput;
          if (/^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
            const dateObj = new Date(dateInput + 'T00:00:00');
            if (!isNaN(dateObj.getTime())) {
              const day = String(dateObj.getDate()).padStart(2, '0');
              const month = String(dateObj.getMonth() + 1).padStart(2, '0');
              const year = dateObj.getFullYear();
              return `${day}-${month}-${year}`;
            }
          }
          if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dateInput)) {
            const [day, month, year] = dateInput.split('/');
            return `${day.padStart(2, '0')}-${month.padStart(2, '0')}-${year}`;
          }
          if (/januari|februari|maret|april|mei|juni|juli|agustus|september|oktober|november|desember/i.test(dateInput)) {
            const monthMap: { [key: string]: string } = {
              'januari': '01', 'februari': '02', 'maret': '03', 'april': '04',
              'mei': '05', 'juni': '06', 'juli': '07', 'agustus': '08',
              'september': '09', 'oktober': '10', 'november': '11', 'desember': '12'
            };
            const match = dateInput.match(/(\d{1,2})\s+(\w+)\s+(\d{4})/);
            if (match) {
              return `${match[1].padStart(2, '0')}-${monthMap[match[2].toLowerCase()] || '01'}-${match[3]}`;
            }
          }
          return dateInput;
        } catch (e) { return dateInput; }
      };

      // Format tanggal disposisi ke DD-MM-YYYY
      let formattedDate = '';
      if (dto.tanggal_disposisi) {
        formattedDate = formatDateToDDMMYYYY(dto.tanggal_disposisi);
      } else {
        const now = new Date();
        const day = String(now.getDate()).padStart(2, '0');
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const year = now.getFullYear();
        formattedDate = `${day}-${month}-${year}`;
      }

      // Parse ref.nomor dan ref.perihal dari body (form-data uses dot notation)
      const refNomor = dto.ref_nomor || body['ref.nomor'] || '';
      const refPerihal = dto.ref_perihal || body['ref.perihal'] || '';

      // Check if tertuju are position_ids and convert to names
      let tertujuArray = dto.tertuju || [];
      const isPositionId = (value: any): boolean => {
        return typeof value === 'number' || 
               (typeof value === 'string' && /^\d+$/.test(value));
      };

      if (tertujuArray.length > 0 && isPositionId(tertujuArray[0])) {
        tertujuArray = await this.disposisiService.convertPositionIdsToNames(tertujuArray);
      }

      // Check if pengirim is position_id and convert to name
      let pengirimName = dto.pengirim || user?.positionText || '';
      if (pengirimName && isPositionId(pengirimName)) {
        const converted = await this.disposisiService.convertPositionIdsToNames([pengirimName]);
        pengirimName = converted[0] || pengirimName;
      }

      // Data referensi untuk kotak tengah PDF:
      // - Surat dari: pengirim saat ini (jabatan) - hanya jabatan tanpa organisasi
      // - Tanggal: tanggal disposisi saat ini (formatted)
      // - Nomor: dari input form (ref_nomor)
      // - Perihal: dari input form (ref_perihal)
      
      // Extract jabatan saja dari pengirimName (format bisa "Jabatan - Organisasi" atau "Jabatan")
      let refPengirimName = pengirimName;
      if (refPengirimName.includes(' - ')) {
        refPengirimName = refPengirimName.split(' - ')[0].trim();
      }

      // Format tanggal disposisi untuk refTanggal (Indonesian long format)
      const formatDateToIndonesian = (dateStr: string): string => {
        if (!dateStr) return '';
        try {
          const monthNames = [
            'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
            'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
          ];
          // Parse DD-MM-YYYY format
          if (/^\d{2}-\d{2}-\d{4}$/.test(dateStr)) {
            const [day, month, year] = dateStr.split('-');
            return `${parseInt(day)} ${monthNames[parseInt(month) - 1]} ${year}`;
          }
          return dateStr;
        } catch (e) {
          return dateStr;
        }
      };

      const refTanggal = formatDateToIndonesian(formattedDate);

      // Parse disposisi array (checkbox options)
      let disposisiArray = dto.disposisi || [];
      console.log('[generate-pdf] tertuju:', tertujuArray);
      console.log('[generate-pdf] disposisi:', disposisiArray);
      console.log('[generate-pdf] tanggalDisposisi:', formattedDate);
      console.log('[generate-pdf] catatan:', dto.catatan);

      const pdfBuffer = await this.disposisiService.generatePdfFromHtml(
        htmlContent,
        tertujuArray,
        disposisiArray,
        dto.sifat || 'Biasa',
        pengirimName,
        dto.tembusan || [],
        dto.lampiran_temp_ids || [],
        {
          refNomor,
          refPerihal,
          refTanggal,
          refPengirim: refPengirimName,
          tanggalDisposisi: formattedDate,
          isFinal: dto.final_pdf === 'true' || dto.final_pdf === '1',
          catatan: dto.catatan || '',
        },
      );

      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="disposisi-${Date.now()}.pdf"`,
        'Content-Length': pdfBuffer.length,
      });

      return res.status(HttpStatus.OK).send(pdfBuffer);
    } catch (error) {
      return res
        .status(HttpStatus.INTERNAL_SERVER_ERROR)
        .json({ error: 'Failed to generate PDF', detail: error instanceof Error ? error.message : String(error) });
    }
  }

  /**
   * PATCH /DI/:id/unset-priority
   * Hapus flag priority dari disposisi (set is_priority menjadi false/0)
   *
   * @param id - ID Naskah Disposisi
   * @returns Response dengan status update
   */
  @Patch(':id/unset-priority')
  async unsetPriority(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ): Promise<any> {
    try {
      return await this.disposisiService.unsetPriority(id, String(user.position));
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      if (error instanceof NotFoundException) {
        throw new HttpException(
          {
            success: false,
            statusCode: HttpStatus.NOT_FOUND,
            message: error.message,
          },
          HttpStatus.NOT_FOUND,
        );
      }

      throw new HttpException(
        {
          success: false,
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Gagal menghapus priority flag',
          error: error instanceof Error ? error.message : String(error),
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
