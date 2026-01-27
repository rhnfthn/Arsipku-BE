import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { Repository, DataSource } from 'typeorm';
import { OmOrganization } from './entities/om-organization.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { OmArea } from '../area/entities/om-area.entity';
import { OmAreaSub } from '../areasub/entities/om-areasub.entity';

@Injectable()
export class OrganizationService {
  constructor(
    @InjectRepository(OmOrganization)
    private readonly orgRepo: Repository<OmOrganization>,
    private readonly dataSource: DataSource,
  ) {}

  async findAll(): Promise<OmOrganization[]> {
    return this.orgRepo.find({
      order: { organization: 'ASC', createAt: 'DESC' },
    });
  }

  /**
   * Get all organizations by company
   */
  async findByCompany(companyId: number): Promise<OmOrganization[]> {
    return this.orgRepo.find({
      where: { company: companyId },
      order: { organization: 'ASC' },
    });
  }

  /**
   * Get organization tree structure with hierarchy
   */
  async findTreeByCompany(companyId: number) {
    const organizations = await this.findByCompany(companyId);
    
    // Build tree structure (simplified - you can enhance this based on your needs)
    return {
      companyId,
      totalOrganizations: organizations.length,
      organizations: organizations.map(org => ({
        id: org.id,
        organization: org.organization,
        shortText: org.shortText,
        longText: org.longText,
        abbreviation: org.abbreviation,
        startDate: org.startDate,
        endDate: org.endDate,
      })),
    };
  }

  /**
   * Get organizations with positions count
   */
  async findByCompanyWithPositions(companyId: number) {
    const query = `
      SELECT 
        o.*,
        COUNT(DISTINCT p.id) as positionsCount
      FROM om_organization o
      LEFT JOIN om_position p ON p.company = o.company
      WHERE o.company = ?
      GROUP BY o.id
      ORDER BY o.organization ASC
    `;

    const results = await this.dataSource.query(query, [companyId]);
    return results;
  }

  /**
   * Get organization with area details
   */
  async findOneWithDetails(id: string) {
    const org = await this.findOne(id);
    
    // Get area and sub-area info if exists
    const areaRepo = this.dataSource.getRepository(OmArea);
    const areaSubRepo = this.dataSource.getRepository(OmAreaSub);

    let areaDetails = null;
    let subAreaDetails = null;

    // Note: You might need to add area/sub_area fields to organization entity
    // For now, returning basic organization data
    
    return {
      ...org,
      areaDetails,
      subAreaDetails,
    };
  }

  async findOne(id: string): Promise<OmOrganization> {
    const organization = await this.orgRepo.findOne({ where: { id } });
    if (!organization) {
      throw new NotFoundException(`Organization with ID ${id} not found`);
    }
    return organization;
  }

  async create(companyId: number, dto: CreateOrganizationDto): Promise<OmOrganization> {
    // Check if organization code already exists for this company
    const existing = await this.orgRepo.findOne({
      where: { 
        company: companyId, 
        organization: dto.organization 
      },
    });

    if (existing) {
      throw new BadRequestException(
        `Organization code ${dto.organization} already exists for company ${companyId}`
      );
    }

    const newOrg = this.orgRepo.create({
      ...dto,
      company: companyId,
    });
    return this.orgRepo.save(newOrg);
  }

  async update(
    id: string,
    companyId: number,
    dto: UpdateOrganizationDto,
  ): Promise<OmOrganization> {
    const organization = await this.findOne(id);
    
    // Manually assign fields from DTO
    if (dto.organization !== undefined) organization.organization = dto.organization;
    if (dto.shortText !== undefined) organization.shortText = dto.shortText;
    if (dto.longText !== undefined) organization.longText = dto.longText;
    if (dto.abbreviation !== undefined) organization.abbreviation = dto.abbreviation;
    if (dto.startDate !== undefined) organization.startDate = dto.startDate;
    if (dto.endDate !== undefined) organization.endDate = dto.endDate;
    if (dto.uname !== undefined) organization.uname = dto.uname;
    
    // Update company from route param
    organization.company = companyId;
    
    return this.orgRepo.save(organization);
  }

  async remove(id: string): Promise<{ message: string }> {
    const organization = await this.findOne(id);
    await this.orgRepo.remove(organization);
    return { message: `Organization ${id} deleted successfully` };
  }
}
