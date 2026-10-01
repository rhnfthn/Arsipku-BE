import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import {
  delegatedPengirimFields,
  delegatedRecipientFields,
} from '../../../common/helpers/delegasi-rendering.helper';
import { isAllowedCorrespondenceRecipient } from '../../../common/utils/correspondence-recipient.util';
import {
  createCorrespondenceAttachmentFileName,
  createCorrespondenceFinalFileName,
} from '../../../common/utils/correspondence-file-name.util';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Repository,
  LessThanOrEqual,
  MoreThanOrEqual,
  In,
  Not,
  DataSource,
} from 'typeorm';
import { PDFDocument } from 'pdf-lib';
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
import { StorageService } from '../../storage/services/storage.service';
import { GeneratePdfKajianService } from '../../generate_pdf/services/generate_pdf_kajian.service';
import { SubAreaAlamatService } from '../../sub-area-alamat/services/sub_area_alamat.service';
import { DigsigService } from '../../digsig/services/digsig.service';
import { QRCodeService } from '../../digsig/services/qrcode.service';
import { v4 as uuidv4 } from 'uuid';
import { MeilisearchSyncService } from '../../search/services/meilisearch-sync.service';
import { NotificationService } from '../../notification/services';
import { assertDateNotInFuture } from '../../../common/helpers/date-validation.helper';
import { updatePartitionedNaskah } from '../../../common/helpers/naskah-partition.helper';
import {
  KajianRecipientResponseDto,
  OrgDataPositionDto,
  KajianRecipientGroupDto,
  KajianRecipientDto,
} from '../dto/kajian-recipient-response.dto';
import {
  CreateKajianDto,
  UpdateDraftDto,
  FinalizeDraftDto,
  SignOption,
} from '../dto/create-kajian.dto';
import {
  SendMessageResponseDto,
  SirkulasiInfoDto,
  SendMessageDataDto,
} from '../dto/send-kajian-response.dto';
import {
  GetSendMessageResponseDto,
  SendMessageItemDto,
  PenerimaInfoDto,
  TembusanInfoDto,
  LampiranInfoDto,
} from '../dto/get-send-message-response.dto';
import {
  formatSignatureData,
  generateSignatureId,
  QRCodeData,
} from '../../../common/helpers/signature.helper';
import { TteSigningGateway } from '../../tte-portal/services/tte-signing-gateway.service';
import { TteSigningService } from '../../tte-portal/services/tte-signing.service';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';

const MANAGERIAL_THRESHOLD = 70000000;
const COMPANY_ID = 10000; // PERUM LPPNPI
const VERIFICATION_BASE_URL = 'https://arsipku.airnavindonesia.co.id/verify';
const TODAY = new Date().toISOString().split('T')[0];

// Interface untuk data dari position_json (cached org data)
interface PositionData {
  position: number;
  position_text: string;
  position_abbreviation: string | null;
  chief: number; // 1 = managerial, 0 = staff
  bod_tag?: string | null;
  departType: string | null;
  persnum_person: number | null;
  persnum_person_text: string | null;
  position_status?: string | null;
  positionStatus?: string | null;
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
    private readonly storageService: StorageService,
    private readonly generatePdfKajianService: GeneratePdfKajianService,
    private readonly subAreaAlamatService: SubAreaAlamatService,
    private readonly digsigService: DigsigService,
    private readonly qrCodeService: QRCodeService,
    private readonly meilisearchSyncService: MeilisearchSyncService,
    private readonly notificationService: NotificationService,
    private readonly tteSigningGateway: TteSigningGateway,
    private readonly tteSigningService: TteSigningService,
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
   * Filter recipients for Kajian.
   *
   * Kajian hanya dibuat oleh fungsional/staf (chief=0) dan penerimanya
   * adalah pejabat managerial (chief=1) yang berada di atas pengirim:
   * seluruh jenjang BOD-3/BOD-2/BOD-1 di dalam divisi pengirim, lalu
   * Direktur pada direktorat yang sama dan Direktur Utama. Dewan Pengawas
   * tidak termasuk.
   */
  private filterByPositionKA(
    barisData: PositionData[],
    positionParam: number,
  ): PositionData[] {
    const current = this.findByPosition(barisData, positionParam);
    if (!current) return [];

    const currentOrgId = current.organization_id;
    const currentCompany = current.company;
    const currentDirectorate = Number(current.direktorat_id ?? 0);

    // Di org_data, organization_parent menunjuk ke atas. Posisi atasan
    // pengirim berada pada department/unit di bawah node divisinya:
    // Division -> Department -> Unit. Pilih cabang department yang masih
    // terkait dengan nama divisi (Technology -> Enterprise Technology),
    // sehingga cabang VP/AVP lain dalam divisi yang sama tidak ikut.
    const currentDivisionId = Number(current.divisi_id ?? 0);
    const divisionRootId = currentDivisionId || currentOrgId;
    const divisionOrgIds = new Set<number>();
    const visitedOrgIds = new Set<number>();

    const stopWords = new Set([
      'AND',
      'THE',
      'OF',
      'DIVISION',
      'DEPARTMENT',
      'UNIT',
      'PLANNING',
      'MANAGEMENT',
    ]);
    const wordsOf = (text: string | null | undefined) =>
      String(text || '')
        .toUpperCase()
        .split(/[^A-Z0-9]+/)
        .filter((word) => word.length >= 5 && !stopWords.has(word));
    const divisionWords = new Set(
      wordsOf(current.divisi_name || current.organization_text),
    );

    const directChildren = barisData.filter(
      (x) =>
        x.company === currentCompany &&
        Number(x.organization_parent) === divisionRootId,
    );
    const matchingBranchRoots = directChildren.filter((x) =>
      wordsOf(x.organization_text).some((word) => divisionWords.has(word)),
    );
    const branchRoots = matchingBranchRoots.length > 0 ? matchingBranchRoots : [];

    const collectDivisionTree = (orgId: number) => {
      if (visitedOrgIds.has(orgId)) return;
      visitedOrgIds.add(orgId);
      divisionOrgIds.add(orgId);

      for (const org of barisData) {
        if (
          org.company === currentCompany &&
          Number(org.organization_parent) === orgId
        ) {
          collectDivisionTree(Number(org.organization_id));
        }
      }
    };

    // Posisi di node divisi sendiri (contoh: EVP Made) tetap ikut, tetapi
    // jangan menelusuri semua child dari root karena tiap child dapat
    // merupakan cabang atasan yang berbeda.
    visitedOrgIds.add(divisionRootId);
    divisionOrgIds.add(divisionRootId);
    for (const branch of branchRoots) {
      collectDivisionTree(Number(branch.organization_id));
    }

    // Get managerial positions in the sender's division subtree. Directors
    // and the President Director are valid recipients; the Board of
    // Supervisors is excluded.
    const recipients = barisData.filter((x) => {
      if (x.company !== currentCompany) return false;
      if (x.position === positionParam) return false;
      if (x.chief !== 1) return false;

      const positionText = String(x.position_text || '').toUpperCase();
      if (/DEWAN\s+PENGAWAS/.test(positionText)) return false;
      const bodTag = String(x.bod_tag || '').trim().toUpperCase();

      const isDirekturUtama = /DIREKTUR\s+UTAMA|PRESIDENT\s+DIRECTOR/.test(
        positionText,
      );
      if (isDirekturUtama) return true;

      const positionDirectorate = Number(x.direktorat_id ?? 0);
      const isDirector = /\bDIREKTUR\b/.test(positionText);
      const sameDirectorate =
        currentDirectorate > 0 && positionDirectorate === currentDirectorate;
      const isBodAboveStaff =
        ['BOD-3', 'BOD-2', 'BOD-1'].includes(bodTag) ||
        /\b(AVP|VP|EVP)\b/.test(positionText);
      const sameDivisionChain =
        divisionOrgIds.has(Number(x.organization_id)) &&
        Number(x.divisi_id ?? 0) === currentDivisionId &&
        isBodAboveStaff;

      return (
        (isDirector && sameDirectorate) ||
        sameDivisionChain
      );
    });

    return recipients;
  }

  /**
   * Validate the Kajian sender and recipients against the current org data.
   */
  private validateKajianRouting(
    barisData: PositionData[],
    pengirimPositionId: number,
    penerimaPositionIds: number[],
  ): void {
    const sender = this.findByPosition(barisData, pengirimPositionId);
    if (!sender) {
      throw new NotFoundException(
        `Pengirim dengan position_id ${pengirimPositionId} tidak ditemukan`,
      );
    }

    if (sender.chief !== 0) {
      throw new ForbiddenException(
        'Kajian hanya dapat dibuat oleh fungsional/staf (chief=0).',
      );
    }

    const validRecipients = this.filterByPositionKA(
      barisData,
      pengirimPositionId,
    );
    const validPositionIds = new Set(
      validRecipients.map((r) => Number(r.position)),
    );

    const invalidRecipients: number[] = [];
    for (const penerimaId of penerimaPositionIds) {
      if (!validPositionIds.has(Number(penerimaId))) {
        invalidRecipients.push(penerimaId);
      }
    }

    if (invalidRecipients.length > 0) {
      throw new ForbiddenException(
        `Penerima dengan position_id [${invalidRecipients.join(', ')}] tidak valid. ` +
          `Kajian hanya bisa dikirim ke managerial di atas pengirim sampai Direktur Utama.`,
      );
    }
  }

  /**
   * Convert PositionData to SirkulasiInfoDto
   */
  private toSirkulasiInfo(pos: PositionData): SirkulasiInfoDto {
    const recipient = delegatedRecipientFields(pos);
    return {
      position: pos.position,
      position_text: recipient.positionText,
      persnum: pos.persnum_person,
      nama: pos.persnum_person_text,
      organization_id: pos.organization_id,
      organization_text: pos.organization_text,
      sub_area: pos.sub_area,
      sub_area_text: pos.sub_area_text,
      area: pos.area,
      area_text: pos.area_text,
    };
  }

  /**
   * Move temporary lampiran ke folder final dan update database
   * Dipanggil saat save draft atau send message
   *
   * @param lampiranIds - Array of lampiran IDs (temporary)
   * @param naskahId - ID naskah yang akan dikaitkan
   * @param finalFolder - Folder tujuan (e.g., 'kajian/lampiran')
   */
  private async createFinalPdfFileName(
    jenis: string,
    naskahId: string,
  ): Promise<string> {
    const attachmentCount = await this.naskahLampiranRepository.count({
      where: { id_naskah: naskahId },
    });
    return createCorrespondenceFinalFileName(jenis, attachmentCount);
  }

  private async moveTemporaryLampiranToFinal(
    lampiranIds: string[],
    naskahId: string,
    finalFolder: string,
  ): Promise<void> {
    if (!lampiranIds || lampiranIds.length === 0) {
      return;
    }

    // Get all lampiran by IDs (both temporary and already final)
    const allLampiran = await this.naskahLampiranRepository.find({
      where: {
        id: In(lampiranIds),
      },
    });

    if (allLampiran.length === 0) {
      throw new NotFoundException(
        `Lampiran tidak ditemukan. IDs yang dicari: ${lampiranIds.join(', ')}. ` +
          `Pastikan lampiran sudah diupload via POST /upload-temporary dan ID yang dikirim benar.`,
      );
    }

    // Kunci partisi: sinkronkan tanggal lampiran ke tanggal naskah induk
    // supaya lampiran final berada di partisi tahun yang sama dengan naskah.
    const parentNaskah = await this.naskahRepository.findOne({
      where: { id: naskahId },
    });

    // Process each lampiran
    for (const lampiran of allLampiran) {
      // Skip if already linked to this naskah and not temporary
      if (lampiran.id_naskah === naskahId && lampiran.is_temporary === 0) {
        continue;
      }

      // If temporary, move file to final location
      if (lampiran.is_temporary === 1) {
        const oldKey = lampiran.file_pdf;

        // Generate new key untuk final location
        const fileName = createCorrespondenceAttachmentFileName('KA');
        const newKey = `${finalFolder}/${fileName}`;

        // Move file di storage
        await this.storageService.moveFile(oldKey, newKey);

        // Update file path
        lampiran.file_pdf = newKey;
        lampiran.file_name = fileName;
        lampiran.temp_folder_id = null;
      }

      // Update database - link to naskah and mark as final
      lampiran.id_naskah = naskahId;
      lampiran.jenis = 'KA';
      lampiran.is_temporary = 0;
      lampiran.tanggal = parentNaskah?.tanggal ?? lampiran.tanggal;

      await this.naskahLampiranRepository.save(lampiran);
    }
  }

  /**
   * Get lampiran files with signed URLs for response
   */
  private async getLampiranFilesWithUrls(naskahId: string): Promise<
    Array<{
      id: string;
      fileName: string;
      filePath: string;
      fileUrl: string | null;
    }>
  > {
    const lampiranFiles = await this.naskahLampiranRepository.find({
      where: { id_naskah: naskahId },
    });

    return Promise.all(
      lampiranFiles.map(async (l) => {
        let fileUrl: string | null = null;
        if (l.file_pdf) {
          try {
            fileUrl = await this.storageService.getFileUrl(l.file_pdf);
          } catch (e) {
            console.error(
              `[KajianService] Failed to get URL for lampiran ${l.id}:`,
              e,
            );
          }
        }
        return {
          id: l.id,
          fileName: l.file_name || '',
          filePath: l.file_pdf || '',
          fileUrl,
        };
      }),
    );
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
  ): Promise<OrgDataPositionDto[]> {
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

    const result: OrgDataPositionDto[] = [];

    for (const personId of personIds) {
      const person = personMap.get(personId);
      if (!person?.name) continue;

      const personPos = personPosMap.get(personId);
      if (!personPos?.position) continue;

      const posOrg = positionOrgMap.get(personPos.position);
      if (!posOrg?.org) continue;

      const posDet = positionMap.get(personPos.position);

      result.push({
        position: personPos.position,
        position_text: posDet?.shortText || '',
        position_abbreviation: null,
        chief: 0,
        departType: null,
        bod_tag: null,
        persnum_person: person.persnum || 0,
        persnum_person_text: person.name,
        organization_id: posOrg.org,
        organization_text: posOrg.orgName || '',
        organization_abbreviation: null,
        organization_parent: null,
        organization_parent_text: null,
        sub_area: null,
        sub_area_text: null,
        area: null,
        area_text: null,
        level: 0,
        divisi_id: null,
        divisi_name: null,
        direktorat_id: null,
        direktorat_name: null,
        company: COMPANY_ID,
        company_name: 'PERUM LPPNPI',
      });
    }

    return result;
  }

  /**
   * Main method: Get Kajian recipients using org_data
   * Kajian (KA): fungsional/staf ke managerial di atasnya sampai Direktur Utama.
   *
   * @param positionId - Position ID pengirim (dari org_data)
   */
  async getKajianRecipients(
    positionId: number,
  ): Promise<KajianRecipientResponseDto> {
    // Get cached position data from org_data
    const barisData = await this.getPositionData();

    // Find sender data
    const senderData = this.findByPosition(barisData, positionId);

    if (!senderData) {
      throw new NotFoundException(
        `Position dengan ID ${positionId} tidak ditemukan`,
      );
    }

    this.validateKajianRouting(barisData, positionId, []);

    // Get recipients using filter logic
    const recipientData = this.filterByPositionKA(barisData, positionId);

    // Filter: exclude self
    const recipients = recipientData.filter(
      (r) => r.position !== positionId && isAllowedCorrespondenceRecipient(r),
    );

    // Convert to OrgDataPositionDto format (with bod_tag)
    const atasanList: OrgDataPositionDto[] = recipients.map((r) => ({
      position: r.position,
      position_text: r.position_text,
      position_abbreviation: r.position_abbreviation,
      chief: r.chief,
      departType: r.departType,
      bod_tag: r.bod_tag ?? null,
      persnum_person: r.persnum_person,
      persnum_person_text: r.persnum_person_text,
      organization_id: r.organization_id,
      organization_text: r.organization_text,
      organization_abbreviation: r.organization_abbreviation,
      organization_parent: r.organization_parent,
      organization_parent_text: r.organization_parent_text,
      sub_area: r.sub_area,
      sub_area_text: r.sub_area_text,
      area: r.area,
      area_text: r.area_text,
      level: r.level,
      divisi_id: r.divisi_id,
      divisi_name: r.divisi_name,
      direktorat_id: r.direktorat_id,
      direktorat_name: r.direktorat_name,
      company: r.company,
      company_name: r.company_name,
    }));

    // Sort: Direktorat Utama selalu paling atas, lalu by organization name, position name
    atasanList.sort((a, b) => {
      const aIsUtama = a.organization_text === 'Direktorat Utama' ? 0 : 1;
      const bIsUtama = b.organization_text === 'Direktorat Utama' ? 0 : 1;
      if (aIsUtama !== bIsUtama) return aIsUtama - bIsUtama;
      if (a.organization_text !== b.organization_text) {
        return a.organization_text.localeCompare(b.organization_text);
      }
      return a.position_text.localeCompare(b.position_text);
    });

    const totalRecipients = atasanList.length;
    const uniqueOrgIds = new Set(recipients.map((r) => r.organization_id));

    // Convert sender to OrgDataPositionDto
    const senderDto: OrgDataPositionDto = {
      position: senderData.position,
      position_text: senderData.position_text,
      position_abbreviation: senderData.position_abbreviation,
      chief: senderData.chief,
      departType: senderData.departType,
      bod_tag: senderData.bod_tag ?? null,
      persnum_person: senderData.persnum_person,
      persnum_person_text: senderData.persnum_person_text,
      organization_id: senderData.organization_id,
      organization_text: senderData.organization_text,
      organization_abbreviation: senderData.organization_abbreviation,
      organization_parent: senderData.organization_parent,
      organization_parent_text: senderData.organization_parent_text,
      sub_area: senderData.sub_area,
      sub_area_text: senderData.sub_area_text,
      area: senderData.area,
      area_text: senderData.area_text,
      level: senderData.level,
      divisi_id: senderData.divisi_id,
      divisi_name: senderData.divisi_name,
      direktorat_id: senderData.direktorat_id,
      direktorat_name: senderData.direktorat_name,
      company: senderData.company,
      company_name: senderData.company_name,
    };

    return {
      sender: senderDto,
      recipients: {
        ATASAN: atasanList,
        BAWAHAN: [], // KA: tidak boleh ke bawahan
        REKAN: [], // KA: tidak boleh ke rekan
      },
    };
  }

  /**
   * Build pengirim sirkulasi fields honoring delegation actor from DTO.
   */
  private pengirimSirkulasiFields(
    dto: any,
    pengirimData: any,
  ): { positionStatus: string; positionText: string; namaSirkuler: string } {
    const actorUser = dto?.actor_position_status
      ? { position_status: dto.actor_position_status, nama: dto.actor_nama }
      : undefined;
    return delegatedPengirimFields(
      actorUser ?? {
        position_status:
          pengirimData?.position_status ?? pengirimData?.positionStatus ?? null,
        nama: pengirimData?.persnum_person_text ?? pengirimData?.nama ?? '',
      },
      pengirimData?.position_text ?? '',
      pengirimData?.persnum_person_text ?? '',
    );
  }

  // ============================================================
  // SEND MESSAGE - Kirim Kajian
  // ============================================================

  /**
   * Send Kajian
   *
   * Kajian (KA): Korespondensi dari fungsional/staf ke ATASAN
   * dalam Sub Area yang sama (atasan langsung/tidak langsung)
   *
   * @param dto - DTO dengan data kajian termasuk sign_option dan passphrase
   * @param persnum - Persnum user untuk BSrE (optional, required for digsig)
   */
  async sendMessage(
    dto: CreateKajianDto,
    persnum?: number,
    portalUser?: JwtPayload,
  ): Promise<SendMessageResponseDto> {
    const isPortalMode =
      dto.sign_option === SignOption.DIGSIG &&
      (await this.tteSigningGateway.isPortalMode('KA'));
    // ============================================================
    // VALIDATE SIGNING OPTIONS
    // ============================================================
    console.log(
      `[KA] sendMessage called with sign_option: ${dto.sign_option}, persnum: ${persnum}`,
    );

    // If sign_option is digsig, we must have persnum and passphrase
    if (dto.sign_option === SignOption.DIGSIG) {
      if (!persnum) {
        throw new BadRequestException(
          'Persnum diperlukan untuk tanda tangan digital (digsig)',
        );
      }
      if (!isPortalMode && !dto.passphrase) {
        throw new BadRequestException(
          'Passphrase diperlukan untuk tanda tangan digital (digsig)',
        );
      }
    }

    // Determine status: final_tte (digsig), final (qr_only), pending (ttd_basah), or final (default)
    let status: 'pending' | 'pending_tte' | 'final' | 'final_tte' = 'final';
    if (dto.sign_option === SignOption.DIGSIG) {
      status = isPortalMode ? 'pending_tte' : 'final_tte';
    } else if (dto.sign_option === SignOption.TTD_BASAH) {
      status = 'pending';
    }

    console.log(`[KA] Determined status: ${status}`);

    // Delegate to createKaWithSigning for full flow with signing
    return this.createKaWithSigning(dto, status, persnum, portalUser);
  }

  /**
   * OLD sendMessage implementation (kept for reference)
   * Replaced by createKaWithSigning
   */
  private async sendMessageLegacy(
    dto: CreateKajianDto,
  ): Promise<SendMessageResponseDto> {
    // Declare variables outside try block for access after transaction
    let naskahId: string = '';
    let generatedNomor: { nomor: string } = { nomor: '' };
    let tanggalStr: string = '';
    let pengirimData: PositionData | undefined;
    const penerimaResponses: SirkulasiInfoDto[] = [];
    const tembusanResponses: SirkulasiInfoDto[] = [];

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Get cached position data
      const barisData = await this.getPositionData();

      // PHASE 1: Validate pengirim (using new DTO field: pengirim)
      pengirimData = this.findByPosition(barisData, dto.pengirim);
      if (!pengirimData) {
        throw new NotFoundException(
          `Pengirim dengan position_id ${dto.pengirim} tidak ditemukan`,
        );
      }

      // PHASE 2: Validate all penerima (using new DTO field: penerima)
      const penerimaDataList: PositionData[] = [];
      for (const penerimaPositionId of dto.penerima) {
        const penerimaDataItem = this.findByPosition(
          barisData,
          penerimaPositionId,
        );
        if (!penerimaDataItem) {
          throw new NotFoundException(
            `Penerima dengan position_id ${penerimaPositionId} tidak ditemukan`,
          );
        }
        penerimaDataList.push(penerimaDataItem);
      }

      this.validateKajianRouting(
        barisData,
        dto.pengirim,
        dto.penerima,
      );

      // Determine tanggal
      tanggalStr = dto.tgl || new Date().toISOString().split('T')[0];
      const tanggalKajian = new Date(tanggalStr);

      // PHASE 3: Auto-generate nomor surat
      generatedNomor = await this.nomorSuratService.generateNomor({
        jenis: 'KA',
        positionText: pengirimData.position_text,
        positionAbbreviation: pengirimData.position_abbreviation || undefined,
        areaText: pengirimData.area_text || '',
        tanggal: tanggalKajian,
      });

      // PHASE 4: Insert naskah
      naskahId = uuidv4();

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
      naskah.signOption = dto.sign_option || null;
      naskah.lampiran = dto.lampiran || '';
      if (dto.final_pdf) naskah.final_pdf = dto.final_pdf;
      naskah.english = dto.english || false;

      await queryRunner.manager.save(naskah);

      // Insert sirkulasi - pengirim
      const _pf = this.pengirimSirkulasiFields(dto, pengirimData);
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
        positionText: _pf.positionText,
        positionStatus: _pf.positionStatus.toLowerCase() as any,
        idSirkuler: pengirimData.persnum_person
          ? String(pengirimData.persnum_person)
          : '',
        namaSirkuler: _pf.namaSirkuler,
        isDraft: false,
        tanggal: naskah.tanggal, // Kunci partisi — dari naskah induk
      });
      await queryRunner.manager.save(pengirimSirkulasi);

      // Insert sirkulasi - penerima
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
          positionText: delegatedRecipientFields(penerima).positionText,
          positionStatus: delegatedRecipientFields(penerima)
            .positionStatus as any,
          idSirkuler: penerima.persnum_person
            ? String(penerima.persnum_person)
            : '',
          namaSirkuler: penerima.persnum_person_text || '',
          isDraft: false,
          tanggal: naskah.tanggal, // Kunci partisi — dari naskah induk
        });
        await queryRunner.manager.save(penerimaSirkulasi);
        penerimaResponses.push(this.toSirkulasiInfo(penerima));
      }

      // Insert tembusan if provided
      if (dto.tembusan && dto.tembusan.length > 0) {
        for (const tembusanPosId of dto.tembusan) {
          const tembusanData = this.findByPosition(barisData, tembusanPosId);
          if (tembusanData) {
            const tembusanSirkulasi = this.naskahSirkulasiRepository.create({
              id: uuidv4(),
              idNaskah: naskahId,
              sirkuler: 'tembusan',
              company: String(tembusanData.company || COMPANY_ID),
              companyText: tembusanData.company_name || 'PERUM LPPNPI',
              area: tembusanData.area || '',
              areaText: tembusanData.area_text || '',
              subArea: tembusanData.sub_area
                ? String(tembusanData.sub_area)
                : '',
              subAreaText: tembusanData.sub_area_text || '',
              organization: String(tembusanData.organization_id),
              organizationText: tembusanData.organization_text,
              position: String(tembusanData.position),
              positionText: delegatedRecipientFields(tembusanData).positionText,
              positionStatus: delegatedRecipientFields(tembusanData)
                .positionStatus as any,
              idSirkuler: tembusanData.persnum_person
                ? String(tembusanData.persnum_person)
                : '',
              namaSirkuler: tembusanData.persnum_person_text || '',
              isDraft: false,
              tanggal: naskah.tanggal, // Kunci partisi — dari naskah induk
            });
            await queryRunner.manager.save(tembusanSirkulasi);
            tembusanResponses.push(this.toSirkulasiInfo(tembusanData));
          }
        }
      }

      await queryRunner.commitTransaction();

      // Sync to Meilisearch (non-blocking, after successful commit)
      this.meilisearchSyncService.syncNaskah(naskahId).catch(() => {});
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }

    // Move lampiran from temp to final location (after transaction complete)
    if (dto.lampiran_temp_ids && dto.lampiran_temp_ids.length > 0) {
      await this.moveTemporaryLampiranToFinal(
        dto.lampiran_temp_ids,
        naskahId,
        'kajian/lampiran',
      );
    }

    // Get lampiran with signed URLs
    const lampiranResponses = await this.getLampiranFilesWithUrls(naskahId);

    // ============================================================
    // AUTO-GENERATE FINAL PDF (with nomor surat + lampiran merge)
    // ============================================================
    let finalPdfPath: string | undefined;
    let finalPdfUrl: string | null = null;

    try {
      // Get header info for dynamic kota
      const headerInfo = await this.getHeaderInfoByUser(
        {
          company: pengirimData?.company ?? undefined,
          area: pengirimData?.area ?? undefined,
          subArea:
            pengirimData?.sub_area != null
              ? String(pengirimData.sub_area)
              : undefined,
        },
        tanggalStr,
      );

      const dynamicNamaTempat =
        headerInfo?.kota ||
        dto.nama_tempat ||
        pengirimData?.sub_area_text ||
        'Tangerang';

      // Format tanggal for PDF
      const tanggalKajian = new Date(tanggalStr);
      const formattedTanggal = `${dynamicNamaTempat}, ${tanggalKajian.toLocaleDateString(
        'id-ID',
        {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        },
      )}`;

      // Build tertuju (penerima) list
      const tertujuList = penerimaResponses.map((p) => p.position_text);

      // Build tembusan list
      const tembusanList = tembusanResponses.map((t) => t.position_text);

      // Generate PDF with nomor surat
      let pdfBuffer = await this.generatePdfKajianService.generatePdf({
        html: dto.konten || '',
        htmlContent: dto.konten || '',
        nomor: generatedNomor.nomor,
        tertuju: tertujuList,
        tembusan: tembusanList,
        perihal: dto.perihal,
        dari: pengirimData.position_text,
        tanggal: formattedTanggal,
        positionText: dto.nama_jabatan || pengirimData.position_text,
        namaLengkap: dto.nama_lengkap || pengirimData.persnum_person_text || '',
        nama_tempat: dynamicNamaTempat,
        headerKantor: headerInfo?.kantor,
        headerGedung: headerInfo?.gedung,
        headerAlamat: headerInfo?.alamat,
      });

      // Merge with lampiran if any
      if (dto.lampiran_temp_ids && dto.lampiran_temp_ids.length > 0) {
        const lampiranFiles = await this.getTemporaryLampiranFiles(
          dto.lampiran_temp_ids,
        );
        if (lampiranFiles && lampiranFiles.length > 0) {
          pdfBuffer = await this.mergePdfWithTemporaryFiles(
            pdfBuffer,
            lampiranFiles,
          );
        }
      }

      // Upload final PDF to storage
      const pdfFileName = await this.createFinalPdfFileName('KA', naskahId);
      const uploadResult = await this.storageService.uploadBuffer(
        pdfBuffer,
        pdfFileName,
        'application/pdf',
        'kajian/final',
      );

      finalPdfPath = uploadResult.key;

      // Update naskah with final_pdf path
      await this.naskahRepository.update(
        { id: naskahId },
        { final_pdf: finalPdfPath },
      );

      // Generate signed URL for response
      finalPdfUrl = await this.storageService.getFileUrl(finalPdfPath);
    } catch (error) {
      // Don't fail the whole operation if PDF generation fails
      console.error('Failed to auto-generate final PDF:', error);
    }

    return {
      success: true,
      message: 'Kajian berhasil dikirim',
      data: {
        id: naskahId,
        jenis: 'KA',
        nomor: generatedNomor.nomor,
        tanggal: tanggalStr,
        status: 'final',
        perihal: dto.perihal,
        pengirim: this.toSirkulasiInfo(pengirimData),
        penerima: penerimaResponses,
        tembusan: tembusanResponses,
        final_pdf: finalPdfPath || null,
        final_pdf_url: finalPdfUrl,
        lampiran_files: lampiranResponses,
      },
    };
  }

  // ============================================================
  // CREATE KAJIAN WITH SIGNING - Main method untuk signing flow
  // ============================================================

  /**
   * Create Kajian dengan Signing Flow
   * Sama seperti SDI/SDE - support DIGSIG, QR_ONLY, dan NONE
   *
   * Flow untuk DIGSIG:
   * 1. Generate QR Code dengan signature_id dan verification_url
   * 2. Embed QR ke template PDF (generatePdf dengan qrCodeHtml)
   * 3. Hit BSrE API untuk digital signature
   * 4. Build signature metadata (formatSignatureData)
   * 5. Upload final PDF ke MinIO
   *
   * Flow untuk QR_ONLY:
   * 1. Generate QR Code sederhana (tanpa signature_id verification)
   * 2. Embed QR ke template PDF
   * 3. Upload final PDF ke MinIO (tanpa BSrE)
   *
   * Flow untuk NONE:
   * 1. Generate PDF biasa tanpa QR
   * 2. Upload final PDF ke MinIO
   */
  private async createKaWithSigning(
    dto: CreateKajianDto,
    status: 'pending' | 'pending_tte' | 'final' | 'final_tte',
    persnum?: number,
    portalUser?: JwtPayload,
  ): Promise<SendMessageResponseDto> {
    const isPortalMode = status === 'pending_tte';
    console.log(
      `[KA] createKaWithSigning starting - status: ${status}, sign_option: ${dto.sign_option}`,
    );
    assertDateNotInFuture(dto.tgl, 'Tanggal naskah');

    // Use provided date or today
    const tanggal = dto.tgl ?? new Date().toISOString().split('T')[0];

    // Get cached position data
    const barisData = await this.getPositionData(tanggal);

    // PHASE 1: Validate pengirim
    const pengirim = this.findByPosition(barisData, dto.pengirim);
    if (!pengirim) {
      throw new NotFoundException(
        `Pengirim dengan position_id ${dto.pengirim} tidak ditemukan`,
      );
    }

    // PHASE 2: Validate all penerima
    const penerimaList: PositionData[] = [];
    for (const posId of dto.penerima) {
      const penerima = this.findByPosition(barisData, posId);
      if (!penerima) {
        throw new NotFoundException(
          `Penerima dengan position_id ${posId} tidak ditemukan`,
        );
      }
      penerimaList.push(penerima);
    }

    this.validateKajianRouting(barisData, dto.pengirim, dto.penerima);

    // PHASE 3: Validate tembusan
    const tembusanList: PositionData[] = [];
    if (dto.tembusan && dto.tembusan.length > 0) {
      for (const posId of dto.tembusan) {
        const tembusan = this.findByPosition(barisData, posId);
        if (!tembusan) {
          throw new NotFoundException(
            `Tembusan dengan position_id ${posId} tidak ditemukan`,
          );
        }
        tembusanList.push(tembusan);
      }
    }

    // Start transaction
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // PHASE 4: Generate nomor surat
      const tanggalNomor = dto.tgl ? new Date(dto.tgl) : new Date();
      const generatedNomor = await this.nomorSuratService.generateNomor({
        jenis: 'KA',
        positionText: pengirim.position_text,
        positionAbbreviation: pengirim.position_abbreviation || undefined,
        areaText: pengirim.area_text || '',
        tanggal: tanggalNomor,
      });

      // PHASE 5: Insert naskah
      const naskahId = uuidv4();
      const tanggalKajian = dto.tgl ? new Date(dto.tgl) : new Date();

      const naskah = new NaskahEntity();
      naskah.id = naskahId;
      naskah.jenis = 'KA';
      naskah.klasifikasi = dto.klasifikasi || '';
      naskah.klasifikasi_text = dto.klasifikasi_text || '';
      naskah.sifat = dto.sifat;
      naskah.nomor = generatedNomor.nomor;
      naskah.tanggal = tanggalKajian;
      naskah.perihal = dto.perihal;
      naskah.konten = dto.konten || '';
      naskah.status = status;
      naskah.signOption = dto.sign_option || null;
      naskah.lampiran = dto.lampiran || '';
      naskah.english = dto.english || false;

      await queryRunner.manager.save(naskah);

      // PHASE 6: Insert sirkulasi - pengirim
      // TTD Basah (pending) → isDraft=true, no notifications (belum terkirim ke penerima)
      const isPending = status === 'pending' || status === 'pending_tte';
      const _pf = this.pengirimSirkulasiFields(dto, pengirim);
      const pengirimSirkulasi = this.naskahSirkulasiRepository.create({
        id: uuidv4(),
        idNaskah: naskahId,
        sirkuler: 'pengirim',
        company: String(pengirim.company || COMPANY_ID),
        companyText: pengirim.company_name || 'PERUM LPPNPI',
        area: pengirim.area || '',
        areaText: pengirim.area_text || '',
        subArea: pengirim.sub_area ? String(pengirim.sub_area) : '',
        subAreaText: pengirim.sub_area_text || '',
        organization: String(pengirim.organization_id),
        organizationText: pengirim.organization_text,
        position: String(pengirim.position),
        positionText: _pf.positionText,
        positionStatus: _pf.positionStatus.toLowerCase() as any,
        idSirkuler: pengirim.persnum_person
          ? String(pengirim.persnum_person)
          : '',
        namaSirkuler: _pf.namaSirkuler,
        isDraft: isPending,
        tanggal: naskah.tanggal, // Kunci partisi — dari naskah induk
      });
      await queryRunner.manager.save(pengirimSirkulasi);

      // Insert sirkulasi - penerima
      const penerimaResponses: SirkulasiInfoDto[] = [];
      const pendingNotifications: Array<() => Promise<any>> = [];
      for (const penerima of penerimaList) {
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
          positionText: delegatedRecipientFields(penerima).positionText,
          positionStatus: delegatedRecipientFields(penerima)
            .positionStatus as any,
          idSirkuler: penerima.persnum_person
            ? String(penerima.persnum_person)
            : '',
          namaSirkuler: penerima.persnum_person_text || '',
          isDraft: isPending,
          tanggal: naskah.tanggal, // Kunci partisi — dari naskah induk
        });
        await queryRunner.manager.save(penerimaSirkulasi);
        penerimaResponses.push(this.toSirkulasiInfo(penerima));

        // Queue notification to penerima (sent AFTER commit)
        if (!isPending) {
          const posId = String(penerima.position);
          const persnum = penerima.persnum_person
            ? Number(penerima.persnum_person)
            : undefined;
          const sirkId = penerimaSirkulasi.id;
          pendingNotifications.push(() =>
            this.notificationService
              .createNaskahMasukNotification({
                positionId: posId,
                userPersnum: persnum,
                naskahId,
                sirkulasiId: sirkId,
                jenis: 'KA',
                nomor: generatedNomor.nomor,
                perihal: dto.perihal,
                pengirim:
                  pengirim.persnum_person_text || pengirim.position_text,
                pengirimPosition: pengirim.position_text,
                isTembusan: false,
              })
              .catch((err) =>
                console.error('[KA] ❌ Notification failed:', err.message),
              ),
          );
        }
      }

      // Insert sirkulasi - tembusan
      const tembusanResponses: SirkulasiInfoDto[] = [];
      for (const tembusan of tembusanList) {
        const tembusanSirkulasi = this.naskahSirkulasiRepository.create({
          id: uuidv4(),
          idNaskah: naskahId,
          sirkuler: 'tembusan',
          company: String(tembusan.company || COMPANY_ID),
          companyText: tembusan.company_name || 'PERUM LPPNPI',
          area: tembusan.area || '',
          areaText: tembusan.area_text || '',
          subArea: tembusan.sub_area ? String(tembusan.sub_area) : '',
          subAreaText: tembusan.sub_area_text || '',
          organization: String(tembusan.organization_id),
          organizationText: tembusan.organization_text,
          position: String(tembusan.position),
          positionText: delegatedRecipientFields(tembusan).positionText,
          positionStatus: delegatedRecipientFields(tembusan)
            .positionStatus as any,
          idSirkuler: tembusan.persnum_person
            ? String(tembusan.persnum_person)
            : '',
          namaSirkuler: tembusan.persnum_person_text || '',
          isDraft: isPending,
          tanggal: naskah.tanggal, // Kunci partisi — dari naskah induk
        });
        await queryRunner.manager.save(tembusanSirkulasi);
        tembusanResponses.push(this.toSirkulasiInfo(tembusan));

        // Queue notification to tembusan (sent AFTER commit)
        if (!isPending) {
          const posId = String(tembusan.position);
          const persnum = tembusan.persnum_person
            ? Number(tembusan.persnum_person)
            : undefined;
          const sirkId = tembusanSirkulasi.id;
          pendingNotifications.push(() =>
            this.notificationService
              .createNaskahMasukNotification({
                positionId: posId,
                userPersnum: persnum,
                naskahId,
                sirkulasiId: sirkId,
                jenis: 'KA',
                nomor: generatedNomor.nomor,
                perihal: dto.perihal,
                pengirim:
                  pengirim.persnum_person_text || pengirim.position_text,
                pengirimPosition: pengirim.position_text,
                isTembusan: true,
              })
              .catch((err) =>
                console.error(
                  '[KA] ❌ Tembusan notification failed:',
                  err.message,
                ),
              ),
          );
        }
      }

      // PHASE 7: Handle lampiran
      let lampiranFileNames: string[] = [];
      if (dto.lampiran_temp_ids && dto.lampiran_temp_ids.length > 0) {
        const lampiranFiles = await this.getTemporaryLampiranFiles(
          dto.lampiran_temp_ids,
        );
        lampiranFileNames = lampiranFiles.map((f) => f.fileName);
        await this.moveTemporaryLampiranToFinal(
          dto.lampiran_temp_ids,
          naskahId,
          'kajian/lampiran',
        );
      }

      // PHASE 8: Generate PDF dengan QR code (jika signing)
      let finalPdfPath: string | undefined = undefined;
      let pdfBuffer: Buffer;
      let signatureMetadata: string | null = null;
      let bsreNameDoc: string | null = null;

      // Prepare signing data BEFORE generating PDF (untuk embed QR di template)
      const signerName = dto.nama_lengkap || pengirim.persnum_person_text || '';
      const signerJabatan =
        dto.nama_jabatan && dto.nama_jabatan.trim()
          ? dto.nama_jabatan
          : pengirim.position_text;
      let qrCodeHtml: string | undefined = undefined;
      let signatureId: string | undefined = undefined;
      let signedAt: string | undefined = undefined;
      let verificationUrl: string | undefined = undefined;

      console.log(
        `[KA] Phase 8 - Preparing signing, sign_option: ${dto.sign_option}, persnum: ${persnum}`,
      );

      // Pre-generate QR code untuk digsig atau qr_only SEBELUM generate PDF
      if (
        (dto.sign_option === SignOption.DIGSIG && persnum && !isPortalMode) ||
        dto.sign_option === SignOption.QR_ONLY
      ) {
        signedAt = new Date().toISOString();
        signatureId = generateSignatureId();
        verificationUrl = `${VERIFICATION_BASE_URL}/${signatureId}`;

        const qrData: QRCodeData = {
          signature_id:
            dto.sign_option === SignOption.DIGSIG ? signatureId : '',
          document_number: generatedNomor.nomor,
          signed_at: signedAt,
          signer_name: signerName,
          signer_jabatan: signerJabatan,
          document_type: 'Kajian',
          verification_url:
            dto.sign_option === SignOption.DIGSIG ? verificationUrl : undefined,
        };

        // Generate QR Code sebagai base64 HTML untuk template
        console.log(`[KA] Generating QR Code HTML for template`);
        const qrBase64 = await this.qrCodeService.generateQRCodeBase64(qrData);
        qrCodeHtml = `<img src="${qrBase64}" style="width: 80px; height: 80px;" alt="QR Code" />`;
        console.log(`[KA] QR Code HTML generated successfully`);
      }

      try {
        // Get dynamic header info
        const headerInfo = await this.getHeaderInfoByUser(
          {
            company: pengirim.company ?? undefined,
            area: pengirim.area ?? undefined,
            subArea:
              pengirim.sub_area != null ? String(pengirim.sub_area) : undefined,
          },
          tanggal,
        );

        const dynamicNamaTempat =
          headerInfo?.kota ||
          dto.nama_tempat ||
          pengirim.sub_area_text ||
          'Tangerang';

        // Format tanggal for PDF
        const formattedTanggal = `${dynamicNamaTempat}, ${tanggalKajian.toLocaleDateString(
          'id-ID',
          {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          },
        )}`;

        // Build tertuju (penerima) list
        const tertujuList = penerimaList.map(
          (p) => delegatedRecipientFields(p).positionText,
        );

        // Build tembusan text list
        const tembusanTextList = tembusanList.map(
          (t) => delegatedRecipientFields(t).positionText,
        );

        // Generate PDF dengan QR code di template (jika ada)
        console.log(
          `[KA] Generating PDF with qrCodeHtml: ${qrCodeHtml ? 'YES' : 'NO'}`,
        );
        pdfBuffer = await this.generatePdfKajianService.generatePdf({
          htmlContent: dto.konten || '',
          nomor: generatedNomor.nomor,
          tertuju: tertujuList,
          tembusan: tembusanTextList,
          perihal: dto.perihal,
          dari: pengirim.position_text,
          tanggal: formattedTanggal,
          positionText: signerJabatan,
          namaLengkap: signerName,
          nama_tempat: dynamicNamaTempat,
          headerKantor: headerInfo?.kantor,
          headerGedung: headerInfo?.gedung,
          headerAlamat: headerInfo?.alamat,
          // QR Code HTML - akan ditampilkan di template di antara jabatan dan nama
          qrCodeHtml: qrCodeHtml,
          bsreFooter: dto.sign_option === SignOption.DIGSIG,
          html: '',
        });
        console.log(`[KA] PDF generated successfully`);

        // Merge with lampiran if any
        if (dto.lampiran_temp_ids && dto.lampiran_temp_ids.length > 0) {
          const lampiranFiles = await this.getTemporaryLampiranFiles(
            dto.lampiran_temp_ids,
          );
          if (lampiranFiles && lampiranFiles.length > 0) {
            pdfBuffer = await this.mergePdfWithTemporaryFiles(
              pdfBuffer,
              lampiranFiles,
            );
            console.log(`[KA] Lampiran merged successfully`);
          }
        }

        // PHASE 9: Process BSrE signing (jika digsig) - QR sudah di template
        if (dto.sign_option === SignOption.DIGSIG && persnum && !isPortalMode) {
          console.log(
            `[KA] Processing DIGSIG for naskah ${naskahId}, persnum: ${persnum}`,
          );

          // 9a. Fetch NIK dan no_wa dari HR API via DigsigService
          console.log(
            `[KA] Step 9a - Fetching user data for persnum: ${persnum}`,
          );
          const userData = await this.digsigService.getUserDataForBsre(
            persnum.toString(),
          );
          console.log(`[KA] Step 9a - Got userData:`, {
            nik: userData.nik,
            no_wa: userData.no_wa,
          });

          // 9b. Upload PDF (dengan QR) ke temp untuk BSrE signing
          console.log(`[KA] Step 9b - Uploading temp PDF for BSrE`);
          const tempTimestamp = Date.now();
          const tempFileName = `temp-${naskahId}-${tempTimestamp}.pdf`;
          const tempUpload = await this.storageService.uploadBuffer(
            pdfBuffer,
            tempFileName,
            'application/pdf',
            'kajian/temp',
          );
          console.log(`[KA] Step 9b - Temp PDF uploaded: ${tempUpload.key}`);

          // 9c. Hit BSrE API untuk digital signature
          console.log(`[KA] Step 9c - Hitting BSrE API`);
          const bsreResponse = await this.digsigService.hitDigsigEndpoint(
            {
              key: tempUpload.key,
              filename: tempFileName,
              nomorDokumen: generatedNomor.nomor,
              tanggalDokumen: tanggal,
              klasifikasi: dto.klasifikasi || 'Biasa',
              jenisNaskah: 'Kajian',
              perihal: dto.perihal,
              nik: userData.nik,
              passphrase: dto.passphrase!,
              path_dokumen: 'kajian/digsig/',
              no_wa: userData.no_wa,
            },
            {
              userPersnum: persnum,
              userName: signerName || 'User',
              idNaskah: naskahId,
              jenisNaskah: 'KA',
            },
          );
          console.log(
            `[KA] Step 9c - BSrE response:`,
            JSON.stringify(bsreResponse, null, 2),
          );

          // 9d. Extract name_doc from BSrE response
          bsreNameDoc =
            bsreResponse?.name_doc?.[0] ||
            bsreResponse?.data?.name_doc?.[0] ||
            null;
          console.log(`[KA] Step 9d - BSrE name_doc: ${bsreNameDoc}`);

          // 9e. Build signature metadata
          signatureMetadata = formatSignatureData({
            type: 'digsig',
            doc_id: bsreResponse?.doc_id || bsreResponse?.data?.doc_id,
            signature_id: signatureId!,
            signed_at: signedAt!,
            signer_nik: userData.nik,
            signer_name: signerName,
            signer_jabatan: signerJabatan,
            path: null, // Will be updated after upload
            verification_url: verificationUrl!,
            bsre_name_doc: bsreNameDoc,
          });
          console.log(`[KA] Step 9e - Signature metadata built`);

          // 9f. Cleanup temp file
          try {
            await this.storageService.deleteFile(tempUpload.key);
          } catch (e) {
            console.warn(`[KA] Failed to cleanup temp file: ${e.message}`);
          }

          // 9g. Download signed PDF from digsig/ and upload to final/
          if (bsreNameDoc) {
            console.log(`[KA] Step 9g - Downloading signed PDF from digsig/`);
            const digsigPath = `kajian/digsig/${bsreNameDoc}`;
            try {
              const signedPdfBuffer =
                await this.storageService.getFile(digsigPath);
              console.log(
                `[KA] Step 9g - Signed PDF downloaded, size: ${signedPdfBuffer.length} bytes`,
              );
              // Replace pdfBuffer with signed version
              pdfBuffer = signedPdfBuffer;
            } catch (e) {
              console.warn(
                `[KA] Step 9g - Failed to download signed PDF from digsig/, will use original: ${e.message}`,
              );
            }
          }
        } else if (dto.sign_option === SignOption.QR_ONLY) {
          console.log(
            `[KA] QR_ONLY mode - QR already in template, no BSrE signing needed`,
          );
          // signatureMetadata tetap null
        }
        // OPTION 3: TTD_BASAH - tidak ada QR, space untuk tanda tangan manual

        // PHASE 10: Upload final PDF
        const pdfFileName = await this.createFinalPdfFileName('KA', naskahId);
        const uploadResult = await this.storageService.uploadBuffer(
          pdfBuffer,
          pdfFileName,
          'application/pdf',
          'kajian/final',
        );

        finalPdfPath = uploadResult.key;

        // Update naskah with final_pdf path
        await queryRunner.manager.update(
          NaskahEntity,
          { id: naskahId },
          { final_pdf: finalPdfPath },
        );
      } catch (error) {
        console.error('[KA] Error during PDF generation/signing:', error);
        throw new BadRequestException(
          `Gagal proses PDF/signing: ${error.message || 'Unknown error'}`,
        );
      }

      // Commit transaction
      await queryRunner.commitTransaction();

      let portalRedirect:
        | { transactionId: string; signingUrl: string }
        | undefined;
      if (isPortalMode) {
        if (!portalUser || !finalPdfPath) {
          throw new BadRequestException(
            'Konteks pengguna atau PDF Kajian untuk Portal TTE tidak lengkap',
          );
        }
        const portal = await this.tteSigningService.createSigningTransaction({
          sourceKey: finalPdfPath,
          filename: finalPdfPath.split('/').pop() || `KA-${naskahId}.pdf`,
          pathDokumen: 'kajian/digsig/',
          idNaskah: naskahId,
          jenisNaskah: 'KA',
          nomorNaskah: generatedNomor.nomor,
          location: dto.nama_tempat || 'Indonesia',
          reason: `Penandatanganan Kajian ${generatedNomor.nomor}`,
          user: portalUser,
        });
        portalRedirect = {
          transactionId: portal.transactionId,
          signingUrl: portal.signingUrl,
        };
      }

      // Send queued notifications AFTER commit (so DB is visible to WebSocket queries)
      for (const send of pendingNotifications) {
        send().catch(() => {});
      }

      // Get lampiran with signed URLs
      const lampiranResponses = await this.getLampiranFilesWithUrls(naskahId);

      // Build response
      return {
        success: true,
        message: 'Kajian berhasil dikirim',
        data: {
          id: naskahId,
          jenis: 'KA',
          nomor: generatedNomor.nomor,
          tanggal: tanggal,
          status: status,
          perihal: dto.perihal,
          pengirim: this.toSirkulasiInfo(pengirim),
          penerima: penerimaResponses,
          tembusan: tembusanResponses,
          final_pdf: finalPdfPath || null,
          final_pdf_url: finalPdfPath
            ? await this.storageService.getFileUrl(finalPdfPath)
            : null,
          lampiran_files: lampiranResponses,
          // Additional fields untuk digsig
          sign_option: dto.sign_option,
          bsre_name_doc: bsreNameDoc,
          tte_redirect: portalRedirect,
        } as any,
      };
    } catch (error) {
      if (queryRunner.isTransactionActive) {
        await queryRunner.rollbackTransaction();
      }
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
  async saveDraft(dto: CreateKajianDto): Promise<SendMessageResponseDto> {
    assertDateNotInFuture(dto.tgl, 'Tanggal naskah');

    // Declare variables outside try block for access after transaction
    let naskahId: string = '';
    let tanggalStr: string = '';
    let pengirimData: PositionData | undefined;
    const penerimaResponses: SirkulasiInfoDto[] = [];
    const tembusanResponses: SirkulasiInfoDto[] = [];

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const barisData = await this.getPositionData();

      // Validate pengirim (using new DTO field: pengirim)
      pengirimData = this.findByPosition(barisData, dto.pengirim);
      if (!pengirimData) {
        throw new NotFoundException(
          `Pengirim dengan position_id ${dto.pengirim} tidak ditemukan`,
        );
      }

      // Validate penerima (using new DTO field: penerima)
      const penerimaDataList: PositionData[] = [];
      for (const penerimaPositionId of dto.penerima) {
        const penerimaDataItem = this.findByPosition(
          barisData,
          penerimaPositionId,
        );
        if (!penerimaDataItem) {
          throw new NotFoundException(
            `Penerima dengan position_id ${penerimaPositionId} tidak ditemukan`,
          );
        }
        penerimaDataList.push(penerimaDataItem);
      }

      this.validateKajianRouting(
        barisData,
        dto.pengirim,
        dto.penerima,
      );

      // Determine tanggal
      tanggalStr = dto.tgl || new Date().toISOString().split('T')[0];
      const tanggalKajian = new Date(tanggalStr);

      // Insert naskah with status 'draf'
      naskahId = uuidv4();

      const naskah = new NaskahEntity();
      naskah.id = naskahId;
      naskah.jenis = 'KA';
      naskah.klasifikasi = dto.klasifikasi || '';
      naskah.klasifikasi_text = dto.klasifikasi_text || '';
      naskah.sifat = dto.sifat;
      naskah.nomor = ''; // No nomor for draft
      naskah.tanggal = tanggalKajian;
      naskah.perihal = dto.perihal;
      naskah.konten = dto.konten || '';
      naskah.status = 'draf';
      naskah.lampiran = dto.lampiran || '';
      if (dto.final_pdf) naskah.final_pdf = dto.final_pdf;
      naskah.english = dto.english || false;

      await queryRunner.manager.save(naskah);

      // Insert sirkulasi - pengirim (isDraft = true)
      const _pf = this.pengirimSirkulasiFields(dto, pengirimData);
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
        positionText: _pf.positionText,
        positionStatus: _pf.positionStatus.toLowerCase() as any,
        idSirkuler: pengirimData.persnum_person
          ? String(pengirimData.persnum_person)
          : '',
        namaSirkuler: _pf.namaSirkuler,
        isDraft: true,
        tanggal: naskah.tanggal, // Kunci partisi — dari naskah induk
      });
      await queryRunner.manager.save(pengirimSirkulasi);

      // Insert sirkulasi - penerima (isDraft = true)
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
          positionText: delegatedRecipientFields(penerima).positionText,
          positionStatus: delegatedRecipientFields(penerima)
            .positionStatus as any,
          idSirkuler: penerima.persnum_person
            ? String(penerima.persnum_person)
            : '',
          namaSirkuler: penerima.persnum_person_text || '',
          isDraft: true,
          tanggal: naskah.tanggal, // Kunci partisi — dari naskah induk
        });
        await queryRunner.manager.save(penerimaSirkulasi);
        penerimaResponses.push(this.toSirkulasiInfo(penerima));
      }

      // Insert tembusan if provided
      if (dto.tembusan && dto.tembusan.length > 0) {
        for (const tembusanPosId of dto.tembusan) {
          const tembusanData = this.findByPosition(barisData, tembusanPosId);
          if (tembusanData) {
            const tembusanSirkulasi = this.naskahSirkulasiRepository.create({
              id: uuidv4(),
              idNaskah: naskahId,
              sirkuler: 'tembusan',
              company: String(tembusanData.company || COMPANY_ID),
              companyText: tembusanData.company_name || 'PERUM LPPNPI',
              area: tembusanData.area || '',
              areaText: tembusanData.area_text || '',
              subArea: tembusanData.sub_area
                ? String(tembusanData.sub_area)
                : '',
              subAreaText: tembusanData.sub_area_text || '',
              organization: String(tembusanData.organization_id),
              organizationText: tembusanData.organization_text,
              position: String(tembusanData.position),
              positionText: delegatedRecipientFields(tembusanData).positionText,
              positionStatus: delegatedRecipientFields(tembusanData)
                .positionStatus as any,
              idSirkuler: tembusanData.persnum_person
                ? String(tembusanData.persnum_person)
                : '',
              namaSirkuler: tembusanData.persnum_person_text || '',
              isDraft: true,
              tanggal: naskah.tanggal, // Kunci partisi — dari naskah induk
            });
            await queryRunner.manager.save(tembusanSirkulasi);
            tembusanResponses.push(this.toSirkulasiInfo(tembusanData));
          }
        }
      }

      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }

    // Move lampiran from temp to final location (after transaction complete)
    if (dto.lampiran_temp_ids && dto.lampiran_temp_ids.length > 0) {
      await this.moveTemporaryLampiranToFinal(
        dto.lampiran_temp_ids,
        naskahId,
        'kajian/lampiran',
      );
    }

    // Get lampiran with signed URLs
    const lampiranResponses = await this.getLampiranFilesWithUrls(naskahId);

    // Generate final_pdf_url if final_pdf exists
    const finalPdfUrl = dto.final_pdf
      ? await this.storageService.getFileUrl(dto.final_pdf)
      : null;

    return {
      success: true,
      message: 'Kajian berhasil disimpan sebagai draft',
      data: {
        id: naskahId,
        jenis: 'KA',
        nomor: '',
        tanggal: tanggalStr,
        status: 'draf',
        perihal: dto.perihal,
        pengirim: this.toSirkulasiInfo(pengirimData),
        penerima: penerimaResponses,
        tembusan: tembusanResponses,
        final_pdf: dto.final_pdf || null,
        final_pdf_url: finalPdfUrl,
        lampiran_files: lampiranResponses,
      },
    };
  }

  // ============================================================
  // GET SEND MESSAGE - Daftar Kajian yang sudah dikirimkan
  // ============================================================

  /**
   * Get Send Message - Mendapatkan semua kajian yang sudah dikirimkan oleh user
   */
  async getSendMessage(positionId: number): Promise<GetSendMessageResponseDto> {
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
        data: [],
        total: 0,
        positionId: positionId,
        positionText: senderData.position_text,
        nama: senderData.persnum_person_text || '',
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
        data: [],
        total: 0,
        positionId: positionId,
        positionText: senderData.position_text,
        nama: senderData.persnum_person_text || '',
      };
    }

    const result: SendMessageItemDto[] = [];

    for (const naskah of naskahList) {
      const pengirimInfo = pengirimSirkulasi.find(
        (s) => s.idNaskah === naskah.id,
      );

      // Get penerima list with read status
      const penerimaList = await this.naskahSirkulasiRepository.find({
        where: {
          idNaskah: naskah.id,
          sirkuler: 'penerima',
        },
      });

      // Get tembusan list
      const tembusanList = await this.naskahSirkulasiRepository.find({
        where: {
          idNaskah: naskah.id,
          sirkuler: 'tembusan',
        },
      });

      // Get lampiran files
      const lampiranFiles = await this.naskahLampiranRepository.find({
        where: { id_naskah: naskah.id },
      });

      const pengirim = {
        persnum: pengirimInfo?.idSirkuler
          ? parseInt(pengirimInfo.idSirkuler)
          : 0,
        nama: pengirimInfo?.namaSirkuler || '',
        positionText: pengirimInfo?.positionText || '',
        organizationText: pengirimInfo?.organizationText || '',
      };

      const penerima: PenerimaInfoDto[] = penerimaList.map((p) => ({
        persnum: p.idSirkuler ? parseInt(p.idSirkuler) : 0,
        nama: p.namaSirkuler || '',
        organizationText: p.organizationText || '',
        positionText: p.positionText || '',
        status: p.sendReadTime ? 'dibaca' : 'belum_dibaca',
        readTime: p.sendReadTime ? p.sendReadTime.toISOString() : null,
      }));

      const tembusan: TembusanInfoDto[] = tembusanList.map((t) => ({
        persnum: t.idSirkuler ? parseInt(t.idSirkuler) : 0,
        nama: t.namaSirkuler || '',
        organizationText: t.organizationText || '',
        positionText: t.positionText || '',
      }));

      const lampiran_files: LampiranInfoDto[] = await Promise.all(
        lampiranFiles.map(async (l) => ({
          id: l.id,
          fileName: l.file_name || '',
          filePath: l.file_pdf || '',
          fileUrl: l.file_pdf
            ? await this.storageService.getFileUrl(l.file_pdf)
            : null,
        })),
      );

      // Generate final_pdf_url if final_pdf exists
      const finalPdfUrl = naskah.final_pdf
        ? await this.storageService.getFileUrl(naskah.final_pdf)
        : null;

      result.push({
        id: naskah.id,
        jenis: naskah.jenis,
        nomor: naskah.nomor || '',
        tanggal:
          naskah.tanggal instanceof Date
            ? naskah.tanggal.toISOString().split('T')[0]
            : String(naskah.tanggal),
        status: naskah.status as 'draf' | 'final' | 'final_tte',
        kop_logo: null,
        kop_nama: null,
        alamat_perusahaan: null,
        klasifikasi: naskah.klasifikasi,
        klasifikasi_text: naskah.klasifikasi_text,
        sifat: naskah.sifat,
        perihal: naskah.perihal,
        english: false,
        konten: naskah.konten,
        nama_tempat: null,
        nama_jabatan: null,
        tanda_tangan: null,
        nama_lengkap: null,
        pengirim,
        penerima,
        tembusan,
        lampiran: naskah.lampiran,
        lampiran_files,
        final_pdf: naskah.final_pdf || null,
        final_pdf_url: finalPdfUrl,
        jumlahPenerima: penerima.length,
        jumlahDibaca: penerima.filter((p) => p.status === 'dibaca').length,
      });
    }

    return {
      success: true,
      data: result,
      total: result.length,
      positionId: positionId,
      positionText: senderData.position_text,
      nama: senderData.persnum_person_text || '',
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
    dto: UpdateDraftDto,
  ): Promise<SendMessageResponseDto> {
    // Validate naskah exists and is draft
    const naskah = await this.naskahRepository.findOne({
      where: { id: naskahId },
    });

    if (!naskah) {
      throw new NotFoundException(
        `Naskah dengan ID ${naskahId} tidak ditemukan`,
      );
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

    assertDateNotInFuture(dto.tgl, 'Tanggal naskah');

    // Validate ownership
    const pengirimSirkulasi = await this.naskahSirkulasiRepository.findOne({
      where: {
        idNaskah: naskahId,
        sirkuler: 'pengirim',
      },
    });

    if (!pengirimSirkulasi) {
      throw new NotFoundException(
        `Data pengirim tidak ditemukan untuk naskah ${naskahId}`,
      );
    }

    // If pengirim provided in dto, validate ownership
    if (
      dto.pengirim &&
      String(pengirimSirkulasi.position) !== String(dto.pengirim)
    ) {
      throw new ForbiddenException(
        `Anda tidak memiliki akses untuk mengupdate naskah ini. Hanya pengirim asli yang bisa mengupdate.`,
      );
    }

    const naskahPartitionKey = {
      id: naskah.id,
      tanggal: naskah.tanggal,
    };

    const barisData = await this.getPositionData();
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Get pengirim data
      const pengirimPosId =
        dto.pengirim || parseInt(pengirimSirkulasi.position || '0');
      const pengirimData = this.findByPosition(barisData, pengirimPosId);
      if (!pengirimData) {
        throw new NotFoundException(
          `Pengirim dengan position_id ${pengirimPosId} tidak ditemukan`,
        );
      }

      const storedRecipientIds = (
        await this.naskahSirkulasiRepository.find({
          where: { idNaskah: naskahId, sirkuler: 'penerima' },
        })
      ).map((item) => Number(item.position));
      this.validateKajianRouting(
        barisData,
        pengirimPosId,
        dto.penerima ?? storedRecipientIds,
      );

      // Update naskah fields
      if (dto.tgl !== undefined) naskah.tanggal = new Date(dto.tgl);
      if (dto.sifat !== undefined) naskah.sifat = dto.sifat;
      if (dto.perihal !== undefined) naskah.perihal = dto.perihal;
      if (dto.konten !== undefined) naskah.konten = dto.konten;
      if (dto.klasifikasi !== undefined) naskah.klasifikasi = dto.klasifikasi;
      if (dto.klasifikasi_text !== undefined)
        naskah.klasifikasi_text = dto.klasifikasi_text;
      if (dto.lampiran !== undefined) naskah.lampiran = dto.lampiran;

      await updatePartitionedNaskah(
        queryRunner.manager,
        NaskahEntity,
        naskahPartitionKey,
        {
          tanggal: naskah.tanggal,
          sifat: naskah.sifat,
          perihal: naskah.perihal,
          konten: naskah.konten,
          klasifikasi: naskah.klasifikasi,
          klasifikasi_text: naskah.klasifikasi_text,
          lampiran: naskah.lampiran,
        },
      );

      // Update penerima if provided
      if (dto.penerima !== undefined) {
        this.validateKajianRouting(
          barisData,
          pengirimPosId,
          dto.penerima,
        );

        // Delete old penerima
        await queryRunner.manager.delete(NaskahSirkulasi, {
          idNaskah: naskahId,
          sirkuler: 'penerima',
        });

        // Insert new penerima
        for (const penerimaId of dto.penerima) {
          const penerimaData = this.findByPosition(barisData, penerimaId);
          if (!penerimaData) continue;

          const penerimaSirkulasi = this.naskahSirkulasiRepository.create({
            id: uuidv4(),
            idNaskah: naskahId,
            sirkuler: 'penerima',
            company: String(penerimaData.company || COMPANY_ID),
            companyText: penerimaData.company_name || 'PERUM LPPNPI',
            area: penerimaData.area || '',
            areaText: penerimaData.area_text || '',
            subArea: penerimaData.sub_area ? String(penerimaData.sub_area) : '',
            subAreaText: penerimaData.sub_area_text || '',
            organization: String(penerimaData.organization_id),
            organizationText: penerimaData.organization_text,
            position: String(penerimaData.position),
            positionText: delegatedRecipientFields(penerimaData).positionText,
            positionStatus: delegatedRecipientFields(penerimaData)
              .positionStatus as any,
            idSirkuler: penerimaData.persnum_person
              ? String(penerimaData.persnum_person)
              : '',
            namaSirkuler: penerimaData.persnum_person_text || '',
            isDraft: true,
            tanggal: naskah.tanggal, // Kunci partisi — dari naskah induk
          });
          await queryRunner.manager.save(penerimaSirkulasi);
        }
      }

      // Update tembusan if provided
      if (dto.tembusan) {
        await queryRunner.manager.delete(NaskahSirkulasi, {
          idNaskah: naskahId,
          sirkuler: 'tembusan',
        });

        for (const tembusanId of dto.tembusan) {
          const tembusanData = this.findByPosition(barisData, tembusanId);
          if (!tembusanData) continue;

          const tembusanSirkulasi = this.naskahSirkulasiRepository.create({
            id: uuidv4(),
            idNaskah: naskahId,
            sirkuler: 'tembusan',
            company: String(tembusanData.company || COMPANY_ID),
            companyText: tembusanData.company_name || 'PERUM LPPNPI',
            area: tembusanData.area || '',
            areaText: tembusanData.area_text || '',
            subArea: tembusanData.sub_area ? String(tembusanData.sub_area) : '',
            subAreaText: tembusanData.sub_area_text || '',
            organization: String(tembusanData.organization_id),
            organizationText: tembusanData.organization_text,
            position: String(tembusanData.position),
            positionText: delegatedRecipientFields(tembusanData).positionText,
            positionStatus: delegatedRecipientFields(tembusanData)
              .positionStatus as any,
            idSirkuler: tembusanData.persnum_person
              ? String(tembusanData.persnum_person)
              : '',
            namaSirkuler: tembusanData.persnum_person_text || '',
            isDraft: true,
            tanggal: naskah.tanggal, // Kunci partisi — dari naskah induk
          });
          await queryRunner.manager.save(tembusanSirkulasi);
        }
      }

      // Update lampiran from temp files if provided
      if (dto.lampiran_temp_ids !== undefined) {
        const retainedIds = dto.lampiran_temp_ids.filter(Boolean);
        await queryRunner.manager.delete(NaskahLampiranEntity, {
          id_naskah: naskahId,
          ...(retainedIds.length > 0 ? { id: Not(In(retainedIds)) } : {}),
        });
      }

      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }

    // Move lampiran from temp to final location (after transaction complete)
    if (dto.lampiran_temp_ids && dto.lampiran_temp_ids.length > 0) {
      await this.moveTemporaryLampiranToFinal(
        dto.lampiran_temp_ids,
        naskahId,
        'kajian/lampiran',
      );
    }

    // Fetch updated data for response
    const updatedNaskah = await this.naskahRepository.findOne({
      where: { id: naskahId },
    });

    const updatedSirkulasi = await this.naskahSirkulasiRepository.find({
      where: { idNaskah: naskahId },
    });

    const updatedLampiran = await this.naskahLampiranRepository.find({
      where: { id_naskah: naskahId },
    });

    const pengirimSirk = updatedSirkulasi.find(
      (s) => s.sirkuler === 'pengirim',
    );
    const penerimaSirk = updatedSirkulasi.filter(
      (s) => s.sirkuler === 'penerima',
    );
    const tembusanSirk = updatedSirkulasi.filter(
      (s) => s.sirkuler === 'tembusan',
    );

    const sirkulasiToResponse = (s: NaskahSirkulasi): SirkulasiInfoDto => ({
      position: parseInt(s.position || '0', 10),
      position_text: s.positionText || '',
      persnum: s.idSirkuler ? parseInt(s.idSirkuler, 10) : null,
      nama: s.namaSirkuler || null,
      organization_id: parseInt(s.organization || '0', 10),
      organization_text: s.organizationText || '',
      sub_area: s.subArea ? parseInt(s.subArea, 10) : null,
      sub_area_text: s.subAreaText || null,
      area: s.area || null,
      area_text: s.areaText || null,
    });

    const defaultPengirim: SirkulasiInfoDto = {
      position: 0,
      position_text: '',
      persnum: null,
      nama: null,
      organization_id: 0,
      organization_text: '',
      sub_area: null,
      sub_area_text: null,
      area: null,
      area_text: null,
    };

    const tanggalStr = updatedNaskah?.tanggal
      ? updatedNaskah.tanggal instanceof Date
        ? updatedNaskah.tanggal.toISOString().split('T')[0]
        : String(updatedNaskah.tanggal).split('T')[0]
      : '';

    // Get lampiran with signed URLs
    const lampiranResponses = await this.getLampiranFilesWithUrls(naskahId);

    // Generate final_pdf_url if final_pdf exists
    const finalPdfUrl = updatedNaskah?.final_pdf
      ? await this.storageService.getFileUrl(updatedNaskah.final_pdf)
      : null;

    return {
      success: true,
      message: 'Draft kajian berhasil diupdate',
      data: {
        id: naskahId,
        jenis: updatedNaskah?.jenis || 'KA',
        nomor: updatedNaskah?.nomor || '',
        tanggal: tanggalStr,
        status: updatedNaskah?.status || 'draf',
        perihal: updatedNaskah?.perihal || '',
        pengirim: pengirimSirk
          ? sirkulasiToResponse(pengirimSirk)
          : defaultPengirim,
        penerima: penerimaSirk.map(sirkulasiToResponse),
        tembusan: tembusanSirk.map(sirkulasiToResponse),
        final_pdf: updatedNaskah?.final_pdf || null,
        final_pdf_url: finalPdfUrl,
        lampiran_files: lampiranResponses,
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
    dto: FinalizeDraftDto,
  ): Promise<SendMessageResponseDto> {
    // Validate naskah exists and is draft
    const naskah = await this.naskahRepository.findOne({
      where: { id: naskahId },
    });

    if (!naskah) {
      throw new NotFoundException(
        `Naskah dengan ID ${naskahId} tidak ditemukan`,
      );
    }

    if (naskah.status !== 'draf') {
      throw new ForbiddenException(
        `Naskah tidak bisa dikirim karena status sudah '${naskah.status}'`,
      );
    }

    const naskahPartitionKey = {
      id: naskah.id,
      tanggal: naskah.tanggal,
    };

    const barisData = await this.getPositionData();
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Get pengirim from sirkulasi
      const pengirimSirkulasi = await this.naskahSirkulasiRepository.findOne({
        where: { idNaskah: naskahId, sirkuler: 'pengirim' },
      });

      if (!pengirimSirkulasi) {
        throw new NotFoundException(`Data pengirim tidak ditemukan`);
      }

      const pengirimPosId =
        dto.pengirim || parseInt(pengirimSirkulasi.position || '0');
      const pengirimData = this.findByPosition(barisData, pengirimPosId);
      if (!pengirimData) {
        throw new NotFoundException(
          `Pengirim dengan position_id ${pengirimPosId} tidak ditemukan`,
        );
      }

      const storedRecipientIds = (
        await this.naskahSirkulasiRepository.find({
          where: { idNaskah: naskahId, sirkuler: 'penerima' },
        })
      ).map((item) => Number(item.position));
      this.validateKajianRouting(
        barisData,
        pengirimPosId,
        dto.penerima ?? storedRecipientIds,
      );

      // Update fields if provided
      if (dto.tgl) naskah.tanggal = new Date(dto.tgl);
      if (dto.sifat) naskah.sifat = dto.sifat;
      if (dto.perihal) naskah.perihal = dto.perihal;
      if (dto.konten !== undefined) naskah.konten = dto.konten;
      if (dto.klasifikasi !== undefined) naskah.klasifikasi = dto.klasifikasi;
      if (dto.klasifikasi_text !== undefined)
        naskah.klasifikasi_text = dto.klasifikasi_text;
      if (dto.lampiran !== undefined) naskah.lampiran = dto.lampiran;

      // Auto-generate nomor if empty
      if ((!naskah.nomor || naskah.nomor === '') && pengirimData) {
        // Ensure tanggal is a Date object for nomor generation
        const tanggalDate =
          naskah.tanggal instanceof Date
            ? naskah.tanggal
            : naskah.tanggal
              ? new Date(naskah.tanggal)
              : new Date();

        const generatedNomor = await this.nomorSuratService.generateNomor({
          jenis: 'KA',
          positionText: pengirimData.position_text,
          positionAbbreviation: pengirimData.position_abbreviation || undefined,
          areaText: pengirimData.area_text || '',
          tanggal: tanggalDate,
        });
        naskah.nomor = generatedNomor.nomor;
      }

      // Change status to final
      naskah.status = 'final';
      await updatePartitionedNaskah(
        queryRunner.manager,
        NaskahEntity,
        naskahPartitionKey,
        {
          tanggal: naskah.tanggal,
          sifat: naskah.sifat,
          perihal: naskah.perihal,
          konten: naskah.konten,
          klasifikasi: naskah.klasifikasi,
          klasifikasi_text: naskah.klasifikasi_text,
          lampiran: naskah.lampiran,
          nomor: naskah.nomor,
          status: naskah.status,
        },
      );

      // Update penerima if provided
      if (dto.penerima && dto.penerima.length > 0) {
        this.validateKajianRouting(
          barisData,
          pengirimPosId,
          dto.penerima,
        );

        await queryRunner.manager.delete(NaskahSirkulasi, {
          idNaskah: naskahId,
          sirkuler: 'penerima',
        });

        for (const penerimaId of dto.penerima) {
          const penerimaData = this.findByPosition(barisData, penerimaId);
          if (!penerimaData) continue;

          const penerimaSirkulasi = this.naskahSirkulasiRepository.create({
            id: uuidv4(),
            idNaskah: naskahId,
            sirkuler: 'penerima',
            company: String(penerimaData.company || COMPANY_ID),
            companyText: penerimaData.company_name || 'PERUM LPPNPI',
            area: penerimaData.area || '',
            areaText: penerimaData.area_text || '',
            subArea: penerimaData.sub_area ? String(penerimaData.sub_area) : '',
            subAreaText: penerimaData.sub_area_text || '',
            organization: String(penerimaData.organization_id),
            organizationText: penerimaData.organization_text,
            position: String(penerimaData.position),
            positionText: delegatedRecipientFields(penerimaData).positionText,
            positionStatus: delegatedRecipientFields(penerimaData)
              .positionStatus as any,
            idSirkuler: penerimaData.persnum_person
              ? String(penerimaData.persnum_person)
              : '',
            namaSirkuler: penerimaData.persnum_person_text || '',
            isDraft: false,
            tanggal: naskah.tanggal, // Kunci partisi — dari naskah induk
          });
          await queryRunner.manager.save(penerimaSirkulasi);
        }
      } else {
        // Mark existing penerima as not draft
        await queryRunner.manager.update(
          NaskahSirkulasi,
          { idNaskah: naskahId, sirkuler: 'penerima' },
          { isDraft: false },
        );
      }

      // Mark pengirim as not draft
      await queryRunner.manager.update(
        NaskahSirkulasi,
        { idNaskah: naskahId, sirkuler: 'pengirim' },
        { isDraft: false },
      );

      // Update tembusan isDraft
      await queryRunner.manager.update(
        NaskahSirkulasi,
        { idNaskah: naskahId, sirkuler: 'tembusan' },
        { isDraft: false },
      );

      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }

    // Fetch updated data for response
    const updatedNaskah = await this.naskahRepository.findOne({
      where: { id: naskahId },
    });

    const updatedSirkulasi = await this.naskahSirkulasiRepository.find({
      where: { idNaskah: naskahId },
    });

    const updatedLampiran = await this.naskahLampiranRepository.find({
      where: { id_naskah: naskahId },
    });

    const pengirimSirk = updatedSirkulasi.find(
      (s) => s.sirkuler === 'pengirim',
    );
    const penerimaSirk = updatedSirkulasi.filter(
      (s) => s.sirkuler === 'penerima',
    );
    const tembusanSirk = updatedSirkulasi.filter(
      (s) => s.sirkuler === 'tembusan',
    );

    const sirkulasiToResponse = (s: NaskahSirkulasi): SirkulasiInfoDto => ({
      position: parseInt(s.position || '0', 10),
      position_text: s.positionText || '',
      persnum: s.idSirkuler ? parseInt(s.idSirkuler, 10) : null,
      nama: s.namaSirkuler || null,
      organization_id: parseInt(s.organization || '0', 10),
      organization_text: s.organizationText || '',
      sub_area: s.subArea ? parseInt(s.subArea, 10) : null,
      sub_area_text: s.subAreaText || null,
      area: s.area || null,
      area_text: s.areaText || null,
    });

    const defaultPengirim: SirkulasiInfoDto = {
      position: 0,
      position_text: '',
      persnum: null,
      nama: null,
      organization_id: 0,
      organization_text: '',
      sub_area: null,
      sub_area_text: null,
      area: null,
      area_text: null,
    };

    const tanggalStr = updatedNaskah?.tanggal
      ? updatedNaskah.tanggal instanceof Date
        ? updatedNaskah.tanggal.toISOString().split('T')[0]
        : String(updatedNaskah.tanggal).split('T')[0]
      : '';

    // Get lampiran with signed URLs
    const lampiranResponses = await this.getLampiranFilesWithUrls(naskahId);

    // Generate final_pdf_url if final_pdf exists
    const finalPdfUrl = updatedNaskah?.final_pdf
      ? await this.storageService.getFileUrl(updatedNaskah.final_pdf)
      : null;

    return {
      success: true,
      message: 'Draft kajian berhasil dikirim',
      data: {
        id: naskahId,
        jenis: updatedNaskah?.jenis || 'KA',
        nomor: updatedNaskah?.nomor || '',
        tanggal: tanggalStr,
        status: 'final',
        perihal: updatedNaskah?.perihal || '',
        pengirim: pengirimSirk
          ? sirkulasiToResponse(pengirimSirk)
          : defaultPengirim,
        penerima: penerimaSirk.map(sirkulasiToResponse),
        tembusan: tembusanSirk.map(sirkulasiToResponse),
        final_pdf: updatedNaskah?.final_pdf || null,
        final_pdf_url: finalPdfUrl,
        lampiran_files: lampiranResponses,
      },
    };
  }

  // ============================================================
  // NEW METHODS (Matching Nota Dinas Structure)
  // ============================================================

  /**
   * Get dynamic header info dari sub_area_alamat
   */
  async getHeaderInfoByUser(
    user: { company?: string | number; area?: string; subArea?: string },
    tanggal?: string,
  ): Promise<{
    kantor: string;
    gedung: string;
    alamat: string;
    kota: string;
  } | null> {
    try {
      const company = String(user.company || COMPANY_ID);
      const area = user.area || '';
      const subArea = user.subArea || '';
      const tgl = tanggal ? new Date(tanggal) : new Date();

      const alamatInfo =
        await this.subAreaAlamatService.findAlamatByUserContext(
          company,
          area,
          subArea,
          tgl,
        );

      return alamatInfo;
    } catch (error) {
      console.error('[KajianService] Error getting header info:', error);
      return null;
    }
  }

  /**
   * Get person name by position ID from org_data
   */
  async getPersonNameByPosition(
    positionId: number | string,
    tgl?: string,
  ): Promise<string> {
    try {
      const barisData = await this.getPositionData(tgl);
      const posData = this.findByPosition(barisData, Number(positionId));
      return posData?.persnum_person_text || '';
    } catch {
      return '';
    }
  }

  /**
   * Convert position IDs to position names
   */
  async convertPositionIdsToNames(
    positionIds: (string | number)[],
    tanggal?: string,
  ): Promise<string[]> {
    try {
      const barisData = await this.getPositionData(tanggal);
      const names: string[] = [];

      for (const posId of positionIds) {
        const posData = this.findByPosition(barisData, Number(posId));
        if (posData) {
          names.push(
            delegatedRecipientFields(posData).positionText || String(posId),
          );
        } else {
          names.push(String(posId));
        }
      }

      return names;
    } catch {
      return positionIds.map(String);
    }
  }

  /**
   * Parse form-data body to CreateKajianDto
   */
  async parseFormDataToDto(
    body: any,
    files?: {
      lampiran_files?: Express.Multer.File[];
      final_pdf?: Express.Multer.File[];
    },
  ): Promise<CreateKajianDto> {
    // Upload final_pdf file jika ada
    let finalPdfPath: string | undefined;
    if (files?.final_pdf && files.final_pdf.length > 0) {
      const uploadResult = await this.storageService.uploadFile(
        files.final_pdf[0],
        'kajian/final',
      );
      finalPdfPath = uploadResult.key;
    }

    const parseArray = (value: any): number[] => {
      if (!value) return [];
      if (Array.isArray(value)) return value.map(Number);
      if (typeof value === 'string') {
        try {
          const parsed = JSON.parse(value);
          return Array.isArray(parsed) ? parsed.map(Number) : [Number(parsed)];
        } catch {
          return value.split(',').map((v: string) => Number(v.trim()));
        }
      }
      return [Number(value)];
    };

    const parseStringArray = (value: any): string[] => {
      if (!value) return [];
      if (Array.isArray(value)) return value;
      if (typeof value === 'string') {
        // Handle format {uuid} atau {"uuid"} - strip curly braces
        let cleanValue = value.trim();
        if (
          cleanValue.startsWith('{') &&
          cleanValue.endsWith('}') &&
          !cleanValue.startsWith('{"') &&
          !cleanValue.includes(':')
        ) {
          // Format: {uuid} atau {"uuid"} - extract UUID
          cleanValue = cleanValue.slice(1, -1).replace(/"/g, '').trim();
          return [cleanValue];
        }
        try {
          const parsed = JSON.parse(cleanValue);
          return Array.isArray(parsed) ? parsed : [parsed];
        } catch {
          // Try parsing as {"uuid"} format
          if (cleanValue.startsWith('{"') && cleanValue.endsWith('"}')) {
            const extracted = cleanValue.slice(2, -2);
            return [extracted];
          }
          return cleanValue.split(',').map((v: string) => v.trim());
        }
      }
      return [String(value)];
    };

    const dto: CreateKajianDto = {
      pengirim: Number(body.pengirim),
      penerima: parseArray(body.penerima),
      tembusan: parseArray(body.tembusan),
      kop_logo: body.kop_logo || undefined,
      kop_nama: body.kop_nama || undefined,
      alamat_perusahaan: body.alamat_perusahaan || undefined,
      klasifikasi: body.klasifikasi || '',
      klasifikasi_text: body.klasifikasi_text || undefined,
      sifat: body.sifat || 'biasa',
      perihal: body.perihal || '',
      konten: body.konten || '',
      english: body.english === 'true' || body.english === true,
      nama_tempat: body.nama_tempat || undefined,
      nama_jabatan: body.nama_jabatan || undefined,
      tanda_tangan: body.tanda_tangan || undefined,
      nama_lengkap: body.nama_lengkap || undefined,
      lampiran: body.lampiran || undefined,
      lampiran_temp_ids: parseStringArray(body.lampiran_temp_ids),
      final_pdf: finalPdfPath || body.final_pdf || undefined,
      tgl: body.tgl || undefined,
      // Digital signature options
      sign_option: (body.sign_option as SignOption) || undefined,
      passphrase: body.passphrase || undefined,
    };

    console.log('[KA parseFormDataToDto] sign_option:', dto.sign_option);
    console.log(
      '[KA parseFormDataToDto] passphrase:',
      dto.passphrase ? '****' : 'empty',
    );

    return dto;
  }

  /**
   * Parse form-data body to UpdateDraftDto
   */
  async parseFormDataToUpdateDraftDto(
    body: any,
    files?: { lampiran_files?: Express.Multer.File[] },
  ): Promise<UpdateDraftDto> {
    const parseArray = (value: any): number[] | undefined => {
      if (!value) return undefined;
      if (Array.isArray(value)) return value.map(Number);
      if (typeof value === 'string') {
        try {
          const parsed = JSON.parse(value);
          return Array.isArray(parsed) ? parsed.map(Number) : [Number(parsed)];
        } catch {
          return value.split(',').map((v: string) => Number(v.trim()));
        }
      }
      return [Number(value)];
    };

    const parseStringArray = (value: any): string[] | undefined => {
      if (!value) return undefined;
      if (Array.isArray(value)) return value;
      if (typeof value === 'string') {
        // Handle format {uuid} atau {"uuid"} - strip curly braces
        let cleanValue = value.trim();
        if (
          cleanValue.startsWith('{') &&
          cleanValue.endsWith('}') &&
          !cleanValue.startsWith('{"') &&
          !cleanValue.includes(':')
        ) {
          // Format: {uuid} atau {"uuid"} - extract UUID
          cleanValue = cleanValue.slice(1, -1).replace(/"/g, '').trim();
          return [cleanValue];
        }
        try {
          const parsed = JSON.parse(cleanValue);
          return Array.isArray(parsed) ? parsed : [parsed];
        } catch {
          // Try parsing as {"uuid"} format
          if (cleanValue.startsWith('{"') && cleanValue.endsWith('"}')) {
            const extracted = cleanValue.slice(2, -2);
            return [extracted];
          }
          return cleanValue.split(',').map((v: string) => v.trim());
        }
      }
      return [String(value)];
    };

    const dto: UpdateDraftDto = {};

    if (body.pengirim !== undefined) dto.pengirim = Number(body.pengirim);
    if (body.penerima !== undefined) dto.penerima = parseArray(body.penerima);
    if (body.tembusan !== undefined) dto.tembusan = parseArray(body.tembusan);
    if (body.kop_logo !== undefined) dto.kop_logo = body.kop_logo;
    if (body.kop_nama !== undefined) dto.kop_nama = body.kop_nama;
    if (body.alamat_perusahaan !== undefined)
      dto.alamat_perusahaan = body.alamat_perusahaan;
    if (body.klasifikasi !== undefined) dto.klasifikasi = body.klasifikasi;
    if (body.klasifikasi_text !== undefined)
      dto.klasifikasi_text = body.klasifikasi_text;
    if (body.sifat !== undefined) dto.sifat = body.sifat;
    if (body.perihal !== undefined) dto.perihal = body.perihal;
    if (body.konten !== undefined) dto.konten = body.konten;
    if (body.english !== undefined)
      dto.english = body.english === 'true' || body.english === true;
    if (body.nama_tempat !== undefined) dto.nama_tempat = body.nama_tempat;
    if (body.nama_jabatan !== undefined) dto.nama_jabatan = body.nama_jabatan;
    if (body.tanda_tangan !== undefined) dto.tanda_tangan = body.tanda_tangan;
    if (body.nama_lengkap !== undefined) dto.nama_lengkap = body.nama_lengkap;
    if (body.lampiran !== undefined) dto.lampiran = body.lampiran;
    if (body.lampiran_temp_ids !== undefined)
      dto.lampiran_temp_ids = parseStringArray(body.lampiran_temp_ids);
    if (body.tgl !== undefined) dto.tgl = body.tgl;

    return dto;
  }

  /**
   * Parse form-data body to FinalizeDraftDto
   */
  async parseFormDataToFinalizeDraftDto(
    body: any,
    files?: {
      lampiran_files?: Express.Multer.File[];
      final_pdf?: Express.Multer.File[];
    },
  ): Promise<FinalizeDraftDto> {
    const parseArray = (value: any): number[] | undefined => {
      if (!value) return undefined;
      if (Array.isArray(value)) return value.map(Number);
      if (typeof value === 'string') {
        try {
          const parsed = JSON.parse(value);
          return Array.isArray(parsed) ? parsed.map(Number) : [Number(parsed)];
        } catch {
          return value.split(',').map((v: string) => Number(v.trim()));
        }
      }
      return [Number(value)];
    };

    const parseStringArray = (value: any): string[] | undefined => {
      if (!value) return undefined;
      if (Array.isArray(value)) return value;
      if (typeof value === 'string') {
        // Handle format {uuid} atau {"uuid"} - strip curly braces
        let cleanValue = value.trim();
        if (
          cleanValue.startsWith('{') &&
          cleanValue.endsWith('}') &&
          !cleanValue.startsWith('{"') &&
          !cleanValue.includes(':')
        ) {
          // Format: {uuid} atau {"uuid"} - extract UUID
          cleanValue = cleanValue.slice(1, -1).replace(/"/g, '').trim();
          return [cleanValue];
        }
        try {
          const parsed = JSON.parse(cleanValue);
          return Array.isArray(parsed) ? parsed : [parsed];
        } catch {
          // Try parsing as {"uuid"} format
          if (cleanValue.startsWith('{"') && cleanValue.endsWith('"}')) {
            const extracted = cleanValue.slice(2, -2);
            return [extracted];
          }
          return cleanValue.split(',').map((v: string) => v.trim());
        }
      }
      return [String(value)];
    };

    // Upload final_pdf jika ada
    let finalPdfPath: string | undefined;
    if (files?.final_pdf && files.final_pdf.length > 0) {
      const uploadResult = await this.storageService.uploadFile(
        files.final_pdf[0],
        'kajian/final',
      );
      finalPdfPath = uploadResult.key;
    }

    const dto: FinalizeDraftDto = {};

    if (body.pengirim) dto.pengirim = Number(body.pengirim);
    if (body.penerima) dto.penerima = parseArray(body.penerima);
    if (body.tembusan) dto.tembusan = parseArray(body.tembusan);
    if (body.kop_logo) dto.kop_logo = body.kop_logo;
    if (body.kop_nama) dto.kop_nama = body.kop_nama;
    if (body.alamat_perusahaan) dto.alamat_perusahaan = body.alamat_perusahaan;
    if (body.klasifikasi) dto.klasifikasi = body.klasifikasi;
    if (body.klasifikasi_text) dto.klasifikasi_text = body.klasifikasi_text;
    if (body.sifat) dto.sifat = body.sifat;
    if (body.perihal) dto.perihal = body.perihal;
    if (body.konten) dto.konten = body.konten;
    if (body.english !== undefined)
      dto.english = body.english === 'true' || body.english === true;
    if (body.nama_tempat) dto.nama_tempat = body.nama_tempat;
    if (body.nama_jabatan) dto.nama_jabatan = body.nama_jabatan;
    if (body.tanda_tangan) dto.tanda_tangan = body.tanda_tangan;
    if (body.nama_lengkap) dto.nama_lengkap = body.nama_lengkap;
    if (body.lampiran) dto.lampiran = body.lampiran;
    if (body.lampiran_temp_ids)
      dto.lampiran_temp_ids = parseStringArray(body.lampiran_temp_ids);
    if (body.tgl) dto.tgl = body.tgl;
    if (finalPdfPath) dto.final_pdf = finalPdfPath;
    else if (body.final_pdf) dto.final_pdf = body.final_pdf;

    // Digital signature options
    if (body.sign_option) dto.sign_option = body.sign_option as SignOption;
    if (body.passphrase) dto.passphrase = body.passphrase;

    console.log(
      '[KA parseFormDataToFinalizeDraftDto] sign_option:',
      dto.sign_option,
    );
    console.log(
      '[KA parseFormDataToFinalizeDraftDto] passphrase:',
      dto.passphrase ? '****' : 'empty',
    );

    return dto;
  }

  /**
   * Get Kajian detail by ID (matching ND structure)
   */
  async getKajianDetail(naskahId: string, userPosition: string): Promise<any> {
    await this.assertUserHasAccessToNaskah(naskahId, userPosition);

    const naskah = await this.naskahRepository.findOne({
      where: { id: naskahId },
    });

    if (!naskah) {
      throw new NotFoundException(
        `Naskah dengan id ${naskahId} tidak ditemukan`,
      );
    }

    if (naskah.jenis !== 'KA') {
      throw new NotFoundException(`Naskah bukan Kajian (KA)`);
    }

    const pengirimSirkulasi = await this.naskahSirkulasiRepository.findOne({
      where: { idNaskah: naskahId, sirkuler: 'pengirim' },
    });

    const penerimaList = await this.naskahSirkulasiRepository.find({
      where: { idNaskah: naskahId, sirkuler: 'penerima' },
      order: { urutan: 'ASC', createdAt: 'ASC' },
    });

    const tembusanList = await this.naskahSirkulasiRepository.find({
      where: { idNaskah: naskahId, sirkuler: 'tembusan' },
      order: { urutan: 'ASC', createdAt: 'ASC' },
    });

    const lampiranFiles = await this.naskahLampiranRepository.find({
      where: { id_naskah: naskahId },
    });

    const tanggalStr =
      naskah.tanggal instanceof Date
        ? naskah.tanggal.toISOString().split('T')[0]
        : String(naskah.tanggal || '').split('T')[0];

    const penerimaInfoList = await Promise.all(
      penerimaList.map(async (penerima) => ({
        id: penerima.id,
        persnum: parseInt(penerima.idSirkuler || '0', 10),
        nama: penerima.namaSirkuler || '',
        position_id: penerima.position || '',
        position_status: penerima.positionStatus || '',
        positionText: penerima.positionText || '',
        organizationText: penerima.organizationText || '',
        subAreaText: penerima.subAreaText || '',
        areaText: penerima.areaText || '',
        status: penerima.sendReadTime ? 'dibaca' : 'belum_dibaca',
        readTime: penerima.sendReadTime
          ? penerima.sendReadTime.toISOString()
          : null,
      })),
    );

    const tembusanInfoList = await Promise.all(
      tembusanList.map(async (tembusan) => ({
        id: tembusan.id,
        persnum: parseInt(tembusan.idSirkuler || '0', 10),
        nama: tembusan.namaSirkuler || '',
        position_id: tembusan.position || '',
        position_status: tembusan.positionStatus || '',
        positionText: tembusan.positionText || '',
        organizationText: tembusan.organizationText || '',
        subAreaText: tembusan.subAreaText || '',
        areaText: tembusan.areaText || '',
      })),
    );

    const lampiranInfoList = await Promise.all(
      lampiranFiles.map(async (l) => {
        let fileUrl: string | null = null;
        if (l.file_pdf) {
          try {
            fileUrl = await this.storageService.getFileUrl(l.file_pdf);
          } catch (e) {
            console.error(
              `[KajianService] Failed to get URL for lampiran ${l.id}:`,
              e,
            );
          }
        }
        return {
          id: l.id,
          fileName: l.file_name || '',
          filePath: l.file_pdf || '',
          fileUrl,
        };
      }),
    );

    let finalPdfUrl: string | null = null;
    if (naskah.final_pdf) {
      try {
        finalPdfUrl = await this.storageService.getFileUrl(naskah.final_pdf);
      } catch (e) {
        console.error(`[KajianService] Failed to get URL for final_pdf:`, e);
      }
    }

    return {
      success: true,
      data: {
        id: naskah.id,
        jenis: naskah.jenis,
        nomor: naskah.nomor,
        tanggal: tanggalStr,
        status: naskah.status,
        perihal: naskah.perihal,
        lampiran: naskah.lampiran || null,
        english: !!naskah.english,
        klasifikasi: naskah.klasifikasi || '',
        klasifikasi_text: naskah.klasifikasi_text || null,
        sifat: naskah.sifat || '',
        konten: naskah.konten || null,
        pengirim: {
          id: pengirimSirkulasi?.id || '',
          persnum: pengirimSirkulasi
            ? parseInt(pengirimSirkulasi.idSirkuler || '0', 10)
            : 0,
          nama: pengirimSirkulasi?.namaSirkuler || '',
          position_id: pengirimSirkulasi?.position || '',
          position_status: pengirimSirkulasi?.positionStatus || '',
          positionText: pengirimSirkulasi?.positionText || '',
          organizationText: pengirimSirkulasi?.organizationText || '',
          subAreaText: pengirimSirkulasi?.subAreaText || '',
          areaText: pengirimSirkulasi?.areaText || '',
        },
        penerima: penerimaInfoList,
        tembusan: tembusanInfoList,
        lampiran_files: lampiranInfoList,
        final_pdf: naskah.final_pdf || null,
        final_pdf_url: finalPdfUrl,

        // Metadata
        created_at: pengirimSirkulasi?.createdAt || null,
        updated_at: pengirimSirkulasi?.updatedAt || null,
      },
    };
  }

  private async assertUserHasAccessToNaskah(
    naskahId: string,
    userPosition: string,
  ): Promise<void> {
    const access = await this.naskahSirkulasiRepository.findOne({
      where: {
        idNaskah: naskahId,
        position: String(userPosition),
      },
      select: { id: true },
    });

    if (!access) {
      throw new ForbiddenException('Anda tidak memiliki akses ke naskah ini');
    }
  }

  /**
   * Get draft list by position
   */
  async getDraftList(
    positionId: number,
    tgl?: string,
  ): Promise<GetSendMessageResponseDto> {
    const barisData = await this.getPositionData(tgl);
    const senderData = this.findByPosition(barisData, positionId);

    if (!senderData) {
      throw new NotFoundException(
        `Position dengan ID ${positionId} tidak ditemukan`,
      );
    }

    const pengirimSirkulasi = await this.naskahSirkulasiRepository.find({
      where: {
        position: String(positionId),
        sirkuler: 'pengirim',
        isDraft: true,
      },
      order: { createdAt: 'DESC' },
    });

    const naskahIds = pengirimSirkulasi.map((s) => s.idNaskah);

    if (naskahIds.length === 0) {
      return {
        success: true,
        data: [],
        total: 0,
        positionId,
        positionText: senderData.position_text,
        nama: senderData.persnum_person_text || '',
      };
    }

    const naskahList = await this.naskahRepository.find({
      where: { id: In(naskahIds), jenis: 'KA', status: 'draf' },
      order: { tanggal: 'DESC' },
    });

    const data: SendMessageItemDto[] = await Promise.all(
      naskahList.map(async (naskah) => {
        const penerimaList = await this.naskahSirkulasiRepository.find({
          where: { idNaskah: naskah.id, sirkuler: 'penerima' },
        });

        const tembusanList = await this.naskahSirkulasiRepository.find({
          where: { idNaskah: naskah.id, sirkuler: 'tembusan' },
        });

        const lampiranFiles = await this.naskahLampiranRepository.find({
          where: { id_naskah: naskah.id },
        });

        const lampiranFilesWithUrls = await Promise.all(
          lampiranFiles.map(async (l) => ({
            id: l.id,
            fileName: l.file_name || '',
            filePath: l.file_pdf || '',
            fileUrl: l.file_pdf
              ? await this.storageService.getFileUrl(l.file_pdf)
              : null,
          })),
        );

        const pengirim = pengirimSirkulasi.find(
          (s) => s.idNaskah === naskah.id,
        );

        // Generate final_pdf_url if final_pdf exists
        const finalPdfUrl = naskah.final_pdf
          ? await this.storageService.getFileUrl(naskah.final_pdf)
          : null;

        return {
          id: naskah.id,
          jenis: naskah.jenis || 'KA',
          nomor: naskah.nomor || '',
          tanggal:
            naskah.tanggal instanceof Date
              ? naskah.tanggal.toISOString().split('T')[0]
              : String(naskah.tanggal || ''),
          status: naskah.status as 'draf' | 'final' | 'final_tte',
          kop_logo: null,
          kop_nama: null,
          alamat_perusahaan: null,
          klasifikasi: naskah.klasifikasi || '',
          klasifikasi_text: naskah.klasifikasi_text || null,
          sifat: naskah.sifat || '',
          perihal: naskah.perihal || '',
          english: !!naskah.english,
          konten: naskah.konten || null,
          nama_tempat: null,
          nama_jabatan: null,
          tanda_tangan: null,
          nama_lengkap: null,
          pengirim: {
            persnum: pengirim ? parseInt(pengirim.idSirkuler || '0', 10) : 0,
            nama: pengirim?.namaSirkuler || '',
            positionText: pengirim?.positionText || '',
            organizationText: pengirim?.organizationText || '',
          },
          penerima: penerimaList.map((p) => ({
            persnum: parseInt(p.idSirkuler || '0', 10),
            nama: p.namaSirkuler || '',
            organizationText: p.organizationText || '',
            positionText: p.positionText || '',
            status: p.sendReadTime ? 'dibaca' : 'belum_dibaca',
            readTime: p.sendReadTime ? p.sendReadTime.toISOString() : null,
          })),
          tembusan: tembusanList.map((t) => ({
            persnum: parseInt(t.idSirkuler || '0', 10),
            nama: t.namaSirkuler || '',
            organizationText: t.organizationText || '',
            positionText: t.positionText || '',
          })),
          lampiran: naskah.lampiran || null,
          lampiran_files: lampiranFilesWithUrls,
          final_pdf: naskah.final_pdf || null,
          final_pdf_url: finalPdfUrl,
          jumlahPenerima: penerimaList.length,
          jumlahDibaca: penerimaList.filter((p) => p.sendReadTime).length,
        };
      }),
    );

    return {
      success: true,
      data,
      total: data.length,
      positionId,
      positionText: senderData.position_text,
      nama: senderData.persnum_person_text || '',
    };
  }

  /**
   * Finalize draft (convert to final)
   * Support digital signature options (digsig, qr_only, none)
   *
   * @param naskahId - ID naskah draft
   * @param dto - FinalizeDraftDto dengan sign_option dan passphrase
   * @param persnum - Persnum user untuk BSrE (optional, required for digsig)
   */
  async finalizeDraft(
    naskahId: string,
    dto: FinalizeDraftDto,
    persnum?: number,
    portalUser?: JwtPayload,
  ): Promise<SendMessageResponseDto> {
    const isPortalMode =
      dto.sign_option === SignOption.DIGSIG &&
      (await this.tteSigningGateway.isPortalMode('KA'));
    console.log(
      `[KA] finalizeDraft called for naskah ${naskahId}, sign_option: ${dto.sign_option}, persnum: ${persnum}`,
    );

    const naskah = await this.naskahRepository.findOne({
      where: { id: naskahId },
    });

    if (!naskah) {
      throw new NotFoundException(
        `Naskah dengan id ${naskahId} tidak ditemukan`,
      );
    }

    if (naskah.status !== 'draf') {
      throw new BadRequestException(
        `Naskah bukan draft, tidak bisa di-finalize`,
      );
    }

    if (naskah.jenis !== 'KA') {
      throw new BadRequestException(`Naskah bukan Kajian (KA)`);
    }

    assertDateNotInFuture(dto.tgl, 'Tanggal naskah');

    // Validate signing options
    if (dto.sign_option === SignOption.DIGSIG) {
      if (!persnum) {
        throw new BadRequestException(
          'Persnum diperlukan untuk tanda tangan digital (digsig)',
        );
      }
      if (!isPortalMode && !dto.passphrase) {
        throw new BadRequestException(
          'Passphrase diperlukan untuk tanda tangan digital (digsig)',
        );
      }
    }

    // Get sirkulasi for pengirim, penerima, tembusan
    const pengirimSirkulasi = await this.naskahSirkulasiRepository.findOne({
      where: { idNaskah: naskahId, sirkuler: 'pengirim' },
    });

    const penerimaSirkulasiList = await this.naskahSirkulasiRepository.find({
      where: { idNaskah: naskahId, sirkuler: 'penerima' },
    });

    const tembusanSirkulasiList = await this.naskahSirkulasiRepository.find({
      where: { idNaskah: naskahId, sirkuler: 'tembusan' },
    });

    const tanggalStr =
      dto.tgl ||
      (naskah.tanggal
        ? naskah.tanggal instanceof Date
          ? naskah.tanggal.toISOString().split('T')[0]
          : String(naskah.tanggal).split('T')[0]
        : new Date().toISOString().split('T')[0]);
    const barisData = await this.getPositionData(tanggalStr);
    const pengirimData = this.findByPosition(
      barisData,
      Number(pengirimSirkulasi?.position || dto.pengirim),
    );
    if (!pengirimData) {
      throw new NotFoundException('Data pengirim tidak ditemukan dalam org_data');
    }
    this.validateKajianRouting(
      barisData,
      pengirimData.position,
      penerimaSirkulasiList.map((item) => Number(item.position)),
    );

    // Determine status based on sign_option
    let status: 'pending' | 'pending_tte' | 'final' | 'final_tte' = 'final';
    if (dto.sign_option === SignOption.DIGSIG) {
      status = isPortalMode ? 'pending_tte' : 'final_tte';
    } else if (dto.sign_option === SignOption.QR_ONLY) {
      status = 'final';
    } else if (dto.sign_option === SignOption.TTD_BASAH) {
      status = 'pending';
    }

    let bsreNameDoc: string | null = null;

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Update naskah fields if provided
      if (dto.perihal) naskah.perihal = dto.perihal;
      if (dto.konten) naskah.konten = dto.konten;
      if (dto.klasifikasi) naskah.klasifikasi = dto.klasifikasi;
      if (dto.klasifikasi_text) naskah.klasifikasi_text = dto.klasifikasi_text;
      if (dto.sifat) naskah.sifat = dto.sifat;
      if (dto.english !== undefined) naskah.english = dto.english;
      if (dto.lampiran) naskah.lampiran = dto.lampiran;

      // Generate nomor if not exists
      if (!naskah.nomor && pengirimData) {
        // Convert tanggal string to Date object for nomor generation
        const tanggalDate = new Date(tanggalStr);

        const generatedNomor = await this.nomorSuratService.generateNomor({
          jenis: 'KA',
          positionText: pengirimData.position_text,
          positionAbbreviation: pengirimData.position_abbreviation || undefined,
          areaText: pengirimData.area_text || '',
          tanggal: tanggalDate,
        });
        naskah.nomor = generatedNomor.nomor;
      }

      // Set status
      naskah.status = status;
      naskah.signOption = dto.sign_option || null;

      await updatePartitionedNaskah(
        queryRunner.manager,
        NaskahEntity,
        { id: naskah.id, tanggal: naskah.tanggal },
        {
          perihal: naskah.perihal,
          konten: naskah.konten,
          klasifikasi: naskah.klasifikasi,
          klasifikasi_text: naskah.klasifikasi_text,
          sifat: naskah.sifat,
          english: naskah.english,
          lampiran: naskah.lampiran,
          nomor: naskah.nomor,
          status: naskah.status,
          signOption: naskah.signOption,
        },
      );

      // Update all sirkulasi - keep isDraft=true for pending/TTD basah
      const isPending = status === 'pending' || status === 'pending_tte';
      if (!isPending) {
        await queryRunner.manager.update(
          NaskahSirkulasi,
          { idNaskah: naskahId },
          { isDraft: false },
        );
      }

      // Move lampiran from temp to final location
      if (dto.lampiran_temp_ids && dto.lampiran_temp_ids.length > 0) {
        try {
          await this.moveTemporaryLampiranToFinal(
            dto.lampiran_temp_ids,
            naskahId,
            'kajian/lampiran',
          );
        } catch (moveError: any) {
          console.error(
            'Failed to move temporary lampiran in finalizeDraft:',
            moveError?.message || moveError,
          );
        }
      }

      // ============================================================
      // AUTO-GENERATE FINAL PDF WITH SIGNING
      // ============================================================
      let finalPdfPath: string | undefined;

      // Get header info for dynamic kota
      const headerInfo = await this.getHeaderInfoByUser(
        {
          company: pengirimData?.company ?? undefined,
          area: pengirimData?.area ?? undefined,
          subArea:
            pengirimData?.sub_area != null
              ? String(pengirimData.sub_area)
              : undefined,
        },
        tanggalStr,
      );

      const dynamicNamaTempat =
        headerInfo?.kota ||
        dto.nama_tempat ||
        pengirimData?.sub_area_text ||
        'Tangerang';

      // Format tanggal for PDF
      const tanggalKajian = new Date(tanggalStr);
      const formattedTanggal = `${dynamicNamaTempat}, ${tanggalKajian.toLocaleDateString(
        'id-ID',
        {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        },
      )}`;

      // Build tertuju (penerima) list - filter out null values
      const tertujuList = penerimaSirkulasiList
        .map((p) => p.positionText || '')
        .filter(Boolean);

      // Build tembusan list - filter out null values
      const tembusanList = tembusanSirkulasiList
        .map((t) => t.positionText || '')
        .filter(Boolean);

      // Determine konten and perihal for PDF
      const kontenForPdf = dto.konten || naskah.konten || '';
      const perihalForPdf = dto.perihal || naskah.perihal || '';
      const signerJabatan =
        dto.nama_jabatan && dto.nama_jabatan.trim()
          ? dto.nama_jabatan
          : pengirimData?.position_text ||
            pengirimSirkulasi?.positionText ||
            '';
      const signerName =
        dto.nama_lengkap ||
        pengirimData?.persnum_person_text ||
        pengirimSirkulasi?.namaSirkuler ||
        '';
      const dariForPdf = pengirimData
        ? pengirimData.position_text
        : pengirimSirkulasi?.positionText || '';

      // Prepare QR Code for signing
      let qrCodeHtml: string | undefined = undefined;
      let signatureId: string | undefined = undefined;
      let signedAt: string | undefined = undefined;
      let verificationUrl: string | undefined = undefined;

      console.log(
        `[KA finalizeDraft] Preparing signing, sign_option: ${dto.sign_option}`,
      );

      // Pre-generate QR code untuk digsig atau qr_only
      if (
        (dto.sign_option === SignOption.DIGSIG && persnum && !isPortalMode) ||
        dto.sign_option === SignOption.QR_ONLY
      ) {
        signedAt = new Date().toISOString();
        signatureId = generateSignatureId();
        verificationUrl = `${VERIFICATION_BASE_URL}/${signatureId}`;

        const qrData: QRCodeData = {
          signature_id:
            dto.sign_option === SignOption.DIGSIG ? signatureId : '',
          document_number: naskah.nomor || '',
          signed_at: signedAt,
          signer_name: signerName,
          signer_jabatan: signerJabatan,
          document_type: 'Kajian',
          verification_url:
            dto.sign_option === SignOption.DIGSIG ? verificationUrl : undefined,
        };

        console.log(`[KA finalizeDraft] Generating QR Code HTML for template`);
        const qrBase64 = await this.qrCodeService.generateQRCodeBase64(qrData);
        qrCodeHtml = `<img src="${qrBase64}" style="width: 80px; height: 80px;" alt="QR Code" />`;
        console.log(`[KA finalizeDraft] QR Code HTML generated successfully`);
      }

      // Generate PDF with QR code di template (jika ada)
      console.log(
        `[KA finalizeDraft] Generating PDF with qrCodeHtml: ${qrCodeHtml ? 'YES' : 'NO'}`,
      );
      let pdfBuffer = await this.generatePdfKajianService.generatePdf({
        html: kontenForPdf,
        htmlContent: kontenForPdf,
        nomor: naskah.nomor || '',
        tertuju: tertujuList,
        tembusan: tembusanList,
        perihal: perihalForPdf,
        dari: dariForPdf,
        tanggal: formattedTanggal,
        positionText: signerJabatan,
        namaLengkap: signerName,
        nama_tempat: dynamicNamaTempat,
        headerKantor: headerInfo?.kantor,
        headerGedung: headerInfo?.gedung,
        headerAlamat: headerInfo?.alamat,
        qrCodeHtml: qrCodeHtml,
        bsreFooter: dto.sign_option === SignOption.DIGSIG,
      });
      console.log(`[KA finalizeDraft] PDF generated successfully`);

      // Merge with lampiran if any (from existing lampiran in naskah)
      const existingLampiran = await this.naskahLampiranRepository.find({
        where: { id_naskah: naskahId, is_temporary: 0 },
      });

      if (existingLampiran && existingLampiran.length > 0) {
        const lampiranFiles = existingLampiran
          .filter((l) => l.file_pdf && l.file_pdf.trim() !== '')
          .map((l) => ({
            filePath: l.file_pdf,
            fileType: 'application/pdf',
            fileName: l.file_name || '',
          }));

        if (lampiranFiles.length > 0) {
          pdfBuffer = await this.mergePdfWithLampiranFiles(
            pdfBuffer,
            lampiranFiles,
          );
          console.log(`[KA finalizeDraft] Lampiran merged successfully`);
        }
      }

      // Process BSrE signing (jika digsig)
      if (dto.sign_option === SignOption.DIGSIG && persnum && !isPortalMode) {
        console.log(
          `[KA finalizeDraft] Processing DIGSIG for naskah ${naskahId}, persnum: ${persnum}`,
        );

        // Fetch NIK dan no_wa dari HR API via DigsigService
        console.log(
          `[KA finalizeDraft] Fetching user data for persnum: ${persnum}`,
        );
        const userData = await this.digsigService.getUserDataForBsre(
          persnum.toString(),
        );
        console.log(`[KA finalizeDraft] Got userData:`, {
          nik: userData.nik,
          no_wa: userData.no_wa,
        });

        // Upload PDF (dengan QR) ke temp untuk BSrE signing
        console.log(`[KA finalizeDraft] Uploading temp PDF for BSrE`);
        const tempTimestamp = Date.now();
        const tempFileName = `temp-${naskahId}-${tempTimestamp}.pdf`;
        const tempUpload = await this.storageService.uploadBuffer(
          pdfBuffer,
          tempFileName,
          'application/pdf',
          'kajian/temp',
        );
        console.log(`[KA finalizeDraft] Temp PDF uploaded: ${tempUpload.key}`);

        // Hit BSrE API untuk digital signature
        console.log(`[KA finalizeDraft] Hitting BSrE API`);
        const bsreResponse = await this.digsigService.hitDigsigEndpoint(
          {
            key: tempUpload.key,
            filename: tempFileName,
            nomorDokumen: naskah.nomor || '',
            tanggalDokumen: tanggalStr,
            klasifikasi: naskah.klasifikasi || 'Biasa',
            jenisNaskah: 'Kajian',
            perihal: perihalForPdf,
            nik: userData.nik,
            passphrase: dto.passphrase!,
            path_dokumen: 'kajian/digsig/',
            no_wa: userData.no_wa,
          },
          {
            userPersnum: persnum,
            userName: signerName || 'User',
            idNaskah: naskahId,
            jenisNaskah: 'KA',
          },
        );
        console.log(
          `[KA finalizeDraft] BSrE response:`,
          JSON.stringify(bsreResponse, null, 2),
        );

        // Extract name_doc from BSrE response
        bsreNameDoc =
          bsreResponse?.name_doc?.[0] ||
          bsreResponse?.data?.name_doc?.[0] ||
          null;
        console.log(`[KA finalizeDraft] BSrE name_doc: ${bsreNameDoc}`);

        // Cleanup temp file
        try {
          await this.storageService.deleteFile(tempUpload.key);
        } catch (e) {
          console.warn(
            `[KA finalizeDraft] Failed to cleanup temp file: ${e.message}`,
          );
        }

        // Download signed PDF from digsig/ and upload to final/
        if (bsreNameDoc) {
          console.log(`[KA finalizeDraft] Downloading signed PDF from digsig/`);
          const digsigPath = `kajian/digsig/${bsreNameDoc}`;
          try {
            const signedPdfBuffer =
              await this.storageService.getFile(digsigPath);
            console.log(
              `[KA finalizeDraft] Signed PDF downloaded, size: ${signedPdfBuffer.length} bytes`,
            );
            // Replace pdfBuffer with signed version
            pdfBuffer = signedPdfBuffer;
          } catch (e) {
            console.warn(
              `[KA finalizeDraft] Failed to download signed PDF from digsig/, will use original: ${e.message}`,
            );
          }
        }
      } else if (dto.sign_option === SignOption.QR_ONLY) {
        console.log(
          `[KA finalizeDraft] QR_ONLY mode - QR already in template, no BSrE signing needed`,
        );
      }

      // Upload final PDF to storage
      const pdfFileName = await this.createFinalPdfFileName('KA', naskahId);
      const uploadResult = await this.storageService.uploadBuffer(
        pdfBuffer,
        pdfFileName,
        'application/pdf',
        'kajian/final',
      );

      finalPdfPath = uploadResult.key;

      // Update naskah with final_pdf path
      await queryRunner.manager.update(
        NaskahEntity,
        { id: naskahId },
        { final_pdf: finalPdfPath },
      );

      await queryRunner.commitTransaction();

      let portalRedirect:
        | { transactionId: string; signingUrl: string }
        | undefined;
      if (isPortalMode) {
        if (!portalUser || !finalPdfPath) {
          throw new BadRequestException(
            'Konteks pengguna atau PDF Kajian untuk Portal TTE tidak lengkap',
          );
        }
        const portal = await this.tteSigningService.createSigningTransaction({
          sourceKey: finalPdfPath,
          filename: finalPdfPath.split('/').pop() || `KA-${naskahId}.pdf`,
          pathDokumen: 'kajian/digsig/',
          idNaskah: naskahId,
          jenisNaskah: 'KA',
          nomorNaskah: naskah.nomor || undefined,
          location: 'Indonesia',
          reason: `Penandatanganan Kajian ${naskah.nomor || naskahId}`,
          user: portalUser,
        });
        portalRedirect = {
          transactionId: portal.transactionId,
          signingUrl: portal.signingUrl,
        };
      }

      // Get updated data for response
      const detail = await this.getKajianDetail(
        naskahId,
        String(dto.pengirim || ''),
      );

      return {
        success: true,
        message: 'Draft berhasil di-finalize',
        data: {
          id: detail.data.id,
          jenis: detail.data.jenis,
          nomor: detail.data.nomor,
          tanggal: detail.data.tanggal,
          status: detail.data.status,
          perihal: detail.data.perihal,
          pengirim: {
            position: parseInt(detail.data.pengirim.position_id || '0', 10),
            position_text: detail.data.pengirim.positionText,
            persnum: detail.data.pengirim.persnum,
            nama: detail.data.pengirim.nama,
            organization_id: 0,
            organization_text: detail.data.pengirim.organizationText,
            sub_area: null,
            sub_area_text: detail.data.pengirim.subAreaText,
            area: null,
            area_text: detail.data.pengirim.areaText,
          },
          penerima: detail.data.penerima.map((p: any) => ({
            position: parseInt(p.position_id || '0', 10),
            position_text: p.positionText,
            persnum: p.persnum,
            nama: p.nama,
            organization_id: 0,
            organization_text: p.organizationText,
            sub_area: null,
            sub_area_text: p.subAreaText,
            area: null,
            area_text: p.areaText,
          })),
          tembusan: detail.data.tembusan.map((t: any) => ({
            position: parseInt(t.position_id || '0', 10),
            position_text: t.positionText,
            persnum: t.persnum,
            nama: t.nama,
            organization_id: 0,
            organization_text: t.organizationText,
            sub_area: null,
            sub_area_text: t.subAreaText,
            area: null,
            area_text: t.areaText,
          })),
          final_pdf: detail.data.final_pdf,
          lampiran_files: detail.data.lampiran_files,
          // Additional fields untuk digsig
          sign_option: dto.sign_option,
          bsre_name_doc: bsreNameDoc,
          tte_redirect: portalRedirect,
        } as any,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Generate plain PDF (without lampiran merge)
   */
  async generatePlainPdf(
    htmlContent: string,
    tertuju: string[],
    dari: string,
    perihal: string,
    tanggal: string,
    positionText: string,
    namaLengkap: string,
    tembusan: string[] = [],
    tgl?: string,
    nama_tempat?: string,
    headerInfo?: {
      kantor: string;
      gedung: string;
      alamat: string;
      kota: string;
    },
    qrCodeHtml?: string,
    signOption?: SignOption | string,
  ): Promise<Buffer> {
    try {
      let htmlToSend = htmlContent;

      if (htmlContent.match(/^[A-Za-z0-9+/=]+$/)) {
        try {
          const decoded = Buffer.from(htmlContent, 'base64').toString('utf-8');
          if (decoded.includes('<') || decoded.length > 10) {
            htmlToSend = htmlContent;
          } else {
            htmlToSend = Buffer.from(htmlContent, 'utf-8').toString('base64');
          }
        } catch {
          htmlToSend = Buffer.from(htmlContent, 'utf-8').toString('base64');
        }
      } else {
        htmlToSend = Buffer.from(htmlContent, 'utf-8').toString('base64');
      }

      const namaTempat = headerInfo?.kota || nama_tempat || 'Tangerang';

      // Generate preview QR code jika qrCodeHtml tidak disediakan
      const isBsre =
        String(signOption || '').toLowerCase() === SignOption.DIGSIG;
      let previewQrHtml = qrCodeHtml;
      if (!previewQrHtml && !isBsre) {
        previewQrHtml = await this.qrCodeService.generatePreviewQRCodeHtml();
      }

      const pdfDto = {
        html: htmlToSend,
        filename: `kajian-${Date.now()}.pdf`,
        tertuju,
        dari,
        perihal,
        tanggal,
        positionText,
        namaLengkap,
        tembusan,
        tgl,
        nama_tempat: namaTempat,
        headerKantor: headerInfo?.kantor,
        headerGedung: headerInfo?.gedung,
        headerAlamat: headerInfo?.alamat,
        // QR Code HTML untuk preview
        qrCodeHtml: previewQrHtml,
        bsreFooter: isBsre,
      };

      const pdfBuffer = await this.generatePdfKajianService.generatePdf(pdfDto);
      return pdfBuffer;
    } catch (error) {
      throw new BadRequestException(`Gagal generate PDF: ${error.message}`);
    }
  }

  /**
   * Get temporary lampiran files from storage
   */
  private async getTemporaryLampiranFiles(
    lampiranIds: string[],
  ): Promise<{ filePath: string; fileName: string; buffer: Buffer }[]> {
    const files: { filePath: string; fileName: string; buffer: Buffer }[] = [];

    for (const lampiranId of lampiranIds) {
      try {
        const lampiran = await this.naskahLampiranRepository.findOne({
          where: { id: lampiranId },
        });

        if (lampiran && lampiran.file_pdf) {
          const buffer = await this.storageService.getFile(lampiran.file_pdf);
          files.push({
            filePath: lampiran.file_pdf,
            fileName: lampiran.file_name || 'lampiran.pdf',
            buffer,
          });
        }
      } catch (error) {
        console.error(
          `[KajianService] Error getting lampiran ${lampiranId}:`,
          error,
        );
      }
    }

    return files;
  }

  /**
   * Merge PDF with temporary files
   */
  private async mergePdfWithTemporaryFiles(
    mainPdfBuffer: Buffer,
    lampiranFiles: { filePath: string; fileName: string; buffer: Buffer }[],
  ): Promise<Buffer> {
    try {
      const mergedPdf = await PDFDocument.create();

      const mainDoc = await PDFDocument.load(mainPdfBuffer);
      const mainPages = await mergedPdf.copyPages(
        mainDoc,
        mainDoc.getPageIndices(),
      );
      mainPages.forEach((page) => mergedPdf.addPage(page));

      for (const file of lampiranFiles) {
        if (file.fileName.toLowerCase().endsWith('.pdf')) {
          const lampiranDoc = await PDFDocument.load(file.buffer);
          const lampiranPages = await mergedPdf.copyPages(
            lampiranDoc,
            lampiranDoc.getPageIndices(),
          );
          lampiranPages.forEach((page) => mergedPdf.addPage(page));
        }
      }

      const mergedPdfBytes = await mergedPdf.save();
      return Buffer.from(mergedPdfBytes);
    } catch (error) {
      console.error('[KajianService] Error merging PDF:', error);
      return mainPdfBuffer;
    }
  }

  /**
   * Merge main PDF with lampiran files from storage (for finalized lampiran)
   */
  private async mergePdfWithLampiranFiles(
    mainPdfBuffer: Buffer,
    lampiranFiles: { filePath: string; fileType: string; fileName: string }[],
  ): Promise<Buffer> {
    try {
      const mergedPdf = await PDFDocument.create();

      // Add main PDF pages
      const mainDoc = await PDFDocument.load(mainPdfBuffer);
      const mainPages = await mergedPdf.copyPages(
        mainDoc,
        mainDoc.getPageIndices(),
      );
      mainPages.forEach((page) => mergedPdf.addPage(page));

      // Add lampiran files (only PDFs)
      for (const file of lampiranFiles) {
        if (
          file.fileName.toLowerCase().endsWith('.pdf') ||
          file.fileType === 'application/pdf'
        ) {
          try {
            // Fetch file from storage
            const fileBuffer = await this.storageService.getFile(file.filePath);
            if (fileBuffer) {
              const lampiranDoc = await PDFDocument.load(fileBuffer);
              const lampiranPages = await mergedPdf.copyPages(
                lampiranDoc,
                lampiranDoc.getPageIndices(),
              );
              lampiranPages.forEach((page) => mergedPdf.addPage(page));
            }
          } catch (lampiranError) {
            console.error(
              `[KajianService] Error loading lampiran ${file.fileName}:`,
              lampiranError,
            );
            // Continue with next lampiran
          }
        }
      }

      const mergedPdfBytes = await mergedPdf.save();
      return Buffer.from(mergedPdfBytes);
    } catch (error) {
      console.error('[KajianService] Error merging PDF with lampiran:', error);
      return mainPdfBuffer;
    }
  }

  /**
   * Generate PDF with lampiran merge (for preview-pdf)
   */
  async generatePdfFromHtml(
    htmlContent: string,
    tertuju: string[],
    dari: string,
    perihal: string,
    tanggal: string,
    positionText: string,
    namaLengkap: string,
    tembusan: string[] = [],
    lampiranData?: string[] | Express.Multer.File[],
    tgl?: string,
    nama_tempat?: string,
    headerInfo?: {
      kantor: string;
      gedung: string;
      alamat: string;
      kota: string;
    },
  ): Promise<Buffer> {
    try {
      let pdfBuffer = await this.generatePlainPdf(
        htmlContent,
        tertuju,
        dari,
        perihal,
        tanggal,
        positionText,
        namaLengkap,
        tembusan,
        tgl,
        nama_tempat,
        headerInfo,
      );

      if (lampiranData && lampiranData.length > 0) {
        const firstItem = lampiranData[0];

        if (typeof firstItem === 'string') {
          const lampiranFiles = await this.getTemporaryLampiranFiles(
            lampiranData as string[],
          );
          if (lampiranFiles && lampiranFiles.length > 0) {
            pdfBuffer = await this.mergePdfWithTemporaryFiles(
              pdfBuffer,
              lampiranFiles,
            );
          }
        }
      }

      return pdfBuffer;
    } catch (error) {
      throw new BadRequestException(`Gagal generate PDF: ${error.message}`);
    }
  }
}
