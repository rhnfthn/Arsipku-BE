import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { SubAreaAlamatEntity } from '../entity/sub_area_alamat.entity';
import { CreateSubAreaAlamatDto } from '../dto/sub_area_alamat/create_sub_area_alamat.dto';
import { UpdateSubAreaAlamatDto } from '../dto/sub_area_alamat/update_sub_area_alamat.dto';

@Injectable()
export class SubAreaAlamatService {
  constructor(
    @InjectRepository(SubAreaAlamatEntity)
    private subAreaAlamatRepository: Repository<SubAreaAlamatEntity>,
  ) {}

  async create(createSubAreaAlamatDto: CreateSubAreaAlamatDto): Promise<SubAreaAlamatEntity> {
    const subAreaAlamat = this.subAreaAlamatRepository.create({
      id: uuidv4(),
      ...createSubAreaAlamatDto,
    });

    return await this.subAreaAlamatRepository.save(subAreaAlamat);
  }

  async findAll(company?: string, area?: string): Promise<SubAreaAlamatEntity[]> {
    const query = this.subAreaAlamatRepository.createQueryBuilder('sub_area_alamat');

    if (company) {
      query.where('sub_area_alamat.company = :company', { company });
    }

    if (area) {
      query.andWhere('sub_area_alamat.area = :area', { area });
    }

    return await query
      .orderBy('sub_area_alamat.company', 'ASC')
      .addOrderBy('sub_area_alamat.area', 'ASC')
      .addOrderBy('sub_area_alamat.sub_area', 'ASC')
      .getMany();
  }

  async findOne(id: string): Promise<SubAreaAlamatEntity> {
    const subAreaAlamat = await this.subAreaAlamatRepository.findOne({
      where: { id },
    });

    if (!subAreaAlamat) {
      throw new NotFoundException('Sub-Area Alamat tidak ditemukan');
    }

    return subAreaAlamat;
  }

  async findBySubArea(
    company: string,
    area: string,
    sub_area: string,
  ): Promise<SubAreaAlamatEntity> {
    const subAreaAlamat = await this.subAreaAlamatRepository.findOne({
      where: { company, area, sub_area },
      order: { start_date: 'DESC' },
    });

    if (!subAreaAlamat) {
      throw new NotFoundException('Sub-Area Alamat tidak ditemukan');
    }

    return subAreaAlamat;
  }

  async update(
    id: string,
    updateSubAreaAlamatDto: UpdateSubAreaAlamatDto,
  ): Promise<SubAreaAlamatEntity> {
    const subAreaAlamat = await this.findOne(id);

    Object.assign(subAreaAlamat, updateSubAreaAlamatDto);
    return await this.subAreaAlamatRepository.save(subAreaAlamat);
  }

  async remove(id: string): Promise<void> {
    const subAreaAlamat = await this.findOne(id);
    await this.subAreaAlamatRepository.remove(subAreaAlamat);
  }
}
