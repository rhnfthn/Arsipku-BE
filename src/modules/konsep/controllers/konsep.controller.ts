import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  Res,
  HttpException,
  HttpStatus,
  BadRequestException,
  ParseIntPipe,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
} from '@nestjs/common';
import type { Response } from 'express';
import { FileFieldsInterceptor, AnyFilesInterceptor } from '@nestjs/platform-express';
import { KonsepService } from '../services/konsep.service';
import { UserLevelGuard } from '../../../common/guards';
import { UserLevels, Public, CurrentUser } from '../../../common/decorators';
import { UserLevel } from '../../../common/enums';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import {
  CreateKonsepDto,
  ReviewKonsepDto,
  FinalizeKonsepDto,
  ForwardKonsepDto,
  RejectKonsepDto,
  CreateKonsepResponseDto,
  ReviewKonsepResponseDto,
  FinalizeKonsepResponseDto,
  ForwardKonsepResponseDto,
  RejectKonsepResponseDto,
  KonsepInboxResponseDto,
  KonsepSentResponseDto,
} from '../dto/konsep';

@Controller('KONSEP')
export class KonsepController {
  constructor(private readonly konsepService: KonsepService) {}

  // ============================================================
  // GET RECIPIENTS (ATASAN)
  // ============================================================

  /**
   * GET /KONSEP/get-recipient/:position_id
   * Dapatkan daftar atasan yang bisa dipilih sebagai penerima konsep
   * 
   * @param position_id Position ID pembuat konsep
   * @returns Sender info dan list of managerial positions (ATASAN)
   */
  @Get('get-recipient/:position_id')
  async getRecipient(
    @Param('position_id', ParseIntPipe) positionId: number,
  ): Promise<any> {
    try {
      return await this.konsepService.getRecipient(positionId);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        {
          success: false,
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Gagal mendapatkan daftar penerima',
          error: error instanceof Error ? error.message : String(error),
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // ============================================================
  // GET KONSEP DETAIL
  // ============================================================

  /**
   * GET /KONSEP/:id
   * Dapatkan detail lengkap konsep beserta naskah asli dan riwayat
   * 
   * @param id Konsep ID (naskah jenis='K')
   * @returns Detail konsep, naskah asli, riwayat, dan lampiran
   */
  @Get(':id')
  async getKonsepDetail(
    @Param('id') id: string,
  ): Promise<any> {
    try {
      return await this.konsepService.getKonsepDetail(id);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        {
          success: false,
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Gagal mendapatkan detail konsep',
          error: error instanceof Error ? error.message : String(error),
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // ============================================================
  // CREATE KONSEP
  // ============================================================

  /**
   * POST /KONSEP/create
   * Buat konsep naskah baru (ND/SDI/SDE)
   * 
   * Konsep dibuat oleh konseptor (bawahan) untuk dikirim ke pemeriksa/pengirim (atasan)
   * 
   * Form-data fields:
   * - jenis: string (ND|SDI|SDE)
   * - from_position_id: number
   * - to_position_id: number
   * - perihal, konten, klasifikasi, sifat, etc.
   * - lampiran_temp_ids: string[] (RECOMMENDED - IDs dari POST /upload-temporary-konsep)
   * - lampiran_files: file[] (DEPRECATED - untuk backward compatibility)
   * 
   * RECOMMENDED FLOW:
   * 1. Upload files via POST /upload-temporary-konsep
   * 2. Get file IDs from response
   * 3. Send lampiran_temp_ids to this endpoint
   * 
   * @returns CreateKonsepResponseDto
   */
  @Public() // Development: Bypass auth
  // @UseGuards(UserLevelGuard)
  // @UserLevels(UserLevel.NON_MANAGERIAL, UserLevel.MANAGERIAL, UserLevel.DIREKSI)
  @Post('create')
  @UseInterceptors(
    FileFieldsInterceptor(
      [{ name: 'lampiran_files', maxCount: 10 }],
      {
        limits: {
          fileSize: 50 * 1024 * 1024, // 50MB per file
        },
      },
    ),
  )
  async createKonsep(
    @Body() body: any,
    @UploadedFiles() files: { lampiran_files?: Express.Multer.File[] },
  ): Promise<CreateKonsepResponseDto> {
    try {
      const dto = await this.konsepService.parseFormDataToCreateDto(body, files);
      return await this.konsepService.createKonsep(dto);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        {
          success: false,
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Gagal membuat konsep',
          error: error instanceof Error ? error.message : String(error),
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // ============================================================
  // GET INBOX
  // ============================================================

  /**
   * GET /KONSEP/inbox/:position_id
   * Dapatkan inbox konsep untuk pemeriksa/pengirim
   * 
   * @param position_id Position ID pemeriksa/pengirim
   * @returns KonsepInboxResponseDto
   */
  @Get('inbox/:position_id')
  async getInbox(
    @Param('position_id', ParseIntPipe) positionId: number,
  ): Promise<KonsepInboxResponseDto> {
    try {
      return await this.konsepService.getInbox(positionId);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        {
          success: false,
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Gagal mendapatkan inbox konsep',
          error: error instanceof Error ? error.message : String(error),
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // ============================================================
  // GET SENT
  // ============================================================

  /**
   * GET /KONSEP/sent/:position_id
   * Dapatkan konsep yang dikirim oleh konseptor/pemeriksa
   * 
   * @param position_id Position ID konseptor/pemeriksa
   * @returns KonsepSentResponseDto
   */
  @Get('sent/:position_id')
  async getSent(
    @Param('position_id', ParseIntPipe) positionId: number,
  ): Promise<KonsepSentResponseDto> {
    try {
      return await this.konsepService.getSent(positionId);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        {
          success: false,
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Gagal mendapatkan konsep yang dikirim',
          error: error instanceof Error ? error.message : String(error),
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // ============================================================
  // FORWARD KONSEP
  // ============================================================

  /**
   * POST /KONSEP/forward/:id
   * Forward konsep ke atasan berikutnya
   * 
   * Penerima konsep bisa meneruskan ke atasannya lagi
   * 
   * Form-data fields:
   * - from_position_id: number
   * - to_position_id: number
   * - perihal, konten, klasifikasi, sifat, etc. (optional - untuk update)
   * - lampiran_temp_ids: string[] (RECOMMENDED - IDs dari POST /upload-temporary-konsep)
   * - lampiran_files: file[] (DEPRECATED)
   * 
   * @param id Konsep ID yang akan di-forward
   * @returns ForwardKonsepResponseDto
   */
  @Public() // Development: Bypass auth
  // @UseGuards(UserLevelGuard)
  // @UserLevels(UserLevel.NON_MANAGERIAL, UserLevel.MANAGERIAL, UserLevel.DIREKSI)
  @Post('forward/:id')
  @UseInterceptors(
    FileFieldsInterceptor(
      [{ name: 'lampiran_files', maxCount: 10 }],
      {
        limits: {
          fileSize: 50 * 1024 * 1024, // 50MB per file
        },
      },
    ),
  )
  async forwardKonsep(
    @Param('id') id: string,
    @Body() body: any,
    @UploadedFiles() files: { lampiran_files?: Express.Multer.File[] },
  ): Promise<ForwardKonsepResponseDto> {
    try {
      const dto = await this.konsepService.parseFormDataToForwardDto(body, files);
      return await this.konsepService.forwardKonsep(id, dto);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        {
          success: false,
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Gagal meneruskan konsep',
          error: error instanceof Error ? error.message : String(error),
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // ============================================================
  // REVIEW KONSEP
  // ============================================================

  /**
   * PUT /KONSEP/review/:id
   * Review konsep oleh pemeriksa
   * 
   * Actions:
   * - approve: Setujui konsep (lanjut ke pemeriksa berikutnya atau pengirim)
   * - revisi: Kembalikan ke konseptor untuk revisi
   * - reject: Tolak konsep
   * 
   * @param id Konsep ID
   * @param position_id Position ID reviewer (query param)
   * @param dto ReviewKonsepDto
   * @returns ReviewKonsepResponseDto
   */
  // @UseGuards(UserLevelGuard)
  // @UserLevels(UserLevel.NON_MANAGERIAL, UserLevel.MANAGERIAL, UserLevel.DIREKSI)
  @Put('review/:id')
  async reviewKonsep(
    @Param('id') id: string,
    @Query('position_id', ParseIntPipe) positionId: number,
    @Body() dto: ReviewKonsepDto,
  ): Promise<ReviewKonsepResponseDto> {
    try {
      return await this.konsepService.reviewKonsep(id, positionId, dto);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        {
          success: false,
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Gagal review konsep',
          error: error instanceof Error ? error.message : String(error),
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // ============================================================
  // FINALIZE KONSEP
  // ============================================================

  /**
   * POST /KONSEP/finalize/:id
   * Finalisasi konsep oleh pengirim/penandatangan
   * 
   * Setelah difinalisasi:
   * - Nomor surat resmi digenerate
   * - Status naskah diubah ke 'final' atau 'final_tte'
   * - Sirkulasi pengirim, penerima, dan tembusan dibuat
   * - Naskah siap dikirim ke penerima
   * 
   * **Form-Data Support**:
   * - Use `lampiran_temp_ids[]` (RECOMMENDED): IDs dari upload-temporary-konsep
   * - Use `lampiran_files` (DEPRECATED): Upload files langsung (max 10, 50MB each)
   * 
   * @param id Konsep ID
   * @param body Form-data body
   * @param files Uploaded files (lampiran_files)
   * @returns FinalizeKonsepResponseDto
   */
  // @UseGuards(UserLevelGuard)
  // @UserLevels(UserLevel.NON_MANAGERIAL, UserLevel.MANAGERIAL, UserLevel.DIREKSI)
  @Public()
  @Post('finalize/:id')
  @UseInterceptors(
    FileFieldsInterceptor(
      [{ name: 'lampiran_files', maxCount: 10 }],
      { limits: { fileSize: 50 * 1024 * 1024 } },
    ),
  )
  async finalizeKonsep(
    @Param('id') id: string,
    @Body() body: any,
    @UploadedFiles() files: { lampiran_files?: Express.Multer.File[] },
  ): Promise<FinalizeKonsepResponseDto> {
    try {
      const dto = await this.konsepService.parseFormDataToFinalizeDto(body, files);
      return await this.konsepService.finalizeKonsep(id, dto);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        {
          success: false,
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Gagal finalisasi konsep',
          error: error instanceof Error ? error.message : String(error),
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // ============================================================
  // REJECT KONSEP
  // ============================================================

  /**
   * POST /KONSEP/reject/:id
   * Reject konsep dan kembalikan ke posisi sebelumnya atau pembuat awal
   * 
   * Penerima konsep menolak dan mengembalikan ke pembuat
   * 
   * Form-data fields:
   * - from_position_id: number (wajib)
   * - catatan: string (wajib - alasan penolakan)
   * - return_to_position_id: number (opsional - default ke pembuat awal)
   * 
   * @param id Konsep ID yang akan direject
   * @param body Form-data body
   * @returns RejectKonsepResponseDto
   */
  @Public() // Development: Bypass auth
  // @UseGuards(UserLevelGuard)
  // @UserLevels(UserLevel.NON_MANAGERIAL, UserLevel.MANAGERIAL, UserLevel.DIREKSI)
  @Post('reject/:id')
  async rejectKonsep(
    @Param('id') id: string,
    @Body() body: any,
  ): Promise<RejectKonsepResponseDto> {
    try {
      const dto = await this.konsepService.parseFormDataToRejectDto(body);
      return await this.konsepService.rejectKonsep(id, dto);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        {
          success: false,
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Gagal menolak konsep',
          error: error instanceof Error ? error.message : String(error),
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // ============================================================
  // MARK AS READ
  // ============================================================

  /**
   * PUT /KONSEP/read/:id
   * Tandai konsep sebagai sudah dibaca
   * 
   * @param id Konsep ID
   * @param position_id Position ID pembaca (query param)
   * @returns { success: boolean, message: string }
   */
  @Put('read/:id')
  async markAsRead(
    @Param('id') id: string,
    @Query('position_id', ParseIntPipe) positionId: number,
  ): Promise<{ success: boolean; message: string }> {
    try {
      return await this.konsepService.markAsRead(id, positionId);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        {
          success: false,
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Gagal menandai konsep sebagai sudah dibaca',
          error: error instanceof Error ? error.message : String(error),
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // ============================================================
  // GENERATE PDF
  // ============================================================

  /**
   * POST /KONSEP/generate-pdf
   * Generate PDF konsep tanpa merge lampiran (plain PDF)
   * 
   * Form-data fields:
   * - jenis: string (ND|SDI|SDE) - wajib
   * - htmlContent / konten: string - wajib
   * - perihal: string
   * - tanggal / tgl: string
   * - nama_tempat: string
   * - nama_jabatan: string
   * - nama_lengkap: string
   * - penerima / tertuju: string[] (position_ids atau names)
   * - tembusan: string[] (position_ids atau names)
   * - sifat: string (untuk SDI/SDE)
   * - nomor: string (opsional)
   * 
   * @returns PDF file
   */
  @Public()
  @UseInterceptors(AnyFilesInterceptor())
  @Post('generate-pdf')
  async generatePdf(
    @Body() body: any,
    @Res() res: Response,
  ) {
    try {
      // Support both 'konten' and 'htmlContent' field names
      if (body.konten && !body.htmlContent) {
        body.htmlContent = body.konten;
      }

      if (!body || !body.htmlContent) {
        return res
          .status(HttpStatus.BAD_REQUEST)
          .json({ error: 'Missing required field: htmlContent atau konten' });
      }

      // Validate jenis
      const jenis = body.jenis?.toUpperCase() as 'ND' | 'SDI' | 'SDE';
      if (!jenis || !['ND', 'SDI', 'SDE'].includes(jenis)) {
        return res
          .status(HttpStatus.BAD_REQUEST)
          .json({ error: 'Missing or invalid field: jenis (harus ND, SDI, atau SDE)' });
      }

      // Parse and convert penerima/tertuju to names if needed
      let penerimaArray = this.parseArray(body.penerima || body.tertuju);
      if (penerimaArray.length > 0 && this.isPositionId(penerimaArray[0])) {
        penerimaArray = await this.konsepService.convertPositionIdsToNames(penerimaArray, body.tgl);
      }

      // Parse and convert tembusan to names if needed
      let tembusanArray = this.parseArray(body.tembusan);
      if (tembusanArray.length > 0 && this.isPositionId(tembusanArray[0])) {
        tembusanArray = await this.konsepService.convertPositionIdsToNames(tembusanArray, body.tgl);
      }

      // Build body with converted arrays
      const pdfBody = {
        ...body,
        penerima: penerimaArray,
        tertuju: penerimaArray,
        tembusan: tembusanArray,
      };

      const pdfBuffer = await this.konsepService.generatePlainPdf(jenis, pdfBody);

      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="konsep-${jenis.toLowerCase()}-${Date.now()}.pdf"`,
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

  // ============================================================
  // PREVIEW PDF
  // ============================================================

  /**
   * POST /KONSEP/preview-pdf
   * Generate preview PDF konsep dengan merge lampiran
   * 
   * Form-data fields:
   * - jenis: string (ND|SDI|SDE) - wajib
   * - htmlContent / konten: string - wajib
   * - perihal: string
   * - tanggal / tgl: string
   * - nama_tempat: string
   * - nama_jabatan: string
   * - nama_lengkap: string
   * - penerima / tertuju: string[] (position_ids atau names)
   * - tembusan: string[] (position_ids atau names)
   * - sifat: string (untuk SDI/SDE)
   * - lampiran_temp_ids: string[] (IDs dari upload-temporary)
   * - nomor: string (opsional)
   * 
   * @returns PDF file (inline untuk preview di browser)
   */
  @Public()
  @UseInterceptors(AnyFilesInterceptor())
  @Post('preview-pdf')
  async previewPdf(
    @Body() body: any,
    @Res() res: Response,
  ) {
    try {
      // Support both 'konten' and 'htmlContent' field names
      if (body.konten && !body.htmlContent) {
        body.htmlContent = body.konten;
      }

      if (!body || !body.htmlContent) {
        return res
          .status(HttpStatus.BAD_REQUEST)
          .json({ error: 'Missing required field: htmlContent atau konten' });
      }

      // Validate jenis
      const jenis = body.jenis?.toUpperCase() as 'ND' | 'SDI' | 'SDE';
      if (!jenis || !['ND', 'SDI', 'SDE'].includes(jenis)) {
        return res
          .status(HttpStatus.BAD_REQUEST)
          .json({ error: 'Missing or invalid field: jenis (harus ND, SDI, atau SDE)' });
      }

      // Parse and convert penerima/tertuju to names if needed
      let penerimaArray = this.parseArray(body.penerima || body.tertuju);
      if (penerimaArray.length > 0 && this.isPositionId(penerimaArray[0])) {
        penerimaArray = await this.konsepService.convertPositionIdsToNames(penerimaArray, body.tgl);
      }

      // Parse and convert tembusan to names if needed
      let tembusanArray = this.parseArray(body.tembusan);
      if (tembusanArray.length > 0 && this.isPositionId(tembusanArray[0])) {
        tembusanArray = await this.konsepService.convertPositionIdsToNames(tembusanArray, body.tgl);
      }

      // Parse lampiran_temp_ids
      let lampiranTempIds: string[] = [];
      if (body.lampiran_temp_ids) {
        lampiranTempIds = this.parseArray(body.lampiran_temp_ids);
      }

      // Build body with converted arrays
      const pdfBody = {
        ...body,
        penerima: penerimaArray,
        tertuju: penerimaArray,
        tembusan: tembusanArray,
      };

      const pdfBuffer = await this.konsepService.generatePreviewPdf(jenis, pdfBody, lampiranTempIds);

      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="preview-konsep-${jenis.toLowerCase()}.pdf"`,
        'Content-Length': pdfBuffer.length,
      });

      return res.status(HttpStatus.OK).send(pdfBuffer);
    } catch (error) {
      return res
        .status(HttpStatus.INTERNAL_SERVER_ERROR)
        .json({
          error: 'Failed to generate preview',
          detail: error instanceof Error ? error.message : String(error),
        });
    }
  }

  // ============================================================
  // HELPER METHODS
  // ============================================================

  private parseArray(value: any): string[] {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        return value.split(',').map((v: string) => v.trim());
      }
    }
    return [String(value)];
  }

  private isPositionId(value: any): boolean {
    return typeof value === 'number' ||
           (typeof value === 'string' && /^\d+$/.test(value));
  }

  // ============================================================
  // GET RIWAYAT KONSEP
  // ============================================================

  /**
   * GET /KONSEP/riwayat/:id
   * Dapatkan riwayat lengkap workflow konsep
   * 
   * @param id Konsep ID (naskah jenis='K')
   * @returns Riwayat setiap langkah (create, forward, finalize, dll)
   */
  @Get('riwayat/:id')
  async getRiwayat(
    @Param('id') id: string,
  ): Promise<any> {
    try {
      return await this.konsepService.getRiwayat(id);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        {
          success: false,
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Gagal mendapatkan riwayat konsep',
          error: error instanceof Error ? error.message : String(error),
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
