import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateAreaDto } from './dto/create-area.dto';
import { UpdateAreaDto } from './dto/update-area.dto';
import { OmArea } from './entities/om-area.entity';
import { OmAreaSub } from '../areasub/entities/om-areasub.entity';

@Injectable()
export class AreaService {
  constructor(
    @InjectRepository(OmArea)
    private readonly areaRepo: Repository<OmArea>,
    @InjectRepository(OmAreaSub)
    private readonly areaSubRepo: Repository<OmAreaSub>,
  ) {}

  async findAll(): Promise<OmArea[]> {
    return this.areaRepo.find({
      order: { createAt: 'DESC' },
    });
  }

  /**
   * Get all areas by company with sub areas count
   */
  async findByCompany(companyId: number): Promise<any[]> {
    const areas = await this.areaRepo.find({
      where: { company: companyId },
      order: { area: 'ASC' },
    });

    // Get sub areas count for each area
    const result = await Promise.all(
      areas.map(async (area) => {
        const subAreasCount = await this.areaSubRepo.count({
          where: { company: companyId, area: area.area ?? undefined },
        });
        return {
          ...area,
          subAreasCount,
        };
      }),
    );

    return result;
  }

  async findOne(id: string): Promise<OmArea> {
    const area = await this.areaRepo.findOne({ where: { id } });
    if (!area) {
      throw new NotFoundException(`Area with ID ${id} not found`);
    }
    return area;
  }

  /**
   * Find area by company and area code
   */
  async findByCompanyAndArea(
    companyId: number,
    areaCode: string,
  ): Promise<OmArea> {
    const area = await this.areaRepo.findOne({
      where: { company: companyId, area: areaCode },
    });
    if (!area) {
      throw new NotFoundException(
        `Area with company ${companyId} and area ${areaCode} not found`,
      );
    }
    return area;
  }

  async create(companyId: number, dto: CreateAreaDto): Promise<OmArea> {
    const newArea = this.areaRepo.create({
      ...dto,
      company: companyId,
    });
    return this.areaRepo.save(newArea);
  }

  async update(
    id: string,
    companyId: number,
    dto: UpdateAreaDto,
  ): Promise<OmArea> {
    // Fetch existing area
    const area = await this.findOne(id);

    // Manually assign each field from DTO
    if (dto.area !== undefined) area.area = dto.area;
    if (dto.shortText !== undefined) area.shortText = dto.shortText;
    if (dto.longText !== undefined) area.longText = dto.longText;
    if (dto.startDate !== undefined) area.startDate = dto.startDate;
    if (dto.endDate !== undefined) area.endDate = dto.endDate;
    if (dto.uname !== undefined) area.uname = dto.uname;

    // Always update company from route param
    area.company = companyId;

    // Save and return
    const saved = await this.areaRepo.save(area);
    return saved;
  }

  async remove(id: string): Promise<{ message: string }> {
    const area = await this.findOne(id);
    await this.areaRepo.remove(area);
    return { message: `Area ${id} deleted successfully` };
  }
}
