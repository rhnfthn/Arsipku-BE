import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { NaskahEntity } from '../entity/naskah.entity';
import { CreateNaskahDto } from '../dto/naskah/create_naskah.dto';
import { UpdateNaskahDto } from '../dto/naskah/update_naskah.dto';

@Injectable()
export class NaskahService {
  constructor(
    @InjectRepository(NaskahEntity)
    private naskahRepository: Repository<NaskahEntity>,
  ) {}

  async create(createNaskahDto: CreateNaskahDto): Promise<NaskahEntity> {
    const naskah = new NaskahEntity();
    naskah.id = uuidv4();
    Object.assign(naskah, createNaskahDto);

    return await this.naskahRepository.save(naskah);
  }

  async findAll(
    jenis?: string,
    status?: string,
    year?: number,
  ): Promise<NaskahEntity[]> {
    const query = this.naskahRepository.createQueryBuilder('naskah');

    if (jenis) {
      query.where('naskah.jenis = :jenis', { jenis });
    }

    if (status) {
      query.andWhere('naskah.status = :status', { status });
    }

    if (year) {
      query.andWhere('YEAR(naskah.tanggal) = :year', { year });
    }

    return await query.orderBy('naskah.tanggal', 'DESC').getMany();
  }

  async findOne(id: string): Promise<NaskahEntity> {
    const naskah = await this.naskahRepository.findOne({
      where: { id },
    });

    if (!naskah) {
      throw new NotFoundException('Naskah tidak ditemukan');
    }

    return naskah;
  }

  async findByJenis(
    jenis: 'ND' | 'SDI' | 'SDE' | 'DI' | 'KA',
  ): Promise<NaskahEntity[]> {
    return await this.naskahRepository.find({
      where: { jenis },
      order: { tanggal: 'DESC' },
    });
  }

  async update(
    id: string,
    updateNaskahDto: UpdateNaskahDto,
  ): Promise<NaskahEntity> {
    const naskah = await this.findOne(id);
    Object.assign(naskah, updateNaskahDto);
    return await this.naskahRepository.save(naskah);
  }

  async remove(id: string): Promise<void> {
    const naskah = await this.findOne(id);
    await this.naskahRepository.remove(naskah);
  }

  async updateStatus(
    id: string,
    status: 'draf' | 'final' | 'final_tte',
  ): Promise<NaskahEntity> {
    const naskah = await this.findOne(id);
    naskah.status = status;
    return await this.naskahRepository.save(naskah);
  }
}
