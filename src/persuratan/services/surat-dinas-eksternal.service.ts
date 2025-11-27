import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import { RelationSp } from 'src/relation_sp/entities/relation_sp.entity';
import { RelationOsc } from 'src/relation_osc/entities/relation_osc.entity';
import { RelationOa } from 'src/relation_oa/entities/relation_oa.entity';
import { Person } from 'src/person/entities/person.entity';
import { OmPosition } from 'src/position/entities/om-position.entity';
import { EksternalEntity } from '../entity/eksternal.entity';
import {
  SdeRecipientResponseDto,
  EksternalRecipientDto,
  SdeSenderDto,
} from '../dto/surat-dinas-eksternal/sde-recipient-response.dto';

const MANAGERIAL_THRESHOLD = 70000000;
const COMPANY_ID = 10000; // PERUM LPPNPI
const TODAY = new Date().toISOString().split('T')[0];

@Injectable()
export class SuratDinasEksternalService {
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
    @InjectRepository(EksternalEntity)
    private readonly eksternalRepository: Repository<EksternalEntity>,
  ) {}

  /**
   * PHASE 1: Get sender position & validate authorization
   * Surat Dinas Eksternal hanya bisa dikirim oleh pejabat MANAGERIAL
   */
  async validateSender(persnum: number): Promise<{
    persnum: number;
    position: number;
    isManagerial: boolean;
    isAuthorized: boolean;
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

    // SDE: Hanya Managerial yang berwenang kirim surat eksternal
    if (!isManagerial) {
      throw new ForbiddenException(
        `Surat Dinas Eksternal hanya bisa dikirim oleh pejabat Managerial (position >= ${MANAGERIAL_THRESHOLD}). User ini memiliki position ${position}`,
      );
    }

    return {
      persnum,
      position,
      isManagerial,
      isAuthorized: isManagerial,
    };
  }

  /**
   * PHASE 2: Get sender organization & sub_area
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

    return {
      organizationId: osc.organization,
      organizationName: osc.organization_text || '',
      subAreaId: oa?.relation_sub_area || 0,
    };
  }

  /**
   * PHASE 3: Get all external recipients (aktif only)
   * Tidak perlu hierarchy, langsung ambil dari tabel eksternal
   */
  async getExternalRecipients(): Promise<EksternalRecipientDto[]> {
    const externals = await this.eksternalRepository.find({
      where: {
        aktif: true,
      },
      order: {
        nama: 'ASC',
      },
    });

    return externals.map((ext) => ({
      id: ext.id,
      nama: ext.nama,
      alamat: ext.alamat || '',
      telepon: ext.telepon || '',
      email: ext.email || '',
      kontak: ext.kontak || '',
    }));
  }

  /**
   * Main method: Get SDE recipients
   * Surat Dinas Eksternal (SDE): Korespondensi resmi ke pihak luar perusahaan
   * - Pengirim: Internal LPPNPI (Managerial only)
   * - Penerima: Pihak eksternal (dari tabel eksternal)
   */
  async getSdeRecipients(persnum: number): Promise<SdeRecipientResponseDto> {
    // PHASE 1: Validate sender (must be Managerial)
    const senderValidation = await this.validateSender(persnum);

    // Get person data
    const person = await this.personRepository.findOne({
      where: { persnum },
    });

    if (!person) {
      throw new NotFoundException(`Person dengan persnum ${persnum} tidak ditemukan`);
    }

    // PHASE 2: Get sender organization
    const senderOrg = await this.getSenderOrganization(senderValidation.position);

    // Get position details
    const positionDetails = await this.positionRepository.findOne({
      where: { position: senderValidation.position },
    });

    // Build sender info
    const sender: SdeSenderDto = {
      persnum: person.persnum || 0,
      nama: person.name || '',
      position: senderValidation.position,
      positionName: positionDetails?.shortText || '',
      positionStatus: 'pyb',
      organizationId: senderOrg.organizationId,
      organizationName: senderOrg.organizationName,
      subAreaId: senderOrg.subAreaId,
      isAuthorized: senderValidation.isAuthorized,
    };

    // PHASE 3: Get external recipients
    const recipients = await this.getExternalRecipients();

    return {
      sender,
      recipients,
      totalRecipients: recipients.length,
    };
  }
}
