import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { FaqKategoriEntity } from '../entities/faq-kategori.entity';
import { CreateFaqKategoriDto } from '../dto/create-faq-kategori.dto';
import { UpdateFaqKategoriDto } from '../dto/update-faq-kategori.dto';
import { FaqKategoriData, FaqKategoriResponseDto } from '../dto/faq-kategori.dto';

@Injectable()
export class FaqKategoriService {
  constructor(
    @InjectRepository(FaqKategoriEntity)
    private readonly kategoriRepository: Repository<FaqKategoriEntity>,
  ) {}

  private toFaqKategoriData(kategori: FaqKategoriEntity): FaqKategoriData {
    return {
      id: kategori.id,
      nama: kategori.nama,
      deskripsi: kategori.deskripsi,
      created_at: kategori.createdAt,
      updated_at: kategori.updatedAt,
    };
  }

  /**
   * Get semua kategori FAQ
   */
  async findAll(): Promise<FaqKategoriResponseDto> {
    const categories = await this.kategoriRepository.find({
      order: { createdAt: 'DESC' },
    });

    return {
      success: true,
      message: 'Data kategori FAQ berhasil diambil',
      data: categories.map((cat) => this.toFaqKategoriData(cat)),
    };
  }

  /**
   * Get kategori berdasarkan ID
   */
  async findOne(id: string): Promise<FaqKategoriResponseDto> {
    const kategori = await this.kategoriRepository.findOne({ where: { id } });
    if (!kategori) {
      throw new NotFoundException(
        `Kategori FAQ dengan ID ${id} tidak ditemukan`,
      );
    }

    return {
      success: true,
      message: 'Data kategori FAQ berhasil diambil',
      data: this.toFaqKategoriData(kategori),
    };
  }

  /**
   * Buat kategori baru
   */
  async create(dto: CreateFaqKategoriDto): Promise<FaqKategoriResponseDto> {
    const existing = await this.kategoriRepository.findOne({
      where: { nama: dto.nama },
    });

    if (existing) {
      throw new ConflictException(`Kategori '${dto.nama}' sudah ada`);
    }

    const kategori = this.kategoriRepository.create({
      id: uuidv4(),
      nama: dto.nama,
      deskripsi: dto.deskripsi,
    });

    const saved = await this.kategoriRepository.save(kategori);

    return {
      success: true,
      message: 'Kategori FAQ berhasil dibuat',
      data: this.toFaqKategoriData(saved),
    };
  }

  /**
   * Update kategori berdasarkan ID
   */
  async update(
    id: string,
    dto: UpdateFaqKategoriDto,
  ): Promise<FaqKategoriResponseDto> {
    const kategori = await this.kategoriRepository.findOne({ where: { id } });
    if (!kategori) {
      throw new NotFoundException(
        `Kategori FAQ dengan ID ${id} tidak ditemukan`,
      );
    }

    // Check if new nama already exists
    if (dto.nama && dto.nama !== kategori.nama) {
      const existing = await this.kategoriRepository.findOne({
        where: { nama: dto.nama },
      });
      if (existing) {
        throw new ConflictException(`Kategori '${dto.nama}' sudah ada`);
      }
      kategori.nama = dto.nama;
    }

    if (dto.deskripsi !== undefined) {
      kategori.deskripsi = dto.deskripsi;
    }

    const updated = await this.kategoriRepository.save(kategori);

    return {
      success: true,
      message: 'Kategori FAQ berhasil diperbarui',
      data: this.toFaqKategoriData(updated),
    };
  }

  /**
   * Hapus kategori berdasarkan ID
   */
  async remove(id: string): Promise<FaqKategoriResponseDto> {
    const kategori = await this.kategoriRepository.findOne({ where: { id } });
    if (!kategori) {
      throw new NotFoundException(
        `Kategori FAQ dengan ID ${id} tidak ditemukan`,
      );
    }

    const data = this.toFaqKategoriData(kategori);
    await this.kategoriRepository.remove(kategori);

    return {
      success: true,
      message: 'Kategori FAQ berhasil dihapus',
      data,
    };
  }
}
