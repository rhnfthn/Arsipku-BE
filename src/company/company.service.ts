import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OmCompany } from './entities/om-company.entity';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';

@Injectable()
export class CompanyService {
  constructor(
    @InjectRepository(OmCompany)
    private readonly companyRepo: Repository<OmCompany>,
  ) {}

  async findAll(): Promise<OmCompany[]> {
    return this.companyRepo.find({
      order: { createAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<OmCompany> {
    const company = await this.companyRepo.findOne({ where: { id } });
    if (!company) {
      throw new NotFoundException(`Company with ID ${id} not found`);
    }
    return company;
  }

  async create(dto: CreateCompanyDto): Promise<OmCompany> {
    // Jika tidak ada id, generate UUID otomatis (karena di DB defaultnya UUID())
    const newCompany = this.companyRepo.create(dto);
    return this.companyRepo.save(newCompany);
  }

  async update(id: string, dto: UpdateCompanyDto): Promise<OmCompany> {
    const company = await this.findOne(id);
    const updated = Object.assign(company, dto);
    return this.companyRepo.save(updated);
  }

  async remove(id: string): Promise<{ message: string }> {
    const company = await this.findOne(id);
    await this.companyRepo.remove(company);
    return { message: `Company ${id} deleted successfully` };
  }
}
