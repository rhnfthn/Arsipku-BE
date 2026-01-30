import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateAreasubDto } from './dto/create-areasub.dto';
import { UpdateAreasubDto } from './dto/update-areasub.dto';
import { OmAreaSub } from './entities/om-areasub.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SubAreaAlamatService } from '../../sub-area-alamat/services/sub_area_alamat.service';

@Injectable()
export class AreasubService {
  constructor(
    @InjectRepository(OmAreaSub)
    private readonly subAreaRepo: Repository<OmAreaSub>,
    private readonly subAreaAlamatService: SubAreaAlamatService,
  ) {}

  async findAll(): Promise<OmAreaSub[]> {
    return this.subAreaRepo.find({
      order: { createAt: 'DESC' },
    });
  }

  /**
   * Get all sub areas by company
   */
  async findByCompany(companyId: number): Promise<OmAreaSub[]> {
    return this.subAreaRepo.find({
      where: { company: companyId },
      order: { area: 'ASC', sub_area: 'ASC' },
    });
  }

  /**
   * Get all sub areas by company and area
   */
  async findByCompanyAndArea(companyId: number, areaCode: string): Promise<OmAreaSub[]> {
    return this.subAreaRepo.find({
      where: { company: companyId, area: areaCode },
      order: { sub_area: 'ASC' },
    });
  }

  async findOne(id: string): Promise<OmAreaSub> {
    const subArea = await this.subAreaRepo.findOne({ where: { id } });
    if (!subArea) {
      throw new NotFoundException(`Sub Area with ID ${id} not found`);
    }
    return subArea;
  }

  async create(companyId: number, dto: CreateAreasubDto): Promise<OmAreaSub> {
    // Create sub area
    const newSubArea = this.subAreaRepo.create({
      area: dto.area,
      sub_area: dto.sub_area,
      shortText: dto.shortText,
      longText: dto.longText,
      startDate: dto.startDate,
      endDate: dto.endDate,
      uname: dto.uname,
      company: companyId,
    });
    const savedSubArea = await this.subAreaRepo.save(newSubArea);

    // Auto-insert ke sub_area_alamat jika ada field alamat
    if (
      dto.kantor ||
      dto.kantor_english ||
      dto.gedung ||
      dto.gedung_english ||
      dto.alamat ||
      dto.alamat_english ||
      dto.telepon ||
      dto.logo ||
      dto.kota
    ) {
      try {
        await this.subAreaAlamatService.create({
          company: companyId.toString(),
          area: dto.area,
          sub_area: dto.sub_area.toString(),
          start_date: dto.startDate,
          end_date: dto.endDate,
          kantor: dto.kantor,
          kantor_english: dto.kantor_english,
          gedung: dto.gedung,
          gedung_english: dto.gedung_english,
          alamat: dto.alamat,
          alamat_english: dto.alamat_english,
          telepon: dto.telepon,
          logo: dto.logo,
          kota: dto.kota,
        });
      } catch (error) {
        // Log error tapi tidak throw agar create sub area tetap sukses
        console.error('Failed to create sub_area_alamat:', error);
      }
    }

    return savedSubArea;
  }

  async update(id: string, companyId: number, dto: UpdateAreasubDto): Promise<OmAreaSub> {
    // Fetch existing sub area
    const subArea = await this.findOne(id);
    
    // Manually assign each field from DTO
    if (dto.area !== undefined) subArea.area = dto.area;
    if (dto.sub_area !== undefined) subArea.sub_area = dto.sub_area;
    if (dto.shortText !== undefined) subArea.shortText = dto.shortText;
    if (dto.longText !== undefined) subArea.longText = dto.longText;
    if (dto.startDate !== undefined) subArea.startDate = dto.startDate;
    if (dto.endDate !== undefined) subArea.endDate = dto.endDate;
    if (dto.uname !== undefined) subArea.uname = dto.uname;
    
    // Always update company from route params
    subArea.company = companyId;
    
    // Save and return
    const saved = await this.subAreaRepo.save(subArea);
    return saved;
  }

  async remove(id: string): Promise<{ message: string }> {
    const subArea = await this.findOne(id);
    await this.subAreaRepo.remove(subArea);
    return { message: `Sub Area ${id} deleted successfully` };
  }
}
