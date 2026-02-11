import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ConfigDigsigService, ConfigMessageService } from '../services';
import { ConfigDigsig, ConfigMessage, JenisNaskah } from '../entities';
import { JwtAuthGuard } from '../../../common/guards';
import { Public } from '../../../common/decorators';

/**
 * Public Controller untuk config yang bisa diakses user biasa
 * Endpoint: /config
 */
@Controller('config')
export class ConfigController {
  constructor(
    private readonly configDigsigService: ConfigDigsigService,
    private readonly configMessageService: ConfigMessageService,
  ) {}

  /**
   * GET /config/message
   * Mengambil pesan banner aktif (public, no auth required)
   * Returns null jika tidak ada banner aktif
   */
  @Get('message')
  @Public()
  async getCurrentMessage(): Promise<ConfigMessage | null> {
    return this.configMessageService.getCurrentMessage();
  }

  /**
   * GET /config/digsig
   * Mengambil semua konfigurasi digsig (dengan auth)
   */
  @Get('digsig')
  @UseGuards(JwtAuthGuard)
  async getAllDigsigConfig(): Promise<ConfigDigsig[]> {
    return this.configDigsigService.findAll();
  }

  /**
   * GET /config/digsig/:jenis
   * Cek apakah digsig enabled untuk jenis tertentu (dengan auth)
   */
  @Get('digsig/:jenis')
  @UseGuards(JwtAuthGuard)
  async isDigsigEnabled(@Param('jenis') jenis: JenisNaskah): Promise<{ enabled: boolean }> {
    const enabled = await this.configDigsigService.isDigsigEnabled(jenis);
    return { enabled };
  }
}
