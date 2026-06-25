import { Controller, Get, Post, Put, Patch, Delete, Param, ParseIntPipe, Query, Body, HttpException, HttpStatus, UseGuards, UseInterceptors, Res, UploadedFiles } from '@nestjs/common';
import type { Response } from 'express';
import { AnyFilesInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { v4 as uuidv4 } from 'uuid';
import { SuratDinasEksternalService } from '../services/surat-dinas-eksternal.service';
import { SdeRecipientResponseDto, GetSdeRecipientQueryDto, SdeOrgDataPositionDto } from '../dto/sde-recipient-response.dto';
import { CreateSuratDinasEksternalDto, UpdateSdeDraftDto, FinalizeSdeDraftDto } from '../dto/create-surat-dinas-eksternal.dto';
import { SendSdeEmailDto } from '../dto/send-sde-email.dto';
import { SdeSendMessageResponseDto } from '../dto/send-message-response.dto';
import { UserLevelGuard, JwtAuthGuard } from '../../../common/guards';
import { UserLevels, Public, CurrentUser } from '../../../common/decorators';
import { UserLevel } from '../../../common/enums';
import { assertDateNotInFuture } from '../../../common/helpers/date-validation.helper';

@Controller('SDE')
export class SuratDinasEksternalController {
  constructor(
    private readonly sdeService: SuratDinasEksternalService,
  ) {}

  /**
   * Helper: Convert penerima/recipient array to names
   * Supports: eksternal UUIDs, position IDs, or names
   */
  private async convertRecipientsToNames(
    recipientArray: any[],
    tanggal?: string,
  ): Promise<string[]> {
    if (!recipientArray || recipientArray.length === 0) {
      return [];
    }

    const isPositionId = (value: any): boolean => {
      return typeof value === 'number' || 
             (typeof value === 'string' && /^\d+$/.test(value));
    };

    const isEksternalId = (value: any): boolean => {
      const str = String(value).trim();
      return str.includes('-') && str.length === 36; // UUID format
    };

    // Determine type from first element
    const firstValue = recipientArray[0];
    
    if (isEksternalId(firstValue)) {
      // Convert eksternal UUIDs to company names
      return await this.sdeService.convertEksternalIdsToNames(recipientArray);
    } else if (isPositionId(firstValue)) {
      // Convert position IDs to position names
      return await this.sdeService.convertPositionIdsToNames(recipientArray, tanggal);
    }
    
    // Already names, return as is
    return recipientArray;
  }

  /**
   * GET /SDE/get-recipient
   * Get Surat Dinas Eksternal (SDE) recipients for a sender
   *
   * SDE Rules:
  * - Pengirim: dari org_data (positionId)
   * - Penerima: dari tabel eksternal (pihak luar perusahaan)
   * 
   * @param user - User dari JWT token (contains position)
   * @param query - Optional query params:
   *   - tgl: date in format YYYY-MM-DD
   *   - pengirim: optional position_id pengirim (untuk kasus konsep/draft)
   *
   * @example
   * GET /SDE/get-recipient (gunakan position dari JWT)
   * GET /SDE/get-recipient?pengirim=70016742 (gunakan pengirim yang dipilih)
   */
  @UseGuards(JwtAuthGuard)
  @Get('get-recipient')
  async getSdeRecipients(
    @CurrentUser() user: any,
    @Query() query: GetSdeRecipientQueryDto,
  ): Promise<SdeRecipientResponseDto> {
    // Jika pengirim ada di query, gunakan itu; jika tidak, gunakan position dari JWT
    const positionId = query.pengirim ? parseInt(query.pengirim, 10) : parseInt(user.position, 10);
    return this.sdeService.getSdeRecipients(positionId, query.tgl);
  }

  /**
   * GET /SDE/get-tembusan
   * Get tembusan (CC) recipients for SDE using org_data
   *
   * Tembusan Rules (same as SDI):
   * - Pengirim: dari org_data (positionId), harus managerial (chief=1)
   * - Tembusan: internal positions dengan chief=1, bod_tag='BOD', sama company
   * 
   * @param user - User dari JWT token (contains position)
   * @param query - Optional query params:
   *   - tgl: date in format YYYY-MM-DD
   *   - pengirim: optional position_id pengirim (untuk kasus konsep/draft)
   * @returns Tembusan recipients list
   *
   * @example
   * GET /SDE/get-tembusan (gunakan position dari JWT)
   * GET /SDE/get-tembusan?pengirim=70016742 (gunakan pengirim yang dipilih)
   */
  @UseGuards(JwtAuthGuard)
  @Get('get-tembusan')
  async getSdeTembusan(
    @CurrentUser() user: any,
    @Query() query: GetSdeRecipientQueryDto,
  ): Promise<any> {
    // Jika pengirim ada di query, gunakan itu; jika tidak, gunakan position dari JWT
    const positionId = query.pengirim ? parseInt(query.pengirim, 10) : parseInt(user.position, 10);
    return this.sdeService.getSdeTembusan(positionId, query.tgl);
  }

  /**
   * GET /SDE/get-senders
   * Get eligible senders for Konsep Surat Dinas Eksternal
   *
   * @param user - User dari JWT token (contains position)
   * @param query - Query parameters:
   *   - tgl: optional date in format YYYY-MM-DD
   *   - pengirim: optional position_id untuk mendapatkan daftar sender yang valid
   * @returns SdeOrgDataPositionDto[] - List of eligible senders
   *
   * @example
   * GET /SDE/get-senders (gunakan position dari JWT)
   * GET /SDE/get-senders?pengirim=70017418 (gunakan pengirim yang dipilih)
   */
  @UseGuards(JwtAuthGuard)
  @Get('get-senders')
  async getSdeSenders(
    @CurrentUser() user: any,
    @Query() query: GetSdeRecipientQueryDto,
  ): Promise<SdeOrgDataPositionDto[]> {
    try {
      // Jika pengirim ada di query, gunakan itu; jika tidak, gunakan position dari JWT
      const positionId = query.pengirim ? parseInt(query.pengirim, 10) : parseInt(user.position, 10);
      return await this.sdeService.getSenderKonsep(
        positionId,
        query.tgl,
      );
    } catch (error) {
      // Re-throw NestJS exceptions as-is
      if (error instanceof HttpException) {
        throw error;
      }

      // Generic error handler
      throw new HttpException(
        {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Failed to get SDE senders',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * GET /SDE/:id
   * Get Surat Dinas Eksternal detail by ID
   * 
   * Includes:
   * - Naskah info (nomor, tanggal, perihal, status, dll)
   * - Konten lengkap SDE
   * - Sirkulasi (pengirim, penerima eksternal)
   * - Lampiran files
   * - Final PDF
   *
   * @param id - Naskah ID (UUID)
   * @throws 404 - Not Found (naskah tidak ditemukan)
   * @throws 500 - Internal Server Error
   */
  @Get(':id')
  async getSdeDetail(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ): Promise<any> {
    try {
      return await this.sdeService.getSdeDetail(id, user.position);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        {
          success: false,
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Failed to get SDE detail',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * POST /SDE/:id/send-email
   * Kirim SDE via email ke penerima eksternal
   * Body: { to, cc?, bcc?, from_as?, lampiran_ids? }
   */
  @Post(':id/send-email')
  @UseGuards(JwtAuthGuard)
  async sendSdeEmail(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body() dto: SendSdeEmailDto,
  ): Promise<any> {
    try {
      return await this.sdeService.sendSdeEmail(id, user.position, dto);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        {
          success: false,
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Failed to send SDE via email',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * POST /SDE/send-message
   * Send Surat Dinas Eksternal (create and send immediately)
   * 
   * Accepts: form-data with optional files
   * 
   * Status:
   * - 'final': jika tanpa tanda_tangan
   * - 'final_tte': jika dengan tanda_tangan
   *
   * @param body - Raw form body
   * @param files - Optional uploaded files (AnyFilesInterceptor)
   * @returns SdeSendMessageResponseDto
   */
  // @UseGuards(UserLevelGuard)
  // @UserLevels(UserLevel.DIREKSI)
  @Post('send-message')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(AnyFilesInterceptor())
  async sendMessage(
    @CurrentUser() user: any,
    @Body() body: any,
    @UploadedFiles() files?: Express.Multer.File[],
  ): Promise<SdeSendMessageResponseDto> {
    try {
      // Parse form-data to DTO
      const dto = await this.sdeService.parseFormDataToCreateDto(body, files);

      // Extract persnum from JWT user
      const persnum = user?.persnum ? Number(user.persnum) : undefined;

      console.log('[SDE send-message] User persnum:', persnum);
      console.log('[SDE send-message] DTO sign_option:', dto.sign_option);
      console.log('[SDE send-message] DTO passphrase:', dto.passphrase ? '***' : 'undefined');

      return await this.sdeService.sendMessage(dto, persnum);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        {
          success: false,
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Failed to send SDE',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * POST /SDE/save-draft
   * Save Surat Dinas Eksternal as draft
   * 
   * Accepts: form-data with optional files
   * 
   * Status: 'draf'
   * Nomor: DRAFT-{timestamp}
   *
   * @param body - Raw form body
   * @param files - Optional uploaded files (AnyFilesInterceptor)
   * @returns SdeSendMessageResponseDto
   */
  /**
   * POST /SDE/save-draft
   * Save Surat Dinas Eksternal as draft
   * 
   * Accepts: form-data with optional files
   * 
   * Status: 'draf'
   * Nomor: DRAFT-{timestamp}
   *
   * @param body - Raw form body
   * @param files - Optional uploaded files (AnyFilesInterceptor)
   * @returns SdeSendMessageResponseDto
   */
  // @UseGuards(UserLevelGuard)
  // @UserLevels(UserLevel.DIREKSI)
  @Post('save-draft')
  @UseInterceptors(AnyFilesInterceptor())
  async saveDraft(
    @Body() body: any,
    @UploadedFiles() files?: Express.Multer.File[],
  ): Promise<SdeSendMessageResponseDto> {
    try {
      // Parse form-data to DTO
      const dto = await this.sdeService.parseFormDataToCreateDto(body, files);
      return await this.sdeService.saveDraft(dto);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        {
          success: false,
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Failed to save SDE draft',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * PATCH /SDE/update-draft/:id
   * Update existing draft Surat Dinas Eksternal (partial update)
   *
   * Accepts: form-data with optional files (partial updates)
   * Partial update - only provided fields will be updated
   * Status remains 'draf'
   *
   * @param id - Naskah ID (UUID)
   * @param body - Raw form body (partial)
   * @param files - Optional files for lampiran
   * @returns SdeSendMessageResponseDto with updated data
   *
   * @throws 404 - Not Found (naskah not found)
   * @throws 400 - Bad Request (not a draft or not SDE)
   */
  // @UseGuards(UserLevelGuard)
  // @UserLevels(UserLevel.DIREKSI)
  @Patch('update-draft/:id')
  @UseInterceptors(AnyFilesInterceptor())
  async updateDraft(
    @Param('id') id: string,
    @Body() body: any,
    @UploadedFiles() files?: Express.Multer.File[],
  ): Promise<SdeSendMessageResponseDto> {
    try {
      // For partial update, upload temp lampiran if files provided
      if (files && files.length > 0) {
        const lampiranTempIds = await this.sdeService.uploadTemporaryLampiran(
          files,
          id,
          'SDE',
        );
        body.lampiran_temp_ids = lampiranTempIds;
      }

      // Parse boolean fields from form-data (string 'true'/'false' to actual boolean)
      if (body.english !== undefined) {
        body.english = body.english === 'true' || body.english === true;
      }

      // Parse array fields from form-data JSON strings
      const parseJsonArray = (value: any): any[] => {
        if (!value) return [];
        if (Array.isArray(value)) return value;
        if (typeof value === 'string') {
          try {
            return JSON.parse(value);
          } catch {
            return [value];
          }
        }
        return [value];
      };

      if (body.penerima !== undefined) {
        body.penerima = parseJsonArray(body.penerima);
      }
      if (body.tertuju !== undefined) {
        body.tertuju = parseJsonArray(body.tertuju);
      }
      if (body.tembusan !== undefined) {
        body.tembusan = parseJsonArray(body.tembusan);
      }
      if (body.lampiran_temp_ids !== undefined) {
        body.lampiran_temp_ids = parseJsonArray(body.lampiran_temp_ids);
      }

      const dto = body as UpdateSdeDraftDto;
      return await this.sdeService.updateDraft(id, dto);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        {
          success: false,
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Failed to update SDE draft',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * POST /SDE/upload-temporary
   * Upload lampiran ke temporary storage untuk SDE
   * Files akan disimpan sementara dengan is_temporary=1
   * Return array of file IDs yang nanti digunakan di endpoint send-message
   *
   * Form-data:
   * - lampiran_files: file[] (multiple PDF files)
   *
   * @returns Array of lampiran IDs
   * 
   * Response:
   * {
   *   "success": true,
   *   "data": {
   *     "temp_folder_id": "uuid",
   *     "file_ids": ["uuid1", "uuid2", ...]
   *   }
   * }
   *
   * @throws 400 - Bad Request (no files uploaded)
   * @throws 500 - Internal Server Error
   */
  @Post('upload-temporary')
  @UseInterceptors(
    FilesInterceptor('lampiran_files', 10, {
      limits: {
        fileSize: 50 * 1024 * 1024, // 50MB per file
      },
    }),
  )
  async uploadTemporary(
    @UploadedFiles() files: Express.Multer.File[],
  ): Promise<{ success: boolean; data: { temp_folder_id: string; file_ids: string[] } }> {
    try {
      if (!files || files.length === 0) {
        throw new HttpException(
          {
            success: false,
            statusCode: HttpStatus.BAD_REQUEST,
            message: 'Tidak ada file yang diupload',
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      const fileIds = await this.sdeService.uploadTemporaryLampiran(files);
      
      // Get temp_folder_id from first file (all files in same temp folder)
      const firstFile = await this.sdeService['naskahLampiranRepository'].findOne({
        where: { id: fileIds[0] },
      });

      return {
        success: true,
        data: {
          temp_folder_id: firstFile?.temp_folder_id || '',
          file_ids: fileIds,
        },
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        {
          success: false,
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Failed to upload temporary lampiran',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * PUT /SDE/send-draft/:id
   * Finalize and send a draft Surat Dinas Eksternal
   *
   * Accepts: form-data with optional final updates & files
   *
   * - Move temporary lampiran to final folder
   * - Generate official nomor surat
   * - Auto-generate PDF & merge lampiran
   * - Update status to 'final' or 'final_tte' (if tanda_tangan provided)
   * - Set isDraft = false in sirkulasi
   *
   * Digital Signature Options:
   * - sign_option: 'digsig' | 'qr_only' | 'ttd_basah'
   * - passphrase: BSrE passphrase (required if sign_option = 'digsig')
   *
   * @param id - Naskah ID (UUID)
   * @param body - Raw form body (optional final updates)
   * @param files - Optional additional files
   * @param user - JWT user context (untuk persnum BSrE)
   * @returns SdeSendMessageResponseDto with finalized data
   *
   * @throws 404 - Not Found (naskah not found)
   * @throws 400 - Bad Request (not a draft or not SDE)
   */
  @UseGuards(JwtAuthGuard)
  @Put('send-draft/:id')
  @UseInterceptors(AnyFilesInterceptor())
  async sendDraft(
    @Param('id') id: string,
    @Body() body: any,
    @UploadedFiles() files?: Express.Multer.File[],
    @CurrentUser() user?: any,
  ): Promise<SdeSendMessageResponseDto> {
    try {
      // For finalize, upload temp lampiran if files provided
      if (files && files.length > 0) {
        const lampiranTempIds = await this.sdeService.uploadTemporaryLampiran(
          files,
          id,
          'SDE',
        );
        body.lampiran_temp_ids = lampiranTempIds;
      }

      // Extract persnum from JWT user for BSrE signing
      const persnum = user?.persnum;
      
      console.log('[SDE Controller] sendDraft called with:', {
        id,
        sign_option: body.sign_option,
        persnum: persnum,
        hasPassphrase: !!body.passphrase,
      });

      // Parse form-data to DTO
      const dto = await this.sdeService.parseFormDataToFinalizeDraftDto(body);
      
      return await this.sdeService.finalizeDraft(id, dto, persnum);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        {
          success: false,
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Failed to send SDE draft',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * GET /SDE/draft-list/:positionId
   * Get all draft SDE by position (where position is pengirim)
   *
   * Returns list of drafts with full data for editing
   *
   * @param positionId - Position ID of the sender
   * @param tgl - Optional date for org_data validation (query param)
   * @returns List of draft SDE
   */
  @Get('draft-list/:positionId')
  async getDraftList(
    @Param('positionId', ParseIntPipe) positionId: number,
    @Query('tgl') tgl?: string,
  ): Promise<any> {
    try {
      return await this.sdeService.getDraftList(positionId, tgl);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        {
          success: false,
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Failed to get SDE draft list',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * POST /SDE/preview-pdf
   * Generate preview PDF Surat Dinas Eksternal untuk di-lihat sebelum dikirim
   * PDF di-generate tanpa save ke database
   * User bisa kembali edit dan preview ulang
   * Support temporary lampiran system (lampiran_temp_ids)
   * 
   * @param body - { htmlContent/konten, penerima/tertuju, nama_tempat, tanggal, nama_jabatan, nama_lengkap, tembusan, perihal, sifat, lampiran_temp_ids }
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
      // Support both 'konten' (from form) and 'htmlContent' (legacy) field names
      if (body.konten && !body.htmlContent) {
        body.htmlContent = body.konten;
      }

      if (!body || !body.htmlContent) {
        return res.status(HttpStatus.BAD_REQUEST).json({
          success: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: ['htmlContent harus diisi'],
          error: 'Bad Request',
        });
      }

      if (!body.klasifikasi) {
        return res.status(HttpStatus.BAD_REQUEST).json({
          success: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: ['Klasifikasi harus diisi'],
          error: 'Bad Request',
        });
      }

      if (!body.perihal) {
        return res.status(HttpStatus.BAD_REQUEST).json({
          success: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: ['Perihal harus diisi'],
          error: 'Bad Request',
        });
      }

      // Support both 'tertuju' and 'penerima' field names
      let penerimaArray = body.tertuju || body.penerima || [];
      
      // Parse penerima if it's a string (from form-data)
      if (typeof penerimaArray === 'string') {
        try {
          penerimaArray = JSON.parse(penerimaArray);
        } catch {
          penerimaArray = [penerimaArray];
        }
      }

      if (penerimaArray.length === 0) {
        return res.status(HttpStatus.BAD_REQUEST).json({
          success: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: ['Minimal harus ada 1 penerima (tertuju/penerima)'],
          error: 'Bad Request',
        });
      }

      try {
        assertDateNotInFuture(body.tanggal || body.tgl, 'Tanggal naskah');
      } catch (error) {
        return res.status(HttpStatus.BAD_REQUEST).json({
          success: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: [error.message],
          error: 'Bad Request',
        });
      }

      // Convert to names (supports eksternal UUIDs, position IDs, or names)
      penerimaArray = await this.convertRecipientsToNames(penerimaArray, body.tanggal || body.tgl);

      // Parse tembusan if it's a string (from form-data)
      let tembusanArray = body.tembusan || [];
      if (typeof tembusanArray === 'string') {
        try {
          tembusanArray = JSON.parse(tembusanArray);
        } catch {
          tembusanArray = [tembusanArray];
        }
      }

      // Convert tembusan to names (position IDs)
      if (tembusanArray.length > 0) {
        const isPositionId = (value: any): boolean => {
          return typeof value === 'number' || 
                 (typeof value === 'string' && /^\d+$/.test(value));
        };
        
        if (isPositionId(tembusanArray[0])) {
          tembusanArray = await this.sdeService.convertPositionIdsToNames(tembusanArray, body.tanggal || body.tgl);
        }
      }

      // Parse lampiran_temp_ids if provided
      let lampiranTempIds: string[] = [];
      if (body.lampiran_temp_ids) {
        if (Array.isArray(body.lampiran_temp_ids)) {
          lampiranTempIds = body.lampiran_temp_ids;
        } else if (typeof body.lampiran_temp_ids === 'string') {
          try {
            lampiranTempIds = JSON.parse(body.lampiran_temp_ids);
          } catch {
            lampiranTempIds = [body.lampiran_temp_ids];
          }
        }
      }

      // Use user's position and name from JWT token (same as Nota Dinas)
      const namaJabatan = user?.positionText || '';
      const namaLengkap = user?.nama || '';

      // Get dynamic header info dari sub_area_alamat berdasarkan user context
      const headerInfo = await this.sdeService.getHeaderInfoByUser(
        {
          company: user?.company,
          area: user?.area,
          subArea: user?.subArea,
        },
        body.tgl || body.tanggal,
      );

      // Use kota from headerInfo if available, else fallback to body.nama_tempat or 'Tangerang'
      const dynamicNamaTempat = headerInfo?.kota || body.nama_tempat || 'Tangerang';

      const pdfBuffer = await this.sdeService.generatePdfFromHtml(
        body.htmlContent,
        penerimaArray,
        dynamicNamaTempat,
        body.tanggal || body.tgl || '',
        namaJabatan,
        namaLengkap,
        tembusanArray,
        lampiranTempIds,
        body.perihal || '',
        body.sifat || 'Biasa',
        body.nomor || '',
        body.lampiran || '-',
        headerInfo || undefined,
        body.english === true || body.english === 'true',
      );

      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="preview-surat-dinas-eksternal.pdf"`,
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
   * POST /SDE/generate-pdf
   * Generate PDF dari HTML content untuk preview/download Surat Dinas Eksternal
   * Menggunakan Puppeteer di backend untuk render HTML
   * Support temporary lampiran system (lampiran_temp_ids)
   * 
   * @param body - { htmlContent: string, penerima/tertuju: string[], nama_tempat: string, tanggal: string, nama_jabatan: string, nama_lengkap: string, tembusan?: string[], perihal: string, sifat: string, lampiran_temp_ids?: string[] }
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
      // Support both 'konten' (from form) and 'htmlContent' (legacy) field names
      if (body.konten && !body.htmlContent) {
        body.htmlContent = body.konten;
      }

      if (!body || !body.htmlContent) {
        return res.status(HttpStatus.BAD_REQUEST).json({
          success: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: ['htmlContent harus diisi'],
          error: 'Bad Request',
        });
      }

      if (!body.klasifikasi) {
        return res.status(HttpStatus.BAD_REQUEST).json({
          success: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: ['Klasifikasi harus diisi'],
          error: 'Bad Request',
        });
      }

      if (!body.perihal) {
        return res.status(HttpStatus.BAD_REQUEST).json({
          success: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: ['Perihal harus diisi'],
          error: 'Bad Request',
        });
      }

      // Support both 'tertuju' and 'penerima' field names
      let penerimaArray = body.tertuju || body.penerima || [];
      
      // Parse penerima if it's a string (from form-data)
      if (typeof penerimaArray === 'string') {
        try {
          penerimaArray = JSON.parse(penerimaArray);
        } catch {
          penerimaArray = [penerimaArray];
        }
      }

      if (penerimaArray.length === 0) {
        return res.status(HttpStatus.BAD_REQUEST).json({
          success: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: ['Minimal harus ada 1 penerima (tertuju/penerima)'],
          error: 'Bad Request',
        });
      }

      try {
        assertDateNotInFuture(body.tanggal || body.tgl, 'Tanggal naskah');
      } catch (error) {
        return res.status(HttpStatus.BAD_REQUEST).json({
          success: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: [error.message],
          error: 'Bad Request',
        });
      }

      // Convert to names (supports eksternal UUIDs, position IDs, or names)
      penerimaArray = await this.convertRecipientsToNames(penerimaArray, body.tanggal || body.tgl);

      // Parse tembusan if it's a string (from form-data)
      let tembusanArray = body.tembusan || [];
      if (typeof tembusanArray === 'string') {
        try {
          tembusanArray = JSON.parse(tembusanArray);
        } catch {
          tembusanArray = [tembusanArray];
        }
      }

      // Convert tembusan to names (position IDs)
      if (tembusanArray.length > 0) {
        const isPositionId = (value: any): boolean => {
          return typeof value === 'number' || 
                 (typeof value === 'string' && /^\d+$/.test(value));
        };
        
        if (isPositionId(tembusanArray[0])) {
          tembusanArray = await this.sdeService.convertPositionIdsToNames(tembusanArray, body.tanggal || body.tgl);
        }
      }

      // Parse lampiran_temp_ids if provided
      let lampiranTempIds: string[] = [];
      if (body.lampiran_temp_ids) {
        if (Array.isArray(body.lampiran_temp_ids)) {
          lampiranTempIds = body.lampiran_temp_ids;
        } else if (typeof body.lampiran_temp_ids === 'string') {
          try {
            lampiranTempIds = JSON.parse(body.lampiran_temp_ids);
          } catch {
            lampiranTempIds = [body.lampiran_temp_ids];
          }
        }
      }

      // Use user's position and name from JWT token (same as Nota Dinas)
      const namaJabatan = user?.positionText || '';
      const namaLengkap = user?.nama || '';

      // Get dynamic header info dari sub_area_alamat berdasarkan user context
      const headerInfo = await this.sdeService.getHeaderInfoByUser(
        {
          company: user?.company,
          area: user?.area,
          subArea: user?.subArea,
        },
        body.tgl || body.tanggal,
      );

      // Use kota from headerInfo if available, else fallback to body.nama_tempat or 'Tangerang'
      const dynamicNamaTempat = headerInfo?.kota || body.nama_tempat || 'Tangerang';

      const pdfBuffer = await this.sdeService.generatePdfFromHtml(
        body.htmlContent,
        penerimaArray,
        dynamicNamaTempat,
        body.tanggal || body.tgl || '',
        namaJabatan,
        namaLengkap,
        tembusanArray,
        lampiranTempIds,
        body.perihal || '',
        body.sifat || 'Biasa',
        body.nomor || '',
        body.lampiran || '-',
        headerInfo || undefined,
        body.english === true || body.english === 'true',
      );

      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="surat-dinas-eksternal-${Date.now()}.pdf"`,
        'Content-Length': pdfBuffer.length,
      });

      return res.status(HttpStatus.OK).send(pdfBuffer);
    } catch (error) {
      return res
        .status(HttpStatus.INTERNAL_SERVER_ERROR)
        .json({ error: 'Failed to generate PDF', detail: error instanceof Error ? error.message : String(error) });
    }
  }
}
