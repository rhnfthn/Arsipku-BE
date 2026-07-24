import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { CreatePositionDto } from './dto/create-position.dto';
import { UpdatePositionDto } from './dto/update-position.dto';
import { OmPosition } from './entities/om-position.entity';
import { RelationOs } from '../relation_os/entities/relation_os.entity';
import { RelationOsc } from '../relation_osc/entities/relation_osc.entity';
import { OmOrganization } from '../organization/entities/om-organization.entity';
import { Repository, DataSource } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';

@Injectable()
export class PositionService {
  constructor(
    @InjectRepository(OmPosition)
    private readonly positionRepo: Repository<OmPosition>,
    @InjectRepository(RelationOs)
    private readonly relationOsRepo: Repository<RelationOs>,
    @InjectRepository(RelationOsc)
    private readonly relationOscRepo: Repository<RelationOsc>,
    @InjectRepository(OmOrganization)
    private readonly organizationRepo: Repository<OmOrganization>,
    private readonly dataSource: DataSource,
  ) {}

  async findAll(): Promise<OmPosition[]> {
    return this.positionRepo.find({
      order: { position: 'ASC', createAt: 'DESC' },
    });
  }

  /**
   * Get all positions by company
   * @param companyId - Company ID
   * @param search - Optional search query to filter positions by name
   */
  async findByCompany(companyId: number, search?: string) {
    const queryBuilder = this.positionRepo
      .createQueryBuilder('pos')
      .where('pos.company = :companyId', { companyId })
      .orderBy('pos.position', 'ASC');

    // Add search filter if provided
    if (search && search.trim()) {
      queryBuilder.andWhere(
        '(pos.shortText LIKE :search OR pos.longText LIKE :search OR pos.abbreviation LIKE :search)',
        { search: `%${search.trim()}%` },
      );
    }

    return queryBuilder.getMany();
  }

  /**
   * Get all positions by organization (via relation_os)
   * Includes bod_tag from om_relation_osc
   * @param organizationId - Organization ID
   * @param search - Optional search query to filter positions by name
   */
  async findByOrganization(
    organizationId: number,
    search?: string,
  ): Promise<any[]> {
    // Get positions via relation_os table with bod_tag from relation_osc
    let query = `
      SELECT 
        p.*,
        osc.bod_tag
      FROM om_position p
      INNER JOIN om_relation_os os ON os.relation_position = p.position AND os.company = p.company
      LEFT JOIN om_relation_osc osc ON osc.relation_position = p.position 
        AND osc.company = p.company 
        AND osc.organization = os.organization
      WHERE os.organization = ?
    `;

    const params: any[] = [organizationId];

    // Add search filter if provided
    if (search && search.trim()) {
      query += ` AND (p.short_text LIKE ? OR p.long_text LIKE ? OR p.abbreviation LIKE ?)`;
      const searchParam = `%${search.trim()}%`;
      params.push(searchParam, searchParam, searchParam);
    }

    query += ` ORDER BY p.position ASC`;

    const results = await this.dataSource.query(query, params);
    return results;
  }

  /**
   * Get positions with persons count
   */
  async findByCompanyWithPersons(companyId: number) {
    const query = `
      SELECT 
        p.*,
        COUNT(DISTINCT pp.id) as personsCount
      FROM om_position p
      LEFT JOIN pa_personal pp ON pp.persnum IN (
        SELECT persnum FROM om_relation_sp WHERE position = p.position AND company = p.company
      )
      WHERE p.company = ?
      GROUP BY p.id
      ORDER BY p.position ASC
    `;

    const results = await this.dataSource.query(query, [companyId]);
    return results;
  }

  /**
   * Get chief positions only (managerial positions)
   * Note: You might need to add 'chief' field to position entity
   */
  async findChiefPositions(companyId: number): Promise<OmPosition[]> {
    // For now, returning all positions by company
    // You can add chief field to entity and filter here
    return this.positionRepo.find({
      where: { company: companyId },
      order: { position: 'ASC' },
    });
  }

  async findOne(id: string): Promise<OmPosition> {
    const position = await this.positionRepo.findOne({ where: { id } });
    if (!position) {
      throw new NotFoundException(`Position with ID ${id} not found`);
    }
    return position;
  }

  async create(dto: CreatePositionDto): Promise<OmPosition> {
    // Check if position code already exists for this company
    const existing = await this.positionRepo.findOne({
      where: {
        company: dto.company,
        position: dto.position,
      },
    });

    if (existing) {
      throw new BadRequestException(
        `Position code ${dto.position} already exists for company ${dto.company}`,
      );
    }

    const newPosition = this.positionRepo.create({
      ...dto,
    });
    const savedPosition = await this.positionRepo.save(newPosition);

    // Create relation to organization (om_relation_os) if provided
    if (dto.organization) {
      // Auto-fetch organization_text from om_organization
      const orgData = await this.organizationRepo.findOne({
        where: {
          organization: dto.organization,
          company: dto.company,
        },
      });

      const relationOs = this.relationOsRepo.create({
        company: dto.company,
        organization: dto.organization,
        organization_text: orgData?.shortText || dto.organizationText,
        relation_position: dto.position,
        relation_position_text: dto.shortText,
        startDate: dto.startDate || '2025-01-01',
        endDate: dto.endDate || '9999-12-31',
        uname: dto.uname,
      });
      await this.relationOsRepo.save(relationOs);
    }

    // Create cost center relation (om_relation_osc) if bodTag provided
    if (dto.bodTag && dto.organization) {
      // Auto-fetch organization_text from om_organization
      const orgData = await this.organizationRepo.findOne({
        where: {
          organization: dto.organization,
          company: dto.company,
        },
      });

      const relationOsc = this.relationOscRepo.create({
        company: dto.company,
        organization: dto.organization,
        organization_text: orgData?.shortText || dto.organizationText,
        relation_position: dto.position,
        relation_position_text: dto.shortText,
        bod_tag: dto.bodTag,
        startDate: dto.startDate || '2025-01-01',
        endDate: dto.endDate || '9999-12-31',
        uname: dto.uname,
      });
      await this.relationOscRepo.save(relationOsc);
    }

    return savedPosition;
  }

  async update(id: string, dto: UpdatePositionDto): Promise<OmPosition> {
    const position = await this.findOne(id);

    if (position.company === null || position.position === null) {
      throw new BadRequestException('Position has invalid data');
    }

    // Manually assign fields from DTO
    if (dto.company !== undefined) position.company = dto.company;
    if (dto.position !== undefined) position.position = dto.position;
    if (dto.shortText !== undefined) position.shortText = dto.shortText;
    if (dto.longText !== undefined) position.longText = dto.longText;
    if (dto.abbreviation !== undefined)
      position.abbreviation = dto.abbreviation;
    if (dto.startDate !== undefined) position.startDate = dto.startDate;
    if (dto.endDate !== undefined) position.endDate = dto.endDate;
    if (dto.uname !== undefined) position.uname = dto.uname;

    const updatedPosition = await this.positionRepo.save(position);

    // Handle organization relation (om_relation_os)
    if (dto.organization !== undefined) {
      // Find existing relation
      const existingOs = await this.relationOsRepo.findOne({
        where: {
          company: position.company,
          relation_position: position.position,
        },
      });

      if (dto.organization === null) {
        // Remove relation if set to null
        if (existingOs) {
          await this.relationOsRepo.remove(existingOs);
        }
      } else {
        // Auto-fetch organization_text from om_organization
        const orgData = updatedPosition.company
          ? await this.organizationRepo.findOne({
              where: {
                organization: dto.organization,
                company: updatedPosition.company,
              },
            })
          : null;

        const orgText = orgData?.shortText || dto.organizationText || null;

        // Update or create relation
        if (existingOs) {
          existingOs.organization = dto.organization;
          existingOs.organization_text = orgText;
          existingOs.relation_position_text =
            dto.shortText || position.shortText;
          existingOs.startDate = dto.startDate || position.startDate;
          existingOs.endDate = dto.endDate || position.endDate;
          existingOs.uname = dto.uname || null;
          await this.relationOsRepo.save(existingOs);
        } else {
          const newRelationOs = this.relationOsRepo.create({
            company: position.company,
            organization: dto.organization,
            organization_text: orgText,
            relation_position: position.position,
            relation_position_text: dto.shortText || position.shortText,
            startDate: dto.startDate || position.startDate || '2025-01-01',
            endDate: dto.endDate || position.endDate || '9999-12-31',
            uname: dto.uname,
          });
          await this.relationOsRepo.save(newRelationOs);
        }
      }
    }

    // Handle cost center relation (om_relation_osc)
    if (dto.bodTag !== undefined) {
      const existingOsc = await this.relationOscRepo.findOne({
        where: {
          company: position.company,
          relation_position: position.position,
        },
      });

      if (dto.bodTag === null || dto.bodTag === '') {
        // Remove relation if bodTag is null or empty
        if (existingOsc) {
          await this.relationOscRepo.remove(existingOsc);
        }
      } else if (dto.organization) {
        // Auto-fetch organization_text from om_organization
        const orgData = position.company
          ? await this.organizationRepo.findOne({
              where: {
                organization: dto.organization,
                company: position.company,
              },
            })
          : null;

        const orgText = orgData?.shortText || dto.organizationText || null;

        // Update or create relation (requires organization)
        if (existingOsc) {
          existingOsc.organization = dto.organization;
          existingOsc.organization_text = orgText;
          existingOsc.relation_position_text =
            dto.shortText || position.shortText;
          existingOsc.bod_tag = dto.bodTag;
          existingOsc.startDate = dto.startDate || position.startDate;
          existingOsc.endDate = dto.endDate || position.endDate;
          existingOsc.uname = dto.uname || null;
          await this.relationOscRepo.save(existingOsc);
        } else {
          const newRelationOsc = this.relationOscRepo.create({
            company: position.company,
            organization: dto.organization,
            organization_text: orgText,
            relation_position: position.position,
            relation_position_text: dto.shortText || position.shortText,
            bod_tag: dto.bodTag,
            startDate: dto.startDate || position.startDate || '2025-01-01',
            endDate: dto.endDate || position.endDate || '9999-12-31',
            uname: dto.uname,
          });
          await this.relationOscRepo.save(newRelationOsc);
        }
      }
    }

    return updatedPosition;
  }

  async remove(id: string): Promise<{ message: string }> {
    const position = await this.findOne(id);

    if (position.company === null || position.position === null) {
      throw new BadRequestException('Position has invalid data');
    }

    // Delete organization relation (om_relation_os) if exists
    const relationOs = await this.relationOsRepo.findOne({
      where: {
        company: position.company,
        relation_position: position.position,
      },
    });

    if (relationOs) {
      await this.relationOsRepo.remove(relationOs);
    }

    // Delete cost center relation (om_relation_osc) if exists
    const relationOsc = await this.relationOscRepo.findOne({
      where: {
        company: position.company,
        relation_position: position.position,
      },
    });

    if (relationOsc) {
      await this.relationOscRepo.remove(relationOsc);
    }

    // Delete the position
    await this.positionRepo.remove(position);
    return { message: `Position ${id} deleted successfully` };
  }
}
