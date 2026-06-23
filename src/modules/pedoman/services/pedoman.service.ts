import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { PedomanEntity } from '../entities/pedoman.entity';
import { CreatePedomanDto } from '../dto/create-pedoman.dto';
import { UpdatePedomanDto } from '../dto/update-pedoman.dto';
import { PedomanData, PedomanResponseDto } from '../dto/pedoman.dto';
import { StorageService } from '../../storage/services/storage.service';

@Injectable()
export class PedomanService {
  constructor(
    @InjectRepository(PedomanEntity)
    private readonly pedomanRepository: Repository<PedomanEntity>,
    private readonly storageService: StorageService,
  ) {}

  private toPedomanData(pedoman: PedomanEntity): PedomanData {
    return {
      id: pedoman.id,
      judul: pedoman.judul,
      deskripsi: pedoman.deskripsi,
      jenis: pedoman.jenis,
      nomorDokumen: pedoman.nomorDokumen,
      tanggalBerlaku: pedoman.tanggalBerlaku,
      fileUrl: pedoman.fileUrl,
      lampiranUrl: pedoman.lampiranUrl,
      lampiranName: pedoman.lampiranName,
      isActive: pedoman.isActive,
      created_at: pedoman.createdAt,
      updated_at: pedoman.updatedAt,
    };
  }

  /**
   * Get semua pedoman, dengan optional filter jenis dan search.
   * Default hanya mengembalikan pedoman yang aktif (isActive = true).
   * @param jenis - filter berdasarkan jenis dokumen (opsional)
   * @param search - kata kunci pencarian pada judul dan deskripsi (opsional)
   * @param includeInactive - jika true, tampilkan juga pedoman yang tidak aktif (opsional, default false)
   */
  async findAll(
    jenis?: string,
    search?: string,
    includeInactive?: boolean,
  ): Promise<PedomanResponseDto> {
    const qb = this.pedomanRepository.createQueryBuilder('pedoman');

    if (!includeInactive) {
      qb.andWhere('pedoman.isActive = :isActive', { isActive: true });
    }

    if (jenis) {
      qb.andWhere('pedoman.jenis = :jenis', { jenis });
    }

    if (search) {
      qb.andWhere(
        '(pedoman.judul LIKE :search OR pedoman.deskripsi LIKE :search)',
        { search: `%${search}%` },
      );
    }

    qb.orderBy('pedoman.tanggalBerlaku', 'DESC').addOrderBy(
      'pedoman.createdAt',
      'DESC',
    );

    const pedomanList = await qb.getMany();

    return {
      success: true,
      message: 'Data pedoman berhasil diambil',
      data: pedomanList.map((p) => this.toPedomanData(p)),
    };
  }

  /**
   * Get pedoman berdasarkan ID
   */
  async findOne(id: string): Promise<PedomanResponseDto> {
    const pedoman = await this.pedomanRepository.findOne({ where: { id } });
    if (!pedoman) {
      throw new NotFoundException(`Pedoman dengan ID ${id} tidak ditemukan`);
    }

    return {
      success: true,
      message: 'Data pedoman berhasil diambil',
      data: this.toPedomanData(pedoman),
    };
  }

  /**
   * Buat pedoman baru (khusus super admin)
   */
  async create(dto: CreatePedomanDto): Promise<PedomanResponseDto> {
    const pedoman = this.pedomanRepository.create({
      id: uuidv4(),
      judul: dto.judul,
      deskripsi: dto.deskripsi,
      jenis: dto.jenis,
      nomorDokumen: dto.nomorDokumen,
      tanggalBerlaku: new Date(dto.tanggalBerlaku),
      fileUrl: dto.fileUrl,
      lampiranUrl: dto.lampiranUrl,
      lampiranName: dto.lampiranName,
      isActive: dto.isActive ?? true,
    } as any);

    const saved = await this.pedomanRepository.save(pedoman);
    const singleSaved = Array.isArray(saved) ? saved[0] : saved;

    return {
      success: true,
      message: 'Pedoman berhasil dibuat',
      data: this.toPedomanData(singleSaved),
    };
  }

  /**
   * Update pedoman berdasarkan ID (khusus super admin)
   */
  async update(id: string, dto: UpdatePedomanDto): Promise<PedomanResponseDto> {
    const pedoman = await this.pedomanRepository.findOne({ where: { id } });
    if (!pedoman) {
      throw new NotFoundException(`Pedoman dengan ID ${id} tidak ditemukan`);
    }

    if (dto.judul !== undefined) pedoman.judul = dto.judul;
    if (dto.deskripsi !== undefined) pedoman.deskripsi = dto.deskripsi;
    if (dto.jenis !== undefined) pedoman.jenis = dto.jenis;
    if (dto.nomorDokumen !== undefined) pedoman.nomorDokumen = dto.nomorDokumen;
    if (dto.tanggalBerlaku !== undefined) {
      pedoman.tanggalBerlaku = new Date(dto.tanggalBerlaku);
    }
    if (dto.fileUrl !== undefined) pedoman.fileUrl = dto.fileUrl;
    if (dto.lampiranUrl !== undefined) {
      // Hapus lampiran lama dari MinIO jika diganti
      if (pedoman.lampiranUrl && pedoman.lampiranUrl !== dto.lampiranUrl) {
        try {
          await this.storageService.deleteFile(pedoman.lampiranUrl);
        } catch (err) {
          console.error('Failed to delete old lampiran from storage:', err.message);
        }
      }
      pedoman.lampiranUrl = dto.lampiranUrl;
    }
    if (dto.lampiranName !== undefined) pedoman.lampiranName = dto.lampiranName;
    if (dto.isActive !== undefined) pedoman.isActive = dto.isActive;

    const updated = await this.pedomanRepository.save(pedoman);
    const singleUpdated = Array.isArray(updated) ? updated[0] : updated;

    return {
      success: true,
      message: 'Pedoman berhasil diperbarui',
      data: this.toPedomanData(singleUpdated),
    };
  }

  /**
   * Hapus pedoman berdasarkan ID (khusus super admin)
   * Juga menghapus file lampiran dari MinIO jika ada
   */
  async remove(id: string): Promise<PedomanResponseDto> {
    const pedoman = await this.pedomanRepository.findOne({ where: { id } });
    if (!pedoman) {
      throw new NotFoundException(`Pedoman dengan ID ${id} tidak ditemukan`);
    }

    // Hapus lampiran dari MinIO jika ada
    if (pedoman.lampiranUrl) {
      try {
        await this.storageService.deleteFile(pedoman.lampiranUrl);
      } catch (err) {
        console.error('Failed to delete lampiran from storage:', err.message);
      }
    }

    const data = this.toPedomanData(pedoman);
    await this.pedomanRepository.remove(pedoman);

    return {
      success: true,
      message: 'Pedoman berhasil dihapus',
      data,
    };
  }

  /**
   * Upload lampiran file ke MinIO
   * Menggunakan uploadBuffer untuk mendukung berbagai tipe file (image, pdf, dll)
   * @param file - File yang diupload (image/pdf/etc)
   * @returns { lampiranUrl, lampiranName, previewUrl }
   */
  async uploadLampiran(file: Express.Multer.File): Promise<{
    lampiranUrl: string;
    lampiranName: string;
    previewUrl: string;
  }> {
    const uploadResult = await this.storageService.uploadBuffer(
      file.buffer,
      file.originalname,
      file.mimetype,
      'pedoman/lampiran',
    );

    return {
      lampiranUrl: uploadResult.key,
      lampiranName: file.originalname,
      previewUrl: uploadResult.key,
    };
  }

  /**
   * Mendapatkan signed URL untuk preview file lampiran
   * @param key - Key file di MinIO
   */
  async getLampiranPreviewUrl(key: string): Promise<string> {
    return await this.storageService.getPreviewUrl(key);
  }
}