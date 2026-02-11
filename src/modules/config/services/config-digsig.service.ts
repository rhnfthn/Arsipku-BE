import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigDigsig, JenisNaskah } from '../entities';
import { UpdateDigsigConfigDto } from '../dto';

@Injectable()
export class ConfigDigsigService {
  // In-memory cache untuk performa
  private cache: Map<JenisNaskah, boolean> = new Map();
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
      throw new NotFoundException(`Konfigurasi untuk jenis ${jenisNaskah} tidak ditemukan`);
    }

    return config;
  }

  /**
   * Cek apakah digsig enabled untuk jenis naskah tertentu
   * Menggunakan cache untuk performa
   */
  async isDigsigEnabled(jenisNaskah: JenisNaskah): Promise<boolean> {
    const now = Date.now();

    // Jika cache masih valid, gunakan cache
    if (this.cacheExpiry > now && this.cache.has(jenisNaskah)) {
      return this.cache.get(jenisNaskah)!;
    }

    // Refresh cache
    await this.refreshCache();

    // Return dari cache, default true jika tidak ada config
    return this.cache.get(jenisNaskah) ?? true;
  }

  /**
   * Refresh in-memory cache
   */
  private async refreshCache(): Promise<void> {
    const configs = await this.configDigsigRepository.find();
    
    this.cache.clear();
    configs.forEach(config => {
      this.cache.set(config.jenisNaskah, config.enabled);
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
        enabled: dto.enabled,
        description: dto.description,
      });
    } else {
      // Update jika sudah ada
      config.enabled = dto.enabled;
      if (dto.description !== undefined) {
        config.description = dto.description;
      }
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
   * Toggle enabled status
   */
  async toggle(jenisNaskah: JenisNaskah): Promise<ConfigDigsig> {
    const config = await this.findByJenis(jenisNaskah);
    config.enabled = !config.enabled;

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
      [JenisNaskah.ND]: 'Nota Dinas - TTE tersedia',
      [JenisNaskah.SDI]: 'Surat Dinas Internal - TTE tersedia',
      [JenisNaskah.SDE]: 'Surat Dinas Eksternal - TTE tersedia',
      [JenisNaskah.DI]: 'Disposisi Internal - TTE tersedia',
      [JenisNaskah.KA]: 'Kajian - TTE tersedia',
    };

    for (const jenis of jenisNaskahList) {
      const existing = await this.configDigsigRepository.findOne({
        where: { jenisNaskah: jenis },
      });

      if (!existing) {
        await this.configDigsigRepository.save({
          jenisNaskah: jenis,
          enabled: true,
          description: descriptions[jenis],
        });
      }
    }
  }
}
