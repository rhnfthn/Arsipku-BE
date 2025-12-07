import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateAreasubDto } from './dto/create-areasub.dto';
import { UpdateAreasubDto } from './dto/update-areasub.dto';
import { OmAreaSub } from './entities/om-areasub.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

@Injectable()
export class AreasubService {
  constructor(
    @InjectRepository(OmAreaSub)
    private readonly cRepo: Repository<OmAreaSub>,
  ) {}

  async findAll(): Promise<OmAreaSub[]> {
    return this.cRepo.find({
      order: { createAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<OmAreaSub> {
    const company = await this.cRepo.findOne({ where: { id } });
    if (!company) {
      throw new NotFoundException(`Sub Area with ID ${id} not found`);
    }
    return company;
  }

  async create(dto: CreateAreasubDto): Promise<OmAreaSub> {
    // Jika tidak ada id, generate UUID otomatis (karena di DB defaultnya UUID())
    const newCompany = this.cRepo.create(dto);
    return this.cRepo.save(newCompany);
  }

  async update(id: string, dto: UpdateAreasubDto): Promise<OmAreaSub> {
    const company = await this.findOne(id);
    const updated = Object.assign(company, dto);
    return this.cRepo.save(updated);
  }

  async remove(id: string): Promise<{ message: string }> {
    const company = await this.findOne(id);
    await this.cRepo.remove(company);
    return { message: `Sub Area ${id} deleted successfully` };
  }
}
