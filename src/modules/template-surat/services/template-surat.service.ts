import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { TemplateSuratEntity } from '../entities/template-surat.entity';
import { TemplateSuratDto } from '../dto/template-surat-response.dto';
import { CreateTemplateSuratDto } from '../dto/create-template-surat.dto';
import { UpdateTemplateSuratDto } from '../dto/update-template-surat.dto';

@Injectable()
export class TemplateSuratService {
  constructor(
    @InjectRepository(TemplateSuratEntity)
    private readonly templateSuratRepository: Repository<TemplateSuratEntity>,
  ) {}

  /**
   * Create template surat dengan konten HTML
   */
  async create(dto: CreateTemplateSuratDto): Promise<TemplateSuratEntity> {
    const template = this.templateSuratRepository.create({
      id: uuidv4(),
      id_position: dto.id_position,
      nama_template: dto.nama_template,
      content: dto.content || null,
    });

    return await this.templateSuratRepository.save(template);
  }

  /**
   * Convert entity to DTO
   */
  toDto(entity: TemplateSuratEntity): TemplateSuratDto {
    return {
      id: entity.id,
      id_position: entity.id_position,
      nama_template: entity.nama_template,
      content: entity.content,
      create_at: entity.create_at ? entity.create_at.toISOString() : undefined,
      update_at: entity.update_at ? entity.update_at.toISOString() : undefined,
    };
  }

  toDtoList(entities: TemplateSuratEntity[]): TemplateSuratDto[] {
    return entities.map(e => this.toDto(e));
  }

  async findAll(name?: string): Promise<TemplateSuratEntity[]> {
    const q = this.templateSuratRepository.createQueryBuilder('t');
    if (name) q.where('t.nama_template LIKE :name', { name: `%${name}%` });
    return await q.orderBy('t.create_at', 'DESC').getMany();
  }

  async findOne(id: string): Promise<TemplateSuratEntity> {
    const t = await this.templateSuratRepository.findOne({ where: { id } });
    if (!t) throw new NotFoundException(`Template Surat ${id} not found`);
    return t;
  }

  async findByPosition(id_position: string): Promise<TemplateSuratEntity[]> {
    return await this.templateSuratRepository.find({ 
      where: { id_position },
      order: { create_at: 'DESC' }
    });
  }

  /**
   * Find global templates (templates without id_position)
   */
  async findGlobal(): Promise<TemplateSuratEntity[]> {
    return await this.templateSuratRepository
      .createQueryBuilder('t')
      .where('t.id_position IS NULL')
      .orderBy('t.create_at', 'DESC')
      .getMany();
  }

  /**
   * Update template surat
   */
  async update(id: string, dto: UpdateTemplateSuratDto): Promise<TemplateSuratEntity> {
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

    return await this.templateSuratRepository.save(t);
  }

  /**
   * Remove template surat
   */
  async remove(id: string): Promise<void> {
    const t = await this.findOne(id);
    await this.templateSuratRepository.remove(t);
  }
}
