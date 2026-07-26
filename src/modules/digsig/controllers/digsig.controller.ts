import {
  Controller,
  Post,
  Get,
  Body,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import {
  DigsigService,
  SignResultResponse,
  SignInternalResultResponse,
} from '../services';
import { SignInternalDto, SignBsreDto, CreateDigsigDto } from '../dto';
import { CurrentUser, RequirePermission } from '../../../common/decorators';
import { JwtAuthGuard } from '../../../common/guards';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { StorageService } from 'src/modules/storage/services/storage.service';

@Controller('digsig')
@UseGuards(JwtAuthGuard)
export class DigsigController {
  constructor(
    private readonly digsigService: DigsigService,
    private readonly storageService: StorageService,
  ) {}

  // ============================================
  // SIGN DENGAN DIGSIG (BSrE) - v2 dengan Auto-fetch NIK
  // Contoh passphrase BSrE: sesuai dengan passphrase akun BSrE masing-masing user
  // ============================================

  @Post('sign')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('naskah-dinas', 'sign')
  async create(@Body() CreateDigsigDto: CreateDigsigDto) {
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
      nik: '1234567890123452',
      passphrase: 'Bsre2025.#!',
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
  async getktp(@CurrentUser() user: JwtPayload) {
    if (!user.nik) {
      throw new BadRequestException(
        'NIK tidak ditemukan di profile user. Silakan logout dan login kembali untuk memperbarui data profile.',
      );
    }
    return {
      noktp: user.nik,
    };
  }

  // ============================================
  // VERIFICATION ENDPOINTS
  // ============================================

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
