import {
  Controller,
  ParseUUIDPipe,
  Post,
  Get,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { CurrentUser, RequirePermission } from '../../../common/decorators';
import { JwtAuthGuard } from '../../../common/guards';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { TteSigningService } from '../services/tte-signing.service';
import { TteSigningGateway } from '../services/tte-signing-gateway.service';
import { TteCallbackDto, TteStatusParamsDto } from '../dto/tte-signing.dto';

/**
 * Controller integrasi Portal TTE (client).
 *
 * Alur FE:
 * Signing request dibuat oleh service domain ND/NU/NL supaya browser tidak
 * dapat menentukan sourceKey atau target naskah sendiri.
 * 1. Portal redirect balik ke FE /tte/callback?code=...&state=...
 * 2. FE POST /tte-portal/callback → BE exchange code → persist hasil
 * 3. GET /tte-portal/transactions/:transactionId → polling/recovery status
 */
@Controller('tte-portal')
@UseGuards(JwtAuthGuard)
export class TtePortalController {
  constructor(
    private readonly tteSigningService: TteSigningService,
    private readonly tteSigningGateway: TteSigningGateway,
  ) {}

  /**
   * Cek jalur TTE untuk jenis naskah (konfigurasi admin).
   * Dipakai FE sebelum menampilkan modal passphrase:
   * - bsre_direct → tampilkan modal passphrase (alur lama)
   * - portal → langsung buat request & redirect ke Portal TTE (tanpa modal)
   * Cukup auth login — bukan data sensitif.
   */
  @Get('mode/:jenis')
  @HttpCode(HttpStatus.OK)
  async getTteMode(@Param('jenis') jenis: string) {
    const mode = await this.tteSigningGateway.getTteMode(jenis);
    return { mode };
  }

  /**
   * Callback dari halaman FE /tte/callback.
   * FE mengambil query code & state dari URL portal redirect, lalu POST ke sini.
   * BE validasi state (constant-time, one-time) lalu exchange code ke portal.
   */
  @Post('callback')
  @UseGuards(ThrottlerGuard)
  @Throttle({ sign: { limit: 10, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @RequirePermission('naskah-dinas', 'sign')
  async handleCallback(
    @Body() dto: TteCallbackDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tteSigningService.handleCallback({
      code: dto.code,
      state: dto.state,
      user,
    });
  }

  @Get('naskah/:idNaskah/pending')
  @HttpCode(HttpStatus.OK)
  async getPendingCorrespondence(
    @Param('idNaskah', ParseUUIDPipe) idNaskah: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tteSigningService.getPendingCorrespondence(
      idNaskah,
      user.persnum,
      user.position,
    );
  }

  /**
   * Status transaksi signing (rekonsiliasi otomatis ke portal bila belum
   * terminal). Dipakai FE untuk polling.
   */
  @Get('transactions/:transactionId')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('naskah-dinas', 'read-detail')
  async getTransactionStatus(
    @Param() params: TteStatusParamsDto,
    @CurrentUser() user: JwtPayload,
  ) {
    const transaction = await this.tteSigningService.getTransactionStatus(
      params.transactionId,
      user.persnum,
    );
    return transaction;
  }
}
