import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Body,
  Param,
  ParseIntPipe,
  HttpException,
  HttpStatus,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  FileFieldsInterceptor,
  AnyFilesInterceptor,
} from '@nestjs/platform-express';
import { SuratDinasInternalService } from '../services/surat-dinas-internal.service';
import {
  CreateSuratDinasInternalDto,
  UpdateDraftDto,
  FinalizeDraftDto,
} from '../dto/create-surat-dinas-internal.dto';
import { SendMessageResponseDto } from '../dto/send-message-response.dto';
import { GetSendMessageResponseDto } from '../dto/get-send-message.dto';
import {
  GetSdiRecipientQueryDto,
  SdiOrgDataPositionDto,
  SdiRecipientResponseDto,
} from '../dto/surat-dinas-internal-recipient-response.dto';
import { UserLevelGuard, JwtAuthGuard } from '../../../common/guards';
import { UserLevels, Public, CurrentUser } from '../../../common/decorators';
import { UserLevel } from '../../../common/enums';

@Controller('SDI')
export class SuratDinasInternalController {
  constructor(
    private readonly suratDinasInternalService: SuratDinasInternalService,
  ) {}

  /**
   * GET /SDI/get-recipient
   * Get eligible recipients for Surat Dinas Internal using org_data (from JWT token)
   *
   * SDI Rules:
   * - Hanya REKAN (tidak ada ATASAN/BAWAHAN)
   * - SAMA organization_parent (satu induk organisasi)
   * - BEDA sub_area
   * - Managerial only (chief = 1)
   * - Uses cached org_data for better performance
   *
   * @param user - User dari JWT token (contains position)
   * @param query - Optional query params (tgl in format YYYY-MM-DD)
   * @returns SdiRecipientResponseDto
   *
   * @throws 400 - Bad Request (invalid positionId)
   * @throws 404 - Not Found (position not found)
   * @throws 403 - Forbidden (non-managerial role)
   * @throws 500 - Internal Server Error
   */
  @UseGuards(JwtAuthGuard)
  @Get('get-recipient')
  async getSdiRecipients(
    @CurrentUser() user: any,
    @Query() query: GetSdiRecipientQueryDto,
  ): Promise<SdiRecipientResponseDto> {
    try {
      const positionId = parseInt(user.position, 10);
      return await this.suratDinasInternalService.getSdiRecipients(
        positionId,
        query.tgl,
      );
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Failed to get SDI recipients',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * GET /SDI/:id
   * Get detail Surat Dinas Internal by ID
   * Menampilkan keseluruhan informasi surat termasuk PDF final
   *
   * @param id - Naskah ID (UUID)
   * @returns Detail SDI lengkap
   *
   * Response includes:
   * - Naskah info (id, nomor, tanggal, status, jenis)
   * - SDI specific (kepada Yth, perihal, konten, tembusan)
   * - Sirkulasi (pengirim, penerima, tembusan)
   * - Lampiran files
   * - Final PDF
   *
   * @throws 404 - Not Found (naskah tidak ditemukan)
   * @throws 500 - Internal Server Error
   */
  @Public() // Development: Bypass auth
  @Get(':id')
  async getSdiDetail(@Param('id') id: string): Promise<any> {
    try {
      return await this.suratDinasInternalService.getSdiDetail(id);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        {
          success: false,
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Failed to get SDI detail',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * POST /SDI/send-message
   * Create and send Surat Dinas Internal (using org_data like ND)
   *
   * Form-data fields:
   * - pengirim, penerima, tembusan, klasifikasi, sifat, perihal, konten, dll
   * - lampiran_files: file[] (multiple files, optional)
   * - final_pdf: file (optional)
   *
   * Rules:
   * - Pengirim must be managerial (chief=1)
   * - Penerima must be in DIFFERENT sub-area within same organization parent
   * - Penerima & tembusan must be managerial (chief=1)
   * - Tembusan follows the same rules as penerima
   *
   * @returns SendMessageResponseDto
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
    @UploadedFiles()
    files: {
      lampiran_files?: Express.Multer.File[];
      final_pdf?: Express.Multer.File[];
    },
    @CurrentUser() user: any, // Get logged-in user info
  ): Promise<SendMessageResponseDto> {
    try {
      const dto = await this.suratDinasInternalService.parseFormDataToDto(
        body,
        files,
      );

      // Extract persnum from JWT user (required for digital signature)
      const persnum = user?.persnum;
      
      console.log('[SDI Controller] sendMessage called with:', {
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

      return await this.suratDinasInternalService.sendMessage(dto, Number(persnum));
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
          message: 'Failed to send Surat Dinas Internal',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * GET /SDI/get-send-message/:positionId
   * Get all Surat Dinas Internal sent by user
   *
   * Returns list of sent SDI messages with:
   * - Nomor surat
   * - Tanggal
   * - Perihal
   * - Status (draf/final/final_tte)
   * - List penerima dengan status baca dan info area/sub-area
   *
   * @param positionId - Position ID
   * @returns GetSendMessageResponseDto
   */
  @Get('get-send-message/:positionId')
  async getSendMessage(
    @Param('positionId', ParseIntPipe) positionId: number,
  ): Promise<GetSendMessageResponseDto> {
    try {
      return await this.suratDinasInternalService.getSendMessage(positionId);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        {
          success: false,
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Failed to get sent SDI messages',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // ============================================================
  // DRAFT ENDPOINTS
  // ============================================================

  /**
   * POST /SDI/save-draft
   * Save Surat Dinas Internal as draft
   *
   * Form-data fields:
   * - pengirim, penerima, tembusan, klasifikasi, sifat, perihal, konten, dll (semua optional)
   * - lampiran_files: file[] (multiple files, optional)
   *
   * Status = 'draf', isDraft = true
   *
   * @returns SendMessageResponseDto with status='draf'
   */
  @Public() // Development: Bypass auth
  // @UseGuards(UserLevelGuard)
  // @UserLevels(UserLevel.DIREKSI)
  @Post('save-draft')
  @UseInterceptors(
    FileFieldsInterceptor([{ name: 'lampiran_files', maxCount: 10 }], {
      limits: {
        fileSize: 50 * 1024 * 1024, // 50MB per file
      },
    }),
  )
  async saveDraft(
    @Body() body: any,
    @UploadedFiles() files: { lampiran_files?: Express.Multer.File[] },
  ): Promise<SendMessageResponseDto> {
    try {
      const dto = await this.suratDinasInternalService.parseFormDataToDto(
        body,
        files,
      );
      return await this.suratDinasInternalService.saveDraft(dto);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        {
          success: false,
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Failed to save SDI draft',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * PATCH /SDI/update-draft/:id
   * Update existing draft Surat Dinas Internal (partial update)
   *
   * Form-data fields:
   * - Semua field optional (partial update)
   * - lampiran_files: file[] (multiple files, optional)
   * - lampiran_temp_ids: string[] (array of lampiran IDs dari POST /upload-temporary)
   *
   * Status remains 'draf'
   *
   * @param id - Naskah ID (UUID)
   * @returns SendMessageResponseDto with updated data
   */
  @Public() // Development: Bypass auth
  // @UseGuards(UserLevelGuard)
  // @UserLevels(UserLevel.DIREKSI)
  @Patch('update-draft/:id')
  @UseInterceptors(
    FileFieldsInterceptor([{ name: 'lampiran_files', maxCount: 10 }], {
      limits: {
        fileSize: 50 * 1024 * 1024, // 50MB per file
      },
    }),
  )
  async updateDraft(
    @Param('id') id: string,
    @Body() body: any,
    @UploadedFiles() files: { lampiran_files?: Express.Multer.File[] },
  ): Promise<SendMessageResponseDto> {
    try {
      const dto =
        await this.suratDinasInternalService.parseFormDataToUpdateDraftDto(
          body,
          files,
        );
      return await this.suratDinasInternalService.updateDraft(id, dto);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        {
          success: false,
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Failed to update SDI draft',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * POST /SDI/forward
   * Forward Surat Dinas Internal yang sudah diterima ke user lain
   * 
   * Fitur khusus: Bisa mengubah jenis naskah saat forward
   * - SDI → ND / SDE
   * - ND → SDI / SDE
   * - SDE → SDI / ND
   * 
   * Kondisi:
   * - User harus merupakan penerima dari naskah yang akan di-forward
   * - User harus managerial
   * - Penerima baru harus managerial yang valid
   * - Otomatis membuat referensi ke naskah yang diterima
   * 
   * Form-data fields:
   * - id_naskah_referensi: string (UUID naskah referensi/yang diterima)
   * - pengirim: number (position_id user yang forward)
   * - penerima: number[] (array of position_id penerima baru)
   * - tembusan: number[] (optional)
   * - jenis: string (ND|SDI|SDE - jenis naskah)
   * - sifat: string (sangat_rahasia|rahasia|terbatas|biasa|terbuka)
   * - klasifikasi: string (optional untuk ND/SDI)
   * - perihal: string (optional, default dari naskah sebelumnya)
   * - konten: string (optional, default dari naskah sebelumnya)
   * - copy_lampiran_from_previous: boolean (default: true)
   * - lampiran_temp_ids: string[] (optional, lampiran tambahan)
   * - tujuan: string (optional, untuk SDE - nama organisasi eksternal)
   * - alamat_tujuan: string (optional, untuk SDE)
   * 
   * @param body - Form-data body
   * @returns ForwardSuratDinasInternalResponseDto
   * 
   * @throws 400 - Bad Request (validation error / naskah bukan ND/SDI/SDE)
   * @throws 403 - Forbidden (bukan penerima / bukan managerial)
   * @throws 404 - Not Found (naskah/position not found)
   * @throws 500 - Internal Server Error
   */
  @UseInterceptors(AnyFilesInterceptor())
  @Post('forward')
  async forwardSuratDinasInternal(@Body() body: any): Promise<any> {
    try {
      console.log('[SDI forward] Raw body:', JSON.stringify(body, null, 2));

      // Parse pengirim
      if (typeof body.pengirim === 'string') {
        body.pengirim = parseInt(body.pengirim, 10);
      }

      // Parse penerima
      if (typeof body.penerima === 'string') {
        try {
          body.penerima = JSON.parse(body.penerima);
        } catch {
          body.penerima = [parseInt(body.penerima, 10)];
        }
      }

      if (Array.isArray(body.penerima)) {
        body.penerima = body.penerima.map((id: any) =>
          typeof id === 'string' ? parseInt(id, 10) : id,
        );
      }

      // Parse tembusan
      if (body.tembusan) {
        if (typeof body.tembusan === 'string') {
          try {
            body.tembusan = JSON.parse(body.tembusan);
          } catch {
            body.tembusan = [parseInt(body.tembusan, 10)];
          }
        }

        if (Array.isArray(body.tembusan)) {
          body.tembusan = body.tembusan.map((id: any) =>
            typeof id === 'string' ? parseInt(id, 10) : id,
          );
        }
      }

      // Parse lampiran_temp_ids
      if (body.lampiran_temp_ids && typeof body.lampiran_temp_ids === 'string') {
        try {
          body.lampiran_temp_ids = JSON.parse(body.lampiran_temp_ids);
        } catch {
          body.lampiran_temp_ids = [body.lampiran_temp_ids];
        }
      }

      // Parse copy_lampiran_from_previous
      if (body.copy_lampiran_from_previous === undefined || body.copy_lampiran_from_previous === null) {
        body.copy_lampiran_from_previous = !body.lampiran_temp_ids || body.lampiran_temp_ids.length === 0;
      } else if (typeof body.copy_lampiran_from_previous === 'string') {
        body.copy_lampiran_from_previous = body.copy_lampiran_from_previous === 'true' || body.copy_lampiran_from_previous === '1';
      }

      console.log('[SDI forward] Parsed body:', JSON.stringify(body, null, 2));

      return await this.suratDinasInternalService.forwardSuratDinasInternal(body);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        {
          success: false,
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Failed to forward surat dinas internal',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * GET /SDI/draft-list/:positionId
   * Get all draft SDI by position (where position is pengirim)
   *
   * Returns list of drafts with full data for editing
   *
   * @param positionId - Position ID of the sender
   * @param tgl - Optional date for org_data validation (query param)
   * @returns GetSendMessageResponseDto with draft list
   */
  @Get('draft-list/:positionId')
  async getDraftList(
    @Param('positionId', ParseIntPipe) positionId: number,
    @Query('tgl') tgl?: string,
  ): Promise<GetSendMessageResponseDto> {
    try {
      return await this.suratDinasInternalService.getDraftList(positionId, tgl);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        {
          success: false,
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Failed to get SDI draft list',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * PUT /SDI/send-draft/:id
   * Finalize and send a draft Surat Dinas Internal
   *
   * Form-data fields:
   * - Semua field optional (dapat update sebelum finalize)
   * - final_pdf: file (optional)
   * - sign_option: 'digsig' | 'qr_only' | 'none' (optional)
   * - passphrase: string (required jika sign_option=digsig)
   *
   * Generate official nomor surat, update status to 'final' atau 'final_tte'
   * Set isDraft = false in sirkulasi
   *
   * @param id - Naskah ID (UUID)
   * @returns SendMessageResponseDto with finalized data
   */
  @UseGuards(JwtAuthGuard)
  @Put('send-draft/:id')
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
  async sendDraft(
    @Param('id') id: string,
    @Body() body: any,
    @UploadedFiles()
    files: {
      lampiran_files?: Express.Multer.File[];
      final_pdf?: Express.Multer.File[];
    },
    @CurrentUser() user: any,
  ): Promise<SendMessageResponseDto> {
    try {
      const dto =
        await this.suratDinasInternalService.parseFormDataToFinalizeDraftDto(
          body,
          files,
        );

      // Get persnum from JWT for digital signature
      const persnum = user?.persnum;
      
      console.log('[SDI Controller] sendDraft called with:', {
        id,
        sign_option: dto.sign_option,
        persnum: persnum,
        hasPassphrase: !!dto.passphrase,
      });

      return await this.suratDinasInternalService.finalizeDraft(id, dto, persnum ? Number(persnum) : undefined);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        {
          success: false,
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Failed to send SDI draft',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * POST /SDI/preview-pdf
   * Generate preview PDF Surat Dinas Internal untuk di-lihat sebelum dikirim
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
        return res
          .status(HttpStatus.BAD_REQUEST)
          .json({ error: 'Missing required field: htmlContent or konten' });
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

      // Check if penerima are position_ids and convert to names
      const isPositionId = (value: any): boolean => {
        return (
          typeof value === 'number' ||
          (typeof value === 'string' && /^\d+$/.test(value))
        );
      };

      if (penerimaArray.length > 0 && isPositionId(penerimaArray[0])) {
        penerimaArray =
          await this.suratDinasInternalService.convertPositionIdsToNames(
            penerimaArray,
            body.tanggal || body.tgl,
          );
      }

      // Parse tembusan if it's a string (from form-data)
      let tembusanArray = body.tembusan || [];
      if (typeof tembusanArray === 'string') {
        try {
          tembusanArray = JSON.parse(tembusanArray);
        } catch {
          tembusanArray = [tembusanArray];
        }
      }

      if (tembusanArray.length > 0 && isPositionId(tembusanArray[0])) {
        tembusanArray =
          await this.suratDinasInternalService.convertPositionIdsToNames(
            tembusanArray,
            body.tanggal || body.tgl,
          );
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

      // Use user's position and name from JWT token
      // Get actual person name from org_data (persnum_person_text)
      // user.nama from JWT may be empty, so query org_data for accurate name
      const namaJabatan = user?.positionText || '';
      const personName = await this.suratDinasInternalService.getPersonNameByPosition(
        user?.position,
        body.tgl,
      );
      const namaLengkap = body.nama_lengkap || personName || user?.nama || '';

      // Get dynamic header info dari sub_area_alamat berdasarkan user context
      const headerInfo = await this.suratDinasInternalService.getHeaderInfoByUser(
        {
          company: user?.company,
          area: user?.area,
          subArea: user?.subArea,
        },
        body.tgl || body.tanggal,
      );

      // Use kota from headerInfo if available, else fallback to body.nama_tempat or 'Tangerang'
      const dynamicNamaTempat = headerInfo?.kota || body.nama_tempat || 'Tangerang';

      const pdfBuffer =
        await this.suratDinasInternalService.generatePdfFromHtml(
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
        );

      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="preview-surat-dinas-internal.pdf"`,
        'Content-Length': pdfBuffer.length,
      });

      return res.status(HttpStatus.OK).send(pdfBuffer);
    } catch (error) {
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        error: 'Failed to generate preview',
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * POST /SDI/generate-pdf
   * Generate PDF dari HTML content untuk preview/download Surat Dinas Internal
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
        return res
          .status(HttpStatus.BAD_REQUEST)
          .json({ error: 'Missing required field: htmlContent' });
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

      // Check if penerima are position_ids and convert to names
      const isPositionId = (value: any): boolean => {
        return (
          typeof value === 'number' ||
          (typeof value === 'string' && /^\d+$/.test(value))
        );
      };

      if (penerimaArray.length > 0 && isPositionId(penerimaArray[0])) {
        penerimaArray =
          await this.suratDinasInternalService.convertPositionIdsToNames(
            penerimaArray,
            body.tanggal || body.tgl,
          );
      }

      // Parse tembusan if it's a string (from form-data)
      let tembusanArray = body.tembusan || [];
      if (typeof tembusanArray === 'string') {
        try {
          tembusanArray = JSON.parse(tembusanArray);
        } catch {
          tembusanArray = [tembusanArray];
        }
      }

      if (tembusanArray.length > 0 && isPositionId(tembusanArray[0])) {
        tembusanArray =
          await this.suratDinasInternalService.convertPositionIdsToNames(
            tembusanArray,
            body.tanggal || body.tgl,
          );
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

      // Use user's position and name from JWT token
      // Get actual person name from org_data (persnum_person_text)
      // user.nama from JWT may be empty, so query org_data for accurate name
      const namaJabatan = user?.positionText || '';
      const personName = await this.suratDinasInternalService.getPersonNameByPosition(
        user?.position,
        body.tgl,
      );
      const namaLengkap = body.nama_lengkap || personName || user?.nama || '';

      // Get dynamic header info dari sub_area_alamat berdasarkan user context
      const headerInfo = await this.suratDinasInternalService.getHeaderInfoByUser(
        {
          company: user?.company,
          area: user?.area,
          subArea: user?.subArea,
        },
        body.tgl || body.tanggal,
      );

      // Use kota from headerInfo if available, else fallback to body.nama_tempat or 'Tangerang'
      const dynamicNamaTempat = headerInfo?.kota || body.nama_tempat || 'Tangerang';

      // generate-pdf: PDF polos TANPA lampiran merge
      const pdfBuffer =
        await this.suratDinasInternalService.generatePlainPdf(
          body.htmlContent,
          penerimaArray,
          dynamicNamaTempat,
          body.tanggal || body.tgl || '',
          namaJabatan,
          namaLengkap,
          tembusanArray,
          body.perihal || '',
          body.sifat || 'Biasa',
          body.nomor || '',
          body.lampiran || '-',
          headerInfo || undefined,
        );

      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="surat-dinas-internal-${Date.now()}.pdf"`,
        'Content-Length': pdfBuffer.length,
      });

      return res.status(HttpStatus.OK).send(pdfBuffer);
    } catch (error) {
      return res
        .status(HttpStatus.INTERNAL_SERVER_ERROR)
        .json({
          error: 'Failed to generate PDF',
          detail: error instanceof Error ? error.message : String(error),
        });
    }
  }

  @Get('get-senders/:positionId')
  async getNotaDinasSenders(
    @Param('positionId', ParseIntPipe) positionId: number,
    @Query() query: GetSdiRecipientQueryDto,
  ): Promise<SdiOrgDataPositionDto[]> {
    try {
      return await this.suratDinasInternalService.getSenderKonsep(
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
          message: 'Failed to get Nota Dinas recipients',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
