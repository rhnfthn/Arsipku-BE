import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigSearch, SearchEngineMode } from '../entities/config-search.entity';
import { UpdateSearchConfigDto } from '../dto/update-search-config.dto';

@Injectable()
export class ConfigSearchService {
  private readonly logger = new Logger(ConfigSearchService.name);

  // In-memory cache untuk performa (mode jarang berubah)
  private cachedMode: SearchEngineMode | null = null;
  private cacheExpiry: number = 0;
  private readonly CACHE_TTL = 60 * 1000; // 1 menit

  constructor(
    @InjectRepository(ConfigSearch)
    private readonly configSearchRepository: Repository<ConfigSearch>,
  ) {}

  /**
   * Ambil konfigurasi search (single row). Buat default jika belum ada.
   */
  async getConfig(): Promise<ConfigSearch> {
    // TypeORM 0.3.x: findOne wajib punya `where` (boleh kosong) — tanpa `where`
    // melempar "You must provide selection conditions in order to find a single row."
    let config = await this.configSearchRepository.findOne({
      where: {},
      order: { createdAt: 'ASC' },
    });

    if (!config) {
      config = this.configSearchRepository.create({
        mode: SearchEngineMode.V3,
        meiliEnabled: false,
      });
      config = await this.configSearchRepository.save(config);
    }

    return config;
  }

  /**
   * Ambil mode mesin pencarian aktif (dengan cache).
   */
  async getMode(): Promise<SearchEngineMode> {
    const now = Date.now();
    if (this.cachedMode && this.cacheExpiry > now) {
      return this.cachedMode;
    }

    const config = await this.getConfig();
    this.cachedMode = config.mode;
    this.cacheExpiry = now + this.CACHE_TTL;
    return config.mode;
  }

  /**
   * Update konfigurasi search.
   * Jika mode di-set ke 'meili', otomatis meiliEnabled = true.
   */
  async update(dto: UpdateSearchConfigDto): Promise<ConfigSearch> {
    const config = await this.getConfig();

    if (dto.mode !== undefined) {
      config.mode = dto.mode;
      // Mode meili mengimplikasikan meiliEnabled = true
      if (dto.mode === SearchEngineMode.MEILI) {
        config.meiliEnabled = true;
      }
    }

    if (dto.meili_enabled !== undefined) {
      config.meiliEnabled = dto.meili_enabled;
      // Jika meili dimatikan, kembalikan mode ke v3
      if (!dto.meili_enabled) {
        config.mode = SearchEngineMode.V3;
      }
    }

    const saved = await this.configSearchRepository.save(config);

    // Invalidate cache
    this.cacheExpiry = 0;
    this.cachedMode = null;

    return saved;
  }

  /**
   * Init default config jika belum ada (dipanggil saat module init).
   */
  async initDefaults(): Promise<void> {
    try {
      await this.getConfig();
      this.logger.log('ConfigSearch default initialized');
    } catch (error) {
      this.logger.warn(
        'Could not initialize default search config:',
        error instanceof Error ? error.message : String(error),
      );
    }
  }
}
