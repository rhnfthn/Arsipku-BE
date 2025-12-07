import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { GrupPenerimaDetailEntity } from '../entities/grup_penerima_detail.entity';
import { CreateGrupPenerimaDetailDto } from '../dto/grup_penerima_detail/create_grup_penerima_detail.dto';
import { UpdateGrupPenerimaDetailDto } from '../dto/grup_penerima_detail/update_grup_penerima_detail.dto';

@Injectable()
export class GrupPenerimaDetailService {
  constructor(
    @InjectRepository(GrupPenerimaDetailEntity)
    private detailRepository: Repository<GrupPenerimaDetailEntity>,
  ) {}

  async create(
    createDetailDto: CreateGrupPenerimaDetailDto,
  ): Promise<GrupPenerimaDetailEntity> {
    const detail = this.detailRepository.create({
      id: uuidv4(),
      ...createDetailDto,
    });

    return await this.detailRepository.save(detail);
  }

  async findAll(
    id_grup_penerima?: string,
  ): Promise<GrupPenerimaDetailEntity[]> {
    const query = this.detailRepository.createQueryBuilder('detail');

    if (id_grup_penerima) {
      query.where('detail.id_grup_penerima = :id_grup_penerima', {
        id_grup_penerima,
      });
    }

    return await query.getMany();
  }

  async findOne(id: string): Promise<GrupPenerimaDetailEntity> {
    const detail = await this.detailRepository.findOne({
      where: { id },
    });

    if (!detail) {
      throw new NotFoundException('Detail grup penerima tidak ditemukan');
    }

    return detail;
  }

  async update(
    id: string,
    updateDetailDto: UpdateGrupPenerimaDetailDto,
  ): Promise<GrupPenerimaDetailEntity> {
    const detail = await this.findOne(id);

    Object.assign(detail, updateDetailDto);
    return await this.detailRepository.save(detail);
  }

  async remove(id: string): Promise<void> {
    const detail = await this.findOne(id);
    await this.detailRepository.remove(detail);
  }
}
