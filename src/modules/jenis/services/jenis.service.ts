import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { JenisEntity } from '../../nomor/entities/jenis.entity';
import { JenisResponseDto, JenisData } from '../dto/jenis.dto';
import { CreateJenisDto } from '../dto/create-jenis.dto';
import { UpdateJenisDto } from '../dto/update-jenis.dto';
import { StorageService } from '../../storage/services/storage.service';

@Injectable()
export class JenisService {
  constructor(
    @InjectRepository(JenisEntity)
    private readonly jenisRepository: Repository<JenisEntity>,
    private readonly storageService: StorageService,
  ) {}

  /**
   * Get semua jenis surat
   */
  async findAll(): Promise<JenisResponseDto> {
    const jenis = await this.jenisRepository.find({
      order: { jenisText: 'ASC' },
    });

    const data: JenisData[] = jenis.map((j) => ({
      id: j.id,
      jenis: j.jenis,
      jenis_text: j.jenisText,
      format_penomoran: j.formatPenomoran,
    }));

    return {
      success: true,
      message: 'Data jenis surat berhasil diambil',
      data,
    };
  }

  /**
   * Get jenis by ID
   */
  async findOne(id: string): Promise<JenisEntity> {
    const jenis = await this.jenisRepository.findOne({ where: { id } });
    if (!jenis) {
      throw new NotFoundException(`Jenis dengan ID ${id} tidak ditemukan`);
    }
    return jenis;
  }

  /**
   * Get jenis by code
   */
  async findByCode(code: string): Promise<JenisEntity> {
    const jenis = await this.jenisRepository.findOne({ where: { jenis: code } });
    if (!jenis) {
      throw new NotFoundException(`Jenis dengan kode ${code} tidak ditemukan`);
    }
    return jenis;
  }

  /**
   * Create jenis baru dengan optional file upload
   */
  async create(dto: CreateJenisDto, file?: Express.Multer.File): Promise<JenisEntity> {
    // Check if jenis code already exists
    const existing = await this.jenisRepository.findOne({
      where: { jenis: dto.jenis },
    });

    if (existing) {
      throw new BadRequestException(`Jenis dengan kode ${dto.jenis} sudah ada`);
    }

    let fileName: string | null = null;

    // Upload file to storage if provided
    if (file) {
      const uploadResult = await this.storageService.uploadFile(file, 'jenis');
      fileName = uploadResult.key;
    }

    const jenis = this.jenisRepository.create({
      id: dto.id || uuidv4(),
      jenis: dto.jenis,
      jenisText: dto.jenis_text,
      fileName: fileName,
      fileText: dto.file_text || null,
      formatPenomoran: dto.format_penomoran || null,
    });

    return await this.jenisRepository.save(jenis);
  }

  /**
   * Update jenis dengan optional file upload
   */
  async update(id: string, dto: UpdateJenisDto, file?: Express.Multer.File): Promise<JenisEntity> {
    const jenis = await this.findOne(id);
    const oldFileName = jenis.fileName;

    // Check if new jenis code already exists (if being changed)
    if (dto.jenis && dto.jenis !== jenis.jenis) {
      const existing = await this.jenisRepository.findOne({
        where: { jenis: dto.jenis },
      });
      if (existing) {
        throw new BadRequestException(`Jenis dengan kode ${dto.jenis} sudah ada`);
      }
    }

    // Upload new file if provided
    if (file) {
      const uploadResult = await this.storageService.uploadFile(file, 'jenis');
      jenis.fileName = uploadResult.key;

      // Delete old file from storage
      if (oldFileName) {
        try {
          await this.storageService.deleteFile(oldFileName);
        } catch (error) {
          console.warn(`Failed to delete old file ${oldFileName}:`, error.message);
        }
      }
    }

    // Manually assign fields
    if (dto.jenis !== undefined) jenis.jenis = dto.jenis;
    if (dto.jenis_text !== undefined) jenis.jenisText = dto.jenis_text;
    if (dto.file_text !== undefined) jenis.fileText = dto.file_text;
    if (dto.format_penomoran !== undefined) jenis.formatPenomoran = dto.format_penomoran;

    return await this.jenisRepository.save(jenis);
  }

  /**
   * Delete jenis dan file terkait dari storage
   */
  async remove(id: string): Promise<{ message: string }> {
    const jenis = await this.findOne(id);
    
    // Delete file from storage if exists
    if (jenis.fileName) {
      try {
        await this.storageService.deleteFile(jenis.fileName);
      } catch (error) {
        console.warn(`Failed to delete file ${jenis.fileName}:`, error.message);
      }
    }

    await this.jenisRepository.remove(jenis);
    return { message: `Jenis ${jenis.jenisText} berhasil dihapus` };
  }

  /**
   * Get file URL with signed URL from storage
   */
  async getFileUrl(fileName: string): Promise<string | null> {
    if (!fileName) return null;
    try {
      return await this.storageService.getFileUrl(fileName);
    } catch (error) {
      console.warn(`Failed to get signed URL for ${fileName}:`, error.message);
      return null;
    }
  }
}
