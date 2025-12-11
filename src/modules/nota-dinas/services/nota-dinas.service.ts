import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { NaskahEntity } from '../../../shared/entities/naskah.entity';
import { NaskahSirkulasi } from '../../../shared/entities/naskah_sirkulasi.entity';
import { NaskahLampiranEntity } from '../../../shared/entities/naskah_lampiran.entity';
import { NdEntity } from '../entities/nd.entity';
import {
  NotaDinasRecipientResponseDto,
  OrgDataPositionDto,
} from '../dto/nota-dinas-recipient-response.dto';
import { CreateNotaDinasDto, UpdateDraftDto, FinalizeDraftDto } from '../dto/create-nota-dinas.dto';
import { SendMessageResponseDto, SirkulasiInfoDto } from '../dto/send-message-response.dto';
import { GetSendMessageResponseDto, SendMessageItemDto, PenerimaInfoDto, TembusanInfoDto, LampiranInfoDto } from '../dto/get-send-message.dto';
import { OrgDataService } from 'src/modules/master-data/org_data/org_data.service';
import { NomorSuratService } from '../../../shared/services/nomor-surat.service';
import { StorageService } from '../../storage/services/storage.service';
import { v4 as uuidv4 } from 'uuid';

const COMPANY_ID = 10000; // PERUM LPPNPI
const DEFAULT_KOP_NAMA = 'AirNav Indonesia';
const DEFAULT_KOP_LOGO = '/assets/logo-airnav.png';
const DEFAULT_ALAMAT_PERUSAHAAN = 'Gedung AirNav Indonesia, Jl. Ir. H. Juanda No. 1, Tangerang 15121';

@Injectable()
export class NotaDinasService {
  constructor(
    @InjectRepository(NaskahEntity)
    private readonly naskahRepository: Repository<NaskahEntity>,
    @InjectRepository(NaskahSirkulasi)
    private readonly naskahSirkulasiRepository: Repository<NaskahSirkulasi>,
    @InjectRepository(NaskahLampiranEntity)
    private readonly naskahLampiranRepository: Repository<NaskahLampiranEntity>,
    @InjectRepository(NdEntity)
    private readonly ndRepository: Repository<NdEntity>,
    private readonly dataSource: DataSource,
    private readonly orgDataService: OrgDataService,
    private readonly nomorSuratService: NomorSuratService,
    private readonly storageService: StorageService,
  ) {}

  // ============================================================
  // FORM DATA PARSER
  // ============================================================

  /**
   * Parse form-data body + uploaded files to CreateNotaDinasDto
   */
  async parseFormDataToDto(
    body: any,
    files?: {
      lampiran_files?: Express.Multer.File[];
      final_pdf?: Express.Multer.File[];
    } | Express.Multer.File[],
  ): Promise<CreateNotaDinasDto> {
    // Helper: Parse array field (bisa JSON string atau comma-separated)
    const parseArray = (value: any): number[] => {
      if (!value) return [];
      if (Array.isArray(value)) return value.map(Number);
      if (typeof value === 'string') {
        try {
          // Try parse as JSON
          const parsed = JSON.parse(value);
          return Array.isArray(parsed) ? parsed.map(Number) : [Number(parsed)];
        } catch {
          // Parse as comma-separated
          return value.split(',').map((v: string) => Number(v.trim()));
        }
      }
      return [Number(value)];
    };

    // Upload files to storage
    let lampiranFilePaths: string[] = [];
    let finalPdfPath: string | undefined;

    if (files) {
      // Handle FileFieldsInterceptor format (object with named fields)
      if (!Array.isArray(files)) {
        // Upload lampiran files
        if (files.lampiran_files && files.lampiran_files.length > 0) {
          const uploadPromises = files.lampiran_files.map(file =>
            this.storageService.uploadFile(file, 'nota-dinas/lampiran')
          );
          const uploadResults = await Promise.all(uploadPromises);
          lampiranFilePaths = uploadResults.map(result => result.key);
        }

        // Upload final_pdf file
        if (files.final_pdf && files.final_pdf.length > 0) {
          const uploadResult = await this.storageService.uploadFile(
            files.final_pdf[0],
            'nota-dinas/final'
          );
          finalPdfPath = uploadResult.key;
        }
      } else {
        // Legacy: Handle FilesInterceptor format (array)
        const uploadPromises = files.map(file =>
          this.storageService.uploadFile(file, 'nota-dinas/lampiran')
        );
        const uploadResults = await Promise.all(uploadPromises);
        lampiranFilePaths = uploadResults.map(result => result.key);
      }
    }

    // Build DTO
    const dto: CreateNotaDinasDto = {
      // Sirkulasi
      pengirim: Number(body.pengirim),
      penerima: parseArray(body.penerima),
      tembusan: body.tembusan ? parseArray(body.tembusan) : undefined,

      // Kop
      kop_logo: body.kop_logo,
      kop_nama: body.kop_nama,
      alamat_perusahaan: body.alamat_perusahaan,

      // Data Naskah
      klasifikasi: body.klasifikasi,
      klasifikasi_text: body.klasifikasi_text,
      sifat: body.sifat || 'biasa',
      perihal: body.perihal,
      konten: body.konten,
      english: body.english === 'true' || body.english === true,

      // Kaki
      nama_tempat: body.nama_tempat,
      nama_jabatan: body.nama_jabatan,
      tanda_tangan: body.tanda_tangan,
      nama_lengkap: body.nama_lengkap,

      // Lampiran
      lampiran: body.lampiran,
      lampiran_files: lampiranFilePaths.length > 0 ? lampiranFilePaths : undefined,

      // PDF & Tanggal
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
        this.storageService.uploadFile(file, 'nota-dinas/lampiran')
      );
      const uploadResults = await Promise.all(uploadPromises);
      lampiranFilePaths = uploadResults.map(result => result.key);
    }

    // Build DTO - semua field optional untuk update
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

      final_pdf: body.final_pdf,
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

    // Upload final_pdf file
    let finalPdfPath: string | undefined;
    if (files?.final_pdf && files.final_pdf.length > 0) {
      const uploadResult = await this.storageService.uploadFile(
        files.final_pdf[0],
        'nota-dinas/final'
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
      final_pdf: finalPdfPath || body.final_pdf,
      tgl: body.tgl,
    };

    return dto;
  }

  // ============================================================
  // SEND MESSAGE METHODS
  // ============================================================

  /**
   * Helper: Convert OrgDataPositionDto to SirkulasiInfoDto
   */
  private toSirkulasiInfo(pos: OrgDataPositionDto): SirkulasiInfoDto {
    return {
      position: pos.position,
      position_text: pos.position_text,
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
   * Helper: Create sirkulasi from OrgDataPositionDto
   */
  private createSirkulasiFromOrgData(
    idNaskah: string,
    sirkuler: 'pengirim' | 'penerima' | 'tembusan',
    pos: OrgDataPositionDto,
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
      // Ensure idSirkuler and namaSirkuleri are always populated.
      // Prefer persnum_person/persnum_person_text, fallback to position/position_text if persnum/nama are missing.
      idSirkuler: String(pos.persnum_person ?? pos.position ?? ''),
      namaSirkuler: pos.persnum_person_text ?? pos.position_text ?? '',
      isDraft: isDraft,
    });

    console.log('[ND createSirkulasiFromOrgData] sirkulasi ->', {
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
   * Private method: Core logic untuk create Nota Dinas
   * Digunakan oleh saveDraft dan sendMessage
   */
  private async createNotaDinas(
    dto: CreateNotaDinasDto,
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

    const barisData: OrgDataPositionDto[] = orgData.position_json;

    // PHASE 2: Validate pengirim from org_data
    const pengirim = barisData.find((x) => Number(x.position) === Number(dto.pengirim));
    if (!pengirim) {
      throw new NotFoundException(`Pengirim dengan positionId ${dto.pengirim} tidak ditemukan dalam org_data`);
    }
    if (pengirim.chief !== 1) {
      throw new ForbiddenException(`Position ${dto.pengirim} bukan managerial (chief). Hanya managerial yang dapat mengirim ND.`);
    }

    // PHASE 3: Validate all penerima
    const penerimaList: OrgDataPositionDto[] = [];
    for (const posId of dto.penerima) {
      const penerima = barisData.find((x) => Number(x.position) === Number(posId));
      if (!penerima) {
        throw new NotFoundException(`Penerima dengan positionId ${posId} tidak ditemukan dalam org_data`);
      }
      
      // Check if penerima is managerial
      if (penerima.chief !== 1) {
        throw new ForbiddenException(
          `Penerima ${penerima.position_text} (${posId}) bukan managerial (chief). Nota Dinas hanya dapat dikirim ke managerial.`
        );
      }
      
      penerimaList.push(penerima);
    }

    // PHASE 4: Validate tembusan from org_data (if any)
    const tembusanList: OrgDataPositionDto[] = [];
    if (dto.tembusan && dto.tembusan.length > 0) {
      for (const posId of dto.tembusan) {
        const tembusan = barisData.find((x) => Number(x.position) === Number(posId));
        if (!tembusan) {
          throw new NotFoundException(`Tembusan dengan positionId ${posId} tidak ditemukan dalam org_data`);
        }
        
        // Check if tembusan is managerial
        if (tembusan.chief !== 1) {
          throw new ForbiddenException(
            `Tembusan ${tembusan.position_text} (${posId}) bukan managerial (chief). Tembusan ND hanya dapat dikirim ke managerial.`
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
      // PHASE 6: Generate nomor surat (only for final/final_tte, draft gets temporary nomor)
      const nomorSurat = status === 'draf' 
        ? `DRAFT-${Date.now()}` 
        : (await this.nomorSuratService.generateNomor({
            jenis: 'ND',
            positionText: pengirim.position_text || '',
            positionAbbreviation: pengirim.position_abbreviation || '',
            areaText: pengirim.area_text || 'Pusat',
            tanggal: new Date(),
            klasifikasi: dto.klasifikasi,
          })).nomor;

      // PHASE 7: Insert naskah
      const naskahId = uuidv4();
      const tanggalHariIni = new Date();

      const naskah = this.naskahRepository.create({
        id: naskahId,
        jenis: 'ND',
        klasifikasi: dto.klasifikasi,
        klasifikasi_text: dto.klasifikasi_text || undefined,
        sifat: dto.sifat || 'biasa',
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
            jenis: 'ND',
          });
          await queryRunner.manager.save(lampiran);
        }
      }

      // PHASE 12: Insert ke tabel nd (konten lengkap Nota Dinas)
      const kepadaYthList = penerimaList.map(
        (p) => `${p.position_text} - ${p.organization_text}`
      );
      const kepadaYth = kepadaYthList.join('; ');

      const tembusanTextList = tembusanList.map(
        (t) => `${t.position_text} - ${t.organization_text}`
      );
      const tembusanText = tembusanTextList.length > 0 ? tembusanTextList.join('\n') : null;

      const ndEntity = this.ndRepository.create({
        id: uuidv4(),
        idNaskah: naskahId,
        kopLogo: dto.kop_logo ?? DEFAULT_KOP_LOGO,
        kopNama: dto.kop_nama ?? DEFAULT_KOP_NAMA,
        alamatPerusahaan: dto.alamat_perusahaan ?? DEFAULT_ALAMAT_PERUSAHAAN,
        nomor: nomorSurat,
        kepadaYth: kepadaYth,
        dari: `${pengirim.position_text} - ${pengirim.organization_text}`,
        perihal: dto.perihal,
        konten: dto.konten,
        namaTempat: dto.nama_tempat ?? pengirim.sub_area_text ?? 'Tangerang',
        tanggal: tanggalHariIni,
        namaJabatan: dto.nama_jabatan ?? pengirim.position_text,
        tandaTangan: dto.tanda_tangan ?? null,
        namaLengkap: dto.nama_lengkap ?? pengirim.persnum_person_text,
        tembusan: tembusanText,
      });
      await queryRunner.manager.save(ndEntity);

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
   * Save Draft - Simpan Nota Dinas sebagai draft
   * Status: 'draf'
   */
  async saveDraft(dto: CreateNotaDinasDto): Promise<SendMessageResponseDto> {
    return this.createNotaDinas(dto, 'draf');
  }

  /**
   * Send Message - Kirim Nota Dinas
   * Status: 'final' (tanpa tanda tangan) atau 'final_tte' (dengan tanda tangan)
   */
  async sendMessage(dto: CreateNotaDinasDto): Promise<SendMessageResponseDto> {
    // Determine status based on tanda_tangan
    const status = dto.tanda_tangan ? 'final_tte' : 'final';
    return this.createNotaDinas(dto, status);
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

    if (naskah.jenis !== 'ND') {
      throw new BadRequestException(`Naskah bukan Nota Dinas (ND)`);
    }

    // Use provided date or today for org_data lookup
    const tanggal = dto.tgl ?? new Date().toISOString().split('T')[0];

    // PHASE 2: Get org_data if we need to update sirkulasi
    let barisData: OrgDataPositionDto[] = [];
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
    // First, determine final pengirim position
    let pengirimPosition: OrgDataPositionDto | undefined;
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
        throw new ForbiddenException(`Position ${dto.pengirim} bukan managerial (chief). Hanya managerial yang dapat mengirim ND.`);
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
          position_abbreviation: null,
          sub_area: Number(existingPengirim.subArea),
          area_text: existingPengirim.areaText || 'Pusat',
        } as OrgDataPositionDto;
      }
    }

    // PHASE 4: Generate nomor surat resmi
    const klasifikasi = dto.klasifikasi ?? naskah.klasifikasi ?? '';
    const generatedNomor = await this.nomorSuratService.generateNomor({
      jenis: 'ND',
      positionText: pengirimPosition?.position_text || '',
      positionAbbreviation: pengirimPosition?.position_abbreviation || undefined,
      areaText: pengirimPosition?.area_text || 'Pusat',
      tanggal: new Date(),
      klasifikasi: klasifikasi,
    });
    const nomorSurat = generatedNomor.nomor;

    // PHASE 5: Determine new status - check if tanda_tangan is provided
    // Priority:
    // 1. If dto.tanda_tangan is provided (not undefined), use it for status determination
    // 2. Otherwise, get from existing nd data
    let finalTandaTangan: string | null = null;
    
    if (dto.tanda_tangan !== undefined) {
      // Explicitly set from DTO
      finalTandaTangan = dto.tanda_tangan || null;
    } else {
      // Get from existing nd data
      const existingNd = await this.ndRepository.findOne({
        where: { idNaskah: naskahId },
      });
      finalTandaTangan = existingNd?.tandaTangan || null;
    }

    const newStatus = finalTandaTangan ? 'final_tte' : 'final';

    console.log('[ND finalizeDraft] Status determination:', {
      naskahId,
      dtoTandaTangan: dto.tanda_tangan,
      finalTandaTangan,
      newStatus,
    });

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

      // PHASE 7: Update nd table
      const ndUpdateData: Partial<NdEntity> = {
        nomor: nomorSurat,
        tandaTangan: finalTandaTangan,
      };
      if (dto.kop_logo !== undefined) ndUpdateData.kopLogo = dto.kop_logo;
      if (dto.kop_nama !== undefined) ndUpdateData.kopNama = dto.kop_nama;
      if (dto.alamat_perusahaan !== undefined) ndUpdateData.alamatPerusahaan = dto.alamat_perusahaan;
      if (dto.perihal !== undefined) ndUpdateData.perihal = dto.perihal;
      if (dto.konten !== undefined) ndUpdateData.konten = dto.konten;
      if (dto.nama_tempat !== undefined) ndUpdateData.namaTempat = dto.nama_tempat;
      if (dto.nama_jabatan !== undefined) ndUpdateData.namaJabatan = dto.nama_jabatan;
      if (dto.nama_lengkap !== undefined) ndUpdateData.namaLengkap = dto.nama_lengkap;

      await queryRunner.manager.update(NdEntity, { idNaskah: naskahId }, ndUpdateData);

      // PHASE 8: Handle sirkulasi update if any sirkulasi field is provided
      if (dto.pengirim !== undefined || dto.penerima !== undefined || dto.tembusan !== undefined) {
        // Get valid recipients based on pengirim position
        let allValidPositionIds: number[] = [];
        if (barisData.length > 0 && pengirimPosition) {
          const validRecipients = this.filterByPositionNodin(barisData, Number(pengirimPosition.position));
          allValidPositionIds = [
            ...validRecipients.ATASAN.map((x) => Number(x.position)),
            ...validRecipients.REKAN.map((x) => Number(x.position)),
            ...validRecipients.BAWAHAN.map((x) => Number(x.position)),
          ];
        }

        // Validate penerima
        let penerimaList: OrgDataPositionDto[] = [];
        if (dto.penerima !== undefined) {
          for (const posId of dto.penerima) {
            const penerima = barisData.find((x) => Number(x.position) === Number(posId));
            if (!penerima) {
              throw new NotFoundException(`Penerima dengan positionId ${posId} tidak ditemukan dalam org_data`);
            }
            if (penerima.chief !== 1) {
              throw new ForbiddenException(
                `Penerima ${penerima.position_text} (${posId}) bukan managerial (chief). Nota Dinas hanya dapat dikirim ke managerial.`
              );
            }
            if (!allValidPositionIds.includes(Number(posId))) {
              let errorMsg = `Penerima ${penerima.position_text} (${posId}) bukan merupakan atasan langsung, bawahan langsung, atau rekan dari pengirim.`;
              if (pengirimPosition && penerima.sub_area !== pengirimPosition.sub_area) {
                errorMsg += ` Penerima berada di sub area berbeda (${penerima.sub_area_text}).`;
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
        let tembusanList: OrgDataPositionDto[] = [];
        if (dto.tembusan !== undefined && dto.tembusan.length > 0) {
          for (const posId of dto.tembusan) {
            const tembusan = barisData.find((x) => Number(x.position) === Number(posId));
            if (!tembusan) {
              throw new NotFoundException(`Tembusan dengan positionId ${posId} tidak ditemukan dalam org_data`);
            }
            if (tembusan.chief !== 1) {
              throw new ForbiddenException(
                `Tembusan ${tembusan.position_text} (${posId}) bukan managerial (chief). Tembusan ND hanya dapat dikirim ke managerial.`
              );
            }
            if (!allValidPositionIds.includes(Number(posId))) {
              let errorMsg = `Tembusan ${tembusan.position_text} (${posId}) bukan merupakan atasan langsung, bawahan langsung, atau rekan dari pengirim.`;
              if (pengirimPosition && tembusan.sub_area !== pengirimPosition.sub_area) {
                errorMsg += ` Tembusan berada di sub area berbeda (${tembusan.sub_area_text}).`;
              }
              throw new BadRequestException(errorMsg);
            }
            tembusanList.push(tembusan);
          }
        }

        // Delete ALL sirkulasi for this naskah
        await queryRunner.manager.delete(NaskahSirkulasi, { idNaskah: naskahId });

        // Get full pengirim position data if we only have partial
        let fullPengirimPosition: OrgDataPositionDto | undefined = pengirimPosition;
        if (dto.pengirim === undefined && barisData.length > 0) {
          fullPengirimPosition = barisData.find((x) => Number(x.position) === Number(pengirimPosition?.position));
        }

        // Re-insert pengirim with is_draft = FALSE (finalized!)
        if (fullPengirimPosition && fullPengirimPosition.position_text) {
          const pengirimSirkulasi = this.createSirkulasiFromOrgData(naskahId, 'pengirim', fullPengirimPosition, false);
          await queryRunner.manager.save(pengirimSirkulasi);

          // Update nd.dari
          await queryRunner.manager.update(
            NdEntity,
            { idNaskah: naskahId },
            { dari: `${fullPengirimPosition.position_text} - ${fullPengirimPosition.organization_text}` },
          );
        }

        // Re-insert penerima with is_draft = FALSE
        for (const penerima of penerimaList) {
          const penerimaSirkulasi = this.createSirkulasiFromOrgData(naskahId, 'penerima', penerima, false);
          await queryRunner.manager.save(penerimaSirkulasi);
        }

        // Update nd.kepadaYth
        const kepadaYthList = penerimaList.map(
          (p) => `${p.position_text} - ${p.organization_text}`,
        );
        await queryRunner.manager.update(
          NdEntity,
          { idNaskah: naskahId },
          { kepadaYth: kepadaYthList.join('; ') },
        );

        // Re-insert tembusan with is_draft = FALSE
        for (const tembusan of tembusanList) {
          const tembusanSirkulasi = this.createSirkulasiFromOrgData(naskahId, 'tembusan', tembusan, false);
          await queryRunner.manager.save(tembusanSirkulasi);
        }

        // Update nd.tembusan
        if (tembusanList.length > 0) {
          const tembusanTextList = tembusanList.map(
            (t) => `${t.position_text} - ${t.organization_text}`,
          );
          await queryRunner.manager.update(
            NdEntity,
            { idNaskah: naskahId },
            { tembusan: tembusanTextList.join('\n') },
          );
        } else {
          await queryRunner.manager.update(
            NdEntity,
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
            jenis: 'ND',
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
        jenis: 'ND',
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
   * Update Draft - Update data draft Nota Dinas (status tetap draf)
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

    if (naskah.jenis !== 'ND') {
      throw new BadRequestException(`Naskah bukan Nota Dinas (ND)`);
    }

    // Use provided date or today for org_data lookup
    const tanggal = dto.tgl ?? new Date().toISOString().split('T')[0];

    // PHASE 2: Get org_data if we need to update sirkulasi
    let barisData: OrgDataPositionDto[] = [];
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

      // PHASE 4: Update nd table (only fields that are provided)
      const ndUpdateData: Partial<NdEntity> = {};
      if (dto.kop_logo !== undefined) ndUpdateData.kopLogo = dto.kop_logo;
      if (dto.kop_nama !== undefined) ndUpdateData.kopNama = dto.kop_nama;
      if (dto.alamat_perusahaan !== undefined) ndUpdateData.alamatPerusahaan = dto.alamat_perusahaan;
      if (dto.perihal !== undefined) ndUpdateData.perihal = dto.perihal;
      if (dto.konten !== undefined) ndUpdateData.konten = dto.konten;
      if (dto.nama_tempat !== undefined) ndUpdateData.namaTempat = dto.nama_tempat;
      if (dto.nama_jabatan !== undefined) ndUpdateData.namaJabatan = dto.nama_jabatan;
      if (dto.tanda_tangan !== undefined) ndUpdateData.tandaTangan = dto.tanda_tangan;
      if (dto.nama_lengkap !== undefined) ndUpdateData.namaLengkap = dto.nama_lengkap;

      if (Object.keys(ndUpdateData).length > 0) {
        await queryRunner.manager.update(NdEntity, { idNaskah: naskahId }, ndUpdateData);
      }

      // PHASE 5: Handle sirkulasi - ALWAYS delete all and re-insert
      // pengirim & penerima: if not provided, use existing
      // tembusan: if not provided, will be removed (destroy all behavior)
      if (dto.pengirim !== undefined || dto.penerima !== undefined || dto.tembusan !== undefined) {
        // Get existing pengirim for fallback if not provided in dto
        let pengirimPosition: OrgDataPositionDto | undefined;
        if (dto.pengirim !== undefined) {
          pengirimPosition = barisData.find((x) => Number(x.position) === Number(dto.pengirim));
          if (!pengirimPosition) {
            throw new NotFoundException(`Pengirim dengan positionId ${dto.pengirim} tidak ditemukan dalam org_data`);
          }
          if (pengirimPosition.chief !== 1) {
            throw new ForbiddenException(`Position ${dto.pengirim} bukan managerial (chief). Hanya managerial yang dapat mengirim ND.`);
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

        // Get valid recipients based on pengirim position
        // Nota Dinas hanya bisa dikirim ke: ATASAN langsung, BAWAHAN langsung, atau REKAN (satu induk, satu sub_area)
        let allValidPositionIds: number[] = [];
        if (pengirimPosition) {
          const validRecipients = this.filterByPositionNodin(barisData, Number(pengirimPosition.position));
          allValidPositionIds = [
            ...validRecipients.ATASAN.map((x) => Number(x.position)),
            ...validRecipients.REKAN.map((x) => Number(x.position)),
            ...validRecipients.BAWAHAN.map((x) => Number(x.position)),
          ];
        }

        // Validate penerima - must be in valid recipients list
        let penerimaList: OrgDataPositionDto[] = [];
        if (dto.penerima !== undefined) {
          for (const posId of dto.penerima) {
            const penerima = barisData.find((x) => Number(x.position) === Number(posId));
            if (!penerima) {
              throw new NotFoundException(`Penerima dengan positionId ${posId} tidak ditemukan dalam org_data`);
            }
            
            // Check if penerima is managerial
            if (penerima.chief !== 1) {
              throw new ForbiddenException(
                `Penerima ${penerima.position_text} (${posId}) bukan managerial (chief). Nota Dinas hanya dapat dikirim ke managerial.`
              );
            }
            
            // Check if penerima is in valid recipients (ATASAN/REKAN/BAWAHAN)
            if (!allValidPositionIds.includes(Number(posId))) {
              let errorMsg = `Penerima ${penerima.position_text} (${posId}) bukan merupakan atasan langsung, bawahan langsung, atau rekan dari pengirim.`;
              
              if (pengirimPosition && penerima.sub_area !== pengirimPosition.sub_area) {
                errorMsg += ` Penerima berada di sub area berbeda (${penerima.sub_area_text}).`;
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
        // Tembusan juga harus dalam valid recipients (ATASAN/REKAN/BAWAHAN)
        let tembusanList: OrgDataPositionDto[] = [];
        if (dto.tembusan !== undefined && dto.tembusan.length > 0) {
          for (const posId of dto.tembusan) {
            const tembusan = barisData.find((x) => Number(x.position) === Number(posId));
            if (!tembusan) {
              throw new NotFoundException(`Tembusan dengan positionId ${posId} tidak ditemukan dalam org_data`);
            }
            
            // Check if tembusan is managerial
            if (tembusan.chief !== 1) {
              throw new ForbiddenException(
                `Tembusan ${tembusan.position_text} (${posId}) bukan managerial (chief). Tembusan ND hanya dapat dikirim ke managerial.`
              );
            }
            
            // Check if tembusan is in valid recipients (ATASAN/REKAN/BAWAHAN)
            if (!allValidPositionIds.includes(Number(posId))) {
              let errorMsg = `Tembusan ${tembusan.position_text} (${posId}) bukan merupakan atasan langsung, bawahan langsung, atau rekan dari pengirim.`;
              
              if (pengirimPosition && tembusan.sub_area !== pengirimPosition.sub_area) {
                errorMsg += ` Tembusan berada di sub area berbeda (${tembusan.sub_area_text}).`;
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

          // Update nd.dari if pengirim changed
          if (dto.pengirim !== undefined) {
            await queryRunner.manager.update(
              NdEntity,
              { idNaskah: naskahId },
              { dari: `${pengirimPosition.position_text} - ${pengirimPosition.organization_text}` },
            );
          }
        }

        // Re-insert penerima with is_draft = true
        for (const penerima of penerimaList) {
          const penerimaSirkulasi = this.createSirkulasiFromOrgData(naskahId, 'penerima', penerima, true);
          await queryRunner.manager.save(penerimaSirkulasi);
        }

        // Update nd.kepadaYth
        const kepadaYthList = penerimaList.map(
          (p) => `${p.position_text} - ${p.organization_text}`,
        );
        await queryRunner.manager.update(
          NdEntity,
          { idNaskah: naskahId },
          { kepadaYth: kepadaYthList.join('; ') },
        );

        // Re-insert tembusan with is_draft = true (only if there are any)
        for (const tembusan of tembusanList) {
          const tembusanSirkulasi = this.createSirkulasiFromOrgData(naskahId, 'tembusan', tembusan, true);
          await queryRunner.manager.save(tembusanSirkulasi);
        }

        // Update nd.tembusan
        if (tembusanList.length > 0) {
          const tembusanTextList = tembusanList.map(
            (t) => `${t.position_text} - ${t.organization_text}`,
          );
          await queryRunner.manager.update(
            NdEntity,
            { idNaskah: naskahId },
            { tembusan: tembusanTextList.join('\n') },
          );
        } else {
          // Clear tembusan in nd
          await queryRunner.manager.update(
            NdEntity,
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
            jenis: 'ND',
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

    // PHASE 9: Get updated data for response
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
        jenis: 'ND',
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
  // GET DRAFT LIST - Get all drafts by position
  // ============================================================

  /**
   * Get all draft Nota Dinas by position (where position is pengirim)
   * Returns list of draft messages
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

    const barisData: OrgDataPositionDto[] = orgData.position_json;

    // Find position by position ID
    const positionData = barisData.find(
      (pos: OrgDataPositionDto) => Number(pos.position) === Number(positionId)
    );

    if (!positionData) {
      throw new NotFoundException(`Position dengan id ${positionId} tidak ditemukan di org_data`);
    }

    const positionIdStr = String(positionId);

    // Get all naskah where position is pengirim, jenis = ND, and status = draf
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
      .andWhere('naskah.jenis = :jenis', { jenis: 'ND' })
      .andWhere('naskah.status = :status', { status: 'draf' })
      .orderBy('naskah.tanggal', 'DESC')
      .getRawMany();

    // Build response with full data for each naskah
    const results: SendMessageItemDto[] = [];

    for (const naskah of draftNaskahList) {
      // Get nd data for this naskah
      const ndData = await this.ndRepository.findOne({
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

      // Build penerima info (no read status for draft)
      const penerimaInfoList: PenerimaInfoDto[] = penerimaList.map((penerima) => ({
        persnum: parseInt(penerima.idSirkuler || '0', 10),
        nama: penerima.namaSirkuler || '',
        organizationText: penerima.organizationText || '',
        positionText: penerima.positionText || '',
        status: 'belum_dibaca' as const,
        readTime: null,
      }));

      // Build tembusan info
      const tembusanInfoList: TembusanInfoDto[] = tembusanList.map((t) => ({
        persnum: parseInt(t.idSirkuler || '0', 10),
        nama: t.namaSirkuler || '',
        organizationText: t.organizationText || '',
        positionText: t.positionText || '',
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
        jenis: naskah.jenis || 'ND',
        nomor: naskah.nomor || '',
        tanggal: tanggalStr,
        status: naskah.status,

        // Kop Naskah (from nd table)
        kop_logo: ndData?.kopLogo || null,
        kop_nama: ndData?.kopNama || null,
        alamat_perusahaan: ndData?.alamatPerusahaan || null,

        // Header
        klasifikasi: naskah.klasifikasi || '',
        klasifikasi_text: naskah.klasifikasi_text || null,
        sifat: naskah.sifat || '',
        perihal: naskah.perihal || '',
        english: naskah.english === 1 || naskah.english === true,

        // Batang Tubuh
        konten: ndData?.konten || naskah.konten || null,

        // Kaki (from nd table)
        nama_tempat: ndData?.namaTempat || naskah.tempat || null,
        nama_jabatan: ndData?.namaJabatan || null,
        tanda_tangan: ndData?.tandaTangan || null,
        nama_lengkap: ndData?.namaLengkap || null,

        // Sirkulasi
        pengirim: {
          persnum: parseInt(pengirimSirkulasi?.idSirkuler || '0', 10),
          nama: pengirimSirkulasi?.namaSirkuler || '',
          positionText: pengirimSirkulasi?.positionText || '',
          organizationText: pengirimSirkulasi?.organizationText || '',
        },
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
      positionId,
      positionText: positionData.position_text || '',
      nama: positionData.persnum_person_text || '',
    };
  }

  // ============================================================
  // GET SEND MESSAGE - Get all sent messages by position
  // ============================================================

  /**
   * Get all Nota Dinas sent by a position (where position is pengirim)
   * Returns list of sent messages with recipient read status
   * @param positionId - The position ID of the sender
   * @param tgl - Optional date for validation (default: today)
   */
  async getSendMessage(positionId: number, tgl?: string): Promise<GetSendMessageResponseDto> {
    // Get org_data to validate position exists
    const tanggal = tgl ?? new Date().toISOString().split('T')[0];
    const orgData = await this.orgDataService.findOrg(tanggal);
    
    if (!orgData || !orgData.position_json) {
      throw new NotFoundException('Data organisasi tidak ditemukan');
    }

    const barisData: OrgDataPositionDto[] = orgData.position_json;

    // Find position by position ID
    const positionData = barisData.find(
      (pos: OrgDataPositionDto) => Number(pos.position) === Number(positionId)
    );

    if (!positionData) {
      throw new NotFoundException(`Position dengan id ${positionId} tidak ditemukan di org_data`);
    }

    const positionIdStr = String(positionId);

    // Get all naskah where position is pengirim, jenis = ND, and status = final or final_tte
    const sentNaskahList = await this.naskahSirkulasiRepository
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
      .andWhere('naskah.jenis = :jenis', { jenis: 'ND' })
      .andWhere('naskah.status IN (:...statuses)', { statuses: ['final', 'final_tte'] })
      .orderBy('naskah.tanggal', 'DESC')
      .getRawMany();

    // Build response with full data for each naskah
    const results: SendMessageItemDto[] = [];

    for (const naskah of sentNaskahList) {
      // Get nd data for this naskah
      const ndData = await this.ndRepository.findOne({
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

      // Build tembusan info
      const tembusanInfoList: TembusanInfoDto[] = tembusanList.map((t) => ({
        persnum: parseInt(t.idSirkuler || '0', 10),
        nama: t.namaSirkuler || '',
        organizationText: t.organizationText || '',
        positionText: t.positionText || '',
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
        jenis: naskah.jenis || 'ND',
        nomor: naskah.nomor || '',
        tanggal: tanggalStr,
        status: naskah.status,

        // Kop Naskah (from nd table)
        kop_logo: ndData?.kopLogo || null,
        kop_nama: ndData?.kopNama || null,
        alamat_perusahaan: ndData?.alamatPerusahaan || null,

        // Header
        klasifikasi: naskah.klasifikasi || '',
        klasifikasi_text: naskah.klasifikasi_text || null,
        sifat: naskah.sifat || '',
        perihal: naskah.perihal || '',
        english: naskah.english === 1 || naskah.english === true,

        // Batang Tubuh
        konten: ndData?.konten || naskah.konten || null,

        // Kaki (from nd table)
        nama_tempat: ndData?.namaTempat || naskah.tempat || null,
        nama_jabatan: ndData?.namaJabatan || null,
        tanda_tangan: ndData?.tandaTangan || null,
        nama_lengkap: ndData?.namaLengkap || null,

        // Sirkulasi
        pengirim: {
          persnum: parseInt(pengirimSirkulasi?.idSirkuler || '0', 10),
          nama: pengirimSirkulasi?.namaSirkuler || '',
          positionText: pengirimSirkulasi?.positionText || '',
          organizationText: pengirimSirkulasi?.organizationText || '',
        },
        penerima: penerimaInfoList,
        tembusan: tembusanInfoList,

        // Lampiran
        lampiran: naskah.lampiran || null,
        lampiran_files: lampiranInfoList,

        // Summary
        jumlahPenerima: penerimaList.length,
        jumlahDibaca,
      });
    }

    return {
      success: true,
      data: results,
      total: results.length,
      positionId,
      positionText: positionData.position_text || '',
      nama: positionData.persnum_person_text || '',
    };
  }

  // ============================================================
  // GET RECIPIENT - Using org_data (cached organization data)
  // ============================================================

  /**
   * Filter recipients for Nota Dinas based on position hierarchy
   * 
   * Rules:
   * - ATASAN: chief=1, level-1, organization_id = current.organization_parent, same sub_area
   * - REKAN: chief=1, same level, same organization_parent (satu induk), same sub_area, bukan dirinya
   * - BAWAHAN: chief=1, level+1, organization_parent = current.organization_id, same sub_area
   */
  private filterByPositionNodin(barisData: OrgDataPositionDto[], positionParam: number): {
    ATASAN: OrgDataPositionDto[];
    REKAN: OrgDataPositionDto[];
    BAWAHAN: OrgDataPositionDto[];
  } {
    // Cari item current berdasarkan position
    const current = barisData.find((x) => Number(x.position) === Number(positionParam));
    if (!current) {
      return { ATASAN: [], REKAN: [], BAWAHAN: [] };
    }

    const currentLevel = Number(current.level);

    // Filter: chief=1, same sub_area
    const filtered = barisData.filter(
      (x) => x.chief === 1 && x.sub_area === current.sub_area,
    );

    // Debug log
    console.log(`[filterByPositionNodin] Current:`, {
      position: current.position,
      position_text: current.position_text,
      level: currentLevel,
      organization_id: current.organization_id,
      organization_parent: current.organization_parent,
      sub_area: current.sub_area,
      departType: current.departType,
    });

    // ATASAN: 1 level di atas, organization_id = current.organization_parent
    const parentLevel = filtered.filter(
      (x) =>
        x.level === currentLevel - 1 &&
        Number(x.organization_id) === Number(current.organization_parent),
    );

    // REKAN: same level, same organization_parent (satu induk), bukan dirinya
    const sameLevel = filtered.filter(
      (x) =>
        x.level === currentLevel &&
        Number(x.organization_parent) === Number(current.organization_parent) &&
        Number(x.position) !== Number(positionParam),
    );

    // BAWAHAN: 1 level di bawah, organization_parent = current.organization_id
    const potentialBawahan = filtered.filter((x) => x.level === currentLevel + 1);
    
    console.log(`[filterByPositionNodin] Potential bawahan (level ${currentLevel + 1}, count=${potentialBawahan.length}):`);
    potentialBawahan.forEach((x) => {
      console.log(`  - ${x.position_text}: org_parent=${x.organization_parent}, current.org_id=${current.organization_id}, match=${x.organization_parent == current.organization_id}`);
    });

    const downLevel = potentialBawahan.filter(
      (x) => x.organization_parent == current.organization_id,
    );

    console.log(`[filterByPositionNodin] Results: ATASAN=${parentLevel.length}, REKAN=${sameLevel.length}, BAWAHAN=${downLevel.length}`);

    return {
      ATASAN: parentLevel,
      REKAN: sameLevel,
      BAWAHAN: downLevel,
    };
  }

  /**
   * Get recipients for Nota Dinas using org_data
   * @param positionId - Position ID of the sender
   * @param tgl - Optional date (default: today)
   */
  async getNotaDinasRecipients(
    positionId: number,
    tgl?: string,
  ): Promise<NotaDinasRecipientResponseDto> {
    // Use today's date if not provided
    const tanggal = tgl ?? new Date().toISOString().split('T')[0];

    console.log(`[getNotaDinasRecipients] Looking for positionId: ${positionId}, tanggal: ${tanggal}`);

    // Get cached org data from org_data service
    const orgData = await this.orgDataService.findOrg(tanggal);

    if (!orgData || !orgData.position_json) {
      throw new NotFoundException(`Data organisasi untuk tanggal ${tanggal} tidak ditemukan. Silakan generate data org terlebih dahulu via GET /org-data?tgl=${tanggal}`);
    }

    const barisData: OrgDataPositionDto[] = orgData.position_json;

    console.log(`[getNotaDinasRecipients] Total positions in org_data: ${barisData.length}`);

    // Find sender's position data
    const sender = barisData.find((x) => Number(x.position) === Number(positionId));

    if (!sender) {
      throw new NotFoundException(`Position dengan ID ${positionId} tidak ditemukan dalam data organisasi tanggal ${tanggal}`);
    }

    console.log(`[getNotaDinasRecipients] Found sender:`, sender.position_text);

    // Verify sender is chief (managerial)
    if (sender.chief !== 1) {
      throw new ForbiddenException(
        `Position ${positionId} bukan managerial (chief). Hanya managerial yang dapat mengirim Nota Dinas.`,
      );
    }

    // Filter recipients using the same logic as org_data.controller
    const recipients = this.filterByPositionNodin(barisData, positionId);

    return {
      sender,
      recipients,
    };
  }

  // ============================================================
  // GET NOTA DINAS DETAIL
  // ============================================================

  /**
   * Get detail Nota Dinas by ID
   * Menampilkan keseluruhan informasi surat termasuk PDF final
   */
  async getNotaDinasDetail(naskahId: string): Promise<any> {
    // Get naskah data
    const naskah = await this.naskahRepository.findOne({
      where: { id: naskahId },
    });

    if (!naskah) {
      throw new NotFoundException(`Naskah dengan id ${naskahId} tidak ditemukan`);
    }

    if (naskah.jenis !== 'ND') {
      throw new NotFoundException(`Naskah bukan Nota Dinas (ND)`);
    }

    // Get nd data (konten lengkap ND)
    const ndData = await this.ndRepository.findOne({
      where: { idNaskah: naskahId },
    });

    // Get pengirim sirkulasi
    const pengirimSirkulasi = await this.naskahSirkulasiRepository.findOne({
      where: {
        idNaskah: naskahId,
        sirkuler: 'pengirim',
      },
    });

    // Get all penerima sirkulasi
    const penerimaList = await this.naskahSirkulasiRepository.find({
      where: {
        idNaskah: naskahId,
        sirkuler: 'penerima',
      },
    });

    // Get all tembusan sirkulasi
    const tembusanList = await this.naskahSirkulasiRepository.find({
      where: {
        idNaskah: naskahId,
        sirkuler: 'tembusan',
      },
    });

    // Get lampiran files
    const lampiranFiles = await this.naskahLampiranRepository.find({
      where: { id_naskah: naskahId },
    });

    // Format tanggal
    const tanggalStr = naskah.tanggal instanceof Date
      ? naskah.tanggal.toISOString().split('T')[0]
      : String(naskah.tanggal || '').split('T')[0];

    // Build penerima info with read status
    const penerimaInfoList = penerimaList.map((penerima) => ({
      id: penerima.id,
      persnum: parseInt(penerima.idSirkuler || '0', 10),
      nama: penerima.namaSirkuler || '',
      positionText: penerima.positionText || '',
      organizationText: penerima.organizationText || '',
      subAreaText: penerima.subAreaText || '',
      areaText: penerima.areaText || '',
      status: penerima.sendReadTime ? 'dibaca' : 'belum_dibaca',
      readTime: penerima.sendReadTime ? penerima.sendReadTime.toISOString() : null,
    }));

    // Build tembusan info
    const tembusanInfoList = tembusanList.map((tembusan) => ({
      id: tembusan.id,
      persnum: parseInt(tembusan.idSirkuler || '0', 10),
      nama: tembusan.namaSirkuler || '',
      positionText: tembusan.positionText || '',
      organizationText: tembusan.organizationText || '',
      subAreaText: tembusan.subAreaText || '',
      areaText: tembusan.areaText || '',
    }));

    // Build lampiran info
    const lampiranInfoList = lampiranFiles.map((l) => ({
      id: l.id,
      fileName: l.file_name || '',
      filePath: l.file_pdf || '',
    }));

    // Build response
    return {
      success: true,
      data: {
        // Naskah info
        id: naskah.id,
        jenis: naskah.jenis,
        nomor: naskah.nomor,
        tanggal: tanggalStr,
        status: naskah.status,
        perihal: naskah.perihal,
        lampiran: naskah.lampiran || null,
        english: !!naskah.english,

        // ND specific info
        kepada_yth: ndData?.kepadaYth || '',
        dari: ndData?.dari || '',
        tembusan_text: ndData?.tembusan || null,

        // Kop
        kop_logo: ndData?.kopLogo || null,
        kop_nama: ndData?.kopNama || null,
        alamat_perusahaan: ndData?.alamatPerusahaan || null,

        // Header
        klasifikasi: naskah.klasifikasi || '',
        klasifikasi_text: naskah.klasifikasi_text || null,
        sifat: naskah.sifat || '',

        // Body
        konten: ndData?.konten || naskah.konten || null,

        // Footer
        nama_tempat: ndData?.namaTempat || null,
        nama_jabatan: ndData?.namaJabatan || null,
        tanda_tangan: ndData?.tandaTangan || null,
        nama_lengkap: ndData?.namaLengkap || null,

        // Sirkulasi
        pengirim: {
          id: pengirimSirkulasi?.id || '',
          persnum: pengirimSirkulasi ? parseInt(pengirimSirkulasi.idSirkuler || '0', 10) : 0,
          nama: pengirimSirkulasi?.namaSirkuler || '',
          positionText: pengirimSirkulasi?.positionText || '',
          organizationText: pengirimSirkulasi?.organizationText || '',
          subAreaText: pengirimSirkulasi?.subAreaText || '',
          areaText: pengirimSirkulasi?.areaText || '',
        },
        penerima: penerimaInfoList,
        tembusan: tembusanInfoList,

        // Files
        lampiran_files: lampiranInfoList,
        final_pdf: naskah.final_pdf || null,

        // Metadata
        created_at: null,
        updated_at: null,
      },
    };
  }
}

