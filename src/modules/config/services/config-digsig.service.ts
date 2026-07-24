import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigDigsig, JenisNaskah, TtdMode } from '../entities';
import { UpdateDigsigConfigDto } from '../dto';

@Injectable()
export class ConfigDigsigService {
  // In-memory cache untuk performa
  private cache: Map<JenisNaskah, TtdMode[]> = new Map(); // computed dari 3 kolom boolean
  private cacheExpiry: number = 0;
  private readonly CACHE_TTL = 60 * 60 * 1000; // 1 jam

  constructor(
    @InjectRepository(ConfigDigsig)
    private readonly configDigsigRepository: Repository<ConfigDigsig>,
  ) {}

  /**
   * Mengambil semua konfigurasi digsig
   */
  async findAll(): Promise<ConfigDigsig[]> {
    return this.configDigsigRepository.find({
      order: { jenisNaskah: 'ASC' },
    });
  }

  /**
   * Mengambil konfigurasi berdasarkan jenis naskah
   */
  async findByJenis(jenisNaskah: JenisNaskah): Promise<ConfigDigsig> {
    const config = await this.configDigsigRepository.findOne({
      where: { jenisNaskah },
    });

    if (!config) {
      throw new NotFoundException(
        `Konfigurasi untuk jenis ${jenisNaskah} tidak ditemukan`,
      );
    }

    return config;
  }

  /**
   * Ambil daftar mode TTE yang aktif untuk jenis naskah tertentu
   * Menggunakan cache untuk performa
   */
  async getModes(jenisNaskah: JenisNaskah): Promise<TtdMode[]> {
    const now = Date.now();

    // Jika cache masih valid, gunakan cache
    if (this.cacheExpiry > now && this.cache.has(jenisNaskah)) {
      return this.cache.get(jenisNaskah)!;
    }

    // Refresh cache
    await this.refreshCache();

    // Return dari cache, default [digsig] jika tidak ada config
    return this.cache.get(jenisNaskah) ?? [TtdMode.DIGSIG];
  }

  /**
   * Refresh in-memory cache
   */
  private async refreshCache(): Promise<void> {
    const configs = await this.configDigsigRepository.find();

    this.cache.clear();
    configs.forEach((config) => {
      const modes: TtdMode[] = [];
      if (config.digsig) modes.push(TtdMode.DIGSIG);
      if (config.ttdQr) modes.push(TtdMode.TTD_QR);
      if (config.ttdBasah) modes.push(TtdMode.TTD_BASAH);
      this.cache.set(
        config.jenisNaskah,
        modes.length > 0 ? modes : [TtdMode.DIGSIG],
      );
    });

    this.cacheExpiry = Date.now() + this.CACHE_TTL;
  }

  /**
   * Update konfigurasi digsig
   */
  async update(dto: UpdateDigsigConfigDto): Promise<ConfigDigsig> {
    let config = await this.configDigsigRepository.findOne({
      where: { jenisNaskah: dto.jenis_naskah },
    });

    if (!config) {
      // Create jika belum ada
      config = this.configDigsigRepository.create({
        jenisNaskah: dto.jenis_naskah,
        digsig: dto.digsig ?? true,
        ttdQr: dto.ttd_qr ?? false,
        ttdBasah: dto.ttd_basah ?? false,
        description: dto.description,
      });
    } else {
      // Update hanya field yang dikirim
      if (dto.digsig !== undefined) config.digsig = dto.digsig;
      if (dto.ttd_qr !== undefined) config.ttdQr = dto.ttd_qr;
      if (dto.ttd_basah !== undefined) config.ttdBasah = dto.ttd_basah;
      if (dto.description !== undefined) config.description = dto.description;
    }

    const saved = await this.configDigsigRepository.save(config);

    // Invalidate cache
    this.cacheExpiry = 0;

    return saved;
  }

  /**
   * Bulk update konfigurasi
   */
  async bulkUpdate(configs: UpdateDigsigConfigDto[]): Promise<ConfigDigsig[]> {
    const results: ConfigDigsig[] = [];

    for (const dto of configs) {
      const result = await this.update(dto);
      results.push(result);
    }

    return results;
  }

  /**
   * Toggle satu mode on/off. Minimal harus ada 1 mode aktif.
   */
  async toggle(jenisNaskah: JenisNaskah, mode: TtdMode): Promise<ConfigDigsig> {
    const config = await this.findByJenis(jenisNaskah);

    if (mode === TtdMode.DIGSIG) config.digsig = !config.digsig;
    else if (mode === TtdMode.TTD_QR) config.ttdQr = !config.ttdQr;
    else if (mode === TtdMode.TTD_BASAH) config.ttdBasah = !config.ttdBasah;

    // Pastikan minimal 1 mode aktif
    if (!config.digsig && !config.ttdQr && !config.ttdBasah) {
      config.digsig = true;
    }

    const saved = await this.configDigsigRepository.save(config);

    // Invalidate cache
    this.cacheExpiry = 0;

    return saved;
  }

  /**
   * Init default config jika belum ada
   */
  async initDefaults(): Promise<void> {
    const jenisNaskahList: JenisNaskah[] = [
      JenisNaskah.ND,
      JenisNaskah.SDI,
      JenisNaskah.SDE,
      JenisNaskah.DI,
      JenisNaskah.KA,
    ];

    const descriptions: Record<JenisNaskah, string> = {
      [JenisNaskah.ND]: 'Nota Dinas - default mode TTE elektronik',
      [JenisNaskah.SDI]: 'Surat Dinas Internal - default mode TTE elektronik',
      [JenisNaskah.SDE]: 'Surat Dinas Eksternal - default mode TTE elektronik',
      [JenisNaskah.DI]: 'Disposisi Internal - default mode TTE elektronik',
      [JenisNaskah.KA]: 'Kajian - default mode TTE elektronik',
    };

    for (const jenis of jenisNaskahList) {
      const existing = await this.configDigsigRepository.findOne({
        where: { jenisNaskah: jenis },
      });

      if (!existing) {
        await this.configDigsigRepository.save({
          jenisNaskah: jenis,
          digsig: true,
          ttdQr: false,
          ttdBasah: false,
          description: descriptions[jenis],
        });
      }
    }
  }
}
