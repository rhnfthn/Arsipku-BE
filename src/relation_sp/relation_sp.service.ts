import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateRelationSpDto } from './dto/create-relation_sp.dto';
import { UpdateRelationSpDto } from './dto/update-relation_sp.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { RelationSp } from './entities/relation_sp.entity';
import { Repository } from 'typeorm';

@Injectable()
export class RelationSpService {
  constructor(
    @InjectRepository(RelationSp)
    private readonly cRepo: Repository<RelationSp>,
  ) {}

  async findAll(): Promise<RelationSp[]> {
    return this.cRepo.find({
      order: { createAt: 'DESC' },
    });
  }

  async findManyByDate(tgl: string): Promise<RelationSp[]> {
    const result = await this.cRepo
      .createQueryBuilder('oo')
      .where(':tgl BETWEEN oo.startDate AND oo.endDate', { tgl })
      .getMany();

    // if (result.length === 0) {
    //   throw new NotFoundException(`Data untuk tanggal ${tgl} tidak ditemukan`);
    // }

    return result;
  }

  async findOne(id: string): Promise<RelationSp> {
    const company = await this.cRepo.findOne({ where: { id } });
    if (!company) {
      throw new NotFoundException(`Area with ID ${id} not found`);
    }
    return company;
  }

  async create(dto: CreateRelationSpDto): Promise<RelationSp> {
    // Jika tidak ada id, generate UUID otomatis (karena di DB defaultnya UUID())
    const newCompany = this.cRepo.create(dto);
    return this.cRepo.save(newCompany);
  }

  async update(id: string, dto: UpdateRelationSpDto): Promise<RelationSp> {
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
