import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import { RelationSp } from 'src/relation_sp/entities/relation_sp.entity';
import { RelationOsc } from 'src/relation_osc/entities/relation_osc.entity';
import { RelationOa } from 'src/relation_oa/entities/relation_oa.entity';
import { RelationOo } from 'src/relation_oo/entities/relation_oo.entity';
import { Person } from 'src/person/entities/person.entity';
import { OmPosition } from 'src/position/entities/om-position.entity';
import { OmAreaSub } from 'src/areasub/entities/om-areasub.entity';
import {
  SuratDinasInternalRecipientResponseDto,
  SuratDinasInternalRecipientGroupDto,
} from '../dto/surat-dinas-internal/surat-dinas-internal-recipient-response.dto';

const COMPANY_ID = 10000; // PERUM LPPNPI
const TODAY = new Date().toISOString().split('T')[0];

@Injectable()
export class SuratDinasInternalService {
  constructor(
    @InjectRepository(Person)
    private readonly personRepository: Repository<Person>,
    @InjectRepository(RelationSp)
    private readonly relationSpRepository: Repository<RelationSp>,
    @InjectRepository(RelationOsc)
    private readonly relationOscRepository: Repository<RelationOsc>,
    @InjectRepository(RelationOa)
    private readonly relationOaRepository: Repository<RelationOa>,
    @InjectRepository(RelationOo)
    private readonly relationOoRepository: Repository<RelationOo>,
    @InjectRepository(OmPosition)
    private readonly positionRepository: Repository<OmPosition>,
    @InjectRepository(OmAreaSub)
    private readonly areaSubRepository: Repository<OmAreaSub>,
  ) {}

  /**
   * PHASE 1: Get user position from om_relation_sp
   * Query: WHERE relation_persnum = persnum AND company = COMPANY_ID AND TODAY between start_date/end_date
   */
  async getUserPosition(persnum: number): Promise<number | null> {
    try {
      const relationSp = await this.relationSpRepository.findOne({
        where: {
          relation_persnum: persnum,
          company: COMPANY_ID,
          startDate: LessThanOrEqual(TODAY),
          endDate: MoreThanOrEqual(TODAY),
        },
      });

      if (!relationSp) {
        return null;
      }

      return relationSp.position;
    } catch (error) {
      throw new BadRequestException(`Failed to get user position: ${error.message}`);
    }
  }

  /**
   * PHASE 2: Verify user is managerial
   * Check: position exists in om_relation_osc (meaning it's assigned to an organization)
   */
  async verifyManagerial(position: number): Promise<boolean> {
    try {
      const managerialPosition = await this.relationOscRepository.findOne({
        where: {
          relation_position: position,
          company: COMPANY_ID,
          startDate: LessThanOrEqual(TODAY),
          endDate: MoreThanOrEqual(TODAY),
        },
      });

      return !!managerialPosition;
    } catch (error) {
      throw new BadRequestException(`Failed to verify managerial role: ${error.message}`);
    }
  }

  /**
   * PHASE 3: Get user organization, area, and sub_area
   * Query om_relation_osc: WHERE relation_position = position
   * Query om_relation_oa: WHERE organization = org_id to get sub_area
   * Query om_area_sub: WHERE sub_area = sub_area_id to get area code
   */
  async getUserOrganization(position: number): Promise<{
    organizationId: number;
    areaCode: string;
    subAreaId: number;
    organizationText: string;
  }> {
    try {
      const relationOsc = await this.relationOscRepository.findOne({
        where: {
          relation_position: position,
          company: COMPANY_ID,
          startDate: LessThanOrEqual(TODAY), endDate: MoreThanOrEqual(TODAY),
        },
      });

      if (!relationOsc || !relationOsc.organization) {
        throw new NotFoundException('User organization not found');
      }

      // Get sub_area from om_relation_oa
      const relationOa = await this.relationOaRepository.findOne({
        where: {
          organization: relationOsc.organization,
          company: COMPANY_ID,
          startDate: LessThanOrEqual(TODAY), endDate: MoreThanOrEqual(TODAY),
        },
      });

      if (!relationOa || !relationOa.relation_sub_area) {
        throw new NotFoundException('User sub-area not found');
      }

      // Get area code from om_area_sub
      const areaSub = await this.areaSubRepository.findOne({
        where: {
          sub_area: relationOa.relation_sub_area,
          company: COMPANY_ID,
          startDate: LessThanOrEqual(TODAY),
          endDate: MoreThanOrEqual(TODAY),
        },
      });

      if (!areaSub || !areaSub.area) {
        throw new NotFoundException('Area code not found for sub-area');
      }

      return {
        organizationId: relationOsc.organization,
        areaCode: areaSub.area,
        subAreaId: relationOa.relation_sub_area,
        organizationText: relationOsc.organization_text || '',
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException(`Failed to get user organization: ${error.message}`);
    }
  }

  /**
   * PHASE 4: Get eligible organizations for SDI
   * Rules:
   * - ATASAN: parent organization (different area/sub-area is OK, must be parent)
   * - BAWAHAN: children organizations (different area/sub-area is OK, must be children)
   * - REKAN: sibling organizations, BUT only if:
   *   a) SAME area but DIFFERENT sub-area, OR
   *   b) DIFFERENT area but SAME parent (must be setara/peer in hierarchy)
   * - Key: EXCLUDE same sub-area (that's for ND)
   * - Hierarchy uses om_relation_oo table (parent/children relationships)
   */
  async getEligibleOrganizations(
    userOrgId: number,
  ): Promise<{
    parent: number | null;
    children: number[];
    siblings: number[];
  }> {
    try {
      let parent: number | null = null;
      const children: number[] = [];
      const siblings: number[] = [];

      // Get parent organization from om_relation_oo
      const parentRelation = await this.relationOoRepository.findOne({
        where: {
          organization: userOrgId,
          company: COMPANY_ID,
          startDate: LessThanOrEqual(TODAY),
          endDate: MoreThanOrEqual(TODAY),
        },
      });

      if (parentRelation && parentRelation.relation_organization) {
        parent = parentRelation.relation_organization;
      }

      // Get children organizations
      const childrenRelations = await this.relationOoRepository.find({
        where: {
          relation_organization: userOrgId,
          company: COMPANY_ID,
          startDate: LessThanOrEqual(TODAY),
          endDate: MoreThanOrEqual(TODAY),
        },
      });

      if (childrenRelations.length > 0) {
        for (const childRelation of childrenRelations) {
          if (childRelation.organization) {
            children.push(childRelation.organization);
          }
        }
      }

      // Get sibling organizations (if parent exists)
      if (parent) {
        const siblingRelations = await this.relationOoRepository.find({
          where: {
            relation_organization: parent,
            company: COMPANY_ID,
            startDate: LessThanOrEqual(TODAY),
            endDate: MoreThanOrEqual(TODAY),
          },
        });

        if (siblingRelations.length > 0) {
          for (const siblingRelation of siblingRelations) {
            // Skip self
            if (siblingRelation.organization === userOrgId) {
              continue;
            }

            if (siblingRelation.organization) {
              siblings.push(siblingRelation.organization);
            }
          }
        }
      }

      return { parent, children, siblings };
    } catch (error) {
      throw new BadRequestException(`Failed to get eligible organizations: ${error.message}`);
    }
  }

  /**
   * PHASE 5: Get recipients from eligible organizations
   * Filter: EXCLUDE recipients with SAME sub-area (that's for ND)
   * Return with area information for SDI
   */
  async getRecipients(
    eligibleOrgIds: number[],
    userPersnum: number,
    userSubAreaId: number,
  ): Promise<
    Array<{
      organizationId: number;
      organizationName: string;
      areaId: string;
      subAreaId: number;
      persnum: number;
      nama: string;
      position: number;
      positionName: string;
    }>
  > {
    try {
      const result: Array<{
        organizationId: number;
        organizationName: string;
        areaId: string;
        subAreaId: number;
        persnum: number;
        nama: string;
        position: number;
        positionName: string;
      }> = [];

      for (const orgId of eligibleOrgIds) {
        // Get all managerial positions in this organization
        const positions = await this.relationOscRepository.find({
          where: {
            organization: orgId,
            company: COMPANY_ID,
            startDate: LessThanOrEqual(TODAY),
            endDate: MoreThanOrEqual(TODAY),
          },
        });

        // All positions in om_relation_osc are considered valid organizational positions
        const managerialPositions = positions.filter(
          (p) => p.relation_position,
        );

        if (managerialPositions.length === 0) {
          continue;
        }

        for (const posRecord of managerialPositions) {
          if (!posRecord.relation_position) {
            continue;
          }

          const personInPosition = await this.relationSpRepository.findOne({
            where: {
              position: posRecord.relation_position as any,
              company: COMPANY_ID,
              startDate: LessThanOrEqual(TODAY),
              endDate: MoreThanOrEqual(TODAY),
            },
          });

          if (!personInPosition || !personInPosition.relation_persnum) {
            continue;
          }

          // Skip self
          if (personInPosition.relation_persnum === userPersnum) {
            continue;
          }

          // Get person details
          const person = await this.personRepository.findOne({
            where: {
              persnum: personInPosition.relation_persnum as any,
            },
          });

          if (!person || !person.persnum || !person.name) {
            continue;
          }

          // Get position details for position name
          const positionDetails = await this.positionRepository.findOne({
            where: {
              position: posRecord.relation_position,
            },
          });

          // Get organization's area/sub-area info
          const recipientOa = await this.relationOaRepository.findOne({
            where: {
              organization: orgId,
              company: COMPANY_ID,
              startDate: LessThanOrEqual(TODAY),
              endDate: MoreThanOrEqual(TODAY),
            },
          });

          if (!recipientOa || !recipientOa.relation_sub_area) {
            continue;
          }

          // ✅ FILTER: EXCLUDE same sub-area (SDI rule - different sub-area required)
          if (recipientOa.relation_sub_area === userSubAreaId) {
            continue;
          }

          // Get area code from om_area_sub
          const recipientAreaSub = await this.areaSubRepository.findOne({
            where: {
              sub_area: recipientOa.relation_sub_area,
              company: COMPANY_ID,
              startDate: LessThanOrEqual(TODAY),
              endDate: MoreThanOrEqual(TODAY),
            },
          });

          if (!recipientAreaSub || !recipientAreaSub.area) {
            continue;
          }

          result.push({
            organizationId: orgId,
            organizationName: posRecord.organization_text || '',
            areaId: recipientAreaSub.area,
            subAreaId: recipientOa.relation_sub_area,
            persnum: person.persnum,
            nama: person.name,
            position: posRecord.relation_position,
            positionName: positionDetails?.shortText || '',
          });
        }
      }

      // Sort by organization name, then by person name
      return result.sort((a, b) => {
        if (a.organizationName !== b.organizationName) {
          return a.organizationName.localeCompare(b.organizationName);
        }
        return a.nama.localeCompare(b.nama);
      });
    } catch (error) {
      throw new BadRequestException(`Failed to get recipients: ${error.message}`);
    }
  }

  /**
   * Main endpoint: Get all eligible recipients for Surat Dinas Internal
   * 
   * SDI Rules:
   * - Managerial to managerial ACROSS different sub-areas but SAME area
   * - NO same sub-area recipients (that's for ND - Nota Dinas)
   */
  async getSuratDinasInternalRecipients(persnum: number): Promise<SuratDinasInternalRecipientResponseDto> {
    try {
      // Validate persnum exists in pa_personal
      const person = await this.personRepository.findOne({
        where: { persnum },
      });

      if (!person) {
        throw new NotFoundException(`Person with persnum ${persnum} not found`);
      }

      if (!person.persnum || !person.name) {
        throw new BadRequestException(`Invalid person data for persnum ${persnum}`);
      }

      // PHASE 1: Get user position
      const position = await this.getUserPosition(persnum);

      if (!position) {
        throw new NotFoundException(`Active position not found for persnum ${persnum}`);
      }

      // PHASE 2: Verify user is managerial
      const isManagerial = await this.verifyManagerial(position);

      if (!isManagerial) {
        throw new ForbiddenException(
          `Person with position ${position} is not managerial. Only managerial roles can send Surat Dinas Internal.`,
        );
      }

      // PHASE 3: Get user organization, area, and sub_area
      const userOrgDetails = await this.getUserOrganization(position);

      // PHASE 4: Get eligible organizations (parent/children/siblings with hierarchy check)
      const eligibleOrgs = await this.getEligibleOrganizations(
        userOrgDetails.organizationId,
      );

      // Combine all eligible org IDs
      const allEligibleOrgIds: number[] = [];
      if (eligibleOrgs.parent) {
        allEligibleOrgIds.push(eligibleOrgs.parent);
      }
      allEligibleOrgIds.push(...eligibleOrgs.children);
      allEligibleOrgIds.push(...eligibleOrgs.siblings);

      if (allEligibleOrgIds.length === 0) {
        // No eligible recipients found
        return {
          persnum: person.persnum,
          nama: person.name,
          position,
          organizationId: userOrgDetails.organizationId,
          organizationName: userOrgDetails.organizationText,
          areaId: userOrgDetails.areaCode,
          subAreaId: userOrgDetails.subAreaId,
          recipients: {
            ATASAN: [],
            BAWAHAN: [],
            REKAN: [],
          },
        };
      }

      // PHASE 5: Get recipients (filtered to exclude same sub-area)
      const recipientsList = await this.getRecipients(allEligibleOrgIds, persnum, userOrgDetails.subAreaId);

      // Group recipients by relationship type (ATASAN/BAWAHAN/REKAN)
      const recipients: SuratDinasInternalRecipientGroupDto = {
        ATASAN: [],
        BAWAHAN: [],
        REKAN: [],
      };

      if (recipientsList.length > 0) {
        for (const recipient of recipientsList) {
          // Find which org this recipient belongs to
          let organizationIdFromRecipient: number | null = null;
          for (const orgId of allEligibleOrgIds) {
            const orgRecipients = await this.relationOscRepository.find({
              where: {
                organization: orgId,
                company: COMPANY_ID,
                startDate: LessThanOrEqual(TODAY),
                endDate: MoreThanOrEqual(TODAY),
              },
            });

            for (const or of orgRecipients) {
              if (or.relation_position === recipient.position) {
                organizationIdFromRecipient = orgId;
                break;
              }
            }

            if (organizationIdFromRecipient) break;
          }

          // Classify by hierarchy
          if (eligibleOrgs.parent === recipient.organizationId) {
            recipients.ATASAN.push(recipient);
          } else if (eligibleOrgs.children.includes(recipient.organizationId)) {
            recipients.BAWAHAN.push(recipient);
          } else if (eligibleOrgs.siblings.includes(recipient.organizationId)) {
            recipients.REKAN.push(recipient);
          }
        }
      }

      return {
        persnum: person.persnum,
        nama: person.name,
        position,
        organizationId: userOrgDetails.organizationId,
        organizationName: userOrgDetails.organizationText,
        areaId: userOrgDetails.areaCode,
        subAreaId: userOrgDetails.subAreaId,
        recipients,
      };
    } catch (error) {
      throw error;
    }
  }
}
