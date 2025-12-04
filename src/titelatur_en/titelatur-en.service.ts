import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { TitelaturEnEntity } from './entities/titelatur-en.entity';
import { CreateTitelaturEnDto } from './dto/create-titelatur-en.dto';
import { UpdateTitelaturEnDto } from './dto/update-titelatur-en.dto';

@Injectable()
export class TitelaturEnService {
  constructor(
    @InjectRepository(TitelaturEnEntity)
    private readonly titelaturRepository: Repository<TitelaturEnEntity>,
  ) {}

  async create(dto: CreateTitelaturEnDto): Promise<TitelaturEnEntity> {
    const now = new Date();
    const entity = this.titelaturRepository.create({
      id: uuidv4(),
      company: dto.company || undefined,
      start_date: dto.start_date ? new Date(dto.start_date) : now,
      end_date: dto.end_date ? new Date(dto.end_date) : new Date('9999-12-31'),
      object_type: dto.object_type || null,
      long_text: dto.long_text || null,
      long_text_en: dto.long_text_en || null,
    });
    return await this.titelaturRepository.save(entity);
  }

  async findAll(company?: string, object_type?: string): Promise<TitelaturEnEntity[]> {
    const q = this.titelaturRepository.createQueryBuilder('t');
    if (company) q.where('t.company = :company', { company });
    if (object_type) {
      if (company) q.andWhere('t.object_type = :object_type', { object_type });
      else q.where('t.object_type = :object_type', { object_type });
    }
    return await q.orderBy('t.create_at', 'DESC').getMany();
  }

  async findOne(id: string): Promise<TitelaturEnEntity> {
    const e = await this.titelaturRepository.findOne({ where: { id } });
    if (!e) throw new NotFoundException(`Titelatur ${id} not found`);
    return e;
  }

  async update(id: string, dto: UpdateTitelaturEnDto): Promise<TitelaturEnEntity> {
    const e = await this.findOne(id);
    Object.assign(e, dto);
    if (dto.start_date === undefined) {
      // keep as is
    } else if (dto.start_date) e.start_date = new Date(dto.start_date);

    if (dto.end_date === undefined) {
      // keep as-is
    } else if (dto.end_date === null || dto.end_date === '') {
      // Set to default 9999-12-31 when explicitly cleared
      e.end_date = new Date('9999-12-31');
    } else {
      e.end_date = new Date(dto.end_date as string);
    }

    return await this.titelaturRepository.save(e);
  }

  async remove(id: string): Promise<void> {
    const e = await this.findOne(id);
    await this.titelaturRepository.remove(e);
  }
}
