import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateRelationODto } from './dto/create-relation_o.dto';
import { UpdateRelationODto } from './dto/update-relation_o.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RelationOs } from './entities/relation_os.entity';

@Injectable()
export class RelationOsService {
  constructor(
    @InjectRepository(RelationOs)
    private readonly cRepo: Repository<RelationOs>,
  ) {}

  async findAll(): Promise<RelationOs[]> {
    return this.cRepo.find({
      order: { createAt: 'DESC' },
    });
  }

  async findManyByDate(tgl: string): Promise<RelationOs[]> {
    const result = await this.cRepo
      .createQueryBuilder('oo')
      .where(':tgl BETWEEN oo.startDate AND oo.endDate', { tgl })
      .getMany();

    // if (result.length === 0) {
    //   throw new NotFoundException(`Data untuk tanggal ${tgl} tidak ditemukan`);
    // }

    return result;
  }

  async findOne(id: string): Promise<RelationOs> {
    const company = await this.cRepo.findOne({ where: { id } });
    if (!company) {
      throw new NotFoundException(`Area with ID ${id} not found`);
    }
    return company;
  }

  async create(dto: CreateRelationODto): Promise<RelationOs> {
    // Jika tidak ada id, generate UUID otomatis (karena di DB defaultnya UUID())
    const newCompany = this.cRepo.create(dto);
    return this.cRepo.save(newCompany);
  }

  async update(id: string, dto: UpdateRelationODto): Promise<RelationOs> {
    const company = await this.findOne(id);
    const updated = Object.assign(company, dto);
    return this.cRepo.save(updated);
  }

  async remove(id: string): Promise<{ message: string }> {
    const company = await this.findOne(id);
    await this.cRepo.remove(company);
    return { message: `Area ${id} deleted successfully` };
  }

  async findManyRelation(tgl: string): Promise<RelationOs[]> {
    const result = await this.cRepo
      .createQueryBuilder('a')
      .innerJoin(
        'om_position',
        'o',
        `o.position = a.relation_position
       AND o.company = a.company 
       AND :tgl BETWEEN o.startDate AND o.endDate`,
        { tgl },
      )
      .select(['a.*', 'o.abbreviation as abbreviation'])
      .where(':tgl BETWEEN a.startDate AND a.endDate', { tgl })
      .getRawMany();

    // if (result.length === 0) {
    //   throw new NotFoundException(`Data untuk tanggal ${tgl} tidak ditemukan`);
    // }

    return result;
  }
}
