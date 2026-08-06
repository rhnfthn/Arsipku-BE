import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { NaskahLampiranEntity } from '../entities/naskah_lampiran.entity';
import { CreateNaskahLampiranDto } from '../dto/naskah_lampiran/create_naskah_lampiran.dto';
import { UpdateNaskahLampiranDto } from '../dto/naskah_lampiran/update_naskah_lampiran.dto';
import { NaskahEntity } from '../../naskah/entities/naskah.entity';

@Injectable()
export class NaskahLampiranService {
  constructor(
    @InjectRepository(NaskahLampiranEntity)
    private naskahLampiranRepository: Repository<NaskahLampiranEntity>,
    @InjectRepository(NaskahEntity)
    private naskahRepository: Repository<NaskahEntity>,
  ) {}

  async create(
    createNaskahLampiranDto: CreateNaskahLampiranDto,
  ): Promise<NaskahLampiranEntity> {
    // Ambil tanggal dari naskah induk (kunci partisi tabel naskah_lampiran)
    let tanggal: Date = new Date();
    if (createNaskahLampiranDto.id_naskah) {
      const parentNaskah = await this.naskahRepository.findOne({
        where: { id: createNaskahLampiranDto.id_naskah },
        select: { tanggal: true },
      });
      tanggal = parentNaskah?.tanggal ?? new Date();
    }

    const lampiran = this.naskahLampiranRepository.create({
      id: uuidv4(),
      ...createNaskahLampiranDto,
      tanggal,
    });

    return await this.naskahLampiranRepository.save(lampiran);
  }

  async findAll(id_naskah?: string): Promise<NaskahLampiranEntity[]> {
    const query = this.naskahLampiranRepository.createQueryBuilder('lampiran');

    if (id_naskah) {
      query.where('lampiran.id_naskah = :id_naskah', { id_naskah });
    }

    return await query.orderBy('lampiran.file_name', 'ASC').getMany();
  }

  async findOne(id: string): Promise<NaskahLampiranEntity> {
    const lampiran = await this.naskahLampiranRepository.findOne({
      where: { id },
    });

    if (!lampiran) {
      throw new NotFoundException('Lampiran naskah tidak ditemukan');
    }

    return lampiran;
  }

  async findByNaskah(id_naskah: string): Promise<NaskahLampiranEntity[]> {
    return await this.naskahLampiranRepository.find({
      where: { id_naskah },
      order: { file_name: 'ASC' },
    });
  }

  async update(
    id: string,
    updateNaskahLampiranDto: UpdateNaskahLampiranDto,
  ): Promise<NaskahLampiranEntity> {
    const lampiran = await this.findOne(id);
    Object.assign(lampiran, updateNaskahLampiranDto);
    return await this.naskahLampiranRepository.save(lampiran);
  }

  async remove(id: string): Promise<void> {
    const lampiran = await this.findOne(id);
    await this.naskahLampiranRepository.remove(lampiran);
  }

  async findFileTemp(): Promise<NaskahLampiranEntity[]> {
    return await this.naskahLampiranRepository
      .createQueryBuilder('lampiran')
      .where('lampiran.is_temporary = :isTemporary', { isTemporary: 1 })
      .andWhere('lampiran.update_at < DATE_ADD(NOW(), INTERVAL -5 DAY)')
      .getMany();
  }
}
