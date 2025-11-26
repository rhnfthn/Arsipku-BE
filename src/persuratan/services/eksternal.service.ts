import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { EksternalEntity } from '../entity/eksternal.entity';
import { CreateEksternalDto } from '../dto/eksternal/create_eksternal.dto';
import { UpdateEksternalDto } from '../dto/eksternal/update_eksternal.dto';

@Injectable()
export class EksternalService {
  constructor(
    @InjectRepository(EksternalEntity)
    private eksternalRepository: Repository<EksternalEntity>,
  ) {}

  async create(createEksternalDto: CreateEksternalDto): Promise<EksternalEntity> {
    const eksternal = this.eksternalRepository.create({
      id: uuidv4(),
      ...createEksternalDto,
    });

    return await this.eksternalRepository.save(eksternal);
  }

  async findAll(company?: string, area?: string): Promise<EksternalEntity[]> {
    const query = this.eksternalRepository.createQueryBuilder('eksternal');

    if (company) {
      query.where('eksternal.company = :company', { company });
    }

    if (area) {
      query.andWhere('eksternal.area = :area', { area });
    }

    return await query
      .where('eksternal.aktif = :aktif', { aktif: true })
      .orderBy('eksternal.nama', 'ASC')
      .getMany();
  }

  async findOne(id: string): Promise<EksternalEntity> {
    const eksternal = await this.eksternalRepository.findOne({
      where: { id },
    });

    if (!eksternal) {
      throw new NotFoundException('Eksternal tidak ditemukan');
    }

    return eksternal;
  }

  async update(id: string, updateEksternalDto: UpdateEksternalDto): Promise<EksternalEntity> {
    const eksternal = await this.findOne(id);

    Object.assign(eksternal, updateEksternalDto);
    return await this.eksternalRepository.save(eksternal);
  }

  async remove(id: string): Promise<void> {
    const eksternal = await this.findOne(id);
    await this.eksternalRepository.remove(eksternal);
  }

  async toggleAktif(id: string): Promise<EksternalEntity> {
    const eksternal = await this.findOne(id);
    eksternal.aktif = !eksternal.aktif;
    return await this.eksternalRepository.save(eksternal);
  }

  async findByEmail(email: string): Promise<EksternalEntity | null> {
    return await this.eksternalRepository.findOne({
      where: { email, aktif: true },
    });
  }
}
