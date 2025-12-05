import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { TemplateEntity } from './entities/template.entity';
import { TemplateDto } from './dto/template-response.dto';
import { CreateTemplateDto } from './dto/create-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';
import { StorageService } from '../storage/storage.service';

@Injectable()
export class TemplateService {
  constructor(
    @InjectRepository(TemplateEntity)
    private readonly templateRepository: Repository<TemplateEntity>,
    private readonly storageService: StorageService,
  ) {}

  /**
   * Create template dengan upload file ke MinIO
   * Mendukung 2 cara:
   * 1. Multipart form-data (file parameter)
   * 2. Raw JSON dengan base64 (dto.file_base64, dto.file_name, dto.file_mimetype)
   */
  async create(dto: CreateTemplateDto, file?: Express.Multer.File): Promise<TemplateEntity> {
    let fileKey: string;

    if (file) {
      // Upload via multipart form-data
      const uploadResult = await this.storageService.uploadFile(file, 'templates');
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
    } else {
      throw new BadRequestException('File template harus diupload (via multipart atau base64)');
    }

    const now = new Date();
    const template = this.templateRepository.create({
      id: uuidv4(),
      tanggal: dto.tanggal ? new Date(dto.tanggal) : now,
      nama_template: dto.nama_template,
      file: fileKey,
    });

    return await this.templateRepository.save(template);
  }

  /**
   * Convert entity to DTO dengan signed URL dari MinIO
   */
  async toDto(entity: TemplateEntity): Promise<TemplateDto> {
    function formatDate(val: any): string | null {
      if (val === null || val === undefined) return null;
      if (val instanceof Date && !isNaN(val.getTime())) return val.toISOString().split('T')[0];
      if (typeof val === 'string') {
        const s = val.split('T')[0].split(' ')[0];
        return s;
      }
      const d = new Date(val);
      if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
      return null;
    }

    // Generate signed URL untuk file
    let fileUrl: string | undefined;
    if (entity.file) {
      try {
        fileUrl = await this.storageService.getFileUrl(entity.file);
      } catch (error) {
        console.warn(`Failed to get signed URL for ${entity.file}:`, error.message);
      }
    }

    return {
      id: entity.id,
      tanggal: formatDate(entity.tanggal),
      nama_template: entity.nama_template,
      file: entity.file,
      file_url: fileUrl, // Signed URL dari MinIO
      create_at: entity.create_at ? entity.create_at.toISOString() : undefined,
      update_at: entity.update_at ? entity.update_at.toISOString() : undefined,
    } as TemplateDto;
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
   * Update template dengan optional upload file baru ke MinIO
   * Mendukung 2 cara:
   * 1. Multipart form-data (file parameter)
   * 2. Raw JSON dengan base64 (dto.file_base64, dto.file_name, dto.file_mimetype)
   */
  async update(id: string, dto: UpdateTemplateDto, file?: Express.Multer.File): Promise<TemplateEntity> {
    const t = await this.findOne(id);
    const oldFileKey = t.file;

    // Jika ada file upload baru via multipart
    if (file) {
      const uploadResult = await this.storageService.uploadFile(file, 'templates');
      t.file = uploadResult.key;

      // Hapus file lama dari MinIO
      if (oldFileKey) {
        try {
          await this.storageService.deleteFile(oldFileKey);
        } catch (error) {
          console.warn(`Failed to delete old file ${oldFileKey}:`, error.message);
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

      // Hapus file lama dari MinIO
      if (oldFileKey) {
        try {
          await this.storageService.deleteFile(oldFileKey);
        } catch (error) {
          console.warn(`Failed to delete old file ${oldFileKey}:`, error.message);
        }
      }
    }
    // Jika tidak ada file baru, file lama tetap dipertahankan

    // Update field lainnya
    if (dto.nama_template !== undefined) {
      t.nama_template = dto.nama_template;
    }

    // Update tanggal
    if (dto.tanggal === undefined) {
      t.tanggal = new Date();
    } else if (dto.tanggal) {
      t.tanggal = new Date(dto.tanggal);
    }

    return await this.templateRepository.save(t);
  }

  /**
   * Remove template dan hapus file dari MinIO
   */
  async remove(id: string): Promise<void> {
    const t = await this.findOne(id);
    
    // Hapus file dari MinIO
    if (t.file) {
      try {
        await this.storageService.deleteFile(t.file);
      } catch (error) {
        console.warn(`Failed to delete file ${t.file}:`, error.message);
      }
    }

    await this.templateRepository.remove(t);
  }

  async toggleAktif(id: string): Promise<TemplateEntity> {
    // No 'aktif' column in the template table; toggle not applicable
    const t = await this.findOne(id);
    return t;
  }
}
