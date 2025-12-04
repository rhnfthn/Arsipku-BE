import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { TemplateEntity } from './entities/template.entity';
import { TemplateDto } from './dto/template-response.dto';
import { CreateTemplateDto } from './dto/create-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';

@Injectable()
export class TemplateService {
  constructor(
    @InjectRepository(TemplateEntity)
    private readonly templateRepository: Repository<TemplateEntity>,
  ) {}

  async create(dto: CreateTemplateDto): Promise<TemplateEntity> {
    const now = new Date();
    const template = this.templateRepository.create({
      id: uuidv4(),
      // tanggal follows creation date if not provided
      tanggal: dto.tanggal ? new Date(dto.tanggal) : now,
      nama_template: dto.nama_template,
      file: dto.file,
    });

    return await this.templateRepository.save(template);
  }

  toDto(entity: TemplateEntity): TemplateDto {
    function formatDate(val: any): string | null {
      if (val === null || val === undefined) return null;
      if (val instanceof Date && !isNaN(val.getTime())) return val.toISOString().split('T')[0];
      if (typeof val === 'string') {
        // If the DB returns a date string like 'YYYY-MM-DD' or 'YYYY-MM-DD 00:00:00'
        const s = val.split('T')[0].split(' ')[0];
        return s;
      }
      // fallback - try to create Date
      const d = new Date(val);
      if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
      return null;
    }

    return {
      id: entity.id,
      tanggal: formatDate(entity.tanggal),
      nama_template: entity.nama_template,
      file: entity.file,
      create_at: entity.create_at ? entity.create_at.toISOString() : undefined,
      update_at: entity.update_at ? entity.update_at.toISOString() : undefined,
    } as TemplateDto;
  }

  toDtoList(entities: TemplateEntity[]): TemplateDto[] {
    return entities.map((e) => this.toDto(e));
  }

  async findAll(name?: string): Promise<TemplateEntity[]> {
    const q = this.templateRepository.createQueryBuilder('t');
    if (name) q.where('t.nama_template LIKE :name', { name: `%${name}%` });
    return await q.orderBy('t.create_at', 'DESC').getMany();
  }

  async findOne(id: string): Promise<TemplateEntity> {
    const t = await this.templateRepository.findOne({ where: { id } });
    if (!t) throw new NotFoundException(`Template ${id} not found`);
    return t;
  }

  async update(id: string, dto: UpdateTemplateDto): Promise<TemplateEntity> {
    const t = await this.findOne(id);
    Object.assign(t, dto);
    // If tanggal not provided in DTO, update it to 'today' to follow update time
    if (dto.tanggal === undefined) {
      t.tanggal = new Date();
    } else if (dto.tanggal) {
      t.tanggal = new Date(dto.tanggal);
    }
    return await this.templateRepository.save(t);
  }

  async remove(id: string): Promise<void> {
    const t = await this.findOne(id);
    await this.templateRepository.remove(t);
  }

  async toggleAktif(id: string): Promise<TemplateEntity> {
    // No 'aktif' column in the template table; toggle not applicable
    const t = await this.findOne(id);
    return t;
  }
}
