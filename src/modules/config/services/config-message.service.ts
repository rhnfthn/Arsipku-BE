import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigMessage, MessageType } from '../entities';
import { CreateMessageDto, UpdateMessageDto, ToggleBannerDto } from '../dto';
import { OrgDataService } from '../../master-data/org_data/org_data.service';
import { NotificationService } from '../../notification/services';
import { NotificationType } from '../../notification/entities';

@Injectable()
export class ConfigMessageService {
  constructor(
    @InjectRepository(ConfigMessage)
    private readonly configMessageRepository: Repository<ConfigMessage>,
    private readonly orgDataService: OrgDataService,
    private readonly notificationService: NotificationService,
  ) {}

  private async notifySystemMessage(message: ConfigMessage) {
    if (!message.showBanner) return;

    const latestOrg = await this.orgDataService.findLatestOrg();
    const positions = Array.isArray(latestOrg?.position_json)
      ? latestOrg.position_json
      : [];

    const recipients = new Map<
      string,
      { positionId: string; userPersnum?: number }
    >();
    for (const position of positions) {
      if (!position?.position) continue;
      const positionId = String(position.position);
      const persnum = Number(position.persnum_person);
      recipients.set(positionId, {
        positionId,
        userPersnum: Number.isFinite(persnum) ? persnum : undefined,
      });
    }

    await Promise.allSettled(
      Array.from(recipients.values()).map((recipient) =>
        this.notificationService.createNotification({
          positionId: recipient.positionId,
          userPersnum: recipient.userPersnum,
          type: NotificationType.SYSTEM,
          title: message.title,
          body: message.message,
          data: {
            action: 'OPEN_SYSTEM_ANNOUNCEMENT',
            messageId: message.id,
            messageType: message.type,
          },
        }),
      ),
    );
  }

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
   * Mengambil semua pesan aktif yang ditampilkan (untuk public API)
   * Return semua pesan yang show_banner = true
   */
  async getCurrentMessage(): Promise<ConfigMessage[]> {
    return this.configMessageRepository.find({
      where: { showBanner: true },
      order: { updatedAt: 'DESC' },
    });
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

    this.notifySystemMessage(saved).catch((error) =>
      console.warn(
        '[ConfigMessageService] Failed to send system notification:',
        error?.message,
      ),
    );

    return saved;
  }

  /**
   * Update pesan
   */
  async update(id: string, dto: UpdateMessageDto): Promise<ConfigMessage> {
    const message = await this.findOne(id);
    const wasHidden = !message.showBanner;

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

    if (saved.showBanner && (wasHidden || dto.show_banner === true)) {
      this.notifySystemMessage(saved).catch((error) =>
        console.warn(
          '[ConfigMessageService] Failed to send system notification:',
          error?.message,
        ),
      );
    }

    return saved;
  }

  /**
   * Toggle show_banner
   */
  async toggleBanner(id: string, dto: ToggleBannerDto): Promise<ConfigMessage> {
    const message = await this.findOne(id);
    const wasHidden = !message.showBanner;

    // Jika dto.show_banner undefined, toggle current state
    if (dto.show_banner !== undefined) {
      message.showBanner = dto.show_banner;
    } else {
      message.showBanner = !message.showBanner;
    }

    const saved = await this.configMessageRepository.save(message);

    if (saved.showBanner && wasHidden) {
      this.notifySystemMessage(saved).catch((error) =>
        console.warn(
          '[ConfigMessageService] Failed to send system notification:',
          error?.message,
        ),
      );
    }

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
  }

  /**
   * Delete pesan
   */
  async delete(id: string): Promise<{ message: string }> {
    const message = await this.findOne(id);
    await this.configMessageRepository.remove(message);

    return { message: `Pesan dengan ID ${id} berhasil dihapus` };
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
