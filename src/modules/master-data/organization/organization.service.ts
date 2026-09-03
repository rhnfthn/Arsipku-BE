import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { Repository, DataSource, IsNull } from 'typeorm';
import { OmOrganization } from './entities/om-organization.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { OmArea } from '../area/entities/om-area.entity';
import { OmAreaSub } from '../areasub/entities/om-areasub.entity';
import { RelationOo } from '../relation_oo/entities/relation_oo.entity';
import { RelationOa } from '../relation_oa/entities/relation_oa.entity';

@Injectable()
export class OrganizationService {
  constructor(
    @InjectRepository(OmOrganization)
    private readonly orgRepo: Repository<OmOrganization>,
    @InjectRepository(RelationOo)
    private readonly relationOoRepo: Repository<RelationOo>,
    @InjectRepository(RelationOa)
    private readonly relationOaRepo: Repository<RelationOa>,
    private readonly dataSource: DataSource,
  ) {}

  async findAll(): Promise<OmOrganization[]> {
    return this.orgRepo.find({
      order: { organization: 'ASC', createAt: 'DESC' },
    });
  }

  /**
   * Get all organizations by company
   * @param companyId - Company ID
   * @param search - Optional search query to filter organizations by name
   */
  async findByCompany(companyId: number, search?: string) {
    const queryBuilder = this.orgRepo
      .createQueryBuilder('org')
      .where('org.company = :companyId', { companyId })
      .orderBy('org.organization', 'ASC');

    // Add search filter if provided
    if (search && search.trim()) {
      queryBuilder.andWhere(
        '(org.shortText LIKE :search OR org.longText LIKE :search OR org.abbreviation LIKE :search)',
        { search: `%${search.trim()}%` },
      );
    }

    return queryBuilder.getMany();
  }

  /**
   * Get organization tree structure with hierarchy
   * @param companyId - Company ID
   * @param search - Optional search query to filter organizations by name
   */
  async findTreeByCompany(companyId: number, search?: string) {
    let organizations = await this.findByCompany(companyId);

    // Filter organizations by search query if provided
    if (search && search.trim()) {
      const searchLower = search.toLowerCase().trim();
      organizations = organizations.filter(
        (org) =>
          org.shortText?.toLowerCase().includes(searchLower) ||
          org.longText?.toLowerCase().includes(searchLower) ||
          org.abbreviation?.toLowerCase().includes(searchLower),
      );
    }

    // Get all parent-child relationships for this company
    const relations = await this.relationOoRepo.find({
      where: { company: companyId },
    });

    // Create a map for quick lookup
    const orgMap = new Map<number, any>();
    organizations.forEach((org) => {
      if (org.organization !== null) {
        orgMap.set(org.organization, {
          id: org.id,
          organization: org.organization,
          shortText: org.shortText,
          longText: org.longText,
          abbreviation: org.abbreviation,
          startDate: org.startDate,
          endDate: org.endDate,
          children: [],
        });
      }
    });

    // Build parent-child relationships
    const childrenMap = new Map<number, number[]>();
    const hasParentMap = new Map<number, boolean>(); // Track which orgs have parents

    relations.forEach((rel) => {
      if (rel.organization && rel.relation_organization) {
        // This org has a parent
        hasParentMap.set(rel.organization, true);

        // Add to children map
        if (!childrenMap.has(rel.relation_organization)) {
          childrenMap.set(rel.relation_organization, []);
        }
        childrenMap.get(rel.relation_organization)?.push(rel.organization);
      }
    });

    // Find root nodes (organizations without parent)
    // Root = organization that doesn't have parent in relation table
    const rootIds: number[] = [];
    organizations.forEach((org) => {
      if (org.organization !== null && !hasParentMap.has(org.organization)) {
        rootIds.push(org.organization);
      }
    });

    // Recursive function to build tree
    const buildTree = (orgId: number): any => {
      const org = orgMap.get(orgId);
      if (!org) return null;

      const children = childrenMap.get(orgId) || [];
      org.children = children
        .map((childId) => buildTree(childId))
        .filter((child) => child !== null);

      return org;
    };

    const tree = rootIds
      .map((rootId) => buildTree(rootId))
      .filter((node) => node !== null);

    return {
      companyId,
      totalOrganizations: organizations.length,
      tree,
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

    const areaDetails = null;
    const subAreaDetails = null;

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

  /**
   * Get organization with parent information
   */
  async findOneWithParent(id: string, companyId: number) {
    const organization = await this.findOne(id);

    if (organization.organization === null) {
      throw new BadRequestException(
        'Organization has no valid organization ID',
      );
    }

    // Find parent relation
    const parentRelation = await this.relationOoRepo.findOne({
      where: {
        company: companyId,
        organization: organization.organization,
      },
    });

    let parentOrg: OmOrganization | null = null;
    if (parentRelation?.relation_organization) {
      parentOrg = await this.orgRepo.findOne({
        where: {
          company: companyId,
          organization: parentRelation.relation_organization,
        },
      });
    }

    // Find children
    const childRelations = await this.relationOoRepo.find({
      where: {
        company: companyId,
        relation_organization: organization.organization,
      },
    });

    const children = await Promise.all(
      childRelations.map(async (rel) => {
        if (rel.organization === null) return null;
        const child = await this.orgRepo.findOne({
          where: {
            company: companyId,
            organization: rel.organization,
          },
        });
        return child
          ? {
              id: child.id,
              organization: child.organization,
              shortText: child.shortText,
              longText: child.longText,
            }
          : null;
      }),
    );

    return {
      ...organization,
      parent: parentOrg
        ? {
            id: parentOrg.id,
            organization: parentOrg.organization,
            shortText: parentOrg.shortText,
            longText: parentOrg.longText,
          }
        : null,
      children: children.filter((c) => c !== null),
      hasChildren: children.filter((c) => c !== null).length > 0,
      isTopLevel: !parentRelation,
    };
  }

  /**
   * Get all child organizations by parent organization ID
   */
  async findChildOrganizations(parentOrgId: number) {
    // First find the parent organization to get companyId
    const parentOrg = await this.orgRepo.findOne({
      where: {
        organization: parentOrgId,
      },
    });

    if (!parentOrg || parentOrg.company === null) {
      throw new NotFoundException(
        `Parent organization with ID ${parentOrgId} not found`,
      );
    }

    const companyId = parentOrg.company;

    // Find all child relations where relation_organization = parentOrgId
    const childRelations = await this.relationOoRepo.find({
      where: {
        company: companyId,
        relation_organization: parentOrgId,
      },
    });

    // Get the organization details for each child
    const children = await Promise.all(
      childRelations.map(async (rel) => {
        if (rel.organization === null) return null;
        const child = await this.orgRepo.findOne({
          where: {
            company: companyId,
            organization: rel.organization,
          },
        });
        return child
          ? {
              id: child.id,
              organization: child.organization,
              shortText: child.shortText,
              longText: child.longText,
              abbreviation: child.abbreviation,
              startDate: child.startDate,
              endDate: child.endDate,
              relation: {
                relationOrganization: rel.relation_organization,
                relationOrganizationText: rel.relation_organization_text,
                startDate: rel.startDate,
                endDate: rel.endDate,
              },
            }
          : null;
      }),
    );

    return children.filter((c) => c !== null);
  }

  async create(dto: CreateOrganizationDto): Promise<OmOrganization> {
    // Check if organization code already exists for this company
    const existing = await this.orgRepo.findOne({
      where: {
        company: dto.company,
        organization: dto.organization,
      },
    });

    if (existing) {
      throw new BadRequestException(
        `Organization code ${dto.organization} already exists for company ${dto.company}`,
      );
    }

    // Create organization
    const newOrg = this.orgRepo.create({
      ...dto,
      // Nama selalu disimpan KAPITAL.
      shortText: dto.shortText?.toUpperCase(),
      longText: dto.longText?.toUpperCase(),
    });
    const savedOrg = await this.orgRepo.save(newOrg);

    // Create parent-child relationship if parentOrganization is provided
    if (dto.parentOrganization) {
      // Verify parent organization exists
      const parentOrg = await this.orgRepo.findOne({
        where: {
          company: dto.company,
          organization: dto.parentOrganization,
        },
      });

      if (!parentOrg) {
        // Delete the created organization if parent doesn't exist
        await this.orgRepo.remove(savedOrg);
        throw new NotFoundException(
          `Parent organization ${dto.parentOrganization} not found for company ${dto.company}`,
        );
      }

      // Create relation in om_relation_oo
      const relation = this.relationOoRepo.create({
        company: dto.company,
        organization: savedOrg.organization,
        organization_text: dto.shortText,
        relation_organization: dto.parentOrganization,
        relation_organization_text:
          dto.parentOrganizationText || parentOrg.shortText,
        startDate: dto.startDate,
        endDate: dto.endDate,
        uname: dto.uname,
      });

      await this.relationOoRepo.save(relation);
    }

    // Create sub area relationship if subArea is provided
    if (dto.subArea) {
      const relationOa = this.relationOaRepo.create({
        company: dto.company,
        organization: savedOrg.organization,
        organization_text: dto.shortText,
        relation_sub_area: dto.subArea,
        relation_sub_area_text: dto.subAreaText,
        startDate: dto.startDate,
        endDate: dto.endDate,
        uname: dto.uname,
      });

      await this.relationOaRepo.save(relationOa);
    }

    return savedOrg;
  }

  async update(
    id: string,
    dto: UpdateOrganizationDto,
  ): Promise<OmOrganization> {
    const organization = await this.findOne(id);

    if (organization.company === null) {
      throw new BadRequestException('Organization has no valid company ID');
    }

    const companyId = organization.company;

    // Manually assign fields from DTO
    if (dto.organization !== undefined)
      organization.organization = dto.organization;
    if (dto.shortText !== undefined) organization.shortText = dto.shortText.toUpperCase();
    if (dto.longText !== undefined) organization.longText = dto.longText.toUpperCase();
    if (dto.abbreviation !== undefined)
      organization.abbreviation = dto.abbreviation;
    if (dto.startDate !== undefined) organization.startDate = dto.startDate;
    if (dto.endDate !== undefined) organization.endDate = dto.endDate;
    if (dto.uname !== undefined) organization.uname = dto.uname;

    const savedOrg = await this.orgRepo.save(organization);

    // Handle parent organization change if provided in DTO
    if (dto.parentOrganization !== undefined) {
      if (savedOrg.organization === null) {
        throw new BadRequestException(
          'Organization has no valid organization ID',
        );
      }

      // Find existing relation
      const existingRelation = await this.relationOoRepo.findOne({
        where: {
          company: companyId,
          organization: savedOrg.organization,
        },
      });

      if (dto.parentOrganization === null) {
        // Remove parent relationship (make it top level)
        if (existingRelation) {
          await this.relationOoRepo.remove(existingRelation);
        }
      } else {
        // Verify parent exists
        const parentOrg = await this.orgRepo.findOne({
          where: {
            company: companyId,
            organization: dto.parentOrganization,
          },
        });

        if (!parentOrg) {
          throw new NotFoundException(
            `Parent organization ${dto.parentOrganization} not found`,
          );
        }

        // Prevent circular reference
        if (dto.parentOrganization === savedOrg.organization) {
          throw new BadRequestException(
            'Organization cannot be its own parent',
          );
        }

        if (existingRelation) {
          // Update existing relation
          existingRelation.relation_organization = dto.parentOrganization;
          existingRelation.relation_organization_text =
            dto.parentOrganizationText || parentOrg.shortText;
          if (dto.startDate) existingRelation.startDate = dto.startDate;
          if (dto.endDate) existingRelation.endDate = dto.endDate;
          await this.relationOoRepo.save(existingRelation);
        } else {
          // Create new relation
          const relation = this.relationOoRepo.create({
            company: companyId,
            organization: savedOrg.organization,
            organization_text: savedOrg.shortText,
            relation_organization: dto.parentOrganization,
            relation_organization_text:
              dto.parentOrganizationText || parentOrg.shortText,
            startDate: dto.startDate,
            endDate: dto.endDate,
            uname: dto.uname,
          });
          await this.relationOoRepo.save(relation);
        }
      }
    }

    // Handle sub area relationship if provided in DTO
    if (dto.subArea !== undefined) {
      if (savedOrg.organization === null) {
        throw new BadRequestException(
          'Organization has no valid organization ID',
        );
      }

      // Find existing relation
      const existingRelationOa = await this.relationOaRepo.findOne({
        where: {
          company: companyId,
          organization: savedOrg.organization,
        },
      });

      if (dto.subArea === null) {
        // Remove sub area relationship
        if (existingRelationOa) {
          await this.relationOaRepo.remove(existingRelationOa);
        }
      } else {
        if (existingRelationOa) {
          // Update existing relation
          existingRelationOa.relation_sub_area = dto.subArea;
          existingRelationOa.relation_sub_area_text = dto.subAreaText || null;
          if (dto.startDate) existingRelationOa.startDate = dto.startDate;
          if (dto.endDate) existingRelationOa.endDate = dto.endDate;
          await this.relationOaRepo.save(existingRelationOa);
        } else {
          // Create new relation
          const relationOa = this.relationOaRepo.create({
            company: companyId,
            organization: savedOrg.organization,
            organization_text: savedOrg.shortText,
            relation_sub_area: dto.subArea,
            relation_sub_area_text: dto.subAreaText || null,
            startDate: dto.startDate,
            endDate: dto.endDate,
            uname: dto.uname,
          });
          await this.relationOaRepo.save(relationOa);
        }
      }
    }

    return savedOrg;
  }

  async remove(id: string): Promise<{ message: string }> {
    const organization = await this.findOne(id);

    if (organization.organization === null || organization.company === null) {
      throw new BadRequestException('Organization has invalid data');
    }

    // Check if this organization has children
    const childRelations = await this.relationOoRepo.find({
      where: {
        company: organization.company,
        relation_organization: organization.organization,
      },
    });

    if (childRelations.length > 0) {
      throw new BadRequestException(
        `Cannot delete organization. It has ${childRelations.length} child organization(s). Please delete or reassign children first.`,
      );
    }

    // Delete parent relation if exists
    const parentRelation = await this.relationOoRepo.findOne({
      where: {
        company: organization.company,
        organization: organization.organization,
      },
    });

    if (parentRelation) {
      await this.relationOoRepo.remove(parentRelation);
    }

    // Delete sub area relation if exists
    const subAreaRelation = await this.relationOaRepo.findOne({
      where: {
        company: organization.company,
        organization: organization.organization,
      },
    });

    if (subAreaRelation) {
      await this.relationOaRepo.remove(subAreaRelation);
    }

    // Delete the organization
    await this.orgRepo.remove(organization);
    return { message: `Organization ${id} deleted successfully` };
  }
}
