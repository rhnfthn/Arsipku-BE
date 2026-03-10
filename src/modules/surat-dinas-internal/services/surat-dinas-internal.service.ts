import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { PDFDocument } from 'pdf-lib';
import { NaskahEntity } from '../../../shared/entities/naskah.entity';
import { NaskahSirkulasi } from '../../../shared/entities/naskah_sirkulasi.entity';
import { NaskahLampiranEntity } from '../../../shared/entities/naskah_lampiran.entity';
import { NaskahReferensiEntity } from '../../../shared/entities/naskah_referensi.entity';
// REMOVED: SdiSdeEntity & NdEntity - fields now come from naskah_sirkulasi and naskah.tandaTangan
// import { SdiSdeEntity } from '../entities/sdi_sde.entity';
// import { NdEntity } from '../../nota-dinas/entities/nd.entity';
import { NomorEntity } from '../../nomor/entities/nomor.entity';
import { NomorRequestEntity } from '../../nomor/entities/nomor-request.entity';
import { NomorRequestDetailEntity } from '../../nomor/entities/nomor-request-detail.entity';
import { JenisEntity } from '../../nomor/entities/jenis.entity';
import { Session } from '../../auth/entities/session.entity';
import { StorageService } from '../../storage/services/storage.service';
import {
  SdiRecipientResponseDto,
  SdiOrgDataPositionDto,
} from '../dto/surat-dinas-internal-recipient-response.dto';
import { CreateSuratDinasInternalDto, UpdateDraftDto, FinalizeDraftDto, SignOption } from '../dto/create-surat-dinas-internal.dto';
import { SendMessageResponseDto, SirkulasiInfoDto } from '../dto/send-message-response.dto';
import { GetSendMessageResponseDto, SendMessageItemDto, PenerimaInfoDto, TembusanInfoDto, LampiranInfoDto, PengirimInfoDto } from '../dto/get-send-message.dto';
import { OrgDataService } from 'src/modules/master-data/org_data/org_data.service';
import { NomorSuratService } from '../../../shared/services/nomor-surat.service';
import { GeneratePdfSudinService } from '../../generate_pdf/services/generate_pdf_sudin.service';
import { SubAreaAlamatService } from '../../sub-area-alamat/services/sub_area_alamat.service';
import { DigsigService } from '../../digsig/services/digsig.service';
import { QRCodeService, QRCodeData } from '../../digsig/services/qrcode.service';
import { PdfQrEmbedService } from '../../digsig/services/pdf-qr-embed.service';
import { formatSignatureData, generateSignatureId } from '../../../common/helpers/signature.helper';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import { MeilisearchSyncService } from '../../search/services/meilisearch-sync.service';
import { NotificationService } from '../../notification/services';
import { GrupPenerimaService } from '../../grup-penerima/services/grup_penerima.service';

const COMPANY_ID = 10000; // PERUM LPPNPI
const TODAY = new Date().toISOString().split('T')[0];
const DEFAULT_KOP_NAMA = 'AirNav Indonesia';
const DEFAULT_KOP_LOGO = '/assets/logo-airnav.png';
const DEFAULT_ALAMAT_PERUSAHAAN = 'Gedung AirNav Indonesia, Jl. Ir. H. Juanda No. 1, Tangerang 15121';
const VERIFICATION_BASE_URL = process.env.VERIFICATION_URL || 'https://arsipku.airnavindonesia.co.id/verify';

@Injectable()
export class SuratDinasInternalService {
  constructor(
    @InjectRepository(NaskahEntity)
    private readonly naskahRepository: Repository<NaskahEntity>,
    @InjectRepository(NaskahSirkulasi)
    private readonly naskahSirkulasiRepository: Repository<NaskahSirkulasi>,
    @InjectRepository(NaskahLampiranEntity)
    private readonly naskahLampiranRepository: Repository<NaskahLampiranEntity>,
    // REMOVED: sdiSdeRepository - sdi_sde table no longer used
    // @InjectRepository(SdiSdeEntity)
    // private readonly sdiSdeRepository: Repository<SdiSdeEntity>,
    @InjectRepository(NomorEntity)
    private readonly nomorRepository: Repository<NomorEntity>,
    @InjectRepository(NomorRequestEntity)
    private readonly nomorRequestRepository: Repository<NomorRequestEntity>,
    @InjectRepository(NomorRequestDetailEntity)
    private readonly nomorRequestDetailRepository: Repository<NomorRequestDetailEntity>,
    @InjectRepository(JenisEntity)
    private readonly jenisRepository: Repository<JenisEntity>,
    @InjectRepository(Session)
    private readonly sessionRepository: Repository<Session>,
    private readonly dataSource: DataSource,
    private readonly orgDataService: OrgDataService,
    private readonly nomorSuratService: NomorSuratService,
    private readonly storageService: StorageService,
    private readonly generatePdfSudinService: GeneratePdfSudinService,
    private readonly subAreaAlamatService: SubAreaAlamatService,
    private readonly digsigService: DigsigService,
    private readonly qrCodeService: QRCodeService,
    private readonly pdfQrEmbedService: PdfQrEmbedService,
    private readonly meilisearchSyncService: MeilisearchSyncService,
    private readonly notificationService: NotificationService,
    private readonly grupPenerimaService: GrupPenerimaService,
  ) { }

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

  // ============================================================
  // HELPER: EXPAND GRUP PENERIMA
  // ============================================================

  /**
   * Helper: Expand grup penerima IDs to individual position IDs
   * Combines individual penerima with expanded grup penerima (deduplicated)
   * 
   * @param individualPenerima - Array of individual positionId (number[])
   * @param grupPenerimaIds - Array of grup penerima UUIDs (string[])
   * @param tgl - Optional date for org_data lookup
   * @returns Array of unique position IDs
   */
  private async expandGrupPenerima(
    individualPenerima: number[] | undefined,
    grupPenerimaIds: string[] | undefined,
    tgl?: string,
    excludePositionId?: number,
  ): Promise<number[]> {
    const allPositionIds = new Set<number>();

    // Add individual penerima
    if (individualPenerima && individualPenerima.length > 0) {
      individualPenerima.forEach((id) => allPositionIds.add(Number(id)));
    }

    // Expand and add grup penerima
    if (grupPenerimaIds && grupPenerimaIds.length > 0) {
      for (const grupId of grupPenerimaIds) {
        try {
          const grupPositions = await this.grupPenerimaService.expandGrupToPositions(grupId, tgl);
          grupPositions.forEach((pos) => allPositionIds.add(Number(pos.position)));
        } catch (error) {
          console.warn(`[SDI:expandGrupPenerima] Failed to expand grup ${grupId}:`, error.message);
        }
      }
    }

    // Exclude sender's own position from the result (avoid sending to self via grup)
    if (excludePositionId !== undefined) {
      allPositionIds.delete(Number(excludePositionId));
    }

    return Array.from(allPositionIds);
  }

  // ============================================================
  // HELPER: BUILD PDF RECIPIENT NAMES (GRUP-AWARE)
  // ============================================================

  /**
   * Build recipient names for PDF display, using grup display names when applicable.
   * Instead of expanding grup to individual names, shows the grup display name
   * (e.g., "Para GM" instead of listing each GM individually).
   *
   * @param individualPositionIds - Array of individual position IDs (from dto.penerima or dto.tembusan)
   * @param grupIds - Array of grup penerima UUIDs (from dto.penerima_grup or dto.tembusan_grup)
   * @param barisData - org_data position array for looking up individual position names
   * @returns Array of names for PDF display
   */
  private async buildPdfRecipientNames(
    individualPositionIds: number[] | undefined,
    grupIds: string[] | undefined,
    barisData: SdiOrgDataPositionDto[],
  ): Promise<string[]> {
    const names: string[] = [];

    // Add grup display names FIRST (e.g., "Para GM") — grup appears above individuals
    if (grupIds && grupIds.length > 0) {
      const grupDisplayNames = await this.grupPenerimaService.getGrupDisplayNames(grupIds);
      names.push(...grupDisplayNames);
    }

    // Then add individual position names
    if (individualPositionIds && individualPositionIds.length > 0) {
      for (const posId of individualPositionIds) {
        const pos = barisData.find((p) => Number(p.position) === Number(posId));
        if (pos) {
          names.push(pos.position_text);
        }
      }
    }

    return names;
  }

  // ============================================================
  // HELPER: DYNAMIC HEADER INFO
  // ============================================================

  /**
   * Helper: Get dynamic header info dari sub_area_alamat berdasarkan user context
   * @param user - User context dengan company, area, subArea
   * @param tanggal - Optional date string YYYY-MM-DD untuk lookup
   * @returns Header info (kantor, gedung, alamat) atau null jika tidak ditemukan
   */
  async getHeaderInfoByUser(user: {
    company?: string | number;
    area?: string;
    subArea?: string;
  }, tanggal?: string): Promise<{ kantor: string; gedung: string; alamat: string; kota: string } | null> {
    try {
      const company = String(user.company || COMPANY_ID);
      const area = user.area || '';
      const subArea = user.subArea || '';

      if (!area || !subArea) {
        console.log('[SDI getHeaderInfoByUser] Missing area or subArea, using default');
        return null;
      }

      const queryDate = tanggal ? this.parseDateString(tanggal) : new Date();

      const headerInfo = await this.subAreaAlamatService.findAlamatByUserContext(
        company,
        area,
        subArea,
        queryDate,
      );

      if (headerInfo) {
        console.log('[SDI getHeaderInfoByUser] Found header info:', headerInfo);
        return headerInfo;
      }

      console.log('[SDI getHeaderInfoByUser] No header info found, using default');
      return null;
    } catch (error) {
      console.error('[SDI getHeaderInfoByUser] Error:', error);
      return null;
    }
  }

  // ============================================================
  // HELPER: GENERATE NOMOR WITH INTEGRATION
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
   * Helper: Generate nomor SDI dengan integrasi ke nomor_request dan nomor_request_detail
   * Menggunakan format dari tabel jenis dan update counter di tabel nomor
   * Auto-insert ke nomor_request dan nomor_request_detail dengan status 'terpakai'
   * 
   * @param pengirim - Data pengirim dari org_data
   * @param klasifikasi - Kode klasifikasi arsip
   * @param perihal - Perihal surat
   * @param tanggal - Tanggal surat
   * @param queryRunner - Query runner untuk transaction
   * @returns Nomor surat yang sudah di-generate
   */
  private async generateNomorWithIntegration(
    pengirim: SdiOrgDataPositionDto,
    klasifikasi: string,
    perihal: string,
    tanggal: Date,
    queryRunner: any,
    finalPdfKey?: string,
    finalPdfFileName?: string,
  ): Promise<string> {
    const jenis = 'SDI';
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

    // 3. Query nomor terakhir dengan locking (SDI menggunakan Company + Area)
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
    const instansi = 'LPPNPI';

    // Replace semua placeholder di format dengan nilai sebenarnya
    let nomorBaru = jenisData.formatPenomoran
      .replace(/{TIPE}/g, jenis)
      .replace(/{NO_URUT}/g, noUrutFormatted)
      .replace(/{INSTANSI}/g, instansi)
      .replace(/{JABATAN}/g, jabatanCode)
      .replace(/{LOKASI}/g, lokasiCode)
      .replace(/{KLASIFIKASI}/g, klasifikasi || '')
      .replace(/{BULAN}/g, bulanRomawi)
      .replace(/{TAHUN}/g, tahun.toString());

    // Cleanup: hapus spasi berlebih dan double slash
    nomorBaru = nomorBaru
      .replace(/\/\s+/g, '/')
      .replace(/\s+\//g, '/')
      .replace(/\/\//g, '/')
      .trim();

    // 6. Insert nomor_request_detail dengan status 'terpakai_final' (langsung dari SDI)
    const detailId = uuidv4();
    const detail = this.nomorRequestDetailRepository.create({
      id: detailId,
      idRequest: requestId,
      nomor: nomorBaru,
      fileName: finalPdfFileName || null,
      fileText: finalPdfKey || null,
      status: 'terpakai_final',
    });

    await queryRunner.manager.save(detail);

    // 7. UPSERT ke tabel nomor (update counter)
    if (nomorRecord) {
      nomorRecord.nomor = noUrut;
      nomorRecord.area = nomorRequest.area;
      nomorRecord.subArea = nomorRequest.subArea;
      nomorRecord.organization = nomorRequest.organization;
      nomorRecord.position = nomorRequest.position;
      nomorRecord.updatedAt = new Date();
      await queryRunner.manager.save(nomorRecord);
    } else {
      const nomorId = uuidv4();
      const nomor = this.nomorRepository.create({
        id: nomorId,
        company: nomorRequest.company,
        area: nomorRequest.area,
        subArea: nomorRequest.subArea,
        organization: nomorRequest.organization,
        position: nomorRequest.position,
        tahun,
        jenis,
        nomor: noUrut,
      });
      await queryRunner.manager.save(nomor);
    }

    return nomorBaru;
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
        // Return position_text only (without organization_text)
        const fullName = `${position.position_text}`;
        names.push(fullName);
      } else {
        // Fallback if position not found
        names.push(String(posId));
      }
    }

    return names;
  }

  // ============================================================
  // FORM DATA PARSER
  // ============================================================

  /**
   * Generate PDF polos (tanpa merge lampiran) untuk endpoint generate-pdf
   * Hanya template PDF saja
   */
  async generatePlainPdf(
    htmlContent: string,
    penerima: string[],
    nama_tempat: string = 'Tangerang',
    tanggal: string = '',
    nama_jabatan: string = '',
    nama_lengkap: string = '',
    tembusan: string[] = [],
    perihal: string = '',
    sifat: string = 'Biasa',
    nomor: string = '',
    lampiran: string = '-',
    headerInfo?: { kantor: string; gedung: string; alamat: string },
    qrCodeHtml?: string,
  ): Promise<Buffer> {
    try {
      const htmlBase64 = Buffer.from(htmlContent, 'utf-8').toString('base64');

      // Generate preview QR code jika qrCodeHtml tidak disediakan
      let previewQrHtml = qrCodeHtml;
      if (!previewQrHtml) {
        previewQrHtml = await this.qrCodeService.generatePreviewQRCodeHtml();
      }

      const pdfBuffer = await this.generatePdfSudinService.generatePdf({
        html: htmlBase64,
        penerima: penerima,
        nama_tempat: nama_tempat,
        tanggal: tanggal,
        positionText: nama_jabatan,
        namaLengkap: nama_lengkap,
        tembusan: tembusan,
        perihal: perihal,
        sifat: sifat,
        nomor: nomor,
        lampiran: lampiran,
        // Dynamic header info dari sub_area_alamat
        headerKantor: headerInfo?.kantor,
        headerGedung: headerInfo?.gedung,
        headerAlamat: headerInfo?.alamat,
        // QR Code HTML untuk preview
        qrCodeHtml: previewQrHtml,
      });

      return pdfBuffer;
    } catch (error) {
      throw new BadRequestException(`Gagal generate PDF: ${error.message}`);
    }
  }

  /**
   * Generate PDF dengan merge lampiran untuk endpoint preview-pdf
   * PDF template + lampiran merged
   */
  async generatePdfFromHtml(
    htmlContent: string,
    penerima: string[],
    nama_tempat: string = 'Tangerang',
    tanggal: string = '',
    nama_jabatan: string = '',
    nama_lengkap: string = '',
    tembusan: string[] = [],
    lampiranTempIds?: string[],
    perihal: string = '',
    sifat: string = 'Biasa',
    nomor: string = '',
    lampiran: string = '-',
    headerInfo?: { kantor: string; gedung: string; alamat: string },
  ): Promise<Buffer> {
    try {
      // Determine lampiran text: use file names from lampiran_temp_ids if available
      let lampiranText = lampiran;
      let lampiranFiles: any[] = [];

      if (lampiranTempIds && lampiranTempIds.length > 0) {
        lampiranFiles = await this.getTemporaryLampiranFiles(lampiranTempIds);
        if (lampiranFiles && lampiranFiles.length > 0) {
          // Auto-fill lampiran field with count format (e.g., "1 Lampiran", "2 Lampiran")
          const count = lampiranFiles.length;
          lampiranText = `${count} Lampiran`;
        }
      }

      // Generate plain PDF first
      let pdfBuffer = await this.generatePlainPdf(
        htmlContent,
        penerima,
        nama_tempat,
        tanggal,
        nama_jabatan,
        nama_lengkap,
        tembusan,
        perihal,
        sifat,
        nomor,
        lampiranText,
        headerInfo,
      );

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
   * @param finalFolder - Folder tujuan (e.g., 'surat-dinas-internal/lampiran')
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
        lampiran.jenis = 'SDI';
        lampiran.is_temporary = 0;
        lampiran.temp_folder_id = null;

        await this.naskahLampiranRepository.save(lampiran);
      } catch (error) {
        // Continue with other files
      }
    }
  }

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

    // Parse string array (for lampiran_temp_ids)
    const parseStringArray = (value: any): string[] => {
      if (!value) return [];
      if (Array.isArray(value)) return value.map(String);
      if (typeof value === 'string') {
        try {
          const parsed = JSON.parse(value);
          return Array.isArray(parsed) ? parsed.map(String) : [String(parsed)];
        } catch {
          return value.split(',').map((v: string) => v.trim());
        }
      }
      return [String(value)];
    };

    // Build DTO - support both 'penerima' and 'tertuju' field names
    const penerimaData = body.penerima || body.tertuju;

    // Parse sign_option ke enum SignOption
    let signOption: SignOption | undefined;
    if (body.sign_option) {
      const signOptionStr = String(body.sign_option).toLowerCase();
      if (signOptionStr === 'digsig') {
        signOption = SignOption.DIGSIG;
      } else if (signOptionStr === 'qr_only') {
        signOption = SignOption.QR_ONLY;
      } else if (signOptionStr === 'none') {
        signOption = SignOption.TTD_BASAH;
      }
    }

    const dto: CreateSuratDinasInternalDto = {
      pengirim: Number(body.pengirim),
      penerima: parseArray(penerimaData),
      tembusan: body.tembusan ? parseArray(body.tembusan) : undefined,

      // Grup Penerima
      penerima_grup: body.penerima_grup ? parseStringArray(body.penerima_grup) : undefined,
      tembusan_grup: body.tembusan_grup ? parseStringArray(body.tembusan_grup) : undefined,

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
      lampiran_temp_ids: body.lampiran_temp_ids ? parseStringArray(body.lampiran_temp_ids) : undefined,

      // Referensi Naskah (untuk sirkulasi persuratan)
      id_referensi_naskah: body.id_referensi_naskah,

      final_pdf: finalPdfPath || body.final_pdf,
      tgl: body.tgl,

      // NEW: Digital Signature fields
      sign_option: signOption,
      passphrase: body.passphrase ? String(body.passphrase) : undefined,
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

    // Parse string array (for lampiran_temp_ids)
    const parseStringArray = (value: any): string[] => {
      if (!value) return [];
      if (Array.isArray(value)) return value.map(String);
      if (typeof value === 'string') {
        try {
          const parsed = JSON.parse(value);
          return Array.isArray(parsed) ? parsed.map(String) : [String(parsed)];
        } catch {
          return value.split(',').map((v: string) => v.trim());
        }
      }
      return [String(value)];
    };

    // Support both 'penerima' and 'tertuju' field names
    const penerimaData = body.penerima || body.tertuju;

    const dto: UpdateDraftDto = {
      pengirim: body.pengirim ? Number(body.pengirim) : undefined,
      penerima: penerimaData ? parseArray(penerimaData) : undefined,
      tembusan: body.tembusan ? parseArray(body.tembusan) : undefined,

      // Grup Penerima
      penerima_grup: body.penerima_grup ? parseStringArray(body.penerima_grup) : undefined,
      tembusan_grup: body.tembusan_grup ? parseStringArray(body.tembusan_grup) : undefined,

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
      lampiran_temp_ids: body.lampiran_temp_ids ? parseStringArray(body.lampiran_temp_ids) : undefined,

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

    // Parse string array (for lampiran_temp_ids)
    const parseStringArray = (value: any): string[] => {
      if (!value) return [];
      if (Array.isArray(value)) return value.map(String);
      if (typeof value === 'string') {
        try {
          const parsed = JSON.parse(value);
          return Array.isArray(parsed) ? parsed.map(String) : [String(parsed)];
        } catch {
          return value.split(',').map((v: string) => v.trim());
        }
      }
      return [String(value)];
    };

    // Support both 'penerima' and 'tertuju' field names
    const penerimaData = body.penerima || body.tertuju;

    // Parse sign_option ke enum SignOption
    let signOption: SignOption | undefined;
    if (body.sign_option) {
      const signOptionStr = String(body.sign_option).toLowerCase();
      if (signOptionStr === 'digsig') {
        signOption = SignOption.DIGSIG;
      } else if (signOptionStr === 'qr_only') {
        signOption = SignOption.QR_ONLY;
      } else if (signOptionStr === 'none') {
        signOption = SignOption.TTD_BASAH;
      }
    }

    // Build DTO - semua field optional untuk finalize
    const dto: FinalizeDraftDto = {
      pengirim: body.pengirim ? Number(body.pengirim) : undefined,
      penerima: penerimaData ? parseArray(penerimaData) : undefined,
      tembusan: body.tembusan ? parseArray(body.tembusan) : undefined,

      // Grup Penerima
      penerima_grup: body.penerima_grup ? parseStringArray(body.penerima_grup) : undefined,
      tembusan_grup: body.tembusan_grup ? parseStringArray(body.tembusan_grup) : undefined,

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
      lampiran_temp_ids: body.lampiran_temp_ids ? parseStringArray(body.lampiran_temp_ids) : undefined,
      final_pdf: finalPdfPath || body.final_pdf,
      tgl: body.tgl,

      // Digital Signature options
      sign_option: signOption,
      passphrase: body.passphrase ? String(body.passphrase) : undefined,
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
   * Helper: Create sirkulasi from SdiOrgDataPositionDto
   */
  private createSirkulasiFromOrgData(
    idNaskah: string,
    sirkuler: 'pengirim' | 'penerima' | 'tembusan',
    pos: SdiOrgDataPositionDto,
    isDraft: boolean = false,
    urutan: number = 0,
    grupPenerimaId?: string,
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
      urutan: urutan,
      idGrupPenerima: grupPenerimaId || null,
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
   * Send Message - Kirim SDI dengan opsi digital signature
   * 
   * Flow baru dengan integrated signing:
   * 1. User klik "Kirim" → muncul popup pilih opsi TTD
   * 2. Opsi: digsig (passphrase), qr_only, none
   * 3. Single request ke endpoint ini dengan sign_option + passphrase
   * 4. Backend process semua dalam satu transaction
   * 
   * @param dto - CreateSuratDinasInternalDto dengan sign_option dan passphrase
   * @param persnum - Persnum user untuk BSrE signing (optional, required if sign_option=digsig)
   */
  async sendMessage(
    dto: CreateSuratDinasInternalDto,
    persnum?: number,
  ): Promise<SendMessageResponseDto> {
    // Validate sign_option + passphrase combination
    if (dto.sign_option === SignOption.DIGSIG) {
      if (!dto.passphrase) {
        throw new BadRequestException('Passphrase wajib diisi untuk opsi TTD Digital (digsig)');
      }
      if (!persnum) {
        throw new BadRequestException('Persnum user wajib diisi untuk opsi TTD Digital (digsig)');
      }
    }

    // Determine status based on sign_option
    let status: 'pending' | 'final' | 'final_tte' = 'final';
    if (dto.sign_option === SignOption.DIGSIG) {
      status = 'final_tte';
    } else if (dto.sign_option === SignOption.TTD_BASAH) {
      status = 'pending';
    }

    // Call createSdi with signing options
    return this.createSdiWithSigning(dto, status, persnum);
  }

  /**
   * Send Message tanpa signing (backward compatibility)
   * Untuk maintain existing behavior
   */
  async sendMessageLegacy(dto: CreateSuratDinasInternalDto): Promise<SendMessageResponseDto> {
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
        order: { urutan: 'ASC', createdAt: 'ASC' },
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
    TEMBUSAN: SdiOrgDataPositionDto[];
  } {
    // Cari item current berdasarkan position
    const current = barisData.find((x) => Number(x.position) === Number(positionParam));
    if (!current) {
      return { REKAN: [], TEMBUSAN: [] };
    }

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

    const filtered = barisData.filter(
      (x) =>
        x.chief === 1 &&
        x.sub_area !== current.sub_area &&
        x.departType === 'DIVORCABANG' &&
        x.bod_tag === 'BOD-1' &&
        x.company === current.company,
    );

    const tembusan = barisData.filter(
      (x) =>
        x.chief === 1 && x.bod_tag === 'BOD' && x.company === current.company,
    );

    return { REKAN: filtered, TEMBUSAN: tembusan };
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

    // Get cached org data from org_data service
    const orgData = await this.orgDataService.findOrg(tanggal);

    if (!orgData || !orgData.position_json) {
      throw new NotFoundException(`Data organisasi untuk tanggal ${tanggal} tidak ditemukan. Silakan generate data org terlebih dahulu via GET /org-data?tgl=${tanggal}`);
    }

    const barisData: SdiOrgDataPositionDto[] = orgData.position_json;

    // Find sender's position data
    const sender = barisData.find((x) => Number(x.position) === Number(positionId));

    if (!sender) {
      throw new NotFoundException(`Position dengan ID ${positionId} tidak ditemukan dalam data organisasi tanggal ${tanggal}`);
    }

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
    status: 'draf' | 'pending' | 'final' | 'final_tte',
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

    // PHASE 3: Expand and validate penerima (individual + grup)
    const expandedPenerimaIds = await this.expandGrupPenerima(dto.penerima, dto.penerima_grup, tanggal, Number(dto.pengirim));
    if (expandedPenerimaIds.length === 0) {
      throw new BadRequestException('Minimal harus ada 1 penerima (individual atau grup)');
    }

    // Build position → grup mapping for penerima
    const penerimaGrupMap = dto.penerima_grup?.length
      ? await this.grupPenerimaService.buildPositionToGrupMap(dto.penerima_grup)
      : new Map<number, string>();

    const penerimaList: SdiOrgDataPositionDto[] = [];
    for (const posId of expandedPenerimaIds) {
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

      // Note: sub_area/area validation removed - FE already validates from get-recipient
      penerimaList.push(penerima);
    }

    // PHASE 4: Expand and validate tembusan (individual + grup)
    const expandedTembusanIds = await this.expandGrupPenerima(dto.tembusan, dto.tembusan_grup, tanggal, Number(dto.pengirim));

    // Build position → grup mapping for tembusan
    const tembusanGrupMap = dto.tembusan_grup?.length
      ? await this.grupPenerimaService.buildPositionToGrupMap(dto.tembusan_grup)
      : new Map<number, string>();

    const tembusanList: SdiOrgDataPositionDto[] = [];
    if (expandedTembusanIds.length > 0) {
      for (const posId of expandedTembusanIds) {
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

        // Note: sub_area/area validation removed - FE already validates from get-recipient
        tembusanList.push(tembusan);
      }
    }

    // Start transaction
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // PHASE 6: Generate nomor surat
      // - Draft: nomor temporary
      // - Final: generate nomor resmi dengan integrasi ke nomor_request
      let nomorSurat: string;

      if (status === 'draf') {
        nomorSurat = `DRAFT-${Date.now()}`;
      } else {
        // Generate nomor dengan integrasi ke sistem penomoran
        // Auto-insert ke nomor_request dan nomor_request_detail
        // Use provided date from dto.tgl, or today as fallback
        const tanggalNomor = dto.tgl ? this.parseDateString(dto.tgl) : new Date();
        nomorSurat = await this.generateNomorWithIntegration(
          pengirim,
          dto.klasifikasi,
          dto.perihal,
          tanggalNomor,
          queryRunner,
          dto.final_pdf || undefined,
          dto.final_pdf ? dto.final_pdf.split('/').pop() : undefined,
        );
      }

      // PHASE 7: Insert naskah
      const naskahId = uuidv4();
      // Use provided date from dto.tgl, or today as fallback
      const tanggalHariIni = dto.tgl ? this.parseDateString(dto.tgl) : new Date();

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
        signOption: dto.sign_option || null,
        final_pdf: dto.final_pdf || undefined,
        english: dto.english || false,
      });
      await queryRunner.manager.save(naskah);

      // Determine if this is a draft (pending = TTD basah, belum terkirim ke penerima)
      const isDraft = status === 'draf' || status === 'pending';

      // PHASE 7a: Insert ke naskah_referensi (HANYA jika ada id_referensi_naskah)
      // Fitur sirkulasi persuratan - surat baru bisa memiliki referensi ke surat sebelumnya
      if (dto.id_referensi_naskah) {
        const naskahRef = await queryRunner.manager.findOne(NaskahEntity, {
          where: { id: dto.id_referensi_naskah },
        });

        if (naskahRef) {
          const referensi = queryRunner.manager.create(NaskahReferensiEntity, {
            id: uuidv4(),
            id_naskah: naskahId,
            ref_jenis: naskahRef.jenis || 'SDI',
            ref_pengirim: null, // Bisa diisi dari sirkulasi pengirim jika perlu
            ref_tanggal: naskahRef.tanggal || null,
            ref_nomor: naskahRef.nomor || null,
            ref_perihal: naskahRef.perihal || null,
          });
          await queryRunner.manager.save(referensi);
        }
      }

      // PHASE 8: Insert sirkulasi - pengirim
      const pengirimSirkulasi = this.createSirkulasiFromOrgData(naskahId, 'pengirim', pengirim, isDraft, 0);
      await queryRunner.manager.save(pengirimSirkulasi);

      // PHASE 9: Insert sirkulasi - penerima with urutan
      const penerimaResponses: SirkulasiInfoDto[] = [];
      for (let i = 0; i < penerimaList.length; i++) {
        const penerima = penerimaList[i];
        const penerimaSirkulasi = this.createSirkulasiFromOrgData(naskahId, 'penerima', penerima, isDraft, i, penerimaGrupMap.get(Number(penerima.position)));
        await queryRunner.manager.save(penerimaSirkulasi);
        penerimaResponses.push(this.toSirkulasiInfo(penerima));

        // Send notification to penerima (only for final naskah, not draft)
        if (!isDraft) {
          this.notificationService.createNaskahMasukNotification({
            positionId: String(penerima.position),
            userPersnum: penerima.persnum_person ? Number(penerima.persnum_person) : undefined,
            naskahId,
            sirkulasiId: penerimaSirkulasi.id,
            jenis: 'SDI',
            nomor: nomorSurat,
            perihal: dto.perihal,
            pengirim: pengirim.persnum_person_text || pengirim.position_text,
            pengirimPosition: pengirim.position_text,
            isTembusan: false,
          }).catch(err => console.error('[SuratDinasInternal] Failed to send notification to penerima:', err));
        }
      }

      // PHASE 10: Insert sirkulasi - tembusan with urutan
      const tembusanResponses: SirkulasiInfoDto[] = [];
      for (let i = 0; i < tembusanList.length; i++) {
        const tembusan = tembusanList[i];
        const tembusanSirkulasi = this.createSirkulasiFromOrgData(naskahId, 'tembusan', tembusan, isDraft, i, tembusanGrupMap.get(Number(tembusan.position)));
        await queryRunner.manager.save(tembusanSirkulasi);
        tembusanResponses.push(this.toSirkulasiInfo(tembusan));

        // Send notification to tembusan (only for final naskah, not draft)
        if (!isDraft) {
          this.notificationService.createNaskahMasukNotification({
            positionId: String(tembusan.position),
            userPersnum: tembusan.persnum_person ? Number(tembusan.persnum_person) : undefined,
            naskahId,
            sirkulasiId: tembusanSirkulasi.id,
            jenis: 'SDI',
            nomor: nomorSurat,
            perihal: dto.perihal,
            pengirim: pengirim.persnum_person_text || pengirim.position_text,
            pengirimPosition: pengirim.position_text,
            isTembusan: true,
          }).catch(err => console.error('[SuratDinasInternal] Failed to send notification to tembusan:', err));
        }
      }

      // PHASE 11: Handle lampiran
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
          'surat-dinas-internal/lampiran',
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
            jenis: 'SDI',
            is_temporary: 0,
          });
          await queryRunner.manager.save(lampiran);
        }
      }

      // PHASE 12: (REMOVED) - SdiSdeEntity tidak lagi digunakan
      // Fields yang dulu ada di sdi_sde sekarang tersedia dari:
      // - kepadaYth, dari, tembusan → dari naskah_sirkulasi
      // - namaJabatan, namaLengkap → dari naskah_sirkulasi (pengirim)
      // - tandaTangan → di naskah.tandaTangan
      // - kopLogo, kopNama, alamatPerusahaan → dead code (tidak digunakan di PDF generation)
      // - konten → di naskah.konten

      // Build kepadaYthList untuk PDF generation
      // Use grup display names for PDF instead of individual position names
      const kepadaYthList = await this.buildPdfRecipientNames(dto.penerima, dto.penerima_grup, barisData);

      const tembusanTextList = await this.buildPdfRecipientNames(dto.tembusan, dto.tembusan_grup, barisData);

      // PHASE 13: Auto-generate PDF with nomor and lampiran (only for final/final_tte)
      let finalPdfPath: string | undefined = undefined;
      if (status !== 'draf') {
        try {
          // Get dynamic header info dari sub_area_alamat berdasarkan pengirim context
          const headerInfo = await this.getHeaderInfoByUser(
            {
              company: pengirim.company ?? undefined,
              area: pengirim.area ?? undefined,
              subArea: pengirim.sub_area != null ? String(pengirim.sub_area) : undefined,
            },
            tanggal,
          );

          // Use kota from headerInfo if available, else fallback to dto.nama_tempat or pengirim.sub_area_text
          const dynamicNamaTempat = headerInfo?.kota || dto.nama_tempat || pengirim.sub_area_text || 'Tangerang';

          // Generate PDF with nomor already included
          // Use || instead of ?? to also handle empty strings from frontend
          let pdfBuffer = await this.generatePdfSudinService.generatePdf({
            html: Buffer.from(dto.konten, 'utf-8').toString('base64'),
            penerima: kepadaYthList,
            nama_tempat: dynamicNamaTempat,
            tanggal: tanggalHariIni.toLocaleDateString('id-ID', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            }),
            positionText: dto.nama_jabatan || pengirim.position_text,
            namaLengkap: dto.nama_lengkap || pengirim.persnum_person_text || pengirim.nama,
            tembusan: tembusanTextList,
            perihal: dto.perihal,
            sifat: dto.sifat || 'Biasa',
            nomor: nomorSurat,
            lampiran: dto.lampiran || '-',
            // Dynamic header info dari sub_area_alamat
            headerKantor: headerInfo?.kantor,
            headerGedung: headerInfo?.gedung,
            headerAlamat: headerInfo?.alamat,
          });

          // Merge with lampiran if any
          if (dto.lampiran_temp_ids && dto.lampiran_temp_ids.length > 0) {
            const lampiranFiles = await this.getTemporaryLampiranFiles(dto.lampiran_temp_ids);
            if (lampiranFiles && lampiranFiles.length > 0) {
              pdfBuffer = await this.mergePdfWithTemporaryFiles(pdfBuffer, lampiranFiles);
            }
          }

          // Upload PDF to storage with organized folder structure
          const timestamp = Date.now();
          const pdfFileName = `SDI-${nomorSurat.replace(/\//g, '-')}-${timestamp}.pdf`;
          const uploadResult = await this.storageService.uploadBuffer(
            pdfBuffer,
            pdfFileName,
            'application/pdf',
            'surat-dinas-internal/final',
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

      // Sync to Meilisearch (non-blocking, after successful commit)
      this.meilisearchSyncService.syncNaskah(naskahId).catch(() => { });

      // Build lampiran text from file names
      const lampiranText = lampiranFileNames.length > 0
        ? lampiranFileNames.join(', ')
        : (dto.lampiran || undefined);

      // Return response
      return {
        success: true,
        data: {
          id: naskahId,
          jenis: 'SDI',
          nomor: nomorSurat,
          tanggal: this.formatDateToString(tanggalHariIni),
          status: status,
          perihal: dto.perihal,
          pengirim: this.toSirkulasiInfo(pengirim),
          penerima: penerimaResponses,
          tembusan: tembusanResponses,
          lampiran: lampiranText, // Nama file lampiran dari temporary files
          final_pdf: finalPdfPath, // Include generated PDF path in response
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

  // ============================================================
  // CREATE SDI WITH INTEGRATED SIGNING
  // ============================================================

  /**
   * Private method: Core logic untuk create SDI dengan integrated digital signing
   * 
   * Flow:
   * 1. Create naskah dan sirkulasi (seperti createSdi biasa)
   * 2. Generate PDF tanpa QR dulu
   * 3. Jika sign_option = 'digsig':
   *    - Hit BSrE API dengan passphrase
   *    - Get name_doc dari response
   *    - Generate QR dengan signature_id + verification_url
   *    - Embed QR ke PDF menggunakan pdf-lib
   *    - Update tanda_tangan column dengan metadata
   * 4. Jika sign_option = 'qr_only':
   *    - Generate QR sederhana (tanpa signature_id)
   *    - Embed QR ke PDF menggunakan pdf-lib
   *    - tanda_tangan tetap null
   * 5. Upload final PDF ke MinIO
   * 
   * @param dto - DTO dengan sign_option dan passphrase
   * @param status - Status naskah (final/final_tte)
   * @param persnum - Persnum user untuk BSrE (optional, required for digsig)
   */
  private async createSdiWithSigning(
    dto: CreateSuratDinasInternalDto,
    status: 'pending' | 'final' | 'final_tte',
    persnum?: number,
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

    // PHASE 3: Expand and validate penerima (individual + grup)
    const expandedPenerimaIds = await this.expandGrupPenerima(dto.penerima, dto.penerima_grup, tanggal, Number(dto.pengirim));
    if (expandedPenerimaIds.length === 0) {
      throw new BadRequestException('Minimal harus ada 1 penerima (individual atau grup)');
    }

    // Build position → grup mapping for penerima
    const penerimaGrupMap = dto.penerima_grup?.length
      ? await this.grupPenerimaService.buildPositionToGrupMap(dto.penerima_grup)
      : new Map<number, string>();

    const penerimaList: SdiOrgDataPositionDto[] = [];
    for (const posId of expandedPenerimaIds) {
      const penerima = barisData.find((x) => Number(x.position) === Number(posId));
      if (!penerima) {
        throw new NotFoundException(`Penerima dengan positionId ${posId} tidak ditemukan dalam org_data`);
      }
      if (penerima.chief !== 1) {
        throw new ForbiddenException(
          `Penerima ${penerima.position_text} (${posId}) bukan managerial (chief). SDI hanya dapat dikirim ke managerial.`
        );
      }
      penerimaList.push(penerima);
    }

    // PHASE 4: Expand and validate tembusan (individual + grup)
    const expandedTembusanIds = await this.expandGrupPenerima(dto.tembusan, dto.tembusan_grup, tanggal, Number(dto.pengirim));

    // Build position → grup mapping for tembusan
    const tembusanGrupMap = dto.tembusan_grup?.length
      ? await this.grupPenerimaService.buildPositionToGrupMap(dto.tembusan_grup)
      : new Map<number, string>();

    const tembusanList: SdiOrgDataPositionDto[] = [];
    if (expandedTembusanIds.length > 0) {
      for (const posId of expandedTembusanIds) {
        const tembusan = barisData.find((x) => Number(x.position) === Number(posId));
        if (!tembusan) {
          throw new NotFoundException(`Tembusan dengan positionId ${posId} tidak ditemukan dalam org_data`);
        }
        if (tembusan.chief !== 1) {
          throw new ForbiddenException(
            `Tembusan ${tembusan.position_text} (${posId}) bukan managerial (chief). SDI hanya dapat dikirim ke managerial.`
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
      // PHASE 5: Generate nomor surat
      const tanggalNomor = dto.tgl ? this.parseDateString(dto.tgl) : new Date();
      const nomorSurat = await this.generateNomorWithIntegration(
        pengirim,
        dto.klasifikasi,
        dto.perihal,
        tanggalNomor,
        queryRunner,
        dto.final_pdf || undefined,
        dto.final_pdf ? dto.final_pdf.split('/').pop() : undefined,
      );

      // PHASE 6: Insert naskah
      const naskahId = uuidv4();
      const tanggalHariIni = dto.tgl ? this.parseDateString(dto.tgl) : new Date();

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
        signOption: dto.sign_option || null,
        final_pdf: undefined, // Will be updated after PDF generation
        english: dto.english || false,
      });
      await queryRunner.manager.save(naskah);

      // PHASE 6a: Insert ke naskah_referensi (HANYA jika ada id_referensi_naskah)
      // Fitur sirkulasi persuratan - surat baru bisa memiliki referensi ke surat sebelumnya
      if (dto.id_referensi_naskah) {
        const naskahRef = await queryRunner.manager.findOne(NaskahEntity, {
          where: { id: dto.id_referensi_naskah },
        });

        if (naskahRef) {
          const referensi = queryRunner.manager.create(NaskahReferensiEntity, {
            id: uuidv4(),
            id_naskah: naskahId,
            ref_jenis: naskahRef.jenis || 'SDI',
            ref_pengirim: null,
            ref_tanggal: naskahRef.tanggal || null,
            ref_nomor: naskahRef.nomor || null,
            ref_perihal: naskahRef.perihal || null,
          });
          await queryRunner.manager.save(referensi);
        }
      }

      // PHASE 7: Insert sirkulasi
      // TTD Basah (pending) → isDraft=true, no notifications (belum terkirim ke penerima)
      const isPending = status === 'pending';
      const pengirimSirkulasi = this.createSirkulasiFromOrgData(naskahId, 'pengirim', pengirim, isPending, 0);
      await queryRunner.manager.save(pengirimSirkulasi);

      const penerimaResponses: SirkulasiInfoDto[] = [];
      for (let i = 0; i < penerimaList.length; i++) {
        const penerima = penerimaList[i];
        const penerimaSirkulasi = this.createSirkulasiFromOrgData(naskahId, 'penerima', penerima, isPending, i, penerimaGrupMap.get(Number(penerima.position)));
        await queryRunner.manager.save(penerimaSirkulasi);
        penerimaResponses.push(this.toSirkulasiInfo(penerima));

        // Send notification to penerima (skip for pending/TTD basah)
        if (!isPending) {
          console.log(`[SDI:Signing] 🔔 TRIGGERING NOTIFICATION for penerima: position=${penerima.position}, persnum=${penerima.persnum_person}`);
          this.notificationService.createNaskahMasukNotification({
            positionId: String(penerima.position),
            userPersnum: penerima.persnum_person ? Number(penerima.persnum_person) : undefined,
            naskahId,
            sirkulasiId: penerimaSirkulasi.id,
            jenis: 'SDI',
            nomor: nomorSurat,
            perihal: dto.perihal,
            pengirim: pengirim.persnum_person_text || pengirim.position_text,
            pengirimPosition: pengirim.position_text,
            isTembusan: false,
          }).then(notif => {
            console.log(`[SDI:Signing] ✅ Notification created for penerima ${penerima.position}:`, notif ? notif.id : 'null');
          }).catch(err => {
            console.error(`[SDI:Signing] ❌ Failed to create notification for penerima ${penerima.position}:`, err.message);
          });
        }
      }

      const tembusanResponses: SirkulasiInfoDto[] = [];
      for (let i = 0; i < tembusanList.length; i++) {
        const tembusan = tembusanList[i];
        const tembusanSirkulasi = this.createSirkulasiFromOrgData(naskahId, 'tembusan', tembusan, isPending, i, tembusanGrupMap.get(Number(tembusan.position)));
        await queryRunner.manager.save(tembusanSirkulasi);
        tembusanResponses.push(this.toSirkulasiInfo(tembusan));

        // Send notification to tembusan (skip for pending/TTD basah)
        if (!isPending) {
          console.log(`[SDI:Signing] 🔔 TRIGGERING NOTIFICATION for tembusan: position=${tembusan.position}, persnum=${tembusan.persnum_person}`);
          this.notificationService.createNaskahMasukNotification({
            positionId: String(tembusan.position),
            userPersnum: tembusan.persnum_person ? Number(tembusan.persnum_person) : undefined,
            naskahId,
            sirkulasiId: tembusanSirkulasi.id,
            jenis: 'SDI',
            nomor: nomorSurat,
            perihal: dto.perihal,
            pengirim: pengirim.persnum_person_text || pengirim.position_text,
            pengirimPosition: pengirim.position_text,
            isTembusan: true,
          }).then(notif => {
            console.log(`[SDI:Signing] ✅ Notification created for tembusan ${tembusan.position}:`, notif ? notif.id : 'null');
          }).catch(err => {
            console.error(`[SDI:Signing] ❌ Failed to create notification for tembusan ${tembusan.position}:`, err.message);
          });
        }
      }

      // PHASE 8: Handle lampiran
      let lampiranFileNames: string[] = [];
      if (dto.lampiran_temp_ids && dto.lampiran_temp_ids.length > 0) {
        const lampiranFiles = await this.getTemporaryLampiranFiles(dto.lampiran_temp_ids);
        lampiranFileNames = lampiranFiles.map(f => f.fileName);
        await this.moveTemporaryLampiranToFinal(
          dto.lampiran_temp_ids,
          naskahId,
          'surat-dinas-internal/lampiran',
        );
      }

      // PHASE 9: (REMOVED) - SdiSdeEntity tidak lagi digunakan
      // Fields tersedia dari naskah_sirkulasi dan naskah.tandaTangan
      // Use grup display names for PDF instead of individual position names
      const kepadaYthList = await this.buildPdfRecipientNames(dto.penerima, dto.penerima_grup, barisData);
      const tembusanTextList = await this.buildPdfRecipientNames(dto.tembusan, dto.tembusan_grup, barisData);

      // PHASE 10: Generate PDF dengan QR code (jika signing)
      let finalPdfPath: string | undefined = undefined;
      let pdfBuffer: Buffer;
      let signatureMetadata: string | null = null;
      let bsreNameDoc: string | null = null;

      // Prepare signing data BEFORE generating PDF (untuk embed QR di template)
      const signerName = dto.nama_lengkap || pengirim.persnum_person_text || pengirim.nama || 'Penandatangan';
      const signerJabatan = dto.nama_jabatan || pengirim.position_text || 'Jabatan';
      let qrCodeHtml: string | undefined = undefined;
      let signatureId: string | undefined = undefined;
      let signedAt: string | undefined = undefined;
      let verificationUrl: string | undefined = undefined;

      console.log(`[SDI] Phase 10 - Preparing signing, sign_option: ${dto.sign_option}, persnum: ${persnum}`);

      // Pre-generate QR code untuk digsig atau qr_only SEBELUM generate PDF
      if ((dto.sign_option === SignOption.DIGSIG && persnum) || dto.sign_option === SignOption.QR_ONLY) {
        signedAt = new Date().toISOString();
        signatureId = generateSignatureId();
        verificationUrl = `${VERIFICATION_BASE_URL}/${signatureId}`;

        const qrData: QRCodeData = {
          signature_id: dto.sign_option === SignOption.DIGSIG ? signatureId : '',
          document_number: nomorSurat,
          signed_at: signedAt,
          signer_name: signerName,
          signer_jabatan: signerJabatan,
          document_type: 'Surat Dinas Internal',
          verification_url: dto.sign_option === SignOption.DIGSIG ? verificationUrl : undefined,
        };

        // Generate QR Code sebagai base64 HTML untuk template
        console.log(`[SDI] Generating QR Code HTML for template`);
        const qrBase64 = await this.qrCodeService.generateQRCodeBase64(qrData);
        qrCodeHtml = `<img src="${qrBase64}" style="width: 80px; height: 80px;" alt="QR Code" />`;
        console.log(`[SDI] QR Code HTML generated successfully`);
      }

      try {
        // Get dynamic header info
        const headerInfo = await this.getHeaderInfoByUser(
          {
            company: pengirim.company ?? undefined,
            area: pengirim.area ?? undefined,
            subArea: pengirim.sub_area != null ? String(pengirim.sub_area) : undefined,
          },
          tanggal,
        );

        const dynamicNamaTempat = headerInfo?.kota || dto.nama_tempat || pengirim.sub_area_text || 'Tangerang';

        // Generate PDF dengan QR code di template (jika ada)
        console.log(`[SDI] Generating PDF with qrCodeHtml: ${qrCodeHtml ? 'YES' : 'NO'}`);
        pdfBuffer = await this.generatePdfSudinService.generatePdf({
          html: Buffer.from(dto.konten, 'utf-8').toString('base64'),
          penerima: kepadaYthList,
          nama_tempat: dynamicNamaTempat,
          tanggal: tanggalHariIni.toLocaleDateString('id-ID', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          }),
          positionText: dto.nama_jabatan || pengirim.position_text,
          namaLengkap: dto.nama_lengkap || pengirim.persnum_person_text || pengirim.nama,
          tembusan: tembusanTextList,
          perihal: dto.perihal,
          sifat: dto.sifat || 'Biasa',
          nomor: nomorSurat,
          lampiran: dto.lampiran || '-',
          headerKantor: headerInfo?.kantor,
          headerGedung: headerInfo?.gedung,
          headerAlamat: headerInfo?.alamat,
          // QR Code HTML - akan ditampilkan di template di antara jabatan dan nama
          qrCodeHtml: qrCodeHtml,
        });
        console.log(`[SDI] PDF generated successfully`);

        // Merge with lampiran
        if (dto.lampiran_temp_ids && dto.lampiran_temp_ids.length > 0) {
          const lampiranFiles = await this.getTemporaryLampiranFiles(dto.lampiran_temp_ids);
          if (lampiranFiles && lampiranFiles.length > 0) {
            pdfBuffer = await this.mergePdfWithTemporaryFiles(pdfBuffer, lampiranFiles);
            console.log(`[SDI] Lampiran merged successfully`);
          }
        }

        // PHASE 11: Process BSrE signing (jika digsig) - QR sudah di template
        if (dto.sign_option === SignOption.DIGSIG && persnum) {
          // ========================================
          // Digital Signature dengan BSrE
          // QR sudah ada di template, tinggal hit BSrE dan build metadata
          // ========================================
          console.log(`[SDI] Processing DIGSIG for naskah ${naskahId}, persnum: ${persnum}`);

          // 11a. Fetch NIK dan no_wa dari HR API via DigsigService
          console.log(`[SDI] Step 11a - Fetching user data for persnum: ${persnum}`);
          const userData = await this.digsigService.getUserDataForBsre(persnum.toString());
          console.log(`[SDI] Step 11a - Got userData:`, { nik: userData.nik, no_wa: userData.no_wa });

          // 11b. Upload PDF (dengan QR) ke temp untuk BSrE signing
          console.log(`[SDI] Step 11b - Uploading temp PDF for BSrE`);
          const tempTimestamp = Date.now();
          const tempFileName = `temp-${naskahId}-${tempTimestamp}.pdf`;
          const tempUpload = await this.storageService.uploadBuffer(
            pdfBuffer,
            tempFileName,
            'application/pdf',
            'surat-dinas-internal/temp',
          );
          console.log(`[SDI] Step 11b - Temp PDF uploaded: ${tempUpload.key}`);

          // 11c. Hit BSrE API untuk digital signature
          console.log(`[SDI] Step 11c - Hitting BSrE API`);
          const bsreResponse = await this.digsigService.hitDigsigEndpoint({
            key: tempUpload.key,
            filename: tempFileName,
            nomorDokumen: nomorSurat,
            tanggalDokumen: this.formatDateToString(tanggalHariIni),
            klasifikasi: dto.klasifikasi || 'Biasa',
            jenisNaskah: 'Surat Dinas Internal',
            perihal: dto.perihal,
            nik: userData.nik,
            passphrase: dto.passphrase!,
            path_dokumen: 'surat-dinas-internal/digsig/',
            no_wa: userData.no_wa,
          }, {
            userPersnum: persnum,
            userName: signerName || 'User',
            idNaskah: naskahId,
            jenisNaskah: 'SDI',
          });
          console.log(`[SDI] Step 11c - BSrE response:`, JSON.stringify(bsreResponse, null, 2));

          // 11d. Extract name_doc from BSrE response (krusial untuk verifikasi)
          bsreNameDoc = bsreResponse?.name_doc?.[0] || bsreResponse?.data?.name_doc?.[0] || null;
          console.log(`[SDI] Step 11d - BSrE name_doc: ${bsreNameDoc}`);

          // 11e. Build signature metadata
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
            bsre_name_doc: bsreNameDoc, // Simpan name_doc untuk verifikasi
          });
          console.log(`[SDI] Step 11e - Signature metadata built`);

          // 11f. Cleanup temp file
          try {
            await this.storageService.deleteFile(tempUpload.key);
          } catch (e) {
            console.warn(`[SDI] Failed to cleanup temp file: ${e.message}`);
          }

          // 11g. Download signed PDF from digsig/ and upload to final/
          if (bsreNameDoc) {
            console.log(`[SDI] Step 11g - Downloading signed PDF from digsig/`);
            const digsigPath = `surat-dinas-internal/digsig/${bsreNameDoc}`;
            try {
              const signedPdfBuffer = await this.storageService.getFile(digsigPath);
              console.log(`[SDI] Step 11g - Signed PDF downloaded, size: ${signedPdfBuffer.length} bytes`);
              // Replace pdfBuffer with signed version
              pdfBuffer = signedPdfBuffer;
            } catch (e) {
              console.warn(`[SDI] Failed to download signed PDF from digsig/, will use original: ${e.message}`);
            }
          }

        } else if (dto.sign_option === SignOption.QR_ONLY) {
          // ========================================
          // QR Code tanpa Digital Signature
          // QR sudah ada di template, tidak perlu BSrE, tidak ada metadata
          // ========================================
          console.log(`[SDI] QR_ONLY mode - QR already in template, no BSrE signing needed`);
          // signatureMetadata tetap null
        }
        // OPTION 3: TTD_BASAH - tidak ada QR, space untuk tanda tangan manual

        // PHASE 12: Upload final PDF
        const finalTimestamp = Date.now();
        const pdfFileName = `SDI-${nomorSurat.replace(/\//g, '-')}-${finalTimestamp}.pdf`;
        const uploadResult = await this.storageService.uploadBuffer(
          pdfBuffer,
          pdfFileName,
          'application/pdf',
          'surat-dinas-internal/final',
        );

        finalPdfPath = uploadResult.key;

        // Update naskah with final_pdf path
        await queryRunner.manager.update(
          NaskahEntity,
          { id: naskahId },
          { final_pdf: finalPdfPath },
        );

        // Update naskah with tanda_tangan metadata (if digsig)
        // Note: SdiSdeEntity tidak lagi digunakan, tandaTangan sekarang di NaskahEntity
        if (signatureMetadata) {
          // Update path in metadata
          const metadataObj = JSON.parse(signatureMetadata);
          metadataObj.path = finalPdfPath;
          signatureMetadata = JSON.stringify(metadataObj);

          await queryRunner.manager.update(
            NaskahEntity,
            { id: naskahId },
            { tandaTangan: signatureMetadata },
          );
        }

      } catch (error) {
        console.error('[SDI] Error during PDF generation/signing:', error);
        // CRITICAL: Throw error jika signing gagal - jangan simpan naskah tanpa signature
        throw new BadRequestException(
          `Gagal proses PDF/signing: ${error.message || 'Unknown error'}`
        );
      }

      // Commit transaction
      await queryRunner.commitTransaction();

      // Sync to Meilisearch (non-blocking, after successful commit)
      this.meilisearchSyncService.syncNaskah(naskahId).catch(() => { });

      // Build response
      const lampiranTextResponse = lampiranFileNames.length > 0
        ? lampiranFileNames.join(', ')
        : (dto.lampiran || undefined);

      return {
        success: true,
        data: {
          id: naskahId,
          jenis: 'SDI',
          nomor: nomorSurat,
          tanggal: this.formatDateToString(tanggalHariIni),
          status: status,
          perihal: dto.perihal,
          pengirim: this.toSirkulasiInfo(pengirim),
          penerima: penerimaResponses,
          tembusan: tembusanResponses,
          lampiran: lampiranTextResponse,
          final_pdf: finalPdfPath,
          // Additional fields untuk digsig
          sign_option: dto.sign_option,
          bsre_name_doc: bsreNameDoc, // Return name_doc untuk FE (krusial untuk verifikasi)
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
   * Finalize Draft - Clone dari updateDraft + finalization
   * - Update semua data yang diinput (sama seperti updateDraft)
   * - Generate nomor surat resmi (ganti DRAFT-xxx)
   * - Update status: draf -> final (tanpa tanda_tangan) atau final_tte (dengan tanda_tangan)
   * - Update isDraft = false pada semua sirkulasi
   * - Support digital signature (sign_option + passphrase)
   */
  async finalizeDraft(
    naskahId: string,
    dto: FinalizeDraftDto,
    persnum?: number,
  ): Promise<SendMessageResponseDto> {
    // Validate sign_option + passphrase combination
    if (dto.sign_option === SignOption.DIGSIG) {
      if (!dto.passphrase) {
        throw new BadRequestException('Passphrase wajib diisi untuk opsi TTD Digital (digsig)');
      }
      if (!persnum) {
        throw new BadRequestException('User tidak terautentikasi. Persnum wajib untuk TTD Digital.');
      }
    }

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
    if (dto.pengirim !== undefined || dto.penerima !== undefined || dto.tembusan !== undefined ||
        dto.penerima_grup !== undefined || dto.tembusan_grup !== undefined) {
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
        // Fallback jika tidak ditemukan di org_data - include nama from namaSirkuler
        pengirimPosition = {
          position: Number(existingPengirim.position),
          position_text: existingPengirim.positionText || '',
          persnum_person_text: existingPengirim.namaSirkuler || '',
          nama: existingPengirim.namaSirkuler || '',
          sub_area: Number(existingPengirim.subArea),
          sub_area_text: existingPengirim.subAreaText || '',
          area_text: existingPengirim.areaText || 'Pusat',
        } as SdiOrgDataPositionDto;
      }
    }

    // PHASE 4: Determine new status based on sign_option or tanda_tangan
    let newStatus: 'pending' | 'final' | 'final_tte';
    if (dto.sign_option === SignOption.DIGSIG) {
      newStatus = 'final_tte';
      console.log('[SDI finalizeDraft] Status = final_tte (DIGSIG)');
    } else if (dto.sign_option === SignOption.QR_ONLY) {
      newStatus = 'final';
      console.log('[SDI finalizeDraft] Status = final (QR_ONLY)');
    } else if (dto.sign_option === SignOption.TTD_BASAH) {
      newStatus = 'pending';
      console.log('[SDI finalizeDraft] Status = pending (TTD_BASAH)');
    } else if (dto.tanda_tangan) {
      newStatus = 'final_tte';
      console.log('[SDI finalizeDraft] Status = final_tte (tanda_tangan)');
    } else {
      newStatus = 'final';
      console.log('[SDI finalizeDraft] Status = final (default)');
    }

    // Start transaction
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    let nomorSurat: string;
    let finalPdfPath: string | undefined = undefined;
    let bsreNameDoc: string | null = null;
    let signatureMetadata: string | null = null;

    try {
      // PHASE 5: Generate nomor surat resmi with integrated numbering (inside transaction)
      const klasifikasi = dto.klasifikasi ?? naskah.klasifikasi ?? '';
      const perihal = dto.perihal ?? naskah.perihal ?? '';
      // Use dto.tgl if provided, else use naskah's existing date, else today
      const tanggalNomor = dto.tgl ? this.parseDateString(dto.tgl) : (naskah.tanggal instanceof Date ? naskah.tanggal : new Date());
      nomorSurat = await this.generateNomorWithIntegration(
        pengirimPosition as SdiOrgDataPositionDto,
        klasifikasi,
        perihal,
        tanggalNomor,
        queryRunner,
        dto.final_pdf || naskah.final_pdf || undefined,
        dto.final_pdf ? dto.final_pdf.split('/').pop() : (naskah.final_pdf ? naskah.final_pdf.split('/').pop() : undefined),
      );

      // PHASE 6: Update naskah table (all fields + finalization fields)
      const naskahUpdateData: Partial<NaskahEntity> = {
        nomor: nomorSurat,
        status: newStatus,
        signOption: dto.sign_option || null,
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

      // PHASE 7: (REMOVED) - SdiSdeEntity tidak lagi digunakan
      // Data sudah tersimpan di naskah dan naskah_sirkulasi
      // Update tanda_tangan di NaskahEntity
      if (dto.tanda_tangan !== undefined) {
        await queryRunner.manager.update(
          NaskahEntity,
          { id: naskahId },
          { tandaTangan: dto.tanda_tangan },
        );
      }

      // PHASE 8: Handle sirkulasi update if any sirkulasi field is provided
      if (dto.pengirim !== undefined || dto.penerima !== undefined || dto.tembusan !== undefined ||
          dto.penerima_grup !== undefined || dto.tembusan_grup !== undefined) {
        // Note: Validation sudah dilakukan di FE dari get-recipient endpoint

        // Expand and validate penerima (individual + grup)
        let penerimaList: SdiOrgDataPositionDto[] = [];
        // Build position → grup mapping for penerima
        let penerimaGrupMap = new Map<number, string>();
        if (dto.penerima !== undefined || dto.penerima_grup !== undefined) {
          const expandedPenerimaIds = await this.expandGrupPenerima(dto.penerima, dto.penerima_grup, tanggal, Number(pengirimPosition?.position ?? dto.pengirim));
          if (dto.penerima_grup?.length) {
            penerimaGrupMap = await this.grupPenerimaService.buildPositionToGrupMap(dto.penerima_grup);
          }
          for (const posId of expandedPenerimaIds) {
            const penerima = barisData.find((x) => Number(x.position) === Number(posId));
            if (!penerima) {
              throw new NotFoundException(`Penerima dengan positionId ${posId} tidak ditemukan dalam org_data`);
            }
            if (penerima.chief !== 1) {
              throw new ForbiddenException(
                `Penerima ${penerima.position_text} (${posId}) bukan managerial (chief). SDI hanya dapat dikirim ke managerial.`
              );
            }
            // Note: sub_area/area validation removed - FE already validates from get-recipient
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

        // Expand and validate tembusan (individual + grup)
        let tembusanList: SdiOrgDataPositionDto[] = [];
        // Build position → grup mapping for tembusan
        let tembusanGrupMap = new Map<number, string>();
        if (dto.tembusan !== undefined || dto.tembusan_grup !== undefined) {
          const expandedTembusanIds = await this.expandGrupPenerima(dto.tembusan, dto.tembusan_grup, tanggal, Number(pengirimPosition?.position ?? dto.pengirim));
          if (dto.tembusan_grup?.length) {
            tembusanGrupMap = await this.grupPenerimaService.buildPositionToGrupMap(dto.tembusan_grup);
          }
          for (const posId of expandedTembusanIds) {
            const tembusan = barisData.find((x) => Number(x.position) === Number(posId));
            if (!tembusan) {
              throw new NotFoundException(`Tembusan dengan positionId ${posId} tidak ditemukan dalam org_data`);
            }
            if (tembusan.chief !== 1) {
              throw new ForbiddenException(
                `Tembusan ${tembusan.position_text} (${posId}) bukan managerial (chief). SDI hanya dapat dikirim ke managerial.`
              );
            }
            // Note: sub_area/area validation removed - FE already validates from get-recipient
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

        // Re-insert pengirim (isDraft stays true for pending/TTD basah)
        const isPending = newStatus === 'pending';
        if (fullPengirimPosition && fullPengirimPosition.position_text) {
          const pengirimSirkulasi = this.createSirkulasiFromOrgData(naskahId, 'pengirim', fullPengirimPosition, isPending, 0);
          await queryRunner.manager.save(pengirimSirkulasi);
        }

        // Re-insert penerima (isDraft stays true for pending/TTD basah)
        for (let i = 0; i < penerimaList.length; i++) {
          const penerima = penerimaList[i];
          const penerimaSirkulasi = this.createSirkulasiFromOrgData(naskahId, 'penerima', penerima, isPending, i, penerimaGrupMap.get(Number(penerima.position)));
          await queryRunner.manager.save(penerimaSirkulasi);
        }

        // Note: SdiSdeEntity.kepadaYth tidak lagi digunakan - data dari naskah_sirkulasi

        // Re-insert tembusan (isDraft stays true for pending/TTD basah)
        for (let i = 0; i < tembusanList.length; i++) {
          const tembusan = tembusanList[i];
          const tembusanSirkulasi = this.createSirkulasiFromOrgData(naskahId, 'tembusan', tembusan, isPending, i, tembusanGrupMap.get(Number(tembusan.position)));
          await queryRunner.manager.save(tembusanSirkulasi);
        }

        // Note: SdiSdeEntity.tembusan tidak lagi digunakan - data dari naskah_sirkulasi
      } else {
        // No sirkulasi changes - update isDraft based on status
        // TTD Basah (pending) keeps isDraft=true (belum terkirim ke penerima)
        const isPending = newStatus === 'pending';
        if (!isPending) {
          await queryRunner.manager.update(
            NaskahSirkulasi,
            { idNaskah: naskahId },
            { isDraft: false },
          );
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
            jenis: 'SDI',
          });
          await queryRunner.manager.save(lampiran);
        }
      }

      // PHASE 10: Auto-generate PDF (same logic as createSdi PHASE 13)
      try {
        // Get pengirim sirkulasi for fallback data (SdiSdeEntity tidak lagi digunakan)
        const pengirimSirkulasiForPdf = await queryRunner.manager.findOne(NaskahSirkulasi, {
          where: { idNaskah: naskahId, sirkuler: 'pengirim' },
        });

        // Get penerima list for PDF
        const penerimaListForPdf = await queryRunner.manager.find(NaskahSirkulasi, {
          where: { idNaskah: naskahId, sirkuler: 'penerima' },
          order: { urutan: 'ASC', createdAt: 'ASC' },
        });

        // Use grup display names for PDF if dto has grup info, otherwise fallback to sirkulasi names
        let kepadaYthList: string[];
        if (dto.penerima_grup && dto.penerima_grup.length > 0) {
          kepadaYthList = await this.buildPdfRecipientNames(
            dto.penerima || undefined,
            dto.penerima_grup,
            barisData,
          );
        } else {
          kepadaYthList = penerimaListForPdf.map(
            (p) => `${p.positionText} - ${p.organizationText}`,
          );
        }

        // Get tembusan list for PDF
        const tembusanListForPdf = await queryRunner.manager.find(NaskahSirkulasi, {
          where: { idNaskah: naskahId, sirkuler: 'tembusan' },
          order: { urutan: 'ASC', createdAt: 'ASC' },
        });

        // Use grup display names for tembusan if dto has grup info
        let tembusanTextList: string[];
        if (dto.tembusan_grup && dto.tembusan_grup.length > 0) {
          tembusanTextList = await this.buildPdfRecipientNames(
            dto.tembusan || undefined,
            dto.tembusan_grup,
            barisData,
          );
        } else {
          tembusanTextList = tembusanListForPdf.map(
            (t) => `${t.positionText} - ${t.organizationText}`,
          );
        }

        // Get tanggal for PDF
        const tanggalHariIni = naskah.tanggal instanceof Date ? naskah.tanggal : new Date();

        // Use || to handle empty strings from frontend
        // Fallback chain: dto -> pengirimPosition (org_data) -> pengirimSirkulasi (saved data)
        const resolvedPositionText = dto.nama_jabatan || pengirimPosition?.position_text || pengirimSirkulasiForPdf?.positionText || '';
        const resolvedNamaLengkap = dto.nama_lengkap || pengirimPosition?.persnum_person_text || pengirimPosition?.nama || pengirimSirkulasiForPdf?.namaSirkuler || '';

        // Get dynamic header info dari sub_area_alamat berdasarkan pengirim context
        const tanggalStr = dto.tgl || (naskah.tanggal instanceof Date ? this.formatDateToString(naskah.tanggal) : String(naskah.tanggal).split('T')[0]);
        const headerInfo = await this.getHeaderInfoByUser(
          {
            company: pengirimPosition?.company ?? pengirimSirkulasiForPdf?.company ?? undefined,
            area: pengirimPosition?.area ?? pengirimSirkulasiForPdf?.area ?? undefined,
            subArea: pengirimPosition?.sub_area != null ? String(pengirimPosition.sub_area) : (pengirimSirkulasiForPdf?.subArea ?? undefined),
          },
          tanggalStr,
        );

        // Use kota from headerInfo if available (NOT from SdiSdeEntity)
        const dynamicNamaTempat = headerInfo?.kota || dto.nama_tempat || pengirimPosition?.sub_area_text || 'Tangerang';

        // Get updated naskah for PDF content
        const updatedNaskahForPdf = await queryRunner.manager.findOne(NaskahEntity, { where: { id: naskahId } });

        let pdfBuffer = await this.generatePdfSudinService.generatePdf({
          html: Buffer.from(dto.konten || updatedNaskahForPdf?.konten || naskah.konten || '', 'utf-8').toString('base64'),
          penerima: kepadaYthList,
          nama_tempat: dynamicNamaTempat,
          tanggal: tanggalHariIni.toLocaleDateString('id-ID', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          }),
          positionText: resolvedPositionText,
          namaLengkap: resolvedNamaLengkap,
          tembusan: tembusanTextList,
          perihal: dto.perihal || updatedNaskahForPdf?.perihal || naskah.perihal || '',
          sifat: dto.sifat || updatedNaskahForPdf?.sifat || 'Biasa',
          nomor: nomorSurat,
          lampiran: dto.lampiran || updatedNaskahForPdf?.lampiran || '-',
          // Dynamic header info dari sub_area_alamat
          headerKantor: headerInfo?.kantor,
          headerGedung: headerInfo?.gedung,
          headerAlamat: headerInfo?.alamat,
        });

        // Merge with lampiran if any (from temp_ids or existing)
        if (dto.lampiran_temp_ids && dto.lampiran_temp_ids.length > 0) {
          const lampiranFiles = await this.getTemporaryLampiranFiles(dto.lampiran_temp_ids);
          if (lampiranFiles && lampiranFiles.length > 0) {
            pdfBuffer = await this.mergePdfWithTemporaryFiles(pdfBuffer, lampiranFiles);
          }
        }

        // ========================================
        // SIGNING LOGIC: QR Code + BSrE (if applicable)
        // ========================================
        if ((dto.sign_option === SignOption.DIGSIG && persnum) || dto.sign_option === SignOption.QR_ONLY) {
          console.log(`[SDI finalizeDraft] Processing signing, sign_option: ${dto.sign_option}`);

          // Generate QR Code data
          const signedAt = new Date().toISOString();
          const signatureId = generateSignatureId();
          const verificationUrl = `${VERIFICATION_BASE_URL}/${signatureId}`;

          const qrData: QRCodeData = {
            signature_id: dto.sign_option === SignOption.DIGSIG ? signatureId : '',
            document_number: nomorSurat,
            signed_at: signedAt,
            signer_name: resolvedNamaLengkap,
            signer_jabatan: resolvedPositionText,
            document_type: 'Surat Dinas Internal',
            verification_url: dto.sign_option === SignOption.DIGSIG ? verificationUrl : undefined,
          };

          // Generate QR as base64 and re-generate PDF with QR in template
          const qrBase64 = await this.qrCodeService.generateQRCodeBase64(qrData);
          const qrCodeHtml = `<img src="${qrBase64}" style="width: 80px; height: 80px;" alt="QR Code" />`;

          // Re-generate PDF with QR code in template
          pdfBuffer = await this.generatePdfSudinService.generatePdf({
            html: Buffer.from(dto.konten || updatedNaskahForPdf?.konten || naskah.konten || '', 'utf-8').toString('base64'),
            penerima: kepadaYthList,
            nama_tempat: dynamicNamaTempat,
            tanggal: tanggalHariIni.toLocaleDateString('id-ID', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            }),
            positionText: resolvedPositionText,
            namaLengkap: resolvedNamaLengkap,
            tembusan: tembusanTextList,
            perihal: dto.perihal || updatedNaskahForPdf?.perihal || naskah.perihal || '',
            sifat: dto.sifat || updatedNaskahForPdf?.sifat || 'Biasa',
            nomor: nomorSurat,
            lampiran: dto.lampiran || updatedNaskahForPdf?.lampiran || '-',
            headerKantor: headerInfo?.kantor,
            headerGedung: headerInfo?.gedung,
            headerAlamat: headerInfo?.alamat,
            qrCodeHtml: qrCodeHtml,
          });

          // Re-merge with lampiran if any
          if (dto.lampiran_temp_ids && dto.lampiran_temp_ids.length > 0) {
            const lampiranFilesForMerge = await this.getTemporaryLampiranFiles(dto.lampiran_temp_ids);
            if (lampiranFilesForMerge && lampiranFilesForMerge.length > 0) {
              pdfBuffer = await this.mergePdfWithTemporaryFiles(pdfBuffer, lampiranFilesForMerge);
            }
          }

          // If DIGSIG, hit BSrE API
          if (dto.sign_option === SignOption.DIGSIG && persnum) {
            console.log(`[SDI finalizeDraft] Hitting BSrE API for persnum: ${persnum}`);

            const userData = await this.digsigService.getUserDataForBsre(persnum.toString());

            // Upload temp PDF for BSrE
            const tempTimestamp = Date.now();
            const tempFileName = `temp-${naskahId}-${tempTimestamp}.pdf`;
            const tempUpload = await this.storageService.uploadBuffer(
              pdfBuffer,
              tempFileName,
              'application/pdf',
              'surat-dinas-internal/temp',
            );

            // Hit BSrE
            const bsreResponse = await this.digsigService.hitDigsigEndpoint({
              key: tempUpload.key,
              filename: tempFileName,
              nomorDokumen: nomorSurat,
              tanggalDokumen: this.formatDateToString(tanggalHariIni),
              klasifikasi: dto.klasifikasi || naskah.klasifikasi || 'Biasa',
              jenisNaskah: 'Surat Dinas Internal',
              perihal: dto.perihal || naskah.perihal || '',
              nik: userData.nik,
              passphrase: dto.passphrase!,
              path_dokumen: 'surat-dinas-internal/digsig/',
              no_wa: userData.no_wa,
            }, {
              userPersnum: persnum,
              userName: resolvedNamaLengkap || 'User',
              idNaskah: naskahId,
              jenisNaskah: 'SDI',
            });

            // Extract name_doc
            bsreNameDoc = bsreResponse?.name_doc?.[0] || bsreResponse?.data?.name_doc?.[0] || null;
            console.log(`[SDI finalizeDraft] BSrE name_doc: ${bsreNameDoc}`);

            // Build signature metadata
            signatureMetadata = formatSignatureData({
              type: 'digsig',
              doc_id: bsreResponse?.doc_id || bsreResponse?.data?.doc_id,
              signature_id: signatureId,
              signed_at: signedAt,
              signer_nik: userData.nik,
              signer_name: resolvedNamaLengkap,
              signer_jabatan: resolvedPositionText,
              path: null,
              verification_url: verificationUrl,
              bsre_name_doc: bsreNameDoc,
            });

            // Cleanup temp file
            try {
              await this.storageService.deleteFile(tempUpload.key);
            } catch (e) {
              console.warn(`[SDI finalizeDraft] Failed to cleanup temp file: ${e.message}`);
            }

            // Download signed PDF from digsig/ and upload to final/
            if (bsreNameDoc) {
              console.log(`[SDI finalizeDraft] Downloading signed PDF from digsig/`);
              const digsigPath = `surat-dinas-internal/digsig/${bsreNameDoc}`;
              try {
                const signedPdfBuffer = await this.storageService.getFile(digsigPath);
                console.log(`[SDI finalizeDraft] Signed PDF downloaded, size: ${signedPdfBuffer.length} bytes`);
                // Replace pdfBuffer with signed version
                pdfBuffer = signedPdfBuffer;
              } catch (e) {
                console.warn(`[SDI finalizeDraft] Failed to download signed PDF from digsig/, will use original: ${e.message}`);
              }
            }
          }
        }

        // Upload PDF to storage
        const timestamp = Date.now();
        const pdfFileName = `SDI-${nomorSurat.replace(/\//g, '-')}-${timestamp}.pdf`;
        const uploadResult = await this.storageService.uploadBuffer(
          pdfBuffer,
          pdfFileName,
          'application/pdf',
          'surat-dinas-internal/final',
        );

        finalPdfPath = uploadResult.key;

        // Update naskah with final_pdf path
        await queryRunner.manager.update(
          NaskahEntity,
          { id: naskahId },
          { final_pdf: finalPdfPath },
        );

        // Update nomor_request_detail dengan file PDF yang sudah di-generate
        await queryRunner.manager
          .createQueryBuilder()
          .update('nomor_request_detail')
          .set({
            fileName: pdfFileName,
            fileText: finalPdfPath,
          })
          .where('nomor = :nomor', { nomor: nomorSurat })
          .andWhere('status = :status', { status: 'terpakai_final' })
          .execute();

        // Update naskah with signature metadata if digsig (SdiSdeEntity tidak lagi digunakan)
        if (signatureMetadata) {
          const metadataObj = JSON.parse(signatureMetadata);
          metadataObj.path = finalPdfPath;
          signatureMetadata = JSON.stringify(metadataObj);

          await queryRunner.manager.update(
            NaskahEntity,
            { id: naskahId },
            { tandaTangan: signatureMetadata },
          );
        }
      } catch (error) {
        // Throw error if signing is required but failed
        if (dto.sign_option === SignOption.DIGSIG) {
          throw new BadRequestException(`Gagal proses signing: ${error.message}`);
        }
        // For non-digsig, log but don't fail
        console.error('[SDI finalizeDraft] PDF generation error:', error);
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
      order: { urutan: 'ASC', createdAt: 'ASC' },
    });

    const pengirimData = allSirkulasi.find((s) => s.sirkuler === 'pengirim');
    const penerimaData = allSirkulasi.filter((s) => s.sirkuler === 'penerima');
    const tembusanData = allSirkulasi.filter((s) => s.sirkuler === 'tembusan');

    // Get lampiran file names for response
    const lampiranList = await this.naskahLampiranRepository.find({
      where: { id_naskah: naskahId },
    });
    const lampiranText = lampiranList.length > 0
      ? lampiranList.map(l => l.file_name).join(', ')
      : undefined;

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
        jenis: 'SDI',
        nomor: nomorSurat,
        tanggal: tanggalStr,
        status: newStatus,
        perihal: updatedNaskah?.perihal || '',
        pengirim: this.sirkulasiToInfo(pengirimData),
        penerima: penerimaData.map((s) => this.sirkulasiToInfo(s)),
        tembusan: tembusanData.map((s) => this.sirkulasiToInfo(s)),
        lampiran: lampiranText, // Nama file lampiran dari database
        final_pdf: finalPdfPath, // Include generated PDF path in response
        // Digital signature info
        sign_option: dto.sign_option,
        bsre_name_doc: bsreNameDoc,
      } as any,
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
    if (dto.pengirim !== undefined || dto.penerima !== undefined || dto.tembusan !== undefined ||
        dto.penerima_grup !== undefined || dto.tembusan_grup !== undefined) {
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
      if (dto.tanda_tangan !== undefined) naskahUpdateData.tandaTangan = dto.tanda_tangan;

      if (Object.keys(naskahUpdateData).length > 0) {
        await queryRunner.manager.update(NaskahEntity, { id: naskahId }, naskahUpdateData);
      }

      // PHASE 4: (REMOVED) - SdiSdeEntity tidak lagi digunakan
      // Data sudah tersimpan di naskah dan naskah_sirkulasi

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

        // Note: Validation sub_area/area sudah dilakukan di FE dari get-recipient endpoint

        // Validate penerima - check exists and is managerial
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

            // Note: sub_area/area validation removed - FE already validates from get-recipient
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

        // Validate tembusan - check exists and is managerial
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

            // Note: sub_area/area validation removed - FE already validates from get-recipient
            tembusanList.push(tembusan);
          }
        }
        // If dto.tembusan is undefined or empty array, tembusanList stays empty = no tembusan

        // Delete ALL sirkulasi for this naskah
        await queryRunner.manager.delete(NaskahSirkulasi, { idNaskah: naskahId });

        // Re-insert pengirim with is_draft = true
        if (pengirimPosition) {
          const pengirimSirkulasi = this.createSirkulasiFromOrgData(naskahId, 'pengirim', pengirimPosition, true, 0);
          await queryRunner.manager.save(pengirimSirkulasi);
        }

        // Re-insert penerima with is_draft = true and urutan
        for (let i = 0; i < penerimaList.length; i++) {
          const penerima = penerimaList[i];
          const penerimaSirkulasi = this.createSirkulasiFromOrgData(naskahId, 'penerima', penerima, true, i);
          await queryRunner.manager.save(penerimaSirkulasi);
        }

        // Note: SdiSdeEntity.kepadaYth tidak lagi digunakan - data dari naskah_sirkulasi

        // Re-insert tembusan with is_draft = true and urutan (only if there are any)
        for (let i = 0; i < tembusanList.length; i++) {
          const tembusan = tembusanList[i];
          const tembusanSirkulasi = this.createSirkulasiFromOrgData(naskahId, 'tembusan', tembusan, true, i);
          await queryRunner.manager.save(tembusanSirkulasi);
        }

        // Note: SdiSdeEntity.tembusan tidak lagi digunakan - data dari naskah_sirkulasi
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
      order: { urutan: 'ASC', createdAt: 'ASC' },
    });

    const pengirimData = allSirkulasi.find((s) => s.sirkuler === 'pengirim');
    const penerimaData = allSirkulasi.filter((s) => s.sirkuler === 'penerima');
    const tembusanData = allSirkulasi.filter((s) => s.sirkuler === 'tembusan');

    // Get lampiran file names for response
    const lampiranList = await this.naskahLampiranRepository.find({
      where: { id_naskah: naskahId },
    });
    const lampiranText = lampiranList.length > 0
      ? lampiranList.map(l => l.file_name).join(', ')
      : undefined;

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
        jenis: 'SDI',
        nomor: updatedNaskah?.nomor || '',
        tanggal: tanggalStr,
        status: 'draf',
        perihal: updatedNaskah?.perihal || '',
        pengirim: this.sirkulasiToInfo(pengirimData),
        penerima: penerimaData.map((s) => this.sirkulasiToInfo(s)),
        tembusan: tembusanData.map((s) => this.sirkulasiToInfo(s)),
        lampiran: lampiranText, // Nama file lampiran dari database
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
        order: { urutan: 'ASC', createdAt: 'ASC' },
      });

      // Get all tembusan for this naskah
      const tembusanList = await this.naskahSirkulasiRepository.find({
        where: {
          idNaskah: naskah.id,
          sirkuler: 'tembusan',
        },
        order: { urutan: 'ASC', createdAt: 'ASC' },
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

        // Kop Naskah (dead code - removed, return null for compatibility)
        kop_logo: null,
        kop_nama: null,
        alamat_perusahaan: null,

        // Header
        klasifikasi: naskah.klasifikasi || '',
        klasifikasi_text: naskah.klasifikasi_text || null,
        sifat: naskah.sifat || '',
        perihal: naskah.perihal || '',
        english: naskah.english === 1 || naskah.english === true,

        // Batang Tubuh - from naskah
        konten: naskah.konten || null,

        // Kaki - from pengirimSirkulasi and naskah
        nama_tempat: naskah.tempat || null,
        nama_jabatan: pengirimSirkulasi?.positionText || null,
        tanda_tangan: naskah.tanda_tangan || null, // from naskah.tandaTangan
        nama_lengkap: pengirimSirkulasi?.namaSirkuler || null,

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

  /**
   * Get person name (persnum_person_text) by position ID
   * Used by controller to get actual person name for PDF generation
   * 
   * @param positionId - Position ID from user JWT
   * @param tgl - Optional date string (YYYY-MM-DD)
   * @returns Person name or empty string if not found
   */
  async getPersonNameByPosition(positionId: string | number, tgl?: string): Promise<string> {
    try {
      if (!positionId) {
        return '';
      }

      const tanggal = tgl ?? new Date().toISOString().split('T')[0];

      // Get org_data
      const orgData = await this.orgDataService.findOrg(tanggal);
      if (!orgData || !orgData.position_json) {
        return '';
      }

      const positionJson: SdiOrgDataPositionDto[] = orgData.position_json;

      const pos = positionJson.find(
        (p) => String(p.position) === String(positionId),
      );

      if (pos) {
        // Use persnum_person_text as primary source for person name
        return (pos as any).persnum_person_text || pos.nama || '';
      }

      return '';
    } catch (error) {
      return '';
    }
  }

  /**
   * Get SDI detail by ID
   * Menampilkan keseluruhan informasi surat termasuk PDF final
   */
  async getSdiDetail(naskahId: string): Promise<any> {
    // Get naskah data
    const naskah = await this.naskahRepository.findOne({
      where: { id: naskahId },
    });

    if (!naskah) {
      throw new NotFoundException(`Naskah dengan id ${naskahId} tidak ditemukan`);
    }

    if (naskah.jenis !== 'SDI') {
      throw new NotFoundException(`Naskah bukan Surat Dinas Internal (SDI)`);
    }

    // Get pengirim sirkulasi (SdiSdeEntity tidak lagi digunakan)
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
      order: { urutan: 'ASC', createdAt: 'ASC' },
    });

    // Get all tembusan sirkulasi
    const tembusanList = await this.naskahSirkulasiRepository.find({
      where: {
        idNaskah: naskahId,
        sirkuler: 'tembusan',
      },
      order: { urutan: 'ASC', createdAt: 'ASC' },
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

    // Extract unique grup penerima IDs from sirkulasi records
    const penerimaGrupIds = [...new Set(
      penerimaList.filter(p => p.idGrupPenerima).map(p => p.idGrupPenerima!),
    )];
    const tembusanGrupIds = [...new Set(
      tembusanList.filter(t => t.idGrupPenerima).map(t => t.idGrupPenerima!),
    )];

    // Enrich grup penerima with nama and position_ids
    const penerimaGrupInfo = await this.grupPenerimaService.getGrupInfoForResponse(penerimaGrupIds);
    const tembusanGrupInfo = await this.grupPenerimaService.getGrupInfoForResponse(tembusanGrupIds);

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

        // SDI specific info - kepada_yth built from penerima, tembusan from sirkulasi
        kepada_yth: penerimaInfoList.map(p => `${p.positionText} - ${p.organizationText}`).join('; '),
        tembusan_text: tembusanInfoList.map(t => `${t.positionText} - ${t.organizationText}`).join('; ') || null,

        // Kop (dead code - removed, return null for compatibility)
        kop_logo: null,
        kop_nama: null,
        alamat_perusahaan: null,

        // Header
        klasifikasi: naskah.klasifikasi || '',
        klasifikasi_text: naskah.klasifikasi_text || null,
        sifat: naskah.sifat || '',

        // Body - from naskah
        konten: naskah.konten || null,

        // Footer - from pengirimSirkulasi and naskah
        nama_tempat: naskah.tempat || null,
        nama_jabatan: pengirimSirkulasi?.positionText || null,
        tanda_tangan: naskah.tandaTangan || null,
        nama_lengkap: pengirimSirkulasi?.namaSirkuler || null,

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
        penerima_grup: penerimaGrupInfo,
        tembusan_grup: tembusanGrupInfo,

        // Files
        lampiran_files: lampiranInfoList,
        final_pdf: naskah.final_pdf || null,
        final_pdf_url: finalPdfUrl,

        // Metadata
        created_at: pengirimSirkulasi?.createdAt || null,
        updated_at: pengirimSirkulasi?.updatedAt || null,
      },
    };
  }

  async getSenderKonsep(
    positionId: number,
    tgl?: string,
  ): Promise<SdiOrgDataPositionDto[]> {
    const tanggal = tgl ?? new Date().toISOString().split('T')[0];

    // Get cached org data from org_data service
    const orgData = await this.orgDataService.findOrg(tanggal);

    if (!orgData || !orgData.position_json) {
      throw new NotFoundException(
        `Data organisasi untuk tanggal ${tanggal} tidak ditemukan. Silakan generate data org terlebih dahulu via GET /org-data?tgl=${tanggal}`,
      );
    }

    const data: SdiOrgDataPositionDto[] = orgData.position_json;

    const result: SdiOrgDataPositionDto[] = [];
    const added = new Set<number>(); // penanda duplicate

    // helper push aman
    const pushUnique = (item?: SdiOrgDataPositionDto) => {
      if (!item) return;
      const key = Number(item.position);
      if (added.has(key)) return;
      added.add(key);
      result.push(item);
    };

    // cari posisi awal
    let current = data.find((x) => Number(x.position) === Number(positionId));
    if (!current) return result;
    const bods = ['BOD', 'BOD-1'];
    // kalau bukan chief → ambil chiefs
    if (current.chief === 0) {
      const chiefs = data.filter(
        (x) =>
          Number(x.divisi_id) === Number(current!.divisi_id) && x.chief === 1 && bods.includes(x.bod_tag as string),
      );

      chiefs.forEach(pushUnique);

      current = chiefs.find((x) => x.bod_tag === 'BOD-1');
    }

    // loop ke atas sampai parent tertinggi
    while (current) {
      if (bods.includes(current.bod_tag as string)) {
        pushUnique(current);
      }

      const parent = data.find(
        (x) =>
          Number(x.organization_id) === Number(current!.organization_parent) &&
          x.chief === 1 && x.sub_area === current?.sub_area,
      );

      if (!parent) break;
      current = parent;
    }

    // sort akhir
    result.sort((a, b) => Number(a.level) - Number(b.level));
    return result;
  }

  // ============================================================
  // FORWARD SURAT DINAS INTERNAL
  // ============================================================

  /**
   * Forward Surat Dinas Internal ke user lain
   * Dengan kemampuan mengubah jenis naskah (SDI → ND/SDE atau sebaliknya)
   * 
   * Flow:
   * 1. Validasi naskah referensi exists dan user adalah penerima
   * 2. Get org_data untuk validasi pengirim & penerima
   * 3. Generate nomor baru sesuai jenis
   * 4. Create naskah baru dengan jenis
   * 5. Create entity content (sdi_sde atau nd) sesuai jenis
   * 6. Create naskah_referensi ke naskah asal
   * 7. Create sirkulasi pengirim & penerima
   * 8. Handle lampiran (copy atau new)
   * 9. Generate PDF sesuai jenis
   * 
   * @param dto - ForwardSuratDinasInternalDto
   * @returns ForwardSuratDinasInternalResponseDto
   */
  async forwardSuratDinasInternal(dto: any): Promise<any> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // PHASE 1: Validasi naskah referensi exists
      const naskahDiterima = await this.naskahRepository.findOne({
        where: { id: dto.id_naskah_referensi },
      });

      if (!naskahDiterima) {
        throw new NotFoundException(
          `Naskah dengan ID ${dto.id_naskah_referensi} tidak ditemukan`,
        );
      }

      if (!['ND', 'SDI', 'SDE'].includes(naskahDiterima.jenis || '')) {
        throw new BadRequestException(
          `Naskah dengan ID ${dto.id_naskah_referensi} bukan naskah dinas (jenis: ${naskahDiterima.jenis})`,
        );
      }

      // PHASE 2: Validasi pengirim adalah penerima dari naskah sebelumnya
      const sirkulasiPenerima = await this.naskahSirkulasiRepository.findOne({
        where: {
          idNaskah: dto.id_naskah_referensi,
          position: String(dto.pengirim),
          sirkuler: 'penerima',
        },
      });

      if (!sirkulasiPenerima) {
        throw new ForbiddenException(
          `Position ${dto.pengirim} bukan penerima dari naskah ${dto.id_naskah_referensi}. ` +
          `Hanya penerima yang bisa forward naskah dinas.`,
        );
      }

      // PHASE 3: Get org_data dan validasi pengirim & penerima
      const tanggal = new Date().toISOString().split('T')[0];
      const orgData = await this.orgDataService.findOrg(tanggal);

      if (!orgData || !orgData.position_json) {
        throw new NotFoundException(
          `Data organisasi untuk tanggal ${tanggal} tidak ditemukan`,
        );
      }

      const barisData: SdiOrgDataPositionDto[] = orgData.position_json;

      // Validasi pengirim
      const pengirim = barisData.find(
        (x) => Number(x.position) === Number(dto.pengirim),
      );

      if (!pengirim) {
        throw new NotFoundException(
          `Pengirim dengan position_id ${dto.pengirim} tidak ditemukan`,
        );
      }

      if (pengirim.chief !== 1) {
        throw new ForbiddenException(
          `Hanya managerial yang bisa forward naskah dinas. Position ${dto.pengirim} bukan managerial.`,
        );
      }

      // Validasi semua penerima
      const penerimaList: SdiOrgDataPositionDto[] = [];
      for (const posId of dto.penerima) {
        const penerima = barisData.find((x) => Number(x.position) === Number(posId));
        if (!penerima) {
          throw new NotFoundException(
            `Penerima dengan position_id ${posId} tidak ditemukan`,
          );
        }
        if (penerima.chief !== 1) {
          throw new ForbiddenException(
            `Penerima ${penerima.position_text} (${posId}) bukan managerial. Naskah dinas hanya dapat dikirim ke managerial.`,
          );
        }
        penerimaList.push(penerima);
      }

      // Validasi tembusan (jika ada)
      const tembusanList: SdiOrgDataPositionDto[] = [];
      if (dto.tembusan && dto.tembusan.length > 0) {
        for (const posId of dto.tembusan) {
          const tembusan = barisData.find((x) => Number(x.position) === Number(posId));
          if (!tembusan) {
            throw new NotFoundException(
              `Tembusan dengan position_id ${posId} tidak ditemukan`,
            );
          }
          if (tembusan.chief !== 1) {
            throw new ForbiddenException(
              `Tembusan ${tembusan.position_text} (${posId}) bukan managerial.`,
            );
          }
          tembusanList.push(tembusan);
        }
      }

      // PHASE 4: Generate nomor surat baru sesuai jenis
      const naskahId = uuidv4();
      const tanggalNaskah = new Date();
      const perihal = dto.perihal || naskahDiterima.perihal || '';
      const konten = dto.konten || naskahDiterima.konten || '';
      const klasifikasi = dto.klasifikasi || naskahDiterima.klasifikasi || '';

      // Generate nomor dengan jenis baru
      const nomorSurat = await this.generateNomorWithIntegration(
        pengirim,
        klasifikasi,
        perihal,
        tanggalNaskah,
        queryRunner,
        undefined,
        undefined,
      );

      // Calculate total lampiran count
      let totalLampiranCount = 0;
      if (dto.copy_lampiran_from_previous !== false) {
        totalLampiranCount += await this.naskahLampiranRepository.count({
          where: { id_naskah: dto.id_naskah_referensi },
        });
      }
      if (dto.lampiran_temp_ids && dto.lampiran_temp_ids.length > 0) {
        totalLampiranCount += dto.lampiran_temp_ids.length;
      }

      // PHASE 5: Create naskah baru dengan jenis
      const naskah = this.naskahRepository.create({
        id: naskahId,
        jenis: dto.jenis, // ND, SDI, atau SDE
        klasifikasi: klasifikasi,
        klasifikasi_text: dto.klasifikasi_text || naskahDiterima.klasifikasi_text || undefined,
        sifat: dto.sifat,
        nomor: nomorSurat,
        tanggal: tanggalNaskah,
        perihal: perihal,
        konten: konten,
        status: 'final',
        lampiran: totalLampiranCount > 0 ? `${totalLampiranCount} file` : undefined,
        english: dto.english || false,
        tandaTangan: dto.tanda_tangan || null, // Signature stored directly in naskah
      });

      await queryRunner.manager.save(naskah);

      // PHASE 6: Create naskah_referensi (link ke naskah asal)
      const naskahReferensi = queryRunner.manager.create(NaskahReferensiEntity, {
        id: uuidv4(),
        id_naskah: naskahId,
        ref_jenis: naskahDiterima.jenis as any,
        ref_pengirim: sirkulasiPenerima.namaSirkuler || null,
        ref_tanggal: naskahDiterima.tanggal || null,
        ref_nomor: naskahDiterima.nomor || null,
        ref_perihal: naskahDiterima.perihal || null,
      });
      await queryRunner.manager.save(naskahReferensi);

      // PHASE 7: (REMOVED) - NdEntity/SdiSdeEntity tidak lagi digunakan
      // Data sudah tersimpan di naskah dan naskah_sirkulasi
      // kepada_yth, dari, tembusan akan diambil dari naskah_sirkulasi
      // tanda_tangan sudah tersimpan di naskah.tandaTangan

      // PHASE 8: Create sirkulasi pengirim
      const pengirimSirkulasi = this.naskahSirkulasiRepository.create({
        id: uuidv4(),
        idNaskah: naskahId,
        sirkuler: 'pengirim',
        company: String(pengirim.company || COMPANY_ID),
        companyText: 'PERUM LPPNPI',
        area: pengirim.area || '',
        areaText: pengirim.area_text || '',
        subArea: pengirim.sub_area ? String(pengirim.sub_area) : '',
        subAreaText: pengirim.sub_area_text || '',
        organization: String(pengirim.organization_id),
        organizationText: pengirim.organization_text,
        position: String(pengirim.position),
        positionText: pengirim.position_text,
        positionStatus: 'ybs',
        idSirkuler: pengirim.persnum_person ? String(pengirim.persnum_person) : '',
        namaSirkuler: pengirim.persnum_person_text || '',
        isDraft: false,
      });
      await queryRunner.manager.save(pengirimSirkulasi);

      // PHASE 9: Create sirkulasi penerima
      const penerimaResponses: any[] = [];
      for (let i = 0; i < penerimaList.length; i++) {
        const penerima = penerimaList[i];
        const penerimaSirkulasi = this.naskahSirkulasiRepository.create({
          id: uuidv4(),
          idNaskah: naskahId,
          sirkuler: 'penerima',
          company: String(penerima.company || COMPANY_ID),
          companyText: 'PERUM LPPNPI',
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
          urutan: i,
        });
        await queryRunner.manager.save(penerimaSirkulasi);

        // Send notification to penerima (for balas surat - always final, not draft)
        this.notificationService.createNaskahMasukNotification({
          positionId: String(penerima.position),
          userPersnum: penerima.persnum_person ? Number(penerima.persnum_person) : undefined,
          naskahId,
          sirkulasiId: penerimaSirkulasi.id,
          jenis: dto.jenis,
          nomor: dto.nomor,
          perihal: dto.perihal,
          pengirim: pengirim.persnum_person_text || pengirim.position_text,
          pengirimPosition: pengirim.position_text,
          isTembusan: false,
        }).catch(err => console.error('[SuratDinasInternal:Balas] Failed to send notification to penerima:', err));

        penerimaResponses.push({
          id: penerimaSirkulasi.id,
          persnum: penerima.persnum_person || 0,
          nama: penerima.persnum_person_text || '',
          position_id: String(penerima.position),
          abbreviation: '',
          position_status: 'ybs',
          positionText: penerima.position_text,
          organizationText: penerima.organization_text,
          subAreaText: penerima.sub_area_text || '',
          areaText: penerima.area_text || '',
        });
      }

      // PHASE 10: Create sirkulasi tembusan
      const tembusanResponses: any[] = [];
      for (let i = 0; i < tembusanList.length; i++) {
        const tembusan = tembusanList[i];
        const tembusanSirkulasi = this.naskahSirkulasiRepository.create({
          id: uuidv4(),
          idNaskah: naskahId,
          sirkuler: 'tembusan',
          company: String(tembusan.company || COMPANY_ID),
          companyText: 'PERUM LPPNPI',
          area: tembusan.area || '',
          areaText: tembusan.area_text || '',
          subArea: tembusan.sub_area ? String(tembusan.sub_area) : '',
          subAreaText: tembusan.sub_area_text || '',
          organization: String(tembusan.organization_id),
          organizationText: tembusan.organization_text,
          position: String(tembusan.position),
          positionText: tembusan.position_text,
          positionStatus: 'ybs',
          idSirkuler: tembusan.persnum_person ? String(tembusan.persnum_person) : '',
          namaSirkuler: tembusan.persnum_person_text || '',
          isDraft: false,
          urutan: i,
        });
        await queryRunner.manager.save(tembusanSirkulasi);

        // Send notification to tembusan (for balas surat - always final, not draft)
        this.notificationService.createNaskahMasukNotification({
          positionId: String(tembusan.position),
          userPersnum: tembusan.persnum_person ? Number(tembusan.persnum_person) : undefined,
          naskahId,
          sirkulasiId: tembusanSirkulasi.id,
          jenis: dto.jenis,
          nomor: dto.nomor,
          perihal: dto.perihal,
          pengirim: pengirim.persnum_person_text || pengirim.position_text,
          pengirimPosition: pengirim.position_text,
          isTembusan: true,
        }).catch(err => console.error('[SuratDinasInternal:Balas] Failed to send notification to tembusan:', err));

        tembusanResponses.push({
          id: tembusanSirkulasi.id,
          persnum: tembusan.persnum_person || 0,
          nama: tembusan.persnum_person_text || '',
          position_id: String(tembusan.position),
          abbreviation: '',
          position_status: 'ybs',
          positionText: tembusan.position_text,
          organizationText: tembusan.organization_text,
          subAreaText: tembusan.sub_area_text || '',
          areaText: tembusan.area_text || '',
        });
      }

      // PHASE 11: Handle lampiran
      const lampiranResponses: any[] = [];

      // Option 1: Copy lampiran dari naskah sebelumnya
      if (dto.copy_lampiran_from_previous !== false) {
        const previousLampiran = await this.naskahLampiranRepository.find({
          where: { id_naskah: dto.id_naskah_referensi },
        });

        if (previousLampiran.length > 0) {
          for (const prevLamp of previousLampiran) {
            const newLampiran = this.naskahLampiranRepository.create({
              id: uuidv4(),
              id_naskah: naskahId,
              file_name: prevLamp.file_name,
              file_pdf: prevLamp.file_pdf,
              jenis: dto.jenis,
              is_temporary: 0,
            });
            await queryRunner.manager.save(newLampiran);

            lampiranResponses.push({
              id: newLampiran.id,
              nama_file: newLampiran.file_name,
              url: newLampiran.file_pdf,
            });
          }
        }
      }

      // Option 2: Lampiran TAMBAHAN dari temporary
      if (dto.lampiran_temp_ids && dto.lampiran_temp_ids.length > 0) {
        await this.moveTemporaryLampiranToFinal(
          dto.lampiran_temp_ids,
          naskahId,
          `${dto.jenis.toLowerCase()}/lampiran`,
        );

        const movedLampiran = await queryRunner.manager.find(NaskahLampiranEntity, {
          where: {
            id_naskah: naskahId,
            id: In(dto.lampiran_temp_ids),
          },
        });

        for (const lamp of movedLampiran) {
          lampiranResponses.push({
            id: lamp.id,
            nama_file: lamp.file_name,
            url: lamp.file_pdf,
          });
        }
      }

      // PHASE 12: Generate PDF dengan lampiran (status selalu 'final')
      // Define variables for PDF generation
      const kepadaYthList = penerimaList.map(p => `${p.position_text} - ${p.organization_text}`);
      const namaJabatan = dto.nama_jabatan || pengirim.position_text || '';
      const namaLengkap = dto.nama_lengkap || pengirim.persnum_person_text || '';
      const namaTempat = dto.nama_tempat || pengirim.sub_area_text || 'Tangerang';

      // Get dynamic header info
      const headerInfo = await this.getHeaderInfoByUser(
        {
          company: COMPANY_ID,
          area: pengirim.area ?? undefined,
          subArea: pengirim.sub_area != null ? String(pengirim.sub_area) : undefined,
        },
        tanggal,
      );

      let finalPdfPath: string | undefined = undefined;
      try {
        // Generate PDF sesuai jenis naskah
        let pdfBuffer = await this.generatePdfSudinService.generatePdf({
          html: konten,
          htmlContent: konten,
          nomor: nomorSurat,
          penerima: kepadaYthList,
          tembusan: tembusanList.length > 0
            ? tembusanList.map(t => `${t.position_text} ${t.organization_text}`)
            : [],
          perihal: perihal,
          sifat: dto.sifat,
          tanggal: tanggalNaskah.toLocaleDateString('id-ID', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          }),
          positionText: namaJabatan,
          namaLengkap: namaLengkap,
          nama_tempat: namaTempat,
          headerKantor: headerInfo?.kantor,
          headerGedung: headerInfo?.gedung,
          headerAlamat: headerInfo?.alamat,
        });

        // Merge with lampiran if any
        if (lampiranResponses.length > 0) {
          const allLampiranIds = lampiranResponses.map(l => l.id);
          const lampiranFiles = await this.getTemporaryLampiranFiles(allLampiranIds);
          if (lampiranFiles && lampiranFiles.length > 0) {
            pdfBuffer = await this.mergePdfWithTemporaryFiles(pdfBuffer, lampiranFiles);
          }
        }

        // Upload PDF to storage
        const timestamp = Date.now();
        const pdfFileName = `${dto.jenis}-${nomorSurat.replace(/\//g, '-')}-${timestamp}.pdf`;
        const uploadResult = await this.storageService.uploadBuffer(
          pdfBuffer,
          pdfFileName,
          'application/pdf',
          `${dto.jenis.toLowerCase()}/final`,
        );

        finalPdfPath = uploadResult.key;

        // Update naskah with final_pdf path
        await queryRunner.manager.update(
          NaskahEntity,
          { id: naskahId },
          { final_pdf: finalPdfPath },
        );

        console.log(`[SDI Forward] PDF generated: ${finalPdfPath}`);
      } catch (error) {
        console.error('[SDI Forward] Failed to generate PDF:', error);
        // Don't fail the whole transaction if PDF generation fails
      }

      // Auto mark tindak_lanjut = 1 pada sirkulasi penerima yang melakukan forward
      if (sirkulasiPenerima) {
        await queryRunner.manager.update(NaskahSirkulasi,
          { id: sirkulasiPenerima.id },
          { tindakLanjut: 1 },
        );
      }

      // Commit transaction
      await queryRunner.commitTransaction();

      // Build response
      return {
        success: true,
        message: `${dto.jenis} berhasil diteruskan`,
        data: {
          id: naskahId,
          jenis: dto.jenis,
          tanggal: tanggalNaskah.toISOString().split('T')[0],
          status: 'final',
          sifat: dto.sifat,
          nomor: nomorSurat,
          perihal: perihal,
          konten: konten,
          pengirim: {
            id: pengirimSirkulasi.id,
            persnum: pengirim.persnum_person || 0,
            nama: pengirim.persnum_person_text || '',
            position_id: String(pengirim.position),
            abbreviation: '',
            position_status: 'ybs',
            positionText: pengirim.position_text,
            organizationText: pengirim.organization_text,
            subAreaText: pengirim.sub_area_text || '',
            areaText: pengirim.area_text || '',
          },
          penerima: penerimaResponses,
          tembusan: tembusanResponses.length > 0 ? tembusanResponses : undefined,
          lampiran: lampiranResponses.length > 0 ? lampiranResponses : undefined,
          referensi: {
            id_naskah: dto.id_naskah_referensi,
            jenis: naskahDiterima.jenis,
            nomor: naskahDiterima.nomor,
            perihal: naskahDiterima.perihal,
            tanggal: naskahDiterima.tanggal,
          },
          final_pdf: finalPdfPath,
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
