import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { Repository } from 'typeorm';
import { OmOrganization } from './entities/om-organization.entity';
import { InjectRepository } from '@nestjs/typeorm';

@Injectable()
export class OrganizationService {
  constructor(
    @InjectRepository(OmOrganization)
    private readonly cRepo: Repository<OmOrganization>,
  ) {}

  async findAll(): Promise<OmOrganization[]> {
    return this.cRepo.find({
      order: { createAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<OmOrganization> {
    const company = await this.cRepo.findOne({ where: { id } });
    if (!company) {
      throw new NotFoundException(`Area with ID ${id} not found`);
    }
    return company;
  }

  async create(dto: CreateOrganizationDto): Promise<OmOrganization> {
    // Jika tidak ada id, generate UUID otomatis (karena di DB defaultnya UUID())
    const newCompany = this.cRepo.create(dto);
    return this.cRepo.save(newCompany);
  }

  async update(
    id: string,
    dto: UpdateOrganizationDto,
  ): Promise<OmOrganization> {
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
