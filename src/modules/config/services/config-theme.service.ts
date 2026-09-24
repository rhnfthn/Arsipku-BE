import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Not, Repository } from 'typeorm';
import { StorageService } from '../../storage/services/storage.service';
import { RealtimeEmitService } from '../../realtime/services/realtime-emit.service';
import { ConfigTheme } from '../entities/config-theme.entity';
import { ConfigThemeSetting } from '../entities/config-theme-setting.entity';
import {
  CreateConfigThemeDto,
  UpdateConfigThemeDto,
} from '../dto/config-theme.dto';

export type ConfigThemeView = Omit<ConfigTheme, 'generateId'> & {
  imageUrl: string;
  source: 'manual' | 'scheduled';
};

export type ConfigThemeAsset = {
  key: string;
  name: string;
  imageUrl: string;
};

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

@Injectable()
export class ConfigThemeService {
  constructor(
    @InjectRepository(ConfigTheme)
    private readonly themeRepository: Repository<ConfigTheme>,
    @InjectRepository(ConfigThemeSetting)
    private readonly settingRepository: Repository<ConfigThemeSetting>,
    private readonly dataSource: DataSource,
    private readonly storageService: StorageService,
    private readonly realtimeEmitService: RealtimeEmitService,
  ) {}

  private slugify(name: string): string {
    const slug = name
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
    if (!slug) throw new BadRequestException('Nama tema tidak valid.');
    return slug;
  }

  private validateImage(
    file?: Express.Multer.File,
  ): asserts file is Express.Multer.File {
    if (!file) throw new BadRequestException('Gambar tema PNG wajib diunggah.');
    if (
      file.mimetype !== 'image/png' ||
      !file.originalname.toLowerCase().endsWith('.png')
    ) {
      throw new BadRequestException('Gambar tema harus berformat PNG.');
    }
    if (file.size > 5 * 1024 * 1024) {
      throw new BadRequestException('Ukuran gambar tema maksimal 5 MB.');
    }
    if (
      file.buffer.length < PNG_SIGNATURE.length ||
      !file.buffer.subarray(0, 8).equals(PNG_SIGNATURE)
    ) {
      throw new BadRequestException('Isi file bukan gambar PNG yang valid.');
    }
  }

  private validateThemeAssetKey(key?: string): string | null {
    if (!key) return null;
    const normalized = key.trim();
    if (
      !normalized.startsWith('tema/') ||
      normalized.includes('..') ||
      !normalized.toLowerCase().endsWith('.png') ||
      normalized.split('/').length !== 2
    ) {
      throw new BadRequestException('Gambar tema yang dipilih tidak valid.');
    }
    return normalized;
  }

  private normalizeDates(dto: CreateConfigThemeDto | UpdateConfigThemeDto) {
    const startDate = dto.start_date || null;
    const endDate = dto.end_date || startDate;
    if (!startDate && dto.end_date) {
      throw new BadRequestException(
        'Tanggal mulai wajib diisi jika tanggal selesai diisi.',
      );
    }
    if (startDate && endDate && !dto.repeat_yearly && endDate < startDate) {
      throw new BadRequestException(
        'Tanggal selesai tidak boleh sebelum tanggal mulai.',
      );
    }
    return { startDate, endDate };
  }

  private jakartaDate(now = new Date()): string {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Jakarta',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now);
    const get = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((part) => part.type === type)?.value ?? '';
    return `${get('year')}-${get('month')}-${get('day')}`;
  }

  private matchesSchedule(theme: ConfigTheme, today: string): boolean {
    if (!theme.startDate) return false;
    const endDate = theme.endDate || theme.startDate;
    if (!theme.repeatYearly)
      return theme.startDate <= today && today <= endDate;

    const day = today.slice(5);
    const start = theme.startDate.slice(5);
    const end = endDate.slice(5);
    return start <= end
      ? start <= day && day <= end
      : day >= start || day <= end;
  }

  private async toView(
    theme: ConfigTheme,
    source: 'manual' | 'scheduled',
  ): Promise<ConfigThemeView> {
    return {
      ...theme,
      imageUrl: await this.storageService.getPreviewUrl(theme.imageKey, 86400),
      source,
    };
  }

  private async getSetting(): Promise<ConfigThemeSetting> {
    const existing = await this.settingRepository.findOne({
      where: { id: 'global' },
    });
    if (existing) return existing;
    return this.settingRepository.save(
      this.settingRepository.create({ id: 'global', forceDefault: false }),
    );
  }

  async getDefaultStatus(): Promise<{ active: boolean }> {
    const setting = await this.getSetting();
    return { active: setting.forceDefault };
  }

  async findAll(): Promise<ConfigThemeView[]> {
    const themes = await this.themeRepository.find({
      order: {
        manualOverride: 'DESC',
        priority: 'DESC',
        startDate: 'ASC',
        name: 'ASC',
      },
    });
    return Promise.all(
      themes.map((theme) =>
        this.toView(theme, theme.manualOverride ? 'manual' : 'scheduled'),
      ),
    );
  }

  async listAssets(): Promise<ConfigThemeAsset[]> {
    const keys = await this.storageService.listFiles('tema/', 1000);
    const assets = keys
      .filter((key) => key.toLowerCase().endsWith('.png'))
      .sort((a, b) => a.localeCompare(b, 'id'));
    return Promise.all(
      assets.map(async (key) => ({
        key,
        name: key.slice('tema/'.length).replace(/\.png$/i, ''),
        imageUrl: await this.storageService.getPreviewUrl(key, 3600),
      })),
    );
  }

  async findOne(id: string): Promise<ConfigTheme> {
    const theme = await this.themeRepository.findOne({ where: { id } });
    if (!theme) throw new NotFoundException('Tema tidak ditemukan.');
    return theme;
  }

  async getCurrent(now = new Date()): Promise<ConfigThemeView | null> {
    const setting = await this.getSetting();
    if (setting.forceDefault) return null;

    const manual = await this.themeRepository.findOne({
      where: { manualOverride: true, isEnabled: true },
      order: { updatedAt: 'DESC' },
    });
    if (manual) return this.toView(manual, 'manual');

    const today = this.jakartaDate(now);
    const scheduled = (
      await this.themeRepository.find({ where: { isEnabled: true } })
    )
      .filter((theme) => this.matchesSchedule(theme, today))
      .sort(
        (a, b) =>
          b.priority - a.priority ||
          b.startDate!.localeCompare(a.startDate!) ||
          b.updatedAt.getTime() - a.updatedAt.getTime(),
      )[0];
    return scheduled ? this.toView(scheduled, 'scheduled') : null;
  }

  async create(
    dto: CreateConfigThemeDto,
    file?: Express.Multer.File,
  ): Promise<ConfigThemeView> {
    const selectedImageKey = this.validateThemeAssetKey(dto.image_key);
    if (!file && !selectedImageKey) {
      throw new BadRequestException(
        'Unggah gambar PNG atau pilih gambar tema yang sudah tersedia.',
      );
    }
    if (
      selectedImageKey &&
      !file &&
      !(await this.storageService.fileExists(selectedImageKey))
    ) {
      throw new NotFoundException(
        'Gambar tema yang dipilih tidak ditemukan di MinIO.',
      );
    }
    const name = dto.name.trim();
    const slug = this.slugify(name);
    const existing = await this.themeRepository.findOne({
      where: [{ name }, { slug }],
    });
    if (existing) throw new ConflictException('Nama tema sudah digunakan.');
    const { startDate, endDate } = this.normalizeDates(dto);
    const imageKey = selectedImageKey || `tema/${slug}.png`;

    if (file) {
      this.validateImage(file);
      await this.storageService.uploadFileWithCustomKey(file, imageKey);
    }
    try {
      const saved = await this.themeRepository.save(
        this.themeRepository.create({
          name,
          slug,
          imageKey,
          imageManaged: !selectedImageKey,
          description: dto.description?.trim() || null,
          startDate,
          endDate,
          repeatYearly: dto.repeat_yearly ?? false,
          isEnabled: dto.is_enabled ?? true,
          manualOverride: null,
          priority: dto.priority ?? 0,
          textPosition: dto.text_position ?? 'center-left',
          textTone: dto.text_tone ?? 'light',
          overlayStrength: dto.overlay_strength ?? 45,
          backgroundWidth: dto.background_width ?? 100,
          backgroundHeight: dto.background_height ?? 100,
          bannerWidth: dto.banner_width ?? 100,
          bannerHeight: dto.banner_height ?? 256,
          navigationAccentColor: dto.navigation_accent_color ?? '#D3E3FD',
        }),
      );
      await this.emitCurrentTheme();
      return this.toView(saved, 'scheduled');
    } catch (error) {
      if (file) {
        await this.storageService.deleteFile(imageKey).catch(() => undefined);
      }
      throw error;
    }
  }

  async update(
    id: string,
    dto: UpdateConfigThemeDto,
    file?: Express.Multer.File,
  ): Promise<ConfigThemeView> {
    const theme = await this.findOne(id);
    const name = dto.name.trim();
    const duplicate = await this.themeRepository.findOne({
      where: { name, id: Not(id) },
    });
    if (duplicate) throw new ConflictException('Nama tema sudah digunakan.');
    const { startDate, endDate } = this.normalizeDates(dto);
    const selectedImageKey = this.validateThemeAssetKey(dto.image_key);

    if (file) {
      this.validateImage(file);
      await this.storageService.uploadFileWithCustomKey(file, theme.imageKey);
      theme.imageManaged = true;
    } else if (selectedImageKey) {
      if (!(await this.storageService.fileExists(selectedImageKey))) {
        throw new NotFoundException(
          'Gambar tema yang dipilih tidak ditemukan di MinIO.',
        );
      }
      theme.imageKey = selectedImageKey;
      theme.imageManaged = false;
    }

    theme.name = name;
    theme.description = dto.description?.trim() || null;
    theme.startDate = startDate;
    theme.endDate = endDate;
    theme.repeatYearly = dto.repeat_yearly ?? false;
    theme.isEnabled = dto.is_enabled ?? true;
    theme.priority = dto.priority ?? 0;
    theme.textPosition = dto.text_position ?? 'center-left';
    theme.textTone = dto.text_tone ?? 'light';
    theme.overlayStrength = dto.overlay_strength ?? 45;
    theme.backgroundWidth = dto.background_width ?? 100;
    theme.backgroundHeight = dto.background_height ?? 100;
    theme.bannerWidth = dto.banner_width ?? 100;
    theme.bannerHeight = dto.banner_height ?? 256;
    theme.navigationAccentColor = dto.navigation_accent_color ?? '#D3E3FD';
    if (!theme.isEnabled) theme.manualOverride = null;
    const saved = await this.themeRepository.save(theme);
    await this.emitCurrentTheme();
    return this.toView(saved, saved.manualOverride ? 'manual' : 'scheduled');
  }

  async setManual(id: string, active: boolean): Promise<ConfigThemeView> {
    const theme = await this.findOne(id);
    if (active && !theme.isEnabled) {
      throw new BadRequestException(
        'Aktifkan tema sebelum menjadikannya tema manual.',
      );
    }

    if (active) await this.getSetting();

    await this.dataSource.transaction(async (manager) => {
      await manager
        .createQueryBuilder()
        .update(ConfigTheme)
        .set({ manualOverride: null })
        .where('manual_override = :active', { active: 1 })
        .execute();
      if (active) {
        await manager.update(
          ConfigThemeSetting,
          { id: 'global' },
          { forceDefault: false },
        );
        await manager.update(ConfigTheme, { id }, { manualOverride: true });
      }
    });

    const saved = await this.findOne(id);
    await this.emitCurrentTheme();
    return this.toView(saved, active ? 'manual' : 'scheduled');
  }

  async setDefault(active: boolean): Promise<{ active: boolean }> {
    await this.getSetting();
    await this.dataSource.transaction(async (manager) => {
      await manager.update(
        ConfigThemeSetting,
        { id: 'global' },
        { forceDefault: active },
      );
      if (active) {
        await manager
          .createQueryBuilder()
          .update(ConfigTheme)
          .set({ manualOverride: null })
          .where('manual_override = :manual', { manual: 1 })
          .execute();
      }
    });
    await this.emitCurrentTheme();
    return { active };
  }

  async delete(id: string): Promise<void> {
    const theme = await this.findOne(id);
    await this.themeRepository.remove(theme);
    if (theme.imageManaged) {
      await this.storageService
        .deleteFile(theme.imageKey)
        .catch(() => undefined);
    }
    await this.emitCurrentTheme();
  }

  private async emitCurrentTheme(): Promise<void> {
    const current = await this.getCurrent().catch(() => null);
    this.realtimeEmitService.emitSystemTheme(current);
  }

  @Cron('5 0 0 * * *', { timeZone: 'Asia/Jakarta' })
  async broadcastScheduledTheme(): Promise<void> {
    await this.emitCurrentTheme();
  }
}
