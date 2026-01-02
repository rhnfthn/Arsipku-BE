import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { SubAreaAlamatEntity } from '../entities/sub_area_alamat.entity';
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

  /**
   * Find alamat berdasarkan company, area, sub_area dan tanggal (between start_date end_date)
   * Digunakan untuk dynamic header PDF
   */
  async findAlamatByUserContext(
    company: string,
    area: string,
    subArea: string,
    tanggal?: Date,
  ): Promise<{ kantor: string; gedung: string; alamat: string; kota: string } | null> {
    const queryDate = tanggal || new Date();

    const subAreaAlamat = await this.subAreaAlamatRepository
      .createQueryBuilder('saa')
      .where('saa.company = :company', { company })
      .andWhere('saa.area = :area', { area })
      .andWhere('saa.sub_area = :subArea', { subArea })
      .andWhere('saa.start_date <= :queryDate', { queryDate })
      .andWhere('(saa.end_date IS NULL OR saa.end_date >= :queryDate)', { queryDate })
      .orderBy('saa.start_date', 'DESC')
      .getOne();

    if (!subAreaAlamat) {
      // Fallback: cari tanpa filter tanggal
      const fallback = await this.subAreaAlamatRepository.findOne({
        where: { company, area, sub_area: subArea },
        order: { start_date: 'DESC' },
      });

      if (fallback) {
        return {
          kantor: fallback.kantor || '',
          gedung: fallback.gedung || '',
          alamat: fallback.alamat || '',
          kota: fallback.kota || 'Tangerang',
        };
      }

      return null;
    }

    return {
      kantor: subAreaAlamat.kantor || '',
      gedung: subAreaAlamat.gedung || '',
      alamat: subAreaAlamat.alamat || '',
      kota: subAreaAlamat.kota || 'Tangerang',
    };
  }
}
