import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { TemplateEntity } from '../entities/template.entity';
import { TemplateDto } from '../dto/template-response.dto';
import { CreateTemplateDto } from '../dto/create-template.dto';
import { UpdateTemplateDto } from '../dto/update-template.dto';
import { StorageService } from '../../storage/services/storage.service';

@Injectable()
export class TemplateService {
  constructor(
    @InjectRepository(TemplateEntity)
    private readonly templateRepository: Repository<TemplateEntity>,
    private readonly storageService: StorageService,
  ) {}

  /**
   * Create template dengan upload file
   * Mendukung 2 cara:
   * 1. Multipart form-data (file parameter)
   * 2. Raw JSON dengan base64 (dto.file_base64, dto.file_name, dto.file_mimetype)
   */
  async create(
    dto: CreateTemplateDto,
    file?: Express.Multer.File,
  ): Promise<TemplateEntity> {
    let fileKey: string | null = null;

    if (file) {
      // Upload via multipart form-data
      const uploadResult = await this.storageService.uploadFile(
        file,
        'templates',
      );
      fileKey = uploadResult.key;
    } else if (dto.file_base64 && dto.file_name) {
      // Upload via JSON dengan base64
      const buffer = Buffer.from(dto.file_base64, 'base64');
      const mimetype = dto.file_mimetype || 'application/octet-stream';
      const uploadResult = await this.storageService.uploadBuffer(
        buffer,
        dto.file_name,
        mimetype,
        'templates',
      );
      fileKey = uploadResult.key;
    }

    const template = this.templateRepository.create({
      id: uuidv4(),
      nama_template: dto.nama_template,
      file: fileKey,
    });

    return await this.templateRepository.save(template);
  }

  /**
   * Convert entity to DTO dengan signed URL dari storage
   */
  async toDto(entity: TemplateEntity): Promise<TemplateDto> {
    // Generate signed URL untuk file
    let fileUrl: string | undefined;
    if (entity.file) {
      try {
        fileUrl = await this.storageService.getFileUrl(entity.file);
      } catch (error) {
        console.warn(
          `Failed to get signed URL for ${entity.file}:`,
          error.message,
        );
      }
    }

    return {
      id: entity.id,
      nama_template: entity.nama_template,
      file: entity.file,
      file_url: fileUrl,
      create_at: entity.create_at ? entity.create_at.toISOString() : undefined,
      update_at: entity.update_at ? entity.update_at.toISOString() : undefined,
    };
  }

  async toDtoList(entities: TemplateEntity[]): Promise<TemplateDto[]> {
    const results: TemplateDto[] = [];
    for (const e of entities) {
      results.push(await this.toDto(e));
    }
    return results;
  }

  async findAll(name?: string): Promise<TemplateEntity[]> {
    const q = this.templateRepository.createQueryBuilder('t');
    if (name) q.where('t.nama_template LIKE :name', { name: `%${name}%` });
    return await q.orderBy('t.create_at', 'DESC').getMany();
  }

  async findOne(id: string): Promise<TemplateEntity> {
    const t = await this.templateRepository.findOne({ where: { id } });
    if (!t) throw new NotFoundException(`Template ${id} not found`);
    return t;
  }

  /**
   * Update template dengan optional upload file baru
   * Mendukung 2 cara:
   * 1. Multipart form-data (file parameter)
   * 2. Raw JSON dengan base64 (dto.file_base64, dto.file_name, dto.file_mimetype)
   */
  async update(
    id: string,
    dto: UpdateTemplateDto,
    file?: Express.Multer.File,
  ): Promise<TemplateEntity> {
    const t = await this.findOne(id);
    const oldFileKey = t.file;

    // Jika ada file upload baru via multipart
    if (file) {
      const uploadResult = await this.storageService.uploadFile(
        file,
        'templates',
      );
      t.file = uploadResult.key;

      // Hapus file lama dari storage
      if (oldFileKey) {
        try {
          await this.storageService.deleteFile(oldFileKey);
        } catch (error) {
          console.warn(
            `Failed to delete old file ${oldFileKey}:`,
            error.message,
          );
        }
      }
    } else if (dto.file_base64 && dto.file_name) {
      // Upload via JSON dengan base64
      const buffer = Buffer.from(dto.file_base64, 'base64');
      const mimetype = dto.file_mimetype || 'application/octet-stream';
      const uploadResult = await this.storageService.uploadBuffer(
        buffer,
        dto.file_name,
        mimetype,
        'templates',
      );
      t.file = uploadResult.key;

      // Hapus file lama dari storage
      if (oldFileKey) {
        try {
          await this.storageService.deleteFile(oldFileKey);
        } catch (error) {
          console.warn(
            `Failed to delete old file ${oldFileKey}:`,
            error.message,
          );
        }
      }
    }

    // Update nama template
    if (dto.nama_template !== undefined) {
      t.nama_template = dto.nama_template;
    }

    return await this.templateRepository.save(t);
  }

  /**
   * Remove template dan hapus file dari storage
   */
  async remove(id: string): Promise<void> {
    const t = await this.findOne(id);

    // Hapus file dari storage
    if (t.file) {
      try {
        await this.storageService.deleteFile(t.file);
      } catch (error) {
        console.warn(`Failed to delete file ${t.file}:`, error.message);
      }
    }

    await this.templateRepository.remove(t);
  }
}
