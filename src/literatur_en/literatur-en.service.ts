import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { LiteraturEnEntity } from './entities/literatur-en.entity';
import { CreateLiteraturEnDto } from './dto/create-literatur-en.dto';
import { UpdateLiteraturEnDto } from './dto/update-literatur-en.dto';

@Injectable()
export class LiteraturEnService {
  constructor(
    @InjectRepository(LiteraturEnEntity)
    private readonly literaturRepository: Repository<LiteraturEnEntity>,
  ) {}

  async create(dto: CreateLiteraturEnDto): Promise<LiteraturEnEntity> {
    const now = new Date();
    const entity = this.literaturRepository.create({
      id: uuidv4(),
      company: dto.company || undefined,
      start_date: dto.start_date ? new Date(dto.start_date) : now,
      end_date: dto.end_date ? new Date(dto.end_date) : new Date('9999-12-31'),
      object_type: dto.object_type || null,
      long_text: dto.long_text || null,
      long_text_en: dto.long_text_en || null,
    });
    return await this.literaturRepository.save(entity);
  }

  async findAll(company?: string, object_type?: string): Promise<LiteraturEnEntity[]> {
    const q = this.literaturRepository.createQueryBuilder('l');
    if (company) q.where('l.company = :company', { company });
    if (object_type) {
      if (company) q.andWhere('l.object_type = :object_type', { object_type });
      else q.where('l.object_type = :object_type', { object_type });
    }
    return await q.orderBy('l.create_at', 'DESC').getMany();
  }

  async findOne(id: string): Promise<LiteraturEnEntity> {
    const e = await this.literaturRepository.findOne({ where: { id } });
    if (!e) throw new NotFoundException(`Literatur ${id} not found`);
    return e;
  }

  async update(id: string, dto: UpdateLiteraturEnDto): Promise<LiteraturEnEntity> {
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

    return await this.literaturRepository.save(e);
  }

  async remove(id: string): Promise<void> {
    const e = await this.findOne(id);
    await this.literaturRepository.remove(e);
  }
}
