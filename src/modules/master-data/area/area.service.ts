import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateAreaDto } from './dto/create-area.dto';
import { UpdateAreaDto } from './dto/update-area.dto';
import { OmArea } from './entities/om-area.entity';

@Injectable()
export class AreaService {
  constructor(
    @InjectRepository(OmArea)
    private readonly areaRepo: Repository<OmArea>,
  ) {}

  async findAll(): Promise<OmArea[]> {
    return this.areaRepo.find({
      order: { createAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<OmArea> {
    const company = await this.areaRepo.findOne({ where: { id } });
    if (!company) {
      throw new NotFoundException(`Area with ID ${id} not found`);
    }
    return company;
  }

  async create(dto: CreateAreaDto): Promise<OmArea> {
    // Jika tidak ada id, generate UUID otomatis (karena di DB defaultnya UUID())
    const newCompany = this.areaRepo.create(dto);
    return this.areaRepo.save(newCompany);
  }

  async update(id: string, dto: UpdateAreaDto): Promise<OmArea> {
    const company = await this.findOne(id);
    const updated = Object.assign(company, dto);
    return this.areaRepo.save(updated);
  }

  async remove(id: string): Promise<{ message: string }> {
    const company = await this.findOne(id);
    await this.areaRepo.remove(company);
    return { message: `Area ${id} deleted successfully` };
  }
}
