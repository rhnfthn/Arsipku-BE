import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual, MoreThanOrEqual, DataSource } from 'typeorm';
import { RelationSp } from 'src/relation_sp/entities/relation_sp.entity';
import { RelationOsc } from 'src/relation_osc/entities/relation_osc.entity';
import { RelationOa } from 'src/relation_oa/entities/relation_oa.entity';
import { Person } from 'src/person/entities/person.entity';
import { OmPosition } from 'src/position/entities/om-position.entity';
import { OmAreaSub } from 'src/areasub/entities/om-areasub.entity';
import { NaskahEntity } from '../entity/naskah.entity';
import { NaskahSirkulasi } from '../entity/naskah_sirkulasi.entity';
import { NaskahReferensiEntity } from '../entity/naskah_referensi.entity';
import { NaskahLampiranEntity } from '../entity/naskah_lampiran.entity';
import {
  SdiRecipientResponseDto,
  SdiOrgDataPositionDto,
} from '../dto/surat-dinas-internal/surat-dinas-internal-recipient-response.dto';
import { CreateSuratDinasInternalDto } from '../dto/surat-dinas-internal/create-surat-dinas-internal.dto';
import { SendMessageResponseDto, SirkulasiInfoDto } from '../dto/surat-dinas-internal/send-message-response.dto';
import { GetSendMessageResponseDto, SendMessageItemDto, PenerimaInfoDto } from '../dto/surat-dinas-internal/get-send-message.dto';
import { OrgDataService } from 'src/org_data/org_data.service';
import { v4 as uuidv4 } from 'uuid';

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
    @InjectRepository(OmPosition)
    private readonly positionRepository: Repository<OmPosition>,
    @InjectRepository(OmAreaSub)
    private readonly areaSubRepository: Repository<OmAreaSub>,
    @InjectRepository(NaskahEntity)
    private readonly naskahRepository: Repository<NaskahEntity>,
    @InjectRepository(NaskahSirkulasi)
    private readonly naskahSirkulasiRepository: Repository<NaskahSirkulasi>,
    @InjectRepository(NaskahReferensiEntity)
    private readonly naskahReferensiRepository: Repository<NaskahReferensiEntity>,
    @InjectRepository(NaskahLampiranEntity)
    private readonly naskahLampiranRepository: Repository<NaskahLampiranEntity>,
    private readonly dataSource: DataSource,
    private readonly orgDataService: OrgDataService,
  ) {}

  // ============================================================
  // SEND MESSAGE METHODS
  // ============================================================

  /**
   * Verify user is managerial
   * Check: position exists in om_relation_osc (meaning it's assigned to an organization)
   */
  private async verifyManagerial(position: number): Promise<boolean> {
    const managerialPosition = await this.relationOscRepository.findOne({
      where: {
        relation_position: position,
        company: COMPANY_ID,
        startDate: LessThanOrEqual(TODAY),
        endDate: MoreThanOrEqual(TODAY),
      },
    });
    return !!managerialPosition;
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
    } catch (error) {
      return null;
    }
  }

  /**
   * Validate SDI rule: penerima must be in different sub-area OR different area
   */
  async validateSDIRule(
    pengirimSubArea: number,
    pengirimArea: string,
    penerimaSubArea: number,
    penerimaArea: string,
  ): Promise<boolean> {
    // SDI rule: DIFFERENT sub-area within same area OR DIFFERENT area within same company
    if (pengirimArea === penerimaArea) {
      // Same area: must be different sub-area
      return pengirimSubArea !== penerimaSubArea;
    } else {
      // Different area: allowed (same company is already guaranteed)
      return true;
    }
  }

  /**
   * Generate nomor surat SDI
   * Format: SDI-{sequence}/{klasifikasi}/{sub_area_code}/{bulan_romawi}/{tahun}
   */
  async generateNomorSurat(klasifikasi: string, subArea: number): Promise<string> {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    
    // Bulan romawi
    const romawiMonths = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
    const bulanRomawi = romawiMonths[month - 1];

    // Get sequence untuk bulan ini
    const endOfMonth = new Date(year, month, 0);

    const count = await this.naskahRepository.count({
      where: {
        jenis: 'SDI',
        tanggal: LessThanOrEqual(endOfMonth),
      },
    });

    const sequence = String(count + 1).padStart(3, '0');

    // Format: SDI-001/HR.01/10020001/XI/2025
    return `SDI-${sequence}/${klasifikasi}/${subArea}/${bulanRomawi}/${year}`;
  }

  /**
   * Main method: Send Message (Create Surat Dinas Internal)
   */
  async sendMessage(dto: CreateSuratDinasInternalDto): Promise<SendMessageResponseDto> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // PHASE 1: Validate pengirim
      const pengirimInfo = await this.getUserCompleteInfo(dto.pengirim);
      if (!pengirimInfo) {
        throw new NotFoundException(`Pengirim dengan persnum ${dto.pengirim} tidak ditemukan atau tidak aktif`);
      }

      // Verify pengirim is managerial
      const isManagerial = await this.verifyManagerial(pengirimInfo.position);
      if (!isManagerial) {
        throw new ForbiddenException('Pengirim bukan managerial. Hanya managerial yang dapat mengirim Surat Dinas Internal.');
      }

      // PHASE 2: Validate all penerima + SDI rules
      const penerimaInfoList: Array<typeof pengirimInfo> = [];
      for (const persnumPenerima of dto.penerima) {
        const info = await this.getUserCompleteInfo(persnumPenerima);
        if (!info) {
          throw new NotFoundException(`Penerima dengan persnum ${persnumPenerima} tidak ditemukan atau tidak aktif`);
        }

        // Validate SDI rule: must be different sub-area or different area
        const isValidSDI = await this.validateSDIRule(
          pengirimInfo.subArea,
          pengirimInfo.area,
          info.subArea,
          info.area,
        );
        if (!isValidSDI) {
          throw new BadRequestException(
            `Penerima ${persnumPenerima} berada di sub-area yang sama dengan pengirim. SDI hanya untuk sub-area atau area yang berbeda.`
          );
        }

        penerimaInfoList.push(info);
      }

      // PHASE 3: Validate tembusan (if any) + SDI rules
      const tembusanInfoList: Array<typeof pengirimInfo> = [];
      if (dto.tembusan && dto.tembusan.length > 0) {
        for (const persnumTembusan of dto.tembusan) {
          const info = await this.getUserCompleteInfo(persnumTembusan);
          if (!info) {
            throw new NotFoundException(`Tembusan dengan persnum ${persnumTembusan} tidak ditemukan atau tidak aktif`);
          }

          // Validate SDI rule for tembusan as well
          const isValidSDI = await this.validateSDIRule(
            pengirimInfo.subArea,
            pengirimInfo.area,
            info.subArea,
            info.area,
          );
          if (!isValidSDI) {
            throw new BadRequestException(
              `Tembusan ${persnumTembusan} berada di sub-area yang sama dengan pengirim. SDI hanya untuk sub-area atau area yang berbeda.`
            );
          }

          tembusanInfoList.push(info);
        }
      }

      // PHASE 4: Generate nomor surat
      const nomorSurat = await this.generateNomorSurat(dto.naskah.klasifikasi, pengirimInfo.subArea);

      // PHASE 5: Insert naskah
      const naskahId = uuidv4();
      const tanggalHariIni = new Date();

      const naskah = this.naskahRepository.create({
        id: naskahId,
        jenis: 'SDI',
        klasifikasi: dto.naskah.klasifikasi,
        klasifikasi_text: dto.naskah.klasifikasi_text || undefined,
        sifat: dto.naskah.sifat,
        nomor: nomorSurat,
        tanggal: tanggalHariIni,
        lampiran: dto.naskah.lampiran || undefined,
        perihal: dto.naskah.perihal,
        konten: dto.naskah.konten,
        tempat: dto.naskah.tempat || undefined,
        status: 'draf',
        english: dto.naskah.english || false,
      });

      await queryRunner.manager.save(naskah);

      // PHASE 6: Insert sirkulasi - pengirim
      const pengirimSirkulasi = this.naskahSirkulasiRepository.create({
        id: uuidv4(),
        idNaskah: naskahId,
        sirkuler: 'pengirim',
        company: String(pengirimInfo.company),
        companyText: 'PERUM LPPNPI',
        area: pengirimInfo.area,
        areaText: pengirimInfo.areaText,
        subArea: String(pengirimInfo.subArea),
        subAreaText: pengirimInfo.subAreaText,
        organization: String(pengirimInfo.organization),
        organizationText: pengirimInfo.organizationText,
        position: String(pengirimInfo.position),
        positionText: pengirimInfo.positionText,
        positionStatus: 'ybs',
        idSirkuler: String(pengirimInfo.persnum),
        namaSirkuler: pengirimInfo.nama,
      });
      await queryRunner.manager.save(pengirimSirkulasi);

      // PHASE 7: Insert sirkulasi - penerima
      const penerimaResponses: SirkulasiInfoDto[] = [];
      for (const penerima of penerimaInfoList) {
        const penerimaSirkulasi = this.naskahSirkulasiRepository.create({
          id: uuidv4(),
          idNaskah: naskahId,
          sirkuler: 'penerima',
          company: String(penerima.company),
          companyText: 'PERUM LPPNPI',
          area: penerima.area,
          areaText: penerima.areaText,
          subArea: String(penerima.subArea),
          subAreaText: penerima.subAreaText,
          organization: String(penerima.organization),
          organizationText: penerima.organizationText,
          position: String(penerima.position),
          positionText: penerima.positionText,
          positionStatus: 'ybs',
          idSirkuler: String(penerima.persnum),
          namaSirkuler: penerima.nama,
        });
        await queryRunner.manager.save(penerimaSirkulasi);

        penerimaResponses.push({
          persnum: penerima.persnum,
          nama: penerima.nama,
          position: penerima.position,
          positionText: penerima.positionText,
          organization: penerima.organization,
          organizationText: penerima.organizationText,
        });
      }

      // PHASE 8: Insert sirkulasi - tembusan
      const tembusanResponses: SirkulasiInfoDto[] = [];
      for (const tembusan of tembusanInfoList) {
        const tembusanSirkulasi = this.naskahSirkulasiRepository.create({
          id: uuidv4(),
          idNaskah: naskahId,
          sirkuler: 'tembusan',
          company: String(tembusan.company),
          companyText: 'PERUM LPPNPI',
          area: tembusan.area,
          areaText: tembusan.areaText,
          subArea: String(tembusan.subArea),
          subAreaText: tembusan.subAreaText,
          organization: String(tembusan.organization),
          organizationText: tembusan.organizationText,
          position: String(tembusan.position),
          positionText: tembusan.positionText,
          positionStatus: 'ybs',
          idSirkuler: String(tembusan.persnum),
          namaSirkuler: tembusan.nama,
        });
        await queryRunner.manager.save(tembusanSirkulasi);

        tembusanResponses.push({
          persnum: tembusan.persnum,
          nama: tembusan.nama,
          position: tembusan.position,
          positionText: tembusan.positionText,
          organization: tembusan.organization,
          organizationText: tembusan.organizationText,
        });
      }

      // PHASE 9: Insert referensi (if any)
      if (dto.referensi && dto.referensi.length > 0) {
        for (const ref of dto.referensi) {
          const referensi = this.naskahReferensiRepository.create({
            id: uuidv4(),
            id_naskah: naskahId,
            ref_jenis: ref.ref_jenis,
            ref_pengirim: ref.ref_pengirim,
            ref_tanggal: ref.ref_tanggal,
            ref_nomor: ref.ref_nomor,
            ref_perihal: ref.ref_perihal || undefined,
          });
          await queryRunner.manager.save(referensi);
        }
      }

      // PHASE 10: Insert lampiran (if any)
      if (dto.lampiran_files && dto.lampiran_files.length > 0) {
        for (const fileName of dto.lampiran_files) {
          const lampiran = this.naskahLampiranRepository.create({
            id: uuidv4(),
            id_naskah: naskahId,
            file_name: fileName,
            jenis: 'SDI',
          });
          await queryRunner.manager.save(lampiran);
        }
      }

      // Commit transaction
      await queryRunner.commitTransaction();

      // Return response
      return {
        success: true,
        data: {
          id: naskahId,
          jenis: 'SDI',
          nomor: nomorSurat,
          tanggal: tanggalHariIni.toISOString().split('T')[0],
          status: 'draf',
          perihal: dto.naskah.perihal,
          pengirim: {
            persnum: pengirimInfo.persnum,
            nama: pengirimInfo.nama,
            position: pengirimInfo.position,
            positionText: pengirimInfo.positionText,
            organization: pengirimInfo.organization,
            organizationText: pengirimInfo.organizationText,
          },
          penerima: penerimaResponses,
          tembusan: tembusanResponses,
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
  // GET SEND MESSAGE - Get all sent SDI messages by user
  // ============================================================

  /**
   * Get all Surat Dinas Internal sent by a user (where user is pengirim)
   * Returns list of sent messages with recipient read status
   */
  async getSendMessage(persnum: number): Promise<GetSendMessageResponseDto> {
    // Validate user exists
    const person = await this.personRepository.findOne({
      where: { persnum },
    });

    if (!person) {
      throw new NotFoundException(`User dengan persnum ${persnum} tidak ditemukan`);
    }

    const persnumStr = String(persnum);

    // Get all naskah where user is pengirim and jenis = SDI
    const sentNaskahList = await this.naskahSirkulasiRepository
      .createQueryBuilder('sirkulasi')
      .innerJoin(NaskahEntity, 'naskah', 'naskah.id = sirkulasi.idNaskah')
      .select([
        'naskah.id AS id',
        'naskah.nomor AS nomor',
        'naskah.tanggal AS tanggal',
        'naskah.perihal AS perihal',
        'naskah.status AS status',
        'naskah.sifat AS sifat',
        'naskah.klasifikasi AS klasifikasi',
        'naskah.klasifikasi_text AS klasifikasi_text',
      ])
      .where('sirkulasi.idSirkuler = :persnum', { persnum: persnumStr })
      .andWhere('sirkulasi.sirkuler = :type', { type: 'pengirim' })
      .andWhere('naskah.jenis = :jenis', { jenis: 'SDI' })
      .orderBy('naskah.tanggal', 'DESC')
      .getRawMany();

    // Build response with recipient info for each naskah
    const results: SendMessageItemDto[] = [];

    for (const naskah of sentNaskahList) {
      // Get all penerima for this naskah
      const penerimaList = await this.naskahSirkulasiRepository.find({
        where: {
          idNaskah: naskah.id,
          sirkuler: 'penerima',
        },
      });

      // Build penerima info with read status
      const penerimaInfoList: PenerimaInfoDto[] = [];
      let jumlahDibaca = 0;

      for (const penerima of penerimaList) {
        const isRead = penerima.sendReadTime !== null;
        if (isRead) jumlahDibaca++;

        penerimaInfoList.push({
          persnum: parseInt(penerima.idSirkuler || '0', 10),
          nama: penerima.namaSirkuler || '',
          organizationText: penerima.organizationText || '',
          positionText: penerima.positionText || '',
          areaText: penerima.areaText || '',
          subAreaText: penerima.subAreaText || '',
          status: isRead ? 'dibaca' : 'belum_dibaca',
          readTime: penerima.sendReadTime ? penerima.sendReadTime.toISOString() : null,
        });
      }

      // Format tanggal
      const tanggalStr = naskah.tanggal instanceof Date
        ? naskah.tanggal.toISOString().split('T')[0]
        : String(naskah.tanggal).split('T')[0];

      results.push({
        id: naskah.id,
        nomor: naskah.nomor || '',
        tanggal: tanggalStr,
        perihal: naskah.perihal || '',
        status: naskah.status,
        sifat: naskah.sifat || '',
        klasifikasi: naskah.klasifikasi || '',
        penerima: penerimaInfoList,
        jumlahPenerima: penerimaList.length,
        jumlahDibaca,
      });
    }

    return {
      success: true,
      data: results,
      total: results.length,
      persnum,
      nama: person.name || '',
    };
  }

  // ============================================================
  // GET RECIPIENT V2 - Using org_data (cached)
  // ============================================================

  /**
   * Filter recipients for SDI from org_data
   * 
   * Rules SDI:
   * - Hanya REKAN (tidak ada ATASAN/BAWAHAN)
   * - chief = 1 (managerial only)
   * - SAMA organization_parent (satu induk organisasi)
   * - BEDA sub_area (atau beda area)
   * - Bukan diri sendiri
   */
  private filterByPositionSdi(barisData: SdiOrgDataPositionDto[], positionParam: number): {
    REKAN: SdiOrgDataPositionDto[];
  } {
    // Cari item current berdasarkan position
    const current = barisData.find((x) => Number(x.position) === Number(positionParam));
    if (!current) {
      return { REKAN: [] };
    }

    console.log(`[filterByPositionSdi] Current:`, {
      position: current.position,
      position_text: current.position_text,
      organization_id: current.organization_id,
      organization_parent: current.organization_parent,
      sub_area: current.sub_area,
      area: current.area,
    });

    // Filter: chief=1, SAMA organization_parent, BEDA sub_area, bukan diri sendiri
    const rekan = barisData.filter((x) => {
      // Must be chief (managerial)
      if (x.chief !== 1) return false;

      // Must not be self
      if (Number(x.position) === Number(positionParam)) return false;

      // Must have SAME organization_parent (satu induk)
      if (Number(x.organization_parent) !== Number(current.organization_parent)) return false;

      // SDI Rule: DIFFERENT sub_area (beda sub_area = beda unit kerja)
      // Note: Jika beda area tapi sama parent, juga diizinkan
      return x.sub_area !== current.sub_area;
    });

    console.log(`[filterByPositionSdi] Results: REKAN=${rekan.length}`);

    return { REKAN: rekan };
  }

  /**
   * Get recipients for SDI using org_data
   * @param positionId - Position ID of the sender
   * @param tgl - Optional date (default: today)
   */
  async getSdiRecipients(
    positionId: number,
    tgl?: string,
  ): Promise<SdiRecipientResponseDto> {
    // Use today's date if not provided
    const tanggal = tgl ?? new Date().toISOString().split('T')[0];

    console.log(`[getSdiRecipients] Looking for positionId: ${positionId}, tanggal: ${tanggal}`);

    // Get cached org data from org_data service
    const orgData = await this.orgDataService.findOrg(tanggal);

    if (!orgData || !orgData.position_json) {
      throw new NotFoundException(`Data organisasi untuk tanggal ${tanggal} tidak ditemukan. Silakan generate data org terlebih dahulu via GET /org-data?tgl=${tanggal}`);
    }

    const barisData: SdiOrgDataPositionDto[] = orgData.position_json;

    console.log(`[getSdiRecipients] Total positions in org_data: ${barisData.length}`);

    // Find sender's position data
    const sender = barisData.find((x) => Number(x.position) === Number(positionId));

    if (!sender) {
      throw new NotFoundException(`Position dengan ID ${positionId} tidak ditemukan dalam data organisasi tanggal ${tanggal}`);
    }

    console.log(`[getSdiRecipients] Found sender:`, sender.position_text);

    // Verify sender is chief (managerial)
    if (sender.chief !== 1) {
      throw new ForbiddenException(
        `Position ${positionId} bukan managerial (chief). Hanya managerial yang dapat mengirim Surat Dinas Internal.`,
      );
    }

    // Filter recipients using SDI logic
    const recipients = this.filterByPositionSdi(barisData, positionId);

    return {
      sender,
      recipients,
    };
  }
}
