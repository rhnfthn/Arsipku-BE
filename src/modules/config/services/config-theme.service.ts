import { Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StorageService } from '../../storage/services/storage.service';
import { ConfigTheme } from '../entities/config-theme.entity';
import { ConfigThemeTemplate } from '../entities/config-theme-template.entity';

export type ThemeBackgroundTarget = 'landing' | 'dashboard';

export interface ThemeConfigResponse {
  landingBackgroundUrl: string | null;
  dashboardBackgroundUrl: string | null;
  updatedAt: Date | null;
}

export interface ThemeTemplateResponse {
  id: string;
  target: ThemeBackgroundTarget;
  name: string;
  storageKey: string;
  url: string;
  isSystem: boolean;
  createdAt: Date;
}

export interface ThemeAdminConfigResponse extends ThemeConfigResponse {
  templates: ThemeTemplateResponse[];
  activeTemplateIds: Record<ThemeBackgroundTarget, string | null>;
}

@Injectable()
export class ConfigThemeService {
  private readonly logger = new Logger(ConfigThemeService.name);

  constructor(
    @InjectRepository(ConfigTheme)
    private readonly repository: Repository<ConfigTheme>,
    @InjectRepository(ConfigThemeTemplate)
    private readonly templateRepository: Repository<ConfigThemeTemplate>,
    private readonly storageService: StorageService,
  ) {}

  private async getConfig(): Promise<ConfigTheme> {
    let config = await this.repository.findOne({
      where: {},
      order: { createdAt: 'ASC' },
    });

    if (!config) {
      config = this.repository.create({
        landingBackgroundKey: null,
        dashboardBackgroundKey: null,
        updatedBy: null,
      });
      config = await this.repository.save(config);
    }

    return config;
  }

  async getPublicConfig(): Promise<ThemeConfigResponse> {
    const config = await this.getConfig();
    await this.ensureSystemTemplates();
    await this.ensureInitialSystemTheme(config);
    const [landingBackgroundUrl, dashboardBackgroundUrl] = await Promise.all([
      this.getUrl(config.landingBackgroundKey),
      this.getUrl(config.dashboardBackgroundKey),
    ]);

    return {
      landingBackgroundUrl,
      dashboardBackgroundUrl,
      updatedAt: config.updatedAt ?? null,
    };
  }

  async getAdminConfig(): Promise<ThemeAdminConfigResponse> {
    const config = await this.getConfig();
    await this.ensureSystemTemplates();
    await this.ensureInitialSystemTheme(config);
    await this.ensureLegacyTemplates(config);
    await this.syncMinioTemplates();
    const templates = await this.templateRepository.find({
      where: { target: 'dashboard' },
      order: { isSystem: 'DESC', createdAt: 'ASC' },
    });
    const templateResponses = await Promise.all(templates.map((template) => this.toTemplateResponse(template)));
    const activeTemplateIds = {
      landing: this.findActiveTemplateId(templateResponses, 'landing', config.landingBackgroundKey),
      dashboard: this.findActiveTemplateId(templateResponses, 'dashboard', config.dashboardBackgroundKey),
    };

    return {
      ...(await this.getPublicConfig()),
      templates: templateResponses,
      activeTemplateIds,
    };
  }

  async replaceBackground(
    target: ThemeBackgroundTarget,
    file: Express.Multer.File,
    updatedBy: number,
  ): Promise<ThemeConfigResponse> {
    const config = await this.getConfig();
    const field = this.getField(target);
    let upload;
    try {
      upload = await this.storageService.uploadFile(file, 'tema');
    } catch (error) {
      this.logger.error(
        `Upload template tema gagal: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new ServiceUnavailableException(
        'Penyimpanan gambar tema tidak dapat dijangkau. Periksa koneksi MinIO atau gunakan template yang sudah tersedia.',
      );
    }

    const template = await this.templateRepository.save(
      this.templateRepository.create({
        target,
        name: file.originalname,
        storageKey: upload.key,
        isSystem: false,
        createdBy: updatedBy,
      }),
    );

    config[field] = template.storageKey;
    config.updatedBy = updatedBy;
    await this.repository.save(config);

    return this.getAdminConfig();
  }

  async resetBackground(
    target: ThemeBackgroundTarget,
    updatedBy: number,
  ): Promise<ThemeConfigResponse> {
    const config = await this.getConfig();
    const field = this.getField(target);
    config[field] = null;
    config.updatedBy = updatedBy;
    await this.repository.save(config);

    return this.getAdminConfig();
  }

  async activateTemplate(
    templateId: string,
    updatedBy: number,
  ): Promise<ThemeAdminConfigResponse> {
    const template = await this.templateRepository.findOne({ where: { id: templateId } });
    if (!template) throw new NotFoundException('Template tema tidak ditemukan.');

    const config = await this.getConfig();
    const field = this.getField(template.target);
    config[field] = template.storageKey;
    config.updatedBy = updatedBy;
    await this.repository.save(config);
    return this.getAdminConfig();
  }

  private getField(
    target: ThemeBackgroundTarget,
  ): 'landingBackgroundKey' | 'dashboardBackgroundKey' {
    return target === 'landing' ? 'landingBackgroundKey' : 'dashboardBackgroundKey';
  }

  private async getUrl(key: string | null): Promise<string | null> {
    if (!key) return null;
    return this.storageService.getFileUrl(key, 24 * 60 * 60);
  }

  private async ensureSystemTemplates(): Promise<void> {
    const systemKey = 'tema/HARI_BAKTI_ATC.png';
    for (const target of ['landing', 'dashboard'] as ThemeBackgroundTarget[]) {
      const exists = await this.templateRepository.findOne({
        where: { target, storageKey: systemKey },
      });
      if (!exists) {
        await this.templateRepository.save(
          this.templateRepository.create({
            target,
            name: 'HARI BAKTI ATC',
            storageKey: systemKey,
            isSystem: true,
            createdBy: null,
          }),
        );
      }
    }
  }

  private async ensureInitialSystemTheme(config: ConfigTheme): Promise<void> {
    if (config.updatedBy !== null || config.landingBackgroundKey || config.dashboardBackgroundKey) {
      return;
    }

    config.landingBackgroundKey = 'tema/HARI_BAKTI_ATC.png';
    config.dashboardBackgroundKey = 'tema/HARI_BAKTI_ATC.png';
    await this.repository.save(config);
  }

  private async ensureLegacyTemplates(config: ConfigTheme): Promise<void> {
    for (const [target, storageKey] of [
      ['landing', config.landingBackgroundKey],
      ['dashboard', config.dashboardBackgroundKey],
    ] as const) {
      if (!storageKey) continue;
      const exists = await this.templateRepository.findOne({ where: { target, storageKey } });
      if (!exists) {
        await this.templateRepository.save(
          this.templateRepository.create({
            target,
            name: 'Template tersimpan sebelumnya',
            storageKey,
            isSystem: false,
            createdBy: config.updatedBy,
          }),
        );
      }
    }
  }

  /** Sinkronkan seluruh gambar pada bucket arsipku dengan prefix tema/. */
  private async syncMinioTemplates(): Promise<void> {
    try {
      const keys = await this.storageService.listAllFiles('tema/');
      const imageKeys = keys.filter((key) => /\.(jpe?g|png|webp|gif)$/i.test(key));

      for (const storageKey of imageKeys) {
        const exists = await this.templateRepository.findOne({
          where: { target: 'dashboard', storageKey },
        });
        if (exists) continue;

        await this.templateRepository.save(
          this.templateRepository.create({
            target: 'dashboard',
            name: storageKey.split('/').pop() || storageKey,
            storageKey,
            isSystem: storageKey === 'tema/HARI_BAKTI_ATC.png',
            createdBy: null,
          }),
        );
      }
    } catch (error) {
      // Daftar template yang sudah tersimpan tetap dapat digunakan ketika
      // MinIO sedang tidak terjangkau dari backend lokal.
      this.logger.warn(
        `Gagal mengambil daftar gambar MinIO tema/: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async toTemplateResponse(template: ConfigThemeTemplate): Promise<ThemeTemplateResponse> {
    return {
      id: template.id,
      target: template.target,
      name: template.name,
      storageKey: template.storageKey,
      url: (await this.getUrl(template.storageKey)) as string,
      isSystem: template.isSystem,
      createdAt: template.createdAt,
    };
  }

  private findActiveTemplateId(
    templates: ThemeTemplateResponse[],
    target: ThemeBackgroundTarget,
    storageKey: string | null,
  ): string | null {
    if (!storageKey) return null;
    return templates.find((template) => template.target === target && template.storageKey === storageKey)?.id ?? null;
  }
}
