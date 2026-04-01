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
import { FileFieldsInterceptor, AnyFilesInterceptor } from '@nestjs/platform-express';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { KajianService } from '../services/kajian.service';
import {
  KajianRecipientResponseDto,
  GetRecipientQueryDto,
  OrgDataPositionDto,
} from '../dto/kajian-recipient-response.dto';
import { CreateKajianDto, FinalizeDraftDto, UpdateDraftDto } from '../dto/create-kajian.dto';
import { GeneratePdfKajianDto } from '../dto/generate-pdf.dto';
import { SendMessageResponseDto } from '../dto/send-kajian-response.dto';
import { GetSendMessageResponseDto } from '../dto/get-send-message-response.dto';
import { UserLevelGuard, JwtAuthGuard } from '../../../common/guards';
import { UserLevels, Public, CurrentUser } from '../../../common/decorators';
import { UserLevel } from '../../../common/enums';

@Controller('KA')
export class KajianController {
  constructor(private readonly kajianService: KajianService) {}

  /**
   * GET /KA/get-recipient
   * Get eligible recipients for Kajian based on position ID
   * 
   * Kajian Rules:
   * - Sender: Semua (Managerial, Fungsional, Staff)
   * - Recipients: ATASAN saja (langsung & tidak langsung) dalam Sub Area yang sama
   * - BAWAHAN: [] (tidak boleh ke bawahan)
   * - REKAN: [] (tidak boleh ke sesama level)
   *
   * @param user - User dari JWT token (contains position)
   * @param query - Query parameters:
   *   - tgl: optional date in format YYYY-MM-DD
   *   - pengirim: optional position_id pengirim (untuk kasus konsep/draft)
   * @returns KajianRecipientResponseDto
   *
   * @example
   * GET /KA/get-recipient (gunakan position dari JWT)
   * GET /KA/get-recipient?pengirim=70016742 (gunakan pengirim yang dipilih)
   */
  @UseGuards(JwtAuthGuard)
  @Get('get-recipient')
  async getKajianRecipients(
    @CurrentUser() user: any,
    @Query() query: GetRecipientQueryDto,
  ): Promise<KajianRecipientResponseDto> {
    try {
      // Jika pengirim ada di query, gunakan itu; jika tidak, gunakan position dari JWT
      const positionId = query.pengirim ? parseInt(query.pengirim, 10) : parseInt(user.position, 10);
      // Note: tgl param from query is available but not currently used
      return await this.kajianService.getKajianRecipients(positionId);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Failed to get Kajian recipients',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * GET /KA/:id
   * Get detail Kajian by ID
   * Menampilkan keseluruhan informasi surat termasuk PDF final
   *
   * @param id - Naskah ID (UUID)
   * @returns Detail kajian lengkap
   */
  @Get(':id')
  async getKajianDetail(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ): Promise<any> {
    try {
      return await this.kajianService.getKajianDetail(id, user.position);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        {
          success: false,
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Failed to get Kajian detail',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * POST /KA/save-draft
   * Save Kajian as draft
   * Status: 'draf'
   */
  @Public()
  @Post('save-draft')
  @UseInterceptors(
    FileFieldsInterceptor(
      [{ name: 'lampiran_files', maxCount: 10 }],
      { limits: { fileSize: 50 * 1024 * 1024 } },
    ),
  )
  async saveDraft(
    @Body() body: any,
    @UploadedFiles() files: { lampiran_files?: Express.Multer.File[] },
  ): Promise<SendMessageResponseDto> {
    try {
      const dto = await this.kajianService.parseFormDataToDto(body, files);
      return await this.kajianService.saveDraft(dto);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        {
          success: false,
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Failed to save draft',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * POST /KA/send-message
   * Send Kajian (langsung final tanpa draft)
   * Status: 'final' (tanpa tanda_tangan) atau 'final_tte' (dengan tanda_tangan)
   * 
   * Digital Signature Options:
   * - sign_option: 'digsig' | 'qr_only' | 'ttd_basah'
   * - passphrase: Required for digsig
   */
  @UseGuards(JwtAuthGuard)
  @Post('send-message')
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'lampiran_files', maxCount: 10 },
        { name: 'final_pdf', maxCount: 1 },
      ],
      { limits: { fileSize: 50 * 1024 * 1024 } },
    ),
  )
  async sendMessage(
    @Body() body: any,
    @UploadedFiles() files: { lampiran_files?: Express.Multer.File[]; final_pdf?: Express.Multer.File[] },
    @CurrentUser() user: any,
  ): Promise<SendMessageResponseDto> {
    try {
      // Log incoming request for debugging
      console.log('[KA Controller] send-message request');
      console.log('[KA Controller] User from JWT:', user);

      // Extract persnum from JWT token
      const persnum = user?.persnum || user?.personNumber || user?.persnum_person;
      console.log('[KA Controller] Extracted persnum:', persnum);

      const dto = await this.kajianService.parseFormDataToDto(body, files);
      console.log('[KA Controller] Parsed DTO sign_option:', dto.sign_option);

      return await this.kajianService.sendMessage(dto, persnum);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        {
          success: false,
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Failed to send message',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * PATCH /KA/update-draft/:id
   * Update draft Kajian (status tetap draf)
   */
  @Public()
  @Patch('update-draft/:id')
  @UseInterceptors(
    FileFieldsInterceptor(
      [{ name: 'lampiran_files', maxCount: 10 }],
      { limits: { fileSize: 50 * 1024 * 1024 } },
    ),
  )
  async updateDraft(
    @Param('id') id: string,
    @Body() body: any,
    @UploadedFiles() files: { lampiran_files?: Express.Multer.File[] },
  ): Promise<SendMessageResponseDto> {
    try {
      const dto = await this.kajianService.parseFormDataToUpdateDraftDto(body, files);
      return await this.kajianService.updateDraft(id, dto);
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
   * PUT /KA/send-draft/:id
   * Finalize draft Kajian (update status dari draf ke final/final_tte)
   * 
   * Digital Signature Options:
   * - sign_option: 'digsig' | 'qr_only' | 'ttd_basah'
   * - passphrase: Required for digsig
   */
  @UseGuards(JwtAuthGuard)
  @Put('send-draft/:id')
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'lampiran_files', maxCount: 10 },
        { name: 'final_pdf', maxCount: 1 },
      ],
      { limits: { fileSize: 50 * 1024 * 1024 } },
    ),
  )
  async sendDraft(
    @Param('id') id: string,
    @Body() body: any,
    @UploadedFiles() files: { lampiran_files?: Express.Multer.File[]; final_pdf?: Express.Multer.File[] },
    @CurrentUser() user: any,
  ): Promise<SendMessageResponseDto> {
    try {
      // Log incoming request for debugging
      console.log('[KA Controller] send-draft request for id:', id);
      console.log('[KA Controller] User from JWT:', user);

      // Extract persnum from JWT token
      const persnum = user?.persnum || user?.personNumber || user?.persnum_person;
      console.log('[KA Controller] Extracted persnum:', persnum);

      const dto = await this.kajianService.parseFormDataToFinalizeDraftDto(body, files);
      console.log('[KA Controller] Parsed DTO sign_option:', dto.sign_option);

      return await this.kajianService.finalizeDraft(id, dto, persnum);
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
   * GET /KA/draft-list/:positionId
   * Get all draft Kajian by position
   */
  @Get('draft-list/:positionId')
  async getDraftList(
    @Param('positionId', ParseIntPipe) positionId: number,
    @Query() query: GetRecipientQueryDto,
  ): Promise<GetSendMessageResponseDto> {
    try {
      return await this.kajianService.getDraftList(positionId, query.tgl);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Failed to get draft list',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * GET /KA/get-send-message/:positionId
   * Get all Kajian sent by position
   */
  @Get('get-send-message/:positionId')
  async getSendMessage(
    @Param('positionId', ParseIntPipe) positionId: number,
    @Query() query: GetRecipientQueryDto,
  ): Promise<GetSendMessageResponseDto> {
    try {
      // Note: tgl param from query is available but not currently used
      return await this.kajianService.getSendMessage(positionId);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Failed to get sent messages',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * POST /KA/preview-pdf
   * Generate preview PDF Kajian untuk di-lihat sebelum dikirim
   * PDF di-generate tanpa save ke database
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
      // Support both 'konten' and 'htmlContent' field names
      if (body.konten && !body.htmlContent) {
        body.htmlContent = body.konten;
      }

      // Transform & Validate DTO manually
      const dto = plainToInstance(GeneratePdfKajianDto, body);
      const errors = await validate(dto);
      if (errors.length > 0) {
        return res.status(HttpStatus.BAD_REQUEST).json({
          success: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: errors.map((e) => Object.values(e.constraints || {})).flat(),
          error: 'Bad Request',
        });
      }

      if (!dto || !dto.htmlContent) {
        return res.status(HttpStatus.BAD_REQUEST).json({
          success: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: ['htmlContent harus diisi'],
          error: 'Bad Request',
        });
      }

      const hasRecipient = (dto.tertuju?.length || 0) > 0 || (dto.penerima?.length || 0) > 0;
      if (!hasRecipient) {
        return res.status(HttpStatus.BAD_REQUEST).json({
          success: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: ['Minimal harus ada 1 penerima (tertuju/penerima)'],
          error: 'Bad Request',
        });
      }

      // Format tanggal dengan nama tempat
      const namaTempat = dto.nama_tempat || 'Tangerang';
      const tanggalInput = dto.tgl || dto.tanggal || new Date().toISOString().split('T')[0];

      let formattedDate = '';
      try {
        if (
          /januari|februari|maret|april|mei|juni|juli|agustus|september|oktober|november|desember/i.test(
            tanggalInput,
          )
        ) {
          formattedDate = tanggalInput.includes(',')
            ? tanggalInput
            : `${namaTempat}, ${tanggalInput}`;
        } else {
          const dateObj = new Date(tanggalInput + 'T00:00:00');
          if (!isNaN(dateObj.getTime())) {
            const formatted = dateObj.toLocaleDateString('id-ID', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              timeZone: 'Asia/Jakarta',
            });
            formattedDate = `${namaTempat}, ${formatted}`;
          } else {
            formattedDate = `${namaTempat}, ${tanggalInput}`;
          }
        }
      } catch (error) {
        formattedDate = `${namaTempat}, ${tanggalInput}`;
      }

      const positionText = dto.dari || user?.positionText || 'Staf';
      const dariFormatted = positionText;

      const positionIdToUse = body.pengirim || user?.position;
      const personName = await this.kajianService.getPersonNameByPosition(
        positionIdToUse,
        dto.tgl,
      );
      const namaLengkap =
        body.nama_lengkap ||
        dto.nama_lengkap ||
        dto.penandatangan ||
        personName ||
        user?.nama ||
        '';

      let tertujuArray = dto.tertuju || dto.penerima || [];
      const isPositionId = (value: any): boolean => {
        return (
          typeof value === 'number' ||
          (typeof value === 'string' && /^\d+$/.test(value))
        );
      };

      if (tertujuArray.length > 0 && isPositionId(tertujuArray[0])) {
        const tertujuNames = await this.kajianService.convertPositionIdsToNames(tertujuArray);
        tertujuArray = tertujuNames;
      }

      let tembusanArray = dto.tembusan || [];
      if (tembusanArray.length > 0 && isPositionId(tembusanArray[0])) {
        const tembusanNames = await this.kajianService.convertPositionIdsToNames(tembusanArray);
        tembusanArray = tembusanNames;
      }

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

      // Get dynamic header info
      const headerInfo = await this.kajianService.getHeaderInfoByUser(
        {
          company: user?.company,
          area: user?.area,
          subArea: user?.subArea,
        },
        dto.tgl,
      );

      const dynamicNamaTempat = headerInfo?.kota || namaTempat;

      // Re-format tanggal dengan dynamic nama_tempat
      if (headerInfo?.kota) {
        try {
          if (
            /januari|februari|maret|april|mei|juni|juli|agustus|september|oktober|november|desember/i.test(
              tanggalInput,
            )
          ) {
            if (tanggalInput.includes(',')) {
              formattedDate = tanggalInput.replace(
                /^[^,]+,/,
                `${dynamicNamaTempat},`,
              );
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
                timeZone: 'Asia/Jakarta',
              });
              formattedDate = `${dynamicNamaTempat}, ${formatted}`;
            }
          }
        } catch {}
      }

      // Generate preview PDF
      const pdfBuffer = await this.kajianService.generatePdfFromHtml(
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
        'Content-Disposition': `inline; filename="preview-kajian.pdf"`,
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
   * POST /KA/generate-pdf
   * Generate PDF Kajian dinamis dengan data dari request body
   * PDF polos tanpa merge lampiran
   */
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileFieldsInterceptor([{ name: 'lampiran_files', maxCount: 10 }]))
  @Post('generate-pdf')
  async generatePdf(
    @Body() body: any,
    @CurrentUser() user: any,
    @UploadedFiles() files: { lampiran_files?: Express.Multer.File[] },
    @Res() res: Response,
  ) {
    try {
      const dto = plainToInstance(GeneratePdfKajianDto, body);
      const errors = await validate(dto);
      if (errors.length > 0) {
        return res.status(HttpStatus.BAD_REQUEST).json({
          success: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: errors.map((e) => Object.values(e.constraints || {})).flat(),
          error: 'Bad Request',
        });
      }

      if (!dto || !dto.htmlContent) {
        return res.status(HttpStatus.BAD_REQUEST).json({
          success: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: ['htmlContent harus diisi'],
          error: 'Bad Request',
        });
      }

      const hasRecipient = (dto.tertuju?.length || 0) > 0 || (dto.penerima?.length || 0) > 0;
      if (!hasRecipient) {
        return res.status(HttpStatus.BAD_REQUEST).json({
          success: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: ['Minimal harus ada 1 penerima (tertuju/penerima)'],
          error: 'Bad Request',
        });
      }

      const namaTempat = body.nama_tempat || dto.nama_tempat || 'Tangerang';
      const tanggalInput = body.tgl || dto.tanggal || new Date().toISOString().split('T')[0];

      let formattedDate = '';
      try {
        if (
          /januari|februari|maret|april|mei|juni|juli|agustus|september|oktober|november|desember/i.test(
            tanggalInput,
          )
        ) {
          formattedDate = tanggalInput.includes(',')
            ? tanggalInput
            : `${namaTempat}, ${tanggalInput}`;
        } else {
          let dateObj: Date;
          if (/^\d{4}-\d{2}-\d{2}$/.test(tanggalInput)) {
            dateObj = new Date(tanggalInput + 'T00:00:00');
          } else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(tanggalInput)) {
            const [day, month, year] = tanggalInput.split('/');
            dateObj = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
          } else {
            dateObj = new Date(tanggalInput);
          }

          if (!isNaN(dateObj.getTime())) {
            const formatted = dateObj.toLocaleDateString('id-ID', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              timeZone: 'Asia/Jakarta',
            });
            formattedDate = `${namaTempat}, ${formatted}`;
          } else {
            formattedDate = `${namaTempat}, ${tanggalInput}`;
          }
        }
      } catch {
        formattedDate = `${namaTempat}, ${tanggalInput}`;
      }

      const positionText = dto.dari || user?.positionText || 'Staf';
      const dariFormatted = positionText;

      const positionIdToUse = body.pengirim || user?.position;
      const personName = await this.kajianService.getPersonNameByPosition(
        positionIdToUse,
        body.tgl || dto.tgl,
      );
      const namaLengkap =
        body.nama_lengkap ||
        dto.nama_lengkap ||
        dto.penandatangan ||
        personName ||
        user?.nama ||
        '';

      let tertujuArray = dto.tertuju || dto.penerima || [];
      const isPositionId = (value: any): boolean => {
        return (
          typeof value === 'number' ||
          (typeof value === 'string' && /^\d+$/.test(value))
        );
      };

      if (tertujuArray.length > 0 && isPositionId(tertujuArray[0])) {
        const tertujuNames = await this.kajianService.convertPositionIdsToNames(tertujuArray);
        tertujuArray = tertujuNames;
      }

      let tembusanArray = dto.tembusan || [];
      if (tembusanArray.length > 0 && isPositionId(tembusanArray[0])) {
        const tembusanNames = await this.kajianService.convertPositionIdsToNames(tembusanArray);
        tembusanArray = tembusanNames;
      }

      // Get dynamic header info
      const headerInfo = await this.kajianService.getHeaderInfoByUser(
        {
          company: user?.company,
          area: user?.area,
          subArea: user?.subArea,
        },
        body.tgl || dto.tgl,
      );

      const dynamicNamaTempat = headerInfo?.kota || namaTempat;

      // Re-format tanggal dengan dynamic nama_tempat
      if (headerInfo?.kota) {
        try {
          if (
            /januari|februari|maret|april|mei|juni|juli|agustus|september|oktober|november|desember/i.test(
              tanggalInput,
            )
          ) {
            if (tanggalInput.includes(',')) {
              formattedDate = tanggalInput.replace(
                /^[^,]+,/,
                `${dynamicNamaTempat},`,
              );
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
                timeZone: 'Asia/Jakarta',
              });
              formattedDate = `${dynamicNamaTempat}, ${formatted}`;
            }
          }
        } catch {}
      }

      // generate-pdf: PDF polos TANPA lampiran merge
      const pdfBuffer = await this.kajianService.generatePlainPdf(
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
        'Content-Disposition': `attachment; filename="kajian-${Date.now()}.pdf"`,
        'Content-Length': pdfBuffer.length,
      });

      return res.status(HttpStatus.OK).send(pdfBuffer);
    } catch (error) {
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        error: 'Failed to generate PDF',
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
