import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateRelationOaDto } from './dto/create-relation_oa.dto';
import { UpdateRelationOaDto } from './dto/update-relation_oa.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RelationOa } from './entities/relation_oa.entity';

@Injectable()
export class RelationOaService {
  constructor(
    @InjectRepository(RelationOa)
    private readonly cRepo: Repository<RelationOa>,
  ) {}

  async findAll(): Promise<RelationOa[]> {
    return this.cRepo.find({
      order: { createAt: 'DESC' },
    });
  }

  async findManyByDate(tgl: string): Promise<RelationOa[]> {
    const result = await this.cRepo
      .createQueryBuilder('oo')
      .where(':tgl BETWEEN oo.startDate AND oo.endDate', { tgl })
      .getMany();

    // if (result.length === 0) {
    //   throw new NotFoundException(`Data untuk tanggal ${tgl} tidak ditemukan`);
    // }

    return result;
  }

  async findOne(id: string): Promise<RelationOa> {
    const company = await this.cRepo.findOne({ where: { id } });
    if (!company) {
      throw new NotFoundException(`Area with ID ${id} not found`);
    }
    return company;
  }

  async create(dto: CreateRelationOaDto): Promise<RelationOa> {
    // Jika tidak ada id, generate UUID otomatis (karena di DB defaultnya UUID())
    const newCompany = this.cRepo.create(dto);
    return this.cRepo.save(newCompany);
  }

  async update(id: string, dto: UpdateRelationOaDto): Promise<RelationOa> {
    const company = await this.findOne(id);
    const updated = Object.assign(company, dto);
    return this.cRepo.save(updated);
  }

  async remove(id: string): Promise<{ message: string }> {
    const company = await this.findOne(id);
    await this.cRepo.remove(company);
    return { message: `Area ${id} deleted successfully` };
  }

  async findManyRelation(tgl: string): Promise<any[]> {
    const result = await this.cRepo
      .createQueryBuilder('a')
      .innerJoin(
        'om_area_sub',
        'o',
        `o.sub_area = a.relation_sub_area
        AND o.company = a.company
        AND :tgl BETWEEN o.startDate AND o.endDate`,
        { tgl },
      )
      .innerJoin(
        'om_area',
        'oa',
        `oa.area = o.area
        AND :tgl BETWEEN oa.startDate AND oa.endDate`,
        { tgl },
      )
      .select(['a.*', 'o.area as area', 'oa.long_text as area_text'])
      .where(':tgl BETWEEN a.startDate AND a.endDate', { tgl })
      .getRawMany();

    return result;
  }
}
