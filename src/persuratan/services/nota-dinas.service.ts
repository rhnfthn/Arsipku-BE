import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import { RelationSp } from 'src/relation_sp/entities/relation_sp.entity';
import { RelationOsc } from 'src/relation_osc/entities/relation_osc.entity';
import { RelationOa } from 'src/relation_oa/entities/relation_oa.entity';
import { RelationOo } from 'src/relation_oo/entities/relation_oo.entity';
import { Person } from 'src/person/entities/person.entity';
import { OmPosition } from 'src/position/entities/om-position.entity';
import {
  NotaDinasRecipientResponseDto,
  NotaDinasRecipientGroupDto,
} from '../dto/nota-dinas/nota-dinas-recipient-response.dto';

const COMPANY_ID = 10000; // PERUM LPPNPI
const TODAY = new Date().toISOString().split('T')[0];

@Injectable()
export class NotaDinasService {
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
   * This ensures we're checking against actual organizational positions, not hardcoded thresholds
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
   * PHASE 3: Get user organization and sub_area
   * Query om_relation_osc: WHERE relation_position = position AND company = COMPANY_ID AND TODAY between dates
   * Query om_relation_oa: WHERE organization = org_id AND company = COMPANY_ID AND TODAY between dates
   */
  async getUserOrganization(position: number): Promise<{
    organizationId: number;
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

      return {
        organizationId: relationOsc.organization,
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
   * PHASE 4: Get eligible organizations (parent, children, siblings)
   * No sub_area filtering needed - just get the hierarchy
   */
  async getEligibleOrganizations(userOrgId: number, userSubAreaId: number): Promise<{
    parent: number | null;
    children: number[];
    siblings: number[];
  }> {
    try {
      let parent: number | null = null;
      const children: number[] = [];
      const siblings: number[] = [];

      // Get parent organization
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
   * Return flat structure: organizationId, organizationName, persnum, nama, position, positionName
   */
  async getRecipients(
    eligibleOrgIds: number[],
    userPersnum: number,
  ): Promise<
    Array<{
      organizationId: number;
      organizationName: string;
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

          result.push({
            organizationId: orgId,
            organizationName: posRecord.organization_text || '',
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
   * Main endpoint: Get all eligible recipients for Nota Dinas
   */
  async getNotaDinasRecipients(persnum: number): Promise<NotaDinasRecipientResponseDto> {
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
          `Person with position ${position} is not managerial. Only managerial roles can send Nota Dinas.`,
        );
      }

      // PHASE 3: Get user organization and sub_area
      const userOrgDetails = await this.getUserOrganization(position);

      // PHASE 4: Get eligible organizations
      const eligibleOrgs = await this.getEligibleOrganizations(
        userOrgDetails.organizationId,
        userOrgDetails.subAreaId,
      );

      // Combine all eligible org IDs
      const allEligibleOrgIds: number[] = [];
      if (eligibleOrgs.parent) {
        allEligibleOrgIds.push(eligibleOrgs.parent);
      }
      allEligibleOrgIds.push(...eligibleOrgs.children);
      allEligibleOrgIds.push(...eligibleOrgs.siblings);

      // PHASE 5: Get recipients
      const recipients: NotaDinasRecipientGroupDto = {
        ATASAN: [],
        BAWAHAN: [],
        REKAN: [],
      };

      if (allEligibleOrgIds.length > 0) {
        const recipientsList = await this.getRecipients(allEligibleOrgIds, persnum);

        // Group by relationship type
        for (const recipient of recipientsList) {
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
        subAreaId: userOrgDetails.subAreaId,
        recipients,
      };
    } catch (error) {
      throw error;
    }
  }
}

