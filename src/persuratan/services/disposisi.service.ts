import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual, MoreThanOrEqual, DataSource } from 'typeorm';
import { RelationSp } from 'src/relation_sp/entities/relation_sp.entity';
import { RelationOsc } from 'src/relation_osc/entities/relation_osc.entity';
import { RelationOa } from 'src/relation_oa/entities/relation_oa.entity';
import { RelationOo } from 'src/relation_oo/entities/relation_oo.entity';
import { Person } from 'src/person/entities/person.entity';
import { OmPosition } from 'src/position/entities/om-position.entity';
import { OmAreaSub } from 'src/areasub/entities/om-areasub.entity';
import { NaskahEntity } from '../entity/naskah.entity';
import { NaskahSirkulasi } from '../entity/naskah_sirkulasi.entity';
import { NaskahLampiranEntity } from '../entity/naskah_lampiran.entity';
import { NaskahReferensiEntity } from '../entity/naskah_referensi.entity';
import { DisposisiItemEntity } from '../entity/disposisi_item.entity';
import { DiEntity } from '../entity/di.entity';
import { DisposisiRecipientResponseDto } from '../dto/disposisi/disposisi-recipient-response.dto';
import { CreateDisposisiDto } from '../dto/disposisi/create-disposisi.dto';
import {
  SendDisposisiResponseDto,
  DisposisiSirkulasiInfoDto,
} from '../dto/disposisi/send-disposisi-response.dto';
import {
  GetSendMessageResponseDto,
  SentMessageItemDto,
} from '../dto/disposisi/get-send-message-response.dto';
import {
  UpdateMessageStatusDto,
  UpdateMessageStatusResponseDto,
} from '../dto/disposisi/update-message-status.dto';
import {
  UpdateDraftDisposisiDto,
  UpdateDraftDisposisiResponseDto,
} from '../dto/disposisi/update-draft-disposisi.dto';
import {
  SendDraftDisposisiDto,
  SendDraftDisposisiResponseDto,
} from '../dto/disposisi/send-draft-disposisi.dto';
import {
  ForwardDisposisiDto,
  ForwardDisposisiResponseDto,
} from '../dto/disposisi/forward-disposisi.dto';
import { OrgDataService } from 'src/org_data/org_data.service';
import { NomorSuratService } from './nomor-surat.service';
import { v4 as uuidv4 } from 'uuid';

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
    @InjectRepository(OmAreaSub)
    private readonly areaSubRepository: Repository<OmAreaSub>,
    @InjectRepository(NaskahEntity)
    private readonly naskahRepository: Repository<NaskahEntity>,
    @InjectRepository(NaskahSirkulasi)
    private readonly naskahSirkulasiRepository: Repository<NaskahSirkulasi>,
    @InjectRepository(NaskahLampiranEntity)
    private readonly naskahLampiranRepository: Repository<NaskahLampiranEntity>,
    @InjectRepository(NaskahReferensiEntity)
    private readonly naskahReferensiRepository: Repository<NaskahReferensiEntity>,
    @InjectRepository(DisposisiItemEntity)
    private readonly disposisiItemRepository: Repository<DisposisiItemEntity>,
    @InjectRepository(DiEntity)
    private readonly diRepository: Repository<DiEntity>,
    private readonly orgDataService: OrgDataService,
    private readonly nomorSuratService: NomorSuratService,
    private readonly dataSource: DataSource,
  ) {}

  // ============================================================
  // ORG_DATA INTEGRATION METHODS
  // ============================================================

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
  private findByPosition(barisData: PositionData[], position: number): PositionData | undefined {
    return barisData.find((x) => Number(x.position) === Number(position));
  }

  /**
   * Filter recipients for Disposisi:
   * Rules: Managerial ke managerial/fungsional/staf di bawahnya (langsung/tidak langsung)
   * dalam Company yang sama sampai level kedalaman tertentu
   * 
   * Barrier Depth berdasarkan level pengirim:
   * - EVP (Level 0) → bisa ke Level 1, 2, 3 (max depth = 3)
   * - VP (Level 1) → bisa ke Level 2, 3 (max depth = 2) 
   * - Manager (Level 2) → bisa ke Level 3 (max depth = 1)
   * - Staff (Level 3) → tidak bisa kirim (bukan managerial)
   * 
   * Logic:
   * 1. Calculate barrier depth based on sender level (3 - currentLevel)
   * 2. Get all organizations under current organization (recursive)
   * 3. Get all positions in those organizations (managerial + staff)
   * 4. Same company
   */
  private filterByPositionDispo(
    barisData: PositionData[],
    positionParam: number,
  ): PositionData[] {
    const current = this.findByPosition(barisData, positionParam);
    if (!current) return [];

    const currentLevel = Number(current.level);
    const currentCompany = current.company;
    const currentOrgId = current.organization_id;

    // Calculate barrier depth: 3 - currentLevel
    // EVP (0) → 3-0 = 3 levels down
    // VP (1) → 3-1 = 2 levels down  
    // Manager (2) → 3-2 = 1 level down
    // Staff (3) → 3-3 = 0 (cannot send)
    const barrierDepth = 3 - currentLevel;
    
    // If barrier depth is 0 or negative, cannot send disposisi
    if (barrierDepth <= 0) return [];

    // Max level that can receive = currentLevel + barrierDepth
    const maxLevel = currentLevel + barrierDepth; // Always ends at level 3

    // Step 1: Find all child organizations recursively (up to barrierDepth)
    const childOrgIds = new Set<number>();
    
    const findChildOrgs = (parentOrgId: number, depth: number) => {
      if (depth > barrierDepth) return;
      
      // Find organizations where organization_parent = parentOrgId
      const children = barisData.filter(
        (x) => x.organization_parent === parentOrgId && x.chief === 1,
      );
      
      // Get unique org IDs from children
      const uniqueChildOrgs = new Set(children.map((c) => c.organization_id));
      
      uniqueChildOrgs.forEach((orgId) => {
        if (!childOrgIds.has(orgId)) {
          childOrgIds.add(orgId);
          // Recursively find children of this org
          findChildOrgs(orgId, depth + 1);
        }
      });
    };

    // Start from current organization
    childOrgIds.add(currentOrgId);
    findChildOrgs(currentOrgId, 1);

    // Step 2: Get all positions in child organizations (including current org)
    // - Same company
    // - Level > currentLevel (bawahan)
    // - Level <= maxLevel (barrier)
    const recipients = barisData.filter((x) => {
      // Must be same company
      if (x.company !== currentCompany) return false;
      
      // Must be below current level (bawahan)
      if (x.level <= currentLevel) return false;
      
      // Check barrier depth - cannot exceed maxLevel (level 3)
      if (x.level > maxLevel) return false;
      
      // In child organizations (managerial or fungsional)
      if (childOrgIds.has(x.organization_id)) return true;
      
      // Staff in same divisi
      if (x.chief === 0 && Number(x.divisi_id) === Number(current.divisi_id)) return true;
      
      return false;
    });

    return recipients;
  }

  /**
   * Get disposisi recipients using cached org_data
   * Returns all fields from position_json
   * 
   * Barrier depth is automatically calculated based on sender level:
   * - Level 0 (EVP) → depth 3 (can reach level 1, 2, 3)
   * - Level 1 (VP) → depth 2 (can reach level 2, 3)
   * - Level 2 (Manager) → depth 1 (can reach level 3)
   * - Level 3 (Staff) → cannot send disposisi
   */
  async getDisposisiRecipients(
    positionId: number,
  ): Promise<DisposisiRecipientResponseDto> {
    // Get cached position data
    const barisData = await this.getPositionData();

    // Find sender data
    const senderData = this.findByPosition(barisData, positionId);

    if (!senderData) {
      throw new NotFoundException(
        `Position dengan ID ${positionId} tidak ditemukan`,
      );
    }

    // Check if position is managerial (chief = 1)
    if (senderData.chief !== 1) {
      throw new ForbiddenException(
        `Hanya managerial yang bisa kirim Disposisi. Position ${positionId} bukan managerial.`,
      );
    }

    // Calculate barrier depth for this sender
    const senderLevel = Number(senderData.level);
    const barrierDepth = 3 - senderLevel;

    // Check if sender can send disposisi (must have barrier depth > 0)
    if (barrierDepth <= 0) {
      throw new ForbiddenException(
        `Position level ${senderLevel} tidak bisa mengirim Disposisi. Hanya level 0-2 yang bisa mengirim.`,
      );
    }

    // Get recipients using filter logic - barrier depth based on sender level
    const recipientData = this.filterByPositionDispo(barisData, positionId);

    // Filter: exclude self
    const recipients = recipientData.filter((r) => r.position !== positionId);

    const totalRecipients = recipients.length;
    const uniqueOrgIds = new Set(recipients.map((r) => r.organization_id));

    return {
      sender: senderData,
      recipients: {
        ATASAN: [], // DI: no ATASAN
        BAWAHAN: recipients, // DI: managerial/fungsional/staf di bawahnya
        REKAN: [], // DI: no REKAN
      },
      hierarchy: {
        maxDepth: barrierDepth,
        totalOrganizations: uniqueOrgIds.size,
        totalRecipients,
      },
    };
  }

  // ============================================================
  // HELPER - VALIDATE RECIPIENTS
  // ============================================================

  /**
   * Validate that all penerima_position_ids are valid recipients
   * based on filterByPositionDispo (only bawahan allowed)
   * 
   * @throws ForbiddenException if any penerima is not a valid recipient
   */
  private validateRecipients(
    barisData: PositionData[],
    pengirimPositionId: number,
    penerimaPositionIds: number[],
  ): void {
    // Get valid recipients for this sender
    const validRecipients = this.filterByPositionDispo(barisData, pengirimPositionId);
    const validPositionIds = new Set(validRecipients.map((r) => Number(r.position)));

    // Check each penerima
    const invalidRecipients: number[] = [];
    for (const penerimaId of penerimaPositionIds) {
      if (!validPositionIds.has(Number(penerimaId))) {
        invalidRecipients.push(penerimaId);
      }
    }

    if (invalidRecipients.length > 0) {
      throw new ForbiddenException(
        `Penerima dengan position_id [${invalidRecipients.join(', ')}] tidak valid. ` +
        `Disposisi hanya bisa dikirim ke bawahan langsung/tidak langsung dalam struktur organisasi yang sama.`,
      );
    }
  }

  // ============================================================
  // SEND MESSAGE METHODS
  // ============================================================

  /**
   * Check if a position is managerial by checking if it exists in om_relation_osc
   * Position in om_relation_osc = Managerial
   */
  async checkIsManagerial(position: number): Promise<boolean> {
    const oscRecord = await this.relationOscRepository.findOne({
      where: {
        relation_position: position,
        company: COMPANY_ID,
        startDate: LessThanOrEqual(TODAY),
        endDate: MoreThanOrEqual(TODAY),
      },
    });

    return !!oscRecord;
  }

  /**
   * Get complete user info for sirkulasi (position, organization, area, sub_area, name)
   */
  async getUserCompleteInfo(persnum: number): Promise<{
    persnum: number;
    nama: string;
    position: number;
    positionText: string;
    organization: number;
    organizationText: string;
    company: number;
    area: string;
    areaText: string;
    subArea: number;
    subAreaText: string;
  } | null> {
    try {
      // Get person
      const person = await this.personRepository.findOne({
        where: { persnum },
      });
      if (!person) return null;

      // Get position from om_relation_sp
      const relationSp = await this.relationSpRepository.findOne({
        where: {
          relation_persnum: persnum,
          company: COMPANY_ID,
          startDate: LessThanOrEqual(TODAY),
          endDate: MoreThanOrEqual(TODAY),
        },
      });
      if (!relationSp || !relationSp.position) return null;

      // Get organization from om_relation_osc
      const relationOsc = await this.relationOscRepository.findOne({
        where: {
          relation_position: relationSp.position,
          company: COMPANY_ID,
          startDate: LessThanOrEqual(TODAY),
          endDate: MoreThanOrEqual(TODAY),
        },
      });
      if (!relationOsc || !relationOsc.organization) return null;

      // Get sub_area from om_relation_oa
      const relationOa = await this.relationOaRepository.findOne({
        where: {
          organization: relationOsc.organization,
          company: COMPANY_ID,
          startDate: LessThanOrEqual(TODAY),
          endDate: MoreThanOrEqual(TODAY),
        },
      });
      if (!relationOa || !relationOa.relation_sub_area) return null;

      // Get area from om_area_sub
      const areaSub = await this.areaSubRepository.findOne({
        where: {
          sub_area: relationOa.relation_sub_area,
          company: COMPANY_ID,
          startDate: LessThanOrEqual(TODAY),
          endDate: MoreThanOrEqual(TODAY),
        },
      });
      if (!areaSub || !areaSub.area) return null;

      // Get position text
      const positionEntity = await this.positionRepository.findOne({
        where: { position: relationSp.position },
      });

      return {
        persnum: person.persnum!,
        nama: person.name || '',
        position: relationSp.position,
        positionText: positionEntity?.shortText || '',
        organization: relationOsc.organization,
        organizationText: relationOsc.organization_text || '',
        company: COMPANY_ID,
        area: areaSub.area,
        areaText: areaSub.shortText || '',
        subArea: relationOa.relation_sub_area,
        subAreaText: areaSub.shortText || '',
      };
    } catch {
      return null;
    }
  }

  /**
   * Convert PositionData to DisposisiSirkulasiInfoDto
   */
  private toSirkulasiInfo(pos: PositionData): DisposisiSirkulasiInfoDto {
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
   * Main method: Send Disposisi
   * 
   * Alur penyimpanan sesuai relasi tabel:
   * ┌─────────────────────────────────────────────────────────────────────┐
   * │ TABEL NASKAH                                                        │
   * │ - id: UUID                                                          │
   * │ - jenis: 'DI'                                                       │
   * │ - klasifikasi: NULL (tidak dipakai untuk DI)                        │
   * │ - klasifikasi_text: NULL (tidak dipakai untuk DI)                   │
   * │ - sifat: dari dto.sifat                                             │
   * │ - nomor: dari dto.ref_nomor_surat                                   │
   * │ - tanggal: dari dto.tanggal_disposisi                               │
   * │ - perihal: dari dto.ref_perihal_surat                               │
   * │ - konten: JSON petunjuk disposisi yang dipilih                      │
   * │ - lampiran: jumlah file (e.g. "3 file")                             │
   * │ - status: 'draf' atau 'final'                                       │
   * ├─────────────────────────────────────────────────────────────────────┤
   * │ TABEL NASKAH_SIRKULASI (per pengirim & penerima)                    │
   * │ - id_naskah: FK ke naskah.id                                        │
   * │ - sirkuler: 'pengirim' / 'penerima'                                 │
   * │ - company, area, sub_area, organization, position + text            │
   * │ - position_status: 'ybs'                                            │
   * │ - id_sirkuler: persnum                                              │
   * │ - nama_sirkuler: nama orang                                         │
   * ├─────────────────────────────────────────────────────────────────────┤
   * │ TABEL NASKAH_LAMPIRAN (per file)                                    │
   * │ - id_naskah: FK ke naskah.id                                        │
   * │ - file_name: nama file                                              │
   * │ - file_pdf: URL file                                                │
   * │ - jenis: 'DI'                                                       │
   * └─────────────────────────────────────────────────────────────────────┘
   */
  async sendMessage(dto: CreateDisposisiDto): Promise<SendDisposisiResponseDto> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Get cached position data
      const barisData = await this.getPositionData();

      // PHASE 1: Validate pengirim (must be managerial)
      const pengirimData = this.findByPosition(barisData, dto.pengirim_position_id);
      if (!pengirimData) {
        throw new NotFoundException(
          `Pengirim dengan position_id ${dto.pengirim_position_id} tidak ditemukan`,
        );
      }

      // Check if pengirim is managerial (chief = 1)
      if (pengirimData.chief !== 1) {
        throw new ForbiddenException(
          `Hanya managerial yang bisa kirim Disposisi. Position ${dto.pengirim_position_id} bukan managerial.`,
        );
      }

      // Check barrier depth (level 0-2 can send, level 3+ cannot)
      const senderLevel = Number(pengirimData.level);
      const barrierDepth = 3 - senderLevel;
      if (barrierDepth <= 0) {
        throw new ForbiddenException(
          `Position level ${senderLevel} tidak bisa mengirim Disposisi. Hanya level 0-2 yang bisa mengirim.`,
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

      // Validate recipients: hanya bawahan yang valid (dari get-recipient)
      this.validateRecipients(barisData, dto.pengirim_position_id, dto.penerima_position_ids);

      // PHASE 3: Auto-generate nomor surat untuk disposisi pertama
      const naskahId = uuidv4();
      const tanggalDisposisi = new Date(dto.tanggal_disposisi);

      // Generate nomor surat otomatis
      // Format: {NO_URUT}/{JABATAN}/{LOKASI}/{BULAN}/{TAHUN}
      // Contoh: 001/P/00/XII/2025
      const generatedNomor = await this.nomorSuratService.generateNomor({
        jenis: 'DI',
        positionText: pengirimData.position_text,
        areaText: pengirimData.area_text || 'Pusat',
        tanggal: tanggalDisposisi,
      });

      // Insert ke tabel NASKAH
      // nomor: auto-generated
      const naskah = this.naskahRepository.create({
        id: naskahId,
        jenis: 'DI',
        // klasifikasi & klasifikasi_text = NULL untuk DI (tidak ada di form)
        sifat: dto.sifat,
        nomor: generatedNomor.nomor, // Nomor otomatis ter-generate
        tanggal: tanggalDisposisi,
        perihal: dto.perihal, // Perihal masuk ke tabel naskah
        konten: dto.disposisi || undefined, // Simpan disposisi ke kolom konten juga
        status: 'final',
        lampiran: dto.lampiran?.length ? `${dto.lampiran.length} file` : undefined,
      });

      await queryRunner.manager.save(naskah);

      // PHASE 4: Insert ke tabel NASKAH_REFERENSI (HANYA jika disposisi lanjutan)
      // Disposisi pertama: TIDAK insert ke naskah_referensi
      // Disposisi lanjutan: Insert dengan referensi ke naskah yang diterima sebelumnya
      if (dto.id_naskah_sebelumnya) {
        // Ambil data naskah sebelumnya untuk referensi
        const naskahSebelumnya = await this.naskahRepository.findOne({
          where: { id: dto.id_naskah_sebelumnya },
        });

        if (naskahSebelumnya) {
          const naskahReferensi = new NaskahReferensiEntity();
          naskahReferensi.id = uuidv4();
          naskahReferensi.id_naskah = naskahId;
          naskahReferensi.ref_jenis = naskahSebelumnya.jenis || 'DI';
          naskahReferensi.ref_pengirim = null; // Bisa diisi dari sirkulasi pengirim sebelumnya jika perlu
          naskahReferensi.ref_tanggal = naskahSebelumnya.tanggal || null;
          naskahReferensi.ref_nomor = naskahSebelumnya.nomor || null; // ref_nomor dari naskah sebelumnya
          naskahReferensi.ref_perihal = naskahSebelumnya.perihal || null;
          await queryRunner.manager.save(naskahReferensi);
        }
      }
      // Jika disposisi pertama (tanpa id_naskah_sebelumnya), TIDAK ada insert ke naskah_referensi

      // PHASE 5: Insert ke tabel NASKAH_SIRKULASI - pengirim
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
        isDraft: false, // sendMessage = bukan draft
      });
      await queryRunner.manager.save(pengirimSirkulasi);

      // PHASE 6: Insert ke tabel NASKAH_SIRKULASI - penerima (per recipient)
      const penerimaResponses: DisposisiSirkulasiInfoDto[] = [];
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
          isDraft: false, // sendMessage = bukan draft
        });
        await queryRunner.manager.save(penerimaSirkulasi);

        penerimaResponses.push(this.toSirkulasiInfo(penerima));
      }

      // PHASE 6: Insert ke tabel NASKAH_LAMPIRAN (per file)
      const lampiranResponses: Array<{
        id: string;
        nama_file: string;
        url: string;
        tipe?: string;
      }> = [];

      if (dto.lampiran && dto.lampiran.length > 0) {
        for (const lamp of dto.lampiran) {
          const lampiranId = uuidv4();
          const lampiran = this.naskahLampiranRepository.create({
            id: lampiranId,
            id_naskah: naskahId,
            file_name: lamp.nama_file,
            file_pdf: lamp.url,
            jenis: 'DI',
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

      // PHASE 7: Insert ke tabel DI (konten lengkap lembar disposisi)
      // Build kepada_yth dari penerima
      const kepadaYthList = penerimaDataList.map(
        (p) => `${p.position_text} - ${p.organization_text}`,
      );
      const kepadaYth = kepadaYthList.join('; ');

      const diEntity = this.diRepository.create({
        id: uuidv4(),
        idNaskah: naskahId,
        kopLogo: dto.kop_logo ?? null,
        kopJudul: dto.kop_judul ?? 'LEMBAR DISPOSISI',
        namaJabatan: dto.nama_jabatan ?? pengirimData.position_text,
        nomorAgenda: dto.nomor_agenda ?? null,
        tanggalAgenda: dto.tanggal_agenda ? new Date(dto.tanggal_agenda) : null,
        suratDari: dto.surat_dari ?? null,
        tanggal: tanggalDisposisi,
        nomor: generatedNomor.nomor, // Nomor otomatis
        perihal: dto.perihal,
        klasifikasi: dto.klasifikasi ?? null,
        kepadaYth: kepadaYth,
        disposisi: dto.disposisi ?? null, // Langsung dari FE (checkbox yang diformat)
        catatan: dto.catatan ?? null, // Untuk checkbox "Lainnya"
        paraf: dto.paraf ?? null,
      });
      await queryRunner.manager.save(diEntity);

      // Commit transaction
      await queryRunner.commitTransaction();

      // Build response
      return {
        success: true,
        message: 'Disposisi berhasil dikirim',
        data: {
          id: naskahId,
          jenis: 'DI',
          tanggal: dto.tanggal_disposisi,
          status: 'final',
          sifat: dto.sifat,
          ref_nomor_surat: generatedNomor.nomor, // Nomor otomatis yang di-generate
          perihal: dto.perihal,
          pengirim: this.toSirkulasiInfo(pengirimData),
          penerima: penerimaResponses,
          disposisi: dto.disposisi,
          catatan: dto.catatan,
          lampiran: lampiranResponses.length > 0 ? lampiranResponses : undefined,
          id_naskah_sebelumnya: dto.id_naskah_sebelumnya || null,
        },
      };
    } catch (error) {
      // Rollback on error
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Save Draft - Menyimpan Disposisi sebagai draft
   * 
   * Method ini memiliki logic yang sama dengan sendMessage,
   * tetapi dengan status 'draf' sebagai default dan
   * tidak ada validasi managerial/level.
   * 
   * @param dto - CreateDisposisiDto
   * @returns Promise<SendDisposisiResponseDto>
   */
  async saveDraft(dto: CreateDisposisiDto): Promise<SendDisposisiResponseDto> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Get cached position data
      const barisData = await this.getPositionData();

      // PHASE 1: Validate pengirim (no managerial check for draft)
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

      // Validate recipients: hanya bawahan yang valid (dari get-recipient)
      this.validateRecipients(barisData, dto.pengirim_position_id, dto.penerima_position_ids);

      // PHASE 3: Insert naskah with status 'draf'
      const naskahId = uuidv4();
      const tanggalDisposisi = new Date(dto.tanggal_disposisi);

      // Insert ke tabel NASKAH with status 'draf'
      // perihal dari dto.perihal (bukan ref_perihal_surat)
      const naskah = this.naskahRepository.create({
        id: naskahId,
        jenis: 'DI',
        sifat: dto.sifat,
        nomor: dto.ref_nomor_surat || undefined, // Opsional untuk disposisi pertama
        tanggal: tanggalDisposisi,
        perihal: dto.perihal, // Perihal masuk ke tabel naskah
        konten: dto.disposisi || undefined, // Simpan disposisi ke kolom konten juga
        status: 'draf',
        lampiran: dto.lampiran?.length ? `${dto.lampiran.length} file` : undefined,
      });

      await queryRunner.manager.save(naskah);

      // PHASE 4: Insert ke tabel NASKAH_REFERENSI (HANYA jika disposisi lanjutan)
      // Disposisi pertama: TIDAK insert ke naskah_referensi
      // Disposisi lanjutan: Insert dengan referensi ke naskah yang diterima sebelumnya
      if (dto.id_naskah_sebelumnya) {
        // Ambil data naskah sebelumnya untuk referensi
        const naskahSebelumnya = await this.naskahRepository.findOne({
          where: { id: dto.id_naskah_sebelumnya },
        });

        if (naskahSebelumnya) {
          const naskahReferensi = new NaskahReferensiEntity();
          naskahReferensi.id = uuidv4();
          naskahReferensi.id_naskah = naskahId;
          naskahReferensi.ref_jenis = naskahSebelumnya.jenis || 'DI';
          naskahReferensi.ref_pengirim = null;
          naskahReferensi.ref_tanggal = naskahSebelumnya.tanggal || null;
          naskahReferensi.ref_nomor = naskahSebelumnya.nomor || null;
          naskahReferensi.ref_perihal = naskahSebelumnya.perihal || null;
          await queryRunner.manager.save(naskahReferensi);
        }
      }
      // Jika disposisi pertama (tanpa id_naskah_sebelumnya), TIDAK ada insert ke naskah_referensi

      // PHASE 5: Insert ke tabel NASKAH_SIRKULASI - pengirim (dengan isDraft = true)
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
        isDraft: true, // saveDraft = draft
      });
      await queryRunner.manager.save(pengirimSirkulasi);

      // PHASE 6: Insert ke tabel NASKAH_SIRKULASI - penerima (dengan isDraft = true)
      const penerimaResponses: DisposisiSirkulasiInfoDto[] = [];
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
          isDraft: true, // saveDraft = draft
        });
        await queryRunner.manager.save(penerimaSirkulasi);

        penerimaResponses.push(this.toSirkulasiInfo(penerima));
      }

      // PHASE 7: Insert ke tabel NASKAH_LAMPIRAN
      const lampiranResponses: Array<{
        id: string;
        nama_file: string;
        url: string;
        tipe?: string;
      }> = [];

      if (dto.lampiran && dto.lampiran.length > 0) {
        for (const lamp of dto.lampiran) {
          const lampiranId = uuidv4();
          const lampiran = this.naskahLampiranRepository.create({
            id: lampiranId,
            id_naskah: naskahId,
            file_name: lamp.nama_file,
            file_pdf: lamp.url,
            jenis: 'DI',
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

      // PHASE 8: Insert ke tabel DI (konten lengkap lembar disposisi)
      // Build kepada_yth dari penerima
      const kepadaYthList = penerimaDataList.map(
        (p) => `${p.position_text} - ${p.organization_text}`,
      );
      const kepadaYth = kepadaYthList.join('; ');

      const diEntity = this.diRepository.create({
        id: uuidv4(),
        idNaskah: naskahId,
        kopLogo: dto.kop_logo ?? null,
        kopJudul: dto.kop_judul ?? 'LEMBAR DISPOSISI',
        namaJabatan: dto.nama_jabatan ?? pengirimData.position_text,
        nomorAgenda: dto.nomor_agenda ?? null,
        tanggalAgenda: dto.tanggal_agenda ? new Date(dto.tanggal_agenda) : null,
        suratDari: dto.surat_dari ?? null,
        tanggal: tanggalDisposisi,
        nomor: dto.ref_nomor_surat ?? null,
        perihal: dto.perihal,
        klasifikasi: dto.klasifikasi ?? null,
        kepadaYth: kepadaYth,
        disposisi: dto.disposisi ?? null, // Langsung dari FE (checkbox yang diformat)
        catatan: dto.catatan ?? null, // Untuk checkbox "Lainnya"
        paraf: dto.paraf ?? null,
      });
      await queryRunner.manager.save(diEntity);

      // Commit transaction
      await queryRunner.commitTransaction();

      // Build response
      return {
        success: true,
        message: 'Disposisi berhasil disimpan sebagai draft',
        data: {
          id: naskahId,
          jenis: 'DI',
          tanggal: dto.tanggal_disposisi,
          status: 'draf',
          sifat: dto.sifat,
          ref_nomor_surat: dto.ref_nomor_surat || null,
          perihal: dto.perihal,
          pengirim: this.toSirkulasiInfo(pengirimData),
          penerima: penerimaResponses,
          disposisi: dto.disposisi,
          catatan: dto.catatan,
          lampiran: lampiranResponses.length > 0 ? lampiranResponses : undefined,
          id_naskah_sebelumnya: dto.id_naskah_sebelumnya || null,
        },
      };
    } catch (error) {
      // Rollback on error
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Get Send Message - Mendapatkan semua pesan DI yang sudah dikirimkan oleh user
   * 
   * @param positionId - Position ID pengirim
   * @returns GetSendMessageResponseDto
   * 
   * Query:
   * 1. Cari di naskah_sirkulasi dimana sirkuler='pengirim' dan position=positionId
   * 2. Join ke naskah untuk dapat detail naskah
   * 3. Join ke naskah_sirkulasi lagi untuk dapat penerima (sirkuler='penerima')
   * 4. Join ke naskah_lampiran untuk hitung jumlah lampiran
   */
  async getSendMessage(positionId: number): Promise<GetSendMessageResponseDto> {
    // Validate position exists
    const barisData = await this.getPositionData();
    const senderData = this.findByPosition(barisData, positionId);
    if (!senderData) {
      throw new NotFoundException(
        `Position dengan ID ${positionId} tidak ditemukan`,
      );
    }

    // Query naskah yang dikirim oleh position ini
    // Step 1: Get all naskah IDs where this position is pengirim
    const pengirimSirkulasi = await this.naskahSirkulasiRepository.find({
      where: {
        position: String(positionId),
        sirkuler: 'pengirim',
      },
    });

    if (pengirimSirkulasi.length === 0) {
      return {
        success: true,
        message: 'Tidak ada pesan yang dikirim',
        total: 0,
        data: [],
      };
    }

    // Get naskah IDs
    const naskahIds = pengirimSirkulasi
      .map((s) => s.idNaskah)
      .filter((id) => id !== null);

    // Step 2: Get naskah details for DI type only
    const naskahList = await this.naskahRepository
      .createQueryBuilder('n')
      .where('n.id IN (:...ids)', { ids: naskahIds })
      .andWhere('n.jenis = :jenis', { jenis: 'DI' })
      .orderBy('n.tanggal', 'DESC')
      .getMany();

    if (naskahList.length === 0) {
      return {
        success: true,
        message: 'Tidak ada pesan Disposisi yang dikirim',
        total: 0,
        data: [],
      };
    }

    // Step 3: Build response data
    const result: SentMessageItemDto[] = [];

    for (const naskah of naskahList) {
      // Get pengirim info
      const pengirimInfo = pengirimSirkulasi.find(
        (s) => s.idNaskah === naskah.id,
      );

      // Get penerima list
      const penerimaList = await this.naskahSirkulasiRepository.find({
        where: {
          idNaskah: naskah.id,
          sirkuler: 'penerima',
        },
      });

      // Get lampiran count
      const lampiranCount = await this.naskahLampiranRepository.count({
        where: {
          id_naskah: naskah.id,
        },
      });

      // Parse petunjuk_disposisi from konten
      let petunjukDisposisi: any[] = [];
      if (naskah.konten) {
        try {
          petunjukDisposisi = JSON.parse(naskah.konten);
        } catch {
          petunjukDisposisi = [];
        }
      }

      // Build pengirim info
      const pengirim = {
        position_id: pengirimInfo?.position || '',
        position_text: pengirimInfo?.positionText || '',
        organization_text: pengirimInfo?.organizationText || '',
        nama: pengirimInfo?.namaSirkuler || null,
      };

      // Build penerima list
      const penerima = penerimaList.map((p) => ({
        position_id: p.position || '',
        position_text: p.positionText || '',
        organization_text: p.organizationText || '',
        nama: p.namaSirkuler || null,
      }));

      result.push({
        id: naskah.id,
        jenis: naskah.jenis,
        nomor: naskah.nomor, // ref_nomor_surat
        perihal: naskah.perihal, // ref_perihal_surat
        tanggal: naskah.tanggal,
        sifat: naskah.sifat,
        status: naskah.status,
        pengirim,
        penerima,
        petunjuk_disposisi:
          petunjukDisposisi.length > 0 ? petunjukDisposisi : undefined,
        jumlah_lampiran: lampiranCount,
      });
    }

    return {
      success: true,
      message: 'Berhasil mendapatkan daftar pesan yang dikirim',
      total: result.length,
      data: result,
    };
  }

  /**
   * Update Message Status - Update status pesan menjadi terbaca
   * 
   * Kondisi: Ketika user berhasil mengirimkan pesan namun penerima belum membaca
   * 
   * Deskripsi: Untuk update status pesan menjadi terbaca atau tidak.
   * - Default nota saat dikirimkan adalah tidak (send_read_time = NULL)
   * - Jika penerima membuka pesan maka otomatis status sudah terupdate
   * 
   * Update field di naskah_sirkulasi:
   * - send_read_time: waktu baca
   * - send_read_user: user yang membaca
   * 
   * @param dto - UpdateMessageStatusDto
   * @returns UpdateMessageStatusResponseDto
   */
  async updateMessageStatus(
    dto: UpdateMessageStatusDto,
  ): Promise<UpdateMessageStatusResponseDto> {
    // Find sirkulasi record for this naskah + position (penerima)
    const sirkulasi = await this.naskahSirkulasiRepository.findOne({
      where: {
        idNaskah: dto.id_naskah,
        position: dto.position_id,
        sirkuler: 'penerima',
      },
    });

    if (!sirkulasi) {
      throw new NotFoundException(
        `Pesan dengan id_naskah ${dto.id_naskah} untuk position ${dto.position_id} tidak ditemukan`,
      );
    }

    // Check if already read
    if (sirkulasi.sendReadTime) {
      return {
        success: true,
        message: 'Pesan sudah terbaca sebelumnya',
        data: {
          id_naskah: dto.id_naskah,
          position_id: dto.position_id,
          status_baca: 'terbaca',
          read_time: sirkulasi.sendReadTime,
          read_user: sirkulasi.sendReadUser,
        },
      };
    }

    // Update status to read
    const now = new Date();
    sirkulasi.sendReadTime = now;
    sirkulasi.sendReadUser = dto.user_id || dto.position_id;

    await this.naskahSirkulasiRepository.save(sirkulasi);

    return {
      success: true,
      message: 'Status pesan berhasil diupdate menjadi terbaca',
      data: {
        id_naskah: dto.id_naskah,
        position_id: dto.position_id,
        status_baca: 'terbaca',
        read_time: now,
        read_user: sirkulasi.sendReadUser,
      },
    };
  }

  // ============================================================
  // UPDATE DRAFT DISPOSISI
  // ============================================================

  /**
   * Update disposisi yang masih berstatus draft
   *
   * Flow:
   * 1. Validasi naskah exists dan status = 'draf'
   * 2. Validasi pengirim adalah owner dari naskah
   * 3. Update naskah (tanggal, sifat, konten/petunjuk)
   * 4. Update naskah_referensi (ref_nomor, ref_perihal)
   * 5. Update naskah_sirkulasi penerima (hapus lama, insert baru)
   * 6. Update naskah_lampiran (hapus lama, insert baru)
   * 7. Jika action = 'kirim', ubah status jadi 'final'
   * 
   * @param naskahId - ID Naskah dari path parameter
   * @param dto - UpdateDraftDisposisiDto
   */
  async updateDraft(
    naskahId: string,
    dto: UpdateDraftDisposisiDto,
  ): Promise<UpdateDraftDisposisiResponseDto> {
    // PHASE 1: Validasi naskah exists dan status draft
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

    if (naskah.jenis !== 'DI') {
      throw new ForbiddenException(
        `Naskah ini bukan disposisi (jenis: ${naskah.jenis}). API ini hanya untuk update disposisi.`,
      );
    }

    // PHASE 2: Validasi pengirim adalah owner naskah
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

    // Get org data untuk validasi penerima baru
    const barisData = await this.getPositionData();

    // Determine if this is a draft or final
    const isDraft = dto.action !== 'kirim';

    // Start transaction
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // PHASE 3: Update tabel naskah

      if (dto.tanggal_disposisi) {
        naskah.tanggal = new Date(dto.tanggal_disposisi);
      }
      if (dto.sifat) {
        naskah.sifat = dto.sifat;
      }
      if (dto.disposisi) {
        naskah.konten = dto.disposisi; // Simpan disposisi ke kolom konten
      }
      if (dto.lampiran) {
        naskah.lampiran = dto.lampiran.length > 0 ? `${dto.lampiran.length} file` : '';
      }
      if (dto.perihal) {
        naskah.perihal = dto.perihal; // Perihal masuk ke naskah
      }
      
      // Auto-generate nomor surat saat sendDraft (action='kirim')
      if (!isDraft) {
        // Generate nomor otomatis saat kirim
        const generatedNomor = await this.nomorSuratService.generateNomor({
          jenis: 'DI',
          positionText: pengirimSirkulasi.positionText || '',
          areaText: pengirimSirkulasi.areaText || 'Pusat',
          tanggal: naskah.tanggal || new Date(),
        });
        naskah.nomor = generatedNomor.nomor;
      } else if (dto.ref_nomor_surat) {
        // Untuk draft, gunakan nomor yang diberikan (jika ada)
        naskah.nomor = dto.ref_nomor_surat;
      }
      naskah.status = isDraft ? 'draf' : 'final';

      await queryRunner.manager.save(naskah);

      // PHASE 4: Update naskah_referensi (HANYA jika ada id_naskah_sebelumnya baru)
      // Jika user menambahkan referensi ke naskah sebelumnya
      if (dto.id_naskah_sebelumnya) {
        // Cek apakah sudah ada referensi
        const existingRef = await this.naskahReferensiRepository.findOne({
          where: { id_naskah: naskahId },
        });

        if (!existingRef) {
          // Insert referensi baru
          const naskahSebelumnya = await this.naskahRepository.findOne({
            where: { id: dto.id_naskah_sebelumnya },
          });

          if (naskahSebelumnya) {
            const naskahReferensi = new NaskahReferensiEntity();
            naskahReferensi.id = uuidv4();
            naskahReferensi.id_naskah = naskahId;
            naskahReferensi.ref_jenis = naskahSebelumnya.jenis || 'DI';
            naskahReferensi.ref_pengirim = null;
            naskahReferensi.ref_tanggal = naskahSebelumnya.tanggal || null;
            naskahReferensi.ref_nomor = naskahSebelumnya.nomor || null;
            naskahReferensi.ref_perihal = naskahSebelumnya.perihal || null;
            await queryRunner.manager.save(naskahReferensi);
          }
        }
      }

      // PHASE 5: Update penerima (jika ada perubahan)
      if (dto.penerima_position_ids && dto.penerima_position_ids.length > 0) {
        // Validate recipients: hanya bawahan yang valid (dari get-recipient)
        this.validateRecipients(barisData, dto.pengirim_position_id, dto.penerima_position_ids);

        // Validasi semua penerima baru
        const penerimaDataList: PositionData[] = [];
        for (const penerimaId of dto.penerima_position_ids) {
          const penerimaData = this.findByPosition(barisData, penerimaId);
          if (!penerimaData) {
            throw new NotFoundException(
              `Penerima dengan position_id ${penerimaId} tidak ditemukan dalam org data`,
            );
          }
          penerimaDataList.push(penerimaData);
        }

        // Hapus penerima lama
        await queryRunner.manager.delete(NaskahSirkulasi, {
          idNaskah: naskahId,
          sirkuler: 'penerima',
        });

        // Insert penerima baru dengan isDraft berdasarkan action
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
            isDraft: isDraft, // isDraft based on action
          });
          await queryRunner.manager.save(penerimaSirkulasi);
        }
      }

      // Update isDraft pada sirkulasi pengirim jika action = kirim
      if (!isDraft) {
        await queryRunner.manager.update(
          NaskahSirkulasi,
          { idNaskah: naskahId, sirkuler: 'pengirim' },
          { isDraft: false },
        );
        
        // Jika penerima tidak diupdate, update isDraft pada penerima yang sudah ada
        if (!dto.penerima_position_ids || dto.penerima_position_ids.length === 0) {
          await queryRunner.manager.update(
            NaskahSirkulasi,
            { idNaskah: naskahId, sirkuler: 'penerima' },
            { isDraft: false },
          );
        }
      }

      // PHASE 6: Update lampiran (jika ada perubahan)
      if (dto.lampiran) {
        // Hapus lampiran lama
        await queryRunner.manager.delete(NaskahLampiranEntity, {
          id_naskah: naskahId,
        });

        // Insert lampiran baru
        for (const lamp of dto.lampiran) {
          const lampiran = new NaskahLampiranEntity();
          lampiran.id = uuidv4();
          lampiran.id_naskah = naskahId;
          lampiran.file_name = lamp.nama_file;
          lampiran.file_pdf = lamp.url;
          lampiran.jenis = 'DI';
          await queryRunner.manager.save(lampiran);
        }
      }

      // PHASE 7: Update tabel "di" (jika ada perubahan field konten)
      const hasDiFields =
        dto.kop_logo !== undefined ||
        dto.kop_judul !== undefined ||
        dto.nama_jabatan !== undefined ||
        dto.nomor_agenda !== undefined ||
        dto.tanggal_agenda !== undefined ||
        dto.surat_dari !== undefined ||
        dto.klasifikasi !== undefined ||
        dto.disposisi !== undefined ||
        dto.catatan !== undefined ||
        dto.paraf !== undefined;

      if (hasDiFields) {
        // Cek apakah sudah ada data di tabel "di"
        const existingDi = await this.diRepository.findOne({
          where: { idNaskah: naskahId },
        });

        if (existingDi) {
          // Update data yang ada
          if (dto.kop_logo !== undefined) existingDi.kopLogo = dto.kop_logo;
          if (dto.kop_judul !== undefined) existingDi.kopJudul = dto.kop_judul;
          if (dto.nama_jabatan !== undefined) existingDi.namaJabatan = dto.nama_jabatan;
          if (dto.nomor_agenda !== undefined) existingDi.nomorAgenda = dto.nomor_agenda;
          if (dto.tanggal_agenda !== undefined) existingDi.tanggalAgenda = new Date(dto.tanggal_agenda);
          if (dto.surat_dari !== undefined) existingDi.suratDari = dto.surat_dari;
          if (dto.klasifikasi !== undefined) existingDi.klasifikasi = dto.klasifikasi;
          if (dto.disposisi !== undefined) existingDi.disposisi = dto.disposisi;
          if (dto.catatan !== undefined) existingDi.catatan = dto.catatan;
          if (dto.paraf !== undefined) existingDi.paraf = dto.paraf;

          // Update juga dari dto lainnya jika ada
          if (dto.tanggal_disposisi) existingDi.tanggal = new Date(dto.tanggal_disposisi);
          if (dto.ref_nomor_surat) existingDi.nomor = dto.ref_nomor_surat;
          if (dto.perihal) existingDi.perihal = dto.perihal;

          await queryRunner.manager.save(existingDi);
        } else {
          // Insert data baru
          const diEntity = this.diRepository.create({
            idNaskah: naskahId,
            kopLogo: dto.kop_logo || '',
            kopJudul: dto.kop_judul || '',
            namaJabatan: dto.nama_jabatan || '',
            nomorAgenda: dto.nomor_agenda || '',
            tanggalAgenda: dto.tanggal_agenda ? new Date(dto.tanggal_agenda) : null,
            suratDari: dto.surat_dari || '',
            tanggal: dto.tanggal_disposisi ? new Date(dto.tanggal_disposisi) : naskah.tanggal || null,
            nomor: dto.ref_nomor_surat || '',
            perihal: dto.perihal || '',
            klasifikasi: dto.klasifikasi || '',
            kepadaYth: '', // Will be filled from penerima
            disposisi: dto.disposisi || '',
            catatan: dto.catatan || '',
            paraf: dto.paraf || '',
          });
          await queryRunner.manager.save(diEntity);
        }
      }

      // Commit transaction
      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }

    // Get updated data for response (like ND finalizeDraft)
    const updatedNaskah = await this.naskahRepository.findOne({
      where: { id: naskahId },
    });

    const allSirkulasi = await this.naskahSirkulasiRepository.find({
      where: { idNaskah: naskahId },
    });

    const pengirimDataResult = allSirkulasi.find((s) => s.sirkuler === 'pengirim');
    const penerimaDataResult = allSirkulasi.filter((s) => s.sirkuler === 'penerima');

    // Get lampiran
    const lampiranData = await this.naskahLampiranRepository.find({
      where: { id_naskah: naskahId },
    });

    // Get naskah_referensi
    const naskahRef = await this.naskahReferensiRepository.findOne({
      where: { id_naskah: naskahId },
    });

    // Get DI detail for disposisi & catatan
    const diData = await this.diRepository.findOne({
      where: { idNaskah: naskahId },
    });

    let tanggalStr = '';
    if (updatedNaskah?.tanggal) {
      if (updatedNaskah.tanggal instanceof Date) {
        tanggalStr = updatedNaskah.tanggal.toISOString().split('T')[0];
      } else {
        tanggalStr = String(updatedNaskah.tanggal).split('T')[0];
      }
    }

    // Helper function to convert sirkulasi to response format
    const sirkulasiToResponse = (s: NaskahSirkulasi | undefined) => {
      if (!s) {
        return {
          position_id: 0,
          position_text: '',
          persnum: null,
          nama: null,
          organization_id: 0,
          organization_text: '',
          sub_area: null,
          sub_area_text: null,
          area: null,
          area_text: null,
          company: 10000,
          company_name: 'PERUM LPPNPI',
        };
      }
      return {
        position_id: parseInt(s.position || '0', 10),
        position_text: s.positionText || '',
        persnum: s.idSirkuler ? parseInt(s.idSirkuler, 10) : null,
        nama: s.namaSirkuler || null,
        organization_id: parseInt(s.organization || '0', 10),
        organization_text: s.organizationText || '',
        sub_area: s.subArea ? parseInt(s.subArea, 10) : null,
        sub_area_text: s.subAreaText || null,
        area: s.area || null,
        area_text: s.areaText || null,
        company: 10000,
        company_name: 'PERUM LPPNPI',
      };
    };

    return {
      success: true,
      message: isDraft
        ? 'Draft disposisi berhasil diupdate'
        : 'Disposisi berhasil diupdate dan dikirim',
      data: {
        id: naskahId,
        jenis: 'DI',
        nomor: updatedNaskah?.nomor || null,
        tanggal: tanggalStr,
        status: isDraft ? ('draf' as const) : ('final' as const),
        sifat: updatedNaskah?.sifat || '',
        perihal: updatedNaskah?.perihal || '',
        pengirim: sirkulasiToResponse(pengirimDataResult),
        penerima: penerimaDataResult.map((s) => sirkulasiToResponse(s)),
        disposisi: diData?.disposisi || undefined,
        catatan: diData?.catatan || undefined,
        lampiran: lampiranData.map((l) => ({
          id: l.id,
          nama_file: l.file_name,
          url: l.file_pdf,
          tipe: 'DI',
        })),
        id_naskah_sebelumnya: naskahRef?.ref_nomor || null, // Using ref_nomor as reference to previous naskah
      },
    };
  }

  // ============================================================
  // SEND DRAFT - Kirim draft (ubah status draf ke final)
  // ============================================================

  /**
   * Send Draft - Kirim disposisi yang masih draft (ubah status menjadi final)
   * Sama seperti updateDraft tapi dengan action = 'kirim' (status final)
   *
   * @param naskahId - ID Naskah yang akan dikirim (dari path param)
   * @param dto - SendDraftDisposisiDto (sama seperti UpdateDraftDisposisiDto tanpa id_naskah dan action)
   * @returns SendDraftDisposisiResponseDto
   */
  async sendDraft(
    naskahId: string,
    dto: SendDraftDisposisiDto,
  ): Promise<SendDraftDisposisiResponseDto> {
    // Konversi ke UpdateDraftDisposisiDto dengan action = 'kirim'
    const updateDto: UpdateDraftDisposisiDto = {
      pengirim_position_id: dto.pengirim_position_id,
      penerima_position_ids: dto.penerima_position_ids,
      tanggal_disposisi: dto.tanggal_disposisi,
      sifat: dto.sifat,
      ref_nomor_surat: dto.ref_nomor_surat,
      perihal: dto.perihal,
      id_naskah_sebelumnya: dto.id_naskah_sebelumnya,
      disposisi: dto.disposisi,
      catatan: dto.catatan,
      lampiran: dto.lampiran,
      action: 'kirim', // Force action = kirim untuk send-draft
      kop_logo: dto.kop_logo,
      kop_judul: dto.kop_judul,
      nama_jabatan: dto.nama_jabatan,
      nomor_agenda: dto.nomor_agenda,
      tanggal_agenda: dto.tanggal_agenda,
      surat_dari: dto.surat_dari,
      klasifikasi: dto.klasifikasi,
      paraf: dto.paraf,
    };

    // Panggil updateDraft dengan naskahId dan action = 'kirim'
    const result = await this.updateDraft(naskahId, updateDto);

    // Return dengan format SendDraftDisposisiResponseDto (same as updateDraft but with final status)
    return {
      success: result.success,
      message: 'Draft disposisi berhasil dikirim',
      data: result.data ? {
        id: result.data.id,
        jenis: result.data.jenis,
        nomor: result.data.nomor || '',
        tanggal: result.data.tanggal,
        status: 'final' as const,
        sifat: result.data.sifat,
        perihal: result.data.perihal,
        pengirim: result.data.pengirim,
        penerima: result.data.penerima,
        disposisi: result.data.disposisi,
        catatan: result.data.catatan,
        lampiran: result.data.lampiran,
        id_naskah_sebelumnya: result.data.id_naskah_sebelumnya,
      } : undefined,
    };
  }

  // ============================================================
  // FORWARD DISPOSISI - Disposisi Lanjutan
  // ============================================================

  /**
   * Forward Disposisi - Meneruskan disposisi yang diterima ke bawahan
   * 
   * Flow:
   * 1. Validasi user adalah penerima dari naskah yang akan di-forward
   * 2. Validasi user adalah managerial (bisa kirim disposisi)
   * 3. Validasi penerima baru adalah bawahan valid
   * 4. Buat naskah baru dengan referensi ke naskah sebelumnya
   * 5. Insert ke naskah_referensi dengan data dari naskah yang diterima
   * 
   * @param dto - ForwardDisposisiDto
   * @returns ForwardDisposisiResponseDto
   */
  async forwardDisposisi(dto: ForwardDisposisiDto): Promise<ForwardDisposisiResponseDto> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // PHASE 1: Validasi naskah yang diterima exists
      const naskahDiterima = await this.naskahRepository.findOne({
        where: { id: dto.id_naskah_diterima },
      });

      if (!naskahDiterima) {
        throw new NotFoundException(
          `Naskah dengan ID ${dto.id_naskah_diterima} tidak ditemukan`,
        );
      }

      if (naskahDiterima.jenis !== 'DI') {
        throw new BadRequestException(
          `Naskah dengan ID ${dto.id_naskah_diterima} bukan disposisi (jenis: ${naskahDiterima.jenis})`,
        );
      }

      // PHASE 2: Validasi pengirim adalah penerima dari naskah sebelumnya
      const sirkulasiPenerima = await this.naskahSirkulasiRepository.findOne({
        where: {
          idNaskah: dto.id_naskah_diterima,
          position: String(dto.pengirim_position_id),
          sirkuler: 'penerima',
        },
      });

      if (!sirkulasiPenerima) {
        throw new ForbiddenException(
          `Position ${dto.pengirim_position_id} bukan penerima dari naskah ${dto.id_naskah_diterima}. ` +
          `Hanya penerima disposisi yang bisa meneruskan disposisi.`,
        );
      }

      // PHASE 3: Get position data dan validasi pengirim adalah managerial
      const barisData = await this.getPositionData();
      const pengirimData = this.findByPosition(barisData, dto.pengirim_position_id);

      if (!pengirimData) {
        throw new NotFoundException(
          `Pengirim dengan position_id ${dto.pengirim_position_id} tidak ditemukan`,
        );
      }

      if (pengirimData.chief !== 1) {
        throw new ForbiddenException(
          `Hanya managerial yang bisa forward Disposisi. Position ${dto.pengirim_position_id} bukan managerial.`,
        );
      }

      // Check barrier depth
      const senderLevel = Number(pengirimData.level);
      const barrierDepth = 3 - senderLevel;
      if (barrierDepth <= 0) {
        throw new ForbiddenException(
          `Position level ${senderLevel} tidak bisa forward Disposisi.`,
        );
      }

      // PHASE 4: Validate all penerima baru
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

      // Validate recipients (hanya bawahan valid)
      this.validateRecipients(barisData, dto.pengirim_position_id, dto.penerima_position_ids);

      // PHASE 5: Auto-generate nomor surat untuk forward disposisi
      const naskahId = uuidv4();
      const tanggalDisposisi = new Date(dto.tanggal_disposisi);
      
      // Generate nomor surat baru untuk disposisi lanjutan
      const generatedNomor = await this.nomorSuratService.generateNomor({
        jenis: 'DI',
        positionText: pengirimData.position_text,
        areaText: pengirimData.area_text || 'Pusat',
        tanggal: tanggalDisposisi,
      });

      // Perihal: gunakan dari dto atau dari naskah sebelumnya
      const perihal = dto.perihal || naskahDiterima.perihal || '';

      const naskah = this.naskahRepository.create({
        id: naskahId,
        jenis: 'DI',
        sifat: dto.sifat,
        nomor: generatedNomor.nomor, // Nomor baru yang di-generate
        tanggal: tanggalDisposisi,
        perihal: perihal,
        konten: dto.disposisi || undefined,
        status: 'final',
        lampiran: dto.lampiran?.length ? `${dto.lampiran.length} file` : undefined,
      });

      await queryRunner.manager.save(naskah);

      // PHASE 6: Insert ke naskah_referensi (referensi ke naskah yang diterima)
      // ref_nomor otomatis dari nomor naskah disposisi sebelumnya
      const naskahReferensi = new NaskahReferensiEntity();
      naskahReferensi.id = uuidv4();
      naskahReferensi.id_naskah = naskahId;
      naskahReferensi.ref_jenis = naskahDiterima.jenis || 'DI';
      naskahReferensi.ref_pengirim = sirkulasiPenerima.namaSirkuler || null; // Pengirim asli
      naskahReferensi.ref_tanggal = naskahDiterima.tanggal || null;
      naskahReferensi.ref_nomor = naskahDiterima.nomor || null; // Nomor dari naskah sebelumnya (auto)
      naskahReferensi.ref_perihal = naskahDiterima.perihal || null;
      await queryRunner.manager.save(naskahReferensi);

      // PHASE 7: Insert sirkulasi pengirim
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

      // PHASE 8: Insert sirkulasi penerima
      const penerimaResponses: DisposisiSirkulasiInfoDto[] = [];
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

      // PHASE 9: Insert lampiran
      const lampiranResponses: Array<{
        id: string;
        nama_file: string;
        url: string;
        tipe?: string;
      }> = [];

      if (dto.lampiran && dto.lampiran.length > 0) {
        for (const lamp of dto.lampiran) {
          const lampiranId = uuidv4();
          const lampiran = this.naskahLampiranRepository.create({
            id: lampiranId,
            id_naskah: naskahId,
            file_name: lamp.nama_file,
            file_pdf: lamp.url,
            jenis: 'DI',
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

      // PHASE 10: Insert ke tabel DI
      const kepadaYthList = penerimaDataList.map(
        (p) => `${p.position_text} - ${p.organization_text}`,
      );
      const kepadaYth = kepadaYthList.join('; ');

      const diEntity = this.diRepository.create({
        id: uuidv4(),
        idNaskah: naskahId,
        kopLogo: dto.kop_logo ?? null,
        kopJudul: dto.kop_judul ?? 'LEMBAR DISPOSISI',
        namaJabatan: dto.nama_jabatan ?? pengirimData.position_text,
        nomorAgenda: dto.nomor_agenda ?? null,
        tanggalAgenda: dto.tanggal_agenda ? new Date(dto.tanggal_agenda) : null,
        suratDari: dto.surat_dari ?? null,
        tanggal: tanggalDisposisi,
        nomor: generatedNomor.nomor, // Nomor baru yang di-generate
        perihal: perihal,
        klasifikasi: dto.klasifikasi ?? null,
        kepadaYth: kepadaYth,
        disposisi: dto.disposisi ?? null,
        catatan: dto.catatan ?? null,
        paraf: dto.paraf ?? null,
      });
      await queryRunner.manager.save(diEntity);

      // Commit transaction
      await queryRunner.commitTransaction();

      // Build response
      return {
        success: true,
        message: 'Disposisi berhasil diteruskan',
        data: {
          id: naskahId,
          jenis: 'DI',
          tanggal: dto.tanggal_disposisi,
          status: 'final',
          sifat: dto.sifat,
          nomor: generatedNomor.nomor, // Nomor baru yang di-generate
          perihal: perihal,
          pengirim: this.toSirkulasiInfo(pengirimData),
          penerima: penerimaResponses,
          disposisi: dto.disposisi,
          catatan: dto.catatan,
          lampiran: lampiranResponses.length > 0 ? lampiranResponses : undefined,
          referensi: {
            id_naskah: dto.id_naskah_diterima,
            nomor: naskahDiterima.nomor, // ref_nomor dari naskah sebelumnya
            perihal: naskahDiterima.perihal,
            tanggal: naskahDiterima.tanggal,
            jenis: naskahDiterima.jenis,
          },
        },
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}
