import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { NaskahLampiranEntity } from '../entity/naskah_lampiran.entity';
import { CreateNaskahLampiranDto } from '../dto/naskah_lampiran/create_naskah_lampiran.dto';
import { UpdateNaskahLampiranDto } from '../dto/naskah_lampiran/update_naskah_lampiran.dto';

@Injectable()
export class NaskahLampiranService {
  constructor(
    @InjectRepository(NaskahLampiranEntity)
    private naskahLampiranRepository: Repository<NaskahLampiranEntity>,
  ) {}

  async create(
    createNaskahLampiranDto: CreateNaskahLampiranDto,
  ): Promise<NaskahLampiranEntity> {
    const lampiran = this.naskahLampiranRepository.create({
      id: uuidv4(),
      ...createNaskahLampiranDto,
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
}
