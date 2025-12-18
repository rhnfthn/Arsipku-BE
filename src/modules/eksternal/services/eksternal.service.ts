import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { EksternalEntity } from '../entities/eksternal.entity';
import { CreateEksternalDto } from '../dto/eksternal/create_eksternal.dto';
import { UpdateEksternalDto } from '../dto/eksternal/update_eksternal.dto';
import { OrgDataService } from '../../master-data/org_data/org_data.service';

@Injectable()
export class EksternalService {
  constructor(
    @InjectRepository(EksternalEntity)
    private eksternalRepository: Repository<EksternalEntity>,
    private orgDataService: OrgDataService,
  ) {}

  /**
   * Helper method to get nama pembuat from org_data using id_position
   */
  private async getNamaPembuat(idPosition: string): Promise<string | null> {
    if (!idPosition) return null;

    try {
      const latestOrgData = await this.orgDataService.findLatestOrg();
      if (!latestOrgData?.position_json) return null;

      const positionJson = latestOrgData.position_json;
      
      if (!Array.isArray(positionJson)) return null;

      // Find position data by position field (id_position in DB matches position field in JSON)
      const positionData = positionJson.find(
        (pos) => Number(pos.position) === Number(idPosition)
      );

      // Return persnum_person_text as nama pembuat
      return positionData?.persnum_person_text || null;
    } catch (error) {
      console.error('Error getting nama pembuat:', error);
      return null;
    }
  }

  async create(createEksternalDto: CreateEksternalDto): Promise<EksternalEntity> {
    const eksternal = this.eksternalRepository.create({
      id: uuidv4(),
      ...createEksternalDto,
    });

    return await this.eksternalRepository.save(eksternal);
  }

  async findAll(company?: string, area?: string): Promise<any[]> {
    const query = this.eksternalRepository.createQueryBuilder('eksternal');

    if (company) {
      query.where('eksternal.company = :company', { company });
    }

    if (area) {
      query.andWhere('eksternal.area = :area', { area });
    }

    const eksternal = await query
      .where('eksternal.aktif = :aktif', { aktif: true })
      .orderBy('eksternal.nama', 'ASC')
      .getMany();

    // Add nama_pembuat for each item
    const results = await Promise.all(
      eksternal.map(async (item) => {
        const nama_pembuat = item.id_position_pembuat 
          ? await this.getNamaPembuat(item.id_position_pembuat)
          : null;
        
        return {
          ...item,
          nama_pembuat,
        };
      })
    );

    return results;
  }

  async findOne(id: string): Promise<any> {
    const eksternal = await this.eksternalRepository.findOne({
      where: { id },
    });

    if (!eksternal) {
      throw new NotFoundException('Eksternal tidak ditemukan');
    }

    // Add nama_pembuat
    const nama_pembuat = eksternal.id_position_pembuat 
      ? await this.getNamaPembuat(eksternal.id_position_pembuat)
      : null;

    return {
      ...eksternal,
      nama_pembuat,
    };
  }

  async update(id: string, updateEksternalDto: UpdateEksternalDto): Promise<any> {
    const eksternalData = await this.findOne(id);
    
    // Remove nama_pembuat from findOne result as it's computed
    const { nama_pembuat, ...eksternal } = eksternalData;

    Object.assign(eksternal, updateEksternalDto);
    const updated = await this.eksternalRepository.save(eksternal);

    // Add nama_pembuat to response
    const nama_pembuat_updated = updated.id_position_pembuat 
      ? await this.getNamaPembuat(updated.id_position_pembuat)
      : null;

    return {
      ...updated,
      nama_pembuat: nama_pembuat_updated,
    };
  }

  async remove(id: string): Promise<void> {
    const eksternalData = await this.findOne(id);
    
    // Remove nama_pembuat from findOne result
    const { nama_pembuat, ...eksternal } = eksternalData;
    
    await this.eksternalRepository.remove(eksternal as EksternalEntity);
  }

  async toggleAktif(id: string): Promise<any> {
    const eksternalData = await this.findOne(id);
    
    // Remove nama_pembuat from findOne result
    const { nama_pembuat, ...eksternal } = eksternalData;
    
    eksternal.aktif = !eksternal.aktif;
    const updated = await this.eksternalRepository.save(eksternal);

    // Add nama_pembuat to response
    const nama_pembuat_updated = updated.id_position_pembuat 
      ? await this.getNamaPembuat(updated.id_position_pembuat)
      : null;

    return {
      ...updated,
      nama_pembuat: nama_pembuat_updated,
    };
  }

  async findByEmail(email: string): Promise<EksternalEntity | null> {
    return await this.eksternalRepository.findOne({
      where: { email, aktif: true },
    });
  }
}
