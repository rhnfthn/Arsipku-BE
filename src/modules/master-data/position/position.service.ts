import { Injectable, NotFoundException } from '@nestjs/common';
import { CreatePositionDto } from './dto/create-position.dto';
import { UpdatePositionDto } from './dto/update-position.dto';
import { OmPosition } from './entities/om-position.entity';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';

@Injectable()
export class PositionService {
  constructor(
    @InjectRepository(OmPosition)
    private readonly cRepo: Repository<OmPosition>,
  ) {}

  async findAll(): Promise<OmPosition[]> {
    return this.cRepo.find({
      order: { createAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<OmPosition> {
    const company = await this.cRepo.findOne({ where: { id } });
    if (!company) {
      throw new NotFoundException(`Area with ID ${id} not found`);
    }
    return company;
  }

  async create(dto: CreatePositionDto): Promise<OmPosition> {
    // Jika tidak ada id, generate UUID otomatis (karena di DB defaultnya UUID())
    const newCompany = this.cRepo.create(dto);
    return this.cRepo.save(newCompany);
  }

  async update(id: string, dto: UpdatePositionDto): Promise<OmPosition> {
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
