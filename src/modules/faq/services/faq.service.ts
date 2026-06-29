import { ConflictException, Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { FaqEntity } from '../entities/faq.entity';
import { FaqVoteEntity, FaqVoteType } from '../entities/faq-vote.entity';
import { FaqKategoriEntity } from '../entities/faq-kategori.entity';
import { CreateFaqDto } from '../dto/create-faq.dto';
import { UpdateFaqDto } from '../dto/update-faq.dto';
import { FaqData, FaqResponseDto } from '../dto/faq.dto';
import { StorageService } from '../../storage/services/storage.service';

@Injectable()
export class FaqService {
  private readonly logger = new Logger(FaqService.name);

  constructor(
    @InjectRepository(FaqEntity)
    private readonly faqRepository: Repository<FaqEntity>,
    @InjectRepository(FaqVoteEntity)
    private readonly faqVoteRepository: Repository<FaqVoteEntity>,
    @InjectRepository(FaqKategoriEntity)
    private readonly kategoriRepository: Repository<FaqKategoriEntity>,
    private readonly storageService: StorageService,
  ) {}

  private toFaqData(faq: FaqEntity, userVote?: string | null): FaqData {
    return {
      id: faq.id,
      pertanyaan: faq.pertanyaan,
      deskripsi: faq.deskripsi,
      kategoriId: faq.kategoriId,
      kategoriNama: faq.kategoriEntity?.nama || '',
      puas: faq.puas,
      tidak_puas: faq.tidakPuas,
      fileUrl: faq.fileUrl,
      lampirans: faq.lampirans,
      userVote: userVote ?? null,
      created_at: faq.createdAt,
      updated_at: faq.updatedAt,
    };
  }

  /**
   * Get semua FAQ, dengan optional filter kategori dan search.
   * Jika userId diberikan, sertakan status vote user tersebut untuk setiap FAQ.
   * @param kategoriId - ID kategori FAQ (opsional)
   * @param search - kata kunci pencarian pada pertanyaan dan deskripsi (opsional)
   * @param userId - ID user untuk mengecek status vote (opsional)
   */
  async findAll(
    kategoriId?: string,
    search?: string,
    userId?: string,
  ): Promise<FaqResponseDto> {
    const qb = this.faqRepository
      .createQueryBuilder('faq')
      .leftJoinAndSelect('faq.kategoriEntity', 'kategori');

    if (kategoriId) {
      qb.andWhere('faq.kategoriId = :kategoriId', { kategoriId });
    }

    if (search) {
      qb.andWhere(
        '(faq.pertanyaan LIKE :search OR faq.deskripsi LIKE :search)',
        { search: `%${search}%` },
      );
    }

    qb.orderBy('faq.createdAt', 'DESC');

    const faqs = await qb.getMany();

    // Ambil status vote user untuk semua FAQ yang di-fetch (batch query)
    const userVotesMap = new Map<string, string>();
    if (userId && faqs.length > 0) {
      const faqIds = faqs.map((f) => f.id);
      const votes = await this.faqVoteRepository
        .createQueryBuilder('vote')
        .where('vote.faqId IN (:...faqIds)', { faqIds })
        .andWhere('vote.userId = :userId', { userId })
        .getMany();
      for (const vote of votes) {
        userVotesMap.set(vote.faqId, vote.voteType);
      }
    }

    return {
      success: true,
      message: kategoriId
        ? `Data FAQ berhasil diambil`
        : 'Data FAQ berhasil diambil',
      data: faqs.map((faq) =>
        this.toFaqData(faq, userVotesMap.get(faq.id)),
      ),
    };
  }

  /**
   * Get FAQ berdasarkan ID.
   * Jika userId diberikan, sertakan status vote user tersebut.
   */
  async findOne(id: string, userId?: string): Promise<FaqResponseDto> {
    const faq = await this.faqRepository.findOne({
      where: { id },
      relations: ['kategoriEntity'],
    });
    if (!faq) {
      throw new NotFoundException(`FAQ dengan ID ${id} tidak ditemukan`);
    }

    let userVote: string | undefined;
    if (userId) {
      const vote = await this.faqVoteRepository.findOne({
        where: { faqId: id, userId },
      });
      if (vote) {
        userVote = vote.voteType;
      }
    }

    return {
      success: true,
      message: 'Data FAQ berhasil diambil',
      data: this.toFaqData(faq, userVote),
    };
  }

  /**
   * Buat FAQ baru
   */
  async create(dto: CreateFaqDto): Promise<FaqResponseDto> {
    // Validate kategori exists
    const kategori = await this.kategoriRepository.findOne({
      where: { id: dto.kategoriId },
    });
    if (!kategori) {
      throw new NotFoundException(`Kategori dengan ID ${dto.kategoriId} tidak ditemukan`);
    }

    const faq = this.faqRepository.create({
      id: uuidv4(),
      pertanyaan: dto.pertanyaan,
      deskripsi: dto.deskripsi,
      kategoriId: dto.kategoriId,
      fileUrl: dto.fileUrl,
      lampirans: dto.lampirans,
      puas: 0,
      tidakPuas: 0,
    });

    const saved = await this.faqRepository.save(faq);
    // Load kategori relation
    saved.kategoriEntity = kategori;

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
    const faq = await this.faqRepository.findOne({
      where: { id },
      relations: ['kategoriEntity'],
    });
    if (!faq) {
      throw new NotFoundException(`FAQ dengan ID ${id} tidak ditemukan`);
    }

    if (dto.pertanyaan !== undefined) faq.pertanyaan = dto.pertanyaan;
    if (dto.deskripsi !== undefined) faq.deskripsi = dto.deskripsi;
    if (dto.fileUrl !== undefined) faq.fileUrl = dto.fileUrl;
    if (dto.lampirans !== undefined) {
      // Hapus file lampiran lama yang tidak ada di daftar baru dari MinIO
      const oldLampirans = faq.lampirans || [];
      const newUrls = (dto.lampirans || []).map((l) => l.url);
      for (const oldLampiran of oldLampirans) {
        if (!newUrls.includes(oldLampiran.url)) {
          try {
            await this.storageService.deleteFile(oldLampiran.url);
            this.logger.log(`🗑️ File lampiran FAQ lama dihapus dari MinIO: ${oldLampiran.url}`);
          } catch (err: any) {
            this.logger.warn(`⚠️ Gagal menghapus file lampiran FAQ lama: ${oldLampiran.url} - ${err.message}`);
          }
        }
      }
      faq.lampirans = dto.lampirans;
    }
    if (dto.kategoriId !== undefined) {
      // Validate kategori exists
      const kategori = await this.kategoriRepository.findOne({
        where: { id: dto.kategoriId },
      });
      if (!kategori) {
        throw new NotFoundException(`Kategori dengan ID ${dto.kategoriId} tidak ditemukan`);
      }
      faq.kategoriId = dto.kategoriId;
      faq.kategoriEntity = kategori;
    }

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
    const faq = await this.faqRepository.findOne({
      where: { id },
      relations: ['kategoriEntity'],
    });
    if (!faq) {
      throw new NotFoundException(`FAQ dengan ID ${id} tidak ditemukan`);
    }

    const data = this.toFaqData(faq);

    // Hapus semua file lampiran dari MinIO object storage
    if (faq.lampirans && faq.lampirans.length > 0) {
      for (const lampiran of faq.lampirans) {
        try {
          await this.storageService.deleteFile(lampiran.url);
          this.logger.log(`🗑️ File lampiran FAQ dihapus dari MinIO: ${lampiran.url}`);
        } catch (err: any) {
          this.logger.warn(`⚠️ Gagal menghapus file lampiran FAQ dari MinIO: ${lampiran.url} - ${err.message}`);
        }
      }
    }

    // Hapus semua vote records yang terkait dengan FAQ ini
    await this.faqVoteRepository.delete({ faqId: id });
    this.logger.log(`🗑️ Vote records untuk FAQ ${id} dihapus`);

    await this.faqRepository.remove(faq);

    return {
      success: true,
      message: 'FAQ berhasil dihapus',
      data,
    };
  }

  /**
   * Vote puas/tidak_puas per user.
   * - Jika belum pernah vote: simpan vote baru dan increment counter.
   * - Jika sudah vote dengan tipe yang sama: throw ConflictException.
   * - Jika sudah vote dengan tipe berbeda: ubah vote, kurangi counter lama, tambah counter baru.
   */
  private async handleVote(
    faqId: string,
    userId: string,
    voteType: FaqVoteType,
  ): Promise<FaqResponseDto> {
    const faq = await this.faqRepository.findOne({ where: { id: faqId } });
    if (!faq) {
      throw new NotFoundException(`FAQ dengan ID ${faqId} tidak ditemukan`);
    }

    const existingVote = await this.faqVoteRepository.findOne({
      where: { faqId, userId },
    });

    if (existingVote) {
      if (existingVote.voteType === voteType) {
        throw new ConflictException(
          `Anda sudah memberikan feedback '${voteType}' untuk FAQ ini`,
        );
      }

      // Ganti vote: kurangi counter lama, tambah counter baru
      if (existingVote.voteType === 'puas') {
        faq.puas = Math.max(0, faq.puas - 1);
        faq.tidakPuas += 1;
      } else {
        faq.tidakPuas = Math.max(0, faq.tidakPuas - 1);
        faq.puas += 1;
      }
      existingVote.voteType = voteType;
      await this.faqVoteRepository.save(existingVote);
    } else {
      // Vote baru
      const vote = this.faqVoteRepository.create({
        id: uuidv4(),
        faqId,
        userId,
        voteType,
      });
      await this.faqVoteRepository.save(vote);
      if (voteType === 'puas') {
        faq.puas += 1;
      } else {
        faq.tidakPuas += 1;
      }
    }

    const updated = await this.faqRepository.save(faq);
    return {
      success: true,
      message: `Feedback '${voteType}' berhasil dicatat`,
      data: this.toFaqData(updated, voteType),
    };
  }

  /**
   * Increment counter puas (per user)
   */
  async incrementPuas(id: string, userId: string): Promise<FaqResponseDto> {
    return this.handleVote(id, userId, 'puas');
  }

  /**
   * Increment counter tidak_puas (per user)
   */
  async incrementTidakPuas(id: string, userId: string): Promise<FaqResponseDto> {
    return this.handleVote(id, userId, 'tidak_puas');
  }
}
