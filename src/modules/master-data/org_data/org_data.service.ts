import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CreateOrgDatumDto } from './dto/create-org_datum.dto';
import { UpdateOrgDatumDto } from './dto/update-org_datum.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { OrgDatum } from './entities/org_datum.entity';
import { Repository } from 'typeorm';

@Injectable()
export class OrgDataService {
  constructor(
    @InjectRepository(OrgDatum)
    private readonly cRepo: Repository<OrgDatum>,
  ) {}

  async findAll(): Promise<OrgDatum[]> {
    return this.cRepo.find({
      order: { createAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<OrgDatum> {
    const company = await this.cRepo.findOne({ where: { id } });
    if (!company) {
      throw new NotFoundException(`Data with ID ${id} not found`);
    }
    return company;
  }

  async create(dto: CreateOrgDatumDto): Promise<OrgDatum> {
    // Jika tidak ada id, generate UUID otomatis (karena di DB defaultnya UUID())
    const newCompany = this.cRepo.create(dto);
    return this.cRepo.save(newCompany);
  }

  async update(id: string, dto: UpdateOrgDatumDto): Promise<OrgDatum> {
    const company = await this.findOne(id);
    const updated = Object.assign(company, dto);
    return this.cRepo.save(updated);
  }

  async remove(id: string): Promise<{ message: string }> {
    const company = await this.findOne(id);
    await this.cRepo.remove(company);
    return { message: `Area ${id} deleted successfully` };
  }

  async createOrUpdate(tgl: string, organization_json: any, position_json: any) {
    if (!tgl) {
      throw new BadRequestException('Tanggal (tgl) is required');
    }

    const existing = await this.cRepo.findOne({ where: { tgl } });

    if (existing) {
      // UPDATE
      existing.organization_json = organization_json;
      existing.position_json = position_json;
      return this.cRepo.save(existing);
    }

    // INSERT
    const newData = this.cRepo.create({
      tgl,
      organization_json,
      position_json,
    });

    return this.cRepo.save(newData);
  }

  async findOrg(tgl: string) {
    if (!tgl) {
      throw new BadRequestException('Tanggal (tgl) is required');
    }

    const result = await this.cRepo.findOne({ where: { tgl } });

    if (!result) {
      throw new NotFoundException(`Data untuk tanggal ${tgl} tidak ditemukan`);
    }

    return result;
  }

  /**
   * Find user by persnum from organization_json
   * Used for SSO authentication
   * 
   * Structure: organization_json is nested hierarchy
   * User data is in: positions[].person.persnum
   */
  async findByPersnum(persnum: number): Promise<any | null> {
    try {
      console.log(`[OrgDataService] Searching for persnum: ${persnum}`);
      
      // Get latest org data from organization_build table
      const latestOrgData = await this.cRepo
        .createQueryBuilder('organization_build')
        .orderBy('organization_build.tgl', 'DESC')
        .limit(1)
        .getOne();

      if (!latestOrgData) {
        console.log('[OrgDataService] No data found in organization_build table');
        return null;
      }

      console.log(`[OrgDataService] Found org data with tgl: ${latestOrgData.tgl}`);

      if (!latestOrgData.organization_json) {
        console.log('[OrgDataService] organization_json is null or empty');
        return null;
      }

      const orgJson = latestOrgData.organization_json;
      
      if (!Array.isArray(orgJson)) {
        console.log('[OrgDataService] organization_json is not an array');
        console.log('[OrgDataService] Type:', typeof orgJson);
        return null;
      }

      console.log(`[OrgDataService] Searching in ${orgJson.length} organization records`);

      // Recursive function to search user in nested structure
      const searchPersnum = parseInt(String(persnum));
      
      const findUserInOrg = (orgs: any[]): any | null => {
        for (const org of orgs) {
          // Check all positions in this organization
          if (org.positions && Array.isArray(org.positions)) {
            for (const position of org.positions) {
              if (position.person && position.person.persnum) {
                const positionPersnum = parseInt(String(position.person.persnum));
                
                if (positionPersnum === searchPersnum) {
                  // Found! Return combined data
                  return {
                    persnum: position.person.persnum,
                    nama: position.person.persnum_text,
                    company: org.company,
                    companyText: org.company_name,
                    area: org.area,
                    areaText: org.area_text,
                    subArea: org.sub_area,
                    subAreaText: org.sub_area_text,
                    organization: org.id,
                    organizationText: org.name,
                    organizationAbbreviation: org.abbreviation,
                    position: position.position,
                    positionText: position.position_text,
                    positionAbbreviation: position.abbreviation,
                    isChief: position.chief === 1,
                    bodTag: position.bod_tag,
                  };
                }
              }
            }
          }
          
          // Recursively search in children
          if (org.children && Array.isArray(org.children)) {
            const found = findUserInOrg(org.children);
            if (found) return found;
          }
        }
        return null;
      };

      const userOrg = findUserInOrg(orgJson);

      if (!userOrg) {
        console.log(`[OrgDataService] User with persnum ${persnum} not found in organization_json`);
        // Sample some persnum from first few positions
        const samplePersnums: number[] = [];
        for (const org of orgJson.slice(0, 3)) {
          if (org.positions) {
            for (const pos of org.positions.slice(0, 2)) {
              if (pos.person?.persnum) {
                samplePersnums.push(pos.person.persnum);
              }
            }
          }
        }
        console.log(`[OrgDataService] Sample persnum from data:`, samplePersnums);
      } else {
        console.log(`[OrgDataService] Found user:`, userOrg.nama);
        console.log(`[OrgDataService] User position:`, userOrg.position);
        console.log(`[OrgDataService] User data:`, JSON.stringify(userOrg, null, 2));
      }

      return userOrg || null;
    } catch (error) {
      console.error('[OrgDataService] Error in findByPersnum:', error);
      throw error;
    }
  }
}
