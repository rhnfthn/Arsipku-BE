import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { PedomanEntity } from '../entities/pedoman.entity';
import { CreatePedomanDto } from '../dto/create-pedoman.dto';
import { UpdatePedomanDto } from '../dto/update-pedoman.dto';
import { PedomanData, PedomanResponseDto, LampiranItem } from '../dto/pedoman.dto';
import { StorageService } from '../../storage/services/storage.service';

@Injectable()
export class PedomanService {
  private readonly logger = new Logger(PedomanService.name);

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
      lampirans: pedoman.lampirans,
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
      lampirans: dto.lampirans,
      isActive: true,
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
    if (dto.lampirans !== undefined) {
      // Hapus file lampiran lama yang tidak ada di daftar baru dari MinIO
      const oldLampirans = pedoman.lampirans || [];
      const newUrls = (dto.lampirans || []).map((l) => l.url);
      for (const oldLampiran of oldLampirans) {
        if (!newUrls.includes(oldLampiran.url)) {
          try {
            await this.storageService.deleteFile(oldLampiran.url);
            this.logger.log(`🗑️ File lampiran lama dihapus dari MinIO: ${oldLampiran.url}`);
          } catch (err: any) {
            this.logger.warn(`⚠️ Gagal menghapus file lampiran lama: ${oldLampiran.url} - ${err.message}`);
          }
        }
      }
      pedoman.lampirans = dto.lampirans;
    }
    // isActive selalu true — semua pedoman tampil ke semua user

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
   * Hard delete dari database + hapus semua file lampiran dari MinIO object storage.
   */
  async remove(id: string): Promise<PedomanResponseDto> {
    const pedoman = await this.pedomanRepository.findOne({ where: { id } });
    if (!pedoman) {
      throw new NotFoundException(`Pedoman dengan ID ${id} tidak ditemukan`);
    }

    const data = this.toPedomanData(pedoman);

    // Hapus semua file lampiran dari MinIO object storage
    if (pedoman.lampirans && pedoman.lampirans.length > 0) {
      for (const lampiran of pedoman.lampirans) {
        try {
          await this.storageService.deleteFile(lampiran.url);
          this.logger.log(`🗑️ File lampiran dihapus dari MinIO: ${lampiran.url}`);
        } catch (err: any) {
          this.logger.warn(`⚠️ Gagal menghapus file lampiran dari MinIO: ${lampiran.url} - ${err.message}`);
        }
      }
    }

    // Hard delete dari database
    await this.pedomanRepository.remove(pedoman);

    return {
      success: true,
      message: 'Pedoman berhasil dihapus',
      data,
    };
  }
}