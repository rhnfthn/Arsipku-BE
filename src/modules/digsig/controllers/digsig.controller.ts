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
} from '@nestjs/common';
import {
  DigsigService,
  SignResultResponse,
  SignInternalResultResponse,
} from '../services';
import {
  SignInternalDto,
  SignBsreDto,
} from '../dto';
import { CurrentUser } from '../../../common/decorators';
import { JwtAuthGuard } from '../../../common/guards';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';

@Controller('digsig')
@UseGuards(JwtAuthGuard)
export class DigsigController {
  constructor(private readonly digsigService: DigsigService) {}

  // ============================================
  // SIGN DENGAN DIGSIG (BSrE) - v2 dengan Auto-fetch NIK
  // Contoh passphrase BSrE: sesuai dengan passphrase akun BSrE masing-masing user
  // ============================================

  /**
   * POST /digsig/bsre/nota-dinas/:idNaskah
   * Tandatangani Nota Dinas dengan BSrE
   * NIK dan no_wa otomatis diambil dari HR API berdasarkan persnum user yang login
   * 
   * Request Body:
   * {
   *   "passphrase": "passphrase_bsre_user"
   * }
   */
  @Post('bsre/nota-dinas/:idNaskah')
  @HttpCode(HttpStatus.OK)
  async signNotaDinasBsre(
    @Param('idNaskah', ParseUUIDPipe) idNaskah: string,
    @Body() dto: SignBsreDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<SignResultResponse> {
    return this.digsigService.signNotaDinasBsre(idNaskah, dto, user.persnum);
  }

  /**
   * POST /digsig/bsre/surat-internal/:idNaskah
   * Tandatangani Surat Dinas Internal dengan BSrE
   * NIK dan no_wa otomatis diambil dari HR API berdasarkan persnum user yang login
   * 
   * Request Body:
   * {
   *   "passphrase": "passphrase_bsre_user"
   * }
   */
  @Post('bsre/surat-internal/:idNaskah')
  @HttpCode(HttpStatus.OK)
  async signSdiBsre(
    @Param('idNaskah', ParseUUIDPipe) idNaskah: string,
    @Body() dto: SignBsreDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<SignResultResponse> {
    return this.digsigService.signSdiBsre(idNaskah, dto, user.persnum);
  }

  /**
   * POST /digsig/bsre/surat-eksternal/:idNaskah
   * Tandatangani Surat Dinas Eksternal dengan BSrE
   * NIK dan no_wa otomatis diambil dari HR API berdasarkan persnum user yang login
   * 
   * Request Body:
   * {
   *   "passphrase": "passphrase_bsre_user"
   * }
   */
  @Post('bsre/surat-eksternal/:idNaskah')
  @HttpCode(HttpStatus.OK)
  async signSdeBsre(
    @Param('idNaskah', ParseUUIDPipe) idNaskah: string,
    @Body() dto: SignBsreDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<SignResultResponse> {
    return this.digsigService.signSdeBsre(idNaskah, dto, user.persnum);
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
   * Test endpoint untuk mendapatkan data user dari HR API (NIK dan no_wa)
   * Data diambil berdasarkan persnum user yang login
   */
  @Get('user-data')
  @HttpCode(HttpStatus.OK)
  async getUserData(@CurrentUser() user: JwtPayload) {
    return this.digsigService.getUserDataForBsre(user.persnum.toString());
  }

  /**
   * GET /digsig/ktp
   * Test endpoint untuk mendapatkan KTP user
   * Data diambil berdasarkan persnum user yang login
   */
  @Get('ktp')
  @HttpCode(HttpStatus.OK)
  async getktp(@CurrentUser() user: JwtPayload) {
    return this.digsigService.getKTPUser({
      persnum: user.persnum.toString()
    });
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
  async verifyWithBsre(@Body() body: { name_doc: string }) {
    return this.digsigService.verifyWithBsre(body.name_doc);
  }
}
