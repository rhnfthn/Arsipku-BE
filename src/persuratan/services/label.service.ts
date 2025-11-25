import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { LabelEntity } from '../entity/label.entity';
import { CreateLabelDto } from '../dto/label/create-label.dto';
import { UpdateLabelDto } from '../dto/label/update-label.dto';

@Injectable()
export class LabelService {
  constructor(
    @InjectRepository(LabelEntity)
    private labelRepository: Repository<LabelEntity>,
  ) {}

  async create(createLabelDto: CreateLabelDto): Promise<LabelEntity> {
    // Validate parent label exists if provided
    if (createLabelDto.id_parent) {
      const parentLabel = await this.labelRepository.findOne({
        where: { id: createLabelDto.id_parent },
      });
      if (!parentLabel) {
        throw new BadRequestException('Parent label tidak ditemukan');
      }
    }

    const label = this.labelRepository.create({
      id: uuidv4(),
      ...createLabelDto,
    });

    return await this.labelRepository.save(label);
  }

  async findAll(persnum?: string): Promise<LabelEntity[]> {
    const query = this.labelRepository.createQueryBuilder('label');

    if (persnum) {
      query.where('label.persnum = :persnum', { persnum });
    }

    return await query
      .leftJoinAndSelect('label.childLabels', 'childLabels')
      .orderBy('label.nama', 'ASC')
      .addOrderBy('childLabels.nama', 'ASC')
      .getMany();
  }

  async findOne(id: string): Promise<LabelEntity> {
    const label = await this.labelRepository.findOne({
      where: { id },
      relations: ['childLabels', 'parentLabel'],
    });

    if (!label) {
      throw new NotFoundException('Label tidak ditemukan');
    }

    return label;
  }

  async update(id: string, updateLabelDto: UpdateLabelDto): Promise<LabelEntity> {
    const label = await this.findOne(id);

    // Validate parent label if changed
    if (updateLabelDto.id_parent && updateLabelDto.id_parent !== label.id_parent) {
      const parentLabel = await this.labelRepository.findOne({
        where: { id: updateLabelDto.id_parent },
      });
      if (!parentLabel) {
        throw new BadRequestException('Parent label tidak ditemukan');
      }
    }

    Object.assign(label, updateLabelDto);
    return await this.labelRepository.save(label);
  }

  async remove(id: string): Promise<void> {
    const label = await this.findOne(id);
    await this.labelRepository.remove(label);
  }

  async findByParent(id_parent: string): Promise<LabelEntity[]> {
    return await this.labelRepository.find({
      where: { id_parent, aktif: true },
      order: { nama: 'ASC' },
    });
  }

  async toggleAktif(id: string): Promise<LabelEntity> {
    const label = await this.findOne(id);
    label.aktif = !label.aktif;
    return await this.labelRepository.save(label);
  }
}
