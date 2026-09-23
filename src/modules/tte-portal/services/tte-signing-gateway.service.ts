import { Injectable, Logger } from '@nestjs/common';
import { ConfigDigsigService } from '../../config/services/config-digsig.service';
import {
  JenisNaskah,
  TteMode,
} from '../../config/entities/config-digsig.entity';

/**
 * Gateway penentu jalur TTE untuk mode digsig.
 *
 * Membaca konfigurasi admin (config_digsig.tte_mode) per jenis naskah:
 * - bsre_direct: alur existing — passphrase modal → BSrE v2 API langsung
 *   (hitDigsigEndpoint). Sinkron: hasil langsung tersedia.
 * - portal: alur baru — buat signing request di Portal TTE → redirect browser
 *   user ke signing_url → passphrase diinput di portal → callback → exchange.
 *   Asinkron: hasil tersedia setelah callback diproses.
 *
 * Fallback: bila config tidak ada/DB error → bsre_direct (perilaku lama,
 * tidak pernah gagal karena konfigurasi baru).
 */
@Injectable()
export class TteSigningGateway {
  private readonly logger = new Logger(TteSigningGateway.name);

  constructor(private readonly configDigsigService: ConfigDigsigService) {}

  /**
   * Ambil mode TTE untuk jenis naskah. Default bsre_direct bila config
   * tidak ditemukan (aman: perilaku existing tidak berubah).
   *
   * jenisNaskah bisa berupa:
   * - Jenis config langsung: ND, SDI, SDE, DI, KA, NU (naskah umum), NL (naskah lainnya)
   * - Jenis template naskah umum (UND, PER, KEP, dll) → dipetakan ke NU
   * - Jenis naskah lainnya (LPD, BV, dll) → dipetakan ke NL
   */
  async getTteMode(jenisNaskah: string): Promise<TteMode> {
    try {
      const normalized = jenisNaskah?.toUpperCase();
      const configJenis = this.mapToConfigJenis(normalized);
      if (!configJenis) {
        return TteMode.BSRE_DIRECT;
      }
      const config = await this.configDigsigService.findByJenis(
        configJenis as JenisNaskah,
      );
      return config?.tteMode ?? TteMode.BSRE_DIRECT;
    } catch {
      // Config belum ada / DB error — jangan gagalkan signing, pakai default
      return TteMode.BSRE_DIRECT;
    }
  }

  /**
   * Map jenis naskah runtime → jenis di config_digsig.
   * Naskah umum punya banyak jenis template (UND/PER/KEP/...) — semuanya
   * digabung ke config NL (keputusan admin 2026-09-22: hapus config NU,
   * naskah umum ikut konfigurasi Naskah Lainnya).
   */
  private mapToConfigJenis(jenis: string): string | null {
    const direct = ['ND', 'SDI', 'SDE', 'DI', 'KA', 'NL'];
    if (direct.includes(jenis)) return jenis;

    // Jenis template naskah umum (dari NASKAH_UMUM_TEMPLATES) → NL
    const nuTemplates = [
      'UND',
      'PER',
      'KEP',
      'INS',
      'SPR',
      'EDR',
      'SOP',
      'MOU',
      'PKS',
      'PROC',
      'PJJ',
      'LOA',
      'SKU',
      'BAC',
      'KET',
      'SPE',
      'RPT',
      'PEN',
      'PGM',
      'LAP',
      'K',
    ];
    if (nuTemplates.includes(jenis)) return 'NL';

    return null;
  }

  /** True bila jenis naskah harus lewat Portal TTE (redirect) */
  async isPortalMode(jenisNaskah: string): Promise<boolean> {
    return (await this.getTteMode(jenisNaskah)) === TteMode.PORTAL;
  }
}
