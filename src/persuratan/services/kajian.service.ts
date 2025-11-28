import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual, MoreThanOrEqual, In } from 'typeorm';
import { RelationSp } from 'src/relation_sp/entities/relation_sp.entity';
import { RelationOsc } from 'src/relation_osc/entities/relation_osc.entity';
import { RelationOa } from 'src/relation_oa/entities/relation_oa.entity';
import { RelationOo } from 'src/relation_oo/entities/relation_oo.entity';
import { Person } from 'src/person/entities/person.entity';
import { OmPosition } from 'src/position/entities/om-position.entity';
import {
  KajianRecipientResponseDto,
  KajianRecipientDto,
} from '../dto/kajian/kajian-recipient-response.dto';

const MANAGERIAL_THRESHOLD = 70000000;
const COMPANY_ID = 10000; // PERUM LPPNPI
const TODAY = new Date().toISOString().split('T')[0];

@Injectable()
export class KajianService {
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
   * PHASE 1: Get sender position & status from om_relation_sp
   * Determine if sender is MANAGERIAL, FUNGSIONAL, or STAFF
   */
  async getSenderInfo(persnum: number): Promise<{
    persnum: number;
    position: number;
    isManagerial: boolean;
    isFungsional: boolean;
    isStaff: boolean;
  }> {
    const relationSp = await this.relationSpRepository.findOne({
      where: {
        relation_persnum: persnum,
        company: COMPANY_ID,
        startDate: LessThanOrEqual(TODAY),
        endDate: MoreThanOrEqual(TODAY),
      },
    });

    if (!relationSp || !relationSp.position) {
      throw new NotFoundException(
        `Pengirim dengan persnum ${persnum} tidak ditemukan atau tidak aktif`,
      );
    }

    const position = relationSp.position;
    const isManagerial = position >= MANAGERIAL_THRESHOLD;
    const isFungsional = !isManagerial && position >= 50000000; // Fungsional: 50000000 - 69999999
    const isStaff = position < 50000000; // Staff: < 50000000

    return {
      persnum,
      position,
      isManagerial,
      isFungsional,
      isStaff,
    };
  }

  /**
   * PHASE 2: Get organization & sub_area from om_relation_osc + om_relation_oa
   */
  async getSenderOrganization(position: number): Promise<{
    organizationId: number;
    organizationName: string;
    subAreaId: number;
  }> {
    const osc = await this.relationOscRepository.findOne({
      where: {
        relation_position: position,
        company: COMPANY_ID,
        startDate: LessThanOrEqual(TODAY),
        endDate: MoreThanOrEqual(TODAY),
      },
    });

    if (!osc || !osc.organization) {
      throw new NotFoundException(
        `Organisasi untuk position ${position} tidak ditemukan`,
      );
    }

    const oa = await this.relationOaRepository.findOne({
      where: {
        organization: osc.organization,
        company: COMPANY_ID,
        startDate: LessThanOrEqual(TODAY),
        endDate: MoreThanOrEqual(TODAY),
      },
    });

    if (!oa || !oa.relation_sub_area) {
      throw new NotFoundException(
        `Sub Area untuk organisasi ${osc.organization} tidak ditemukan`,
      );
    }

    return {
      organizationId: osc.organization,
      organizationName: osc.organization_text || '',
      subAreaId: oa.relation_sub_area,
    };
  }

  /**
   * PHASE 3: Get hierarchy parent/children from om_relation_oo
   * Build parent chain (for ATASAN) and sibling orgs (for REKAN)
   */
  async getOrganizationHierarchy(
    organizationId: number,
    subAreaId: number,
  ): Promise<{
    parentOrgIds: number[];
    siblingOrgIds: number[];
    sameSubAreaOrgIds: number[];
  }> {
    const parentOrgIds: number[] = [];
    const siblingOrgIds: number[] = [];
    const visited = new Set<number>();

    // Get all organizations in same sub_area first
    const allOrgsInSubArea = await this.relationOaRepository.find({
      where: {
        relation_sub_area: subAreaId,
        company: COMPANY_ID,
        startDate: LessThanOrEqual(TODAY),
        endDate: MoreThanOrEqual(TODAY),
      },
    });

    const sameSubAreaOrgIds = allOrgsInSubArea
      .map((oa) => oa.organization)
      .filter((id): id is number => id !== null && id !== undefined);

    // Build parent chain (ATASAN: langsung & tidak langsung)
    const buildParentChain = async (orgId: number): Promise<void> => {
      if (visited.has(orgId)) return;
      visited.add(orgId);

      // Find parent: WHERE organization = orgId (current org is child of parent)
      const parentRelation = await this.relationOoRepository.findOne({
        where: {
          organization: orgId,
          company: COMPANY_ID,
          startDate: LessThanOrEqual(TODAY),
          endDate: MoreThanOrEqual(TODAY),
        },
      });

      if (parentRelation?.relation_organization) {
        const parentOrgId = parentRelation.relation_organization;
        // Only add if parent is in same sub_area
        if (sameSubAreaOrgIds.includes(parentOrgId)) {
          parentOrgIds.push(parentOrgId);
          await buildParentChain(parentOrgId); // Recursive for indirect ATASAN
        }
      }
    };

    await buildParentChain(organizationId);

    // Get siblings (same parent, same level)
    const myParentRelation = await this.relationOoRepository.findOne({
      where: {
        organization: organizationId,
        company: COMPANY_ID,
        startDate: LessThanOrEqual(TODAY),
        endDate: MoreThanOrEqual(TODAY),
      },
    });

    if (myParentRelation?.relation_organization) {
      // Get all children of my parent (siblings)
      const siblings = await this.relationOoRepository.find({
        where: {
          relation_organization: myParentRelation.relation_organization,
          company: COMPANY_ID,
          startDate: LessThanOrEqual(TODAY),
          endDate: MoreThanOrEqual(TODAY),
        },
      });

      for (const sibling of siblings) {
        if (
          sibling.organization &&
          sibling.organization !== organizationId &&
          sameSubAreaOrgIds.includes(sibling.organization)
        ) {
          siblingOrgIds.push(sibling.organization);
        }
      }
    }

    return { parentOrgIds, siblingOrgIds, sameSubAreaOrgIds };
  }

  /**
   * PHASE 4 & 5: Get all persons in same sub_area organizations
   * Using batch queries for performance
   */
  async getPersonsInSubArea(
    orgIds: number[],
    senderPersnum: number,
  ): Promise<KajianRecipientDto[]> {
    if (orgIds.length === 0) return [];

    // Batch query 1: Get all positions in these organizations
    const positions = await this.relationOscRepository.find({
      where: {
        organization: In(orgIds),
        company: COMPANY_ID,
        startDate: LessThanOrEqual(TODAY),
        endDate: MoreThanOrEqual(TODAY),
      },
    });

    if (positions.length === 0) return [];

    const positionIds = positions
      .map((p) => p.relation_position)
      .filter((id): id is number => id !== null && id !== undefined);

    // Batch query 2: Get all persons in these positions
    const personPositions = await this.relationSpRepository.find({
      where: {
        position: In(positionIds),
        company: COMPANY_ID,
        startDate: LessThanOrEqual(TODAY),
        endDate: MoreThanOrEqual(TODAY),
      },
    });

    // Filter out sender (exclude self - Phase 7)
    const personIds = personPositions
      .map((p) => p.relation_persnum)
      .filter((id): id is number => id !== null && id !== undefined)
      .filter((id) => id !== senderPersnum);

    if (personIds.length === 0) return [];

    // Batch query 3: Get all person details
    const persons = await this.personRepository.find({
      where: { persnum: In(personIds) },
    });

    // Batch query 4: Get all position details
    const positionDetails = await this.positionRepository.find({
      where: { position: In(positionIds) },
    });

    // Build maps for O(1) lookup
    const personMap = new Map(persons.map((p) => [p.persnum, p]));
    const positionMap = new Map(positionDetails.map((p) => [p.position, p]));
    const positionOrgMap = new Map(
      positions.map((p) => [
        p.relation_position,
        { org: p.organization, orgName: p.organization_text },
      ]),
    );
    const personPosMap = new Map(
      personPositions.map((p) => [p.relation_persnum, p]),
    );

    const result: KajianRecipientDto[] = [];

    for (const personId of personIds) {
      const person = personMap.get(personId);
      if (!person?.name) continue;

      const personPos = personPosMap.get(personId);
      if (!personPos?.position) continue;

      const posOrg = positionOrgMap.get(personPos.position);
      if (!posOrg?.org) continue;

      const posDet = positionMap.get(personPos.position);

      result.push({
        organizationId: posOrg.org,
        organizationName: posOrg.orgName || '',
        persnum: person.persnum || 0,
        nama: person.name,
        position: personPos.position,
        positionName: posDet?.shortText || '',
        positionStatus: 'pyb',
      });
    }

    return result;
  }

  // NOTE: No actor rule filter for KA
  // KA rules: Everyone in same SubArea can send/receive
  // - Staff/Fungsional → Managerial (OK)
  // - Staff/Fungsional → Staff/Fungsional (OK)
  // - Managerial → Staff/Fungsional (OK)
  // - Managerial → Managerial (OK)
  // Filter is ONLY by SubArea and relationship (ATASAN/REKAN)

  /**
   * Group recipients into ATASAN, BAWAHAN (empty for KA), REKAN
   */
  groupRecipients(
    recipients: KajianRecipientDto[],
    parentOrgIds: number[],
    siblingOrgIds: number[],
    senderOrgId: number,
  ): {
    ATASAN: KajianRecipientDto[];
    BAWAHAN: KajianRecipientDto[];
    REKAN: KajianRecipientDto[];
  } {
    const ATASAN: KajianRecipientDto[] = [];
    const REKAN: KajianRecipientDto[] = [];

    for (const recipient of recipients) {
      if (parentOrgIds.includes(recipient.organizationId)) {
        ATASAN.push(recipient);
      } else if (
        siblingOrgIds.includes(recipient.organizationId) ||
        recipient.organizationId === senderOrgId
      ) {
        // Siblings or same org = REKAN (sesama level)
        REKAN.push(recipient);
      }
    }

    // Sort by organization name, then by person name
    const sortFn = (a: KajianRecipientDto, b: KajianRecipientDto) => {
      if (a.organizationName !== b.organizationName) {
        return a.organizationName.localeCompare(b.organizationName);
      }
      return a.nama.localeCompare(b.nama);
    };

    return {
      ATASAN: ATASAN.sort(sortFn),
      BAWAHAN: [], // KA: tidak boleh ke bawahan
      REKAN: REKAN.sort(sortFn),
    };
  }

  /**
   * Main method: Get Kajian recipients
   * Kajian (KA): Korespondensi dari fungsional/staf ke managerial/fungsional
   * dalam Sub Area yang sama, dan atasan langsung/tidak langsung
   */
  async getKajianRecipients(persnum: number): Promise<KajianRecipientResponseDto> {
    // PHASE 1: Get sender position & status
    const senderInfo = await this.getSenderInfo(persnum);

    // KA: Everyone can send (Managerial, Fungsional, Staff) - no restriction

    // Get person data
    const person = await this.personRepository.findOne({
      where: { persnum },
    });

    if (!person) {
      throw new NotFoundException(`Person dengan persnum ${persnum} tidak ditemukan`);
    }

    // PHASE 2: Get organization & sub_area
    const senderOrg = await this.getSenderOrganization(senderInfo.position);

    // PHASE 3: Get hierarchy (parents for ATASAN, siblings for REKAN)
    const hierarchy = await this.getOrganizationHierarchy(
      senderOrg.organizationId,
      senderOrg.subAreaId,
    );

    // Combine orgs: parents + siblings + sender's own org (for REKAN in same org)
    const eligibleOrgIds = [
      ...hierarchy.parentOrgIds,
      ...hierarchy.siblingOrgIds,
      senderOrg.organizationId, // Include own org for REKAN
    ];

    // Remove duplicates
    const uniqueOrgIds = [...new Set(eligibleOrgIds)];

    // PHASE 4 & 5: Get all persons in eligible organizations (same sub_area)
    const recipients = await this.getPersonsInSubArea(uniqueOrgIds, persnum);

    // NOTE: No actor rule filter for KA - everyone in same SubArea can receive

    // Group into ATASAN, BAWAHAN (empty), REKAN
    const groupedRecipients = this.groupRecipients(
      recipients,
      hierarchy.parentOrgIds,
      hierarchy.siblingOrgIds,
      senderOrg.organizationId,
    );

    const totalRecipients =
      groupedRecipients.ATASAN.length +
      groupedRecipients.BAWAHAN.length +
      groupedRecipients.REKAN.length;

    return {
      persnum: person.persnum || 0,
      nama: person.name || '',
      position: senderInfo.position,
      positionStatus: 'pyb',
      organizationId: senderOrg.organizationId,
      organizationName: senderOrg.organizationName,
      subAreaId: senderOrg.subAreaId,
      recipients: groupedRecipients,
      hierarchy: {
        totalOrganizations: uniqueOrgIds.length,
        totalRecipients,
      },
    };
  }
}
