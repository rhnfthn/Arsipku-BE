import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual, MoreThanOrEqual, In, DataSource } from 'typeorm';
import { RelationSp } from 'src/modules/master-data/relation_sp/entities/relation_sp.entity';
import { RelationOsc } from 'src/modules/master-data/relation_osc/entities/relation_osc.entity';
import { RelationOa } from 'src/modules/master-data/relation_oa/entities/relation_oa.entity';
import { RelationOo } from 'src/modules/master-data/relation_oo/entities/relation_oo.entity';
import { Person } from 'src/modules/master-data/person/entities/person.entity';
import { OmPosition } from 'src/modules/master-data/position/entities/om-position.entity';
import { NaskahEntity } from '../../../shared/entities/naskah.entity';
import { NaskahSirkulasi } from '../../../shared/entities/naskah_sirkulasi.entity';
import { NaskahLampiranEntity } from '../../../shared/entities/naskah_lampiran.entity';
import { OrgDataService } from 'src/modules/master-data/org_data/org_data.service';
import { NomorSuratService } from '../../../shared/services/nomor-surat.service';
import { v4 as uuidv4 } from 'uuid';
import {
  KajianRecipientResponseDto,
  KajianRecipientDto,
} from '../dto/kajian-recipient-response.dto';
import { CreateKajianDto } from '../dto/create-kajian.dto';
import {
  SendKajianResponseDto,
  KajianSirkulasiInfoDto,
} from '../dto/send-kajian-response.dto';
import {
  GetSendKajianResponseDto,
  SentKajianItemDto,
} from '../dto/get-send-message-response.dto';
import {
  UpdateDraftKajianDto,
  UpdateDraftKajianResponseDto,
} from '../dto/update-draft-kajian.dto';
import {
  SendDraftKajianDto,
  SendDraftKajianResponseDto,
} from '../dto/send-draft-kajian.dto';

const MANAGERIAL_THRESHOLD = 70000000;
const COMPANY_ID = 10000; // PERUM LPPNPI
const TODAY = new Date().toISOString().split('T')[0];

// Interface untuk data dari position_json (cached org data)
interface PositionData {
  position: number;
  position_text: string;
  position_abbreviation: string | null;
  chief: number; // 1 = managerial, 0 = staff
  departType: string | null;
  persnum_person: number | null;
  persnum_person_text: string | null;
  organization_id: number;
  organization_text: string;
  organization_abbreviation: string | null;
  organization_parent: number | null;
  organization_parent_text: string | null;
  sub_area: number | null;
  sub_area_text: string | null;
  area: string | null;
  area_text: string | null;
  level: number;
  divisi_id: number | null;
  divisi_name: string | null;
  direktorat_id: number | null;
  direktorat_name: string | null;
  company: number | null;
  company_name: string | null;
}

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
    @InjectRepository(NaskahEntity)
    private readonly naskahRepository: Repository<NaskahEntity>,
    @InjectRepository(NaskahSirkulasi)
    private readonly naskahSirkulasiRepository: Repository<NaskahSirkulasi>,
    @InjectRepository(NaskahLampiranEntity)
    private readonly naskahLampiranRepository: Repository<NaskahLampiranEntity>,
    private readonly orgDataService: OrgDataService,
    private readonly nomorSuratService: NomorSuratService,
    private readonly dataSource: DataSource,
  ) {}

  // ============================================================
  // ORG_DATA INTEGRATION
  // ============================================================

  // Interface untuk data dari position_json (cached org data)
  private positionDataInterface: PositionData[] = [];

  /**
   * Get cached position_json from org_data
   */
  private async getPositionData(tgl?: string): Promise<PositionData[]> {
    const today = tgl || new Date().toISOString().split('T')[0];
    const orgData = await this.orgDataService.findOrg(today);
    return orgData.position_json as PositionData[];
  }

  /**
   * Find position data by position_id
   */
  private findByPosition(
    barisData: PositionData[],
    position: number,
  ): PositionData | undefined {
    return barisData.find((x) => Number(x.position) === Number(position));
  }

  /**
   * Filter recipients for Kajian:
   * Rules: Hanya ke ATASAN (langsung/tidak langsung) dalam Sub Area yang sama
   * 
   * Logic:
   * 1. Get sender's sub_area
   * 2. Find parent organizations (atasan hierarchy)
   * 3. Return all positions in parent organizations within same sub_area
   */
  private filterByPositionKA(
    barisData: PositionData[],
    positionParam: number,
  ): PositionData[] {
    const current = this.findByPosition(barisData, positionParam);
    if (!current) return [];

    const currentSubArea = current.sub_area;
    const currentOrgId = current.organization_id;
    const currentCompany = current.company;

    // Find all parent organizations (atasan hierarchy)
    const parentOrgIds = new Set<number>();
    const visited = new Set<number>();

    const findParents = (orgId: number) => {
      if (visited.has(orgId)) return;
      visited.add(orgId);

      // Find parent from organization_parent
      const orgsInParent = barisData.filter(
        (x) =>
          x.organization_id === orgId &&
          x.organization_parent !== null &&
          x.company === currentCompany,
      );

      for (const org of orgsInParent) {
        if (org.organization_parent && org.organization_parent !== orgId) {
          // Check if parent is in same sub_area
          const parentOrg = barisData.find(
            (x) =>
              x.organization_id === org.organization_parent &&
              x.sub_area === currentSubArea,
          );

          if (parentOrg) {
            parentOrgIds.add(org.organization_parent);
            findParents(org.organization_parent);
          }
        }
      }
    };

    findParents(currentOrgId);

    // Get all positions in parent organizations (same sub_area, same company)
    const recipients = barisData.filter((x) => {
      // Must be same company
      if (x.company !== currentCompany) return false;

      // Must be same sub_area
      if (x.sub_area !== currentSubArea) return false;

      // Must be in parent organization (ATASAN)
      if (!parentOrgIds.has(x.organization_id)) return false;

      // Exclude sender's own position
      if (x.position === positionParam) return false;

      return true;
    });

    return recipients;
  }

  /**
   * Validate recipients: Hanya ATASAN (dari parent organization) yang valid
   */
  private validateRecipients(
    barisData: PositionData[],
    pengirimPositionId: number,
    penerimaPositionIds: number[],
  ): void {
    const validRecipients = this.filterByPositionKA(barisData, pengirimPositionId);
    const validPositionIds = new Set(validRecipients.map((r) => Number(r.position)));

    const invalidRecipients: number[] = [];
    for (const penerimaId of penerimaPositionIds) {
      if (!validPositionIds.has(Number(penerimaId))) {
        invalidRecipients.push(penerimaId);
      }
    }

    if (invalidRecipients.length > 0) {
      throw new ForbiddenException(
        `Penerima dengan position_id [${invalidRecipients.join(', ')}] tidak valid. ` +
          `Kajian hanya bisa dikirim ke ATASAN (langsung/tidak langsung) dalam Sub Area yang sama.`,
      );
    }
  }

  /**
   * Convert PositionData to KajianSirkulasiInfoDto
   */
  private toSirkulasiInfo(pos: PositionData): KajianSirkulasiInfoDto {
    return {
      position_id: pos.position,
      position_text: pos.position_text,
      persnum: pos.persnum_person,
      nama: pos.persnum_person_text,
      organization_id: pos.organization_id,
      organization_text: pos.organization_text,
      sub_area: pos.sub_area,
      sub_area_text: pos.sub_area_text,
      area: pos.area,
      area_text: pos.area_text,
      company: pos.company || COMPANY_ID,
      company_name: pos.company_name,
    };
  }

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
        positionStatus: 'ybs',
      });
    }

    return result;
  }

  // KA rules: Hanya bisa mengirim ke ATASAN (langsung/tidak langsung)
  // - Staff/Fungsional → Managerial ATASAN (OK)
  // - Staff/Fungsional → Staff/Fungsional ATASAN (OK)
  // - Managerial → Managerial ATASAN (OK)
  // - TIDAK BISA ke REKAN (sesama level/setingkat)
  // - TIDAK BISA ke BAWAHAN
  // Filter by SubArea dan hanya ke ATASAN hierarchy

  /**
   * Main method: Get Kajian recipients using org_data
   * Kajian (KA): Korespondensi dari fungsional/staf ke ATASAN saja
   * dalam Sub Area yang sama (atasan langsung/tidak langsung)
   * TIDAK BISA ke sesama rekan atau setingkat
   * 
   * @param positionId - Position ID pengirim (dari org_data)
   */
  async getKajianRecipients(positionId: number): Promise<KajianRecipientResponseDto> {
    // Get cached position data from org_data
    const barisData = await this.getPositionData();

    // Find sender data
    const senderData = this.findByPosition(barisData, positionId);

    if (!senderData) {
      throw new NotFoundException(
        `Position dengan ID ${positionId} tidak ditemukan`,
      );
    }

    // KA: Everyone can send (Managerial, Fungsional, Staff) - no restriction

    // Get recipients using filter logic
    const recipientData = this.filterByPositionKA(barisData, positionId);

    // Filter: exclude self
    const recipients = recipientData.filter((r) => r.position !== positionId);

    // Convert to KajianRecipientDto format
    const atasanList: KajianRecipientDto[] = recipients.map((r) => ({
      organizationId: r.organization_id,
      organizationName: r.organization_text,
      persnum: r.persnum_person,
      nama: r.persnum_person_text,
      position: r.position,
      positionName: r.position_text,
      positionStatus: 'ybs',
    }));

    // Sort by organization name, then by position name
    atasanList.sort((a, b) => {
      if (a.organizationName !== b.organizationName) {
        return a.organizationName.localeCompare(b.organizationName);
      }
      return a.positionName.localeCompare(b.positionName);
    });

    const totalRecipients = atasanList.length;
    const uniqueOrgIds = new Set(recipients.map((r) => r.organization_id));

    return {
      sender: senderData,
      recipients: {
        ATASAN: atasanList,
        BAWAHAN: [], // KA: tidak boleh ke bawahan
        REKAN: [], // KA: tidak boleh ke rekan
      },
      hierarchy: {
        totalOrganizations: uniqueOrgIds.size,
        totalRecipients,
      },
    };
  }

  // ============================================================
  // SEND MESSAGE - Kirim Kajian
  // ============================================================

  /**
   * Send Kajian
   * 
   * Kajian (KA): Korespondensi dari fungsional/staf ke ATASAN
   * dalam Sub Area yang sama (atasan langsung/tidak langsung)
   */
  async sendMessage(dto: CreateKajianDto): Promise<SendKajianResponseDto> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Get cached position data
      const barisData = await this.getPositionData();

      // PHASE 1: Validate pengirim
      const pengirimData = this.findByPosition(barisData, dto.pengirim_position_id);
      if (!pengirimData) {
        throw new NotFoundException(
          `Pengirim dengan position_id ${dto.pengirim_position_id} tidak ditemukan`,
        );
      }

      // PHASE 2: Validate all penerima
      const penerimaDataList: PositionData[] = [];
      for (const penerimaPositionId of dto.penerima_position_ids) {
        const penerimaData = this.findByPosition(barisData, penerimaPositionId);
        if (!penerimaData) {
          throw new NotFoundException(
            `Penerima dengan position_id ${penerimaPositionId} tidak ditemukan`,
          );
        }
        penerimaDataList.push(penerimaData);
      }

      // Validate recipients: hanya ATASAN yang valid
      this.validateRecipients(barisData, dto.pengirim_position_id, dto.penerima_position_ids);

      // PHASE 3: Auto-generate nomor surat
      const generatedNomor = await this.nomorSuratService.generateNomor({
        jenis: 'KA',
        positionText: pengirimData.position_text,
        areaText: pengirimData.area_text || '',
        tanggal: new Date(dto.tanggal),
      });

      // PHASE 4: Insert naskah
      const naskahId = uuidv4();
      const tanggalKajian = new Date(dto.tanggal);

      const naskah = new NaskahEntity();
      naskah.id = naskahId;
      naskah.jenis = 'KA';
      naskah.klasifikasi = dto.klasifikasi || '';
      naskah.klasifikasi_text = dto.klasifikasi_text || '';
      naskah.sifat = dto.sifat;
      naskah.nomor = generatedNomor.nomor; // Auto-generated nomor
      naskah.tanggal = tanggalKajian;
      naskah.perihal = dto.perihal;
      naskah.konten = dto.konten || '';
      naskah.status = 'final';
      naskah.lampiran = dto.lampiran?.length ? `${dto.lampiran.length} file` : '';

      await queryRunner.manager.save(naskah);

      // PHASE 4: Insert sirkulasi - pengirim
      const pengirimSirkulasi = this.naskahSirkulasiRepository.create({
        id: uuidv4(),
        idNaskah: naskahId,
        sirkuler: 'pengirim',
        company: String(pengirimData.company || COMPANY_ID),
        companyText: pengirimData.company_name || 'PERUM LPPNPI',
        area: pengirimData.area || '',
        areaText: pengirimData.area_text || '',
        subArea: pengirimData.sub_area ? String(pengirimData.sub_area) : '',
        subAreaText: pengirimData.sub_area_text || '',
        organization: String(pengirimData.organization_id),
        organizationText: pengirimData.organization_text,
        position: String(pengirimData.position),
        positionText: pengirimData.position_text,
        positionStatus: 'ybs',
        idSirkuler: pengirimData.persnum_person ? String(pengirimData.persnum_person) : '',
        namaSirkuler: pengirimData.persnum_person_text || '',
        isDraft: false,
      });
      await queryRunner.manager.save(pengirimSirkulasi);

      // PHASE 5: Insert sirkulasi - penerima
      const penerimaResponses: KajianSirkulasiInfoDto[] = [];
      for (const penerima of penerimaDataList) {
        const penerimaSirkulasi = this.naskahSirkulasiRepository.create({
          id: uuidv4(),
          idNaskah: naskahId,
          sirkuler: 'penerima',
          company: String(penerima.company || COMPANY_ID),
          companyText: penerima.company_name || 'PERUM LPPNPI',
          area: penerima.area || '',
          areaText: penerima.area_text || '',
          subArea: penerima.sub_area ? String(penerima.sub_area) : '',
          subAreaText: penerima.sub_area_text || '',
          organization: String(penerima.organization_id),
          organizationText: penerima.organization_text,
          position: String(penerima.position),
          positionText: penerima.position_text,
          positionStatus: 'ybs',
          idSirkuler: penerima.persnum_person ? String(penerima.persnum_person) : '',
          namaSirkuler: penerima.persnum_person_text || '',
          isDraft: false,
        });
        await queryRunner.manager.save(penerimaSirkulasi);
        penerimaResponses.push(this.toSirkulasiInfo(penerima));
      }

      // PHASE 7: Insert lampiran
      const lampiranResponses: Array<{ id: string; nama_file: string; url: string; tipe?: string }> = [];
      if (dto.lampiran && dto.lampiran.length > 0) {
        for (const lamp of dto.lampiran) {
          const lampiranId = uuidv4();
          const lampiran = this.naskahLampiranRepository.create({
            id: lampiranId,
            id_naskah: naskahId,
            file_name: lamp.nama_file,
            file_pdf: lamp.url,
            jenis: 'KA',
          });
          await queryRunner.manager.save(lampiran);
          lampiranResponses.push({
            id: lampiranId,
            nama_file: lamp.nama_file,
            url: lamp.url,
            tipe: lamp.tipe,
          });
        }
      }

      await queryRunner.commitTransaction();

      return {
        success: true,
        message: 'Kajian berhasil dikirim',
        data: {
          id: naskahId,
          jenis: 'KA',
          tanggal: dto.tanggal,
          status: 'final',
          sifat: dto.sifat,
          klasifikasi: dto.klasifikasi,
          klasifikasi_text: dto.klasifikasi_text,
          nomor: generatedNomor.nomor, // Auto-generated nomor
          perihal: dto.perihal,
          konten: dto.konten,
          pengirim: this.toSirkulasiInfo(pengirimData),
          penerima: penerimaResponses,
          lampiran: lampiranResponses.length > 0 ? lampiranResponses : undefined,
        },
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  // ============================================================
  // SAVE DRAFT - Simpan Kajian sebagai draft
  // ============================================================

  /**
   * Save Draft Kajian
   */
  async saveDraft(dto: CreateKajianDto): Promise<SendKajianResponseDto> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const barisData = await this.getPositionData();

      // Validate pengirim
      const pengirimData = this.findByPosition(barisData, dto.pengirim_position_id);
      if (!pengirimData) {
        throw new NotFoundException(
          `Pengirim dengan position_id ${dto.pengirim_position_id} tidak ditemukan`,
        );
      }

      // Validate penerima
      const penerimaDataList: PositionData[] = [];
      for (const penerimaPositionId of dto.penerima_position_ids) {
        const penerimaData = this.findByPosition(barisData, penerimaPositionId);
        if (!penerimaData) {
          throw new NotFoundException(
            `Penerima dengan position_id ${penerimaPositionId} tidak ditemukan`,
          );
        }
        penerimaDataList.push(penerimaData);
      }

      // Validate recipients
      this.validateRecipients(barisData, dto.pengirim_position_id, dto.penerima_position_ids);

      // Insert naskah with status 'draf'
      const naskahId = uuidv4();
      const tanggalKajian = new Date(dto.tanggal);

      const naskah = new NaskahEntity();
      naskah.id = naskahId;
      naskah.jenis = 'KA';
      naskah.klasifikasi = dto.klasifikasi || '';
      naskah.klasifikasi_text = dto.klasifikasi_text || '';
      naskah.sifat = dto.sifat;
      naskah.nomor = dto.nomor || '';
      naskah.tanggal = tanggalKajian;
      naskah.perihal = dto.perihal;
      naskah.konten = dto.konten || '';
      naskah.status = 'draf';
      naskah.lampiran = dto.lampiran?.length ? `${dto.lampiran.length} file` : '';

      await queryRunner.manager.save(naskah);

      // Insert sirkulasi - pengirim (isDraft = true)
      const pengirimSirkulasi = this.naskahSirkulasiRepository.create({
        id: uuidv4(),
        idNaskah: naskahId,
        sirkuler: 'pengirim',
        company: String(pengirimData.company || COMPANY_ID),
        companyText: pengirimData.company_name || 'PERUM LPPNPI',
        area: pengirimData.area || '',
        areaText: pengirimData.area_text || '',
        subArea: pengirimData.sub_area ? String(pengirimData.sub_area) : '',
        subAreaText: pengirimData.sub_area_text || '',
        organization: String(pengirimData.organization_id),
        organizationText: pengirimData.organization_text,
        position: String(pengirimData.position),
        positionText: pengirimData.position_text,
        positionStatus: 'ybs',
        idSirkuler: pengirimData.persnum_person ? String(pengirimData.persnum_person) : '',
        namaSirkuler: pengirimData.persnum_person_text || '',
        isDraft: true,
      });
      await queryRunner.manager.save(pengirimSirkulasi);

      // Insert sirkulasi - penerima (isDraft = true)
      const penerimaResponses: KajianSirkulasiInfoDto[] = [];
      for (const penerima of penerimaDataList) {
        const penerimaSirkulasi = this.naskahSirkulasiRepository.create({
          id: uuidv4(),
          idNaskah: naskahId,
          sirkuler: 'penerima',
          company: String(penerima.company || COMPANY_ID),
          companyText: penerima.company_name || 'PERUM LPPNPI',
          area: penerima.area || '',
          areaText: penerima.area_text || '',
          subArea: penerima.sub_area ? String(penerima.sub_area) : '',
          subAreaText: penerima.sub_area_text || '',
          organization: String(penerima.organization_id),
          organizationText: penerima.organization_text,
          position: String(penerima.position),
          positionText: penerima.position_text,
          positionStatus: 'ybs',
          idSirkuler: penerima.persnum_person ? String(penerima.persnum_person) : '',
          namaSirkuler: penerima.persnum_person_text || '',
          isDraft: true,
        });
        await queryRunner.manager.save(penerimaSirkulasi);
        penerimaResponses.push(this.toSirkulasiInfo(penerima));
      }

      // Insert lampiran
      const lampiranResponses: Array<{ id: string; nama_file: string; url: string; tipe?: string }> = [];
      if (dto.lampiran && dto.lampiran.length > 0) {
        for (const lamp of dto.lampiran) {
          const lampiranId = uuidv4();
          const lampiran = this.naskahLampiranRepository.create({
            id: lampiranId,
            id_naskah: naskahId,
            file_name: lamp.nama_file,
            file_pdf: lamp.url,
            jenis: 'KA',
          });
          await queryRunner.manager.save(lampiran);
          lampiranResponses.push({
            id: lampiranId,
            nama_file: lamp.nama_file,
            url: lamp.url,
            tipe: lamp.tipe,
          });
        }
      }

      await queryRunner.commitTransaction();

      return {
        success: true,
        message: 'Kajian berhasil disimpan sebagai draft',
        data: {
          id: naskahId,
          jenis: 'KA',
          tanggal: dto.tanggal,
          status: 'draf',
          sifat: dto.sifat,
          klasifikasi: dto.klasifikasi,
          klasifikasi_text: dto.klasifikasi_text,
          nomor: dto.nomor,
          perihal: dto.perihal,
          konten: dto.konten,
          pengirim: this.toSirkulasiInfo(pengirimData),
          penerima: penerimaResponses,
          lampiran: lampiranResponses.length > 0 ? lampiranResponses : undefined,
        },
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  // ============================================================
  // GET SEND MESSAGE - Daftar Kajian yang sudah dikirimkan
  // ============================================================

  /**
   * Get Send Message - Mendapatkan semua kajian yang sudah dikirimkan oleh user
   */
  async getSendMessage(positionId: number): Promise<GetSendKajianResponseDto> {
    const barisData = await this.getPositionData();
    const senderData = this.findByPosition(barisData, positionId);
    if (!senderData) {
      throw new NotFoundException(
        `Position dengan ID ${positionId} tidak ditemukan`,
      );
    }

    // Get all naskah IDs where this position is pengirim
    const pengirimSirkulasi = await this.naskahSirkulasiRepository.find({
      where: {
        position: String(positionId),
        sirkuler: 'pengirim',
      },
    });

    if (pengirimSirkulasi.length === 0) {
      return {
        success: true,
        message: 'Tidak ada kajian yang dikirim',
        total: 0,
        data: [],
      };
    }

    const naskahIds = pengirimSirkulasi
      .map((s) => s.idNaskah)
      .filter((id) => id !== null);

    // Get naskah details for KA type only
    const naskahList = await this.naskahRepository
      .createQueryBuilder('n')
      .where('n.id IN (:...ids)', { ids: naskahIds })
      .andWhere('n.jenis = :jenis', { jenis: 'KA' })
      .orderBy('n.tanggal', 'DESC')
      .getMany();

    if (naskahList.length === 0) {
      return {
        success: true,
        message: 'Tidak ada kajian yang dikirim',
        total: 0,
        data: [],
      };
    }

    const result: SentKajianItemDto[] = [];

    for (const naskah of naskahList) {
      const pengirimInfo = pengirimSirkulasi.find((s) => s.idNaskah === naskah.id);

      // Get penerima list with read status
      const penerimaList = await this.naskahSirkulasiRepository.find({
        where: {
          idNaskah: naskah.id,
          sirkuler: 'penerima',
        },
      });

      // Get lampiran count
      const lampiranCount = await this.naskahLampiranRepository.count({
        where: { id_naskah: naskah.id },
      });

      const pengirim = {
        position_id: pengirimInfo?.position || '',
        position_text: pengirimInfo?.positionText || '',
        organization_text: pengirimInfo?.organizationText || '',
        nama: pengirimInfo?.namaSirkuler || null,
      };

      const penerima = penerimaList.map((p) => ({
        position_id: p.position || '',
        position_text: p.positionText || '',
        organization_text: p.organizationText || '',
        nama: p.namaSirkuler || null,
        status_baca: (p.sendReadTime ? 'terbaca' : 'belum_dibaca') as 'terbaca' | 'belum_dibaca',
        read_time: p.sendReadTime,
      }));

      result.push({
        id: naskah.id,
        jenis: naskah.jenis,
        nomor: naskah.nomor,
        perihal: naskah.perihal,
        tanggal: naskah.tanggal,
        sifat: naskah.sifat,
        status: naskah.status,
        pengirim,
        penerima,
        jumlah_lampiran: lampiranCount,
      });
    }

    return {
      success: true,
      message: 'Berhasil mendapatkan daftar kajian yang dikirim',
      total: result.length,
      data: result,
    };
  }

  // ============================================================
  // UPDATE DRAFT - Update Kajian yang masih draft
  // ============================================================

  /**
   * Update draft kajian
   */
  async updateDraft(
    naskahId: string,
    dto: UpdateDraftKajianDto,
  ): Promise<UpdateDraftKajianResponseDto> {
    // Validate naskah exists and is draft
    const naskah = await this.naskahRepository.findOne({
      where: { id: naskahId },
    });

    if (!naskah) {
      throw new NotFoundException(`Naskah dengan ID ${naskahId} tidak ditemukan`);
    }

    if (naskah.status !== 'draf') {
      throw new ForbiddenException(
        `Naskah tidak bisa diupdate karena status sudah '${naskah.status}'. Hanya naskah dengan status 'draf' yang bisa diupdate.`,
      );
    }

    if (naskah.jenis !== 'KA') {
      throw new ForbiddenException(
        `Naskah ini bukan kajian (jenis: ${naskah.jenis}). API ini hanya untuk update kajian.`,
      );
    }

    // Validate ownership
    const pengirimSirkulasi = await this.naskahSirkulasiRepository.findOne({
      where: {
        idNaskah: naskahId,
        sirkuler: 'pengirim',
      },
    });

    if (!pengirimSirkulasi) {
      throw new NotFoundException(`Data pengirim tidak ditemukan untuk naskah ${naskahId}`);
    }

    if (String(pengirimSirkulasi.position) !== String(dto.pengirim_position_id)) {
      throw new ForbiddenException(
        `Anda tidak memiliki akses untuk mengupdate naskah ini. Hanya pengirim asli yang bisa mengupdate.`,
      );
    }

    const barisData = await this.getPositionData();
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    const isDraft = dto.action !== 'kirim';

    try {
      // Get pengirim data for auto-generate nomor
      const pengirimData = this.findByPosition(barisData, dto.pengirim_position_id);

      // Update naskah
      if (dto.tanggal) naskah.tanggal = new Date(dto.tanggal);
      if (dto.sifat) naskah.sifat = dto.sifat;
      if (dto.perihal) naskah.perihal = dto.perihal;
      if (dto.konten !== undefined) naskah.konten = dto.konten;
      if (dto.klasifikasi !== undefined) naskah.klasifikasi = dto.klasifikasi;
      if (dto.klasifikasi_text !== undefined) naskah.klasifikasi_text = dto.klasifikasi_text;

      // Auto-generate nomor saat action = kirim dan nomor belum ada
      if (!isDraft && (!naskah.nomor || naskah.nomor === '') && pengirimData) {
        const generatedNomor = await this.nomorSuratService.generateNomor({
          jenis: 'KA',
          positionText: pengirimData.position_text,
          areaText: pengirimData.area_text || '',
          tanggal: naskah.tanggal,
        });
        naskah.nomor = generatedNomor.nomor;
      }

      if (dto.lampiran) {
        naskah.lampiran = dto.lampiran.length > 0 ? `${dto.lampiran.length} file` : '';
      }
      naskah.status = isDraft ? 'draf' : 'final';

      await queryRunner.manager.save(naskah);

      // Update penerima if changed
      if (dto.penerima_position_ids && dto.penerima_position_ids.length > 0) {
        this.validateRecipients(barisData, dto.pengirim_position_id, dto.penerima_position_ids);

        const penerimaDataList: PositionData[] = [];
        for (const penerimaId of dto.penerima_position_ids) {
          const penerimaData = this.findByPosition(barisData, penerimaId);
          if (!penerimaData) {
            throw new NotFoundException(
              `Penerima dengan position_id ${penerimaId} tidak ditemukan`,
            );
          }
          penerimaDataList.push(penerimaData);
        }

        // Delete old penerima
        await queryRunner.manager.delete(NaskahSirkulasi, {
          idNaskah: naskahId,
          sirkuler: 'penerima',
        });

        // Insert new penerima
        for (const penerima of penerimaDataList) {
          const penerimaSirkulasi = this.naskahSirkulasiRepository.create({
            id: uuidv4(),
            idNaskah: naskahId,
            sirkuler: 'penerima',
            company: String(penerima.company || COMPANY_ID),
            companyText: penerima.company_name || 'PERUM LPPNPI',
            area: penerima.area || '',
            areaText: penerima.area_text || '',
            subArea: penerima.sub_area ? String(penerima.sub_area) : '',
            subAreaText: penerima.sub_area_text || '',
            organization: String(penerima.organization_id),
            organizationText: penerima.organization_text,
            position: String(penerima.position),
            positionText: penerima.position_text,
            positionStatus: 'ybs',
            idSirkuler: penerima.persnum_person ? String(penerima.persnum_person) : '',
            namaSirkuler: penerima.persnum_person_text || '',
            isDraft,
          });
          await queryRunner.manager.save(penerimaSirkulasi);
        }
      }

      // Update isDraft on pengirim if action = kirim
      if (!isDraft) {
        await queryRunner.manager.update(
          NaskahSirkulasi,
          { idNaskah: naskahId, sirkuler: 'pengirim' },
          { isDraft: false },
        );

        // Update existing penerima if not replaced
        if (!dto.penerima_position_ids || dto.penerima_position_ids.length === 0) {
          await queryRunner.manager.update(
            NaskahSirkulasi,
            { idNaskah: naskahId, sirkuler: 'penerima' },
            { isDraft: false },
          );
        }
      }

      // Update lampiran if changed
      if (dto.lampiran) {
        await queryRunner.manager.delete(NaskahLampiranEntity, {
          id_naskah: naskahId,
        });

        for (const lamp of dto.lampiran) {
          const lampiran = this.naskahLampiranRepository.create({
            id: uuidv4(),
            id_naskah: naskahId,
            file_name: lamp.nama_file,
            file_pdf: lamp.url,
            jenis: 'KA',
          });
          await queryRunner.manager.save(lampiran);
        }
      }

      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }

    // Fetch updated data for response (outside transaction)
    const updatedNaskah = await this.naskahRepository.findOne({
      where: { id: naskahId },
    });

    const updatedSirkulasi = await this.naskahSirkulasiRepository.find({
      where: { idNaskah: naskahId },
    });

    const updatedLampiran = await this.naskahLampiranRepository.find({
      where: { id_naskah: naskahId },
    });

    const pengirimSirk = updatedSirkulasi.find((s) => s.sirkuler === 'pengirim');
    const penerimaSirk = updatedSirkulasi.filter((s) => s.sirkuler === 'penerima');

    const sirkulasiToResponse = (s: NaskahSirkulasi): KajianSirkulasiInfoDto => ({
      position_id: parseInt(s.position || '0', 10),
      position_text: s.positionText || null,
      persnum: s.idSirkuler ? parseInt(s.idSirkuler, 10) : null,
      nama: s.namaSirkuler || null,
      organization_id: parseInt(s.organization || '0', 10),
      organization_text: s.organizationText || null,
      sub_area: s.subArea ? parseInt(s.subArea, 10) : null,
      sub_area_text: s.subAreaText || null,
      area: s.area || null,
      area_text: s.areaText || null,
      company: parseInt(s.company || '0', 10),
      company_name: s.companyText || null,
    });

    // Create default pengirim if not found
    const defaultPengirim: KajianSirkulasiInfoDto = {
      position_id: 0,
      position_text: null,
      persnum: null,
      nama: null,
      organization_id: 0,
      organization_text: null,
      sub_area: null,
      sub_area_text: null,
      area: null,
      area_text: null,
      company: 0,
      company_name: null,
    };

    return {
      success: true,
      message: isDraft
        ? 'Draft kajian berhasil diupdate'
        : 'Kajian berhasil diupdate dan dikirim',
      data: {
        id: naskahId,
        jenis: updatedNaskah?.jenis || 'KA',
        tanggal: updatedNaskah?.tanggal
          ? (updatedNaskah.tanggal instanceof Date
              ? updatedNaskah.tanggal.toISOString().split('T')[0]
              : String(updatedNaskah.tanggal).split('T')[0])
          : '',
        status: isDraft ? 'draf' : 'final',
        sifat: updatedNaskah?.sifat || '',
        klasifikasi: updatedNaskah?.klasifikasi || '',
        klasifikasi_text: updatedNaskah?.klasifikasi_text || '',
        nomor: updatedNaskah?.nomor || '',
        perihal: updatedNaskah?.perihal || '',
        konten: updatedNaskah?.konten || '',
        pengirim: pengirimSirk ? sirkulasiToResponse(pengirimSirk) : defaultPengirim,
        penerima: penerimaSirk.map(sirkulasiToResponse),
        lampiran: updatedLampiran.map((l) => ({
          id: l.id,
          nama_file: l.file_name || '',
          url: l.file_pdf || '',
        })),
      },
    };
  }

  // ============================================================
  // SEND DRAFT - Kirim draft kajian (ubah status ke final)
  // ============================================================

  /**
   * Send Draft - Kirim kajian yang masih draft
   */
  async sendDraft(
    naskahId: string,
    dto: SendDraftKajianDto,
  ): Promise<SendDraftKajianResponseDto> {
    const updateDto: UpdateDraftKajianDto = {
      pengirim_position_id: dto.pengirim_position_id,
      penerima_position_ids: dto.penerima_position_ids,
      tanggal: dto.tanggal,
      klasifikasi: dto.klasifikasi,
      klasifikasi_text: dto.klasifikasi_text,
      sifat: dto.sifat,
      nomor: dto.nomor,
      perihal: dto.perihal,
      konten: dto.konten,
      lampiran: dto.lampiran,
      kop_logo: dto.kop_logo,
      kop_judul: dto.kop_judul,
      nama_jabatan: dto.nama_jabatan,
      paraf: dto.paraf,
      action: 'kirim', // Force action = kirim
    };

    const result = await this.updateDraft(naskahId, updateDto);

    return {
      success: result.success,
      message: 'Draft kajian berhasil dikirim',
      data: result.data
        ? {
            id: result.data.id,
            jenis: result.data.jenis,
            tanggal: result.data.tanggal,
            status: 'final' as const,
            sifat: result.data.sifat,
            klasifikasi: result.data.klasifikasi,
            klasifikasi_text: result.data.klasifikasi_text,
            nomor: result.data.nomor,
            perihal: result.data.perihal,
            konten: result.data.konten,
            pengirim: result.data.pengirim,
            penerima: result.data.penerima,
            lampiran: result.data.lampiran,
          }
        : undefined,
    };
  }
}
