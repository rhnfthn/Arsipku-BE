import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigMessage, MessageType } from '../entities';
import { CreateMessageDto, UpdateMessageDto, ToggleBannerDto } from '../dto';

@Injectable()
export class ConfigMessageService {
  // In-memory cache untuk performa
  private cachedMessage: ConfigMessage | null = null;
  private cacheExpiry: number = 0;
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 menit

  constructor(
    @InjectRepository(ConfigMessage)
    private readonly configMessageRepository: Repository<ConfigMessage>,
  ) {}

  /**
   * Mengambil semua pesan
   */
  async findAll(): Promise<ConfigMessage[]> {
    return this.configMessageRepository.find({
      order: { updatedAt: 'DESC' },
    });
  }

  /**
   * Mengambil pesan berdasarkan ID
   */
  async findOne(id: string): Promise<ConfigMessage> {
    const message = await this.configMessageRepository.findOne({
      where: { id },
    });

    if (!message) {
      throw new NotFoundException(`Pesan dengan ID ${id} tidak ditemukan`);
    }

    return message;
  }

  /**
   * Mengambil pesan aktif yang ditampilkan (untuk public API)
   * Hanya return pesan yang show_banner = true
   */
  async getCurrentMessage(): Promise<ConfigMessage | null> {
    const now = Date.now();

    // Jika cache masih valid
    if (this.cacheExpiry > now && this.cachedMessage !== null) {
      return this.cachedMessage.showBanner ? this.cachedMessage : null;
    }

    // Refresh cache - ambil pesan terbaru dengan show_banner = true
    const message = await this.configMessageRepository.findOne({
      where: { showBanner: true },
      order: { updatedAt: 'DESC' },
    });

    this.cachedMessage = message ?? null;
    this.cacheExpiry = Date.now() + this.CACHE_TTL;

    return message ?? null;
  }

  /**
   * Membuat pesan baru
   */
  async create(dto: CreateMessageDto): Promise<ConfigMessage> {
    const message = this.configMessageRepository.create({
      title: dto.title,
      message: dto.message,
      type: dto.type ?? MessageType.INFO,
      showBanner: dto.show_banner ?? false,
    });

    const saved = await this.configMessageRepository.save(message);

    // Invalidate cache
    this.invalidateCache();

    return saved;
  }

  /**
   * Update pesan
   */
  async update(id: string, dto: UpdateMessageDto): Promise<ConfigMessage> {
    const message = await this.findOne(id);

    if (dto.title !== undefined) {
      message.title = dto.title;
    }
    if (dto.message !== undefined) {
      message.message = dto.message;
    }
    if (dto.type !== undefined) {
      message.type = dto.type;
    }
    if (dto.show_banner !== undefined) {
      message.showBanner = dto.show_banner;
    }

    const saved = await this.configMessageRepository.save(message);

    // Invalidate cache
    this.invalidateCache();

    return saved;
  }

  /**
   * Toggle show_banner
   */
  async toggleBanner(id: string, dto: ToggleBannerDto): Promise<ConfigMessage> {
    const message = await this.findOne(id);
    message.showBanner = dto.show_banner;

    const saved = await this.configMessageRepository.save(message);

    // Invalidate cache
    this.invalidateCache();

    return saved;
  }

  /**
   * Show banner - set show_banner = true
   */
  async showBanner(id: string): Promise<ConfigMessage> {
    return this.toggleBanner(id, { show_banner: true });
  }

  /**
   * Hide banner - set show_banner = false
   */
  async hideBanner(id: string): Promise<ConfigMessage> {
    return this.toggleBanner(id, { show_banner: false });
  }

  /**
   * Hide all banners
   */
  async hideAllBanners(): Promise<void> {
    await this.configMessageRepository.update({}, { showBanner: false });
    this.invalidateCache();
  }

  /**
   * Delete pesan
   */
  async delete(id: string): Promise<{ message: string }> {
    const message = await this.findOne(id);
    await this.configMessageRepository.remove(message);

    this.invalidateCache();

    return { message: `Pesan dengan ID ${id} berhasil dihapus` };
  }

  /**
   * Invalidate cache
   */
  private invalidateCache(): void {
    this.cachedMessage = null;
    this.cacheExpiry = 0;
  }

  /**
   * Upsert - update jika ada, create jika tidak ada
   * Untuk simple use case dimana hanya ada 1 pesan
   */
  async upsert(dto: CreateMessageDto): Promise<ConfigMessage> {
    // Cari pesan pertama
    const existing = await this.configMessageRepository.findOne({
      order: { id: 'ASC' },
    });

    if (existing) {
      return this.update(existing.id, {
        title: dto.title,
        message: dto.message,
        type: dto.type,
        show_banner: dto.show_banner,
      });
    } else {
      return this.create(dto);
    }
  }
}
