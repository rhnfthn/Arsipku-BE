import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { TemplateEntity } from '../entities/template.entity';
import { TemplateDto } from '../dto/template-response.dto';
import { CreateTemplateDto } from '../dto/create-template.dto';
import { UpdateTemplateDto } from '../dto/update-template.dto';

@Injectable()
export class TemplateService {
  constructor(
    @InjectRepository(TemplateEntity)
    private readonly templateRepository: Repository<TemplateEntity>,
  ) {}

  /**
   * Create template dengan konten HTML
   */
  async create(dto: CreateTemplateDto): Promise<TemplateEntity> {
    const template = this.templateRepository.create({
      id: uuidv4(),
      id_position: dto.id_position,
      nama_template: dto.nama_template,
      content: dto.content || null,
    });

    return await this.templateRepository.save(template);
  }

  /**
   * Convert entity to DTO
   */
  toDto(entity: TemplateEntity): TemplateDto {
    return {
      id: entity.id,
      id_position: entity.id_position,
      nama_template: entity.nama_template,
      content: entity.content,
      create_at: entity.create_at ? entity.create_at.toISOString() : undefined,
      update_at: entity.update_at ? entity.update_at.toISOString() : undefined,
    };
  }

  toDtoList(entities: TemplateEntity[]): TemplateDto[] {
    return entities.map(e => this.toDto(e));
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

  async findByPosition(id_position: string): Promise<TemplateEntity[]> {
    return await this.templateRepository.find({ 
      where: { id_position },
      order: { create_at: 'DESC' }
    });
  }

  /**
   * Update template
   */
  async update(id: string, dto: UpdateTemplateDto): Promise<TemplateEntity> {
    const t = await this.findOne(id);

    if (dto.id_position !== undefined) {
      t.id_position = dto.id_position;
    }
    
    if (dto.nama_template !== undefined) {
      t.nama_template = dto.nama_template;
    }

    if (dto.content !== undefined) {
      t.content = dto.content;
    }

    return await this.templateRepository.save(t);
  }

  /**
   * Remove template
   */
  async remove(id: string): Promise<void> {
    const t = await this.findOne(id);
    await this.templateRepository.remove(t);
  }
}
