import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { FaqEntity, FaqKategori } from '../entities/faq.entity';
import { CreateFaqDto } from '../dto/create-faq.dto';
import { UpdateFaqDto } from '../dto/update-faq.dto';
import { FaqData, FaqResponseDto } from '../dto/faq.dto';

@Injectable()
export class FaqService {
  constructor(
    @InjectRepository(FaqEntity)
    private readonly faqRepository: Repository<FaqEntity>,
  ) {}

  private toFaqData(faq: FaqEntity): FaqData {
    return {
      id: faq.id,
      pertanyaan: faq.pertanyaan,
      deskripsi: faq.deskripsi,
      kategori: faq.kategori,
      puas: faq.puas,
      tidak_puas: faq.tidakPuas,
      created_at: faq.createdAt,
      updated_at: faq.updatedAt,
    };
  }

  /**
   * Get semua FAQ, dengan optional filter kategori
   * @param kategori - nilai string kategori (opsional)
   */
  async findAll(kategori?: string): Promise<FaqResponseDto> {
    const where: Partial<FaqEntity> = {};
    if (kategori) {
      where.kategori = kategori as FaqKategori;
    }

    const faqs = await this.faqRepository.find({
      where,
      order: { createdAt: 'DESC' },
    });

    return {
      success: true,
      message: kategori
        ? `Data FAQ kategori '${kategori}' berhasil diambil`
        : 'Data FAQ berhasil diambil',
      data: faqs.map(this.toFaqData),
    };
  }

  /**
   * Get FAQ berdasarkan ID
   */
  async findOne(id: string): Promise<FaqResponseDto> {
    const faq = await this.faqRepository.findOne({ where: { id } });
    if (!faq) {
      throw new NotFoundException(`FAQ dengan ID ${id} tidak ditemukan`);
    }

    return {
      success: true,
      message: 'Data FAQ berhasil diambil',
      data: this.toFaqData(faq),
    };
  }

  /**
   * Buat FAQ baru
   */
  async create(dto: CreateFaqDto): Promise<FaqResponseDto> {
    const faq = this.faqRepository.create({
      id: uuidv4(),
      pertanyaan: dto.pertanyaan,
      deskripsi: dto.deskripsi,
      kategori: dto.kategori,
      puas: 0,
      tidakPuas: 0,
    });

    const saved = await this.faqRepository.save(faq);

    return {
      success: true,
      message: 'FAQ berhasil dibuat',
      data: this.toFaqData(saved),
    };
  }

  /**
   * Update FAQ berdasarkan ID
   */
  async update(id: string, dto: UpdateFaqDto): Promise<FaqResponseDto> {
    const faq = await this.faqRepository.findOne({ where: { id } });
    if (!faq) {
      throw new NotFoundException(`FAQ dengan ID ${id} tidak ditemukan`);
    }

    if (dto.pertanyaan !== undefined) faq.pertanyaan = dto.pertanyaan;
    if (dto.deskripsi !== undefined) faq.deskripsi = dto.deskripsi;
    if (dto.kategori !== undefined) faq.kategori = dto.kategori;

    const updated = await this.faqRepository.save(faq);

    return {
      success: true,
      message: 'FAQ berhasil diperbarui',
      data: this.toFaqData(updated),
    };
  }

  /**
   * Hapus FAQ berdasarkan ID
   */
  async remove(id: string): Promise<FaqResponseDto> {
    const faq = await this.faqRepository.findOne({ where: { id } });
    if (!faq) {
      throw new NotFoundException(`FAQ dengan ID ${id} tidak ditemukan`);
    }

    const data = this.toFaqData(faq);
    await this.faqRepository.remove(faq);

    return {
      success: true,
      message: 'FAQ berhasil dihapus',
      data,
    };
  }

  /**
   * Increment counter puas
   */
  async incrementPuas(id: string): Promise<FaqResponseDto> {
    const faq = await this.faqRepository.findOne({ where: { id } });
    if (!faq) {
      throw new NotFoundException(`FAQ dengan ID ${id} tidak ditemukan`);
    }

    faq.puas += 1;
    const updated = await this.faqRepository.save(faq);

    return {
      success: true,
      message: 'Feedback puas berhasil dicatat',
      data: this.toFaqData(updated),
    };
  }

  /**
   * Increment counter tidak_puas
   */
  async incrementTidakPuas(id: string): Promise<FaqResponseDto> {
    const faq = await this.faqRepository.findOne({ where: { id } });
    if (!faq) {
      throw new NotFoundException(`FAQ dengan ID ${id} tidak ditemukan`);
    }

    faq.tidakPuas += 1;
    const updated = await this.faqRepository.save(faq);

    return {
      success: true,
      message: 'Feedback tidak puas berhasil dicatat',
      data: this.toFaqData(updated),
    };
  }

  /**
   * Get daftar kategori yang tersedia
   */
  getKategoriList(): { success: boolean; data: string[] } {
    return {
      success: true,
      data: Object.values(FaqKategori),
    };
  }
}
