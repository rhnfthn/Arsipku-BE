import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { NaskahEntity } from '../../../shared/entities/naskah.entity';
import { NaskahSirkulasi } from '../../../shared/entities/naskah_sirkulasi.entity';
import { NaskahLampiranEntity } from '../../../shared/entities/naskah_lampiran.entity';
import { SdiSdeEntity } from '../entities/sdi_sde.entity';
import { NomorEntity } from '../../nomor/entities/nomor.entity';
import { StorageService } from '../../storage/services/storage.service';
import {
  SdiRecipientResponseDto,
  SdiOrgDataPositionDto,
} from '../dto/surat-dinas-internal-recipient-response.dto';
import { CreateSuratDinasInternalDto, UpdateDraftDto, FinalizeDraftDto } from '../dto/create-surat-dinas-internal.dto';
import { SendMessageResponseDto, SirkulasiInfoDto } from '../dto/send-message-response.dto';
import { GetSendMessageResponseDto, SendMessageItemDto, PenerimaInfoDto, TembusanInfoDto, LampiranInfoDto, PengirimInfoDto } from '../dto/get-send-message.dto';
import { OrgDataService } from 'src/modules/master-data/org_data/org_data.service';
import { NomorSuratService } from '../../../shared/services/nomor-surat.service';
import { v4 as uuidv4 } from 'uuid';

const COMPANY_ID = 10000; // PERUM LPPNPI
const TODAY = new Date().toISOString().split('T')[0];
const DEFAULT_KOP_NAMA = 'AirNav Indonesia';
const DEFAULT_KOP_LOGO = '/assets/logo-airnav.png';
const DEFAULT_ALAMAT_PERUSAHAAN = 'Gedung AirNav Indonesia, Jl. Ir. H. Juanda No. 1, Tangerang 15121';

@Injectable()
export class SuratDinasInternalService {
  constructor(
    @InjectRepository(NaskahEntity)
    private readonly naskahRepository: Repository<NaskahEntity>,
    @InjectRepository(NaskahSirkulasi)
    private readonly naskahSirkulasiRepository: Repository<NaskahSirkulasi>,
    @InjectRepository(NaskahLampiranEntity)
    private readonly naskahLampiranRepository: Repository<NaskahLampiranEntity>,
    @InjectRepository(SdiSdeEntity)
    private readonly sdiSdeRepository: Repository<SdiSdeEntity>,
    @InjectRepository(NomorEntity)
    private readonly nomorRepository: Repository<NomorEntity>,
    private readonly dataSource: DataSource,
    private readonly orgDataService: OrgDataService,
    private readonly nomorSuratService: NomorSuratService,
    private readonly storageService: StorageService,
  ) {}

  // ============================================================
  // FORM DATA PARSER
  // ============================================================

  /**
   * Parse form-data body + uploaded files to CreateSuratDinasInternalDto
   */
  async parseFormDataToDto(
    body: any,
    files?: {
      lampiran_files?: Express.Multer.File[];
      final_pdf?: Express.Multer.File[];
    } | Express.Multer.File[],
  ): Promise<CreateSuratDinasInternalDto> {
    // Helper: Parse array field
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

    // Upload files to storage
    let lampiranFilePaths: string[] = [];
    let finalPdfPath: string | undefined;

    if (files) {
      if (!Array.isArray(files)) {
        // Upload lampiran files
        if (files.lampiran_files && files.lampiran_files.length > 0) {
          const uploadPromises = files.lampiran_files.map(file =>
            this.storageService.uploadFile(file, 'surat-dinas-internal/lampiran')
          );
          const uploadResults = await Promise.all(uploadPromises);
          lampiranFilePaths = uploadResults.map(result => result.key);
        }

        // Upload final_pdf file
        if (files.final_pdf && files.final_pdf.length > 0) {
          const uploadResult = await this.storageService.uploadFile(
            files.final_pdf[0],
            'surat-dinas-internal/final'
          );
          finalPdfPath = uploadResult.key;
        }
      }
    }

    // Build DTO
    const dto: CreateSuratDinasInternalDto = {
      pengirim: Number(body.pengirim),
      penerima: parseArray(body.penerima),
      tembusan: body.tembusan ? parseArray(body.tembusan) : undefined,

      kop_logo: body.kop_logo,
      kop_nama: body.kop_nama,
      alamat_perusahaan: body.alamat_perusahaan,

      klasifikasi: body.klasifikasi,
      klasifikasi_text: body.klasifikasi_text,
      sifat: body.sifat || 'biasa',
      perihal: body.perihal,
      konten: body.konten,
      english: body.english === 'true' || body.english === true,

      nama_tempat: body.nama_tempat,
      nama_jabatan: body.nama_jabatan,
      tanda_tangan: body.tanda_tangan,
      nama_lengkap: body.nama_lengkap,

      lampiran: body.lampiran,
      lampiran_files: lampiranFilePaths.length > 0 ? lampiranFilePaths : undefined,

      final_pdf: finalPdfPath || body.final_pdf,
      tgl: body.tgl,
    };

    return dto;
  }

  /**
   * Parse form-data for update-draft endpoint (only lampiran_files)
   */
  async parseFormDataToUpdateDraftDto(
    body: any,
    files?: {
      lampiran_files?: Express.Multer.File[];
    },
  ): Promise<UpdateDraftDto> {
    // Helper: Parse array field
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

    // Upload lampiran files
    let lampiranFilePaths: string[] = [];
    if (files?.lampiran_files && files.lampiran_files.length > 0) {
      const uploadPromises = files.lampiran_files.map(file =>
        this.storageService.uploadFile(file, 'surat-dinas-internal/lampiran')
      );
      const uploadResults = await Promise.all(uploadPromises);
      lampiranFilePaths = uploadResults.map(result => result.key);
    }

    const dto: UpdateDraftDto = {
      pengirim: body.pengirim ? Number(body.pengirim) : undefined,
      penerima: body.penerima ? parseArray(body.penerima) : undefined,
      tembusan: body.tembusan ? parseArray(body.tembusan) : undefined,

      kop_logo: body.kop_logo,
      kop_nama: body.kop_nama,
      alamat_perusahaan: body.alamat_perusahaan,

      klasifikasi: body.klasifikasi,
      klasifikasi_text: body.klasifikasi_text,
      sifat: body.sifat || 'biasa',
      perihal: body.perihal,
      konten: body.konten,
      english: body.english === 'true' || body.english === true,

      nama_tempat: body.nama_tempat,
      nama_jabatan: body.nama_jabatan,
      tanda_tangan: body.tanda_tangan,
      nama_lengkap: body.nama_lengkap,

      lampiran: body.lampiran,
      lampiran_files: lampiranFilePaths.length > 0 ? lampiranFilePaths : undefined,

      tgl: body.tgl,
    };

    return dto;
  }

  /**
   * Parse form-data for send-draft endpoint (only final_pdf)
   */
  async parseFormDataToFinalizeDraftDto(
    body: any,
    files?: {
      lampiran_files?: Express.Multer.File[];
      final_pdf?: Express.Multer.File[];
    },
  ): Promise<FinalizeDraftDto> {
    // Helper: Parse array field
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

    // Upload lampiran_files
    let lampiranFilePaths: string[] = [];
    if (files?.lampiran_files && files.lampiran_files.length > 0) {
      const uploadPromises = files.lampiran_files.map(file =>
        this.storageService.uploadFile(file, 'surat-dinas-internal/lampiran')
      );
      const uploadResults = await Promise.all(uploadPromises);
      lampiranFilePaths = uploadResults.map(result => result.key);
    }

    // Upload final_pdf file
    let finalPdfPath: string | undefined;
    if (files?.final_pdf && files.final_pdf.length > 0) {
      const uploadResult = await this.storageService.uploadFile(
        files.final_pdf[0],
        'surat-dinas-internal/final'
      );
      finalPdfPath = uploadResult.key;
    }

    // Build DTO - semua field optional untuk finalize
    const dto: FinalizeDraftDto = {
      pengirim: body.pengirim ? Number(body.pengirim) : undefined,
      penerima: body.penerima ? parseArray(body.penerima) : undefined,
      tembusan: body.tembusan ? parseArray(body.tembusan) : undefined,

      kop_logo: body.kop_logo,
      kop_nama: body.kop_nama,
      alamat_perusahaan: body.alamat_perusahaan,

      klasifikasi: body.klasifikasi,
      klasifikasi_text: body.klasifikasi_text,
      sifat: body.sifat || 'biasa',
      perihal: body.perihal,
      konten: body.konten,
      english: body.english === 'true' || body.english === true,

      nama_tempat: body.nama_tempat,
      nama_jabatan: body.nama_jabatan,
      tanda_tangan: body.tanda_tangan,
      nama_lengkap: body.nama_lengkap,

      lampiran: body.lampiran,
      lampiran_files: lampiranFilePaths.length > 0 ? lampiranFilePaths : undefined,
      final_pdf: finalPdfPath || body.final_pdf,
      tgl: body.tgl,
    };

    return dto;
  }

  // ============================================================
  // HELPER METHODS
  // ============================================================

  /**
   * Helper: Convert SdiOrgDataPositionDto to SirkulasiInfoDto
   */
  private toSirkulasiInfo(pos: SdiOrgDataPositionDto): SirkulasiInfoDto {
    return {
      position: pos.position,
      position_text: pos.position_text,
      persnum: pos.persnum,
      nama: pos.nama,
      organization_id: pos.organization_id,
      organization_text: pos.organization_text,
      sub_area: pos.sub_area,
      sub_area_text: pos.sub_area_text,
      area: pos.area,
      area_text: pos.area_text,
    };
  }

  /**
   * Helper: Create sirkulasi from SdiOrgDataPositionDto
   */
  private createSirkulasiFromOrgData(
    idNaskah: string,
    sirkuler: 'pengirim' | 'penerima' | 'tembusan',
    pos: SdiOrgDataPositionDto,
    isDraft: boolean = false,
  ): NaskahSirkulasi {
    const sirkulasi = this.naskahSirkulasiRepository.create({
      id: uuidv4(),
      idNaskah,
      sirkuler,
      company: String(COMPANY_ID),
      companyText: 'PERUM LPPNPI',
      area: pos.area ?? '',
      areaText: pos.area_text ?? '',
      subArea: String(pos.sub_area ?? ''),
      subAreaText: pos.sub_area_text ?? '',
      organization: String(pos.organization_id),
      organizationText: pos.organization_text,
      position: String(pos.position),
      positionText: pos.position_text,
      positionStatus: 'ybs',
      // Ensure idSirkuler and namaSirkuler are always populated.
      // Prefer persnum_person/persnum_person_text, then persnum/nama, then fallback to position/position_text
        // Use persnum_person if available (employee in the position), otherwise fall back to persnum or position
        idSirkuler: String((pos as any).persnum_person ?? pos.persnum ?? pos.position ?? ''),
        namaSirkuler: (pos as any).persnum_person_text ?? pos.nama ?? pos.position_text ?? '',
      isDraft: isDraft,
    });

    // Debug log so we can quickly check what values are being saved
    console.log('[createSirkulasiFromOrgData] sirkulasi ->', {
      id: sirkulasi.id,
      position: sirkulasi.position,
      idSirkuler: sirkulasi.idSirkuler,
      namaSirkuler: sirkulasi.namaSirkuler,
      sirkuler: sirkulasi.sirkuler,
      isDraft: sirkulasi.isDraft,
    });

    return sirkulasi;
  }

  /**
   * Helper: Convert NaskahSirkulasi to SirkulasiInfoDto
   */
  private sirkulasiToInfo(sirkulasi?: NaskahSirkulasi): SirkulasiInfoDto {
    if (!sirkulasi) {
      return {
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
    }
    return {
      position: parseInt(sirkulasi.position || '0', 10),
      position_text: sirkulasi.positionText || '',
      persnum: parseInt(sirkulasi.idSirkuler || '0', 10),
      nama: sirkulasi.namaSirkuler || null,
      organization_id: parseInt(sirkulasi.organization || '0', 10),
      organization_text: sirkulasi.organizationText || '',
      sub_area: parseInt(sirkulasi.subArea || '0', 10),
      sub_area_text: sirkulasi.subAreaText || null,
      area: sirkulasi.area || null,
      area_text: sirkulasi.areaText || null,
    };
  }

  // ============================================================
  // SEND MESSAGE METHODS
  // ============================================================

  /**
   * Send Message - Kirim SDI
   * Status: 'final' (tanpa tanda tangan) atau 'final_tte' (dengan tanda tangan)
   */
  async sendMessage(dto: CreateSuratDinasInternalDto): Promise<SendMessageResponseDto> {
    // Determine status based on tanda_tangan
    const status = dto.tanda_tangan ? 'final_tte' : 'final';
    return this.createSdi(dto, status);
  }

  // ============================================================
  // GET SEND MESSAGE - Get all sent SDI messages by user
  // ============================================================

  /**
   * Get all Surat Dinas Internal sent by a user (where user is pengirim)
   * Returns list of sent messages with recipient read status
   * Validates user from org_data (using positionId)
   */
  async getSendMessage(positionId: number): Promise<GetSendMessageResponseDto> {
    // Get today's date for org_data
    const tanggal = new Date().toISOString().split('T')[0];

    // Validate user exists in org_data
    const orgData = await this.orgDataService.findOrg(tanggal);
    if (!orgData || !orgData.position_json) {
      throw new NotFoundException(
        `Data organisasi untuk tanggal ${tanggal} tidak ditemukan.`,
      );
    }

    const barisData: SdiOrgDataPositionDto[] = orgData.position_json;
    const pengirim = barisData.find((x) => Number(x.position) === Number(positionId));

    if (!pengirim) {
      throw new NotFoundException(`Position ${positionId} tidak ditemukan dalam org_data`);
    }

    const positionStr = String(positionId);

    // Get all naskah where user is pengirim and jenis = SDI
    // Query by position (stored in sirkulasi.position column)
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
      .where('sirkulasi.position = :position', { position: positionStr })
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
          position: parseInt(penerima.position || '0', 10),
          position_text: penerima.positionText || '',
          persnum: parseInt(penerima.idSirkuler || '0', 10),
          nama: penerima.namaSirkuler || '',
          organization_id: parseInt(penerima.organization || '0', 10),
          organization_text: penerima.organizationText || '',
          sub_area: parseInt(penerima.subArea || '0', 10),
          sub_area_text: penerima.subAreaText || '',
          area: penerima.area || '',
          area_text: penerima.areaText || '',
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
      position: pengirim.position,
      position_text: pengirim.position_text,
      persnum: pengirim.persnum,
      nama: pengirim.nama || '',
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

  // ============================================================
  // DRAFT METHODS (Mirroring ND pattern)
  // ============================================================

  /**
   * Private method: Core logic untuk create SDI
   * Digunakan oleh saveDraft dan sendMessage
   */
  private async createSdi(
    dto: CreateSuratDinasInternalDto,
    status: 'draf' | 'final' | 'final_tte',
  ): Promise<SendMessageResponseDto> {
    // Use provided date or today
    const tanggal = dto.tgl ?? new Date().toISOString().split('T')[0];

    // PHASE 1: Get org_data
    const orgData = await this.orgDataService.findOrg(tanggal);
    if (!orgData || !orgData.position_json) {
      throw new NotFoundException(
        `Data organisasi untuk tanggal ${tanggal} tidak ditemukan. Silakan generate via GET /org-data?tgl=${tanggal}`,
      );
    }

    const barisData: SdiOrgDataPositionDto[] = orgData.position_json;

    // PHASE 2: Validate pengirim from org_data
    const pengirim = barisData.find((x) => Number(x.position) === Number(dto.pengirim));
    if (!pengirim) {
      throw new NotFoundException(`Pengirim dengan positionId ${dto.pengirim} tidak ditemukan dalam org_data`);
    }
    if (pengirim.chief !== 1) {
      throw new ForbiddenException(`Position ${dto.pengirim} bukan managerial (chief). Hanya managerial yang dapat mengirim SDI.`);
    }

    // PHASE 3: Get valid recipients using filterByPositionSdi
    // SDI recipients hanya REKAN (beda sub_area/area, sama organization_parent)
    const validRecipients = this.filterByPositionSdi(barisData, dto.pengirim);
    const allValidPositionIds = validRecipients.REKAN.map((x) => Number(x.position));

    // PHASE 4: Validate all penerima - must be in valid recipients list
    const penerimaList: SdiOrgDataPositionDto[] = [];
    for (const posId of dto.penerima) {
      const penerima = barisData.find((x) => Number(x.position) === Number(posId));
      if (!penerima) {
        throw new NotFoundException(`Penerima dengan positionId ${posId} tidak ditemukan dalam org_data`);
      }

      // Check if penerima is managerial
      if (penerima.chief !== 1) {
        throw new ForbiddenException(
          `Penerima ${penerima.position_text} (${posId}) bukan managerial (chief). SDI hanya dapat dikirim ke managerial.`
        );
      }

      // Check if penerima is in valid recipients
      if (!allValidPositionIds.includes(Number(posId))) {
        let errorMsg = `Penerima ${penerima.position_text} (${posId}) harus berbeda sub_area atau area dari pengirim.`;

        if (penerima.organization_parent === pengirim.organization_parent) {
          if (penerima.sub_area === pengirim.sub_area) {
            errorMsg = `Penerima ${penerima.position_text} (${posId}) berada di sub_area yang sama dengan pengirim. SDI untuk penerima di sub_area atau area berbeda.`;
          }
        } else {
          errorMsg = `Penerima ${penerima.position_text} (${posId}) berada di organization parent berbeda. SDI hanya untuk satu organization parent.`;
        }

        throw new BadRequestException(errorMsg);
      }

      penerimaList.push(penerima);
    }

    // PHASE 5: Validate tembusan from org_data (if any)
    const tembusanList: SdiOrgDataPositionDto[] = [];
    if (dto.tembusan && dto.tembusan.length > 0) {
      for (const posId of dto.tembusan) {
        const tembusan = barisData.find((x) => Number(x.position) === Number(posId));
        if (!tembusan) {
          throw new NotFoundException(`Tembusan dengan positionId ${posId} tidak ditemukan dalam org_data`);
        }

        // Check if tembusan is managerial
        if (tembusan.chief !== 1) {
          throw new ForbiddenException(
            `Tembusan ${tembusan.position_text} (${posId}) bukan managerial (chief). SDI hanya dapat dikirim ke managerial.`
          );
        }

        // Check if tembusan is in valid recipients
        if (!allValidPositionIds.includes(Number(posId))) {
          let errorMsg = `Tembusan ${tembusan.position_text} (${posId}) harus berbeda sub_area atau area dari pengirim.`;

          if (tembusan.organization_parent === pengirim.organization_parent) {
            if (tembusan.sub_area === pengirim.sub_area) {
              errorMsg = `Tembusan ${tembusan.position_text} (${posId}) berada di sub_area yang sama dengan pengirim. SDI untuk tembusan di sub_area atau area berbeda.`;
            }
          } else {
            errorMsg = `Tembusan ${tembusan.position_text} (${posId}) berada di organization parent berbeda. SDI hanya untuk satu organization parent.`;
          }

          throw new BadRequestException(errorMsg);
        }

        tembusanList.push(tembusan);
      }
    }

    // Start transaction
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // PHASE 6: Generate nomor surat (only for final/final_tte, draft gets temporary nomor)
      const nomorSurat = status === 'draf' 
        ? `DRAFT-${Date.now()}` 
        : (await this.nomorSuratService.generateNomor({
            jenis: 'SDI',
            positionText: pengirim.position_text || '',
            positionAbbreviation: pengirim.position_abbreviation || undefined,
            areaText: pengirim.area_text || 'Pusat',
            tanggal: new Date(),
            klasifikasi: dto.klasifikasi,
          })).nomor;

      // PHASE 7: Insert naskah
      const naskahId = uuidv4();
      const tanggalHariIni = new Date();

      const naskah = this.naskahRepository.create({
        id: naskahId,
        jenis: 'SDI',
        klasifikasi: dto.klasifikasi,
        klasifikasi_text: dto.klasifikasi_text || undefined,
        sifat: dto.sifat,
        nomor: nomorSurat,
        tanggal: tanggalHariIni,
        lampiran: dto.lampiran || undefined,
        perihal: dto.perihal,
        konten: dto.konten,
        tempat: dto.nama_tempat || undefined,
        status: status,
        final_pdf: dto.final_pdf || undefined,
        english: dto.english || false,
      });
      await queryRunner.manager.save(naskah);

      // Determine if this is a draft
      const isDraft = status === 'draf';

      // PHASE 8: Insert sirkulasi - pengirim
      const pengirimSirkulasi = this.createSirkulasiFromOrgData(naskahId, 'pengirim', pengirim, isDraft);
      await queryRunner.manager.save(pengirimSirkulasi);

      // PHASE 9: Insert sirkulasi - penerima
      const penerimaResponses: SirkulasiInfoDto[] = [];
      for (const penerima of penerimaList) {
        const penerimaSirkulasi = this.createSirkulasiFromOrgData(naskahId, 'penerima', penerima, isDraft);
        await queryRunner.manager.save(penerimaSirkulasi);
        penerimaResponses.push(this.toSirkulasiInfo(penerima));
      }

      // PHASE 10: Insert sirkulasi - tembusan
      const tembusanResponses: SirkulasiInfoDto[] = [];
      for (const tembusan of tembusanList) {
        const tembusanSirkulasi = this.createSirkulasiFromOrgData(naskahId, 'tembusan', tembusan, isDraft);
        await queryRunner.manager.save(tembusanSirkulasi);
        tembusanResponses.push(this.toSirkulasiInfo(tembusan));
      }

      // PHASE 11: Insert lampiran (if any)
      if (dto.lampiran_files && dto.lampiran_files.length > 0) {
        for (const filePath of dto.lampiran_files) {
          const fileName = filePath.split('/').pop() || filePath;
          const lampiran = this.naskahLampiranRepository.create({
            id: uuidv4(),
            id_naskah: naskahId,
            file_name: fileName,
            file_pdf: filePath,
            jenis: 'SDI',
          });
          await queryRunner.manager.save(lampiran);
        }
      }

      // PHASE 12: Insert ke tabel sdi_sde (konten lengkap SDI)
      const kepadaYthList = penerimaList.map(
        (p) => `${p.position_text} - ${p.organization_text}`
      );
      const kepadaYth = kepadaYthList.join('; ');

      const tembusanTextList = tembusanList.map(
        (t) => `${t.position_text} - ${t.organization_text}`
      );
      const tembusanText = tembusanTextList.length > 0 ? tembusanTextList.join('\n') : null;

      const sdiSdeEntity = this.sdiSdeRepository.create({
        id: uuidv4(),
        idNaskah: naskahId,
        kopLogo: dto.kop_logo ?? DEFAULT_KOP_LOGO,
        kopNama: dto.kop_nama ?? DEFAULT_KOP_NAMA,
        alamatPerusahaan: dto.alamat_perusahaan ?? DEFAULT_ALAMAT_PERUSAHAAN,
        nomor: nomorSurat,
        kepadaYth: kepadaYth,
        perihal: dto.perihal,
        konten: dto.konten,
        namaTempat: dto.nama_tempat ?? pengirim.sub_area_text ?? 'Tangerang',
        tanggal: tanggalHariIni,
        namaJabatan: dto.nama_jabatan ?? pengirim.position_text,
        tandaTangan: dto.tanda_tangan ?? null,
        namaLengkap: dto.nama_lengkap ?? pengirim.nama,
        tembusan: tembusanText,
        sifat: dto.sifat,
        lampiran: dto.lampiran || null,
        nama: null,
        alamat: null,
      });
      await queryRunner.manager.save(sdiSdeEntity);

      // PHASE 12b: Insert to nomor table if not draft
      if (status !== 'draf') {
        const nomorRecord = this.nomorRepository.create({
          id: uuidv4(),
          company: String(COMPANY_ID),
          area: pengirim.area ?? '',
          subArea: String(pengirim.sub_area ?? ''),
          organization: String(pengirim.organization_id),
          position: String(pengirim.position),
          tahun: tanggalHariIni.getFullYear(),
          jenis: 'SDI',
          nomor: nomorSurat,
        });
        await queryRunner.manager.save(nomorRecord);
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
          status: status,
          perihal: dto.perihal,
          pengirim: this.toSirkulasiInfo(pengirim),
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

  /**
   * Save Draft - Simpan SDI sebagai draft
   * Status: 'draf'
   */
  async saveDraft(dto: CreateSuratDinasInternalDto): Promise<SendMessageResponseDto> {
    return this.createSdi(dto, 'draf');
  }

  /**
   * Finalize Draft - Clone dari updateDraft + finalization
   * - Update semua data yang diinput (sama seperti updateDraft)
   * - Generate nomor surat resmi (ganti DRAFT-xxx)
   * - Update status: draf -> final (tanpa tanda_tangan) atau final_tte (dengan tanda_tangan)
   * - Update isDraft = false pada semua sirkulasi
   */
  async finalizeDraft(
    naskahId: string,
    dto: FinalizeDraftDto,
  ): Promise<SendMessageResponseDto> {
    // PHASE 1: Get existing naskah
    const naskah = await this.naskahRepository.findOne({
      where: { id: naskahId },
    });

    if (!naskah) {
      throw new NotFoundException(`Naskah dengan id ${naskahId} tidak ditemukan`);
    }

    if (naskah.status !== 'draf') {
      throw new BadRequestException(`Naskah sudah berstatus ${naskah.status}, tidak dapat difinalize`);
    }

    if (naskah.jenis !== 'SDI') {
      throw new BadRequestException(`Naskah bukan Surat Dinas Internal (SDI)`);
    }

    // Use provided date or today for org_data lookup
    const tanggal = dto.tgl ?? new Date().toISOString().split('T')[0];

    // PHASE 2: Get org_data if we need to update sirkulasi
    let barisData: SdiOrgDataPositionDto[] = [];
    if (dto.pengirim !== undefined || dto.penerima !== undefined || dto.tembusan !== undefined) {
      const orgData = await this.orgDataService.findOrg(tanggal);
      if (!orgData || !orgData.position_json) {
        throw new NotFoundException(
          `Data organisasi untuk tanggal ${tanggal} tidak ditemukan. Silakan generate via GET /org-data?tgl=${tanggal}`,
        );
      }
      barisData = orgData.position_json;
    }

    // PHASE 3: Get pengirim data for nomor surat generation
    let pengirimPosition: SdiOrgDataPositionDto | undefined;
    if (dto.pengirim !== undefined) {
      // Need to load org_data if not loaded yet
      if (barisData.length === 0) {
        const orgData = await this.orgDataService.findOrg(tanggal);
        if (!orgData || !orgData.position_json) {
          throw new NotFoundException(
            `Data organisasi untuk tanggal ${tanggal} tidak ditemukan. Silakan generate via GET /org-data?tgl=${tanggal}`,
          );
        }
        barisData = orgData.position_json;
      }
      pengirimPosition = barisData.find((x) => Number(x.position) === Number(dto.pengirim));
      if (!pengirimPosition) {
        throw new NotFoundException(`Pengirim dengan positionId ${dto.pengirim} tidak ditemukan dalam org_data`);
      }
      if (pengirimPosition.chief !== 1) {
        throw new ForbiddenException(`Position ${dto.pengirim} bukan managerial (chief). Hanya managerial yang dapat mengirim SDI.`);
      }
    } else {
      // Get existing pengirim from sirkulasi
      const existingPengirim = await this.naskahSirkulasiRepository.findOne({
        where: { idNaskah: naskahId, sirkuler: 'pengirim' },
      });
      if (!existingPengirim) {
        throw new NotFoundException(`Data pengirim tidak ditemukan untuk naskah ${naskahId}`);
      }
      // Get full data from org_data
      if (barisData.length === 0) {
        const orgData = await this.orgDataService.findOrg(tanggal);
        if (orgData?.position_json) {
          barisData = orgData.position_json;
        }
      }
      pengirimPosition = barisData.find((x) => Number(x.position) === Number(existingPengirim.position));
      if (!pengirimPosition) {
        // Fallback jika tidak ditemukan di org_data
        pengirimPosition = {
          position: Number(existingPengirim.position),
          position_text: existingPengirim.positionText || '',
          sub_area: Number(existingPengirim.subArea),
          area_text: existingPengirim.areaText || 'Pusat',
        } as SdiOrgDataPositionDto;
      }
    }

    // PHASE 4: Generate nomor surat resmi
    const klasifikasi = dto.klasifikasi ?? naskah.klasifikasi ?? '';
    const generatedNomor = await this.nomorSuratService.generateNomor({
      jenis: 'SDI',
      positionText: pengirimPosition?.position_text || '',
      positionAbbreviation: pengirimPosition?.position_abbreviation || undefined,
      areaText: pengirimPosition?.area_text || 'Pusat',
      tanggal: new Date(),
      klasifikasi: klasifikasi,
    });
    const nomorSurat = generatedNomor.nomor;

    // PHASE 5: Determine new status
    const newStatus = dto.tanda_tangan ? 'final_tte' : 'final';

    // Start transaction
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // PHASE 6: Update naskah table (all fields + finalization fields)
      const naskahUpdateData: Partial<NaskahEntity> = {
        nomor: nomorSurat,
        status: newStatus,
      };
      if (dto.klasifikasi !== undefined) naskahUpdateData.klasifikasi = dto.klasifikasi;
      if (dto.klasifikasi_text !== undefined) naskahUpdateData.klasifikasi_text = dto.klasifikasi_text;
      if (dto.sifat !== undefined) naskahUpdateData.sifat = dto.sifat;
      if (dto.perihal !== undefined) naskahUpdateData.perihal = dto.perihal;
      if (dto.konten !== undefined) naskahUpdateData.konten = dto.konten;
      if (dto.nama_tempat !== undefined) naskahUpdateData.tempat = dto.nama_tempat;
      if (dto.lampiran !== undefined) naskahUpdateData.lampiran = dto.lampiran;
      if (dto.final_pdf !== undefined) naskahUpdateData.final_pdf = dto.final_pdf;
      if (dto.english !== undefined) naskahUpdateData.english = dto.english;

      await queryRunner.manager.update(NaskahEntity, { id: naskahId }, naskahUpdateData);

      // PHASE 6b: Update lampiran if provided
      if (dto.lampiran_files !== undefined && dto.lampiran_files.length > 0) {
        await queryRunner.manager.delete(NaskahLampiranEntity, { id_naskah: naskahId });
        for (const filePath of dto.lampiran_files) {
          const fileName = filePath.split('/').pop() || filePath;
          const lampiran = this.naskahLampiranRepository.create({
            id: crypto.randomUUID(),
            id_naskah: naskahId,
            file_name: fileName,
            file_pdf: filePath,
            jenis: 'SDI',
          });
          await queryRunner.manager.save(lampiran);
        }
      }

      // PHASE 7: Update sdi_sde table
      const sdiUpdateData: Partial<SdiSdeEntity> = {
        nomor: nomorSurat,
        tandaTangan: dto.tanda_tangan || null,
      };
      if (dto.kop_logo !== undefined) sdiUpdateData.kopLogo = dto.kop_logo;
      if (dto.kop_nama !== undefined) sdiUpdateData.kopNama = dto.kop_nama;
      if (dto.alamat_perusahaan !== undefined) sdiUpdateData.alamatPerusahaan = dto.alamat_perusahaan;
      if (dto.perihal !== undefined) sdiUpdateData.perihal = dto.perihal;
      if (dto.konten !== undefined) sdiUpdateData.konten = dto.konten;
      if (dto.nama_tempat !== undefined) sdiUpdateData.namaTempat = dto.nama_tempat;
      if (dto.nama_jabatan !== undefined) sdiUpdateData.namaJabatan = dto.nama_jabatan;
      if (dto.nama_lengkap !== undefined) sdiUpdateData.namaLengkap = dto.nama_lengkap;
      if (dto.sifat !== undefined) sdiUpdateData.sifat = dto.sifat;
      if (dto.lampiran !== undefined) sdiUpdateData.lampiran = dto.lampiran;

      await queryRunner.manager.update(SdiSdeEntity, { idNaskah: naskahId }, sdiUpdateData);

      // PHASE 8: Handle sirkulasi update if any sirkulasi field is provided
      if (dto.pengirim !== undefined || dto.penerima !== undefined || dto.tembusan !== undefined) {
        // Get valid recipients based on pengirim position (SDI: only REKAN)
        let allValidPositionIds: number[] = [];
        if (barisData.length > 0 && pengirimPosition) {
          const validRecipients = this.filterByPositionSdi(barisData, Number(pengirimPosition.position));
          allValidPositionIds = validRecipients.REKAN.map((x) => Number(x.position));
        }

        // Validate penerima
        let penerimaList: SdiOrgDataPositionDto[] = [];
        if (dto.penerima !== undefined) {
          for (const posId of dto.penerima) {
            const penerima = barisData.find((x) => Number(x.position) === Number(posId));
            if (!penerima) {
              throw new NotFoundException(`Penerima dengan positionId ${posId} tidak ditemukan dalam org_data`);
            }
            if (penerima.chief !== 1) {
              throw new ForbiddenException(
                `Penerima ${penerima.position_text} (${posId}) bukan managerial (chief). SDI hanya dapat dikirim ke managerial.`
              );
            }
            if (!allValidPositionIds.includes(Number(posId))) {
              let errorMsg = `Penerima ${penerima.position_text} (${posId}) harus berbeda sub_area atau area dari pengirim.`;
              if (pengirimPosition && penerima.sub_area === pengirimPosition.sub_area) {
                errorMsg = `Penerima ${penerima.position_text} (${posId}) berada di sub_area yang sama dengan pengirim.`;
              }
              throw new BadRequestException(errorMsg);
            }
            penerimaList.push(penerima);
          }
        } else {
          // Get existing penerima from sirkulasi
          const existingPenerima = await queryRunner.manager.find(NaskahSirkulasi, {
            where: { idNaskah: naskahId, sirkuler: 'penerima' },
          });
          for (const ep of existingPenerima) {
            const pos = barisData.find((x) => String(x.position) === ep.position);
            if (pos) penerimaList.push(pos);
          }
        }

        // Validate tembusan
        let tembusanList: SdiOrgDataPositionDto[] = [];
        if (dto.tembusan !== undefined && dto.tembusan.length > 0) {
          for (const posId of dto.tembusan) {
            const tembusan = barisData.find((x) => Number(x.position) === Number(posId));
            if (!tembusan) {
              throw new NotFoundException(`Tembusan dengan positionId ${posId} tidak ditemukan dalam org_data`);
            }
            if (tembusan.chief !== 1) {
              throw new ForbiddenException(
                `Tembusan ${tembusan.position_text} (${posId}) bukan managerial (chief). SDI hanya dapat dikirim ke managerial.`
              );
            }
            if (!allValidPositionIds.includes(Number(posId))) {
              let errorMsg = `Tembusan ${tembusan.position_text} (${posId}) harus berbeda sub_area atau area dari pengirim.`;
              if (pengirimPosition && tembusan.sub_area === pengirimPosition.sub_area) {
                errorMsg = `Tembusan ${tembusan.position_text} (${posId}) berada di sub_area yang sama dengan pengirim.`;
              }
              throw new BadRequestException(errorMsg);
            }
            tembusanList.push(tembusan);
          }
        }

        // Delete ALL sirkulasi for this naskah
        await queryRunner.manager.delete(NaskahSirkulasi, { idNaskah: naskahId });

        // Get full pengirim position data if we only have partial
        let fullPengirimPosition: SdiOrgDataPositionDto | undefined = pengirimPosition;
        if (dto.pengirim === undefined && barisData.length > 0) {
          fullPengirimPosition = barisData.find((x) => Number(x.position) === Number(pengirimPosition?.position));
        }

        // Re-insert pengirim with is_draft = FALSE (finalized!)
        if (fullPengirimPosition && fullPengirimPosition.position_text) {
          const pengirimSirkulasi = this.createSirkulasiFromOrgData(naskahId, 'pengirim', fullPengirimPosition, false);
          await queryRunner.manager.save(pengirimSirkulasi);
        }

        // Re-insert penerima with is_draft = FALSE
        for (const penerima of penerimaList) {
          const penerimaSirkulasi = this.createSirkulasiFromOrgData(naskahId, 'penerima', penerima, false);
          await queryRunner.manager.save(penerimaSirkulasi);
        }

        // Update sdi_sde.kepadaYth
        const kepadaYthList = penerimaList.map(
          (p) => `${p.position_text} - ${p.organization_text}`,
        );
        await queryRunner.manager.update(
          SdiSdeEntity,
          { idNaskah: naskahId },
          { kepadaYth: kepadaYthList.join('; ') },
        );

        // Re-insert tembusan with is_draft = FALSE
        for (const tembusan of tembusanList) {
          const tembusanSirkulasi = this.createSirkulasiFromOrgData(naskahId, 'tembusan', tembusan, false);
          await queryRunner.manager.save(tembusanSirkulasi);
        }

        // Update sdi_sde.tembusan
        if (tembusanList.length > 0) {
          const tembusanTextList = tembusanList.map(
            (t) => `${t.position_text} - ${t.organization_text}`,
          );
          await queryRunner.manager.update(
            SdiSdeEntity,
            { idNaskah: naskahId },
            { tembusan: tembusanTextList.join('\n') },
          );
        } else {
          await queryRunner.manager.update(
            SdiSdeEntity,
            { idNaskah: naskahId },
            { tembusan: null },
          );
        }
      } else {
        // No sirkulasi changes - just update isDraft = false
        await queryRunner.manager.update(
          NaskahSirkulasi,
          { idNaskah: naskahId },
          { isDraft: false },
        );
      }

      // PHASE 9: Update lampiran if provided
      if (dto.lampiran_files !== undefined) {
        await queryRunner.manager.delete(NaskahLampiranEntity, { id_naskah: naskahId });
        for (const filePath of dto.lampiran_files) {
          const fileName = filePath.split('/').pop() || filePath;
          const lampiran = this.naskahLampiranRepository.create({
            id: uuidv4(),
            id_naskah: naskahId,
            file_name: fileName,
            file_pdf: filePath,
            jenis: 'SDI',
          });
          await queryRunner.manager.save(lampiran);
        }
      }

      // PHASE 9b: Insert to nomor table with dupcheck (only if changing to final/final_tte)
      const existingNomorRecord = await queryRunner.manager.findOne(NomorEntity, {
        where: { nomor: nomorSurat },
      });
      if (!existingNomorRecord && pengirimPosition) {
        if (!nomorSurat.startsWith('DRAFT-')) {
          const nomorRecord = this.nomorRepository.create({
            id: uuidv4(),
            company: String(COMPANY_ID),
            area: pengirimPosition.area ?? '',
            subArea: String(pengirimPosition.sub_area ?? ''),
            organization: String(pengirimPosition.organization_id),
            position: String(pengirimPosition.position),
            tahun: new Date().getFullYear(),
            jenis: 'SDI',
            nomor: nomorSurat,
          });
          await queryRunner.manager.save(nomorRecord);
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

    // PHASE 10: Get updated data for response
    const updatedNaskah = await this.naskahRepository.findOne({
      where: { id: naskahId },
    });

    const allSirkulasi = await this.naskahSirkulasiRepository.find({
      where: { idNaskah: naskahId },
    });

    const pengirimData = allSirkulasi.find((s) => s.sirkuler === 'pengirim');
    const penerimaData = allSirkulasi.filter((s) => s.sirkuler === 'penerima');
    const tembusanData = allSirkulasi.filter((s) => s.sirkuler === 'tembusan');

    let tanggalStr = '';
    if (updatedNaskah?.tanggal) {
      if (updatedNaskah.tanggal instanceof Date) {
        tanggalStr = updatedNaskah.tanggal.toISOString().split('T')[0];
      } else {
        tanggalStr = String(updatedNaskah.tanggal).split('T')[0];
      }
    }

    return {
      success: true,
      data: {
        id: naskahId,
        jenis: 'SDI',
        nomor: nomorSurat,
        tanggal: tanggalStr,
        status: newStatus,
        perihal: updatedNaskah?.perihal || '',
        pengirim: this.sirkulasiToInfo(pengirimData),
        penerima: penerimaData.map((s) => this.sirkulasiToInfo(s)),
        tembusan: tembusanData.map((s) => this.sirkulasiToInfo(s)),
      },
    };
  }

  /**
   * Update Draft - Update data draft SDI (status tetap draf)
   * Partial update - hanya field yang diisi yang akan diupdate
   */
  async updateDraft(
    naskahId: string,
    dto: UpdateDraftDto,
  ): Promise<SendMessageResponseDto> {
    // PHASE 1: Get existing naskah
    const naskah = await this.naskahRepository.findOne({
      where: { id: naskahId },
    });

    if (!naskah) {
      throw new NotFoundException(`Naskah dengan id ${naskahId} tidak ditemukan`);
    }

    if (naskah.status !== 'draf') {
      throw new BadRequestException(`Naskah sudah berstatus ${naskah.status}, tidak dapat diupdate sebagai draft`);
    }

    if (naskah.jenis !== 'SDI') {
      throw new BadRequestException(`Naskah bukan Surat Dinas Internal (SDI)`);
    }

    // Use provided date or today for org_data lookup
    const tanggal = dto.tgl ?? new Date().toISOString().split('T')[0];

    // PHASE 2: Get org_data if we need to update sirkulasi
    let barisData: SdiOrgDataPositionDto[] = [];
    if (dto.pengirim !== undefined || dto.penerima !== undefined || dto.tembusan !== undefined) {
      const orgData = await this.orgDataService.findOrg(tanggal);
      if (!orgData || !orgData.position_json) {
        throw new NotFoundException(
          `Data organisasi untuk tanggal ${tanggal} tidak ditemukan. Silakan generate via GET /org-data?tgl=${tanggal}`,
        );
      }
      barisData = orgData.position_json;
    }

    // Start transaction
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // PHASE 3: Update naskah table (only fields that are provided)
      const naskahUpdateData: Partial<NaskahEntity> = {};
      if (dto.klasifikasi !== undefined) naskahUpdateData.klasifikasi = dto.klasifikasi;
      if (dto.klasifikasi_text !== undefined) naskahUpdateData.klasifikasi_text = dto.klasifikasi_text;
      if (dto.sifat !== undefined) naskahUpdateData.sifat = dto.sifat;
      if (dto.perihal !== undefined) naskahUpdateData.perihal = dto.perihal;
      if (dto.konten !== undefined) naskahUpdateData.konten = dto.konten;
      if (dto.nama_tempat !== undefined) naskahUpdateData.tempat = dto.nama_tempat;
      if (dto.lampiran !== undefined) naskahUpdateData.lampiran = dto.lampiran;
      if (dto.final_pdf !== undefined) naskahUpdateData.final_pdf = dto.final_pdf;
      if (dto.english !== undefined) naskahUpdateData.english = dto.english;

      if (Object.keys(naskahUpdateData).length > 0) {
        await queryRunner.manager.update(NaskahEntity, { id: naskahId }, naskahUpdateData);
      }

      // PHASE 4: Update sdi_sde table (only fields that are provided)
      const sdiUpdateData: Partial<SdiSdeEntity> = {};
      if (dto.kop_logo !== undefined) sdiUpdateData.kopLogo = dto.kop_logo;
      if (dto.kop_nama !== undefined) sdiUpdateData.kopNama = dto.kop_nama;
      if (dto.alamat_perusahaan !== undefined) sdiUpdateData.alamatPerusahaan = dto.alamat_perusahaan;
      if (dto.perihal !== undefined) sdiUpdateData.perihal = dto.perihal;
      if (dto.konten !== undefined) sdiUpdateData.konten = dto.konten;
      if (dto.nama_tempat !== undefined) sdiUpdateData.namaTempat = dto.nama_tempat;
      if (dto.nama_jabatan !== undefined) sdiUpdateData.namaJabatan = dto.nama_jabatan;
      if (dto.tanda_tangan !== undefined) sdiUpdateData.tandaTangan = dto.tanda_tangan;
      if (dto.nama_lengkap !== undefined) sdiUpdateData.namaLengkap = dto.nama_lengkap;
      if (dto.sifat !== undefined) sdiUpdateData.sifat = dto.sifat;
      if (dto.lampiran !== undefined) sdiUpdateData.lampiran = dto.lampiran;

      if (Object.keys(sdiUpdateData).length > 0) {
        await queryRunner.manager.update(SdiSdeEntity, { idNaskah: naskahId }, sdiUpdateData);
      }

      // PHASE 5: Handle sirkulasi - ALWAYS delete all and re-insert
      if (dto.pengirim !== undefined || dto.penerima !== undefined || dto.tembusan !== undefined) {
        // Get existing pengirim for fallback if not provided in dto
        let pengirimPosition: SdiOrgDataPositionDto | undefined;
        if (dto.pengirim !== undefined) {
          pengirimPosition = barisData.find((x) => Number(x.position) === Number(dto.pengirim));
          if (!pengirimPosition) {
            throw new NotFoundException(`Pengirim dengan positionId ${dto.pengirim} tidak ditemukan dalam org_data`);
          }
          if (pengirimPosition.chief !== 1) {
            throw new ForbiddenException(`Position ${dto.pengirim} bukan managerial (chief). Hanya managerial yang dapat mengirim SDI.`);
          }
        } else {
          // Get existing pengirim from sirkulasi
          const existingPengirim = await queryRunner.manager.findOne(NaskahSirkulasi, {
            where: { idNaskah: naskahId, sirkuler: 'pengirim' },
          });
          if (existingPengirim) {
            pengirimPosition = barisData.find((x) => String(x.position) === existingPengirim.position);
          }
        }

        // Get valid recipients based on pengirim position (SDI: only REKAN)
        let allValidPositionIds: number[] = [];
        if (pengirimPosition) {
          const validRecipients = this.filterByPositionSdi(barisData, Number(pengirimPosition.position));
          allValidPositionIds = validRecipients.REKAN.map((x) => Number(x.position));
        }

        // Validate penerima - must be in valid recipients list
        let penerimaList: SdiOrgDataPositionDto[] = [];
        if (dto.penerima !== undefined) {
          for (const posId of dto.penerima) {
            const penerima = barisData.find((x) => Number(x.position) === Number(posId));
            if (!penerima) {
              throw new NotFoundException(`Penerima dengan positionId ${posId} tidak ditemukan dalam org_data`);
            }
            
            // Check if penerima is managerial
            if (penerima.chief !== 1) {
              throw new ForbiddenException(
                `Penerima ${penerima.position_text} (${posId}) bukan managerial (chief). SDI hanya dapat dikirim ke managerial.`
              );
            }
            
            // Check if penerima is in valid recipients (REKAN only for SDI)
            if (!allValidPositionIds.includes(Number(posId))) {
              let errorMsg = `Penerima ${penerima.position_text} (${posId}) harus berbeda sub_area atau area dari pengirim.`;
              
              if (pengirimPosition && penerima.sub_area === pengirimPosition.sub_area) {
                errorMsg = `Penerima ${penerima.position_text} (${posId}) berada di sub_area yang sama dengan pengirim.`;
              }
              
              throw new BadRequestException(errorMsg);
            }
            
            penerimaList.push(penerima);
          }
        } else {
          // Get existing penerima from sirkulasi
          const existingPenerima = await queryRunner.manager.find(NaskahSirkulasi, {
            where: { idNaskah: naskahId, sirkuler: 'penerima' },
          });
          for (const ep of existingPenerima) {
            const pos = barisData.find((x) => String(x.position) === ep.position);
            if (pos) penerimaList.push(pos);
          }
        }

        // Validate tembusan - if not provided, tembusan will be EMPTY (destroyed)
        let tembusanList: SdiOrgDataPositionDto[] = [];
        if (dto.tembusan !== undefined && dto.tembusan.length > 0) {
          for (const posId of dto.tembusan) {
            const tembusan = barisData.find((x) => Number(x.position) === Number(posId));
            if (!tembusan) {
              throw new NotFoundException(`Tembusan dengan positionId ${posId} tidak ditemukan dalam org_data`);
            }
            
            // Check if tembusan is managerial
            if (tembusan.chief !== 1) {
              throw new ForbiddenException(
                `Tembusan ${tembusan.position_text} (${posId}) bukan managerial (chief). SDI hanya dapat dikirim ke managerial.`
              );
            }
            
            // Check if tembusan is in valid recipients (REKAN only for SDI)
            if (!allValidPositionIds.includes(Number(posId))) {
              let errorMsg = `Tembusan ${tembusan.position_text} (${posId}) harus berbeda sub_area atau area dari pengirim.`;
              
              if (pengirimPosition && tembusan.sub_area === pengirimPosition.sub_area) {
                errorMsg = `Tembusan ${tembusan.position_text} (${posId}) berada di sub_area yang sama dengan pengirim.`;
              }
              
              throw new BadRequestException(errorMsg);
            }
            
            tembusanList.push(tembusan);
          }
        }
        // If dto.tembusan is undefined or empty array, tembusanList stays empty = no tembusan

        // Delete ALL sirkulasi for this naskah
        await queryRunner.manager.delete(NaskahSirkulasi, { idNaskah: naskahId });

        // Re-insert pengirim with is_draft = true
        if (pengirimPosition) {
          const pengirimSirkulasi = this.createSirkulasiFromOrgData(naskahId, 'pengirim', pengirimPosition, true);
          await queryRunner.manager.save(pengirimSirkulasi);
        }

        // Re-insert penerima with is_draft = true
        for (const penerima of penerimaList) {
          const penerimaSirkulasi = this.createSirkulasiFromOrgData(naskahId, 'penerima', penerima, true);
          await queryRunner.manager.save(penerimaSirkulasi);
        }

        // Update sdi_sde.kepadaYth
        const kepadaYthList = penerimaList.map(
          (p) => `${p.position_text} - ${p.organization_text}`,
        );
        await queryRunner.manager.update(
          SdiSdeEntity,
          { idNaskah: naskahId },
          { kepadaYth: kepadaYthList.join('; ') },
        );

        // Re-insert tembusan with is_draft = true (only if there are any)
        for (const tembusan of tembusanList) {
          const tembusanSirkulasi = this.createSirkulasiFromOrgData(naskahId, 'tembusan', tembusan, true);
          await queryRunner.manager.save(tembusanSirkulasi);
        }

        // Update sdi_sde.tembusan
        if (tembusanList.length > 0) {
          const tembusanTextList = tembusanList.map(
            (t) => `${t.position_text} - ${t.organization_text}`,
          );
          await queryRunner.manager.update(
            SdiSdeEntity,
            { idNaskah: naskahId },
            { tembusan: tembusanTextList.join('\n') },
          );
        } else {
          // Clear tembusan in sdi_sde
          await queryRunner.manager.update(
            SdiSdeEntity,
            { idNaskah: naskahId },
            { tembusan: null },
          );
        }
      }

      // PHASE 6: Update lampiran if changed
      if (dto.lampiran_files !== undefined) {
        // Delete old lampiran
        await queryRunner.manager.delete(NaskahLampiranEntity, { id_naskah: naskahId });

        // Insert new lampiran
        for (const filePath of dto.lampiran_files) {
          const fileName = filePath.split('/').pop() || filePath;
          const lampiran = this.naskahLampiranRepository.create({
            id: uuidv4(),
            id_naskah: naskahId,
            file_name: fileName,
            file_pdf: filePath,
            jenis: 'SDI',
          });
          await queryRunner.manager.save(lampiran);
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

    // PHASE 7: Get updated data for response
    const updatedNaskah = await this.naskahRepository.findOne({
      where: { id: naskahId },
    });

    const allSirkulasi = await this.naskahSirkulasiRepository.find({
      where: { idNaskah: naskahId },
    });

    const pengirimData = allSirkulasi.find((s) => s.sirkuler === 'pengirim');
    const penerimaData = allSirkulasi.filter((s) => s.sirkuler === 'penerima');
    const tembusanData = allSirkulasi.filter((s) => s.sirkuler === 'tembusan');

    // Handle tanggal - bisa Date object atau string
    let tanggalStr = '';
    if (updatedNaskah?.tanggal) {
      if (updatedNaskah.tanggal instanceof Date) {
        tanggalStr = updatedNaskah.tanggal.toISOString().split('T')[0];
      } else {
        tanggalStr = String(updatedNaskah.tanggal).split('T')[0];
      }
    }

    return {
      success: true,
      data: {
        id: naskahId,
        jenis: 'SDI',
        nomor: updatedNaskah?.nomor || '',
        tanggal: tanggalStr,
        status: 'draf',
        perihal: updatedNaskah?.perihal || '',
        pengirim: this.sirkulasiToInfo(pengirimData),
        penerima: penerimaData.map((s) => this.sirkulasiToInfo(s)),
        tembusan: tembusanData.map((s) => this.sirkulasiToInfo(s)),
      },
    };
  }

  // ============================================================
  // GET DRAFT LIST - Get all drafts by position
  // ============================================================

  /**
   * Get all draft SDI by position (where position is pengirim)
   * Returns list of draft messages with full data
   * @param positionId - The position ID of the sender
   * @param tgl - Optional date for validation (default: today)
   */
  async getDraftList(positionId: number, tgl?: string): Promise<GetSendMessageResponseDto> {
    // Get org_data to validate position exists
    const tanggal = tgl ?? new Date().toISOString().split('T')[0];
    const orgData = await this.orgDataService.findOrg(tanggal);
    
    if (!orgData || !orgData.position_json) {
      throw new NotFoundException('Data organisasi tidak ditemukan');
    }

    const barisData: SdiOrgDataPositionDto[] = orgData.position_json;

    // Find position by position ID
    const positionData = barisData.find(
      (pos: SdiOrgDataPositionDto) => Number(pos.position) === Number(positionId)
    );

    if (!positionData) {
      throw new NotFoundException(`Position dengan id ${positionId} tidak ditemukan di org_data`);
    }

    const positionIdStr = String(positionId);

    // Get all naskah where position is pengirim, jenis = SDI, and status = draf
    const draftNaskahList = await this.naskahSirkulasiRepository
      .createQueryBuilder('sirkulasi')
      .innerJoin(NaskahEntity, 'naskah', 'naskah.id = sirkulasi.idNaskah')
      .select([
        'naskah.id AS id',
        'naskah.jenis AS jenis',
        'naskah.nomor AS nomor',
        'naskah.tanggal AS tanggal',
        'naskah.perihal AS perihal',
        'naskah.status AS status',
        'naskah.sifat AS sifat',
        'naskah.klasifikasi AS klasifikasi',
        'naskah.klasifikasi_text AS klasifikasi_text',
        'naskah.konten AS konten',
        'naskah.tempat AS tempat',
        'naskah.lampiran AS lampiran',
        'naskah.english AS english',
      ])
      .where('sirkulasi.position = :positionId', { positionId: positionIdStr })
      .andWhere('sirkulasi.sirkuler = :type', { type: 'pengirim' })
      .andWhere('naskah.jenis = :jenis', { jenis: 'SDI' })
      .andWhere('naskah.status = :status', { status: 'draf' })
      .orderBy('naskah.tanggal', 'DESC')
      .getRawMany();

    // Build response with full data for each naskah
    const results: SendMessageItemDto[] = [];

    for (const naskah of draftNaskahList) {
      // Get sdi_sde data for this naskah
      const sdiData = await this.sdiSdeRepository.findOne({
        where: { idNaskah: naskah.id },
      });

      // Get pengirim sirkulasi
      const pengirimSirkulasi = await this.naskahSirkulasiRepository.findOne({
        where: {
          idNaskah: naskah.id,
          sirkuler: 'pengirim',
        },
      });

      // Get all penerima for this naskah
      const penerimaList = await this.naskahSirkulasiRepository.find({
        where: {
          idNaskah: naskah.id,
          sirkuler: 'penerima',
        },
      });

      // Get all tembusan for this naskah
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

      // Build pengirim info
      const pengirimInfo: PengirimInfoDto = {
        position: parseInt(pengirimSirkulasi?.position || '0', 10),
        position_text: pengirimSirkulasi?.positionText || '',
        persnum: parseInt(pengirimSirkulasi?.idSirkuler || '0', 10),
        nama: pengirimSirkulasi?.namaSirkuler || '',
        organization_id: parseInt(pengirimSirkulasi?.organization || '0', 10),
        organization_text: pengirimSirkulasi?.organizationText || '',
        sub_area: parseInt(pengirimSirkulasi?.subArea || '0', 10),
        sub_area_text: pengirimSirkulasi?.subAreaText || '',
        area: pengirimSirkulasi?.area || '',
        area_text: pengirimSirkulasi?.areaText || '',
      };

      // Build penerima info (no read status for draft)
      const penerimaInfoList: PenerimaInfoDto[] = penerimaList.map((penerima) => ({
        position: parseInt(penerima.position || '0', 10),
        position_text: penerima.positionText || '',
        persnum: parseInt(penerima.idSirkuler || '0', 10),
        nama: penerima.namaSirkuler || '',
        organization_id: parseInt(penerima.organization || '0', 10),
        organization_text: penerima.organizationText || '',
        sub_area: parseInt(penerima.subArea || '0', 10),
        sub_area_text: penerima.subAreaText || '',
        area: penerima.area || '',
        area_text: penerima.areaText || '',
        status: 'belum_dibaca' as const,
        readTime: null,
      }));

      // Build tembusan info
      const tembusanInfoList: TembusanInfoDto[] = tembusanList.map((t) => ({
        position: parseInt(t.position || '0', 10),
        position_text: t.positionText || '',
        persnum: parseInt(t.idSirkuler || '0', 10),
        nama: t.namaSirkuler || '',
        organization_id: parseInt(t.organization || '0', 10),
        organization_text: t.organizationText || '',
        sub_area: parseInt(t.subArea || '0', 10),
        sub_area_text: t.subAreaText || '',
        area: t.area || '',
        area_text: t.areaText || '',
      }));

      // Build lampiran info
      const lampiranInfoList: LampiranInfoDto[] = lampiranFiles.map((l) => ({
        id: l.id,
        fileName: l.file_name || '',
        filePath: l.file_pdf || '',
      }));

      // Format tanggal
      const tanggalStr = naskah.tanggal instanceof Date
        ? naskah.tanggal.toISOString().split('T')[0]
        : String(naskah.tanggal || '').split('T')[0];

      results.push({
        id: naskah.id,
        jenis: naskah.jenis || 'SDI',
        nomor: naskah.nomor || '',
        tanggal: tanggalStr,
        status: naskah.status,

        // Kop Naskah (from sdi_sde table)
        kop_logo: sdiData?.kopLogo || null,
        kop_nama: sdiData?.kopNama || null,
        alamat_perusahaan: sdiData?.alamatPerusahaan || null,

        // Header
        klasifikasi: naskah.klasifikasi || '',
        klasifikasi_text: naskah.klasifikasi_text || null,
        sifat: naskah.sifat || '',
        perihal: naskah.perihal || '',
        english: naskah.english === 1 || naskah.english === true,

        // Batang Tubuh
        konten: sdiData?.konten || naskah.konten || null,

        // Kaki (from sdi_sde table)
        nama_tempat: sdiData?.namaTempat || naskah.tempat || null,
        nama_jabatan: sdiData?.namaJabatan || null,
        tanda_tangan: sdiData?.tandaTangan || null,
        nama_lengkap: sdiData?.namaLengkap || null,

        // Sirkulasi
        pengirim: pengirimInfo,
        penerima: penerimaInfoList,
        tembusan: tembusanInfoList,

        // Lampiran
        lampiran: naskah.lampiran || null,
        lampiran_files: lampiranInfoList,

        // Summary
        jumlahPenerima: penerimaList.length,
        jumlahDibaca: 0,
      });
    }

    return {
      success: true,
      data: results,
      total: results.length,
      position: positionData.position,
      position_text: positionData.position_text || '',
      persnum: positionData.persnum,
      nama: positionData.nama || '',
    };
  }
}
