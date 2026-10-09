import { finalPdfQrViewerUrl } from '../services/final-pdf-qr.util';
import {
  Controller,
  StreamableFile,
  Header,
  Redirect,
  Post,
  Get,
  Body,
  HttpCode,
  HttpStatus,
  Param,
  Query,
  ParseUUIDPipe,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import {
  DigsigService,
  SignResultResponse,
  SignInternalResultResponse,
} from '../services';
import { SignInternalDto, SignBsreDto, CreateDigsigDto } from '../dto';
import { Public } from '../../../common/decorators/public.decorator';
import { CurrentUser, RequirePermission, SkipTransform } from '../../../common/decorators';
import { JwtAuthGuard } from '../../../common/guards';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { StorageService } from 'src/modules/storage/services/storage.service';
import { DEFAULT_BSRE_NIK } from '../../../common/constants/bsre.constants';

@Controller('digsig')
@UseGuards(JwtAuthGuard)
export class DigsigController {
  constructor(
    private readonly digsigService: DigsigService,
    private readonly storageService: StorageService,
  ) {}

  /**
   * POST /digsig/bac/:transferId/sign
   * TTE Berita Acara pemindahan arsip oleh pejabat pihak pertama (EVP).
   * Alur sama dengan naskah lain: BSrE v2 + passphrase.
   */
  @Post('bac/:transferId/sign')
  @HttpCode(HttpStatus.OK)
  async signBac(
    @Param('transferId') transferId: string,
    @Body() dto: SignBsreDto,
    @Query('signer') signerType: 'pihak_pertama' | 'pihak_kedua' = 'pihak_pertama',
    @CurrentUser() user: JwtPayload,
  ): Promise<SignResultResponse> {
    if (!dto.passphrase) {
      throw new BadRequestException(
        'Passphrase wajib diisi — input passphrase BSrE Anda',
      );
    }
    return this.digsigService.signBacBsre(transferId, dto, user, signerType);
  }

  /**
   * POST /digsig/bac/:transferId/sign-qr
   * Tanda tangan internal BAC dengan QR. BAC dirender ulang memakai template
   * yang sama agar QR berada di slot tanda tangan Pihak Pertama.
   */
  @Post('bac/:transferId/sign-qr')
  @HttpCode(HttpStatus.OK)
  async signBacQr(
    @Param('transferId') transferId: string,
    @Query('signer') signerType: 'pihak_pertama' | 'pihak_kedua' = 'pihak_pertama',
    @CurrentUser() user: JwtPayload,
  ): Promise<SignResultResponse> {
    return this.digsigService.signBacQr(transferId, user, signerType);
  }

  /**
   * Normalisasi BAC QR lama yang dibuat sebelum slot QR memakai anchor template.
   * Endpoint ini dipanggil saat detail BAC lama dibuka dan idempotent.
   */
  @Post('bac/:transferId/repair-qr-layout')
  @HttpCode(HttpStatus.OK)
  async repairBacQrLayout(
    @Param('transferId') transferId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<SignResultResponse> {
    return this.digsigService.repairBacQrLayout(transferId, user);
  }

  /**
   * POST /digsig/bac/:transferId/sign-physical
   * Selesaikan tanda tangan BAC setelah pejabat mengunggah PDF hasil scan
   * tanda tangan basah.
   */
  @Post('bac/:transferId/sign-physical')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file'))
  async signBacPhysical(
    @Param('transferId') transferId: string,
    @UploadedFile() file: Express.Multer.File,
    @Query('signer') signerType: 'pihak_pertama' | 'pihak_kedua' = 'pihak_pertama',
    @CurrentUser() user: JwtPayload,
  ): Promise<SignResultResponse> {
    if (!file) {
      throw new BadRequestException('PDF hasil tanda tangan basah wajib diunggah');
    }
    return this.digsigService.signBacPhysical(transferId, file, user, signerType);
  }

  // ============================================
  // SIGN DENGAN DIGSIG (BSrE) - v2 dengan Auto-fetch NIK
  // Passphrase diinput oleh user (bukan hardcoded) — sama seperti alur produksi.
  // NIK tetap shared (DEFAULT_BSRE_NIK).
  // ============================================

  @Post('sign')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('naskah-dinas', 'sign')
  async create(@Body() CreateDigsigDto: CreateDigsigDto) {
    if (!CreateDigsigDto.passphrase) {
      throw new BadRequestException(
        'Passphrase wajib diisi — input passphrase BSrE Anda',
      );
    }
    const filename =
      '1767861265056-1767779306136-nd-030-goo1-ops.02-xii-2025-1767779306135.pdf';
    const keypathfile = `/nota-dinas/final/${filename}`;
    const digsig = await this.digsigService.hitDigsigEndpoint({
      key: keypathfile,
      filename: filename,
      nomorDokumen: '001/ABC/KLH.00/XII/2025',
      tanggalDokumen: '2025-12-23',
      klasifikasi: 'Biasa',
      jenisNaskah: 'Nota Dinas',
      perihal: 'Test from New Arsipku',
      nik: DEFAULT_BSRE_NIK,
      passphrase: CreateDigsigDto.passphrase,
      path_dokumen: 'nota-dinas/digsig/',
      no_wa: '',
    });
    return digsig;
  }

  @Post('testverify')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('naskah-dinas', 'read-detail')
  async verifai() {
    const filename =
      '1767861265056-1767779306136-nd-030-goo1-ops.02-xii-2025-1767779306135-1768806147569.pdf';
    const finalPdfPath = `/nota-dinas/digsig/${filename}`;
    const verify = this.digsigService.hitVerifyDigsig({
      filename: filename,
      fileurl: finalPdfPath,
    });
    return verify;
  }

  /**
   * POST /digsig/sign-nota-dinas/:id
   * Tandatangani Nota Dinas dengan Digsig (BSrE)
   * NIK dan no_wa diambil dari JWT payload (user profile)
   */
  @Post('bsre/nota-dinas/:idNaskah')
  @UseGuards(ThrottlerGuard)
  @Throttle({ sign: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @RequirePermission('naskah-dinas', 'sign')
  async signNotaDinasBsre(
    @Param('idNaskah', ParseUUIDPipe) idNaskah: string,
    @Body() dto: SignBsreDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<SignResultResponse> {
    return this.digsigService.signNotaDinasBsre(idNaskah, dto, user);
  }

  /**
   * POST /digsig/bsre/surat-internal/:idNaskah
   * Tandatangani Surat Dinas Internal dengan BSrE
   * NIK dan no_wa diambil dari JWT payload (user profile)
   *
   * Request Body:
   * {
   *   "passphrase": "passphrase_bsre_user"
   * }
   */
  @Post('bsre/surat-internal/:idNaskah')
  @UseGuards(ThrottlerGuard)
  @Throttle({ sign: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @RequirePermission('naskah-dinas', 'sign')
  async signSdiBsre(
    @Param('idNaskah', ParseUUIDPipe) idNaskah: string,
    @Body() dto: SignBsreDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<SignResultResponse> {
    return this.digsigService.signSdiBsre(idNaskah, dto, user);
  }

  /**
   * POST /digsig/bsre/surat-eksternal/:idNaskah
   * Tandatangani Surat Dinas Eksternal dengan BSrE
   * NIK dan no_wa diambil dari JWT payload (user profile)
   * 
   * Request Body:
   * {
   *   "passphrase": "passphrase_bsre_user"
   * }
   UseGuards(ThrottlerGuard)
  @Throttle({ sign: { limit: 5, ttl: 60000 } })
  @*/
  @Post('bsre/surat-eksternal/:idNaskah')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('naskah-dinas', 'sign')
  async signSdeBsre(
    @Param('idNaskah', ParseUUIDPipe) idNaskah: string,
    @Body() dto: SignBsreDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<SignResultResponse> {
    return this.digsigService.signSdeBsre(idNaskah, dto, user);
  }

  // ============================================
  // SIGN INTERNAL (Tanpa BSrE) - Untuk Testing
  // ============================================

  /**
   * POST /digsig/internal/nota-dinas/:idNaskah
   * Tandatangani Nota Dinas dengan Internal (tanpa BSrE)
   * Passphrase default: 12345
   */
  @Post('internal/nota-dinas/:idNaskah')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('naskah-dinas', 'sign')
  async signNotaDinasInternal(
    @Param('idNaskah', ParseUUIDPipe) idNaskah: string,
    @Body() dto: SignInternalDto,
  ): Promise<SignInternalResultResponse> {
    return this.digsigService.signNotaDinasInternal(idNaskah, dto);
  }

  /**
   * POST /digsig/internal/surat-internal/:idNaskah
   * Tandatangani Surat Dinas Internal dengan Internal (tanpa BSrE)
   * Passphrase default: 12345
   */
  @Post('internal/surat-internal/:idNaskah')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('naskah-dinas', 'sign')
  async signSdiInternal(
    @Param('idNaskah', ParseUUIDPipe) idNaskah: string,
    @Body() dto: SignInternalDto,
  ): Promise<SignInternalResultResponse> {
    return this.digsigService.signSdiInternal(idNaskah, dto);
  }

  /**
   * POST /digsig/internal/surat-eksternal/:idNaskah
   * Tandatangani Surat Dinas Eksternal dengan Internal (tanpa BSrE)
   * Passphrase default: 12345
   */
  @Post('internal/surat-eksternal/:idNaskah')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('naskah-dinas', 'sign')
  async signSdeInternal(
    @Param('idNaskah', ParseUUIDPipe) idNaskah: string,
    @Body() dto: SignInternalDto,
  ): Promise<SignInternalResultResponse> {
    return this.digsigService.signSdeInternal(idNaskah, dto);
  }

  // ============================================
  // HELPER ENDPOINTS - Untuk Testing
  // ============================================

  /**
   * GET /digsig/user-data
   * Endpoint untuk mendapatkan data user (NIK dan no_wa)
   * Data diambil dari JWT payload (profile user)
   * NIK dan noWa disimpan di JWT saat login
   */
  @Get('user-data')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('naskah-dinas', 'read-detail')
  async getUserData(@CurrentUser() user: JwtPayload) {
    return this.digsigService.getUserDataFromJwt(user);
  }

  /**
   * GET /digsig/ktp
   * Endpoint untuk mendapatkan NIK user
   * Data diambil dari JWT payload (profile user)
   * NIK disimpan di JWT saat login (diambil dari HR API sekali saat login)
   */
  @Get('ktp')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('naskah-dinas', 'read-detail')
  async getktp() {
    return {
      noktp: DEFAULT_BSRE_NIK,
    };
  }

  // ============================================
  // VERIFICATION ENDPOINTS
  // ============================================

  /** Existing QR links enter the authenticated frontend viewer. */
  @Public()
  @Get('pdf/:id')
  @SkipTransform()
  @Redirect()
  @Header('Cache-Control', 'no-store')
  openFinalPdf(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query('ref') reference: string,
  ) {
    return { url: finalPdfQrViewerUrl(id, reference), statusCode: 302 };
  }

  /** PDF bytes require an authenticated ArsipKu request. */
  @Get('pdf/:id/content')
  @SkipTransform()
  @RequirePermission('naskah-dinas', 'read-detail')
  @Header('Cache-Control', 'no-store')
  async getFinalPdfContent(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query('ref') reference: string,
  ): Promise<StreamableFile> {
    const buffer = await this.digsigService.getFinalPdfForQr(id, reference);
    return new StreamableFile(buffer, {
      type: 'application/pdf',
      disposition: 'inline; filename="naskah-final.pdf"',
    });
  }

  /**
   * GET /digsig/verify/:signatureId
   * Verifikasi dokumen berdasarkan signature_id
   * Returns: document info + signature status
   */
  @Get('verify/:signatureId')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('naskah-dinas', 'read-detail')
  async verifyBySignatureId(@Param('signatureId') signatureId: string) {
    return this.digsigService.verifyBySignatureId(signatureId);
  }

  /**
   * POST /digsig/verify/bsre
   * Verifikasi dokumen dengan BSrE menggunakan name_doc
   * Request Body: { name_doc: "filename.pdf" }
   */
  @Post('verify/bsre')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('naskah-dinas', 'read-detail')
  async verifyWithBsre(@Body() body: { name_doc: string }) {
    return this.digsigService.verifyWithBsre(body.name_doc);
  }
}
