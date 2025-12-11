import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateRelationOscDto } from './dto/create-relation_osc.dto';
import { UpdateRelationOscDto } from './dto/update-relation_osc.dto';
import { RelationOsc } from './entities/relation_osc.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

@Injectable()
export class RelationOscService {
  constructor(
    @InjectRepository(RelationOsc)
    private readonly cRepo: Repository<RelationOsc>,
  ) {}

  async findAll(): Promise<RelationOsc[]> {
    return this.cRepo.find({
      order: { createAt: 'DESC' },
    });
  }

  async findManyByDate(tgl: string): Promise<RelationOsc[]> {
    const result = await this.cRepo
      .createQueryBuilder('oo')
      .select([
        'oo.id',
        'oo.company',
        'oo.startDate',
        'oo.endDate',
        'oo.organization',
        'oo.organization_text',
        'oo.relation_position',
        'oo.relation_position_text',
        'oo.bod_tag',
        'oo.createAt',
        'oo.updateAt',
      ])
      .where(':tgl BETWEEN oo.startDate AND oo.endDate', { tgl })
      .getMany();

    // if (result.length === 0) {
    //   throw new NotFoundException(`Data untuk tanggal ${tgl} tidak ditemukan`);
    // }

    return result;
  }

  async findOne(id: string): Promise<RelationOsc> {
    const company = await this.cRepo.findOne({ where: { id } });
    if (!company) {
      throw new NotFoundException(`Area with ID ${id} not found`);
    }
    return company;
  }

  async create(dto: CreateRelationOscDto): Promise<RelationOsc> {
    // Jika tidak ada id, generate UUID otomatis (karena di DB defaultnya UUID())
    const newCompany = this.cRepo.create(dto);
    return this.cRepo.save(newCompany);
  }

  async update(id: string, dto: UpdateRelationOscDto): Promise<RelationOsc> {
    const company = await this.findOne(id);
    const updated = Object.assign(company, dto);
    return this.cRepo.save(updated);
  }

  async remove(id: string): Promise<{ message: string }> {
    const company = await this.findOne(id);
    await this.cRepo.remove(company);
    return { message: `Area ${id} deleted successfully` };
  }
}
