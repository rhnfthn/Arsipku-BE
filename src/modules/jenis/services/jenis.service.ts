import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
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
      where: { active: 1 },
      order: { jenisText: 'ASC' },
    });

    const data: JenisData[] = await Promise.all(
      jenis.map(async (j) => {
        const fileOriginalKey = j.fileOriginal || null;
        const fileRegexKey = j.fileRegex || null;

        const [fileOriginalUrl, fileRegexUrl, legacyFileUrl] =
          await Promise.all([
            fileOriginalKey ? this.getFileUrl(fileOriginalKey) : null,
            fileRegexKey ? this.getFileUrl(fileRegexKey) : null,
            j.fileName ? this.getFileUrl(j.fileName) : null,
          ]);

        return {
          id: j.id,
          jenis: j.jenis,
          jenis_text: j.jenisText,
          format_penomoran: j.formatPenomoran,
          file_name: j.fileName,
          file_url: legacyFileUrl || fileRegexUrl || fileOriginalUrl,
          file_text: j.fileText,
          file_original: fileOriginalKey,
          file_original_url: fileOriginalUrl,
          file_regex: fileRegexKey,
          file_regex_url: fileRegexUrl,
        };
      }),
    );

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
    const jenis = await this.jenisRepository.findOne({
      where: { jenis: code },
    });
    if (!jenis) {
      throw new NotFoundException(`Jenis dengan kode ${code} tidak ditemukan`);
    }
    return jenis;
  }

  /**
   * Create jenis baru dengan 2 file template:
   * - fileOriginal: disimpan ke templates/naskah-lainnya-original/{jenis}.docx
   * - fileRegex: disimpan ke templates/naskah-lainnya/{jenis}.docx
   */
  async create(
    dto: CreateJenisDto,
    files?: {
      fileOriginal?: Express.Multer.File;
      fileRegex?: Express.Multer.File;
      file?: Express.Multer.File;
    },
  ): Promise<JenisEntity> {
    const cleanCode = dto.jenis.trim().toUpperCase();

    // Check if jenis code already exists
    const existing = await this.jenisRepository.findOne({
      where: { jenis: cleanCode },
    });

    if (existing) {
      throw new BadRequestException(`Jenis dengan kode ${cleanCode} sudah ada`);
    }

    let fileOriginalKey: string | null = null;
    let fileRegexKey: string | null = null;
    let legacyFileName: string | null = null;

    // 1. Upload file original jika ada
    if (files?.fileOriginal) {
      const ext =
        files.fileOriginal.originalname.split('.').pop()?.toLowerCase() ||
        'docx';
      const customKey = `templates/naskah-lainnya-original/${cleanCode}.${ext}`;
      const uploadResult = await this.storageService.uploadFileWithCustomKey(
        files.fileOriginal,
        customKey,
      );
      fileOriginalKey = uploadResult.key;
    }

    // 2. Upload file regex jika ada
    if (files?.fileRegex) {
      const ext =
        files.fileRegex.originalname.split('.').pop()?.toLowerCase() || 'docx';
      const customKey = `templates/naskah-lainnya/${cleanCode}.${ext}`;
      const uploadResult = await this.storageService.uploadFileWithCustomKey(
        files.fileRegex,
        customKey,
      );
      fileRegexKey = uploadResult.key;
    }

    // Fallback single file upload legacy
    if (files?.file && !files?.fileRegex && !files?.fileOriginal) {
      const uploadResult = await this.storageService.uploadFile(
        files.file,
        'jenis',
      );
      legacyFileName = uploadResult.key;
    }

    const jenis = this.jenisRepository.create({
      id: dto.id || uuidv4(),
      jenis: cleanCode,
      jenisText: dto.jenis_text,
      fileName: legacyFileName || fileRegexKey || fileOriginalKey,
      fileText: dto.file_text || null,
      fileOriginal: fileOriginalKey,
      fileRegex: fileRegexKey,
      formatPenomoran: dto.format_penomoran || null,
    });

    return await this.jenisRepository.save(jenis);
  }

  /**
   * Update jenis dengan optional file upload (original & regex)
   */
  async update(
    id: string,
    dto: UpdateJenisDto,
    files?: {
      fileOriginal?: Express.Multer.File;
      fileRegex?: Express.Multer.File;
      file?: Express.Multer.File;
    },
  ): Promise<JenisEntity> {
    const jenis = await this.findOne(id);
    const targetCode = (dto.jenis || jenis.jenis || '')
      .trim()
      .toUpperCase();

    // Check if new jenis code already exists (if being changed)
    if (dto.jenis && targetCode !== (jenis.jenis || '').toUpperCase()) {
      const existing = await this.jenisRepository.findOne({
        where: { jenis: targetCode },
      });
      if (existing) {
        throw new BadRequestException(
          `Jenis dengan kode ${targetCode} sudah ada`,
        );
      }
    }

    // 1. Update file original jika diupload
    if (files?.fileOriginal) {
      const ext =
        files.fileOriginal.originalname.split('.').pop()?.toLowerCase() ||
        'docx';
      const customKey = `templates/naskah-lainnya-original/${targetCode}.${ext}`;
      const uploadResult = await this.storageService.uploadFileWithCustomKey(
        files.fileOriginal,
        customKey,
      );
      jenis.fileOriginal = uploadResult.key;
    }

    // 2. Update file regex jika diupload
    if (files?.fileRegex) {
      const ext =
        files.fileRegex.originalname.split('.').pop()?.toLowerCase() || 'docx';
      const customKey = `templates/naskah-lainnya/${targetCode}.${ext}`;
      const uploadResult = await this.storageService.uploadFileWithCustomKey(
        files.fileRegex,
        customKey,
      );
      jenis.fileRegex = uploadResult.key;
    }

    // Fallback legacy file
    if (files?.file && !files?.fileOriginal && !files?.fileRegex) {
      const uploadResult = await this.storageService.uploadFile(
        files.file,
        'jenis',
      );
      jenis.fileName = uploadResult.key;
    }

    // Manually assign fields
    if (dto.jenis !== undefined) jenis.jenis = targetCode;
    if (dto.jenis_text !== undefined) jenis.jenisText = dto.jenis_text;
    if (dto.file_text !== undefined) jenis.fileText = dto.file_text;
    if (dto.format_penomoran !== undefined)
      jenis.formatPenomoran = dto.format_penomoran;

    return await this.jenisRepository.save(jenis);
  }

  /**
   * Cek apakah jenis surat sudah digunakan pada naskah/surat
   */
  async checkUsage(id: string): Promise<{
    canDelete: boolean;
    reason?: string;
    details?: {
      naskahCount: number;
      konsepCount: number;
      configCount: number;
      nomorCount: number;
    };
  }> {
    const jenis = await this.findOne(id);
    const kodeJenis = jenis.jenis;
    const namaJenis = jenis.jenisText || jenis.jenis;

    let naskahCount = 0;
    let konsepCount = 0;
    let configCount = 0;
    let nomorCount = 0;

    if (kodeJenis) {
      // 1. Cek tabel naskah (Naskah Dinas, Naskah Keluar, Naskah Lainnya)
      try {
        const res = await this.jenisRepository.query(
          `SELECT COUNT(id) as cnt FROM naskah WHERE jenis = ?`,
          [kodeJenis],
        );
        naskahCount = Number(res[0]?.cnt || 0);
      } catch (err) {
        console.warn('Gagal cek naskah by jenis:', err.message);
      }

      // 2. Cek tabel konsep (draf alur workflow naskah)
      try {
        const resKonsep = await this.jenisRepository.query(
          `SELECT COUNT(id) as cnt FROM konsep WHERE jenis = ?`,
          [kodeJenis],
        );
        konsepCount = Number(resKonsep[0]?.cnt || 0);
      } catch (err) {
        console.warn('Gagal cek konsep by jenis:', err.message);
      }

      // 3. Cek konfigurasi naskah lainnya
      try {
        const resConfig = await this.jenisRepository.query(
          `SELECT COUNT(id) as cnt FROM config_naskah_lainnya WHERE jenis_naskah = ?`,
          [kodeJenis],
        );
        configCount = Number(resConfig[0]?.cnt || 0);
      } catch (err) {
        console.warn('Gagal cek config_naskah_lainnya by jenis:', err.message);
      }

      // 4. Cek registrasi/request penomoran
      try {
        const resNomor = await this.jenisRepository.query(
          `SELECT COUNT(id) as cnt FROM nomor_request WHERE jenis = ?`,
          [kodeJenis],
        );
        nomorCount = Number(resNomor[0]?.cnt || 0);
      } catch (err) {
        console.warn('Gagal cek nomor_request by jenis:', err.message);
      }
    }

    if (naskahCount > 0 || konsepCount > 0 || configCount > 0 || nomorCount > 0) {
      const parts: string[] = [];
      if (naskahCount > 0) parts.push(`${naskahCount} naskah (naskah dinas/keluar/naskah lainnya)`);
      if (konsepCount > 0) parts.push(`${konsepCount} alur konsep/persetujuan`);
      if (configCount > 0) parts.push(`${configCount} konfigurasi naskah`);
      if (nomorCount > 0) parts.push(`${nomorCount} registrasi penomoran surat`);

      return {
        canDelete: false,
        reason: `Jenis surat '${namaJenis}' (${kodeJenis}) sudah digunakan pada ${parts.join(', ')}. Data tidak dapat dihapus untuk menjaga keutuhan riwayat arsip dan tata naskah.`,
        details: { naskahCount, konsepCount, configCount, nomorCount },
      };
    }

    return {
      canDelete: true,
      details: { naskahCount: 0, konsepCount: 0, configCount: 0, nomorCount: 0 },
    };
  }

  /**
   * Soft delete jenis: set active = 0 agar tidak tampil dan tidak bisa dipilih lagi
   */
  async remove(id: string): Promise<{ message: string }> {
    const jenis = await this.findOne(id);
    jenis.active = 0;
    await this.jenisRepository.save(jenis);
    return { message: `Jenis ${jenis.jenisText || jenis.jenis} berhasil dihapus` };
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
