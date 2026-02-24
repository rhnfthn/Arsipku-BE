import { Controller, Get, Post, Put, Patch, Body, Param, ParseIntPipe, HttpException, HttpStatus, Query, UseGuards, UseInterceptors, UploadedFiles, Res } from '@nestjs/common';
import type { Response } from 'express';
import { FileFieldsInterceptor, FilesInterceptor, AnyFilesInterceptor } from '@nestjs/platform-express';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { NotaDinasService } from '../services/nota-dinas.service';
import { GrupPenerimaService } from '../../grup-penerima/services/grup_penerima.service';
import { NotaDinasRecipientResponseDto, GetRecipientQueryDto, OrgDataPositionDto } from '../dto/nota-dinas-recipient-response.dto';
import { CreateNotaDinasDto, FinalizeDraftDto, UpdateDraftDto } from '../dto/create-nota-dinas.dto';
import { GeneratePdfDto } from '../dto/generate-pdf.dto';
import { SendMessageResponseDto } from '../dto/send-message-response.dto';
import { GetSendMessageResponseDto } from '../dto/get-send-message.dto';
import { UploadTemporaryLampiranResponseDto } from '../dto/upload-temporary-lampiran.dto';
import { UserLevelGuard, JwtAuthGuard } from '../../../common/guards';
import { UserLevels, CurrentUser } from '../../../common/decorators';
import { UserLevel } from '../../../common/enums';

@Controller('ND')
export class NotaDinasController {
  constructor(
    private readonly notaDinasService: NotaDinasService,
    private readonly grupPenerimaService: GrupPenerimaService,
  ) {}

  /**
   * GET /ND/get-recipient
   * Get eligible recipients for Nota Dinas based on position ID
   *
   * @param user - User dari JWT token (contains position)
   * @param query - Query parameters:
   *   - tgl: optional date in format YYYY-MM-DD
   *   - pengirim: optional position_id pengirim (untuk kasus konsep/draft dimana pengirim dipilih dari dropdown)
   * @returns NotaDinasRecipientResponseDto
   *
   * Response format mengikuti struktur position_json dari org_data:
   * - sender: OrgDataPositionDto (data posisi pengirim)
   * - recipients: { ATASAN, REKAN, BAWAHAN } (grouped recipients)
   *
   * @example
   * GET /ND/get-recipient (gunakan position dari JWT)
   * GET /ND/get-recipient?pengirim=70016742 (gunakan pengirim yang dipilih)
   *
   * @throws 404 - Not Found (position or org data not found)
   * @throws 403 - Forbidden (non-managerial position)
   * @throws 500 - Internal Server Error
   */
  @UseGuards(JwtAuthGuard)
  @Get('get-recipient')
  async getNotaDinasRecipients(
    @CurrentUser() user: any,
    @Query() query: GetRecipientQueryDto,
  ): Promise<NotaDinasRecipientResponseDto> {
    try {
      // Jika pengirim ada di query, gunakan itu; jika tidak, gunakan position dari JWT
      const positionId = query.pengirim ? parseInt(query.pengirim, 10) : parseInt(user.position, 10);
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
   * GET /ND/get-senders
   * Get eligible senders for Konsep Nota Dinas
   *
   * @param user - User dari JWT token (contains position)
   * @param query - Query parameters:
   *   - tgl: optional date in format YYYY-MM-DD
   *   - pengirim: optional position_id untuk mendapatkan daftar sender yang valid
   * @returns OrgDataPositionDto[] - List of eligible senders
   *
   * @example
   * GET /ND/get-senders (gunakan position dari JWT)
   * GET /ND/get-senders?pengirim=70017418 (gunakan pengirim yang dipilih)
   */
  @UseGuards(JwtAuthGuard)
  @Get('get-senders')
  async getNotaDinasSenders(
    @CurrentUser() user: any,
    @Query() query: GetRecipientQueryDto,
  ): Promise<OrgDataPositionDto[]> {
    try {
      // Jika pengirim ada di query, gunakan itu; jika tidak, gunakan position dari JWT
      const positionId = query.pengirim ? parseInt(query.pengirim, 10) : parseInt(user.position, 10);
      return await this.notaDinasService.getSenderKonsep(positionId, query.tgl);
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
   * @throws 401 - Unauthorized (user not authenticated)
   * @throws 500 - Internal Server Error
   */
  @UseGuards(JwtAuthGuard)
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
    @CurrentUser() user: any, // Get logged-in user info
  ): Promise<SendMessageResponseDto> {
    try {
      // Parse form-data to DTO
      const dto = await this.notaDinasService.parseFormDataToDto(body, files);
      
      // Extract persnum from JWT user (required for digital signature)
      const persnum = user?.persnum;
      
      console.log('[ND Controller] sendMessage called with:', {
        sign_option: dto.sign_option,
        persnum: persnum,
        hasPassphrase: !!dto.passphrase,
      });

      if (!persnum) {
        throw new HttpException(
          {
            success: false,
            statusCode: HttpStatus.UNAUTHORIZED,
            message: 'User tidak terautentikasi atau persnum tidak ditemukan',
          },
          HttpStatus.UNAUTHORIZED,
        );
      }

      return await this.notaDinasService.sendMessage(dto, Number(persnum));
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
   * Digital Signature Options:
   * - sign_option: 'digsig' | 'qr_only' | 'none'
   * - passphrase: BSrE passphrase (required if sign_option = 'digsig')
   *
   * @param id - Naskah ID (UUID)
   * @param body - Form-data body
   * @param user - JWT user context (untuk persnum BSrE)
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
  @UseGuards(JwtAuthGuard)
  @Put('send-draft/:id')
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
  async sendDraft(
    @Param('id') id: string,
    @Body() body: any,
    @UploadedFiles() files: { lampiran_files?: Express.Multer.File[] },
    @CurrentUser() user?: any,
  ): Promise<SendMessageResponseDto> {
    try {
      // Extract persnum from JWT user for BSrE signing
      const persnum = user?.persnum;
      
      console.log('[ND Controller] sendDraft called with:', {
        id,
        sign_option: body.sign_option,
        persnum: persnum,
        hasPassphrase: !!body.passphrase,
      });

      // Parse form-data to DTO
      const dto = await this.notaDinasService.parseFormDataToFinalizeDraftDto(body, files);
      
      return await this.notaDinasService.finalizeDraft(id, dto, persnum);
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

      // Format tanggal dengan nama tempat (Tangerang, 19 Desember 2024)
      const namaTempat = dto.nama_tempat || 'Tangerang';
      const tanggalInput = dto.tgl || dto.tanggal || new Date().toISOString().split('T')[0];
      
      let formattedDate = '';
      try {
        // Check if already formatted (contains month name in Indonesian)
        if (/januari|februari|maret|april|mei|juni|juli|agustus|september|oktober|november|desember/i.test(tanggalInput)) {
          // Already formatted, just add nama_tempat if not exists
          if (tanggalInput.includes(',')) {
            formattedDate = tanggalInput;
          } else {
            formattedDate = `${namaTempat}, ${tanggalInput}`;
          }
        } else {
          // Parse as date (supports: YYYY-MM-DD, DD/MM/YYYY, ISO format, etc)
          // Add 'T00:00:00' to ensure correct parsing in local timezone
          const dateObj = new Date(tanggalInput + 'T00:00:00');
          
          if (!isNaN(dateObj.getTime())) {
            const formatted = dateObj.toLocaleDateString('id-ID', { 
              year: 'numeric', 
              month: 'long', 
              day: 'numeric',
              timeZone: 'Asia/Jakarta'
            });
            formattedDate = `${namaTempat}, ${formatted}`;
          } else {
            // Fallback if parsing fails
            formattedDate = `${namaTempat}, ${tanggalInput}`;
          }
        }
      } catch (error) {
        formattedDate = `${namaTempat}, ${tanggalInput}`;
      }

      // Format "Dari" - hanya position_text
      const positionText = dto.dari || user?.positionText || 'Direktur Teknik';
      const dariFormatted = positionText;
      
      // Get actual person name from org_data (persnum_person_text)
      // user.nama from JWT may be empty, so query org_data for accurate name
      // Prioritize body.pengirim (position_id from frontend) if provided, else use user.position from JWT
      const positionIdToUse = body.pengirim || user?.position;
      
      const personName = await this.notaDinasService.getPersonNameByPosition(
        positionIdToUse,
        dto.tgl,
      );
      
      const namaLengkap = body.nama_lengkap || dto.nama_lengkap || dto.penandatangan || personName || user?.nama || '';

      // Support both 'penerima' and 'tertuju' field names from frontend
      let tertujuArray = dto.tertuju || dto.penerima || [];
      
      // Check if tertuju/tembusan are position_ids and convert to names
      // FE sends form-data, so values are strings. Check if string is numeric (position_id)
      const isPositionId = (value: any): boolean => {
        // Check if it's a number OR a numeric string (from form-data)
        return typeof value === 'number' || 
               (typeof value === 'string' && /^\d+$/.test(value));
      };

      // Convert individual penerima position IDs to names
      if (tertujuArray.length > 0 && isPositionId(tertujuArray[0])) {
        const tertujuNames = await this.notaDinasService.convertPositionIdsToNames(tertujuArray);
        tertujuArray = tertujuNames;
      }

      // Add grup penerima display names (e.g., "Para Direktur") — grup appears BEFORE individuals
      if (dto.penerima_grup && dto.penerima_grup.length > 0) {
        const grupDisplayNames = await this.grupPenerimaService.getGrupDisplayNames(dto.penerima_grup);
        tertujuArray = [...grupDisplayNames, ...tertujuArray];
      }

      let tembusanArray = dto.tembusan || [];

      // Convert individual tembusan position IDs to names
      if (tembusanArray.length > 0 && isPositionId(tembusanArray[0])) {
        const tembusanNames = await this.notaDinasService.convertPositionIdsToNames(tembusanArray);
        tembusanArray = tembusanNames;
      }

      // Add grup tembusan display names — grup appears BEFORE individuals
      if (dto.tembusan_grup && dto.tembusan_grup.length > 0) {
        const grupDisplayNames = await this.grupPenerimaService.getGrupDisplayNames(dto.tembusan_grup);
        tembusanArray = [...grupDisplayNames, ...tembusanArray];
      }

      // Parse lampiran_temp_ids if provided
      let lampiranTempIds: string[] = [];
      if (body.lampiran_temp_ids) {
        if (Array.isArray(body.lampiran_temp_ids)) {
          lampiranTempIds = body.lampiran_temp_ids;
        } else if (typeof body.lampiran_temp_ids === 'string') {
          try {
            lampiranTempIds = JSON.parse(body.lampiran_temp_ids);
          } catch (parseError) {
            lampiranTempIds = [body.lampiran_temp_ids];
          }
        }
      }

      // Get dynamic header info dari sub_area_alamat berdasarkan user context
      const headerInfo = await this.notaDinasService.getHeaderInfoByUser(
        {
          company: user?.company,
          area: user?.area,
          subArea: user?.subArea,
        },
        dto.tgl,
      );

      // Override namaTempat with kota from headerInfo if available
      const dynamicNamaTempat = headerInfo?.kota || namaTempat;

      // Re-format tanggal dengan dynamic nama_tempat dari sub_area_alamat
      if (headerInfo?.kota) {
        try {
          if (/januari|februari|maret|april|mei|juni|juli|agustus|september|oktober|november|desember/i.test(tanggalInput)) {
            if (tanggalInput.includes(',')) {
              // Replace existing city name with dynamic one
              formattedDate = tanggalInput.replace(/^[^,]+,/, `${dynamicNamaTempat},`);
            } else {
              formattedDate = `${dynamicNamaTempat}, ${tanggalInput}`;
            }
          } else {
            const dateObj = new Date(tanggalInput + 'T00:00:00');
            if (!isNaN(dateObj.getTime())) {
              const formatted = dateObj.toLocaleDateString('id-ID', { 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric',
                timeZone: 'Asia/Jakarta'
              });
              formattedDate = `${dynamicNamaTempat}, ${formatted}`;
            }
          }
        } catch (error) {
          // Keep existing formattedDate
        }
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
        tembusanArray,
        lampiranTempIds,
        dto.tgl,
        dto.nama_tempat,
        headerInfo || undefined,
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

      // Format tanggal dengan nama tempat (Tangerang, 19 Desember 2024)
      const namaTempat = body.nama_tempat || dto.nama_tempat || 'Tangerang';
      const tanggalInput = body.tgl || dto.tanggal || new Date().toISOString().split('T')[0];
      
      let formattedDate = '';
      try {
        // Check if already formatted (contains month name)
        if (/januari|februari|maret|april|mei|juni|juli|agustus|september|oktober|november|desember/i.test(tanggalInput)) {
          formattedDate = tanggalInput.includes(',') ? tanggalInput : `${namaTempat}, ${tanggalInput}`;
        } else {
          // Parse date: supports YYYY-MM-DD, DD/MM/YYYY, etc
          let dateObj: Date;
          
          if (/^\d{4}-\d{2}-\d{2}$/.test(tanggalInput)) {
            // YYYY-MM-DD format
            dateObj = new Date(tanggalInput + 'T00:00:00');
          } else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(tanggalInput)) {
            // DD/MM/YYYY format
            const [day, month, year] = tanggalInput.split('/');
            dateObj = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
          } else {
            // Try default parsing
            dateObj = new Date(tanggalInput);
          }
          
          if (!isNaN(dateObj.getTime())) {
            const formatted = dateObj.toLocaleDateString('id-ID', { 
              year: 'numeric', 
              month: 'long', 
              day: 'numeric',
              timeZone: 'Asia/Jakarta'
            });
            formattedDate = `${namaTempat}, ${formatted}`;
          } else {
            formattedDate = `${namaTempat}, ${tanggalInput}`;
          }
        }
      } catch (error) {
        formattedDate = `${namaTempat}, ${tanggalInput}`;
      }

      // Format "Dari" - hanya position_text
      const positionText = dto.dari || user?.positionText || 'Direktur Teknik';
      const dariFormatted = positionText;
      
      // Get actual person name from org_data (persnum_person_text)
      // user.nama from JWT may be empty, so query org_data for accurate name
      // Prioritize body.pengirim (position_id from frontend) if provided, else use user.position from JWT
      const positionIdToUse = body.pengirim || user?.position;
      
      const personName = await this.notaDinasService.getPersonNameByPosition(
        positionIdToUse,
        body.tgl || dto.tgl,
      );
      
      const namaLengkap = body.nama_lengkap || dto.nama_lengkap || dto.penandatangan || personName || user?.nama || '';

      // Support both 'penerima' and 'tertuju' field names from frontend
      let tertujuArray = dto.tertuju || dto.penerima || [];

      // Check if tertuju/tembusan are position_ids and convert to names
      // FE sends form-data, so values are strings. Check if string is numeric (position_id)
      const isPositionId = (value: any): boolean => {
        return typeof value === 'number' || 
               (typeof value === 'string' && /^\d+$/.test(value));
      };

      // Convert individual penerima position IDs to names
      if (tertujuArray.length > 0 && isPositionId(tertujuArray[0])) {
        const tertujuNames = await this.notaDinasService.convertPositionIdsToNames(tertujuArray);
        tertujuArray = tertujuNames;
      }

      // Add grup penerima display names (e.g., "Para Direktur") — grup appears BEFORE individuals
      if (dto.penerima_grup && dto.penerima_grup.length > 0) {
        const grupDisplayNames = await this.grupPenerimaService.getGrupDisplayNames(dto.penerima_grup);
        tertujuArray = [...grupDisplayNames, ...tertujuArray];
      }

      let tembusanArray = dto.tembusan || [];

      // Convert individual tembusan position IDs to names
      if (tembusanArray.length > 0 && isPositionId(tembusanArray[0])) {
        const tembusanNames = await this.notaDinasService.convertPositionIdsToNames(tembusanArray);
        tembusanArray = tembusanNames;
      }

      // Add grup tembusan display names — grup appears BEFORE individuals
      if (dto.tembusan_grup && dto.tembusan_grup.length > 0) {
        const grupDisplayNames = await this.grupPenerimaService.getGrupDisplayNames(dto.tembusan_grup);
        tembusanArray = [...grupDisplayNames, ...tembusanArray];
      }

      // Get dynamic header info dari sub_area_alamat berdasarkan user context
      const headerInfo = await this.notaDinasService.getHeaderInfoByUser(
        {
          company: user?.company,
          area: user?.area,
          subArea: user?.subArea,
        },
        body.tgl || dto.tgl,
      );

      // Override namaTempat with kota from headerInfo if available
      const dynamicNamaTempat = headerInfo?.kota || namaTempat;

      // Re-format tanggal dengan dynamic nama_tempat dari sub_area_alamat
      if (headerInfo?.kota) {
        try {
          if (/januari|februari|maret|april|mei|juni|juli|agustus|september|oktober|november|desember/i.test(tanggalInput)) {
            if (tanggalInput.includes(',')) {
              // Replace existing city name with dynamic one
              formattedDate = tanggalInput.replace(/^[^,]+,/, `${dynamicNamaTempat},`);
            } else {
              formattedDate = `${dynamicNamaTempat}, ${tanggalInput}`;
            }
          } else {
            const dateObj = new Date(tanggalInput + 'T00:00:00');
            if (!isNaN(dateObj.getTime())) {
              const formatted = dateObj.toLocaleDateString('id-ID', { 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric',
                timeZone: 'Asia/Jakarta'
              });
              formattedDate = `${dynamicNamaTempat}, ${formatted}`;
            }
          }
        } catch (error) {
          // Keep existing formattedDate
        }
      }

      // generate-pdf: PDF polos TANPA lampiran merge
      const pdfBuffer = await this.notaDinasService.generatePlainPdf(
        dto.htmlContent,
        tertujuArray,
        dariFormatted,
        dto.perihal || '',
        formattedDate,
        positionText,
        namaLengkap,
        tembusanArray,
        body.tgl || dto.tgl,
        body.nama_tempat || dto.nama_tempat,
        headerInfo || undefined,
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
