import { Controller, Get, Param, UseGuards, UseInterceptors } from '@nestjs/common';
import { CacheInterceptor, CacheTTL } from '@nestjs/cache-manager';
import {
  ConfigDigsigService,
  ConfigMessageService,
  ConfigNaskahLainnyaService,
} from '../services';
import { ConfigDigsig, ConfigMessage, ConfigNaskahLainnya, JenisNaskah } from '../entities';
import { JwtAuthGuard } from '../../../common/guards';
import { Public, RequirePermission } from '../../../common/decorators';

/**
 * Public Controller untuk config yang bisa diakses user biasa
 * Endpoint: /config
 */
@Controller('config')
export class ConfigController {
  constructor(
    private readonly configDigsigService: ConfigDigsigService,
    private readonly configMessageService: ConfigMessageService,
    private readonly configNaskahLainnyaService: ConfigNaskahLainnyaService,
  ) {}

  /**
   * GET /config/message
   * Mengambil semua pesan banner aktif (public, no auth required)
   * Returns array kosong jika tidak ada banner aktif
   */
  @Get('message')
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(300_000)
  @Public()
  async getCurrentMessage(): Promise<ConfigMessage[]> {
    return this.configMessageService.getCurrentMessage();
  }

  /**
   * GET /config/digsig
   * Mengambil semua konfigurasi digsig (dengan auth)
   */
  @Get('digsig')
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(300_000)
  @UseGuards(JwtAuthGuard)
  @RequirePermission('konfigurasi', 'read')
  async getAllDigsigConfig(): Promise<ConfigDigsig[]> {
    return this.configDigsigService.findAll();
  }

  /**
   * GET /config/digsig/:jenis
   * Ambil konfigurasi mode TTE untuk jenis tertentu (dengan auth)
   */
  @Get('digsig/:jenis')
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(300_000)
  @UseGuards(JwtAuthGuard)
  @RequirePermission('konfigurasi', 'read')
  async getDigsigConfig(
    @Param('jenis') jenis: JenisNaskah,
  ): Promise<ConfigDigsig> {
    return this.configDigsigService.findByJenis(jenis);
  }

  /**
   * GET /config/naskah-lainnya/:jenis
   * Default (Legal Drafting Ya/Tidak + klasifikasi) untuk form tulis naskah
   * lainnya. Cukup auth login — bukan data sensitif; dipakai pemrakarsa biasa.
  */
  @Get('naskah-lainnya/:jenis')
  @UseGuards(JwtAuthGuard)
  async getNaskahLainnyaConfig(
    @Param('jenis') jenis: string,
  ): Promise<ConfigNaskahLainnya> {
    return this.configNaskahLainnyaService.findByJenis(jenis.toUpperCase());
  }
}
