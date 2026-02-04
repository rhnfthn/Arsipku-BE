import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { CreatePersonDto } from './dto/create-person.dto';
import { UpdatePersonDto } from './dto/update-person.dto';
import { AssignPositionDto } from './dto/assign-position.dto';
import { UpdateAssignPositionDto } from './dto/update-assign-position.dto';
import { Person } from './entities/person.entity';
import { RelationSp } from '../relation_sp/entities/relation_sp.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NaskahSirkulasi } from 'src/modules/naskah-sirkulasi/entities/naskah_sirkulasi.entity';
import { OrgDataService } from '../org_data/org_data.service';
import { PersonWithPositionDto } from './dto/person-with-position.dto';
import { OmPosition } from '../position/entities/om-position.entity';

@Injectable()
export class PersonService {
  constructor(
    @InjectRepository(Person)
    private readonly cRepo: Repository<Person>,
    @InjectRepository(RelationSp)
    private readonly relationSpRepo: Repository<RelationSp>,
    @InjectRepository(NaskahSirkulasi)
    private readonly naskahSirkulasiRepo: Repository<NaskahSirkulasi>,
    @InjectRepository(OmPosition)
    private readonly positionRepo: Repository<OmPosition>,
    private readonly orgDataService: OrgDataService,
  ) {}

  async findAll(): Promise<Person[]> {
    return this.cRepo.find({
      order: { createAt: 'DESC' },
    });
  }

  /**
   * Get persons by company (via relation tables)
   * @param companyId - Company ID
   * @param search - Optional search query to filter persons by name
   */
  async findByCompany(companyId: number, search?: string): Promise<Person[]> {
    // Use relation tables to find persons by company
    let query = `
      SELECT DISTINCT p.*
      FROM pa_personal p
      INNER JOIN om_relation_sp rsp ON rsp.relation_persnum = p.persnum
      WHERE rsp.company = ?
    `;

    const params: any[] = [companyId];

    // Add search filter if provided
    if (search && search.trim()) {
      query += ` AND p.name LIKE ?`;
      params.push(`%${search.trim()}%`);
    }

    query += ` ORDER BY p.name ASC`;
    
    const results = await this.cRepo.query(query, params);
    return results;
  }

  /**
   * Get persons by position
   * @param positionId - Position ID
   * @param search - Optional search query to filter persons by name
   */
  async findByPosition(positionId: number, search?: string) {
    let query = `
      SELECT DISTINCT p.*, rsp.id as id_relation_sp, rsp.position, pos.short_text as position_name,
             rsp.start_date, rsp.end_date
      FROM pa_personal p
      INNER JOIN om_relation_sp rsp ON rsp.relation_persnum = p.persnum
      LEFT JOIN om_position pos ON pos.position = rsp.position AND pos.company = rsp.company
      WHERE rsp.position = ?
    `;

    const params: any[] = [positionId];

    // Add search filter if provided
    if (search && search.trim()) {
      query += ` AND p.name LIKE ?`;
      params.push(`%${search.trim()}%`);
    }

    query += ` ORDER BY p.name ASC`;
    
    const results = await this.cRepo.query(query, params);
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
      throw new BadRequestException(
        `Person with persnum ${dto.persnum} already exists`
      );
    }

    const newPerson = this.cRepo.create(dto);
    const savedPerson = await this.cRepo.save(newPerson);

    // Create relation to position (om_relation_sp) if provided
    if (dto.company && dto.position && dto.persnum) {
      // Auto-fetch position_text from om_position
      const positionData = await this.positionRepo.findOne({
        where: {
          position: dto.position,
          company: dto.company,
        },
      });
      
      const relationSp = this.relationSpRepo.create({
        company: dto.company,
        position: dto.position,
        position_text: positionData?.shortText || dto.positionText,
        relation_persnum: dto.persnum,
        relation_persnum_text: dto.name,
        startDate: dto.startDate || '2025-01-01',
        endDate: dto.endDate || '9999-12-31',
        uname: dto.uname,
      });
      await this.relationSpRepo.save(relationSp);
    }

    return savedPerson;
  }

  async update(id: string, dto: UpdatePersonDto): Promise<Person> {
    const person = await this.findOne(id);
    
    if (person.persnum === null) {
      throw new BadRequestException('Person has invalid data');
    }

    // Update person fields
    const updated = Object.assign(person, dto);
    const savedPerson = await this.cRepo.save(updated);

    // Handle position relation (om_relation_sp)
    if (dto.position !== undefined || dto.company !== undefined) {
      // Find existing relation
      const existingRelation = await this.relationSpRepo.findOne({
        where: {
          relation_persnum: person.persnum,
        },
      });

      if (dto.position === null || dto.company === null) {
        // Remove relation if set to null
        if (existingRelation) {
          await this.relationSpRepo.remove(existingRelation);
        }
      } else if (dto.company && dto.position) {
        // Auto-fetch position_text from om_position
        const positionData = await this.positionRepo.findOne({
          where: {
            position: dto.position,
            company: dto.company,
          },
        });
        
        const positionText = positionData?.shortText || dto.positionText;
        
        // Update or create relation
        if (existingRelation) {
          existingRelation.company = dto.company;
          existingRelation.position = dto.position;
          existingRelation.position_text = positionText || null;
          existingRelation.relation_persnum_text = dto.name || person.name;
          existingRelation.startDate = dto.startDate || person.startDate;
          existingRelation.endDate = dto.endDate || person.endDate;
          existingRelation.uname = dto.uname || null;
          await this.relationSpRepo.save(existingRelation);
        } else {
          const newRelation = this.relationSpRepo.create({
            company: dto.company,
            position: dto.position,
            position_text: positionText,
            relation_persnum: person.persnum,
            relation_persnum_text: dto.name || person.name,
            startDate: dto.startDate || person.startDate || '2025-01-01',
            endDate: dto.endDate || person.endDate || '9999-12-31',
            uname: dto.uname,
          });
          await this.relationSpRepo.save(newRelation);
        }
      }
    }

    return savedPerson;
  }

  async remove(id: string): Promise<{ message: string }> {
    const person = await this.findOne(id);
    
    if (person.persnum === null) {
      throw new BadRequestException('Person has invalid data');
    }

    // Delete position relation (om_relation_sp) if exists
    const relationSp = await this.relationSpRepo.findOne({
      where: {
        relation_persnum: person.persnum,
      },
    });

    if (relationSp) {
      await this.relationSpRepo.remove(relationSp);
    }

    // Delete the person
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

  /**
   * Assign additional position to existing person
   * Creates new om_relation_sp record without modifying pa_personal
   * Allows one person to have multiple positions (e.g., in different companies)
   * 
   * @param dto - Position assignment data
   * @returns Created RelationSp record
   */
  async assignPosition(dto: AssignPositionDto): Promise<{
    success: boolean;
    message: string;
    data: RelationSp;
  }> {
    // 1. Verify person exists
    const person = await this.cRepo.findOne({
      where: { persnum: dto.persnum },
    });

    if (!person) {
      throw new NotFoundException(
        `Person with persnum ${dto.persnum} not found. Please create the person first.`
      );
    }

    // 2. Check if this exact position assignment already exists
    const existingRelation = await this.relationSpRepo.findOne({
      where: {
        relation_persnum: dto.persnum,
        company: dto.company,
        position: dto.position,
      },
    });

    if (existingRelation) {
      throw new BadRequestException(
        `Position ${dto.position} in company ${dto.company} is already assigned to person ${dto.persnum}`
      );
    }

    // 3. Auto-fetch position_text from om_position if not provided
    let positionText = dto.positionText;
    if (!positionText) {
      const positionData = await this.positionRepo.findOne({
        where: {
          position: dto.position,
          company: dto.company,
        },
      });
      
      if (positionData) {
        positionText = positionData.shortText || positionData.longText || undefined;
      }
    }

    // 4. Create new position assignment (om_relation_sp)
    const relationSp = this.relationSpRepo.create({
      company: dto.company,
      position: dto.position,
      position_text: positionText,
      relation_persnum: dto.persnum,
      relation_persnum_text: person.name,
      startDate: dto.startDate || '2025-01-01',
      endDate: dto.endDate || '9999-12-31',
      uname: dto.uname,
    });

    const savedRelation = await this.relationSpRepo.save(relationSp);

    return {
      success: true,
      message: `Successfully assigned position ${dto.position} to ${person.name} (persnum: ${dto.persnum})`,
      data: savedRelation,
    };
  }

  /**
   * Update existing position assignment
   * Modifies om_relation_sp record by id
   * 
   * @param id - RelationSp record id
   * @param dto - Update data
   * @returns Updated RelationSp record
   */
  async updateAssignPosition(
    id: string,
    dto: UpdateAssignPositionDto,
  ): Promise<{
    success: boolean;
    message: string;
    data: RelationSp;
  }> {
    // 1. Find the position assignment record
    const relationSp = await this.relationSpRepo.findOne({
      where: { id },
    });

    if (!relationSp) {
      throw new NotFoundException(
        `Position assignment with ID ${id} not found`
      );
    }

    // 2. Auto-fetch position_text from om_position if dto has positionText but we want to update it
    // or if the existing relation doesn't have position_text
    if (dto.positionText === undefined && !relationSp.position_text) {
      const positionData = await this.positionRepo.findOne({
        where: {
          position: relationSp.position || undefined,
          company: relationSp.company || undefined,
        },
      });
      
      if (positionData) {
        dto.positionText = positionData.shortText || positionData.longText || undefined;
      }
    }

    // 3. Update the record with provided data
    if (dto.positionText !== undefined) {
      relationSp.position_text = dto.positionText || null;
    }
    if (dto.startDate !== undefined) {
      relationSp.startDate = dto.startDate;
    }
    if (dto.endDate !== undefined) {
      relationSp.endDate = dto.endDate;
    }
    if (dto.uname !== undefined) {
      relationSp.uname = dto.uname;
    }

    // 4. Save the updated record
    const updatedRelation = await this.relationSpRepo.save(relationSp);

    return {
      success: true,
      message: `Successfully updated position assignment for ${relationSp.relation_persnum_text || 'person'} (ID: ${id})`,
      data: updatedRelation,
    };
  }

  /**
   * Delete existing position assignment
   * Removes om_relation_sp record by id
   * 
   * @param id - RelationSp record id
   * @returns Success message
   */
  async deleteAssignPosition(id: string): Promise<{
    success: boolean;
    message: string;
  }> {
    // 1. Find the position assignment record
    const relationSp = await this.relationSpRepo.findOne({
      where: { id },
    });

    if (!relationSp) {
      throw new NotFoundException(
        `Position assignment with ID ${id} not found`
      );
    }

    // Store info for response message before deletion
    const personName = relationSp.relation_persnum_text || 'person';
    const positionInfo = relationSp.position_text || `Position ${relationSp.position}`;

    // 2. Delete the record
    await this.relationSpRepo.remove(relationSp);

    return {
      success: true,
      message: `Successfully deleted position assignment: ${positionInfo} from ${personName}`,
    };
  }

  /**
   * Get all position assignments for a person
   * Returns all positions across all companies for a specific persnum
   * 
   * @param persnum - Person's persnum
   * @returns List of position assignments
   */
  async getPersonPositions(persnum: number): Promise<{
    success: boolean;
    persnum: number;
    personName: string;
    positions: Array<{
      id: string;
      company: number;
      companyText?: string;
      position: number;
      positionText: string;
      startDate: string;
      endDate: string;
      isActive: boolean;
    }>;
    total: number;
  }> {
    // 1. Verify person exists
    const person = await this.cRepo.findOne({
      where: { persnum },
    });

    if (!person) {
      throw new NotFoundException(
        `Person with persnum ${persnum} not found`
      );
    }

    // 2. Get all position assignments
    const relations = await this.relationSpRepo
      .createQueryBuilder('sp')
      .where('sp.relation_persnum = :persnum', { persnum })
      .orderBy('sp.company', 'ASC')
      .addOrderBy('sp.position', 'ASC')
      .getMany();

    // 3. Get today for active status check
    const now = new Date();
    const localDate = new Date(now.getTime() + 7 * 60 * 60 * 1000); // UTC+7
    const todayStr = localDate.toISOString().split('T')[0];

    // 4. Format response
    const positions = relations.map(rel => {
      const startDate = new Date(rel.startDate || '2025-01-01');
      const endDate = new Date(rel.endDate || '9999-12-31');
      const today = new Date(todayStr);
      
      startDate.setHours(0, 0, 0, 0);
      endDate.setHours(0, 0, 0, 0);
      today.setHours(0, 0, 0, 0);

      return {
        id: rel.id,
        company: rel.company || 0,
        companyText: undefined,
        position: rel.position || 0,
        positionText: rel.position_text || `Position ${rel.position}`,
        startDate: rel.startDate || '2025-01-01',
        endDate: rel.endDate || '9999-12-31',
        isActive: today >= startDate && today <= endDate,
      };
    });

    return {
      success: true,
      persnum,
      personName: person.name || `Person ${persnum}`,
      positions,
      total: positions.length,
    };
  }
}