import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JenisEntity } from '../../nomor/entities/jenis.entity';
import { JenisResponseDto, JenisData } from '../dto/jenis.dto';

@Injectable()
export class JenisService {
  constructor(
    @InjectRepository(JenisEntity)
    private readonly jenisRepository: Repository<JenisEntity>,
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
}
