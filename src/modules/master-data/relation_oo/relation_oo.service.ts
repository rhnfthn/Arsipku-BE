import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateRelationOoDto } from './dto/create-relation_oo.dto';
import { UpdateRelationOoDto } from './dto/update-relation_oo.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { RelationOo } from './entities/relation_oo.entity';
import { Repository } from 'typeorm';

@Injectable()
export class RelationOoService {
  constructor(
    @InjectRepository(RelationOo)
    private readonly cRepo: Repository<RelationOo>,
  ) {}

  async findAll(): Promise<RelationOo[]> {
    return this.cRepo.find({
      order: { createAt: 'DESC' },
    });
  }

  async findManyByDate(tgl: string): Promise<RelationOo[]> {
    const result = await this.cRepo
      .createQueryBuilder('oo')
      .where(':tgl BETWEEN oo.startDate AND oo.endDate', { tgl })
      .getMany();

    // if (result.length === 0) {
    //   throw new NotFoundException(`Data untuk tanggal ${tgl} tidak ditemukan`);
    // }

    return result;
  }

  async findOne(id: string): Promise<RelationOo> {
    const company = await this.cRepo.findOne({ where: { id } });
    if (!company) {
      throw new NotFoundException(`Area with ID ${id} not found`);
    }
    return company;
  }

  async create(dto: CreateRelationOoDto): Promise<RelationOo> {
    // Jika tidak ada id, generate UUID otomatis (karena di DB defaultnya UUID())
    const newCompany = this.cRepo.create(dto);
    return this.cRepo.save(newCompany);
  }

  async update(id: string, dto: UpdateRelationOoDto): Promise<RelationOo> {
    const company = await this.findOne(id);
    const updated = Object.assign(company, dto);
    return this.cRepo.save(updated);
  }

  async remove(id: string): Promise<{ message: string }> {
    const company = await this.findOne(id);
    await this.cRepo.remove(company);
    return { message: `Area ${id} deleted successfully` };
  }

  async findManyRelation(tgl: string): Promise<RelationOo[]> {
    const result = await this.cRepo
      .createQueryBuilder('a')
      .innerJoin(
        'om_organization',
        'o',
        `o.organization = a.organization 
     AND o.company = a.company 
     AND :tgl BETWEEN o.startDate AND o.endDate`,
        { tgl },
      )
      .innerJoin(
        'om_company',
        'oc',
        `oc.company = a.company
     AND :tgl BETWEEN oc.startDate AND oc.endDate`,
        { tgl },
      )
      .select([
        'a.*',
        'o.abbreviation as abbreviation',
        'oc.long_text as company_name',
      ])
      .where(':tgl BETWEEN a.startDate AND a.endDate', { tgl })
      .getRawMany();

    // if (result.length === 0) {
    //   throw new NotFoundException(`Data untuk tanggal ${tgl} tidak ditemukan`);
    // }

    return result;
  }
}
