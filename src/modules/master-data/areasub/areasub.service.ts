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

  async findAll(): Promise<any[]> {
    const subAreas = await this.subAreaRepo.find({
      order: { createAt: 'DESC' },
    });
    return await this.enrichWithAlamat(subAreas);
  }

  /**
   * Get all sub areas by company
   */
  async findByCompany(companyId: number): Promise<any[]> {
    const subAreas = await this.subAreaRepo.find({
      where: { company: companyId },
      order: { area: 'ASC', sub_area: 'ASC' },
    });
    return await this.enrichWithAlamat(subAreas);
  }

  /**
   * Get all sub areas by company and area
   */
  async findByCompanyAndArea(
    companyId: number,
    areaCode: string,
  ): Promise<any[]> {
    const subAreas = await this.subAreaRepo.find({
      where: { company: companyId, area: areaCode },
      order: { sub_area: 'ASC' },
    });
    return await this.enrichWithAlamat(subAreas);
  }

  async findOne(id: string): Promise<any> {
    const subArea = await this.subAreaRepo.findOne({ where: { id } });
    if (!subArea) {
      throw new NotFoundException(`Sub Area with ID ${id} not found`);
    }
    const enriched = await this.enrichWithAlamat([subArea]);
    return enriched[0];
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

  async update(
    id: string,
    companyId: number,
    dto: UpdateAreasubDto,
  ): Promise<any> {
    // Fetch existing sub area
    const subAreaData = await this.subAreaRepo.findOne({ where: { id } });
    if (!subAreaData) {
      throw new NotFoundException(`Sub Area with ID ${id} not found`);
    }

    // Store old values for sub_area_alamat lookup
    const oldCompany = subAreaData.company?.toString() || '';
    const oldArea = subAreaData.area || '';
    const oldSubArea = subAreaData.sub_area?.toString() || '';

    // Manually assign each field from DTO
    if (dto.area !== undefined) subAreaData.area = dto.area;
    if (dto.sub_area !== undefined) subAreaData.sub_area = dto.sub_area;
    if (dto.shortText !== undefined) subAreaData.shortText = dto.shortText;
    if (dto.longText !== undefined) subAreaData.longText = dto.longText;
    if (dto.startDate !== undefined) subAreaData.startDate = dto.startDate;
    if (dto.endDate !== undefined) subAreaData.endDate = dto.endDate;
    if (dto.uname !== undefined) subAreaData.uname = dto.uname;

    // Always update company from route params
    subAreaData.company = companyId;

    // Save sub area
    const saved = await this.subAreaRepo.save(subAreaData);

    // Update sub_area_alamat jika ada field alamat yang dikirim
    if (
      dto.kantor !== undefined ||
      dto.kantor_english !== undefined ||
      dto.gedung !== undefined ||
      dto.gedung_english !== undefined ||
      dto.alamat !== undefined ||
      dto.alamat_english !== undefined ||
      dto.telepon !== undefined ||
      dto.logo !== undefined ||
      dto.kota !== undefined
    ) {
      try {
        // Cari existing sub_area_alamat berdasarkan old values
        const existingAlamat = await this.subAreaAlamatService.findBySubArea(
          oldCompany,
          oldArea,
          oldSubArea,
        );

        // Update existing alamat
        await this.subAreaAlamatService.update(existingAlamat.id, {
          company: companyId.toString(),
          area: dto.area || oldArea,
          sub_area: (dto.sub_area || subAreaData.sub_area)?.toString() || '',
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
        // Jika tidak ada alamat existing, create new
        try {
          await this.subAreaAlamatService.create({
            company: companyId.toString(),
            area: saved.area || '',
            sub_area: saved.sub_area?.toString() || '',
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
        } catch (createError) {
          console.error(
            'Failed to create sub_area_alamat on update:',
            createError,
          );
        }
      }
    }

    // Return with alamat
    const enriched = await this.enrichWithAlamat([saved]);
    return enriched[0];
  }

  async remove(id: string): Promise<{ message: string }> {
    const subArea = await this.subAreaRepo.findOne({ where: { id } });
    if (!subArea) {
      throw new NotFoundException(`Sub Area with ID ${id} not found`);
    }

    // Delete related sub_area_alamat first (if exists)
    try {
      const existingAlamat = await this.subAreaAlamatService.findBySubArea(
        subArea.company?.toString() || '',
        subArea.area || '',
        subArea.sub_area?.toString() || '',
      );

      if (existingAlamat) {
        await this.subAreaAlamatService.remove(existingAlamat.id);
      }
    } catch (error) {
      // Jika tidak ada alamat, lanjut delete sub area
    }

    // Delete sub area
    await this.subAreaRepo.remove(subArea);
    return { message: `Sub Area ${id} deleted successfully` };
  }

  /**
   * Helper method to enrich sub areas with alamat data from sub_area_alamat table
   */
  private async enrichWithAlamat(subAreas: OmAreaSub[]): Promise<any[]> {
    const enrichedSubAreas = await Promise.all(
      subAreas.map(async (subArea) => {
        let alamat: string | null = null;

        // Fetch alamat from sub_area_alamat table
        try {
          const subAreaAlamat = await this.subAreaAlamatService.findBySubArea(
            subArea.company?.toString() || '',
            subArea.area || '',
            subArea.sub_area?.toString() || '',
          );

          if (subAreaAlamat && subAreaAlamat.alamat) {
            alamat = subAreaAlamat.alamat;
          }
        } catch (error) {
          // If not found, alamat will remain null
        }

        return {
          ...subArea,
          alamat,
        };
      }),
    );

    return enrichedSubAreas;
  }
}
