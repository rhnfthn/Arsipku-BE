import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateRelationOdDto } from './dto/create-relation_od.dto';
import { UpdateRelationOdDto } from './dto/update-relation_od.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RelationOd } from './entities/relation_od.entity';

@Injectable()
export class RelationOdService {
  constructor(
    @InjectRepository(RelationOd)
    private readonly cRepo: Repository<RelationOd>,
  ) {}

  async findAll(): Promise<RelationOd[]> {
    return this.cRepo.find({
      order: { createAt: 'DESC' },
    });
  }

  async findManyByDate(tgl: string): Promise<RelationOd[]> {
    const result = await this.cRepo
      .createQueryBuilder('oo')
      .where(':tgl BETWEEN oo.startDate AND oo.endDate', { tgl })
      .getMany();

    // if (result.length === 0) {
    //   throw new NotFoundException(`Data untuk tanggal ${tgl} tidak ditemukan`);
    // }

    return result;
  }

  async findOne(id: string): Promise<RelationOd> {
    const company = await this.cRepo.findOne({ where: { id } });
    if (!company) {
      throw new NotFoundException(`Relasi Dir with ID ${id} not found`);
    }
    return company;
  }

  async create(dto: CreateRelationOdDto): Promise<RelationOd> {
    // Jika tidak ada id, generate UUID otomatis (karena di DB defaultnya UUID())
    const newCompany = this.cRepo.create(dto);
    return this.cRepo.save(newCompany);
  }

  async update(id: string, dto: UpdateRelationOdDto): Promise<RelationOd> {
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
