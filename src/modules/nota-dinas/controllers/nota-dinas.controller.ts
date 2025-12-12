import { Controller, Get, Post, Put, Patch, Body, Param, ParseIntPipe, HttpException, HttpStatus, Query, UseGuards, UseInterceptors, UploadedFiles, Res } from '@nestjs/common';
import type { Response } from 'express';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { NotaDinasService } from '../services/nota-dinas.service';
import { NotaDinasRecipientResponseDto, GetRecipientQueryDto } from '../dto/nota-dinas-recipient-response.dto';
import { CreateNotaDinasDto, FinalizeDraftDto, UpdateDraftDto } from '../dto/create-nota-dinas.dto';
import { SendMessageResponseDto } from '../dto/send-message-response.dto';
import { GetSendMessageResponseDto } from '../dto/get-send-message.dto';
import { UserLevelGuard } from '../../../common/guards';
import { UserLevels, Public } from '../../../common/decorators';
import { UserLevel } from '../../../common/enums';

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
   * GET /ND/:id
   * Get detail Nota Dinas by ID
   * Menampilkan keseluruhan informasi surat termasuk PDF final
   *
   * @param id - Naskah ID (UUID)
   * @returns Detail nota dinas lengkap
   *
   * Response includes:
   * - Naskah info (id, nomor, tanggal, status, jenis)
   * - ND specific (kop, kepada Yth, dari, perihal, konten, tembusan)
   * - Sirkulasi (pengirim, penerima, tembusan)
   * - Lampiran files
   * - Final PDF
   *
   * @throws 404 - Not Found (naskah tidak ditemukan)
   * @throws 500 - Internal Server Error
   */
  @Get(':id')
  async getNotaDinasDetail(
    @Param('id') id: string,
  ): Promise<any> {
    try {
      return await this.notaDinasService.getNotaDinasDetail(id);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        {
          success: false,
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Failed to get Nota Dinas detail',
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
   * Method: POST (karena membuat resource baru)
   *
   * Form-data fields:
   * - pengirim, penerima, tembusan, klasifikasi, sifat, perihal, konten, dll
   * - lampiran_files: file[] (multiple files, optional)
   *
   * @returns SendMessageResponseDto
   *
   * @throws 400 - Bad Request (validation error)
   * @throws 404 - Not Found (pengirim/penerima not found)
   * @throws 403 - Forbidden (pengirim is not managerial)
   * @throws 500 - Internal Server Error
   */
  @Public() // Development: Bypass auth
  // @UseGuards(UserLevelGuard)
  // @UserLevels(UserLevel.MANAGERIAL, UserLevel.DIREKSI)
  @Post('save-draft')
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'lampiran_files', maxCount: 10 },
        
      ],
      {
        limits: {
          fileSize: 50 * 1024 * 1024, // 50MB per file
        },
      },
    ),
  )
  async saveDraft(
    @Body() body: any,
    @UploadedFiles() files: { lampiran_files?: Express.Multer.File[] },
  ): Promise<SendMessageResponseDto> {
    try {
      const dto = await this.notaDinasService.parseFormDataToDto(body, files);
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
   * Form-data fields:
   * - pengirim: number
   * - penerima: number[] (JSON string or comma-separated)
   * - tembusan: number[] (JSON string or comma-separated, optional)
   * - klasifikasi: string
   * - klasifikasi_text: string (optional)
   * - sifat: string (sangat_rahasia|rahasia|terbatas|biasa|terbuka)
   * - perihal: string
   * - konten: string
   * - english: boolean (optional)
   * - nama_tempat: string (optional)
   * - nama_jabatan: string (optional)
   * - tanda_tangan: string (optional)
   * - nama_lengkap: string (optional)
   * - lampiran: string (optional, keterangan lampiran)
   * - lampiran_files: file[] (multiple files, optional)
   * - final_pdf: string (optional)
   * - tgl: string (optional, format YYYY-MM-DD)
   *
   * @returns SendMessageResponseDto
   *
   * @throws 400 - Bad Request (validation error)
   * @throws 404 - Not Found (pengirim/penerima not found)
   * @throws 403 - Forbidden (pengirim is not managerial)
   * @throws 500 - Internal Server Error
   */
  @Public() // Development: Bypass auth
  // @UseGuards(UserLevelGuard)
  // @UserLevels(UserLevel.MANAGERIAL, UserLevel.DIREKSI)
  @Post('send-message')
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'lampiran_files', maxCount: 10 },
        { name: 'final_pdf', maxCount: 1 },
      ],
      {
        limits: {
          fileSize: 50 * 1024 * 1024, // 50MB per file
        },
      },
    ),
  )
  async sendMessage(
    @Body() body: any,
    @UploadedFiles() files: { lampiran_files?: Express.Multer.File[]; final_pdf?: Express.Multer.File[] },
  ): Promise<SendMessageResponseDto> {
    try {
      // Parse form-data to DTO
      const dto = await this.notaDinasService.parseFormDataToDto(body, files);
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
   * PATCH /ND/update-draft/:id
   * Update draft Nota Dinas (status tetap draf)
   * Bisa partial update - hanya field yang diisi yang akan diupdate
   * Method: PATCH (karena partial update ke resource yang sudah ada)
   *
   * Form-data fields:
   * - pengirim, penerima, tembusan, klasifikasi, sifat, perihal, konten, dll (semua optional)
   * - lampiran_files: file[] (multiple files, optional)
   *
   * @param id - Naskah ID (UUID)
   * @param body - Form-data body
   * @param files - Uploaded files
   * @returns SendMessageResponseDto
   *
   * @throws 400 - Bad Request (naskah bukan draf atau bukan ND)
   * @throws 404 - Not Found (naskah tidak ditemukan)
   * @throws 500 - Internal Server Error
   */
  @Public() // Development: Bypass auth
  // @UseGuards(UserLevelGuard)
  // @UserLevels(UserLevel.MANAGERIAL, UserLevel.DIREKSI)
  @Patch('update-draft/:id')
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'lampiran_files', maxCount: 10 },
      ],
      {
        limits: {
          fileSize: 50 * 1024 * 1024, // 50MB per file
        },
      },
    ),
  )
  async updateDraft(
    @Param('id') id: string,
    @Body() body: any,
    @UploadedFiles() files: { lampiran_files?: Express.Multer.File[] },
  ): Promise<SendMessageResponseDto> {
    try {
      const dto = await this.notaDinasService.parseFormDataToUpdateDraftDto(body, files);
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
  @Public() // Development: Bypass auth
  // @UseGuards(UserLevelGuard)
  // @UserLevels(UserLevel.MANAGERIAL, UserLevel.DIREKSI)
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

  /**
   * POST /ND/generate-pdf
   * Generate PDF dari HTML content untuk preview/download
   * Menggunakan Puppeteer di backend untuk render HTML
   * 
   * @param body - { htmlContent: string, penerima: string[], dari: string, tanggal: string, penandatangan: string, tembusan?: string[] }
   * @param res - Express Response untuk send PDF file
   */
  @Post('generate-pdf')
  async generatePdf(
    @Body() body: { htmlContent: string; penerima: string[]; dari: string; tanggal: string; penandatangan: string; tembusan?: string[] },
    @Res() res: Response,
  ) {
    try {
      const pdfBuffer = await this.notaDinasService.generatePdfFromHtml(
        body.htmlContent,
        body.penerima,
        body.dari,
        body.tanggal,
        body.penandatangan,
        body.tembusan || [],
      );

      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="nota-dinas-${Date.now()}.pdf"`,
        'Content-Length': pdfBuffer.length,
      });

      return res.status(HttpStatus.OK).send(pdfBuffer);
    } catch (error) {
      return res
        .status(HttpStatus.INTERNAL_SERVER_ERROR)
        .json({ error: 'Failed to generate PDF', detail: error.message });
    }
  }
}
