import { Controller, Get, Post, Put, Patch, Body, Param, ParseIntPipe, HttpException, HttpStatus, Query, UseGuards, UseInterceptors, UploadedFiles, Res } from '@nestjs/common';
import type { Response } from 'express';
import { FileFieldsInterceptor, FilesInterceptor, AnyFilesInterceptor } from '@nestjs/platform-express';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { NotaDinasService } from '../services/nota-dinas.service';
import { NotaDinasRecipientResponseDto, GetRecipientQueryDto } from '../dto/nota-dinas-recipient-response.dto';
import { CreateNotaDinasDto, FinalizeDraftDto, UpdateDraftDto } from '../dto/create-nota-dinas.dto';
import { GeneratePdfDto } from '../dto/generate-pdf.dto';
import { SendMessageResponseDto } from '../dto/send-message-response.dto';
import { GetSendMessageResponseDto } from '../dto/get-send-message.dto';
import { UploadTemporaryLampiranResponseDto } from '../dto/upload-temporary-lampiran.dto';
import { UserLevelGuard, JwtAuthGuard } from '../../../common/guards';
import { UserLevels, Public, CurrentUser } from '../../../common/decorators';
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
   * - pengirim: number (positionId)
   * - penerima: number[] (array of positionId, JSON string or comma-separated)
   * - tembusan: number[] (optional)
   * - klasifikasi, sifat, perihal, konten, dll
   * - lampiran_temp_ids: string[] (RECOMMENDED - array of lampiran IDs dari POST /upload-temporary)
   * - lampiran_files: file[] (DEPRECATED - multiple files, untuk backward compatibility)
   *
   * RECOMMENDED FLOW:
   * 1. Upload files via POST /upload-temporary
   * 2. Get file IDs from response
   * 3. Send lampiran_temp_ids to this endpoint
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
   * Send Nota Dinas (langsung final tanpa draft)
   * Status: 'final' (tanpa tanda_tangan) atau 'final_tte' (dengan tanda_tangan)
   *
   * Form-data fields:
   * - pengirim: number (positionId)
   * - penerima: number[] (array of positionId, JSON string or comma-separated)
   * - tembusan: number[] (optional)
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
   * - lampiran_temp_ids: string[] (RECOMMENDED - array of lampiran IDs dari POST /upload-temporary)
   * - lampiran_files: file[] (DEPRECATED - untuk backward compatibility)
   * - final_pdf: file (optional)
   * - tgl: string (optional, format YYYY-MM-DD)
   *
   * RECOMMENDED FLOW:
   * 1. Upload files via POST /upload-temporary
   * 2. Get file IDs from response
   * 3. Send lampiran_temp_ids to this endpoint
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
   * POST /ND/preview-pdf
   * Generate preview PDF Nota Dinas untuk di-lihat sebelum dikirim
   * PDF di-generate tanpa save ke database
   * User bisa kembali edit dan preview ulang
   * 
   * @param body - GeneratePdfDto dengan htmlContent, tertuju, perihal, tanggal, tembusan, lampiran_temp_ids
   * @param user - Current user dari JWT token
   * @param res - Express Response untuk send PDF
   * 
   * Body parameters:
   * - htmlContent: string (required)
   * - tertuju/penerima: string[] (optional)
   * - perihal: string (optional)
   * - tanggal: string (optional)
   * - tembusan: string[] (optional)
   * - lampiran_temp_ids: string[] (RECOMMENDED - array of lampiran IDs dari POST /upload-temporary)
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

      // Transform & Validate DTO manually
      const dto = plainToInstance(GeneratePdfDto, body);
      const errors = await validate(dto);
      if (errors.length > 0) {
        return res
          .status(HttpStatus.BAD_REQUEST)
          .json({ 
            error: 'Validation failed', 
            message: errors.map(e => Object.values(e.constraints || {})).flat() 
          });
      }

      // Validasi required field
      if (!dto || !dto.htmlContent) {
        return res
          .status(HttpStatus.BAD_REQUEST)
          .json({ error: 'Missing required field: htmlContent or konten' });
      }

      // Format tanggal jika diperlukan
      let formattedDate = dto.tanggal || '';
      if (formattedDate && /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(formattedDate)) {
        const [day, month, year] = formattedDate.split('/');
        const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
        formattedDate = date.toLocaleDateString('id-ID', { 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric' 
        });
      }

      // Format "Dari"
      const nama = user?.nama || 'User';
      const abbreviation = dto.abbreviation || user?.abbreviation || '';
      const positionText = dto.dari || user?.positionText || 'Direktur Teknik';
      
      let dariFormatted = '';
      if (abbreviation) {
        dariFormatted = `${nama} (${abbreviation}) ${positionText}`;
      } else {
        dariFormatted = `${nama} ${positionText}`;
      }

      const namaLengkap = user?.nama || 'User';

      // Support both 'penerima' and 'tertuju' field names from frontend
      const tertujuArray = dto.tertuju || dto.penerima || [];

      // Parse lampiran_temp_ids if provided
      let lampiranTempIds: string[] = [];
      if (body.lampiran_temp_ids) {
        console.log('[preview-pdf] lampiran_temp_ids type:', typeof body.lampiran_temp_ids);
        console.log('[preview-pdf] lampiran_temp_ids value:', body.lampiran_temp_ids);
        
        if (Array.isArray(body.lampiran_temp_ids)) {
          lampiranTempIds = body.lampiran_temp_ids;
        } else if (typeof body.lampiran_temp_ids === 'string') {
          try {
            lampiranTempIds = JSON.parse(body.lampiran_temp_ids);
          } catch (parseError) {
            console.warn('[preview-pdf] Failed to parse lampiran_temp_ids as JSON, treating as single ID');
            lampiranTempIds = [body.lampiran_temp_ids];
          }
        }
        
        console.log('[preview-pdf] Parsed lampiranTempIds:', lampiranTempIds);
      }

      // Generate preview PDF (tanpa save ke DB)
      const pdfBuffer = await this.notaDinasService.generatePdfFromHtml(
        dto.htmlContent,
        tertujuArray,
        dariFormatted,
        dto.perihal || '',
        formattedDate,
        positionText,
        namaLengkap,
        dto.tembusan || [],
        lampiranTempIds,
      );

      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="preview-nota-dinas.pdf"`,
        'Content-Length': pdfBuffer.length,
      });

      return res.status(HttpStatus.OK).send(pdfBuffer);
    } catch (error) {
      return res
        .status(HttpStatus.INTERNAL_SERVER_ERROR)
        .json({ error: 'Failed to generate preview', detail: error instanceof Error ? error.message : String(error) });
    }
  }

  /**
   * POST /ND/generate-pdf
   * Generate PDF Nota Dinas dinamis dengan data dari request body
   * Penandatangan otomatis diambil dari profile user yang login
   * Format "Dari": nama (abbreviation) position_text
   * Lampiran files akan di-merge ke dalam PDF dengan page terpisah
   * 
   * @param body - GeneratePdfDto dengan htmlContent, tertuju, perihal, tanggal, tembusan
   * @param user - Current user dari JWT token (untuk nama, abbreviation, positionText)
   * @param lampiranFiles - Optional files untuk di-merge ke PDF (file-field: lampiran_files)
   * @param res - Express Response untuk send PDF file
   */
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileFieldsInterceptor([
    { name: 'lampiran_files', maxCount: 10 },
  ]))
  @Post('generate-pdf')
  async generatePdf(
    @Body() body: any,
    @CurrentUser() user: any,
    @UploadedFiles() files: { lampiran_files?: Express.Multer.File[] },
    @Res() res: Response,
  ) {
    try {
      // Transform & Validate DTO manually
      const dto = plainToInstance(GeneratePdfDto, body);
      const errors = await validate(dto);
      if (errors.length > 0) {
        return res
          .status(HttpStatus.BAD_REQUEST)
          .json({ 
            error: 'Validation failed', 
            message: errors.map(e => Object.values(e.constraints || {})).flat() 
          });
      }

      // Validasi required field
      if (!dto || !dto.htmlContent) {
        return res
          .status(HttpStatus.BAD_REQUEST)
          .json({ error: 'Missing required field: htmlContent' });
      }

      // Debug: Log user info untuk troubleshoot
      console.log('DEBUG - User from @CurrentUser():', JSON.stringify(user, null, 2));
      console.log('DEBUG - Lampiran files:', files?.lampiran_files?.map(f => f.originalname));

      // Format tanggal jika diperlukan (DD/MM/YYYY -> full format)
      let formattedDate = dto.tanggal || '';
      if (formattedDate && /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(formattedDate)) {
        // Convert DD/MM/YYYY to readable format
        const [day, month, year] = formattedDate.split('/');
        const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
        formattedDate = date.toLocaleDateString('id-ID', { 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric' 
        });
      }

      // Format "Dari" sebagai: nama (abbreviation) position_text
      // Ambil dari user profile atau dari body jika di-override
      const nama = user?.nama || 'User';
      const abbreviation = dto.abbreviation || user?.abbreviation || '';
      const positionText = dto.dari || user?.positionText || 'Direktur Teknik';
      
      // Build format "Dari": nama (abbreviation) position_text
      let dariFormatted = '';
      if (abbreviation) {
        dariFormatted = `${nama} (${abbreviation}) ${positionText}`;
      } else {
        dariFormatted = `${nama} ${positionText}`;
      }

      const namaLengkap = user?.nama || 'User';

      // Support both 'penerima' and 'tertuju' field names from frontend
      const tertujuArray = dto.tertuju || dto.penerima || [];

      console.log('DEBUG - dariFormatted:', dariFormatted);
      console.log('DEBUG - positionText:', positionText);
      console.log('DEBUG - namaLengkap:', namaLengkap);
      console.log('DEBUG - tertujuArray:', tertujuArray);

      // Generate PDF dengan data dynamic (legacy endpoint - still uses direct file upload)
      const pdfBuffer = await this.notaDinasService.generatePdfFromHtml(
        dto.htmlContent,
        tertujuArray,
        dariFormatted,
        dto.perihal || '',
        formattedDate,
        positionText,
        namaLengkap,
        dto.tembusan || [],
        files?.lampiran_files, // Legacy: still accepts direct file upload
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
        .json({ error: 'Failed to generate PDF', detail: error instanceof Error ? error.message : String(error) });
    }
  }
}
