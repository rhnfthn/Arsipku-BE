import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { OmCompany } from './entities/om-company.entity';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { OmOrganization } from '../organization/entities/om-organization.entity';
import { OmPosition } from '../position/entities/om-position.entity';
import { Person } from '../person/entities/person.entity';

@Injectable()
export class CompanyService {
  constructor(
    @InjectRepository(OmCompany)
    private readonly companyRepo: Repository<OmCompany>,
    @InjectRepository(OmOrganization)
    private readonly organizationRepo: Repository<OmOrganization>,
    @InjectRepository(OmPosition)
    private readonly positionRepo: Repository<OmPosition>,
    @InjectRepository(Person)
    private readonly personRepo: Repository<Person>,
    private readonly dataSource: DataSource,
  ) {}

  async findAll(): Promise<OmCompany[]> {
    return this.companyRepo.find({
      order: { createAt: 'DESC' },
    });
  }

  /**
   * Get complete organizational tree structure for a company
   * Returns hierarchical structure: Company → Organizations → Positions → Persons
   */
  async getCompanyTree(companyId: number) {
    // Get company info
    const company = await this.companyRepo.findOne({
      where: { company: companyId },
    });

    if (!company) {
      throw new NotFoundException(`Company with ID ${companyId} not found`);
    }

    // Get all organizations for this company
    const organizations = await this.organizationRepo.find({
      where: { company: companyId },
      order: { organization: 'ASC' },
    });

    // Get all positions for this company
    const positions = await this.positionRepo.find({
      where: { company: companyId },
      order: { position: 'ASC' },
    });

    // Get all persons linked to positions in this company via om_relation_sp
    const personsQuery = `
      SELECT DISTINCT 
        p.*,
        rsp.position,
        rsp.company,
        pos.short_text as position_name
      FROM pa_personal p
      INNER JOIN om_relation_sp rsp ON rsp.relation_persnum = p.persnum
      LEFT JOIN om_position pos ON pos.position = rsp.position AND pos.company = rsp.company
      WHERE rsp.company = ?
      ORDER BY p.name ASC
    `;

    const persons = await this.dataSource.query(personsQuery, [companyId]);

    // Build hierarchical structure
    const organizationsWithDetails = organizations.map((org) => {
      // Get positions for this organization (if you have org-position relation)
      // For now, including all positions in company
      const orgPositions = positions.map((pos) => {
        // Get persons for this position
        const posPersons = persons.filter(
          (person: any) =>
            person.position === pos.position && person.company === companyId,
        );

        return {
          id: pos.id,
          position: pos.position,
          positionName: pos.shortText,
          positionDescription: pos.longText,
          abbreviation: pos.abbreviation,
          startDate: pos.startDate,
          endDate: pos.endDate,
          personsCount: posPersons.length,
          persons: posPersons.map((person: any) => ({
            id: person.id,
            persnum: person.persnum,
            name: person.name,
            gender: person.gender,
            startDate: person.start_date,
            endDate: person.end_date,
          })),
        };
      });

      return {
        id: org.id,
        organization: org.organization,
        organizationName: org.shortText,
        organizationDescription: org.longText,
        abbreviation: org.abbreviation,
        startDate: org.startDate,
        endDate: org.endDate,
        positionsCount: orgPositions.length,
        personsCount: orgPositions.reduce(
          (sum, pos) => sum + pos.personsCount,
          0,
        ),
        positions: orgPositions,
      };
    });

    // Calculate totals
    const totalOrganizations = organizations.length;
    const totalPositions = positions.length;
    const totalPersons = persons.length;

    return {
      company: {
        id: company.id,
        companyId: company.company,
        companyName: company.shortText,
        companyDescription: company.longText,
        startDate: company.startDate,
        endDate: company.endDate,
      },
      statistics: {
        totalOrganizations,
        totalPositions,
        totalPersons,
      },
      organizations: organizationsWithDetails,
    };
  }

  async findOne(id: string): Promise<OmCompany> {
    const company = await this.companyRepo.findOne({ where: { id } });
    if (!company) {
      throw new NotFoundException(`Company with ID ${id} not found`);
    }
    return company;
  }

  /**
   * Generate kode perusahaan 4 digit berikutnya.
   * Dimulai dari 1000 untuk perusahaan pertama, n+1 untuk selanjutnya.
   * Hanya menghitung kode dalam rentang 1000–9999 (4 digit), sehingga
   * kode legacy seperti 10000 (PERUM LPPNPI), 90001, 90002, 1, 123 diabaikan.
   */
  private async generateCompanyCode(): Promise<number> {
    const result = await this.companyRepo
      .createQueryBuilder('company')
      .select('MAX(company.company)', 'maxCode')
      .where('company.company >= 1000 AND company.company < 10000')
      .getRawOne();

    const maxCode = result?.maxCode ? Number(result.maxCode) : 0;
    return Math.max(maxCode + 1, 1000);
  }

  async create(dto: CreateCompanyDto): Promise<OmCompany> {
    // Kode perusahaan auto-generate (4 digit, mulai 1000) — abaikan dari payload.
    const { company: _ignored, endDate, ...rest } = dto;
    const companyCode = await this.generateCompanyCode();

    const newCompany = this.companyRepo.create({
      ...rest,
      company: companyCode,
      // Default end date 31 Desember 9999 (tidak ditampilkan di UI).
      endDate: endDate || '9999-12-31',
    });
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
