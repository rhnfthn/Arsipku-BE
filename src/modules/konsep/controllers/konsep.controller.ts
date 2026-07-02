import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
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
import { UserLevels, Public, CurrentUser, RequirePermission } from '../../../common/decorators';
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
  CreateDraftKonsepResponseDto,
  UpdateDraftKonsepResponseDto,
  GetDraftKonsepListResponseDto,
  GetDraftKonsepDetailResponseDto,
  DeleteDraftKonsepResponseDto,
  BulkDeleteDraftKonsepResponseDto,
} from '../dto/konsep';
import { GrupPenerimaService } from '../../grup-penerima/services/grup_penerima.service';

@Controller('KONSEP')
export class KonsepController {
  constructor(
    private readonly konsepService: KonsepService,
    private readonly grupPenerimaService: GrupPenerimaService,
  ) {}

  // ============================================================
  // GET RECIPIENTS (ATASAN)
  // ============================================================

  /**
   * GET /KONSEP/get-recipient
   * Dapatkan daftar atasan yang bisa dipilih sebagai penerima konsep
   * 
   * @param user - User dari JWT token (contains position)
   * @param pengirim - Optional position_id pengirim (untuk kasus konsep dimana pengirim dipilih dari dropdown)
   * @returns Sender info dan list of managerial positions (ATASAN)
   *
   * @example
   * GET /KONSEP/get-recipient (gunakan position dari JWT)
   * GET /KONSEP/get-recipient?pengirim=70016742 (gunakan pengirim yang dipilih)
   */
  @UseGuards(JwtAuthGuard)
  @Get('get-recipient')
  @RequirePermission('naskah-dinas', 'read')
  async getRecipient(
    @CurrentUser() user: any,
    @Query('pengirim') pengirim?: string,
  ): Promise<any> {
    try {
      // Jika pengirim ada di query, gunakan itu; jika tidak, gunakan position dari JWT
      const positionId = pengirim ? parseInt(pengirim, 10) : parseInt(user.position, 10);
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
  @RequirePermission('naskah-dinas', 'read-detail')
  async getKonsepDetail(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ): Promise<any> {
    try {
      return await this.konsepService.getKonsepDetail(id, String(user.position));
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

  /**
   * GET /KONSEP/:id/info
   * Dapatkan detail konsep dan naskah TANPA flow disposisi/riwayat
   * Endpoint simplified untuk view basic info saja
   * 
   * @param id Konsep ID (naskah jenis='K')
   * @returns Detail konsep dan naskah asli (tanpa flow)
   */
  @Get(':id/info')
  @RequirePermission('naskah-dinas', 'read-detail')
  async getKonsepInfo(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ): Promise<any> {
    try {
      return await this.konsepService.getKonsepInfo(id, String(user.position));
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        {
          success: false,
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Gagal mendapatkan info konsep',
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
   * **TINDAK LANJUT DISPOSISI**:
   * Konsep bisa dibuat sebagai tindak lanjut dari disposisi yang diterima
   * Kirim field `id_disposisi_referensi` untuk menghubungkan konsep dengan disposisi asal
   * 
   * **DISPOSISI CHAIN TRACKING**:
   * Sistem akan otomatis trace disposisi ke asal/root:
   * - Jika A kirim DI-001 → B forward DI-002 → C terima DI-002
   * - C buat konsep dengan id_disposisi_referensi = DI-002 (yang diterima)
   * - Sistem akan simpan referensi ke DI-002 (langsung) DAN DI-001 (asal)
   * - Pada GET detail, akan tampil disposisi_referensi dengan type='chain'
   * 
   * Form-data fields:
   * - jenis: string (ND|SDI|SDE)
   * - from_position_id: number
   * - to_position_id: number
   * - id_disposisi_referensi: string (OPTIONAL - ID naskah disposisi yang diterima/langsung)
   * - perihal, konten, klasifikasi, sifat, etc.
   * - lampiran_temp_ids: string[] (RECOMMENDED - IDs dari POST /upload-temporary-konsep)
   * - lampiran_files: file[] (DEPRECATED - untuk backward compatibility)
   * 
   * RECOMMENDED FLOW:
   * 1. Terima disposisi (DI) dengan instruksi
   * 2. Upload files via POST /upload-temporary-konsep
   * 3. Get file IDs from response
   * 4. Send lampiran_temp_ids + id_disposisi_referensi (ID disposisi yang diterima) to this endpoint
   * 5. Sistem akan otomatis trace ke disposisi asal dan simpan kedua referensi
   * 
   * @returns CreateKonsepResponseDto
   */
  // @UseGuards(UserLevelGuard)
  // @UserLevels(UserLevel.NON_MANAGERIAL, UserLevel.MANAGERIAL, UserLevel.DIREKSI)
  @Post('create')
  @RequirePermission('naskah-dinas', 'create')
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
    @CurrentUser() user: any,
    @UploadedFiles() files: { lampiran_files?: Express.Multer.File[] },
  ): Promise<CreateKonsepResponseDto> {
    try {
      const dto = await this.konsepService.parseFormDataToCreateDto(body, files);
      dto.from_position_id = Number(user.position);
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
   * GET /KONSEP/inbox
   * Dapatkan inbox konsep untuk pemeriksa/pengirim (from JWT token)
   * 
   * @param user - User dari JWT token (contains position)
   * @returns KonsepInboxResponseDto
   */
  @UseGuards(JwtAuthGuard)
  @Get('inbox')
  @RequirePermission('naskah-dinas', 'read')
  async getInbox(
    @CurrentUser() user: any,
  ): Promise<KonsepInboxResponseDto> {
    try {
      const positionId = parseInt(user.position, 10);
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
   * GET /KONSEP/sent
   * Dapatkan konsep yang dikirim oleh konseptor/pemeriksa (from JWT token)
   * 
   * @param user - User dari JWT token (contains position)
   * @returns KonsepSentResponseDto
   */
  @UseGuards(JwtAuthGuard)
  @Get('sent')
  @RequirePermission('naskah-dinas', 'read')
  async getSent(
    @CurrentUser() user: any,
  ): Promise<KonsepSentResponseDto> {
    try {
      const positionId = parseInt(user.position, 10);
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
  // @UseGuards(UserLevelGuard)
  // @UserLevels(UserLevel.NON_MANAGERIAL, UserLevel.MANAGERIAL, UserLevel.DIREKSI)
  @Post('forward/:id')
  @RequirePermission('naskah-dinas', 'approve')
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
    @CurrentUser() user: any,
    @UploadedFiles() files: { lampiran_files?: Express.Multer.File[] },
  ): Promise<ForwardKonsepResponseDto> {
    try {
      const dto = await this.konsepService.parseFormDataToForwardDto(body, files);
      dto.from_position_id = Number(user.position);
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
  @RequirePermission('naskah-dinas', 'update')
  async reviewKonsep(
    @Param('id') id: string,
    @Query('position_id', ParseIntPipe) positionId: number,
    @CurrentUser() user: any,
    @Body() dto: ReviewKonsepDto,
  ): Promise<ReviewKonsepResponseDto> {
    try {
      const currentPositionId = Number(user.position);
      if (positionId !== currentPositionId) {
        throw new BadRequestException('position_id harus sesuai dengan user yang login');
      }
      return await this.konsepService.reviewKonsep(id, currentPositionId, dto);
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
  @Post('finalize/:id')
  @RequirePermission('naskah-dinas', 'approve')
  @UseInterceptors(
    FileFieldsInterceptor(
      [{ name: 'lampiran_files', maxCount: 10 }],
      { limits: { fileSize: 50 * 1024 * 1024 } },
    ),
  )
  async finalizeKonsep(
    @Param('id') id: string,
    @Body() body: any,
    @CurrentUser() user: any,
    @UploadedFiles() files: { lampiran_files?: Express.Multer.File[] },
  ): Promise<FinalizeKonsepResponseDto> {
    try {
      const dto = await this.konsepService.parseFormDataToFinalizeDto(body, files);
      dto.from_position_id = Number(user.position);
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
  // @UseGuards(UserLevelGuard)
  // @UserLevels(UserLevel.NON_MANAGERIAL, UserLevel.MANAGERIAL, UserLevel.DIREKSI)
  @Post('reject/:id')
  @RequirePermission('naskah-dinas', 'approve')
  async rejectKonsep(
    @Param('id') id: string,
    @Body() body: any,
    @CurrentUser() user: any,
  ): Promise<RejectKonsepResponseDto> {
    try {
      const dto = await this.konsepService.parseFormDataToRejectDto(body);
      dto.from_position_id = Number(user.position);
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
  @RequirePermission('naskah-dinas', 'read')
  async markAsRead(
    @Param('id') id: string,
    @Query('position_id', ParseIntPipe) positionId: number,
    @CurrentUser() user: any,
  ): Promise<{ success: boolean; message: string }> {
    try {
      const currentPositionId = Number(user.position);
      if (positionId !== currentPositionId) {
        throw new BadRequestException('position_id harus sesuai dengan user yang login');
      }
      return await this.konsepService.markAsRead(id, currentPositionId);
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
      // Also check penerima_position_ids (from konsep form)
      let penerimaArray = this.parseArray(body.penerima || body.tertuju || body.penerima_position_ids);
      if (penerimaArray.length > 0 && this.isPositionId(penerimaArray[0])) {
        penerimaArray = await this.konsepService.convertPositionIdsToNames(penerimaArray, body.tgl);
      }

      // Prepend grup penerima display names (e.g., "Para Direktur") before individual names
      if (body.penerima_grup) {
        const grupIds = this.parseArray(body.penerima_grup);
        if (grupIds.length > 0) {
          const grupDisplayNames = await this.grupPenerimaService.getGrupDisplayNames(grupIds);
          penerimaArray = [...grupDisplayNames, ...penerimaArray];
        }
      }

      // Parse and convert tembusan to names if needed
      // Also check tembusan_position_ids (from konsep form)
      let tembusanArray = this.parseArray(body.tembusan || body.tembusan_position_ids);
      if (tembusanArray.length > 0 && this.isPositionId(tembusanArray[0])) {
        tembusanArray = await this.konsepService.convertPositionIdsToNames(tembusanArray, body.tgl);
      }

      // Prepend grup tembusan display names before individual names
      if (body.tembusan_grup) {
        const grupIds = this.parseArray(body.tembusan_grup);
        if (grupIds.length > 0) {
          const grupDisplayNames = await this.grupPenerimaService.getGrupDisplayNames(grupIds);
          tembusanArray = [...grupDisplayNames, ...tembusanArray];
        }
      }

      // Parse and convert pengirim (dari) to name if needed
      // Pengirim adalah pengirim_position_id atau to_position_id (atasan penandatangan)
      let dariText = body.dari || body.nama_jabatan || '';
      const pengirimPosId = body.pengirim_position_id || body.to_position_id;
      if (!dariText && pengirimPosId && this.isPositionId(pengirimPosId)) {
        const pengirimNames = await this.konsepService.convertPositionIdsToNames([pengirimPosId], body.tgl);
        if (pengirimNames.length > 0) {
          dariText = pengirimNames[0];
        }
      }

      // Build body with converted arrays
      // Set kepada_yth dari penerimaArray jika belum ada
      const kepadaYth = body.kepada_yth || body.kepadaYth || penerimaArray.join('; ') || '';

      const pdfBody = {
        ...body,
        penerima: penerimaArray,
        tertuju: penerimaArray,
        tembusan: tembusanArray,
        kepada_yth: kepadaYth,
        kepadaYth: kepadaYth,
        dari: dariText,
        nama_jabatan: dariText || body.nama_jabatan,
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
      // Also check penerima_position_ids (from konsep form)
      let penerimaArray = this.parseArray(body.penerima || body.tertuju || body.penerima_position_ids);
      if (penerimaArray.length > 0 && this.isPositionId(penerimaArray[0])) {
        penerimaArray = await this.konsepService.convertPositionIdsToNames(penerimaArray, body.tgl);
      }

      // Prepend grup penerima display names (e.g., "Para Direktur") before individual names
      if (body.penerima_grup) {
        const grupIds = this.parseArray(body.penerima_grup);
        if (grupIds.length > 0) {
          const grupDisplayNames = await this.grupPenerimaService.getGrupDisplayNames(grupIds);
          penerimaArray = [...grupDisplayNames, ...penerimaArray];
        }
      }

      // Parse and convert tembusan to names if needed
      // Also check tembusan_position_ids (from konsep form)
      let tembusanArray = this.parseArray(body.tembusan || body.tembusan_position_ids);
      if (tembusanArray.length > 0 && this.isPositionId(tembusanArray[0])) {
        tembusanArray = await this.konsepService.convertPositionIdsToNames(tembusanArray, body.tgl);
      }

      // Prepend grup tembusan display names before individual names
      if (body.tembusan_grup) {
        const grupIds = this.parseArray(body.tembusan_grup);
        if (grupIds.length > 0) {
          const grupDisplayNames = await this.grupPenerimaService.getGrupDisplayNames(grupIds);
          tembusanArray = [...grupDisplayNames, ...tembusanArray];
        }
      }

      // Parse and convert pengirim (dari) to name if needed
      // Pengirim adalah pengirim_position_id atau to_position_id (atasan penandatangan)
      let dariText = body.dari || body.nama_jabatan || '';
      const pengirimPosId = body.pengirim_position_id || body.to_position_id;
      if (!dariText && pengirimPosId && this.isPositionId(pengirimPosId)) {
        const pengirimNames = await this.konsepService.convertPositionIdsToNames([pengirimPosId], body.tgl);
        if (pengirimNames.length > 0) {
          dariText = pengirimNames[0];
        }
      }

      // Parse lampiran_temp_ids
      let lampiranTempIds: string[] = [];
      if (body.lampiran_temp_ids) {
        lampiranTempIds = this.parseArray(body.lampiran_temp_ids);
      }

      // Build body with converted arrays
      // Set kepada_yth dari penerimaArray jika belum ada
      const kepadaYth = body.kepada_yth || body.kepadaYth || penerimaArray.join('; ') || '';

      const pdfBody = {
        ...body,
        penerima: penerimaArray,
        tertuju: penerimaArray,
        tembusan: tembusanArray,
        kepada_yth: kepadaYth,
        kepadaYth: kepadaYth,
        dari: dariText,
        nama_jabatan: dariText || body.nama_jabatan,
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
  @RequirePermission('naskah-dinas', 'read')
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

  // ============================================================
  // DRAFT KONSEP ENDPOINTS
  // ============================================================

  /**
   * POST /KONSEP/draft/create
   * Simpan draft konsep naskah baru (ND/SDI/SDE)
   * 
   * Draft konsep adalah konsep yang belum dikirim ke pemeriksa.
   * User dapat menyimpan pekerjaan dan melanjutkan nanti.
   * 
   * Form-data fields:
   * - jenis: string (ND|SDI|SDE) - wajib
   * - from_position_id: number - wajib
   * - to_position_id: number (opsional - penerima konsep)
   * - perihal, konten, klasifikasi, sifat, etc.
   * - lampiran_temp_ids: string[] (IDs dari POST /upload-temporary-konsep)
   * 
   * @returns CreateDraftKonsepResponseDto
   */
  @Post('draft/create')
  @RequirePermission('naskah-dinas', 'create')
  @UseInterceptors(
    FileFieldsInterceptor(
      [{ name: 'lampiran_files', maxCount: 10 }],
      { limits: { fileSize: 50 * 1024 * 1024 } },
    ),
  )
  async createDraftKonsep(
    @Body() body: any,
    @CurrentUser() user: any,
    @UploadedFiles() files: { lampiran_files?: Express.Multer.File[] },
  ): Promise<CreateDraftKonsepResponseDto> {
    try {
      const dto = await this.konsepService.parseFormDataToCreateDraftDto(body, files);
      dto.from_position_id = Number(user.position);
      return await this.konsepService.createDraftKonsep(dto);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        {
          success: false,
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Gagal menyimpan draft konsep',
          error: error instanceof Error ? error.message : String(error),
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * GET /KONSEP/draft/list
   * Dapatkan list draft konsep milik user (dari JWT token)
   * 
   * @param user - User dari JWT token (contains position)
   * @query jenis - Filter by jenis: ND, SDI, SDE (optional)
   * @query search - Search by perihal (optional)
   * @query start_date - Start date filter YYYY-MM-DD (optional)
   * @query end_date - End date filter YYYY-MM-DD (optional)
   * @query preset - Date preset: 7_hari, 30_hari, 60_hari, 1_tahun, semua (optional)
   * @query page - Page number, default 1 (optional)
   * @query limit - Items per page, default 10 (optional)
   * 
   * @returns GetDraftKonsepListResponseDto
   */
  @UseGuards(JwtAuthGuard)
  @Get('draft/list')
  @RequirePermission('naskah-dinas', 'read')
  async getDraftKonsepList(
    @CurrentUser() user: any,
    @Query('jenis') jenis?: 'ND' | 'SDI' | 'SDE',
    @Query('search') search?: string,
    @Query('start_date') startDate?: string,
    @Query('end_date') endDate?: string,
    @Query('preset') preset?: '7_hari' | '30_hari' | '60_hari' | '1_tahun' | 'semua',
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<GetDraftKonsepListResponseDto> {
    try {
      const position = parseInt(user.position, 10);
      if (isNaN(position)) {
        throw new BadRequestException('Invalid position in token');
      }

      const pageNum = page ? parseInt(page, 10) : 1;
      const limitNum = limit ? parseInt(limit, 10) : 10;

      const normalizedPreset = preset
        ? (String(preset).toLowerCase().trim().replace(/\s+/g, '_') as '7_hari' | '30_hari' | '60_hari' | '1_tahun' | 'semua')
        : undefined;

      return await this.konsepService.getDraftKonsepList(
        position,
        jenis,
        search,
        startDate,
        endDate,
        normalizedPreset,
        pageNum,
        limitNum,
      );
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        {
          success: false,
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Gagal mendapatkan list draft konsep',
          error: error instanceof Error ? error.message : String(error),
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * GET /KONSEP/draft/detail/:id
   * Dapatkan detail draft konsep
   * 
   * @param id - ID draft (naskah ID)
   * @param user - User dari JWT token (contains position)
   * 
   * @returns GetDraftKonsepDetailResponseDto
   */
  @UseGuards(JwtAuthGuard)
  @Get('draft/detail/:id')
  @RequirePermission('naskah-dinas', 'read-detail')
  async getDraftKonsepDetail(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ): Promise<GetDraftKonsepDetailResponseDto> {
    try {
      const position = parseInt(user.position, 10);
      if (isNaN(position)) {
        throw new BadRequestException('Invalid position in token');
      }

      return await this.konsepService.getDraftKonsepDetail(id, position);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        {
          success: false,
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Gagal mendapatkan detail draft konsep',
          error: error instanceof Error ? error.message : String(error),
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * PUT /KONSEP/draft/update/:id
   * Update draft konsep
   * 
   * @param id - ID draft (naskah ID)
   * @body action - 'draft' untuk simpan lagi, 'kirim' untuk convert ke konsep
   * @body (other fields same as create)
   * 
   * @returns UpdateDraftKonsepResponseDto
   */
  @Put('draft/update/:id')
  @RequirePermission('naskah-dinas', 'update')
  @UseInterceptors(
    FileFieldsInterceptor(
      [{ name: 'lampiran_files', maxCount: 10 }],
      { limits: { fileSize: 50 * 1024 * 1024 } },
    ),
  )
  async updateDraftKonsep(
    @Param('id') id: string,
    @Body() body: any,
    @CurrentUser() user: any,
    @UploadedFiles() files: { lampiran_files?: Express.Multer.File[] },
  ): Promise<UpdateDraftKonsepResponseDto> {
    try {
      const dto = await this.konsepService.parseFormDataToUpdateDraftDto(body, files);
      dto.from_position_id = Number(user.position);
      return await this.konsepService.updateDraftKonsep(id, dto);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        {
          success: false,
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Gagal mengupdate draft konsep',
          error: error instanceof Error ? error.message : String(error),
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * DELETE /KONSEP/draft/delete/:id
   * Hapus draft konsep
   * 
   * @param id - ID draft (naskah ID)
   * @param user - User dari JWT token (contains position)
   * 
   * @returns DeleteDraftKonsepResponseDto
   */
  @UseGuards(JwtAuthGuard)
  @Delete('draft/delete/:id')
  @RequirePermission('naskah-dinas', 'delete')
  async deleteDraftKonsep(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ): Promise<DeleteDraftKonsepResponseDto> {
    try {
      const position = parseInt(user.position, 10);
      if (isNaN(position)) {
        throw new BadRequestException('Invalid position in token');
      }

      return await this.konsepService.deleteDraftKonsep(id, position);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        {
          success: false,
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Gagal menghapus draft konsep',
          error: error instanceof Error ? error.message : String(error),
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * POST /KONSEP/draft/bulk-delete
   * Hapus beberapa draft konsep sekaligus
   * 
   * @body draft_ids - Array of draft IDs to delete
   * @param user - User dari JWT token (contains position)
   * 
   * @returns BulkDeleteDraftKonsepResponseDto
   */
  @UseGuards(JwtAuthGuard)
  @Post('draft/bulk-delete')
  @RequirePermission('naskah-dinas', 'delete')
  async bulkDeleteDraftKonsep(
    @Body() body: { draft_ids: string[] },
    @CurrentUser() user: any,
  ): Promise<BulkDeleteDraftKonsepResponseDto> {
    try {
      const position = parseInt(user.position, 10);
      if (isNaN(position)) {
        throw new BadRequestException('Invalid position in token');
      }

      if (!body.draft_ids || !Array.isArray(body.draft_ids) || body.draft_ids.length === 0) {
        throw new BadRequestException('draft_ids harus berupa array yang tidak kosong');
      }

      return await this.konsepService.bulkDeleteDraftKonsep(body.draft_ids, position);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        {
          success: false,
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Gagal menghapus draft konsep secara bulk',
          error: error instanceof Error ? error.message : String(error),
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
