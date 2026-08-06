import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { NaskahReferensiEntity } from '../entities/naskah_referensi.entity';
import { CreateNaskahReferensiDto } from '../dto/naskah_referensi/create_naskah_referensi.dto';
import { UpdateNaskahReferensiDto } from '../dto/naskah_referensi/update_naskah_referensi.dto';
import { NaskahEntity } from '../../naskah/entities/naskah.entity';

@Injectable()
export class NaskahReferensiService {
  constructor(
    @InjectRepository(NaskahReferensiEntity)
    private naskahReferensiRepository: Repository<NaskahReferensiEntity>,
    @InjectRepository(NaskahEntity)
    private naskahRepository: Repository<NaskahEntity>,
  ) {}

  async create(
    createNaskahReferensiDto: CreateNaskahReferensiDto,
  ): Promise<NaskahReferensiEntity> {
    // Ambil tanggal dari naskah induk (kunci partisi tabel naskah_referensi)
    let tanggal: Date = new Date();
    if (createNaskahReferensiDto.id_naskah) {
      const parentNaskah = await this.naskahRepository.findOne({
        where: { id: createNaskahReferensiDto.id_naskah },
        select: { tanggal: true },
      });
      tanggal = parentNaskah?.tanggal ?? new Date();
    }

    const referensi = this.naskahReferensiRepository.create({
      id: uuidv4(),
      ...createNaskahReferensiDto,
      tanggal,
    });

    return await this.naskahReferensiRepository.save(referensi);
  }

  async findAll(id_naskah?: string): Promise<NaskahReferensiEntity[]> {
    const query =
      this.naskahReferensiRepository.createQueryBuilder('referensi');

    if (id_naskah) {
      query.where('referensi.id_naskah = :id_naskah', { id_naskah });
    }

    return await query.orderBy('referensi.ref_tanggal', 'DESC').getMany();
  }

  async findOne(id: string): Promise<NaskahReferensiEntity> {
    const referensi = await this.naskahReferensiRepository.findOne({
      where: { id },
    });

    if (!referensi) {
      throw new NotFoundException('Referensi naskah tidak ditemukan');
    }

    return referensi;
  }

  async findByNaskah(id_naskah: string): Promise<NaskahReferensiEntity[]> {
    return await this.naskahReferensiRepository.find({
      where: { id_naskah },
      order: { ref_tanggal: 'DESC' },
    });
  }

  async update(
    id: string,
    updateNaskahReferensiDto: UpdateNaskahReferensiDto,
  ): Promise<NaskahReferensiEntity> {
    const referensi = await this.findOne(id);
    Object.assign(referensi, updateNaskahReferensiDto);
    return await this.naskahReferensiRepository.save(referensi);
  }

  async remove(id: string): Promise<void> {
    const referensi = await this.findOne(id);
    await this.naskahReferensiRepository.remove(referensi);
  }
}
