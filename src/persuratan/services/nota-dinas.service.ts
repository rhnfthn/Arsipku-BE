import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
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
import { NaskahReferensiEntity } from '../entity/naskah_referensi.entity';
import { NaskahLampiranEntity } from '../entity/naskah_lampiran.entity';
import {
  NotaDinasRecipientResponseDto,
  NotaDinasRecipientGroupDto,
} from '../dto/nota-dinas/nota-dinas-recipient-response.dto';
import { CreateNotaDinasDto } from '../dto/nota-dinas/create-nota-dinas.dto';
import { SendMessageResponseDto, SirkulasiInfoDto } from '../dto/nota-dinas/send-message-response.dto';
import { GetSendMessageResponseDto, SendMessageItemDto, PenerimaInfoDto } from '../dto/nota-dinas/get-send-message.dto';
import { v4 as uuidv4 } from 'uuid';

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

  // ============================================================
  // SEND MESSAGE METHODS
  // ============================================================

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
      console.log(`[getUserCompleteInfo] Looking for persnum: ${persnum}`);
      
      // Get person
      const person = await this.personRepository.findOne({
        where: { persnum },
      });
      console.log(`[getUserCompleteInfo] Person found:`, person ? 'YES' : 'NO');
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
      console.log(`[getUserCompleteInfo] RelationSp found:`, relationSp ? `YES (position: ${relationSp.position})` : 'NO');
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
      console.log(`[getUserCompleteInfo] RelationOsc found:`, relationOsc ? `YES (org: ${relationOsc.organization})` : 'NO');
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
      console.log(`[getUserCompleteInfo] RelationOa found:`, relationOa ? `YES (sub_area: ${relationOa.relation_sub_area})` : 'NO');
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
      console.log(`[getUserCompleteInfo] AreaSub found:`, areaSub ? `YES (area: ${areaSub.area})` : 'NO');
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
      console.error(`[getUserCompleteInfo] Error:`, error);
      return null;
    }
  }

  /**
   * Generate nomor surat
   * Format: ND-{sequence}/{klasifikasi}/{sub_area_code}/{bulan_romawi}/{tahun}
   */
  async generateNomorSurat(klasifikasi: string, subArea: number): Promise<string> {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    
    // Bulan romawi
    const romawiMonths = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
    const bulanRomawi = romawiMonths[month - 1];

    // Get sequence untuk bulan ini
    const startOfMonth = new Date(year, month - 1, 1);
    const endOfMonth = new Date(year, month, 0);

    const count = await this.naskahRepository.count({
      where: {
        jenis: 'ND',
        tanggal: LessThanOrEqual(endOfMonth),
      },
    });

    const sequence = String(count + 1).padStart(3, '0');

    // Format: ND-001/HR.01/10020001/XI/2025
    return `ND-${sequence}/${klasifikasi}/${subArea}/${bulanRomawi}/${year}`;
  }

  /**
   * Create sirkulasi record
   */
  async createSirkulasi(
    idNaskah: string,
    sirkuler: 'pengirim' | 'penerima' | 'tembusan',
    userInfo: {
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
    },
  ): Promise<NaskahSirkulasi> {
    const sirkulasi = this.naskahSirkulasiRepository.create({
      id: uuidv4(),
      idNaskah,
      sirkuler,
      company: String(userInfo.company),
      companyText: 'PERUM LPPNPI',
      area: userInfo.area,
      areaText: userInfo.areaText,
      subArea: String(userInfo.subArea),
      subAreaText: userInfo.subAreaText,
      organization: String(userInfo.organization),
      organizationText: userInfo.organizationText,
      position: String(userInfo.position),
      positionText: userInfo.positionText,
      positionStatus: 'pyb',
      idSirkuler: String(userInfo.persnum),
      namaSirkuler: userInfo.nama,
    });

    return await this.naskahSirkulasiRepository.save(sirkulasi);
  }

  /**
   * Main method: Send Message (Create Nota Dinas)
   */
  async sendMessage(dto: CreateNotaDinasDto): Promise<SendMessageResponseDto> {
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
        throw new ForbiddenException('Pengirim bukan managerial. Hanya managerial yang dapat mengirim Nota Dinas.');
      }

      // PHASE 2: Validate all penerima
      const penerimaInfoList: Array<typeof pengirimInfo> = [];
      for (const persnumPenerima of dto.penerima) {
        const info = await this.getUserCompleteInfo(persnumPenerima);
        if (!info) {
          throw new NotFoundException(`Penerima dengan persnum ${persnumPenerima} tidak ditemukan atau tidak aktif`);
        }
        penerimaInfoList.push(info);
      }

      // PHASE 3: Validate tembusan (if any)
      const tembusanInfoList: Array<typeof pengirimInfo> = [];
      if (dto.tembusan && dto.tembusan.length > 0) {
        for (const persnumTembusan of dto.tembusan) {
          const info = await this.getUserCompleteInfo(persnumTembusan);
          if (!info) {
            throw new NotFoundException(`Tembusan dengan persnum ${persnumTembusan} tidak ditemukan atau tidak aktif`);
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
        jenis: 'ND',
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
        positionStatus: 'pyb',
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
          positionStatus: 'pyb',
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
          positionStatus: 'pyb',
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
            ref_tanggal: new Date(ref.ref_tanggal),
            ref_nomor: ref.ref_nomor,
            ref_perihal: ref.ref_perihal || undefined,
          });
          await queryRunner.manager.save(referensi);
        }
      }

      // PHASE 10: Insert lampiran (if any)
      if (dto.lampiran_files && dto.lampiran_files.length > 0) {
        for (const filePath of dto.lampiran_files) {
          const fileName = filePath.split('/').pop() || filePath;
          const lampiran = this.naskahLampiranRepository.create({
            id: uuidv4(),
            id_naskah: naskahId,
            file_name: fileName,
            file_pdf: filePath,
            jenis: 'ND',
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
          jenis: 'ND',
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
  // GET SEND MESSAGE - Get all sent messages by user
  // ============================================================

  /**
   * Get all Nota Dinas sent by a user (where user is pengirim)
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

    // Get all naskah where user is pengirim and jenis = ND
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
      .andWhere('naskah.jenis = :jenis', { jenis: 'ND' })
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
}

