import { Injectable, NotFoundException } from '@nestjs/common';
import { CreatePersonDto } from './dto/create-person.dto';
import { UpdatePersonDto } from './dto/update-person.dto';
import { Person } from './entities/person.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NaskahSirkulasi } from 'src/modules/naskah-sirkulasi/entities/naskah_sirkulasi.entity';
import { OrgDataService } from '../org_data/org_data.service';
import { PersonWithPositionDto } from './dto/person-with-position.dto';

@Injectable()
export class PersonService {
  constructor(
    @InjectRepository(Person)
    private readonly cRepo: Repository<Person>,
    @InjectRepository(NaskahSirkulasi)
    private readonly naskahSirkulasiRepo: Repository<NaskahSirkulasi>,
    private readonly orgDataService: OrgDataService,
  ) { }

  async findAll(): Promise<Person[]> {
    return this.cRepo.find({
      order: { createAt: 'DESC' },
    });
  }

  /**
   * Get persons by company (via relation tables)
   */
  async findByCompany(companyId: number): Promise<Person[]> {
    // Use relation tables to find persons by company
    const query = `
      SELECT DISTINCT p.*
      FROM pa_personal p
      INNER JOIN om_relation_sp rsp ON rsp.relation_persnum = p.persnum
      WHERE rsp.company = ?
      ORDER BY p.name ASC
    `;
    
    const results = await this.cRepo.query(query, [companyId]);
    return results;
  }

  /**
   * Get persons by position
   */
  async findByPosition(positionId: number) {
    const query = `
      SELECT DISTINCT p.*, rsp.position, pos.short_text as position_name
      FROM pa_personal p
      INNER JOIN om_relation_sp rsp ON rsp.relation_persnum = p.persnum
      LEFT JOIN om_position pos ON pos.position = rsp.position AND pos.company = rsp.company
      WHERE rsp.position = ?
      ORDER BY p.name ASC
    `;
    
    const results = await this.cRepo.query(query, [positionId]);
    return results;
  }

  /**
   * Get persons by organization
   */
  async findByOrganization(companyId: number, organizationId: number) {
    const query = `
      SELECT DISTINCT p.*, rsp.position, pos.short_text as position_name,
             org.short_text as organization_name
      FROM pa_personal p
      INNER JOIN om_relation_sp rsp ON rsp.relation_persnum = p.persnum
      LEFT JOIN om_position pos ON pos.position = rsp.position AND pos.company = rsp.company
      LEFT JOIN om_relation_oo roo ON roo.company = rsp.company
      LEFT JOIN om_organization org ON org.organization = roo.organization AND org.company = roo.company
      WHERE rsp.company = ? AND org.organization = ?
      ORDER BY p.name ASC
    `;
    
    const results = await this.cRepo.query(query, [companyId, organizationId]);
    return results;
  }

  /**
   * Search persons by name
   */
  async searchByName(name: string): Promise<Person[]> {
    return this.cRepo
      .createQueryBuilder('person')
      .where('person.name LIKE :name', { name: `%${name}%` })
      .orderBy('person.name', 'ASC')
      .getMany();
  }

  /**
   * Get person with full details (position, organization, etc)
   */
  async findOneWithDetails(persnum: number) {
    const query = `
      SELECT 
        p.*,
        rsp.position,
        pos.short_text as position_name,
        pos.long_text as position_description,
        rsp.company,
        comp.short_text as company_name,
        org.organization,
        org.short_text as organization_name,
        area.area as area_code,
        area.short_text as area_name,
        asub.sub_area as sub_area_code,
        asub.short_text as sub_area_name
      FROM pa_personal p
      LEFT JOIN om_relation_sp rsp ON rsp.persnum = p.persnum
      LEFT JOIN om_position pos ON pos.position = rsp.position AND pos.company = rsp.company
      LEFT JOIN om_company comp ON comp.company = rsp.company
      LEFT JOIN om_relation_oo roo ON roo.company = rsp.company
      LEFT JOIN om_organization org ON org.organization = roo.organization AND org.company = roo.company
      LEFT JOIN om_area area ON area.company = rsp.company
      LEFT JOIN om_area_sub asub ON asub.company = rsp.company AND asub.area = area.area
      WHERE p.persnum = ?
      LIMIT 1
    `;
    
    const results = await this.cRepo.query(query, [persnum]);
    
    if (!results || results.length === 0) {
      throw new NotFoundException(`Person with persnum ${persnum} not found`);
    }
    
    return results[0];
  }

  async findOne(id: string): Promise<Person> {
    const person = await this.cRepo.findOne({ where: { id } });
    if (!person) {
      throw new NotFoundException(`Person with ID ${id} not found`);
    }
    return person;
  }

  async create(dto: CreatePersonDto): Promise<Person> {
    // Check if persnum already exists
    const existing = await this.cRepo.findOne({
      where: { persnum: dto.persnum },
    });

    if (existing) {
      throw new NotFoundException(
        `Person with persnum ${dto.persnum} already exists`
      );
    }

    const newPerson = this.cRepo.create(dto);
    return this.cRepo.save(newPerson);
  }

  async update(id: string, dto: UpdatePersonDto): Promise<Person> {
    const person = await this.findOne(id);
    const updated = Object.assign(person, dto);
    return this.cRepo.save(updated);
  }

  async remove(id: string): Promise<{ message: string }> {
    const person = await this.findOne(id);
    await this.cRepo.remove(person);
    return { message: `Person ${id} deleted successfully` };
  }

  async countNaskahBySirkuler(
    persnum: number,
    type: 'pengirim' | 'penerima',
  ): Promise<{
    message: string;
    data: {
      persnum: number;
      type: 'pengirim' | 'penerima';
      count: number;
    };
  }> {
    const count = await this.naskahSirkulasiRepo.count({
      where: {
        idSirkuler: persnum.toString(),
        sirkuler: type,
      },
    });

    return {
      message: 'Data retrieved successfully',
      data: {
        persnum,
        type,
        count,
      },
    };
  }

  async findAllWithPosition(): Promise<PersonWithPositionDto[]> {
    const persons = await this.cRepo.find({
      order: { createAt: 'DESC' },
    });

    // Get org data to enrich person data with position information
    const orgData = await this.orgDataService.findAll();
    const latestOrgData = orgData.length > 0 ? orgData[0] : null;

    if (!latestOrgData || !latestOrgData.position_json) {
      // Return empty array if org data is not available
      return [];
    }

    // Create a map of persnum -> position data for fast lookup
    // Only include positions with chief=1 (managerial)
    // Using position_json which is already flattened and contains sub_area_text
    const positionMap = new Map<number, any>();

    const positionJsonData = Array.isArray(latestOrgData.position_json)
      ? latestOrgData.position_json
      : [];

    for (const position of positionJsonData) {
      // Filter only managerial positions (chief=1)
      if (position.chief !== 1) {
        continue;
      }

      // Match by persnum or persnum_person
      const persnum = position.persnum ?? position.persnum_person;
      if (persnum) {
        positionMap.set(Number(persnum), {
          persnum: persnum,
          nama: position.persnum_person_text ?? position.nama,
          position: position.position,
          position_text: position.position_text,
          sub_area: position.sub_area || null,
          sub_area_text: position.sub_area_text || null,
        });
      }
    }

    // Map persons to DTOs with position data
    return persons
      .filter((person) => person.persnum && positionMap.has(person.persnum))
      .map((person) => {
        const posData = positionMap.get(person.persnum!);
        return {
          persnum: posData.persnum,
          nama: posData.nama,
          position: posData.position,
          position_text: posData.position_text,
          sub_area: posData.sub_area,
          sub_area_text: posData.sub_area_text,
        };
      });
  }
}