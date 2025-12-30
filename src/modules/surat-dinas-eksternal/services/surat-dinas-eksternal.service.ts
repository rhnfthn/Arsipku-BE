import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { PDFDocument } from 'pdf-lib';
import { EksternalEntity } from '../../eksternal/entities/eksternal.entity';
import { NaskahEntity } from '../../../shared/entities/naskah.entity';
import { NaskahSirkulasi } from '../../../shared/entities/naskah_sirkulasi.entity';
import { NaskahLampiranEntity } from '../../../shared/entities/naskah_lampiran.entity';
import { SdiSdeEntity } from '../entities/sdi_sde.entity';
import { NomorEntity } from '../../nomor/entities/nomor.entity';
import { NomorRequestEntity } from '../../nomor/entities/nomor-request.entity';
import { NomorRequestDetailEntity } from '../../nomor/entities/nomor-request-detail.entity';
import { JenisEntity } from '../../nomor/entities/jenis.entity';
import {
  SdeRecipientResponseDto,
  EksternalRecipientDto,
  SdeOrgDataPositionDto,
} from '../dto/sde-recipient-response.dto';
import { CreateSuratDinasEksternalDto, UpdateSdeDraftDto, FinalizeSdeDraftDto } from '../dto/create-surat-dinas-eksternal.dto';
import { SdeSendMessageResponseDto, SdeSirkulasiInfoDto, SdePenerimaInfoDto } from '../dto/send-message-response.dto';
import { OrgDataService } from 'src/modules/master-data/org_data/org_data.service';
import { NomorSuratService } from '../../../shared/services/nomor-surat.service';
import { StorageService } from '../../storage/services/storage.service';
import { GeneratePdfSudinService } from '../../generate_pdf/services/generate_pdf_sudin.service';
import { v4 as uuidv4 } from 'uuid';

const COMPANY_ID = 10000; // PERUM LPPNPI
const DEFAULT_KOP_NAMA = 'AirNav Indonesia';
const DEFAULT_KOP_LOGO = '/assets/logo-airnav.png';
const DEFAULT_ALAMAT_PERUSAHAAN = 'Gedung AirNav Indonesia, Jl. Ir. H. Juanda No. 1, Tangerang 15121';

@Injectable()
export class SuratDinasEksternalService {
  constructor(
    @InjectRepository(EksternalEntity)
    private readonly eksternalRepository: Repository<EksternalEntity>,
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
    @InjectRepository(NomorRequestEntity)
    private readonly nomorRequestRepository: Repository<NomorRequestEntity>,
    @InjectRepository(NomorRequestDetailEntity)
    private readonly nomorRequestDetailRepository: Repository<NomorRequestDetailEntity>,
    @InjectRepository(JenisEntity)
    private readonly jenisRepository: Repository<JenisEntity>,
    private readonly dataSource: DataSource,
    private readonly orgDataService: OrgDataService,
    private readonly nomorSuratService: NomorSuratService,
    private readonly storageService: StorageService,
    private readonly generatePdfSudinService: GeneratePdfSudinService,
  ) {}

  // ============================================================
  // HELPER: DATE UTILITIES (TIMEZONE-SAFE)
  // ============================================================

  /**
   * Helper: Parse date string "YYYY-MM-DD" to Date object with local timezone
   * Prevents timezone offset issues when parsing date strings
   */
  private parseDateString(dateStr: string): Date {
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day);
  }

  /**
   * Helper: Format Date object to "YYYY-MM-DD" string using local timezone
   * Prevents timezone offset issues when converting Date to string
   */
  private formatDateToString(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Helper: Convert array of position IDs to position names
   * Uses org_data to lookup position information
   * 
   * @param positionIds - Array of position IDs (can be string or number)
   * @param tanggal - Optional date for org_data lookup (default: today)
   * @returns Array of position text names
   */
  async convertPositionIdsToNames(
    positionIds: (string | number)[],
    tanggal?: string,
  ): Promise<string[]> {
    if (!positionIds || positionIds.length === 0) {
      return [];
    }

    // Get org_data for position lookup
    const tgl = tanggal || new Date().toISOString().split('T')[0];
    const orgData = await this.orgDataService.findOrg(tgl);
    
    if (!orgData || !orgData.position_json) {
      return positionIds.map(id => String(id)); // Fallback to IDs as strings
    }

    const barisData = orgData.position_json;
    const names: string[] = [];

    for (const posId of positionIds) {
      const numericId = typeof posId === 'string' ? parseInt(posId, 10) : posId;
      const position = barisData.find((p: any) => p.position === numericId);
      
      if (position) {
        // Return position_text with organization_text
        const fullName = `${position.position_text} - ${position.organization_text}`;
        names.push(fullName);
      } else {
        // Fallback if position not found
        names.push(String(posId));
      }
    }

    return names;
  }

  /**
   * Helper: Validate and get penerima eksternal entities
   * Skips empty/invalid IDs and returns found entities
   */
  private async validatePenerimaEksternal(
    penerimaIds: string[],
    throwOnNotFound: boolean = false,
  ): Promise<EksternalEntity[]> {
    const penerimaList: EksternalEntity[] = [];
    
    if (!penerimaIds || penerimaIds.length === 0) {
      return penerimaList;
    }

    console.log('🔍 Validating penerima eksternal:', penerimaIds);

    for (const eksternalId of penerimaIds) {
      // Skip empty values
      const cleanId = String(eksternalId).trim();
      if (!cleanId || cleanId === '' || cleanId === '[]' || cleanId === 'undefined') {
        console.log('⚠️ Skipping invalid penerima ID:', eksternalId);
        continue;
      }

      console.log('🔍 Looking up eksternal ID:', cleanId);

      const eksternal = await this.eksternalRepository.findOne({
        where: { id: cleanId, aktif: true },
      });

      if (!eksternal) {
        console.log('❌ Eksternal not found:', cleanId);
        if (throwOnNotFound) {
          throw new NotFoundException(
            `Penerima eksternal dengan id ${cleanId} tidak ditemukan atau tidak aktif`,
          );
        }
        continue; // Skip if not throwing
      }

      console.log('✅ Eksternal found:', eksternal.nama);
      penerimaList.push(eksternal);
    }

    return penerimaList;
  }

  /**
   * Helper: Convert array of eksternal UUIDs to company names
   * Uses eksternal table to lookup company information
   * 
   * @param eksternalIds - Array of eksternal UUIDs
   * @returns Array of company names
   */
  async convertEksternalIdsToNames(
    eksternalIds: string[],
  ): Promise<string[]> {
    if (!eksternalIds || eksternalIds.length === 0) {
      return [];
    }

    const names: string[] = [];

    for (const extId of eksternalIds) {
      const cleanId = String(extId).trim();
      
      // Check if it's a UUID (contains dashes)
      const isUuid = cleanId.includes('-') && cleanId.length === 36;
      
      if (isUuid) {
        const eksternal = await this.eksternalRepository.findOne({
          where: { id: cleanId, aktif: true },
        });
        
        if (eksternal) {
          names.push(eksternal.nama);
        } else {
          // Fallback to ID if not found
          names.push(cleanId);
        }
      } else {
        // Not a UUID, just return as is (might be a name already)
        names.push(cleanId);
      }
    }

    return names;
  }

  // ============================================================
  // PDF GENERATION
  // ============================================================

  /**
   * Generate PDF dari HTML content untuk Surat Dinas Eksternal
   * Menggunakan Puppeteer di backend untuk render HTML
   * Support temporary lampiran system (lampiran_temp_ids)
   */
  async generatePdfFromHtml(
    htmlContent: string,
    penerima: string[],
    namaTempat: string = 'Tangerang',
    tanggal: string = '',
    namaJabatan: string = '',
    namaLengkap: string = '',
    tembusan: string[] = [],
    lampiranTempIds?: string[],
    perihal: string = '',
    sifat: string = 'Biasa',
    nomor: string = '',
    lampiran: string = '-',
  ): Promise<Buffer> {
    try {
      // Determine lampiran text: use file names from lampiran_temp_ids if available
      let lampiranText = lampiran;
      let lampiranFiles: any[] = [];
      
      if (lampiranTempIds && lampiranTempIds.length > 0) {
        lampiranFiles = await this.getTemporaryLampiranFiles(lampiranTempIds);
        if (lampiranFiles && lampiranFiles.length > 0) {
          // Auto-fill lampiran field with file names from uploaded files
          const fileNames = lampiranFiles.map(f => f.fileName);
          lampiranText = fileNames.join(', ');
        }
      }

      const htmlBase64 = Buffer.from(htmlContent, 'utf-8').toString('base64');
      let pdfBuffer = await this.generatePdfSudinService.generatePdf({
        html: htmlBase64,
        penerima: penerima,
        nama_tempat: namaTempat,
        tanggal: tanggal,
        positionText: namaJabatan,
        namaLengkap: namaLengkap,
        tembusan: tembusan,
        perihal: perihal,
        sifat: sifat,
        nomor: nomor,
        lampiran: lampiranText,
      });

      // If lampiran files exist, merge with main PDF
      if (lampiranFiles && lampiranFiles.length > 0) {
        pdfBuffer = await this.mergePdfWithTemporaryFiles(pdfBuffer, lampiranFiles);
      }

      return pdfBuffer;
    } catch (error) {
      throw new BadRequestException(`Gagal generate PDF: ${error.message}`);
    }
  }

  /**
   * Get lampiran files from storage (both temporary and final)
   * Query by lampiran IDs - supports both is_temporary=1 (before save-draft) 
   * and is_temporary=0 (after save-draft)
   */
  private async getTemporaryLampiranFiles(tempIds: string[]): Promise<any[]> {
    try {
      if (!tempIds || tempIds.length === 0) {
        return [];
      }

      // Query all lampiran by IDs (both temporary and final)
      // This allows preview-pdf to work both before and after save-draft
      const tempLampiran = await this.naskahLampiranRepository.find({
        where: {
          id: In(tempIds),
          // Removed is_temporary: 1 filter to support both temporary and final lampiran
        },
      });

      const files: Array<{
        id: string;
        fileName: string;
        filePath: string;
        tempFolderId: string | null;
      }> = [];
      
      for (const lampiran of tempLampiran) {
        files.push({
          id: lampiran.id,
          fileName: lampiran.file_name,
          filePath: lampiran.file_pdf,
          tempFolderId: lampiran.temp_folder_id,
        });
      }

      return files;
    } catch (error) {
      return [];
    }
  }

  /**
   * Merge main PDF dengan temporary lampiran files
   */
  private async mergePdfWithTemporaryFiles(
    mainPdfBuffer: Buffer,
    lampiranFiles: any[],
  ): Promise<Buffer> {
    try {
      if (!lampiranFiles || lampiranFiles.length === 0) {
        return mainPdfBuffer;
      }

      const pdfDoc = await PDFDocument.load(mainPdfBuffer);

      for (const file of lampiranFiles) {
        try {
          if (!file.fileName.toLowerCase().endsWith('.pdf')) {
            continue;
          }

          // Download file from MinIO
          const fileBuffer = await this.storageService.getFile(file.filePath);
          const lampiranPdf = await PDFDocument.load(fileBuffer);

          // Copy all pages
          const lampiranPages = await pdfDoc.copyPages(
            lampiranPdf,
            lampiranPdf.getPageIndices(),
          );
          lampiranPages.forEach((page) => {
            pdfDoc.addPage(page);
          });
        } catch (error) {
          // Continue with next file
        }
      }

      const mergedPdfBytes = await pdfDoc.save();
      return Buffer.from(mergedPdfBytes);
    } catch (error) {
      return mainPdfBuffer;
    }
  }

  /**
   * Move temporary lampiran to final location and link to naskah
   * Update: is_temporary = 0, id_naskah = naskahId, move file to final folder
   *
   * @param lampiranIds - Array of lampiran IDs (temporary)
   * @param naskahId - ID naskah yang akan dikaitkan
   * @param finalFolder - Folder tujuan (e.g., 'surat-dinas-eksternal/lampiran')
   */
  private async moveTemporaryLampiranToFinal(
    lampiranIds: string[],
    naskahId: string,
    finalFolder: string,
  ): Promise<void> {
    if (!lampiranIds || lampiranIds.length === 0) {
      return;
    }

    // Get all temporary lampiran
    const tempLampiran = await this.naskahLampiranRepository.find({
      where: {
        id: In(lampiranIds),
        is_temporary: 1,
      },
    });

    if (tempLampiran.length === 0) {
      throw new NotFoundException('Lampiran temporary tidak ditemukan');
    }

    // Validate all lampiran are temporary (prevent reuse)
    if (tempLampiran.length !== lampiranIds.length) {
      throw new BadRequestException(
        'Beberapa lampiran ID tidak valid atau bukan temporary (sudah digunakan sebelumnya)',
      );
    }

    // Move each file and update database
    for (const lampiran of tempLampiran) {
      const fileName = lampiran.file_name;
      const oldKey = lampiran.file_pdf;

      // Generate new key untuk final location
      const timestamp = Date.now();
      const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
      const newKey = `${finalFolder}/${timestamp}-${sanitizedFileName}`;

      try {
        // Move file di storage
        await this.storageService.moveFile(oldKey, newKey);

        // Update database
        lampiran.id_naskah = naskahId;
        lampiran.file_pdf = newKey;
        lampiran.jenis = 'SDE';
        lampiran.is_temporary = 0;
        lampiran.temp_folder_id = null;

        await this.naskahLampiranRepository.save(lampiran);
      } catch (error) {
        // Continue with other files
      }
    }
  }

  // ============================================================
  // HELPER METHODS
  // ============================================================

  /**
   * Helper: Convert bulan ke Romawi
   */
  private getBulanRomawi(bulan: number): string {
    const mapping: Record<number, string> = {
      1: 'I', 2: 'II', 3: 'III', 4: 'IV', 5: 'V', 6: 'VI',
      7: 'VII', 8: 'VIII', 9: 'IX', 10: 'X', 11: 'XI', 12: 'XII',
    };
    return mapping[bulan] || 'I';
  }

  /**
   * Helper: Extract last 2 characters dari area code
   */
  private extractAreaCode(area: string | null | undefined): string {
    if (!area) return '';
    if (area.length >= 2) {
      return area.slice(-2);
    }
    return area.padStart(2, '0');
  }

  /**
   * Helper: Generate nomor SDE dengan integrasi ke nomor_request dan nomor_request_detail
   * Menggunakan format dari tabel jenis dan update counter di tabel nomor
   * Auto-insert ke nomor_request dan nomor_request_detail dengan status 'terpakai'
   * SDE menggunakan area-based counter (sama seperti SDI)
   * 
   * @param pengirim - Data pengirim dari org_data
   * @param klasifikasi - Kode klasifikasi arsip
   * @param perihal - Perihal surat
   * @param tanggal - Tanggal surat
   * @param queryRunner - Query runner untuk transaction
   * @returns Nomor surat yang sudah di-generate
   */
  private async generateNomorWithIntegration(
    pengirim: SdeOrgDataPositionDto,
    klasifikasi: string,
    perihal: string,
    tanggal: Date,
    queryRunner: any,
  ): Promise<string> {
    const jenis = 'SDE';
    const tahun = tanggal.getFullYear();
    const bulan = tanggal.getMonth() + 1;

    // 1. Ambil format penomoran dari tabel jenis
    const jenisData = await queryRunner.manager.findOne(JenisEntity, {
      where: { jenis },
    });

    if (!jenisData || !jenisData.formatPenomoran) {
      throw new BadRequestException(
        `Format penomoran untuk jenis ${jenis} tidak ditemukan`,
      );
    }

    // 2. Create nomor_request
    const requestId = uuidv4();
    const nomorRequest = this.nomorRequestRepository.create({
      id: requestId,
      company: String(COMPANY_ID),
      area: pengirim.area || null,
      subArea: String(pengirim.sub_area || ''),
      organization: String(pengirim.organization_id || ''),
      position: String(pengirim.position),
      tanggal: tanggal,
      jenis: jenis,
      klasifikasi: klasifikasi || null,
      perihal: perihal,
      jumlah: 1,
      penandatangan: pengirim.persnum_person_text || null,
      idPositionPenandatangan: pengirim.position || null,
    });

    await queryRunner.manager.save(nomorRequest);

    // 3. Query nomor terakhir dengan locking (SDE menggunakan Company + Area, seperti SDI)
    const nomorRecord = await queryRunner.manager
      .createQueryBuilder(NomorEntity, 'n')
      .where('n.tahun = :tahun', { tahun })
      .andWhere('n.jenis = :jenis', { jenis })
      .andWhere('n.company = :company', { company: nomorRequest.company })
      .andWhere('n.area = :area', { area: nomorRequest.area })
      .setLock('pessimistic_write')
      .getOne();

    // 4. Generate nomor urut baru
    let noUrut = 1;
    if (nomorRecord && nomorRecord.nomor) {
      noUrut = nomorRecord.nomor + 1;
    }

    // 5. Generate nomor lengkap dari format (dibaca dari tabel jenis)
    const noUrutFormatted = noUrut.toString().padStart(3, '0');
    const bulanRomawi = this.getBulanRomawi(bulan);
    const jabatanCode = pengirim.position_abbreviation || '';
    const lokasiCode = this.extractAreaCode(pengirim.area);
    const instansi = 'LPPNPI'; // Default instansi

    let nomorLengkap = jenisData.formatPenomoran
      .replace(/{TIPE}/g, jenis)
      .replace(/{NO_URUT}/g, noUrutFormatted)
      .replace(/{INSTANSI}/g, instansi)
      .replace(/{JABATAN}/g, jabatanCode)
      .replace(/{LOKASI}/g, lokasiCode)
      .replace(/{KLASIFIKASI}/g, klasifikasi || '')
      .replace(/{BULAN}/g, bulanRomawi)
      .replace(/{TAHUN}/g, tahun.toString());

    // Clean up extra spaces
    nomorLengkap = nomorLengkap
      .replace(/\/\s+/g, '/')
      .replace(/\s+\//g, '/')
      .replace(/\/\//g, '/')
      .trim();

    // 6. Insert atau update nomor di tabel nomor
    if (nomorRecord) {
      nomorRecord.nomor = noUrut;
      await queryRunner.manager.save(nomorRecord);
    } else {
      const newNomor = this.nomorRepository.create({
        id: uuidv4(),
        company: nomorRequest.company,
        area: nomorRequest.area,
        subArea: nomorRequest.subArea,
        organization: nomorRequest.organization,
        position: nomorRequest.position,
        tahun: tahun,
        jenis: jenis,
        nomor: noUrut,
      });
      await queryRunner.manager.save(newNomor);
    }

    // 7. Insert nomor_request_detail dengan status 'terpakai'
    const nomorRequestDetail = this.nomorRequestDetailRepository.create({
      id: uuidv4(),
      idRequest: requestId,
      nomor: nomorLengkap,
      fileName: null,
      fileText: null,
      status: 'terpakai',
    });

    await queryRunner.manager.save(nomorRequestDetail);

    return nomorLengkap;
  }

  /**
   * Helper: Convert SdeOrgDataPositionDto to SdeSirkulasiInfoDto
   */
  private toSirkulasiInfo(pos: SdeOrgDataPositionDto): SdeSirkulasiInfoDto {
    return {
      position: pos.position,
      position_text: pos.position_text,
      persnum: pos.persnum_person ?? pos.persnum ?? null,
      nama: pos.persnum_person_text ?? pos.nama ?? null,
      organization_id: pos.organization_id,
      organization_text: pos.organization_text,
      sub_area: pos.sub_area,
      sub_area_text: pos.sub_area_text,
      area: pos.area,
      area_text: pos.area_text,
    };
  }

  /**
   * Helper: Create sirkulasi from SdeOrgDataPositionDto (for pengirim only)
   */
  private createSirkulasiFromOrgData(
    idNaskah: string,
    sirkuler: 'pengirim' | 'tembusan',
    pos: SdeOrgDataPositionDto,
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
      // Prefer persnum/nama, fallback to position/position_text if persnum/nama are missing.
      // Prefer persnum_person/persnum_person_text (if present), then persnum/nama, then fallback to position/position_text
      idSirkuler: String(pos.persnum_person ?? pos.persnum ?? pos.position ?? ''),
      namaSirkuler: pos.persnum_person_text ?? pos.nama ?? pos.position_text ?? '',
      isDraft: isDraft,
    });

    return sirkulasi;
  }

  /**
   * Helper: Convert EksternalEntity to SdePenerimaInfoDto
   */
  private toEksternalPenerimaInfo(ext: EksternalEntity): SdePenerimaInfoDto {
    return {
      id: ext.id,
      nama: ext.nama,
      alamat: ext.alamat || '',
      telepon: ext.telepon || '',
      email: ext.email || '',
      kontak: ext.kontak || '',
    };
  }

  // ============================================================
  // NOMOR SURAT GENERATION
  // ============================================================

  // ============================================================
  // GET RECIPIENT - Using org_data (cached)
  // ============================================================

  /**
   * Get all external recipients (aktif only)
   * Dari tabel eksternal, tidak perlu hierarchy
   */
  private async getExternalRecipients(): Promise<EksternalRecipientDto[]> {
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
   * Get SDE recipients using org_data
   * 
   * SDE (Surat Dinas Eksternal):
   * - Pengirim: dari org_data (positionId), harus managerial (chief=1)
   * - Penerima: dari tabel eksternal (pihak luar perusahaan)
   * 
   * @param positionId - Position ID of the sender
   * @param tgl - Optional date for org_data lookup (default: today)
   */
  async getSdeRecipients(
    positionId: number,
    tgl?: string,
  ): Promise<SdeRecipientResponseDto> {
    // Use today's date if not provided
    const tanggal = tgl ?? new Date().toISOString().split('T')[0];

    // Get cached org data from org_data service
    const orgData = await this.orgDataService.findOrg(tanggal);

    if (!orgData || !orgData.position_json) {
      throw new NotFoundException(
        `Data organisasi untuk tanggal ${tanggal} tidak ditemukan. Silakan generate data org terlebih dahulu via GET /org-data?tgl=${tanggal}`,
      );
    }

    const barisData: SdeOrgDataPositionDto[] = orgData.position_json;

    // Find sender's position data
    const sender = barisData.find((x) => Number(x.position) === Number(positionId));

    if (!sender) {
      throw new NotFoundException(
        `Position dengan ID ${positionId} tidak ditemukan dalam data organisasi tanggal ${tanggal}`,
      );
    }

    // Verify sender is chief (managerial)
    if (sender.chief !== 1) {
      throw new ForbiddenException(
        `Position ${positionId} bukan managerial (chief). Hanya managerial yang dapat mengirim Surat Dinas Eksternal.`,
      );
    }

    // Get external recipients from tabel eksternal
    const recipients = await this.getExternalRecipients();

    return {
      sender,
      recipients,
      totalRecipients: recipients.length,
    };
  }

  // ============================================================
  // SEND MESSAGE
  // ============================================================

  /**
   * Private method: Core logic untuk create SDE
   * Digunakan oleh saveDraft dan sendMessage
   */
  private async createSde(
    dto: CreateSuratDinasEksternalDto,
    status: 'draf' | 'final' | 'final_tte',
  ): Promise<SdeSendMessageResponseDto> {
    // Use provided date or today
    const tanggal = dto.tgl ?? new Date().toISOString().split('T')[0];

    // PHASE 1: Get org_data untuk validasi pengirim
    const orgData = await this.orgDataService.findOrg(tanggal);
    if (!orgData || !orgData.position_json) {
      throw new NotFoundException(
        `Data organisasi untuk tanggal ${tanggal} tidak ditemukan. Silakan generate via GET /org-data?tgl=${tanggal}`,
      );
    }

    const barisData: SdeOrgDataPositionDto[] = orgData.position_json;

    // PHASE 2: Validate pengirim from org_data
    const pengirim = barisData.find((x) => Number(x.position) === Number(dto.pengirim));
    if (!pengirim) {
      throw new NotFoundException(`Pengirim dengan positionId ${dto.pengirim} tidak ditemukan dalam org_data`);
    }
    if (pengirim.chief !== 1) {
      throw new ForbiddenException(`Position ${dto.pengirim} bukan managerial (chief). Hanya managerial yang dapat mengirim SDE.`);
    }

    // PHASE 3: Validate penerima dari tabel eksternal (optional - bisa kosong)
    // Support both:
    // - UUID (id dari tabel eksternal) - untuk string UUID
    // - Position ID (id_position_pembuat) - untuk angka/number
    const penerimaList: EksternalEntity[] = [];
    
    if (dto.penerima && dto.penerima.length > 0) {
      for (const penerimaValue of dto.penerima) {
        // Trim whitespace from value
        const cleanValue = String(penerimaValue).trim();
        
        // Check if it's a UUID (contains dashes and is 36 chars) or a number (position ID)
        const isUuid = cleanValue.includes('-') && cleanValue.length === 36;
        
        let eksternal: EksternalEntity | null = null;
        
        if (isUuid) {
          // Search by eksternal.id (UUID)
          eksternal = await this.eksternalRepository.findOne({
            where: { id: cleanValue, aktif: true },
          });
        } else {
          // Search by id_position_pembuat (position ID)
          eksternal = await this.eksternalRepository.findOne({
            where: { id_position_pembuat: cleanValue, aktif: true },
          });
        }
        
        if (!eksternal) {
          continue; // Skip instead of throwing error to be more lenient
        }
        
        // Avoid duplicates
        if (!penerimaList.find(p => p.id === eksternal!.id)) {
          penerimaList.push(eksternal);
        }
      }
    }

    // PHASE 3.1: Validate and get tembusan from org_data (if any)
    const tembusanList: SdeOrgDataPositionDto[] = [];
    if (dto.tembusan && dto.tembusan.length > 0) {
      for (const posId of dto.tembusan) {
        const tembusan = barisData.find((x) => Number(x.position) === Number(posId));
        if (tembusan) {
          tembusanList.push(tembusan);
        }
      }
    }

    // Start transaction
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    let nomorSurat: string;

    try {
      // PHASE 4: Generate nomor surat (only for final/final_tte, draft gets temporary nomor)
      if (status === 'draf') {
        nomorSurat = `DRAFT-${Date.now()}`;
      } else {
        const tanggalNomor = dto.tgl ? this.parseDateString(dto.tgl) : new Date();
        nomorSurat = await this.generateNomorWithIntegration(
          pengirim,
          dto.klasifikasi,
          dto.perihal,
          tanggalNomor,
          queryRunner
        );
      }

      // PHASE 5: Insert naskah
      const naskahId = uuidv4();
      const tanggalHariIni = dto.tgl ? this.parseDateString(dto.tgl) : new Date();

      const naskah = this.naskahRepository.create({
        id: naskahId,
        jenis: 'SDE',
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
        english: dto.english || false,
      });
      await queryRunner.manager.save(naskah);

      // Determine if this is a draft
      const isDraft = status === 'draf';

      // PHASE 6: Insert sirkulasi - pengirim dan tembusan
      const pengirimSirkulasi = this.createSirkulasiFromOrgData(naskahId, 'pengirim', pengirim, isDraft);
      await queryRunner.manager.save(pengirimSirkulasi);

      // PHASE 6.1: Insert sirkulasi - tembusan (if any)
      if (tembusanList && tembusanList.length > 0) {
        for (const tembusan of tembusanList) {
          const tembusanSirkulasi = this.createSirkulasiFromOrgData(naskahId, 'tembusan', tembusan, isDraft);
          await queryRunner.manager.save(tembusanSirkulasi);
        }
      }

      // PHASE 7: Handle lampiran
      // Handle temporary lampiran (RECOMMENDED - dari POST /upload-temporary)
      // Also get file names for response
      let lampiranFileNames: string[] = [];
      if (dto.lampiran_temp_ids && dto.lampiran_temp_ids.length > 0) {
        // Get file names before moving
        const lampiranFiles = await this.getTemporaryLampiranFiles(dto.lampiran_temp_ids);
        lampiranFileNames = lampiranFiles.map(f => f.fileName);
        
        await this.moveTemporaryLampiranToFinal(
          dto.lampiran_temp_ids,
          naskahId,
          'surat-dinas-eksternal/lampiran',
        );
      }

      // Handle legacy lampiran_files (DEPRECATED, tapi masih support backward compatibility)
      if (dto.lampiran_files && dto.lampiran_files.length > 0) {
        for (const filePath of dto.lampiran_files) {
          const fileName = filePath.split('/').pop() || filePath;
          const lampiran = this.naskahLampiranRepository.create({
            id: uuidv4(),
            id_naskah: naskahId,
            file_name: fileName,
            file_pdf: filePath,
            jenis: 'SDE',
            is_temporary: 0,
          });
          await queryRunner.manager.save(lampiran);
        }
      }

      // PHASE 8: Build kepada_yth dari penerima eksternal
      const kepadaYthList = penerimaList.map((p) => p.nama);
      const kepadaYth = kepadaYthList.join('; ');

      // Build alamat dari penerima pertama (atau gabungan)
      const alamatPenerima = penerimaList.length === 1 
        ? penerimaList[0].alamat || ''
        : penerimaList.map(p => `${p.nama}: ${p.alamat || '-'}`).join('\n');

      // PHASE 8.1: Convert tembusan positionIds to names
      let tembusanNames: string[] = [];
      if (dto.tembusan && dto.tembusan.length > 0) {
        tembusanNames = await this.convertPositionIdsToNames(dto.tembusan, tanggal);
      }

      // PHASE 9: Insert ke tabel sdi_sde (konten lengkap SDE)
      const sdiSdeEntity = this.sdiSdeRepository.create({
        id: uuidv4(),
        idNaskah: naskahId,
        kopLogo: dto.kop_logo ?? DEFAULT_KOP_LOGO,
        kopNama: dto.kop_nama ?? DEFAULT_KOP_NAMA,
        alamatPerusahaan: dto.alamat_perusahaan ?? DEFAULT_ALAMAT_PERUSAHAAN,
        nomor: nomorSurat,
        kepadaYth: kepadaYth,
        nama: penerimaList.length === 1 ? penerimaList[0].nama : null,
        alamat: alamatPenerima,
        perihal: dto.perihal,
        konten: dto.konten,
        namaTempat: dto.nama_tempat ?? pengirim.sub_area_text ?? 'Tangerang',
        tanggal: tanggalHariIni,
        namaJabatan: dto.nama_jabatan ?? pengirim.position_text,
        tandaTangan: dto.tanda_tangan ?? null,
        namaLengkap: dto.nama_lengkap ?? pengirim.persnum_person_text ?? pengirim.nama,
        tembusan: tembusanNames.length > 0 ? tembusanNames.join('; ') : null, // Store tembusan as semicolon-separated string
        sifat: dto.sifat,
        lampiran: dto.lampiran || null,
      });
      await queryRunner.manager.save(sdiSdeEntity);

      // PHASE 10: Auto-generate PDF with nomor and lampiran (only for final/final_tte)
      let finalPdfPath: string | undefined = undefined;
      
      if (status !== 'draf') {
        try {
          // Determine lampiran text from temp files
          let lampiranTextForPdf = dto.lampiran || '-';
          if (lampiranFileNames.length > 0) {
            lampiranTextForPdf = lampiranFileNames.join(', ');
          }

          // Generate PDF with nomor already included (using same approach as preview-pdf)
          let pdfBuffer = await this.generatePdfSudinService.generatePdf({
            html: Buffer.from(dto.konten || '', 'utf-8').toString('base64'),
            penerima: kepadaYthList,
            nama_tempat: dto.nama_tempat || pengirim.sub_area_text || 'Tangerang',
            tanggal: tanggalHariIni.toLocaleDateString('id-ID', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            }),
            positionText: dto.nama_jabatan || pengirim.position_text,
            namaLengkap: dto.nama_lengkap || pengirim.persnum_person_text || pengirim.nama,
            tembusan: tembusanNames, // Include tembusan in PDF (same as preview-pdf)
            perihal: dto.perihal,
            sifat: dto.sifat || 'Biasa',
            nomor: nomorSurat,
            lampiran: lampiranTextForPdf,
          });

          // Merge with lampiran if any
          if (dto.lampiran_temp_ids && dto.lampiran_temp_ids.length > 0) {
            const lampiranFilesForMerge = await this.getTemporaryLampiranFiles(dto.lampiran_temp_ids);
            if (lampiranFilesForMerge && lampiranFilesForMerge.length > 0) {
              pdfBuffer = await this.mergePdfWithTemporaryFiles(pdfBuffer, lampiranFilesForMerge);
            }
          }

          // Upload PDF to storage with organized folder structure
          const timestamp = Date.now();
          const pdfFileName = `SDE-${nomorSurat.replace(/\//g, '-')}-${timestamp}.pdf`;
          
          const uploadResult = await this.storageService.uploadBuffer(
            pdfBuffer,
            pdfFileName,
            'application/pdf',
            'surat-dinas-eksternal/final',
          );

          finalPdfPath = uploadResult.key;

          // Update naskah with final_pdf path
          await queryRunner.manager.update(
            NaskahEntity,
            { id: naskahId },
            { final_pdf: finalPdfPath },
          );
        } catch (error) {
          // Don't fail the whole transaction if PDF generation fails
        }
      }

      // Commit transaction
      await queryRunner.commitTransaction();

      // Build penerima response
      const penerimaResponses: SdePenerimaInfoDto[] = penerimaList.map(
        (ext) => this.toEksternalPenerimaInfo(ext)
      );

      // Build tembusan response from org_data
      const tembusanResponses: SdeSirkulasiInfoDto[] = [];
      if (dto.tembusan && dto.tembusan.length > 0) {
        for (const posId of dto.tembusan) {
          const tembusanPos = barisData.find((x) => Number(x.position) === Number(posId));
          if (tembusanPos) {
            tembusanResponses.push(this.toSirkulasiInfo(tembusanPos));
          }
        }
      }

      // Build lampiran text from file names
      const lampiranText = lampiranFileNames.length > 0 
        ? lampiranFileNames.join(', ') 
        : (dto.lampiran || undefined);

      // Return response - use toSirkulasiInfo directly from org_data (same as SDI)
      return {
        success: true,
        data: {
          id: naskahId,
          jenis: 'SDE',
          nomor: nomorSurat,
          tanggal: this.formatDateToString(tanggalHariIni),
          status: status,
          perihal: dto.perihal,
          pengirim: this.toSirkulasiInfo(pengirim), // Use helper directly from org_data
          penerima: penerimaResponses,
          tembusan: tembusanResponses, // Always return array (empty or filled)
          lampiran: lampiranText, // Nama file lampiran dari temporary files
          final_pdf: finalPdfPath || null, // Always include final_pdf field (null if not generated)
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
   * Parse form-data body + uploaded files to CreateSuratDinasEksternalDto
   * 
   * Form-data fields:
   * - pengirim: positionId (number)
   * - penerima: array of eksternal.id (JSON string or comma-separated)
   * - kop_logo, kop_nama, alamat_perusahaan (optional)
   * - klasifikasi, sifat, perihal, konten (required)
   * - nama_tempat, nama_jabatan, tanda_tangan, nama_lengkap (optional)
   * - lampiran: string description
   * - lampiran_temp_ids: array of UUID strings from temporary upload
   * - tgl: optional date in YYYY-MM-DD format
   * 
   * @param body - Raw form-data body
   * @param files - Uploaded files (not used for initial creation, use upload-temporary endpoint)
   * @returns CreateSuratDinasEksternalDto
   */
  async parseFormDataToCreateDto(
    body: any,
    files?: Express.Multer.File[],
  ): Promise<CreateSuratDinasEksternalDto> {
    // Helper: Parse UUID array field (bisa JSON string atau comma-separated)
    const parseUuidArray = (value: any): string[] => {
      if (!value) return [];
      if (Array.isArray(value)) return value;
      if (typeof value === 'string') {
        try {
          // Try parse as JSON
          const parsed = JSON.parse(value);
          return Array.isArray(parsed) ? parsed : [String(parsed)];
        } catch {
          // Parse as comma-separated
          return value.split(',').map((v: string) => v.trim());
        }
      }
      return [String(value)];
    };

    // Parse penerima - array of eksternal.id UUIDs (optional)
    // Support both 'penerima' and 'tertuju' field names for backward compatibility
    const penerimaArray = parseUuidArray(body.penerima || body.tertuju);

    // Parse tembusan - array of positionId numbers (optional)
    const parseTembusanArray = (value: any): number[] => {
      if (!value) return [];
      if (Array.isArray(value)) return value.map((v: any) => Number(v));
      if (typeof value === 'string') {
        try {
          // Try parse as JSON
          const parsed = JSON.parse(value);
          return Array.isArray(parsed) ? parsed.map((v: any) => Number(v)) : [Number(parsed)];
        } catch {
          // Parse as comma-separated
          return value.split(',').map((v: string) => Number(v.trim()));
        }
      }
      return [Number(value)];
    };

    const tembusanArray = parseTembusanArray(body.tembusan);

    // Build DTO
    const dto: CreateSuratDinasEksternalDto = {
      // Sirkulasi
      pengirim: Number(body.pengirim),
      penerima: penerimaArray,
      tembusan: tembusanArray.length > 0 ? tembusanArray : undefined,
      tgl: body.tgl,

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
      lampiran_temp_ids: body.lampiran_temp_ids ? parseUuidArray(body.lampiran_temp_ids) : undefined,
    };

    return dto;
  }

  /**
   * Upload temporary lampiran files
   * Creates naskah_lampiran records with is_temporary=1
   * 
   * @param files - Array of uploaded files
   * @param id_naskah - Naskah ID (can be null for temp-only storage)
   * @param jenis - Document type (ND, SDI, SDE, DI, KA)
   * @returns Array of lampiran IDs
   */
  async uploadTemporaryLampiran(
    files: Express.Multer.File[],
    id_naskah: string,
    jenis: 'ND' | 'SDI' | 'SDE' | 'DI' | 'KA',
  ): Promise<string[]> {
    const tempFolderId = uuidv4();
    const lampiranIds: string[] = [];

    for (const file of files) {
      // Upload file first to get the path
      const uploadResult = await this.storageService.uploadFile(
        file,
        `surat-dinas-eksternal/lampiran/temporary/${tempFolderId}`,
      );

      // Create lampiran record with file_pdf populated
      const lampiranEntity = this.naskahLampiranRepository.create({
        id: uuidv4(),
        id_naskah,
        file_name: file.originalname,
        file_pdf: uploadResult.key, // Set file path from upload
        jenis,
        is_temporary: 1,
        temp_folder_id: tempFolderId,
      } as Partial<NaskahLampiranEntity>);

      await this.naskahLampiranRepository.save(lampiranEntity);
      lampiranIds.push(lampiranEntity.id);
    }

    return lampiranIds;
  }

  // ============================================================
  // SEND MESSAGE
  // ============================================================

  /**
   * Send Message - Kirim SDE ke pihak eksternal
   * Status: 'final' (tanpa tanda tangan) atau 'final_tte' (dengan tanda tangan)
   */
  async sendMessage(dto: CreateSuratDinasEksternalDto): Promise<SdeSendMessageResponseDto> {
    // Determine status based on tanda_tangan
    const status = dto.tanda_tangan ? 'final_tte' : 'final';
    return this.createSde(dto, status);
  }

  /**
   * Save Draft - Simpan SDE sebagai draft
   * Status: 'draf'
   */
  async saveDraft(dto: CreateSuratDinasEksternalDto): Promise<SdeSendMessageResponseDto> {
    return this.createSde(dto, 'draf');
  }

  // ============================================================
  // UPDATE DRAFT
  // ============================================================

  /**
   * Update Draft - Update data draft SDE (status tetap draf)
   * Partial update - hanya field yang diisi yang akan diupdate
   */
  async updateDraft(
    naskahId: string,
    dto: UpdateSdeDraftDto,
  ): Promise<SdeSendMessageResponseDto> {
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

    if (naskah.jenis !== 'SDE') {
      throw new BadRequestException(`Naskah bukan Surat Dinas Eksternal (SDE)`);
    }

    // Use provided date or today for org_data lookup
    const tanggal = dto.tgl ?? new Date().toISOString().split('T')[0];

    // PHASE 2: Get org_data if we need to update pengirim
    let barisData: SdeOrgDataPositionDto[] = [];
    let pengirimPosition: SdeOrgDataPositionDto | undefined;

    if (dto.pengirim !== undefined) {
      const orgData = await this.orgDataService.findOrg(tanggal);
      if (!orgData || !orgData.position_json) {
        throw new NotFoundException(
          `Data organisasi untuk tanggal ${tanggal} tidak ditemukan. Silakan generate via GET /org-data?tgl=${tanggal}`,
        );
      }
      barisData = orgData.position_json;

      pengirimPosition = barisData.find((x) => Number(x.position) === Number(dto.pengirim));
      if (!pengirimPosition) {
        throw new NotFoundException(`Pengirim dengan positionId ${dto.pengirim} tidak ditemukan dalam org_data`);
      }
      if (pengirimPosition.chief !== 1) {
        throw new ForbiddenException(`Position ${dto.pengirim} bukan managerial (chief). Hanya managerial yang dapat mengirim SDE.`);
      }
    }

    // PHASE 3: Validate penerima if provided
    const penerimaList = await this.validatePenerimaEksternal(
      dto.penerima || [],
      false, // Don't throw, skip invalid IDs
    );

    // Start transaction
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // PHASE 4: Update naskah table (only fields that are provided)
      const naskahUpdateData: Partial<NaskahEntity> = {};
      if (dto.klasifikasi !== undefined) naskahUpdateData.klasifikasi = dto.klasifikasi;
      if (dto.klasifikasi_text !== undefined) naskahUpdateData.klasifikasi_text = dto.klasifikasi_text;
      if (dto.sifat !== undefined) naskahUpdateData.sifat = dto.sifat;
      if (dto.perihal !== undefined) naskahUpdateData.perihal = dto.perihal;
      if (dto.konten !== undefined) naskahUpdateData.konten = dto.konten;
      if (dto.nama_tempat !== undefined) naskahUpdateData.tempat = dto.nama_tempat;
      if (dto.lampiran !== undefined) naskahUpdateData.lampiran = dto.lampiran;
      if (dto.english !== undefined) naskahUpdateData.english = dto.english;

      if (Object.keys(naskahUpdateData).length > 0) {
        await queryRunner.manager.update(NaskahEntity, { id: naskahId }, naskahUpdateData);
      }

      // PHASE 5: Update sdi_sde table (only fields that are provided)
      const sdeUpdateData: Partial<SdiSdeEntity> = {};
      if (dto.kop_logo !== undefined) sdeUpdateData.kopLogo = dto.kop_logo;
      if (dto.kop_nama !== undefined) sdeUpdateData.kopNama = dto.kop_nama;
      if (dto.alamat_perusahaan !== undefined) sdeUpdateData.alamatPerusahaan = dto.alamat_perusahaan;
      if (dto.perihal !== undefined) sdeUpdateData.perihal = dto.perihal;
      if (dto.konten !== undefined) sdeUpdateData.konten = dto.konten;
      if (dto.nama_tempat !== undefined) sdeUpdateData.namaTempat = dto.nama_tempat;
      if (dto.nama_jabatan !== undefined) sdeUpdateData.namaJabatan = dto.nama_jabatan;
      if (dto.tanda_tangan !== undefined) sdeUpdateData.tandaTangan = dto.tanda_tangan;
      if (dto.nama_lengkap !== undefined) sdeUpdateData.namaLengkap = dto.nama_lengkap;
      if (dto.sifat !== undefined) sdeUpdateData.sifat = dto.sifat;
      if (dto.lampiran !== undefined) sdeUpdateData.lampiran = dto.lampiran;

      // Update tembusan if provided
      if (dto.tembusan !== undefined) {
        const tembusanNames = dto.tembusan.length > 0 
          ? await this.convertPositionIdsToNames(dto.tembusan, tanggal)
          : [];
        sdeUpdateData.tembusan = tembusanNames.length > 0 ? tembusanNames.join('; ') : null;
      }

      // Update kepadaYth, nama, alamat if penerima changed
      if (penerimaList.length > 0) {
        const kepadaYthList = penerimaList.map((p) => p.nama);
        sdeUpdateData.kepadaYth = kepadaYthList.join('; ');
        sdeUpdateData.nama = penerimaList.length === 1 ? penerimaList[0].nama : null;
        sdeUpdateData.alamat = penerimaList.length === 1 
          ? penerimaList[0].alamat || ''
          : penerimaList.map(p => `${p.nama}: ${p.alamat || '-'}`).join('\n');
      }

      if (Object.keys(sdeUpdateData).length > 0) {
        await queryRunner.manager.update(SdiSdeEntity, { idNaskah: naskahId }, sdeUpdateData);
      }

      // PHASE 6: Handle sirkulasi update if pengirim changed
      if (dto.pengirim !== undefined && pengirimPosition) {
        // Delete existing pengirim sirkulasi
        await queryRunner.manager.delete(NaskahSirkulasi, { idNaskah: naskahId, sirkuler: 'pengirim' });

        // Re-insert pengirim with is_draft = true
        const pengirimSirkulasi = this.createSirkulasiFromOrgData(naskahId, 'pengirim', pengirimPosition, true);
        await queryRunner.manager.save(pengirimSirkulasi);
      }

      // PHASE 6.1: Handle sirkulasi tembusan - ALWAYS ensure consistency
      // Delete existing tembusan sirkulasi
      await queryRunner.manager.delete(NaskahSirkulasi, { idNaskah: naskahId, sirkuler: 'tembusan' });

      // Determine tembusan list to insert
      let tembusanPositionsToInsert: number[] = [];
      
      if (dto.tembusan !== undefined) {
        // Use provided tembusan from DTO
        tembusanPositionsToInsert = dto.tembusan;
      } else {
        // Get existing tembusan from sirkulasi (before deletion, we need to get from sdi_sde or reconstruct)
        // Actually, we already deleted it above, so we need to get from sdi_sde.tembusan string
        const existingSdeData = await queryRunner.manager.findOne(SdiSdeEntity, { where: { idNaskah: naskahId } });
        if (existingSdeData?.tembusan) {
          // Parse tembusan string and try to find positions
          const tembusanNames = existingSdeData.tembusan.split(';').map(s => s.trim());
          const orgDataForExisting = await this.orgDataService.findOrg(tanggal);
          if (orgDataForExisting?.position_json) {
            const barisDataExisting = orgDataForExisting.position_json;
            for (const tembusanName of tembusanNames) {
              const pos = barisDataExisting.find((x: any) => 
                `${x.position_text} - ${x.organization_text}` === tembusanName ||
                x.position_text === tembusanName
              );
              if (pos) {
                tembusanPositionsToInsert.push(pos.position);
              }
            }
          }
        }
      }

      // Re-insert tembusan if any
      if (tembusanPositionsToInsert.length > 0) {
        const orgDataForTembusan = await this.orgDataService.findOrg(tanggal);
        if (orgDataForTembusan?.position_json) {
          const barisDataTembusan = orgDataForTembusan.position_json;
          for (const posId of tembusanPositionsToInsert) {
            const tembusanPos = barisDataTembusan.find((x: any) => Number(x.position) === Number(posId));
            if (tembusanPos) {
              const tembusanSirkulasi = this.createSirkulasiFromOrgData(naskahId, 'tembusan', tembusanPos, true);
              await queryRunner.manager.save(tembusanSirkulasi);
            }
          }
        }
      }

      // PHASE 7: Update lampiran if changed
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
            jenis: 'SDE',
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

    // PHASE 8: Get updated data for response
    const updatedNaskah = await this.naskahRepository.findOne({
      where: { id: naskahId },
    });

    const pengirimSirkulasi = await this.naskahSirkulasiRepository.findOne({
      where: { idNaskah: naskahId, sirkuler: 'pengirim' },
    });

    // If pengirimPosition is not available (dto.pengirim not provided), 
    // lookup from org_data using sirkulasi.position for fallback
    let fallbackPengirimPosition = pengirimPosition;
    if (!fallbackPengirimPosition && pengirimSirkulasi?.position) {
      const orgDataForFallback = await this.orgDataService.findOrg(tanggal);
      if (orgDataForFallback?.position_json) {
        fallbackPengirimPosition = orgDataForFallback.position_json.find(
          (x: SdeOrgDataPositionDto) => Number(x.position) === Number(pengirimSirkulasi.position)
        );
      }
    }

    const sdeData = await this.sdiSdeRepository.findOne({
      where: { idNaskah: naskahId },
    });

    // Get penerima from kepadaYth (parse the names back to external entities)
    const penerimaNames = sdeData?.kepadaYth?.split('; ') || [];
    const penerimaResponses: SdePenerimaInfoDto[] = [];
    for (const nama of penerimaNames) {
      const ext = await this.eksternalRepository.findOne({ where: { nama, aktif: true } });
      if (ext) {
        penerimaResponses.push(this.toEksternalPenerimaInfo(ext));
      }
    }

    // Get lampiran file names for response
    const lampiranList = await this.naskahLampiranRepository.find({
      where: { id_naskah: naskahId },
    });
    const lampiranText = lampiranList.length > 0 
      ? lampiranList.map(l => l.file_name).join(', ')
      : undefined;

    // Get tembusan directly from naskah_sirkulasi table
    const tembusanList = await this.naskahSirkulasiRepository.find({
      where: {
        idNaskah: naskahId,
        sirkuler: 'tembusan',
      },
      order: { createdAt: 'ASC' },
    });

    // Build tembusan info
    const tembusanResponses: SdeSirkulasiInfoDto[] = tembusanList.map((t) => ({
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

    // Handle tanggal - bisa Date object atau string
    let tanggalStr = '';
    if (updatedNaskah?.tanggal) {
      if (updatedNaskah.tanggal instanceof Date) {
        tanggalStr = this.formatDateToString(updatedNaskah.tanggal);
      } else {
        tanggalStr = String(updatedNaskah.tanggal).split('T')[0];
      }
    }

    return {
      success: true,
      data: {
        id: naskahId,
        jenis: 'SDE',
        nomor: updatedNaskah?.nomor || '',
        tanggal: tanggalStr,
        status: 'draf',
        perihal: updatedNaskah?.perihal || '',
        // Use toSirkulasiInfo directly from org_data (same as SDI)
        pengirim: fallbackPengirimPosition 
          ? this.toSirkulasiInfo(fallbackPengirimPosition)
          : {
              position: parseInt(pengirimSirkulasi?.position || '0', 10),
              position_text: pengirimSirkulasi?.positionText || '',
              persnum: pengirimSirkulasi?.idSirkuler ? parseInt(pengirimSirkulasi.idSirkuler, 10) : null,
              nama: pengirimSirkulasi?.namaSirkuler || null,
              organization_id: parseInt(pengirimSirkulasi?.organization || '0', 10),
              organization_text: pengirimSirkulasi?.organizationText || '',
              sub_area: pengirimSirkulasi?.subArea ? parseInt(pengirimSirkulasi.subArea, 10) : null,
              sub_area_text: pengirimSirkulasi?.subAreaText || null,
              area: pengirimSirkulasi?.area || null,
              area_text: pengirimSirkulasi?.areaText || null,
            },
        penerima: penerimaResponses,
        tembusan: tembusanResponses, // Always return array (empty or filled)
        lampiran: lampiranText, // Nama file lampiran dari database
      },
    };
  }

  // ============================================================
  // FINALIZE DRAFT (SEND DRAFT)
  // ============================================================

  /**
   * Finalize Draft - Update draft dan kirim (status final/final_tte)
   * - Generate nomor surat resmi (ganti DRAFT-xxx)
   * - Update status: draf -> final (tanpa tanda_tangan) atau final_tte (dengan tanda_tangan)
   * - Update isDraft = false pada sirkulasi pengirim
   */
  async finalizeDraft(
    naskahId: string,
    dto: FinalizeSdeDraftDto,
  ): Promise<SdeSendMessageResponseDto> {
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

    if (naskah.jenis !== 'SDE') {
      throw new BadRequestException(`Naskah bukan Surat Dinas Eksternal (SDE)`);
    }

    // Use provided date or today for org_data lookup
    const tanggal = dto.tgl ?? new Date().toISOString().split('T')[0];

    // PHASE 2: Get org_data for pengirim validation
    let barisData: SdeOrgDataPositionDto[] = [];
    let pengirimPosition: SdeOrgDataPositionDto | undefined;

    // Get existing pengirim from sirkulasi
    const existingPengirim = await this.naskahSirkulasiRepository.findOne({
      where: { idNaskah: naskahId, sirkuler: 'pengirim' },
    });

    if (dto.pengirim !== undefined) {
      const orgData = await this.orgDataService.findOrg(tanggal);
      if (!orgData || !orgData.position_json) {
        throw new NotFoundException(
          `Data organisasi untuk tanggal ${tanggal} tidak ditemukan. Silakan generate via GET /org-data?tgl=${tanggal}`,
        );
      }
      barisData = orgData.position_json;

      pengirimPosition = barisData.find((x) => Number(x.position) === Number(dto.pengirim));
      if (!pengirimPosition) {
        throw new NotFoundException(`Pengirim dengan positionId ${dto.pengirim} tidak ditemukan dalam org_data`);
      }
      if (pengirimPosition.chief !== 1) {
        throw new ForbiddenException(`Position ${dto.pengirim} bukan managerial (chief). Hanya managerial yang dapat mengirim SDE.`);
      }
    }

    // PHASE 3: Validate penerima if provided
    const penerimaList = await this.validatePenerimaEksternal(
      dto.penerima || [],
      false, // Don't throw, skip invalid IDs
    );

    // PHASE 4: Get full pengirim data for nomor surat generation
    let finalPengirimPosition = pengirimPosition;
    if (!finalPengirimPosition && existingPengirim) {
      // Get full data from org_data
      if (barisData.length === 0) {
        const orgData = await this.orgDataService.findOrg(tanggal);
        if (orgData?.position_json) {
          barisData = orgData.position_json;
        }
      }
      finalPengirimPosition = barisData.find((x) => Number(x.position) === Number(existingPengirim.position));
      if (!finalPengirimPosition) {
        // Fallback jika tidak ditemukan di org_data
        finalPengirimPosition = {
          position: Number(existingPengirim.position),
          position_text: existingPengirim.positionText || '',
          sub_area: Number(existingPengirim.subArea),
          area_text: existingPengirim.areaText || 'Pusat',
        } as SdeOrgDataPositionDto;
      }
    }

    // PHASE 5: Determine new status
    const newStatus = dto.tanda_tangan ? 'final_tte' : 'final';

    // Start transaction
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    let nomorSurat: string;

    try {
      // Generate nomor surat resmi with integrated numbering (inside transaction)
      const klasifikasi = dto.klasifikasi ?? naskah.klasifikasi ?? '';
      const perihal = dto.perihal ?? naskah.perihal ?? '';
      nomorSurat = await this.generateNomorWithIntegration(
        finalPengirimPosition as SdeOrgDataPositionDto,
        klasifikasi,
        perihal,
        new Date(),
        queryRunner
      );

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
      if (dto.english !== undefined) naskahUpdateData.english = dto.english;

      await queryRunner.manager.update(NaskahEntity, { id: naskahId }, naskahUpdateData);

      // PHASE 7: Update sdi_sde table
      const sdeUpdateData: Partial<SdiSdeEntity> = {
        nomor: nomorSurat,
        tandaTangan: dto.tanda_tangan || null,
      };
      if (dto.kop_logo !== undefined) sdeUpdateData.kopLogo = dto.kop_logo;
      if (dto.kop_nama !== undefined) sdeUpdateData.kopNama = dto.kop_nama;
      if (dto.alamat_perusahaan !== undefined) sdeUpdateData.alamatPerusahaan = dto.alamat_perusahaan;
      if (dto.perihal !== undefined) sdeUpdateData.perihal = dto.perihal;
      if (dto.konten !== undefined) sdeUpdateData.konten = dto.konten;
      if (dto.nama_tempat !== undefined) sdeUpdateData.namaTempat = dto.nama_tempat;
      if (dto.nama_jabatan !== undefined) sdeUpdateData.namaJabatan = dto.nama_jabatan;
      if (dto.nama_lengkap !== undefined) sdeUpdateData.namaLengkap = dto.nama_lengkap;
      if (dto.sifat !== undefined) sdeUpdateData.sifat = dto.sifat;
      if (dto.lampiran !== undefined) sdeUpdateData.lampiran = dto.lampiran;

      // Update tembusan if provided
      if (dto.tembusan !== undefined) {
        const tembusanNames = dto.tembusan.length > 0 
          ? await this.convertPositionIdsToNames(dto.tembusan, tanggal)
          : [];
        sdeUpdateData.tembusan = tembusanNames.length > 0 ? tembusanNames.join('; ') : null;
      }

      // Update kepadaYth, nama, alamat if penerima changed
      if (penerimaList.length > 0) {
        const kepadaYthList = penerimaList.map((p) => p.nama);
        sdeUpdateData.kepadaYth = kepadaYthList.join('; ');
        sdeUpdateData.nama = penerimaList.length === 1 ? penerimaList[0].nama : null;
        sdeUpdateData.alamat = penerimaList.length === 1 
          ? penerimaList[0].alamat || ''
          : penerimaList.map(p => `${p.nama}: ${p.alamat || '-'}`).join('\n');
      }

      await queryRunner.manager.update(SdiSdeEntity, { idNaskah: naskahId }, sdeUpdateData);

      // PHASE 8: Handle sirkulasi update
      if (dto.pengirim !== undefined && pengirimPosition) {
        // Delete existing pengirim sirkulasi
        await queryRunner.manager.delete(NaskahSirkulasi, { idNaskah: naskahId, sirkuler: 'pengirim' });

        // Re-insert pengirim with is_draft = FALSE (finalized!)
        const pengirimSirkulasi = this.createSirkulasiFromOrgData(naskahId, 'pengirim', pengirimPosition, false);
        await queryRunner.manager.save(pengirimSirkulasi);
      } else {
        // Just update isDraft = false on existing sirkulasi
        await queryRunner.manager.update(
          NaskahSirkulasi,
          { idNaskah: naskahId },
          { isDraft: false },
        );
      }

      // PHASE 8.1: Handle sirkulasi tembusan - ALWAYS ensure consistency  
      // Delete existing tembusan sirkulasi
      await queryRunner.manager.delete(NaskahSirkulasi, { idNaskah: naskahId, sirkuler: 'tembusan' });

      // Determine tembusan list to insert
      let tembusanPositionsToInsert: number[] = [];
      
      if (dto.tembusan !== undefined) {
        // Use provided tembusan from DTO
        tembusanPositionsToInsert = dto.tembusan;
      } else {
        // Get existing tembusan from sdi_sde.tembusan string
        const existingSdeData = await queryRunner.manager.findOne(SdiSdeEntity, { where: { idNaskah: naskahId } });
        if (existingSdeData?.tembusan) {
          // Parse tembusan string and try to find positions
          const tembusanNames = existingSdeData.tembusan.split(';').map(s => s.trim());
          const orgDataForExisting = await this.orgDataService.findOrg(tanggal);
          if (orgDataForExisting?.position_json) {
            const barisDataExisting = orgDataForExisting.position_json;
            for (const tembusanName of tembusanNames) {
              const pos = barisDataExisting.find((x: any) => 
                `${x.position_text} - ${x.organization_text}` === tembusanName ||
                x.position_text === tembusanName
              );
              if (pos) {
                tembusanPositionsToInsert.push(pos.position);
              }
            }
          }
        }
      }

      // Re-insert tembusan if any
      if (tembusanPositionsToInsert.length > 0) {
        const orgDataForTembusan = await this.orgDataService.findOrg(tanggal);
        if (orgDataForTembusan?.position_json) {
          const barisDataTembusan = orgDataForTembusan.position_json;
          for (const posId of tembusanPositionsToInsert) {
            const tembusanPos = barisDataTembusan.find((x: any) => Number(x.position) === Number(posId));
            if (tembusanPos) {
              const tembusanSirkulasi = this.createSirkulasiFromOrgData(naskahId, 'tembusan', tembusanPos, false);
              await queryRunner.manager.save(tembusanSirkulasi);
            }
          }
        }
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
            jenis: 'SDE',
          });
          await queryRunner.manager.save(lampiran);
        }
      }

      // PHASE 10: Auto-generate PDF
      let finalPdfPath: string | undefined = undefined;
      try {
        // Get the updated sde_sde data for PDF generation
        const sdeDataForPdf = await queryRunner.manager.findOne(SdiSdeEntity, {
          where: { idNaskah: naskahId },
        });

        // Get pengirim sirkulasi for fallback data
        const pengirimSirkulasiForPdf = await queryRunner.manager.findOne(NaskahSirkulasi, {
          where: { idNaskah: naskahId, sirkuler: 'pengirim' },
        });

        // Get penerima list for PDF
        const kepadaYthListForPdf = sdeDataForPdf?.kepadaYth?.split('; ') || [];

        // Get tembusan from sdi_sde (stored as semicolon-separated string)
        // If dto.tembusan provided, convert to names; otherwise use stored tembusan
        let tembusanForPdf: string[] = [];
        if (dto.tembusan && dto.tembusan.length > 0) {
          tembusanForPdf = await this.convertPositionIdsToNames(dto.tembusan, tanggal);
        } else if (sdeDataForPdf?.tembusan) {
          tembusanForPdf = sdeDataForPdf.tembusan.split('; ').filter(t => t.trim());
        }

        // Get lampiran files for merging
        const lampiranFilesForPdf = await queryRunner.manager.find(NaskahLampiranEntity, {
          where: { id_naskah: naskahId },
        });
        const lampiranTextForPdf = lampiranFilesForPdf.length > 0
          ? lampiranFilesForPdf.map(l => l.file_name).join(', ')
          : (sdeDataForPdf?.lampiran || '-');

        // Get tanggal for PDF
        const tanggalHariIni = naskah.tanggal instanceof Date ? naskah.tanggal : new Date();

        // Resolve position text and nama
        const resolvedPositionText = dto.nama_jabatan || sdeDataForPdf?.namaJabatan || finalPengirimPosition?.position_text || pengirimSirkulasiForPdf?.positionText || '';
        const resolvedNamaLengkap = dto.nama_lengkap || sdeDataForPdf?.namaLengkap || finalPengirimPosition?.persnum_person_text || finalPengirimPosition?.nama || pengirimSirkulasiForPdf?.namaSirkuler || '';

        // Generate PDF with tembusan (same approach as preview-pdf)
        let pdfBuffer = await this.generatePdfSudinService.generatePdf({
          html: Buffer.from(sdeDataForPdf?.konten || dto.konten || naskah.konten || '', 'utf-8').toString('base64'),
          penerima: kepadaYthListForPdf,
          nama_tempat: sdeDataForPdf?.namaTempat || dto.nama_tempat || finalPengirimPosition?.sub_area_text || 'Tangerang',
          tanggal: tanggalHariIni.toLocaleDateString('id-ID', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          }),
          positionText: resolvedPositionText,
          namaLengkap: resolvedNamaLengkap,
          tembusan: tembusanForPdf, // Include tembusan in PDF (same as preview-pdf)
          perihal: sdeDataForPdf?.perihal || dto.perihal || naskah.perihal || '',
          sifat: sdeDataForPdf?.sifat || dto.sifat || 'Biasa',
          nomor: nomorSurat,
          lampiran: lampiranTextForPdf,
        });

        // Merge with lampiran if any
        if (lampiranFilesForPdf && lampiranFilesForPdf.length > 0) {
          const filesToMerge = lampiranFilesForPdf.map(l => ({
            id: l.id,
            fileName: l.file_name,
            filePath: l.file_pdf,
            tempFolderId: l.temp_folder_id,
          }));
          pdfBuffer = await this.mergePdfWithTemporaryFiles(pdfBuffer, filesToMerge);
          console.log('[SDE finalizeDraft] Merged with', filesToMerge.length, 'lampiran files');
        }

        // Upload PDF to storage
        const timestamp = Date.now();
        const pdfFileName = `SDE-${nomorSurat.replace(/\//g, '-')}-${timestamp}.pdf`;
        const uploadResult = await this.storageService.uploadBuffer(
          pdfBuffer,
          pdfFileName,
          'application/pdf',
          'surat-dinas-eksternal/final',
        );

        finalPdfPath = uploadResult.key;

        // Update naskah with final_pdf path
        await queryRunner.manager.update(
          NaskahEntity,
          { id: naskahId },
          { final_pdf: finalPdfPath },
        );

        console.log('[SDE finalizeDraft] PDF auto-generated:', finalPdfPath);
      } catch (error) {
        console.error('[SDE finalizeDraft] Failed to auto-generate PDF:', error);
        // Don't fail the whole transaction if PDF generation fails
      }

      // Commit transaction
      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }

    // PHASE 11: Get updated data for response
    const updatedNaskah = await this.naskahRepository.findOne({
      where: { id: naskahId },
    });

    const pengirimSirkulasi = await this.naskahSirkulasiRepository.findOne({
      where: { idNaskah: naskahId, sirkuler: 'pengirim' },
    });

    // If finalPengirimPosition is not available (dto.pengirim not provided),
    // lookup from org_data using sirkulasi.position for fallback
    let fallbackPengirimPosition = finalPengirimPosition;
    if (!fallbackPengirimPosition && pengirimSirkulasi?.position) {
      const orgDataForFallback = await this.orgDataService.findOrg(tanggal);
      if (orgDataForFallback?.position_json) {
        fallbackPengirimPosition = orgDataForFallback.position_json.find(
          (x: SdeOrgDataPositionDto) => Number(x.position) === Number(pengirimSirkulasi.position)
        );
      }
    }

    const sdeData = await this.sdiSdeRepository.findOne({
      where: { idNaskah: naskahId },
    });

    // Get penerima from kepadaYth
    const penerimaNames = sdeData?.kepadaYth?.split('; ') || [];
    const penerimaResponses: SdePenerimaInfoDto[] = [];
    for (const nama of penerimaNames) {
      const ext = await this.eksternalRepository.findOne({ where: { nama, aktif: true } });
      if (ext) {
        penerimaResponses.push(this.toEksternalPenerimaInfo(ext));
      }
    }

    // Get lampiran file names for response
    const lampiranList = await this.naskahLampiranRepository.find({
      where: { id_naskah: naskahId },
    });
    const lampiranText = lampiranList.length > 0 
      ? lampiranList.map(l => l.file_name).join(', ')
      : undefined;

    // Get tembusan directly from naskah_sirkulasi table
    const finalizeTembusanList = await this.naskahSirkulasiRepository.find({
      where: {
        idNaskah: naskahId,
        sirkuler: 'tembusan',
      },
      order: { createdAt: 'ASC' },
    });

    // Build tembusan info
    const finalizeTembusanResponses: SdeSirkulasiInfoDto[] = finalizeTembusanList.map((t) => ({
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

    // Get final PDF path from updated naskah
    const finalPdfPathForResponse = updatedNaskah?.final_pdf || null;

    let tanggalStr = '';
    if (updatedNaskah?.tanggal) {
      if (updatedNaskah.tanggal instanceof Date) {
        tanggalStr = this.formatDateToString(updatedNaskah.tanggal);
      } else {
        tanggalStr = String(updatedNaskah.tanggal).split('T')[0];
      }
    }

    return {
      success: true,
      data: {
        id: naskahId,
        jenis: 'SDE',
        nomor: nomorSurat,
        tanggal: tanggalStr,
        status: newStatus,
        perihal: updatedNaskah?.perihal || '',
        // Use toSirkulasiInfo directly from org_data (same as SDI)
        pengirim: fallbackPengirimPosition 
          ? this.toSirkulasiInfo(fallbackPengirimPosition)
          : {
              position: parseInt(pengirimSirkulasi?.position || '0', 10),
              position_text: pengirimSirkulasi?.positionText || '',
              persnum: pengirimSirkulasi?.idSirkuler ? parseInt(pengirimSirkulasi.idSirkuler, 10) : null,
              nama: pengirimSirkulasi?.namaSirkuler || null,
              organization_id: parseInt(pengirimSirkulasi?.organization || '0', 10),
              organization_text: pengirimSirkulasi?.organizationText || '',
              sub_area: pengirimSirkulasi?.subArea ? parseInt(pengirimSirkulasi.subArea, 10) : null,
              sub_area_text: pengirimSirkulasi?.subAreaText || null,
              area: pengirimSirkulasi?.area || null,
              area_text: pengirimSirkulasi?.areaText || null,
            },
        penerima: penerimaResponses,
        tembusan: finalizeTembusanResponses, // Always return array (empty or filled)
        lampiran: lampiranText, // Nama file lampiran dari database
        final_pdf: finalPdfPathForResponse, // Path file PDF final (null if not generated)
      },
    };
  }

  // ============================================================
  // GET DRAFT LIST
  // ============================================================

  /**
   * Get all draft SDE by position (where position is pengirim)
   * Returns list of draft messages with full data
   * @param positionId - The position ID of the sender
   * @param tgl - Optional date for validation (default: today)
   */
  async getDraftList(positionId: number, tgl?: string): Promise<any> {
    // Get org_data to validate position exists
    const tanggal = tgl ?? new Date().toISOString().split('T')[0];
    const orgData = await this.orgDataService.findOrg(tanggal);
    
    if (!orgData || !orgData.position_json) {
      throw new NotFoundException('Data organisasi tidak ditemukan');
    }

    const barisData: SdeOrgDataPositionDto[] = orgData.position_json;

    // Find position by position ID
    const positionData = barisData.find(
      (pos: SdeOrgDataPositionDto) => Number(pos.position) === Number(positionId)
    );

    if (!positionData) {
      throw new NotFoundException(`Position dengan id ${positionId} tidak ditemukan di org_data`);
    }

    const positionIdStr = String(positionId);

    // Get all naskah where position is pengirim, jenis = SDE, and status = draf
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
      .andWhere('naskah.jenis = :jenis', { jenis: 'SDE' })
      .andWhere('naskah.status = :status', { status: 'draf' })
      .orderBy('naskah.tanggal', 'DESC')
      .getRawMany();

    // Build response with full data for each naskah
    const results: any[] = [];

    for (const naskah of draftNaskahList) {
      // Get sde data for this naskah
      const sdeData = await this.sdiSdeRepository.findOne({
        where: { idNaskah: naskah.id },
      });

      // Get pengirim sirkulasi
      const pengirimSirkulasi = await this.naskahSirkulasiRepository.findOne({
        where: {
          idNaskah: naskah.id,
          sirkuler: 'pengirim',
        },
      });

      // Get lampiran files
      const lampiranFiles = await this.naskahLampiranRepository.find({
        where: { id_naskah: naskah.id },
      });

      // Get penerima from kepadaYth
      const penerimaNames = sdeData?.kepadaYth?.split('; ') || [];
      const penerimaList: SdePenerimaInfoDto[] = [];
      for (const nama of penerimaNames) {
        const ext = await this.eksternalRepository.findOne({ where: { nama, aktif: true } });
        if (ext) {
          penerimaList.push(this.toEksternalPenerimaInfo(ext));
        }
      }

      // Get tembusan sirkulasi
      const tembusanList = await this.naskahSirkulasiRepository.find({
        where: {
          idNaskah: naskah.id,
          sirkuler: 'tembusan',
        },
        order: { createdAt: 'ASC' },
      });

      // Build tembusan info
      const tembusanInfoList = tembusanList.map((t) => ({
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

      // Format tanggal
      const tanggalStr = naskah.tanggal instanceof Date
        ? naskah.tanggal.toISOString().split('T')[0]
        : String(naskah.tanggal || '').split('T')[0];

      results.push({
        id: naskah.id,
        jenis: naskah.jenis || 'SDE',
        nomor: naskah.nomor || '',
        tanggal: tanggalStr,
        status: naskah.status,

        // Kop Naskah
        kop_logo: sdeData?.kopLogo || null,
        kop_nama: sdeData?.kopNama || null,
        alamat_perusahaan: sdeData?.alamatPerusahaan || null,

        // Header
        klasifikasi: naskah.klasifikasi || '',
        klasifikasi_text: naskah.klasifikasi_text || null,
        sifat: naskah.sifat || '',
        perihal: naskah.perihal || '',
        english: naskah.english === 1 || naskah.english === true,

        // Batang Tubuh
        konten: sdeData?.konten || naskah.konten || null,

        // Kaki
        nama_tempat: sdeData?.namaTempat || naskah.tempat || null,
        nama_jabatan: sdeData?.namaJabatan || null,
        tanda_tangan: sdeData?.tandaTangan || null,
        nama_lengkap: sdeData?.namaLengkap || null,

        // Sirkulasi
        pengirim: {
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
        },
        penerima: penerimaList,
        tembusan: tembusanInfoList, // Always return array (empty or filled)

        // Lampiran
        lampiran: naskah.lampiran || null,
        lampiran_files: lampiranFiles.map((l) => ({
          id: l.id,
          fileName: l.file_name || '',
          filePath: l.file_pdf || '',
        })),
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

  // ============================================================
  // GET DETAIL BY ID
  // ============================================================

  /**
   * Get SDE detail by ID
   * Menampilkan keseluruhan informasi surat termasuk PDF final
   */
  async getSdeDetail(naskahId: string): Promise<any> {
    // Get naskah data
    const naskah = await this.naskahRepository.findOne({
      where: { id: naskahId },
    });

    if (!naskah) {
      throw new NotFoundException(`Naskah dengan id ${naskahId} tidak ditemukan`);
    }

    if (naskah.jenis !== 'SDE') {
      throw new NotFoundException(`Naskah bukan Surat Dinas Eksternal (SDE)`);
    }

    // Get SDE data (konten lengkap SDE)
    const sdeData = await this.sdiSdeRepository.findOne({
      where: { idNaskah: naskahId },
    });

    // Get pengirim sirkulasi
    const pengirimSirkulasi = await this.naskahSirkulasiRepository.findOne({
      where: {
        idNaskah: naskahId,
        sirkuler: 'pengirim',
      },
    });

    // Get penerima from kepadaYth (parse the names back to external entities)
    const penerimaNames = sdeData?.kepadaYth?.split('; ') || [];
    const penerimaInfoList: any[] = [];
    for (const nama of penerimaNames) {
      const ext = await this.eksternalRepository.findOne({ where: { nama, aktif: true } });
      if (ext) {
        penerimaInfoList.push({
          id: ext.id,
          nama: ext.nama,
          alamat: ext.alamat || '',
          telepon: ext.telepon || '',
          email: ext.email || '',
          kontak: ext.kontak || '',
          company: ext.company || '',
          area: ext.area || '',
        });
      }
    }

    // Get tembusan sirkulasi
    const tembusanList = await this.naskahSirkulasiRepository.find({
      where: {
        idNaskah: naskahId,
        sirkuler: 'tembusan',
      },
      order: { createdAt: 'ASC' },
    });

    // Build tembusan info
    const tembusanInfoList = tembusanList.map((t) => ({
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

    // Get lampiran files
    const lampiranFiles = await this.naskahLampiranRepository.find({
      where: { id_naskah: naskahId },
    });

    // Format tanggal
    const tanggalStr = naskah.tanggal instanceof Date
      ? naskah.tanggal.toISOString().split('T')[0]
      : String(naskah.tanggal || '').split('T')[0];

    // Build lampiran info with file URL
    const lampiranInfoList = await Promise.all(
      lampiranFiles.map(async (l) => ({
        id: l.id,
        fileName: l.file_name || '',
        filePath: l.file_pdf || '',
        fileUrl: l.file_pdf
          ? await this.storageService.getFileUrl(l.file_pdf)
          : null,
      })),
    );

    // Get final PDF URL if exists
    const finalPdfUrl = naskah.final_pdf
      ? await this.storageService.getFileUrl(naskah.final_pdf)
      : null;

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

        // SDE specific info
        kepada_yth: sdeData?.kepadaYth || '',
        alamat: sdeData?.alamat || null,

        // Kop
        kop_logo: sdeData?.kopLogo || null,
        kop_nama: sdeData?.kopNama || null,
        alamat_perusahaan: sdeData?.alamatPerusahaan || null,

        // Header
        klasifikasi: naskah.klasifikasi || '',
        klasifikasi_text: naskah.klasifikasi_text || null,
        sifat: naskah.sifat || '',

        // Body
        konten: sdeData?.konten || naskah.konten || null,

        // Footer
        nama_tempat: sdeData?.namaTempat || null,
        nama_jabatan: sdeData?.namaJabatan || null,
        tanda_tangan: sdeData?.tandaTangan || null,
        nama_lengkap: sdeData?.namaLengkap || null,

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
        tembusan: tembusanInfoList, // Always return array (empty or filled)

        // Files
        lampiran_files: lampiranInfoList,
        final_pdf: naskah.final_pdf || null,
        final_pdf_url: finalPdfUrl,

        // Metadata
        created_at: null,
        updated_at: null,
      },
    };
  }
}
