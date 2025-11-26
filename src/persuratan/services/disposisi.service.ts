import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual, MoreThanOrEqual, In } from 'typeorm';
import { RelationSp } from 'src/relation_sp/entities/relation_sp.entity';
import { RelationOsc } from 'src/relation_osc/entities/relation_osc.entity';
import { RelationOa } from 'src/relation_oa/entities/relation_oa.entity';
import { RelationOo } from 'src/relation_oo/entities/relation_oo.entity';
import { Person } from 'src/person/entities/person.entity';
import { OmPosition } from 'src/position/entities/om-position.entity';
import { DisposisiRecipientResponseDto } from '../dto/disposisi/disposisi-recipient-response.dto';

const MANAGERIAL_THRESHOLD = 70000000;
const COMPANY_ID = 10000; // PERUM LPPNPI
const TODAY = new Date().toISOString().split('T')[0];

interface OrganizationNode {
  id: number;
  name: string;
  level: number;
  children: number[];
}

@Injectable()
export class DisposisiService {
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
   * PHASE 1: Validate sender is managerial
   */
  async validateSender(persnum: number): Promise<{
    persnum: number;
    position: number;
    isManagerial: boolean;
  }> {
    const relationSp = await this.relationSpRepository.findOne({
      where: {
        relation_persnum: persnum,
        company: COMPANY_ID,
        startDate: LessThanOrEqual(TODAY),
        endDate: MoreThanOrEqual(TODAY),
      },
    });

    if (
      !relationSp ||
      relationSp.position === null ||
      relationSp.position === undefined
    ) {
      throw new NotFoundException(
        `Pengirim dengan persnum ${persnum} tidak ditemukan atau tidak aktif`,
      );
    }

    if (relationSp.position < MANAGERIAL_THRESHOLD) {
      throw new ForbiddenException(
        `Hanya managerial (position >= ${MANAGERIAL_THRESHOLD}) yang bisa kirim Disposisi. User ini punya position ${relationSp.position}`,
      );
    }

    const senderPersnum = relationSp.relation_persnum;
    if (!senderPersnum) {
      throw new NotFoundException(`Persnum untuk sender tidak ditemukan`);
    }

    return {
      persnum: senderPersnum,
      position: relationSp.position,
      isManagerial: true,
    };
  }

  /**
   * PHASE 2: Get sender's organization and sub_area
   * Fallback: Jika position tidak ada di relation_osc, ambil dari hierarchical parent
   */
  async getSenderOrganization(position: number): Promise<{
    organizationId: number;
    organizationName: string;
    subAreaId: number;
  }> {
    // Try to find organization from relation_osc first
    let osc = await this.relationOscRepository.findOne({
      where: {
        relation_position: position,
        company: COMPANY_ID,
        startDate: LessThanOrEqual(TODAY),
        endDate: MoreThanOrEqual(TODAY),
      },
    });

    if (!osc || !osc.organization) {
      // Fallback: Try to find any relation_osc with this position (without date filter)
      osc = await this.relationOscRepository.findOne({
        where: {
          relation_position: position,
          company: COMPANY_ID,
        },
      });

      if (!osc || !osc.organization) {
        throw new NotFoundException(
          `Organisasi untuk position ${position} tidak ditemukan di relation_osc`,
        );
      }
    }

    const oa = await this.relationOaRepository.findOne({
      where: {
        organization: osc.organization,
        company: COMPANY_ID,
        startDate: LessThanOrEqual(TODAY),
        endDate: MoreThanOrEqual(TODAY),
      },
    });

    return {
      organizationId: osc.organization,
      organizationName: osc.organization_text || '',
      subAreaId: oa?.relation_sub_area || 0,
    };
  }

  /**
   * PHASE 3: Build organization hierarchy tree (recursive)
   */
  async buildOrganizationTree(
    organizationId: number,
    maxDepth: number = 3,
  ): Promise<{
    tree: Map<number, OrganizationNode>;
    allOrgIds: number[];
  }> {
    const tree = new Map<number, OrganizationNode>();
    const allOrgIds: number[] = [];
    const visited = new Set<number>();

    const buildTree = async (orgId: number, depth: number): Promise<void> => {
      if (depth > maxDepth || visited.has(orgId)) {
        return;
      }

      visited.add(orgId);
      allOrgIds.push(orgId);

      // Get current org name
      const osc = await this.relationOscRepository.findOne({
        where: {
          organization: orgId,
          company: COMPANY_ID,
        },
      });

      const node: OrganizationNode = {
        id: orgId,
        name: osc?.organization_text ?? `Org ${orgId}`,
        level: depth,
        children: [],
      };

      tree.set(orgId, node);

      // Get children
      const children = await this.relationOoRepository.find({
        where: {
          relation_organization: orgId,
          company: COMPANY_ID,
          startDate: LessThanOrEqual(TODAY),
          endDate: MoreThanOrEqual(TODAY),
        },
      });

      for (const child of children) {
        if (child.organization && !visited.has(child.organization)) {
          node.children.push(child.organization);
          await buildTree(child.organization, depth + 1);
        }
      }
    };

    await buildTree(organizationId, 0);

    return { tree, allOrgIds };
  }

  /**
   * PHASE 4: Get child organizations only (NO siblings, NO self)
   * For Disposisi: only direct subordinates from child organizations
   */
  async getChildOrganizations(userOrgId: number): Promise<number[]> {
    const childrenRelations = await this.relationOoRepository.find({
      where: {
        relation_organization: userOrgId,
        company: COMPANY_ID,
        startDate: LessThanOrEqual(TODAY),
        endDate: MoreThanOrEqual(TODAY),
      },
    });

    return childrenRelations
      .map((c) => c.organization)
      .filter((id): id is number => id !== null && id !== undefined);
  }

  /**
   * PHASE 5: Get recipients dari organizational structure
   * Using JOIN query for performance: OSC → SP → Person → Position
   */
  async getRecipientsFromOrgStructure(
    childOrgIds: number[],
    userPersnum: number,
  ): Promise<
    Array<{
      organizationId: number;
      organizationName: string;
      persnum: number;
      nama: string;
      position: number;
      positionName: string;
      positionStatus: string;
    }>
  > {
    if (childOrgIds.length === 0) {
      console.log(`[DisposisiService] No child organizations found`);
      return [];
    }

    console.log(
      `[DisposisiService] PHASE 5: child orgs: ${childOrgIds.join(', ')}`,
    );

    // Batch query: Get all positions in child organizations (with org details)
    const positions = await this.relationOscRepository.find({
      where: {
        organization: In(childOrgIds),
        company: COMPANY_ID,
        startDate: LessThanOrEqual(TODAY),
        endDate: MoreThanOrEqual(TODAY),
      },
    });

    console.log(
      `[DisposisiService] Found ${positions.length} positions in child orgs`,
    );

    if (positions.length === 0) {
      return [];
    }

    // Extract all position IDs for batch query
    const positionIds = positions
      .map((p) => p.relation_position)
      .filter((id): id is number => id !== null && id !== undefined);

    // Batch query: Get all persons in these positions
    const personPositions = await this.relationSpRepository.find({
      where: {
        position: In(positionIds),
        company: COMPANY_ID,
        startDate: LessThanOrEqual(TODAY),
        endDate: MoreThanOrEqual(TODAY),
      },
    });

    console.log(
      `[DisposisiService] Found ${personPositions.length} persons in positions`,
    );

    // Extract person IDs
    const personIds = personPositions
      .map((p) => p.relation_persnum)
      .filter((id): id is number => id !== null && id !== undefined)
      .filter((id) => id !== userPersnum); // Skip self

    if (personIds.length === 0) {
      console.log(`[DisposisiService] No recipients found`);
      return [];
    }

    // Batch query: Get all person details
    const persons = await this.personRepository.find({
      where: {
        persnum: In(personIds),
      },
    });

    // Batch query: Get all position details
    const positionDetails = await this.positionRepository.find({
      where: {
        position: In(positionIds),
      },
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

    // Combine results using maps
    const result: Array<{
      organizationId: number;
      organizationName: string;
      persnum: number;
      nama: string;
      position: number;
      positionName: string;
      positionStatus: string;
    }> = [];

    for (const personId of personIds) {
      const person = personMap.get(personId);
      if (!person || !person.name) continue;

      const personPos = personPosMap.get(personId);
      if (!personPos || !personPos.position) continue;

      const posOrg = positionOrgMap.get(personPos.position);
      if (!posOrg || !posOrg.org) continue;

      const posDet = positionMap.get(personPos.position);

      result.push({
        organizationId: posOrg.org,
        organizationName: posOrg.orgName || '',
        persnum: person.persnum || 0,
        nama: person.name,
        position: personPos.position,
        positionName: posDet?.shortText || '',
        positionStatus: 'pyb', // Default status for Disposisi
      });

      console.log(
        `[DisposisiService] Added recipient: ${person.name} (pos: ${personPos.position}, org: ${posOrg.org})`,
      );
    }

    // Sort by organization name, then by person name
    return result.sort((a, b) => {
      if (a.organizationName !== b.organizationName) {
        return a.organizationName.localeCompare(b.organizationName);
      }
      return a.nama.localeCompare(b.nama);
    });
  }

  /**
   * PHASE 6: Get disposisi recipients (ONLY BAWAHAN - direct subordinates)
   */
  async getDisposisiRecipients(
    persnum: number,
    maxDepth: number = 1, // DI: only direct children (depth 1)
  ): Promise<DisposisiRecipientResponseDto> {
    // PHASE 1: Validate sender
    const senderValidation = await this.validateSender(persnum);

    // Get person data
    const person = await this.personRepository.findOne({
      where: { persnum },
    });

    if (!person) {
      throw new NotFoundException(
        `Person dengan persnum ${persnum} tidak ditemukan`,
      );
    }

    // PHASE 2: Get organization
    const senderOrg = await this.getSenderOrganization(
      senderValidation.position,
    );

    const senderOrgId = parseInt(senderOrg.organizationId.toString());

    // PHASE 3: Build hierarchy tree for reporting only
    const { allOrgIds } = await this.buildOrganizationTree(
      senderOrgId,
      maxDepth,
    );

    // PHASE 4: Get ONLY direct child organizations (no siblings, no self)
    const childOrgIds = await this.getChildOrganizations(senderOrgId);

    console.log(
      `[DisposisiService] DI Sender: ${person.name} (org: ${senderOrgId})`,
    );
    console.log(
      `[DisposisiService] Child organizations: ${childOrgIds.join(', ')}`,
    );

    // PHASE 5: Get recipients from child organizations only
    const recipients = await this.getRecipientsFromOrgStructure(
      childOrgIds,
      persnum,
    );

    const totalRecipients = recipients.length;

    return {
      persnum: person.persnum || 0,
      nama: person.name || '',
      position: senderValidation.position,
      positionStatus: 'pyb',
      organizationId: senderOrg.organizationId,
      organizationName: senderOrg.organizationName,
      subAreaId: senderOrg.subAreaId || 0,
      recipients: recipients.map((r) => ({
        ...r,
        level: 0,
        type: 'DIRECT_SUBORDINATE',
      })),
      hierarchy: {
        maxDepth,
        totalOrganizations: allOrgIds.length,
        totalRecipients,
      },
    };
  }
}
