import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { PDFDocument } from 'pdf-lib';
import * as fs from 'fs';
import { NaskahEntity } from '../../../shared/entities/naskah.entity';
import { NaskahSirkulasi } from '../../../shared/entities/naskah_sirkulasi.entity';
import { NaskahLampiranEntity } from '../../../shared/entities/naskah_lampiran.entity';
import { NdEntity } from '../entities/nd.entity';
import { NomorEntity } from '../../nomor/entities/nomor.entity';
import { NomorRequestEntity } from '../../nomor/entities/nomor-request.entity';
import { NomorRequestDetailEntity } from '../../nomor/entities/nomor-request-detail.entity';
import { JenisEntity } from '../../nomor/entities/jenis.entity';
import {
  NotaDinasRecipientResponseDto,
  OrgDataPositionDto,
} from '../dto/nota-dinas-recipient-response.dto';
import {
  CreateNotaDinasDto,
  UpdateDraftDto,
  FinalizeDraftDto,
  SignOption,
} from '../dto/create-nota-dinas.dto';
import {
  SendMessageResponseDto,
  SirkulasiInfoDto,
} from '../dto/send-message-response.dto';
import {
  GetSendMessageResponseDto,
  SendMessageItemDto,
  PenerimaInfoDto,
  TembusanInfoDto,
  LampiranInfoDto,
} from '../dto/get-send-message.dto';
import { UploadTemporaryLampiranResponseDto } from '../dto/upload-temporary-lampiran.dto';
import { OrgDataService } from 'src/modules/master-data/org_data/org_data.service';
import { NomorSuratService } from '../../../shared/services/nomor-surat.service';
import { StorageService } from '../../storage/services/storage.service';
import { GeneratePdfService } from '../../generate_pdf/generate_pdf.service';
import { GeneratePdfNodinService } from '../../generate_pdf/services/generate_pdf_nodin.service';
import { SubAreaAlamatService } from '../../sub-area-alamat/services/sub_area_alamat.service';
import { DigsigService } from 'src/modules/digsig/services';
import { QRCodeService, QRCodeData } from '../../digsig/services/qrcode.service';
import { formatSignatureData, generateSignatureId } from '../../../common/helpers/signature.helper';
import { v4 as uuidv4 } from 'uuid';

const COMPANY_ID = 10000; // PERUM LPPNPI
const DEFAULT_KOP_NAMA = 'AirNav Indonesia';
const DEFAULT_KOP_LOGO = '/assets/logo-airnav.png';
const DEFAULT_ALAMAT_PERUSAHAAN =
  'Gedung AirNav Indonesia, Jl. Ir. H. Juanda No. 1, Tangerang 15121';
const VERIFICATION_BASE_URL = process.env.VERIFICATION_URL || 'https://arsipku.airnavindonesia.co.id/verify';

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
    private readonly generatePdfService: GeneratePdfService,
    private readonly generatePdfNodinService: GeneratePdfNodinService,
    private readonly subAreaAlamatService: SubAreaAlamatService,
    private readonly digsigService: DigsigService,
    private readonly qrCodeService: QRCodeService,
  ) {}

  // ============================================================
  // HELPER: GET HEADER INFO FROM SUB_AREA_ALAMAT
  // ============================================================

  /**
   * Get dynamic header info (kantor, gedung, alamat) dari tabel sub_area_alamat
   * berdasarkan company, area, sub_area user dan tanggal
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
        console.log('[getHeaderInfoByUser] Missing area or subArea, using default');
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
        console.log('[getHeaderInfoByUser] Found header info:', headerInfo);
        return headerInfo;
      }

      console.log('[getHeaderInfoByUser] No header info found, using default');
      return null;
    } catch (error) {
      console.error('[getHeaderInfoByUser] Error:', error);
      return null;
    }
  }

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
  // HELPER: GENERATE NOMOR WITH INTEGRATION
  // ============================================================

  /**
   * Helper: Convert bulan ke Romawi
   */
  private getBulanRomawi(bulan: number): string {
    const mapping: Record<number, string> = {
      1: 'I',
      2: 'II',
      3: 'III',
      4: 'IV',
      5: 'V',
      6: 'VI',
      7: 'VII',
      8: 'VIII',
      9: 'IX',
      10: 'X',
      11: 'XI',
      12: 'XII',
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
   * Helper: Generate nomor dengan integrasi ke nomor_request dan nomor_request_detail
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
    pengirim: OrgDataPositionDto,
    klasifikasi: string,
    perihal: string,
    tanggal: Date,
    queryRunner: any,
  ): Promise<string> {
    const jenis = 'ND';
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
      company: String(pengirim.company || COMPANY_ID),
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

    // 3. Query nomor terakhir dengan locking (ND menggunakan Company + Position)
    const nomorRecord = await queryRunner.manager
      .createQueryBuilder(NomorEntity, 'n')
      .where('n.tahun = :tahun', { tahun })
      .andWhere('n.jenis = :jenis', { jenis })
      .andWhere('n.company = :company', { company: nomorRequest.company })
      .andWhere('n.position = :position', { position: nomorRequest.position })
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
    const instansi = 'LPPNPI'; // Default instansi (bisa diambil dari config atau company data)

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
      .replace(/\/\s+/g, '/') // Hapus spasi setelah slash
      .replace(/\s+\//g, '/') // Hapus spasi sebelum slash
      .replace(/\/\//g, '/') // Hapus double slash
      .trim(); // Trim spasi di awal/akhir

    // 6. Insert nomor_request_detail dengan status 'terpakai'
    const detailId = uuidv4();
    const detail = this.nomorRequestDetailRepository.create({
      id: detailId,
      idRequest: requestId,
      nomor: nomorBaru,
      fileName: null,
      fileText: null,
      status: 'terpakai',
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
      return positionIds.map((id) => String(id)); // Fallback to IDs as strings
    }

    const barisData: OrgDataPositionDto[] = orgData.position_json;
    const names: string[] = [];

    for (const posId of positionIds) {
      const numericId = typeof posId === 'string' ? parseInt(posId, 10) : posId;
      const position = barisData.find((p) => p.position === numericId);

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
   * Generate PDF dari HTML content
   * Menggunakan Puppeteer untuk render HTML ke PDF
   * Accept both plain text HTML dan base64-encoded HTML
   *
   * @param htmlContent - HTML content (plain text atau base64)
   * @param tertuju - Array nama penerima (Kepada Yth)
   * @param dari - Nama pengirim/position (Dari)
   * @param perihal - Perihal/Subjek
   * @param tanggal - Tanggal surat
   * @param positionText - Position text untuk penandatangan (display di atas nama)
   * @param namaLengkap - Nama lengkap penandatangan (display di bawah position)
   * @param tembusan - Array nama penerima tembusan
   */
  // ============================================================
  // GENERATE PDF & MERGE WITH ATTACHMENTS
  // ============================================================

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
   * Merge main PDF dengan lampiran files yang di-upload
   */
  private async mergePdfWithUploadedFiles(
    mainPdfBuffer: Buffer,
    lampiranFiles: Express.Multer.File[],
  ): Promise<Buffer> {
    try {
      if (!lampiranFiles || lampiranFiles.length === 0) {
        // Tidak ada lampiran, return main PDF as-is
        return mainPdfBuffer;
      }

      // Create main PDF document
      const pdfDoc = await PDFDocument.load(mainPdfBuffer);

      // Merge setiap lampiran file
      for (const file of lampiranFiles) {
        try {
          // Load lampiran file (dari buffer)
          let lampiranPdf: PDFDocument;

          if (file.originalname.toLowerCase().endsWith('.pdf')) {
            // PDF file
            lampiranPdf = await PDFDocument.load(file.buffer);
          } else {
            // Non-PDF files (XLSX, DOC, etc) - skip
            continue;
          }

          // Copy all pages dari lampiran ke main document
          const lampiranPages = await pdfDoc.copyPages(
            lampiranPdf,
            lampiranPdf.getPageIndices(),
          );
          lampiranPages.forEach((page) => {
            pdfDoc.addPage(page);
          });
        } catch (error) {
          // Continue dengan file berikutnya
        }
      }

      // Save merged PDF
      const mergedPdfBytes = await pdfDoc.save();
      return Buffer.from(mergedPdfBytes);
    } catch (error) {
      // Return main PDF jika merge gagal
      return mainPdfBuffer;
    }
  }

  /**
   * Generate PDF polos (tanpa merge lampiran) untuk endpoint generate-pdf
   * Hanya template PDF saja
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
    headerInfo?: { kantor: string; gedung: string; alamat: string; kota: string },
  ): Promise<Buffer> {
    try {
      // Smart detection: is htmlContent already base64 or plain text?
      let htmlToSend = htmlContent;

      // Check if it looks like base64 (only contains base64 chars)
      if (htmlContent.match(/^[A-Za-z0-9+/=]+$/)) {
        // Looks like base64, try to decode to verify
        try {
          const decoded = Buffer.from(htmlContent, 'base64').toString('utf-8');
          // If decode successful and contains HTML, it's base64
          if (decoded.includes('<') || decoded.length > 10) {
            htmlToSend = htmlContent; // Keep as base64
          } else {
            // Not really base64, encode plain text to base64
            htmlToSend = Buffer.from(htmlContent, 'utf-8').toString('base64');
          }
        } catch (e) {
          // Decode failed, treat as plain text
          htmlToSend = Buffer.from(htmlContent, 'utf-8').toString('base64');
        }
      } else {
        // Doesn't look like base64 (has chars outside base64 alphabet)
        // Encode plain text to base64
        htmlToSend = Buffer.from(htmlContent, 'utf-8').toString('base64');
      }

      // Use kota from headerInfo if available, else fallback to nama_tempat or 'Tangerang'
      const namaTempat = headerInfo?.kota || nama_tempat || 'Tangerang';

      const pdfDto = {
        html: htmlToSend,
        filename: `nota-dinas-${Date.now()}.pdf`,
        tertuju: tertuju,
        dari: dari,
        perihal: perihal,
        tanggal: tanggal,
        positionText: positionText,
        namaLengkap: namaLengkap,
        tembusan: tembusan,
        tgl: tgl,
        nama_tempat: namaTempat,
        // Dynamic header info dari sub_area_alamat
        headerKantor: headerInfo?.kantor,
        headerGedung: headerInfo?.gedung,
        headerAlamat: headerInfo?.alamat,
      };

      const pdfBuffer = await this.generatePdfNodinService.generatePdf(pdfDto);
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
    headerInfo?: { kantor: string; gedung: string; alamat: string; kota: string },
  ): Promise<Buffer> {
    try {
      // Generate plain PDF first
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

      // Handle lampiran - support both temporary IDs and direct file upload
      if (lampiranData && lampiranData.length > 0) {
        // Check if it's array of strings (temporary IDs) or Multer files
        const firstItem = lampiranData[0];

        // Check if it's a Multer file (has buffer property)
        if (
          firstItem &&
          typeof firstItem === 'object' &&
          'buffer' in firstItem
        ) {
          // Direct file upload (legacy) - Multer files
          pdfBuffer = await this.mergePdfWithUploadedFiles(
            pdfBuffer,
            lampiranData as Express.Multer.File[],
          );
        } else if (typeof firstItem === 'string') {
          // Temporary IDs - fetch from storage
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

  /**
   * Parse form-data body + uploaded files to CreateNotaDinasDto
   */
  async parseFormDataToDto(
    body: any,
    files?:
      | {
          lampiran_files?: Express.Multer.File[];
          final_pdf?: Express.Multer.File[];
        }
      | Express.Multer.File[],
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

    // Helper: Parse string array (for lampiran_temp_ids)
    const parseStringArray = (value: any): string[] => {
      if (!value) return [];
      if (Array.isArray(value)) return value;
      if (typeof value === 'string') {
        try {
          const parsed = JSON.parse(value);
          return Array.isArray(parsed) ? parsed : [parsed];
        } catch {
          return value.split(',').map((v: string) => v.trim());
        }
      }
      return [String(value)];
    };

    // Upload files to storage (DEPRECATED - akan diganti dengan temporary upload)
    let lampiranFilePaths: string[] = [];
    let finalPdfPath: string | undefined;

    if (files) {
      // Handle FileFieldsInterceptor format (object with named fields)
      if (!Array.isArray(files)) {
        // Upload lampiran files (DEPRECATED)
        if (files.lampiran_files && files.lampiran_files.length > 0) {
          const uploadPromises = files.lampiran_files.map((file) =>
            this.storageService.uploadFile(file, 'nota-dinas/lampiran'),
          );
          const uploadResults = await Promise.all(uploadPromises);
          lampiranFilePaths = uploadResults.map((result) => result.key);
        }

        // Upload final_pdf file
        if (files.final_pdf && files.final_pdf.length > 0) {
          const uploadResult = await this.storageService.uploadFile(
            files.final_pdf[0],
            'nota-dinas/final',
          );
          finalPdfPath = uploadResult.key;
        }
      } else {
        // Legacy: Handle FilesInterceptor format (array)
        const uploadPromises = files.map((file) =>
          this.storageService.uploadFile(file, 'nota-dinas/lampiran'),
        );
        const uploadResults = await Promise.all(uploadPromises);
        lampiranFilePaths = uploadResults.map((result) => result.key);
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
      lampiran_temp_ids: body.lampiran_temp_ids
        ? parseStringArray(body.lampiran_temp_ids)
        : undefined,
      lampiran_files:
        lampiranFilePaths.length > 0 ? lampiranFilePaths : undefined,

      // PDF & Tanggal
      final_pdf: finalPdfPath || body.final_pdf,
      tgl: body.tgl,

      // Digital Signature Options
      sign_option: body.sign_option,
      passphrase: body.passphrase,
    };

    return dto;
  }

  /**
   * Parse form-data body + uploaded files to FinalizeDraftDto
   * Similar to parseFormDataToDto but for FinalizeDraftDto (all fields optional)
   */
  async parseFormDataToFinalizeDraftDto(
    body: any,
    files?: { lampiran_files?: Express.Multer.File[] },
  ): Promise<FinalizeDraftDto> {
    // Helper: Parse array field (bisa JSON string atau comma-separated)
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

    // Helper: Parse string array (for lampiran_temp_ids)
    const parseStringArray = (value: any): string[] => {
      if (!value) return [];
      if (Array.isArray(value)) return value;
      if (typeof value === 'string') {
        try {
          const parsed = JSON.parse(value);
          return Array.isArray(parsed) ? parsed : [parsed];
        } catch {
          return value.split(',').map((v: string) => v.trim());
        }
      }
      return [String(value)];
    };

    // Upload lampiran files if provided
    let lampiranFilePaths: string[] = [];
    if (files?.lampiran_files && files.lampiran_files.length > 0) {
      const uploadPromises = files.lampiran_files.map((file) =>
        this.storageService.uploadFile(file, 'nota-dinas/lampiran'),
      );
      const uploadResults = await Promise.all(uploadPromises);
      lampiranFilePaths = uploadResults.map((result) => result.key);
    }

    // Build DTO (all fields optional)
    const dto: FinalizeDraftDto = {};

    // Sirkulasi
    if (body.pengirim !== undefined) dto.pengirim = Number(body.pengirim);
    if (body.penerima !== undefined) dto.penerima = parseArray(body.penerima);
    if (body.tembusan !== undefined) dto.tembusan = parseArray(body.tembusan);

    // Kop
    if (body.kop_logo !== undefined) dto.kop_logo = body.kop_logo;
    if (body.kop_nama !== undefined) dto.kop_nama = body.kop_nama;
    if (body.alamat_perusahaan !== undefined) dto.alamat_perusahaan = body.alamat_perusahaan;

    // Data Naskah
    if (body.klasifikasi !== undefined) dto.klasifikasi = body.klasifikasi;
    if (body.klasifikasi_text !== undefined) dto.klasifikasi_text = body.klasifikasi_text;
    if (body.sifat !== undefined) dto.sifat = body.sifat;
    if (body.perihal !== undefined) dto.perihal = body.perihal;
    if (body.konten !== undefined) dto.konten = body.konten;
    if (body.english !== undefined) dto.english = body.english === 'true' || body.english === true;

    // Kaki
    if (body.nama_tempat !== undefined) dto.nama_tempat = body.nama_tempat;
    if (body.nama_jabatan !== undefined) dto.nama_jabatan = body.nama_jabatan;
    if (body.tanda_tangan !== undefined) dto.tanda_tangan = body.tanda_tangan;
    if (body.nama_lengkap !== undefined) dto.nama_lengkap = body.nama_lengkap;

    // Lampiran
    if (body.lampiran !== undefined) dto.lampiran = body.lampiran;
    if (body.lampiran_temp_ids !== undefined) {
      dto.lampiran_temp_ids = parseStringArray(body.lampiran_temp_ids);
    }
    if (lampiranFilePaths.length > 0) {
      dto.lampiran_files = lampiranFilePaths;
    }

    // PDF & Tanggal
    if (body.final_pdf !== undefined) dto.final_pdf = body.final_pdf;
    if (body.tgl !== undefined) dto.tgl = body.tgl;

    // Digital Signature Options
    if (body.sign_option !== undefined) dto.sign_option = body.sign_option;
    if (body.passphrase !== undefined) dto.passphrase = body.passphrase;

    return dto;
  }

  // ============================================================
  // TEMPORARY LAMPIRAN UPLOAD
  // ============================================================

  /**
   * Upload lampiran ke temporary folder
   * Files akan disimpan dengan is_temporary=1 dan temp_folder_id yang sama
   *
   * @param files - Array of files to upload
   * @returns Response dengan temp_folder_id dan file details
   */
  async uploadTemporaryLampiran(
    files: Express.Multer.File[],
  ): Promise<UploadTemporaryLampiranResponseDto> {
    if (!files || files.length === 0) {
      throw new BadRequestException('Tidak ada file yang diupload');
    }

    const tempFolderId = uuidv4();
    const uploadedFiles: {
      id: string;
      file_name: string;
      file_path: string;
      file_url: string;
    }[] = [];

    // Upload semua files ke temporary folder
    for (const file of files) {
      const uploadResult = await this.storageService.uploadFile(
        file,
        `temporary/${tempFolderId}`,
      );

      // Simpan ke database dengan is_temporary=1
      const lampiranEntity = this.naskahLampiranRepository.create({
        id: uuidv4(),
        id_naskah: null, // Belum ada naskah
        file_name: file.originalname,
        file_pdf: uploadResult.key,
        jenis: 'ND', // Default, bisa diubah nanti
        is_temporary: 1,
        temp_folder_id: tempFolderId,
      });

      await this.naskahLampiranRepository.save(lampiranEntity);

      // Use backend preview endpoint (works reliably for inline preview)
      const fileUrl = `/preview-file/${lampiranEntity.id}`;

      uploadedFiles.push({
        id: lampiranEntity.id,
        file_name: lampiranEntity.file_name,
        file_path: lampiranEntity.file_pdf,
        file_url: fileUrl,
      });
    }

    return {
      success: true,
      data: {
        temp_folder_id: tempFolderId,
        files: uploadedFiles,
      },
    };
  }

  /**
   * Delete lampiran by ID
   * Bisa digunakan untuk hapus temporary lampiran atau lampiran yang sudah final
   *
   * @param lampiranId - ID lampiran yang akan dihapus
   * @returns Success response
   */
  async deleteLampiran(
    lampiranId: string,
  ): Promise<{ success: boolean; message: string }> {
    // Find lampiran
    const lampiran = await this.naskahLampiranRepository.findOne({
      where: { id: lampiranId },
    });

    if (!lampiran) {
      throw new NotFoundException(
        `Lampiran dengan ID ${lampiranId} tidak ditemukan`,
      );
    }

    // Check if lampiran is attached to a naskah that is already final
    if (lampiran.id_naskah && lampiran.is_temporary === 0) {
      // Lampiran sudah attach ke naskah final, perlu cek status naskah
      const naskah = await this.naskahRepository.findOne({
        where: { id: lampiran.id_naskah },
      });

      if (
        naskah &&
        (naskah.status === 'final' || naskah.status === 'final_tte')
      ) {
        throw new BadRequestException(
          'Tidak dapat menghapus lampiran dari naskah yang sudah final',
        );
      }
    }

    // Delete file from storage
    try {
      await this.storageService.deleteFile(lampiran.file_pdf);
    } catch (error) {
      // Error ignored - file might already be deleted
    }

    // Delete from database
    await this.naskahLampiranRepository.remove(lampiran);

    return {
      success: true,
      message: `Lampiran ${lampiran.file_name} berhasil dihapus`,
    };
  }

  /**
   * Move temporary lampiran ke folder final dan update database
   * Dipanggil saat save draft atau send message
   *
   * @param lampiranIds - Array of lampiran IDs (temporary)
   * @param naskahId - ID naskah yang akan dikaitkan
   * @param jenis - Jenis naskah (ND, SDI, SDE, DI, KA)
   * @param finalFolder - Folder tujuan (e.g., 'nota-dinas/lampiran')
   */
  private async moveTemporaryLampiranToFinal(
    lampiranIds: string[],
    naskahId: string,
    jenis: 'ND' | 'SDI' | 'SDE' | 'DI' | 'KA',
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
      throw new NotFoundException('Lampiran tidak ditemukan');
    }

    // Process each lampiran
    for (const lampiran of allLampiran) {
      // Skip if already linked to this naskah and not temporary
      if (lampiran.id_naskah === naskahId && lampiran.is_temporary === 0) {
        continue;
      }

      // If temporary, move file to final location
      if (lampiran.is_temporary === 1) {
        const fileName = lampiran.file_name;
        const oldKey = lampiran.file_pdf;

        // Generate new key untuk final location
        const timestamp = Date.now();
        const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
        const newKey = `${finalFolder}/${timestamp}-${sanitizedFileName}`;

        // Move file di storage
        await this.storageService.moveFile(oldKey, newKey);

        // Update file path
        lampiran.file_pdf = newKey;
        lampiran.temp_folder_id = null;
      }

      // Update database - link to naskah and mark as final
      lampiran.id_naskah = naskahId;
      lampiran.jenis = jenis;
      lampiran.is_temporary = 0;

      await this.naskahLampiranRepository.save(lampiran);
    }
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

    // Helper: Parse string array (for lampiran_temp_ids)
    const parseStringArray = (value: any): string[] => {
      if (!value) return [];
      if (Array.isArray(value)) return value;
      if (typeof value === 'string') {
        try {
          const parsed = JSON.parse(value);
          return Array.isArray(parsed) ? parsed : [parsed];
        } catch {
          return value.split(',').map((v: string) => v.trim());
        }
      }
      return [String(value)];
    };

    // Upload lampiran files
    let lampiranFilePaths: string[] = [];
    if (files?.lampiran_files && files.lampiran_files.length > 0) {
      const uploadPromises = files.lampiran_files.map((file) =>
        this.storageService.uploadFile(file, 'nota-dinas/lampiran'),
      );
      const uploadResults = await Promise.all(uploadPromises);
      lampiranFilePaths = uploadResults.map((result) => result.key);
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
      lampiran_files:
        lampiranFilePaths.length > 0 ? lampiranFilePaths : undefined,
      lampiran_temp_ids: body.lampiran_temp_ids
        ? parseStringArray(body.lampiran_temp_ids)
        : undefined,

      final_pdf: body.final_pdf,
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
    urutan: number = 0,
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
      urutan: urutan,
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
    const pengirim = barisData.find(
      (x) => Number(x.position) === Number(dto.pengirim),
    );
    if (!pengirim) {
      throw new NotFoundException(
        `Pengirim dengan positionId ${dto.pengirim} tidak ditemukan dalam org_data`,
      );
    }
    
    if (pengirim.chief !== 1) {
      throw new ForbiddenException(
        `Position ${dto.pengirim} bukan managerial (chief). Hanya managerial yang dapat mengirim ND.`,
      );
    }

    // PHASE 3: Validate all penerima
    const penerimaList: OrgDataPositionDto[] = [];
    for (const posId of dto.penerima) {
      const penerima = barisData.find(
        (x) => Number(x.position) === Number(posId),
      );
      if (!penerima) {
        throw new NotFoundException(
          `Penerima dengan positionId ${posId} tidak ditemukan dalam org_data`,
        );
      }

      // Check if penerima is managerial
      if (penerima.chief !== 1) {
        throw new ForbiddenException(
          `Penerima ${penerima.position_text} (${posId}) bukan managerial (chief). Nota Dinas hanya dapat dikirim ke managerial.`,
        );
      }

      penerimaList.push(penerima);
    }

    // PHASE 4: Validate tembusan from org_data (if any)
    const tembusanList: OrgDataPositionDto[] = [];
    if (dto.tembusan && dto.tembusan.length > 0) {
      for (const posId of dto.tembusan) {
        const tembusan = barisData.find(
          (x) => Number(x.position) === Number(posId),
        );
        if (!tembusan) {
          throw new NotFoundException(
            `Tembusan dengan positionId ${posId} tidak ditemukan dalam org_data`,
          );
        }

        // Check if tembusan is managerial
        if (tembusan.chief !== 1) {
          throw new ForbiddenException(
            `Tembusan ${tembusan.position_text} (${posId}) bukan managerial (chief). Tembusan ND hanya dapat dikirim ke managerial.`,
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
        );
      }

      // PHASE 7: Insert naskah
      const naskahId = uuidv4();
      // Use provided date from dto.tgl, or today as fallback
      const tanggalHariIni = dto.tgl ? this.parseDateString(dto.tgl) : new Date();

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
      const pengirimSirkulasi = this.createSirkulasiFromOrgData(
        naskahId,
        'pengirim',
        pengirim,
        isDraft,
        0,
      );
      await queryRunner.manager.save(pengirimSirkulasi);

      // PHASE 9: Insert sirkulasi - penerima with urutan
      const penerimaResponses: SirkulasiInfoDto[] = [];
      for (let i = 0; i < penerimaList.length; i++) {
        const penerima = penerimaList[i];
        const penerimaSirkulasi = this.createSirkulasiFromOrgData(
          naskahId,
          'penerima',
          penerima,
          isDraft,
          i,
        );
        await queryRunner.manager.save(penerimaSirkulasi);
        penerimaResponses.push(this.toSirkulasiInfo(penerima));
      }

      // PHASE 10: Insert sirkulasi - tembusan with urutan
      const tembusanResponses: SirkulasiInfoDto[] = [];
      for (let i = 0; i < tembusanList.length; i++) {
        const tembusan = tembusanList[i];
        const tembusanSirkulasi = this.createSirkulasiFromOrgData(
          naskahId,
          'tembusan',
          tembusan,
          isDraft,
          i,
        );
        await queryRunner.manager.save(tembusanSirkulasi);
        tembusanResponses.push(this.toSirkulasiInfo(tembusan));
      }

      // PHASE 11: Insert lampiran (if any)
      // Handle temporary lampiran (RECOMMENDED)
      if (dto.lampiran_temp_ids && dto.lampiran_temp_ids.length > 0) {
        await this.moveTemporaryLampiranToFinal(
          dto.lampiran_temp_ids,
          naskahId,
          'ND',
          'nota-dinas/lampiran',
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
            jenis: 'ND',
            is_temporary: 0,
          });
          await queryRunner.manager.save(lampiran);
        }
      }

      // PHASE 12: Insert ke tabel nd (konten lengkap Nota Dinas)
      const kepadaYthList = penerimaList.map(
        (p) => p.position_text,
      );
      const kepadaYth = kepadaYthList.join('; ');

      const tembusanTextList = tembusanList.map(
        (t) => t.position_text,
      );
      const tembusanText =
        tembusanTextList.length > 0 ? tembusanTextList.join('\n') : null;

      // Get dynamic header info dari sub_area_alamat berdasarkan pengirim context
      // Digunakan untuk kota (nama_tempat) dan header PDF
      const headerInfo = await this.getHeaderInfoByUser(
        {
          company: pengirim.company ?? undefined,
          area: pengirim.area ?? undefined,
          subArea: pengirim.sub_area != null ? String(pengirim.sub_area) : undefined,
        },
        tanggal,
      );

      // Use kota from headerInfo if available, else fallback to dto.nama_tempat, pengirim.sub_area_text, or 'Tangerang'
      const dynamicNamaTempat = headerInfo?.kota || dto.nama_tempat || pengirim.sub_area_text || 'Tangerang';

      const ndEntity = this.ndRepository.create({
        id: uuidv4(),
        idNaskah: naskahId,
        kopLogo: dto.kop_logo ?? DEFAULT_KOP_LOGO,
        kopNama: dto.kop_nama ?? DEFAULT_KOP_NAMA,
        alamatPerusahaan: dto.alamat_perusahaan ?? DEFAULT_ALAMAT_PERUSAHAAN,
        nomor: nomorSurat,
        kepadaYth: kepadaYth,
        dari: `${pengirim.position_text}`,
        perihal: dto.perihal,
        konten: dto.konten,
        namaTempat: dynamicNamaTempat,
        tanggal: tanggalHariIni,
        namaJabatan: dto.nama_jabatan ?? pengirim.position_text,
        tandaTangan: dto.tanda_tangan ?? null,
        namaLengkap: dto.nama_lengkap || pengirim.persnum_person_text || '',
        tembusan: tembusanText,
      });
      await queryRunner.manager.save(ndEntity);

      // PHASE 13: Auto-generate PDF with nomor (only for final/final_tte)
      let finalPdfPath: string | undefined = undefined;
      if (status !== 'draf') {
        try {
          // Generate PDF with nomor already included
          // headerInfo and dynamicNamaTempat already obtained above in PHASE 12
          let pdfBuffer = await this.generatePdfNodinService.generatePdf({
            htmlContent: dto.konten,
            nomor: nomorSurat,
            tertuju: kepadaYthList,
            tembusan: tembusanTextList,
            perihal: dto.perihal,
            dari: `${pengirim.position_text}`,
            tanggal: tanggalHariIni.toLocaleDateString('id-ID', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            }),
            positionText: dto.nama_jabatan ?? pengirim.position_text,
            namaLengkap: dto.nama_lengkap || pengirim.persnum_person_text || '',
            // Dynamic nama_tempat dari sub_area_alamat.kota
            nama_tempat: dynamicNamaTempat,
            // Add dynamic header info
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
          const pdfFileName = `ND-${nomorSurat.replace(/\//g, '-')}-${timestamp}.pdf`;
          const uploadResult = await this.storageService.uploadBuffer(
            pdfBuffer,
            pdfFileName,
            'application/pdf',
            'nota-dinas/final',
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

      // Return response
      return {
        success: true,
        data: {
          id: naskahId,
          jenis: 'ND',
          nomor: nomorSurat,
          tanggal: this.formatDateToString(tanggalHariIni),
          status: status,
          perihal: dto.perihal,
          pengirim: this.toSirkulasiInfo(pengirim),
          penerima: penerimaResponses,
          tembusan: tembusanResponses,
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
   * Save Draft - Simpan Nota Dinas sebagai draft
   * Status: 'draf'
   */
  async saveDraft(dto: CreateNotaDinasDto): Promise<SendMessageResponseDto> {
    return this.createNotaDinas(dto, 'draf');
  }

  /**
   * Send Message - Kirim Nota Dinas
   * Status: 'final' (tanpa tanda tangan) atau 'final_tte' (dengan tanda tangan)
   * 
   * Digital Signature Options:
   * - sign_option: 'digsig' | 'qr_only' | 'none'
   * - passphrase: BSrE passphrase (required if sign_option = 'digsig')
   * 
   * @param dto - CreateNotaDinasDto dengan sign_option dan passphrase
   * @param persnum - Persnum user untuk BSrE signing (optional, required if sign_option=digsig)
   */
  async sendMessage(
    dto: CreateNotaDinasDto, 
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
    let status: 'final' | 'final_tte' = 'final';
    if (dto.sign_option === SignOption.DIGSIG) {
      status = 'final_tte';
    }

    // Call createNdWithSigning with signing options
    return this.createNdWithSigning(dto, status, persnum);
  }

  /**
   * Create Nota Dinas with Signing Support
   * Menggabungkan create naskah + generate PDF + signing (QR/BSrE) dalam satu transaction
   * 
   * Flow Signing:
   * 1. NONE: Generate PDF biasa tanpa QR, tanda_tangan = null
   * 2. QR_ONLY: Generate QR sederhana, embed di template, tanda_tangan = null
   * 3. DIGSIG:
   *    - Generate QR dengan signature_id dan verification_url
   *    - Embed QR ke PDF template
   *    - Hit BSrE API untuk digital signature
   *    - Simpan metadata di tanda_tangan
   * 
   * @param dto - DTO dengan sign_option dan passphrase
   * @param status - Status naskah (final/final_tte)
   * @param persnum - Persnum user untuk BSrE (optional, required for digsig)
   */
  private async createNdWithSigning(
    dto: CreateNotaDinasDto,
    status: 'final' | 'final_tte',
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
      if (penerima.chief !== 1) {
        throw new ForbiddenException(
          `Penerima ${penerima.position_text} (${posId}) bukan managerial (chief). ND hanya dapat dikirim ke managerial.`
        );
      }
      penerimaList.push(penerima);
    }

    // PHASE 4: Validate tembusan
    const tembusanList: OrgDataPositionDto[] = [];
    if (dto.tembusan && dto.tembusan.length > 0) {
      for (const posId of dto.tembusan) {
        const tembusan = barisData.find((x) => Number(x.position) === Number(posId));
        if (!tembusan) {
          throw new NotFoundException(`Tembusan dengan positionId ${posId} tidak ditemukan dalam org_data`);
        }
        if (tembusan.chief !== 1) {
          throw new ForbiddenException(
            `Tembusan ${tembusan.position_text} (${posId}) bukan managerial (chief). ND hanya dapat dikirim ke managerial.`
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
      );

      // PHASE 6: Insert naskah
      const naskahId = uuidv4();
      const tanggalHariIni = dto.tgl ? this.parseDateString(dto.tgl) : new Date();

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
        final_pdf: undefined, // Will be updated after PDF generation
        english: dto.english || false,
      });
      await queryRunner.manager.save(naskah);

      // PHASE 7: Insert sirkulasi
      const pengirimSirkulasi = this.createSirkulasiFromOrgData(naskahId, 'pengirim', pengirim, false, 0);
      await queryRunner.manager.save(pengirimSirkulasi);

      const penerimaResponses: SirkulasiInfoDto[] = [];
      for (let i = 0; i < penerimaList.length; i++) {
        const penerima = penerimaList[i];
        const penerimaSirkulasi = this.createSirkulasiFromOrgData(naskahId, 'penerima', penerima, false, i);
        await queryRunner.manager.save(penerimaSirkulasi);
        penerimaResponses.push(this.toSirkulasiInfo(penerima));
      }

      const tembusanResponses: SirkulasiInfoDto[] = [];
      for (let i = 0; i < tembusanList.length; i++) {
        const tembusan = tembusanList[i];
        const tembusanSirkulasi = this.createSirkulasiFromOrgData(naskahId, 'tembusan', tembusan, false, i);
        await queryRunner.manager.save(tembusanSirkulasi);
        tembusanResponses.push(this.toSirkulasiInfo(tembusan));
      }

      // PHASE 8: Handle lampiran
      let lampiranFileNames: string[] = [];
      if (dto.lampiran_temp_ids && dto.lampiran_temp_ids.length > 0) {
        const lampiranFiles = await this.getTemporaryLampiranFiles(dto.lampiran_temp_ids);
        lampiranFileNames = lampiranFiles.map(f => f.fileName);
        await this.moveTemporaryLampiranToFinal(
          dto.lampiran_temp_ids,
          naskahId,
          'ND',
          'nota-dinas/lampiran',
        );
      }

      // PHASE 9: Insert nd entity
      const kepadaYthList = penerimaList.map((p) => p.position_text);
      const kepadaYth = kepadaYthList.join('; ');
      const tembusanTextList = tembusanList.map((t) => t.position_text);
      const tembusanText = tembusanTextList.length > 0 ? tembusanTextList.join('\n') : null;

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

      const ndEntity = this.ndRepository.create({
        id: uuidv4(),
        idNaskah: naskahId,
        kopLogo: dto.kop_logo ?? DEFAULT_KOP_LOGO,
        kopNama: dto.kop_nama ?? DEFAULT_KOP_NAMA,
        alamatPerusahaan: dto.alamat_perusahaan ?? DEFAULT_ALAMAT_PERUSAHAAN,
        nomor: nomorSurat,
        kepadaYth: kepadaYth,
        dari: `${pengirim.position_text}`,
        perihal: dto.perihal,
        konten: dto.konten,
        namaTempat: dynamicNamaTempat,
        tanggal: tanggalHariIni,
        namaJabatan: dto.nama_jabatan ?? pengirim.position_text,
        tandaTangan: null, // Will be updated if digsig
        namaLengkap: dto.nama_lengkap || pengirim.persnum_person_text || '',
        tembusan: tembusanText,
      });
      await queryRunner.manager.save(ndEntity);

      // PHASE 10: Generate PDF dengan QR code (jika signing)
      let finalPdfPath: string | undefined = undefined;
      let pdfBuffer: Buffer;
      let signatureMetadata: string | null = null;
      let bsreNameDoc: string | null = null;

      // Prepare signing data BEFORE generating PDF (untuk embed QR di template)
      const signerName = dto.nama_lengkap || pengirim.persnum_person_text || 'Penandatangan';
      const signerJabatan = dto.nama_jabatan || pengirim.position_text || 'Jabatan';
      let qrCodeHtml: string | undefined = undefined;
      let signatureId: string | undefined = undefined;
      let signedAt: string | undefined = undefined;
      let verificationUrl: string | undefined = undefined;

      console.log(`[ND] Phase 10 - Preparing signing, sign_option: ${dto.sign_option}, persnum: ${persnum}`);

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
          document_type: 'Nota Dinas',
          verification_url: dto.sign_option === SignOption.DIGSIG ? verificationUrl : undefined,
        };

        // Generate QR Code sebagai base64 HTML untuk template
        console.log(`[ND] Generating QR Code HTML for template`);
        const qrBase64 = await this.qrCodeService.generateQRCodeBase64(qrData);
        qrCodeHtml = `<img src="${qrBase64}" style="width: 80px; height: 80px;" alt="QR Code" />`;
        console.log(`[ND] QR Code HTML generated successfully`);
      }

      try {
        // Generate PDF dengan QR code di template (jika ada)
        console.log(`[ND] Generating PDF with qrCodeHtml: ${qrCodeHtml ? 'YES' : 'NO'}`);
        pdfBuffer = await this.generatePdfNodinService.generatePdf({
          htmlContent: dto.konten,
          nomor: nomorSurat,
          tertuju: kepadaYthList,
          tembusan: tembusanTextList,
          perihal: dto.perihal,
          dari: `${pengirim.position_text}`,
          tanggal: tanggalHariIni.toLocaleDateString('id-ID', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          }),
          positionText: dto.nama_jabatan ?? pengirim.position_text,
          namaLengkap: dto.nama_lengkap || pengirim.persnum_person_text || '',
          nama_tempat: dynamicNamaTempat,
          headerKantor: headerInfo?.kantor,
          headerGedung: headerInfo?.gedung,
          headerAlamat: headerInfo?.alamat,
          // QR Code HTML - akan ditampilkan di template di antara jabatan dan nama
          qrCodeHtml: qrCodeHtml,
        });
        console.log(`[ND] PDF generated successfully`);

        // Merge with lampiran
        if (dto.lampiran_temp_ids && dto.lampiran_temp_ids.length > 0) {
          const lampiranFiles = await this.getTemporaryLampiranFiles(dto.lampiran_temp_ids);
          if (lampiranFiles && lampiranFiles.length > 0) {
            pdfBuffer = await this.mergePdfWithTemporaryFiles(pdfBuffer, lampiranFiles);
            console.log(`[ND] Lampiran merged successfully`);
          }
        }

        // PHASE 11: Process BSrE signing (jika digsig) - QR sudah di template
        if (dto.sign_option === SignOption.DIGSIG && persnum) {
          // ========================================
          // Digital Signature dengan BSrE
          // QR sudah ada di template, tinggal hit BSrE dan build metadata
          // ========================================
          console.log(`[ND] Processing DIGSIG for naskah ${naskahId}, persnum: ${persnum}`);

          // 11a. Fetch NIK dan no_wa dari HR API via DigsigService
          console.log(`[ND] Step 11a - Fetching user data for persnum: ${persnum}`);
          const userData = await this.digsigService.getUserDataForBsre(persnum.toString());
          console.log(`[ND] Step 11a - Got userData:`, { nik: userData.nik, no_wa: userData.no_wa });

          // 11b. Upload PDF (dengan QR) ke temp untuk BSrE signing
          console.log(`[ND] Step 11b - Uploading temp PDF for BSrE`);
          const tempTimestamp = Date.now();
          const tempFileName = `temp-${naskahId}-${tempTimestamp}.pdf`;
          const tempUpload = await this.storageService.uploadBuffer(
            pdfBuffer,
            tempFileName,
            'application/pdf',
            'nota-dinas/temp',
          );
          console.log(`[ND] Step 11b - Temp PDF uploaded: ${tempUpload.key}`);

          // 11c. Hit BSrE API untuk digital signature
          console.log(`[ND] Step 11c - Hitting BSrE API`);
          const bsreResponse = await this.digsigService.hitDigsigEndpoint({
            key: tempUpload.key,
            filename: tempFileName,
            nomorDokumen: nomorSurat,
            tanggalDokumen: this.formatDateToString(tanggalHariIni),
            klasifikasi: dto.klasifikasi || 'Biasa',
            jenisNaskah: 'Nota Dinas',
            perihal: dto.perihal,
            nik: userData.nik,
            passphrase: dto.passphrase!,
            path_dokumen: 'nota-dinas/digsig/',
            no_wa: userData.no_wa,
          }, {
            // Log context untuk auto-logging
            userPersnum: persnum,
            userName: signerName,
            idNaskah: naskahId,
            jenisNaskah: 'ND',
          });
          console.log(`[ND] Step 11c - BSrE response:`, JSON.stringify(bsreResponse, null, 2));

          // 11d. Extract name_doc from BSrE response (krusial untuk verifikasi)
          bsreNameDoc = bsreResponse?.name_doc?.[0] || bsreResponse?.data?.name_doc?.[0] || null;
          console.log(`[ND] Step 11d - BSrE name_doc: ${bsreNameDoc}`);

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
          console.log(`[ND] Step 11e - Signature metadata built`);

          // 11f. Cleanup temp file
          try {
            await this.storageService.deleteFile(tempUpload.key);
          } catch (e) {
            console.warn(`[ND] Failed to cleanup temp file: ${e.message}`);
          }

          // 11g. Download signed PDF from digsig/ and upload to final/
          if (bsreNameDoc) {
            console.log(`[ND] Step 11g - Downloading signed PDF from digsig/`);
            const digsigPath = `nota-dinas/digsig/${bsreNameDoc}`;
            try {
              const signedPdfBuffer = await this.storageService.getFile(digsigPath);
              console.log(`[ND] Step 11g - Signed PDF downloaded, size: ${signedPdfBuffer.length} bytes`);
              // Replace pdfBuffer with signed version
              pdfBuffer = signedPdfBuffer;
            } catch (e) {
              console.warn(`[ND] Failed to download signed PDF from digsig/, will use original: ${e.message}`);
            }
          }

        } else if (dto.sign_option === SignOption.QR_ONLY) {
          // ========================================
          // QR Code tanpa Digital Signature
          // QR sudah ada di template, tidak perlu BSrE, tidak ada metadata
          // ========================================
          console.log(`[ND] QR_ONLY mode - QR already in template, no BSrE signing needed`);
          // signatureMetadata tetap null
        }
        // OPTION 3: NONE - tidak ada QR, tidak ada perubahan

        // PHASE 12: Upload final PDF
        const finalTimestamp = Date.now();
        const pdfFileName = `ND-${nomorSurat.replace(/\//g, '-')}-${finalTimestamp}.pdf`;
        const uploadResult = await this.storageService.uploadBuffer(
          pdfBuffer,
          pdfFileName,
          'application/pdf',
          'nota-dinas/final',
        );

        finalPdfPath = uploadResult.key;

        // Update naskah with final_pdf path
        await queryRunner.manager.update(
          NaskahEntity,
          { id: naskahId },
          { final_pdf: finalPdfPath },
        );

        // Update nd with tanda_tangan metadata (if digsig)
        if (signatureMetadata) {
          // Update path in metadata
          const metadataObj = JSON.parse(signatureMetadata);
          metadataObj.path = finalPdfPath;
          signatureMetadata = JSON.stringify(metadataObj);

          await queryRunner.manager.update(
            NdEntity,
            { id: ndEntity.id },
            { tandaTangan: signatureMetadata },
          );
        }

      } catch (error) {
        console.error('[ND] Error during PDF generation/signing:', error);
        // CRITICAL: Throw error jika signing gagal - jangan simpan naskah tanpa signature
        throw new BadRequestException(
          `Gagal proses PDF/signing: ${error.message || 'Unknown error'}`
        );
      }

      // Commit transaction
      await queryRunner.commitTransaction();

      // Build response - match SDI format
      const lampiranTextResponse = lampiranFileNames.length > 0 
        ? lampiranFileNames.join(', ') 
        : (dto.lampiran || undefined);

      return {
        success: true,
        data: {
          id: naskahId,
          jenis: 'ND',
          nomor: nomorSurat,
          tanggal: this.formatDateToString(tanggalHariIni),
          status: status,
          perihal: dto.perihal,
          pengirim: this.toSirkulasiInfo(pengirim),
          penerima: penerimaResponses,
          tembusan: tembusanResponses,
          lampiran: lampiranTextResponse,
          final_pdf: finalPdfPath,
          // Additional fields untuk digsig (match SDI response)
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
   * 
   * Digital Signature Options:
   * - sign_option: 'digsig' | 'qr_only' | 'none'
   * - passphrase: BSrE passphrase (required if sign_option = 'digsig')
   * 
   * @param naskahId - UUID of naskah
   * @param dto - FinalizeDraftDto with sign_option and passphrase
   * @param persnum - Persnum user untuk BSrE signing (required if sign_option = 'digsig')
   */
  async finalizeDraft(
    naskahId: string,
    dto: FinalizeDraftDto,
    persnum?: number,
  ): Promise<SendMessageResponseDto> {
    // Validate sign_option + passphrase combination
    if (dto.sign_option === SignOption.DIGSIG) {
      if (!persnum) {
        throw new BadRequestException('Persnum diperlukan untuk Digital Signature (BSrE). Pastikan Anda sudah login.');
      }
      if (!dto.passphrase) {
        throw new BadRequestException('Passphrase diperlukan untuk Digital Signature (BSrE).');
      }
    }

    console.log('[ND finalizeDraft] Input:', {
      naskahId,
      sign_option: dto.sign_option,
      persnum: persnum,
      hasPassphrase: !!dto.passphrase,
    });

    // PHASE 1: Get existing naskah
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
        `Naskah sudah berstatus ${naskah.status}, tidak dapat difinalize`,
      );
    }

    if (naskah.jenis !== 'ND') {
      throw new BadRequestException(`Naskah bukan Nota Dinas (ND)`);
    }

    // Use provided date or today for org_data lookup
    const tanggal = dto.tgl ?? new Date().toISOString().split('T')[0];

    // PHASE 2: Get org_data if we need to update sirkulasi
    let barisData: OrgDataPositionDto[] = [];
    if (
      dto.pengirim !== undefined ||
      dto.penerima !== undefined ||
      dto.tembusan !== undefined
    ) {
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
      pengirimPosition = barisData.find(
        (x) => Number(x.position) === Number(dto.pengirim),
      );
      if (!pengirimPosition) {
        throw new NotFoundException(
          `Pengirim dengan positionId ${dto.pengirim} tidak ditemukan dalam org_data`,
        );
      }
      if (pengirimPosition.chief !== 1) {
        throw new ForbiddenException(
          `Position ${dto.pengirim} bukan managerial (chief). Hanya managerial yang dapat mengirim ND.`,
        );
      }
    } else {
      // Get existing pengirim from sirkulasi
      const existingPengirim = await this.naskahSirkulasiRepository.findOne({
        where: { idNaskah: naskahId, sirkuler: 'pengirim' },
      });
      if (!existingPengirim) {
        throw new NotFoundException(
          `Data pengirim tidak ditemukan untuk naskah ${naskahId}`,
        );
      }
      // Get full data from org_data
      if (barisData.length === 0) {
        const orgData = await this.orgDataService.findOrg(tanggal);
        if (orgData?.position_json) {
          barisData = orgData.position_json;
        }
      }
      pengirimPosition = barisData.find(
        (x) => Number(x.position) === Number(existingPengirim.position),
      );
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

    // PHASE 4: Generate nomor surat resmi dengan integrasi
    const klasifikasi = dto.klasifikasi ?? naskah.klasifikasi ?? '';
    const perihal = dto.perihal ?? naskah.perihal ?? '';

    // We'll generate nomor inside transaction, so we keep this placeholder
    let nomorSurat = '';

    // PHASE 5: Determine new status based on sign_option
    let newStatus: 'final' | 'final_tte' | 'draf';
    if (dto.sign_option === SignOption.DIGSIG) {
      newStatus = 'final_tte'; // Digital signature dengan BSrE
      console.log('[ND finalizeDraft] Status = final_tte (DIGSIG)');
    } else if (dto.sign_option === SignOption.QR_ONLY) {
      newStatus = 'final_tte'; // QR code tanpa BSrE
      console.log('[ND finalizeDraft] Status = final_tte (QR_ONLY)');
    } else if (dto.tanda_tangan) {
      newStatus = 'final_tte'; // Legacy: tanda_tangan field provided
      console.log('[ND finalizeDraft] Status = final_tte (tanda_tangan)');
    } else {
      newStatus = 'final'; // No signature
      console.log('[ND finalizeDraft] Status = final (no signature)');
    }

    // Variables for signing result (need to be accessible in response)
    let finalPdfPathResult: string | undefined = undefined;
    let bsreNameDocResult: string | null = null;

    // Start transaction
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // PHASE 6A: Generate nomor surat resmi dengan integrasi (inside transaction)
      if (!pengirimPosition) {
        throw new BadRequestException('Data pengirim tidak lengkap');
      }

      nomorSurat = await this.generateNomorWithIntegration(
        pengirimPosition,
        klasifikasi,
        perihal,
        // Use dto.tgl if provided, else use naskah's existing date, else today
        dto.tgl ? this.parseDateString(dto.tgl) : (naskah.tanggal instanceof Date ? naskah.tanggal : new Date()),
        queryRunner,
      );

      // PHASE 6B: Update naskah table (all fields + finalization fields)
      const naskahUpdateData: Partial<NaskahEntity> = {
        nomor: nomorSurat,
        status: newStatus,
      };
      if (dto.klasifikasi !== undefined)
        naskahUpdateData.klasifikasi = dto.klasifikasi;
      if (dto.klasifikasi_text !== undefined)
        naskahUpdateData.klasifikasi_text = dto.klasifikasi_text;
      if (dto.sifat !== undefined) naskahUpdateData.sifat = dto.sifat;
      if (dto.perihal !== undefined) naskahUpdateData.perihal = dto.perihal;
      if (dto.konten !== undefined) naskahUpdateData.konten = dto.konten;
      if (dto.nama_tempat !== undefined)
        naskahUpdateData.tempat = dto.nama_tempat;
      if (dto.lampiran !== undefined) naskahUpdateData.lampiran = dto.lampiran;
      if (dto.final_pdf !== undefined)
        naskahUpdateData.final_pdf = dto.final_pdf;
      if (dto.english !== undefined) naskahUpdateData.english = dto.english;

      await queryRunner.manager.update(
        NaskahEntity,
        { id: naskahId },
        naskahUpdateData,
      );

      // PHASE 7: Update nd table
      const ndUpdateData: Partial<NdEntity> = {
        nomor: nomorSurat,
      };
      if (dto.kop_logo !== undefined) ndUpdateData.kopLogo = dto.kop_logo;
      if (dto.kop_nama !== undefined) ndUpdateData.kopNama = dto.kop_nama;
      if (dto.alamat_perusahaan !== undefined)
        ndUpdateData.alamatPerusahaan = dto.alamat_perusahaan;
      if (dto.perihal !== undefined) ndUpdateData.perihal = dto.perihal;
      if (dto.konten !== undefined) ndUpdateData.konten = dto.konten;
      if (dto.nama_tempat !== undefined)
        ndUpdateData.namaTempat = dto.nama_tempat;
      if (dto.nama_jabatan !== undefined)
        ndUpdateData.namaJabatan = dto.nama_jabatan;
      if (dto.nama_lengkap !== undefined)
        ndUpdateData.namaLengkap = dto.nama_lengkap;

      await queryRunner.manager.update(
        NdEntity,
        { idNaskah: naskahId },
        ndUpdateData,
      );

      // PHASE 8: Handle sirkulasi update if any sirkulasi field is provided
      if (
        dto.pengirim !== undefined ||
        dto.penerima !== undefined ||
        dto.tembusan !== undefined
      ) {
        // Validate penerima
        let penerimaList: OrgDataPositionDto[] = [];
        if (dto.penerima !== undefined) {
          for (const posId of dto.penerima) {
            const penerima = barisData.find(
              (x) => Number(x.position) === Number(posId),
            );
            if (!penerima) {
              throw new NotFoundException(
                `Penerima dengan positionId ${posId} tidak ditemukan dalam org_data`,
              );
            }
            if (penerima.chief !== 1) {
              throw new ForbiddenException(
                `Penerima ${penerima.position_text} (${posId}) bukan managerial (chief). Nota Dinas hanya dapat dikirim ke managerial.`,
              );
            }
            penerimaList.push(penerima);
          }
        } else {
          // Get existing penerima from sirkulasi
          const existingPenerima = await queryRunner.manager.find(
            NaskahSirkulasi,
            {
              where: { idNaskah: naskahId, sirkuler: 'penerima' },
            },
          );
          for (const ep of existingPenerima) {
            const pos = barisData.find(
              (x) => String(x.position) === ep.position,
            );
            if (pos) penerimaList.push(pos);
          }
        }

        // Validate tembusan
        let tembusanList: OrgDataPositionDto[] = [];
        if (dto.tembusan !== undefined && dto.tembusan.length > 0) {
          for (const posId of dto.tembusan) {
            const tembusan = barisData.find(
              (x) => Number(x.position) === Number(posId),
            );
            if (!tembusan) {
              throw new NotFoundException(
                `Tembusan dengan positionId ${posId} tidak ditemukan dalam org_data`,
              );
            }
            if (tembusan.chief !== 1) {
              throw new ForbiddenException(
                `Tembusan ${tembusan.position_text} (${posId}) bukan managerial (chief). Tembusan ND hanya dapat dikirim ke managerial.`,
              );
            }
            tembusanList.push(tembusan);
          }
        }

        // Delete ALL sirkulasi for this naskah
        await queryRunner.manager.delete(NaskahSirkulasi, {
          idNaskah: naskahId,
        });

        // Get full pengirim position data if we only have partial
        let fullPengirimPosition: OrgDataPositionDto | undefined =
          pengirimPosition;
        if (dto.pengirim === undefined && barisData.length > 0) {
          fullPengirimPosition = barisData.find(
            (x) => Number(x.position) === Number(pengirimPosition?.position),
          );
        }

        // Re-insert pengirim with is_draft = FALSE (finalized!)
        if (fullPengirimPosition && fullPengirimPosition.position_text) {
          const pengirimSirkulasi = this.createSirkulasiFromOrgData(
            naskahId,
            'pengirim',
            fullPengirimPosition,
            false,
            0,
          );
          await queryRunner.manager.save(pengirimSirkulasi);

          // Update nd.dari
          await queryRunner.manager.update(
            NdEntity,
            { idNaskah: naskahId },
            {
              dari: `${fullPengirimPosition.position_text}`,
            },
          );
        }

        // Re-insert penerima with is_draft = FALSE and urutan
        for (let i = 0; i < penerimaList.length; i++) {
          const penerima = penerimaList[i];
          const penerimaSirkulasi = this.createSirkulasiFromOrgData(
            naskahId,
            'penerima',
            penerima,
            false,
            i,
          );
          await queryRunner.manager.save(penerimaSirkulasi);
        }

        // Update nd.kepadaYth
        const kepadaYthList = penerimaList.map(
          (p) => p.position_text,
        );
        await queryRunner.manager.update(
          NdEntity,
          { idNaskah: naskahId },
          { kepadaYth: kepadaYthList.join('; ') },
        );

        // Re-insert tembusan with is_draft = FALSE and urutan
        for (let i = 0; i < tembusanList.length; i++) {
          const tembusan = tembusanList[i];
          const tembusanSirkulasi = this.createSirkulasiFromOrgData(
            naskahId,
            'tembusan',
            tembusan,
            false,
            i,
          );
          await queryRunner.manager.save(tembusanSirkulasi);
        }

        // Update nd.tembusan
        if (tembusanList.length > 0) {
          const tembusanTextList = tembusanList.map(
            (t) => t.position_text,
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
        await queryRunner.manager.delete(NaskahLampiranEntity, {
          id_naskah: naskahId,
        });
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

      // Also handle lampiran_temp_ids if provided
      if (dto.lampiran_temp_ids && dto.lampiran_temp_ids.length > 0) {
        // Move temporary lampiran to final and save to DB
        await this.moveTemporaryLampiranToFinal(
          dto.lampiran_temp_ids,
          naskahId,
          'ND',
          'nota-dinas/lampiran',
        );
      }

      // PHASE 10: Auto-generate PDF with Digital Signature
      let finalPdfPath: string | undefined = undefined;
      let pdfBuffer: Buffer;
      let signatureMetadata: string | null = null;
      let bsreNameDoc: string | null = null;

      try {
        // Get the updated nd data for PDF generation
        const ndDataForPdf = await queryRunner.manager.findOne(NdEntity, {
          where: { idNaskah: naskahId },
        });

        // Get pengirim sirkulasi for fallback data
        const pengirimSirkulasiForPdf = await queryRunner.manager.findOne(NaskahSirkulasi, {
          where: { idNaskah: naskahId, sirkuler: 'pengirim' },
        });

        // Get penerima from sirkulasi (with proper urutan) for PDF
        const penerimaListForPdf = await queryRunner.manager.find(NaskahSirkulasi, {
          where: { idNaskah: naskahId, sirkuler: 'penerima' },
          order: { urutan: 'ASC', createdAt: 'ASC' },
        });
        const kepadaYthListForPdf = penerimaListForPdf.map(p => p.positionText || '');

        // Get tembusan from sirkulasi (with proper urutan) for PDF
        const tembusanListForPdf = await queryRunner.manager.find(NaskahSirkulasi, {
          where: { idNaskah: naskahId, sirkuler: 'tembusan' },
          order: { urutan: 'ASC', createdAt: 'ASC' },
        });
        const tembusanForPdfFinal = tembusanListForPdf.map(t => t.positionText || '');

        // Get lampiran files for merging
        const lampiranFilesForPdf = await queryRunner.manager.find(NaskahLampiranEntity, {
          where: { id_naskah: naskahId },
        });
        const lampiranTextForPdf = lampiranFilesForPdf.length > 0
          ? lampiranFilesForPdf.map(l => l.file_name).join(', ')
          : (dto.lampiran || naskah.lampiran || '-');

        // Get tanggal for PDF
        const tanggalHariIni = naskah.tanggal instanceof Date ? naskah.tanggal : new Date();

        // Resolve position text and nama
        const resolvedPositionText = dto.nama_jabatan || ndDataForPdf?.namaJabatan || pengirimPosition?.position_text || pengirimSirkulasiForPdf?.positionText || '';
        const resolvedNamaLengkap = dto.nama_lengkap || ndDataForPdf?.namaLengkap || pengirimPosition?.persnum_person_text || pengirimSirkulasiForPdf?.namaSirkuler || '';

        // Get dynamic header info dari sub_area_alamat berdasarkan pengirim context
        const tanggalStrForHeader = dto.tgl || (naskah.tanggal instanceof Date ? this.formatDateToString(naskah.tanggal) : String(naskah.tanggal).split('T')[0]);
        const headerInfo = await this.getHeaderInfoByUser(
          {
            company: pengirimPosition?.company ?? COMPANY_ID,
            area: pengirimPosition?.area ?? pengirimSirkulasiForPdf?.area ?? undefined,
            subArea: pengirimPosition?.sub_area != null ? String(pengirimPosition.sub_area) : (pengirimSirkulasiForPdf?.subArea ?? undefined),
          },
          tanggalStrForHeader,
        );

        // Use kota from headerInfo if available
        const dynamicNamaTempat = headerInfo?.kota || ndDataForPdf?.namaTempat || dto.nama_tempat || pengirimPosition?.sub_area_text || 'Tangerang';

        // ========================================
        // SIGNING: Prepare QR code SEBELUM generate PDF
        // ========================================
        const signerName = resolvedNamaLengkap || 'Penandatangan';
        const signerJabatan = resolvedPositionText || 'Jabatan';
        let qrCodeHtml: string | undefined = undefined;
        let signatureId: string | undefined = undefined;
        let signedAt: string | undefined = undefined;
        let verificationUrl: string | undefined = undefined;

        console.log(`[ND finalizeDraft] Phase 10 - Preparing signing, sign_option: ${dto.sign_option}, persnum: ${persnum}`);

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
            document_type: 'Nota Dinas',
            verification_url: dto.sign_option === SignOption.DIGSIG ? verificationUrl : undefined,
          };

          // Generate QR Code sebagai base64 HTML untuk template
          console.log(`[ND finalizeDraft] Generating QR Code HTML for template`);
          const qrBase64 = await this.qrCodeService.generateQRCodeBase64(qrData);
          qrCodeHtml = `<img src="${qrBase64}" style="width: 80px; height: 80px;" alt="QR Code" />`;
          console.log(`[ND finalizeDraft] QR Code HTML generated successfully`);
        }

        // Generate PDF dengan QR code di template (jika ada)
        console.log(`[ND finalizeDraft] Generating PDF with qrCodeHtml: ${qrCodeHtml ? 'YES' : 'NO'}`);
        pdfBuffer = await this.generatePdfNodinService.generatePdf({
          html: Buffer.from(ndDataForPdf?.konten || dto.konten || naskah.konten || '', 'utf-8').toString('base64'),
          penerima: kepadaYthListForPdf,
          dari: ndDataForPdf?.dari || pengirimPosition?.position_text || '',
          nama_tempat: dynamicNamaTempat,
          tanggal: tanggalHariIni.toLocaleDateString('id-ID', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          }),
          positionText: resolvedPositionText,
          namaLengkap: resolvedNamaLengkap,
          tembusan: tembusanForPdfFinal,
          perihal: ndDataForPdf?.perihal || dto.perihal || naskah.perihal || '',
          sifat: dto.sifat || naskah.sifat || 'Biasa',
          nomor: nomorSurat,
          lampiran: lampiranTextForPdf,
          headerKantor: headerInfo?.kantor,
          headerGedung: headerInfo?.gedung,
          headerAlamat: headerInfo?.alamat,
          // QR Code HTML - akan ditampilkan di template di antara jabatan dan nama
          qrCodeHtml: qrCodeHtml,
        });
        console.log(`[ND finalizeDraft] PDF generated successfully`);

        // Merge with lampiran if any
        if (lampiranFilesForPdf && lampiranFilesForPdf.length > 0) {
          const filesToMerge = lampiranFilesForPdf.map(l => ({
            id: l.id,
            fileName: l.file_name,
            filePath: l.file_pdf,
            tempFolderId: l.temp_folder_id,
          }));
          pdfBuffer = await this.mergePdfWithTemporaryFiles(pdfBuffer, filesToMerge);
          console.log('[ND finalizeDraft] Merged with', filesToMerge.length, 'lampiran files');
        }

        // ========================================
        // PHASE 11: Process BSrE signing (jika digsig)
        // ========================================
        if (dto.sign_option === SignOption.DIGSIG && persnum) {
          console.log(`[ND finalizeDraft] Processing DIGSIG for naskah ${naskahId}, persnum: ${persnum}`);

          // 11a. Fetch NIK dan no_wa dari HR API via DigsigService
          console.log(`[ND finalizeDraft] Step 11a - Fetching user data for persnum: ${persnum}`);
          const userData = await this.digsigService.getUserDataForBsre(persnum.toString());
          console.log(`[ND finalizeDraft] Step 11a - Got userData:`, { nik: userData.nik, no_wa: userData.no_wa });

          // 11b. Upload PDF (dengan QR) ke temp untuk BSrE signing
          console.log(`[ND finalizeDraft] Step 11b - Uploading temp PDF for BSrE`);
          const tempTimestamp = Date.now();
          const tempFileName = `temp-${naskahId}-${tempTimestamp}.pdf`;
          const tempUpload = await this.storageService.uploadBuffer(
            pdfBuffer,
            tempFileName,
            'application/pdf',
            'nota-dinas/temp',
          );
          console.log(`[ND finalizeDraft] Step 11b - Temp PDF uploaded: ${tempUpload.key}`);

          // 11c. Hit BSrE API untuk digital signature
          console.log(`[ND finalizeDraft] Step 11c - Hitting BSrE API`);
          const bsreResponse = await this.digsigService.hitDigsigEndpoint({
            key: tempUpload.key,
            filename: tempFileName,
            nomorDokumen: nomorSurat,
            tanggalDokumen: this.formatDateToString(tanggalHariIni),
            klasifikasi: dto.klasifikasi || naskah.klasifikasi || 'Biasa',
            jenisNaskah: 'Nota Dinas',
            perihal: dto.perihal || naskah.perihal || '',
            nik: userData.nik,
            passphrase: dto.passphrase!,
            path_dokumen: 'nota-dinas/digsig/',
            no_wa: userData.no_wa,
          }, {
            userPersnum: persnum,
            userName: signerName,
            idNaskah: naskahId,
            jenisNaskah: 'ND',
          });
          console.log(`[ND finalizeDraft] Step 11c - BSrE response:`, JSON.stringify(bsreResponse, null, 2));

          // 11d. Extract name_doc from BSrE response (krusial untuk verifikasi)
          bsreNameDoc = bsreResponse?.name_doc?.[0] || bsreResponse?.data?.name_doc?.[0] || null;
          console.log(`[ND finalizeDraft] Step 11d - BSrE name_doc: ${bsreNameDoc}`);

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
          console.log(`[ND finalizeDraft] Step 11e - Signature metadata built`);

          // 11f. Cleanup temp file
          try {
            await this.storageService.deleteFile(tempUpload.key);
          } catch (e) {
            console.warn(`[ND finalizeDraft] Failed to cleanup temp file: ${e.message}`);
          }

          // 11g. Download signed PDF from digsig/ and upload to final/
          if (bsreNameDoc) {
            console.log(`[ND finalizeDraft] Step 11g - Downloading signed PDF from digsig/`);
            const digsigPath = `nota-dinas/digsig/${bsreNameDoc}`;
            try {
              const signedPdfBuffer = await this.storageService.getFile(digsigPath);
              console.log(`[ND finalizeDraft] Step 11g - Signed PDF downloaded, size: ${signedPdfBuffer.length} bytes`);
              // Replace pdfBuffer with signed version
              pdfBuffer = signedPdfBuffer;
            } catch (e) {
              console.warn(`[ND finalizeDraft] Failed to download signed PDF from digsig/, will use original: ${e.message}`);
            }
          }

        } else if (dto.sign_option === SignOption.QR_ONLY) {
          // ========================================
          // QR Code tanpa Digital Signature
          // QR sudah ada di template, tidak perlu BSrE, tidak ada metadata
          // ========================================
          console.log(`[ND finalizeDraft] QR_ONLY mode - QR already in template, no BSrE signing needed`);
          // signatureMetadata tetap null
        }
        // OPTION 3: NONE - tidak ada QR, tidak ada perubahan

        // PHASE 12: Upload final PDF
        const timestamp = Date.now();
        const pdfFileName = `ND-${nomorSurat.replace(/\//g, '-')}-${timestamp}.pdf`;
        const uploadResult = await this.storageService.uploadBuffer(
          pdfBuffer,
          pdfFileName,
          'application/pdf',
          'nota-dinas/final',
        );

        finalPdfPath = uploadResult.key;
        // Store to outer scope for response
        finalPdfPathResult = finalPdfPath;
        bsreNameDocResult = bsreNameDoc;

        // Update naskah with final_pdf path
        await queryRunner.manager.update(
          NaskahEntity,
          { id: naskahId },
          { final_pdf: finalPdfPath },
        );

        // Update nd with tanda_tangan metadata (if digsig)
        if (signatureMetadata) {
          // Update path in metadata
          const metadataObj = JSON.parse(signatureMetadata);
          metadataObj.path = finalPdfPath;
          signatureMetadata = JSON.stringify(metadataObj);

          await queryRunner.manager.update(
            NdEntity,
            { idNaskah: naskahId },
            { tandaTangan: signatureMetadata },
          );
        }

        console.log('[ND finalizeDraft] PDF auto-generated:', finalPdfPath);
      } catch (error) {
        console.error('[ND finalizeDraft] Failed to auto-generate PDF:', error);
        // CRITICAL: Throw error jika signing gagal - jangan simpan naskah tanpa signature
        throw new BadRequestException(
          `Gagal proses PDF/signing: ${error.message || 'Unknown error'}`
        );
      }

      // Commit transaction
      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }

    // PHASE 13: Get updated data for response
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

    let tanggalStr = '';
    if (updatedNaskah?.tanggal) {
      if (updatedNaskah.tanggal instanceof Date) {
        tanggalStr = this.formatDateToString(updatedNaskah.tanggal);
      } else {
        tanggalStr = String(updatedNaskah.tanggal).split('T')[0];
      }
    }

    //kirim tte jika fe request tte
    // const filename = "nodin.pdf"; // final
    // const keypathfile = dto.final_pdf as string;
    // const digsig = await this.digsigService.hitDigsigEndpoint({
    //   key: keypathfile,
    //   filename: filename,
    //   nomorDokumen: nomorSurat,
    //   tanggalDokumen: tanggalStr,
    //   klasifikasi: 'Biasa',
    //   jenisNaskah: 'Nota Dinas',
    //   perihal: dto.perihal as string,
    //   nik: '1234567890123452',
    //   passphrase: 'Bsre2025.#!',
    //   path_dokumen: 'nota-dinas/digsig/',
    //   no_wa: '',
    // });

    // Get lampiran for response
    const lampiranData = await this.naskahLampiranRepository.find({
      where: { id_naskah: naskahId },
    });
    const lampiranTextResponse = lampiranData.length > 0
      ? lampiranData.map(l => l.file_name).join(', ')
      : (updatedNaskah?.lampiran || undefined);

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
        lampiran: lampiranTextResponse,
        final_pdf: finalPdfPathResult || updatedNaskah?.final_pdf,
        // Additional fields untuk digsig (match send-message response)
        sign_option: dto.sign_option,
        bsre_name_doc: bsreNameDocResult,
      } as any,
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
      throw new NotFoundException(
        `Naskah dengan id ${naskahId} tidak ditemukan`,
      );
    }

    if (naskah.status !== 'draf') {
      throw new BadRequestException(
        `Naskah sudah berstatus ${naskah.status}, tidak dapat diupdate sebagai draft`,
      );
    }

    if (naskah.jenis !== 'ND') {
      throw new BadRequestException(`Naskah bukan Nota Dinas (ND)`);
    }

    // Use provided date or today for org_data lookup
    const tanggal = dto.tgl ?? new Date().toISOString().split('T')[0];

    // PHASE 2: Get org_data if we need to update sirkulasi
    let barisData: OrgDataPositionDto[] = [];
    if (
      dto.pengirim !== undefined ||
      dto.penerima !== undefined ||
      dto.tembusan !== undefined
    ) {
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
      if (dto.klasifikasi !== undefined)
        naskahUpdateData.klasifikasi = dto.klasifikasi;
      if (dto.klasifikasi_text !== undefined)
        naskahUpdateData.klasifikasi_text = dto.klasifikasi_text;
      if (dto.sifat !== undefined) naskahUpdateData.sifat = dto.sifat;
      if (dto.perihal !== undefined) naskahUpdateData.perihal = dto.perihal;
      if (dto.konten !== undefined) naskahUpdateData.konten = dto.konten;
      if (dto.nama_tempat !== undefined)
        naskahUpdateData.tempat = dto.nama_tempat;
      if (dto.lampiran !== undefined) naskahUpdateData.lampiran = dto.lampiran;
      if (dto.final_pdf !== undefined)
        naskahUpdateData.final_pdf = dto.final_pdf;
      if (dto.english !== undefined) naskahUpdateData.english = dto.english;

      if (Object.keys(naskahUpdateData).length > 0) {
        await queryRunner.manager.update(
          NaskahEntity,
          { id: naskahId },
          naskahUpdateData,
        );
      }

      // PHASE 4: Update nd table (only fields that are provided)
      const ndUpdateData: Partial<NdEntity> = {};
      if (dto.kop_logo !== undefined) ndUpdateData.kopLogo = dto.kop_logo;
      if (dto.kop_nama !== undefined) ndUpdateData.kopNama = dto.kop_nama;
      if (dto.alamat_perusahaan !== undefined)
        ndUpdateData.alamatPerusahaan = dto.alamat_perusahaan;
      if (dto.perihal !== undefined) ndUpdateData.perihal = dto.perihal;
      if (dto.konten !== undefined) ndUpdateData.konten = dto.konten;
      if (dto.nama_tempat !== undefined)
        ndUpdateData.namaTempat = dto.nama_tempat;
      if (dto.nama_jabatan !== undefined)
        ndUpdateData.namaJabatan = dto.nama_jabatan;
      if (dto.tanda_tangan !== undefined)
        ndUpdateData.tandaTangan = dto.tanda_tangan;
      if (dto.nama_lengkap !== undefined)
        ndUpdateData.namaLengkap = dto.nama_lengkap;

      if (Object.keys(ndUpdateData).length > 0) {
        await queryRunner.manager.update(
          NdEntity,
          { idNaskah: naskahId },
          ndUpdateData,
        );
      }

      // PHASE 5: Handle sirkulasi - ALWAYS delete all and re-insert
      // pengirim & penerima: if not provided, use existing
      // tembusan: if not provided, will be removed (destroy all behavior)
      if (
        dto.pengirim !== undefined ||
        dto.penerima !== undefined ||
        dto.tembusan !== undefined
      ) {
        // Get existing pengirim for fallback if not provided in dto
        let pengirimPosition: OrgDataPositionDto | undefined;
        if (dto.pengirim !== undefined) {
          pengirimPosition = barisData.find(
            (x) => Number(x.position) === Number(dto.pengirim),
          );
          if (!pengirimPosition) {
            throw new NotFoundException(
              `Pengirim dengan positionId ${dto.pengirim} tidak ditemukan dalam org_data`,
            );
          }
          if (pengirimPosition.chief !== 1) {
            throw new ForbiddenException(
              `Position ${dto.pengirim} bukan managerial (chief). Hanya managerial yang dapat mengirim ND.`,
            );
          }
        } else {
          // Get existing pengirim from sirkulasi
          const existingPengirim = await queryRunner.manager.findOne(
            NaskahSirkulasi,
            {
              where: { idNaskah: naskahId, sirkuler: 'pengirim' },
            },
          );
          if (existingPengirim) {
            pengirimPosition = barisData.find(
              (x) => String(x.position) === existingPengirim.position,
            );
          }
        }

        // Validate penerima
        let penerimaList: OrgDataPositionDto[] = [];
        if (dto.penerima !== undefined) {
          for (const posId of dto.penerima) {
            const penerima = barisData.find(
              (x) => Number(x.position) === Number(posId),
            );
            if (!penerima) {
              throw new NotFoundException(
                `Penerima dengan positionId ${posId} tidak ditemukan dalam org_data`,
              );
            }

            // Check if penerima is managerial
            if (penerima.chief !== 1) {
              throw new ForbiddenException(
                `Penerima ${penerima.position_text} (${posId}) bukan managerial (chief). Nota Dinas hanya dapat dikirim ke managerial.`,
              );
            }

            penerimaList.push(penerima);
          }
        } else {
          // Get existing penerima from sirkulasi
          const existingPenerima = await queryRunner.manager.find(
            NaskahSirkulasi,
            {
              where: { idNaskah: naskahId, sirkuler: 'penerima' },
            },
          );
          for (const ep of existingPenerima) {
            const pos = barisData.find(
              (x) => String(x.position) === ep.position,
            );
            if (pos) penerimaList.push(pos);
          }
        }

        // Validate tembusan - if not provided, tembusan will be EMPTY (destroyed)
        let tembusanList: OrgDataPositionDto[] = [];
        if (dto.tembusan !== undefined && dto.tembusan.length > 0) {
          for (const posId of dto.tembusan) {
            const tembusan = barisData.find(
              (x) => Number(x.position) === Number(posId),
            );
            if (!tembusan) {
              throw new NotFoundException(
                `Tembusan dengan positionId ${posId} tidak ditemukan dalam org_data`,
              );
            }

            // Check if tembusan is managerial
            if (tembusan.chief !== 1) {
              throw new ForbiddenException(
                `Tembusan ${tembusan.position_text} (${posId}) bukan managerial (chief). Tembusan ND hanya dapat dikirim ke managerial.`,
              );
            }

            tembusanList.push(tembusan);
          }
        }
        // If dto.tembusan is undefined or empty array, tembusanList stays empty = no tembusan

        // Delete ALL sirkulasi for this naskah
        await queryRunner.manager.delete(NaskahSirkulasi, {
          idNaskah: naskahId,
        });

        // Re-insert pengirim with is_draft = true
        if (pengirimPosition) {
          const pengirimSirkulasi = this.createSirkulasiFromOrgData(
            naskahId,
            'pengirim',
            pengirimPosition,
            true,
            0,
          );
          await queryRunner.manager.save(pengirimSirkulasi);

          // Update nd.dari if pengirim changed
          if (dto.pengirim !== undefined) {
            await queryRunner.manager.update(
              NdEntity,
              { idNaskah: naskahId },
              {
                dari: `${pengirimPosition.position_text}`,
              },
            );
          }
        }

        // Re-insert penerima with is_draft = true and urutan
        for (let i = 0; i < penerimaList.length; i++) {
          const penerima = penerimaList[i];
          const penerimaSirkulasi = this.createSirkulasiFromOrgData(
            naskahId,
            'penerima',
            penerima,
            true,
            i,
          );
          await queryRunner.manager.save(penerimaSirkulasi);
        }

        // Update nd.kepadaYth
        const kepadaYthList = penerimaList.map(
          (p) => p.position_text,
        );
        await queryRunner.manager.update(
          NdEntity,
          { idNaskah: naskahId },
          { kepadaYth: kepadaYthList.join('; ') },
        );

        // Re-insert tembusan with is_draft = true and urutan (only if there are any)
        for (let i = 0; i < tembusanList.length; i++) {
          const tembusan = tembusanList[i];
          const tembusanSirkulasi = this.createSirkulasiFromOrgData(
            naskahId,
            'tembusan',
            tembusan,
            true,
            i,
          );
          await queryRunner.manager.save(tembusanSirkulasi);
        }

        // Update nd.tembusan
        if (tembusanList.length > 0) {
          const tembusanTextList = tembusanList.map(
            (t) => t.position_text,
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
        await queryRunner.manager.delete(NaskahLampiranEntity, {
          id_naskah: naskahId,
        });

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

      // PHASE 6b: Handle lampiran_temp_ids - move temporary lampiran to final
      if (dto.lampiran_temp_ids && dto.lampiran_temp_ids.length > 0) {
        await this.moveTemporaryLampiranToFinal(
          dto.lampiran_temp_ids,
          naskahId,
          'ND',
          'nota-dinas/lampiran',
        );
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
      order: { urutan: 'ASC', createdAt: 'ASC' },
    });

    const pengirimData = allSirkulasi.find((s) => s.sirkuler === 'pengirim');
    const penerimaData = allSirkulasi.filter((s) => s.sirkuler === 'penerima');
    const tembusanData = allSirkulasi.filter((s) => s.sirkuler === 'tembusan');

    // Get lampiran files for response
    const lampiranData = await this.naskahLampiranRepository.find({
      where: { id_naskah: naskahId },
    });

    const lampiranFiles = lampiranData.map((lamp) => ({
      id: lamp.id,
      fileName: lamp.file_name,
      filePath: lamp.file_pdf,
      fileUrl: this.storageService.getPublicUrl(lamp.file_pdf),
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
        jenis: 'ND',
        nomor: updatedNaskah?.nomor || '',
        tanggal: tanggalStr,
        status: 'draf',
        perihal: updatedNaskah?.perihal || '',
        pengirim: this.sirkulasiToInfo(pengirimData),
        penerima: penerimaData.map((s) => this.sirkulasiToInfo(s)),
        tembusan: tembusanData.map((s) => this.sirkulasiToInfo(s)),
        lampiran_files: lampiranFiles,
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
  async getDraftList(
    positionId: number,
    tgl?: string,
  ): Promise<GetSendMessageResponseDto> {
    // Get org_data to validate position exists
    const tanggal = tgl ?? new Date().toISOString().split('T')[0];
    const orgData = await this.orgDataService.findOrg(tanggal);

    if (!orgData || !orgData.position_json) {
      throw new NotFoundException('Data organisasi tidak ditemukan');
    }

    const barisData: OrgDataPositionDto[] = orgData.position_json;

    // Find position by position ID
    const positionData = barisData.find(
      (pos: OrgDataPositionDto) => Number(pos.position) === Number(positionId),
    );

    if (!positionData) {
      throw new NotFoundException(
        `Position dengan id ${positionId} tidak ditemukan di org_data`,
      );
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

      // Build penerima info (no read status for draft)
      const penerimaInfoList: PenerimaInfoDto[] = penerimaList.map(
        (penerima) => ({
          persnum: parseInt(penerima.idSirkuler || '0', 10),
          nama: penerima.namaSirkuler || '',
          organizationText: penerima.organizationText || '',
          positionText: penerima.positionText || '',
          status: 'belum_dibaca' as const,
          readTime: null,
        }),
      );

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
      const tanggalStr =
        naskah.tanggal instanceof Date
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
  async getSendMessage(
    positionId: number,
    tgl?: string,
  ): Promise<GetSendMessageResponseDto> {
    // Get org_data to validate position exists
    const tanggal = tgl ?? new Date().toISOString().split('T')[0];
    const orgData = await this.orgDataService.findOrg(tanggal);

    if (!orgData || !orgData.position_json) {
      throw new NotFoundException('Data organisasi tidak ditemukan');
    }

    const barisData: OrgDataPositionDto[] = orgData.position_json;

    // Find position by position ID
    const positionData = barisData.find(
      (pos: OrgDataPositionDto) => Number(pos.position) === Number(positionId),
    );

    if (!positionData) {
      throw new NotFoundException(
        `Position dengan id ${positionId} tidak ditemukan di org_data`,
      );
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
      .andWhere('naskah.status IN (:...statuses)', {
        statuses: ['final', 'final_tte'],
      })
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
          readTime: penerima.sendReadTime
            ? penerima.sendReadTime.toISOString()
            : null,
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
      const tanggalStr =
        naskah.tanggal instanceof Date
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
  private filterByPositionNodin(
    barisData: OrgDataPositionDto[],
    positionParam: number,
  ): {
    ATASAN: OrgDataPositionDto[];
    REKAN: OrgDataPositionDto[];
    BAWAHAN: OrgDataPositionDto[];
  } {
    // Cari item current berdasarkan position
    const current = barisData.find(
      (x) => Number(x.position) === Number(positionParam),
    );
    if (!current) {
      return { ATASAN: [], REKAN: [], BAWAHAN: [] };
    }

    const currentLevel = Number(current.level);

    // Filter: chief=1, same sub_area
    const filtered = barisData.filter(
      (x) => x.chief === 1 && x.sub_area === current.sub_area,
    );

    // ATASAN: 1 level di atas, organization_id = current.organization_parent
    const parentLevel = filtered.filter(
      (x) =>
        x.level === currentLevel - 1 &&
        Number(x.organization_id) === Number(current.organization_parent),
    );

    const menparent = [positionParam];
    if (parentLevel.length > 0) {
      menparent.push(parentLevel[0].position);
    }
    const menparentSet = new Set(menparent.map(Number));

    // REKAN: same level, same organization_parent (satu induk), bukan dirinya
    const bodTag = current.bod_tag;
    const bods = ['BOD', 'BOD-1'];
    const isBod = bodTag && bods.includes(bodTag);

    const rekans: OrgDataPositionDto[] = filtered.filter((x) => {
      const pos = Number(x.position);
      if (isBod) {
        return bods.includes(x.bod_tag as string) && !menparentSet.has(pos);
      }

      return (
        x.bod_tag === bodTag &&
        x.divisi_id === current.divisi_id &&
        Number(x.position) !== Number(positionParam)
      );
    });

    const sameLevel = filtered.filter(
      (x) =>
        x.level === currentLevel &&
        Number(x.organization_parent) === Number(current.organization_parent) &&
        Number(x.position) !== Number(positionParam),
    );

    // BAWAHAN: 1 level di bawah, organization_parent = current.organization_id
    const potentialBawahan = filtered.filter(
      (x) => x.level === currentLevel + 1,
    );

    const downLevel = potentialBawahan.filter(
      (x) => x.organization_parent == current.organization_id,
    );

    return {
      ATASAN: parentLevel,
      // REKAN: sameLevel,
      REKAN: rekans,
      // BAWAHAN: downLevel,
      BAWAHAN: [],
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

    // Get cached org data from org_data service
    const orgData = await this.orgDataService.findOrg(tanggal);

    if (!orgData || !orgData.position_json) {
      throw new NotFoundException(
        `Data organisasi untuk tanggal ${tanggal} tidak ditemukan. Silakan generate data org terlebih dahulu via GET /org-data?tgl=${tanggal}`,
      );
    }

    const barisData: OrgDataPositionDto[] = orgData.position_json;

    // Find sender's position data
    const sender = barisData.find(
      (x) => Number(x.position) === Number(positionId),
    );

    if (!sender) {
      throw new NotFoundException(
        `Position dengan ID ${positionId} tidak ditemukan dalam data organisasi tanggal ${tanggal}`,
      );
    }

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
   * Helper: Get abbreviation dari org_data berdasarkan position_id
   */
  private async getPositionAbbreviation(positionId: string): Promise<string> {
    try {
      if (!positionId) {
        return '';
      }

      // Fallback: try to find from organization_build position_json
      // position_json struktur: [{ position, position_text, position_abbreviation, ... }]
      const orgBuild = await this.dataSource
        .getRepository('organization_build')
        .createQueryBuilder('org_build')
        .orderBy('org_build.tgl', 'DESC')
        .limit(1)
        .getOne();

      if (!orgBuild || !orgBuild.position_json) {
        return '';
      }

      const positionJson =
        typeof orgBuild.position_json === 'string'
          ? JSON.parse(orgBuild.position_json)
          : orgBuild.position_json;

      if (Array.isArray(positionJson)) {
        const pos = positionJson.find(
          (p: any) => String(p.position) === String(positionId),
        );
        if (pos) {
          // position_json uses position_abbreviation field name
          return pos.position_abbreviation || pos.abbreviation || '';
        }
      }

      return '';
    } catch (error) {
      return '';
    }
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

      const positionJson: OrgDataPositionDto[] = orgData.position_json;
      
      const pos = positionJson.find(
        (p) => String(p.position) === String(positionId),
      );
      
      if (pos) {
        // Use persnum_person_text as primary source for person name
        return pos.persnum_person_text || '';
      }

      return '';
    } catch (error) {
      return '';
    }
  }

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
      throw new NotFoundException(
        `Naskah dengan id ${naskahId} tidak ditemukan`,
      );
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
    const tanggalStr =
      naskah.tanggal instanceof Date
        ? naskah.tanggal.toISOString().split('T')[0]
        : String(naskah.tanggal || '').split('T')[0];

    // Build penerima info with read status
    const penerimaInfoList = await Promise.all(
      penerimaList.map(async (penerima) => ({
        id: penerima.id,
        persnum: parseInt(penerima.idSirkuler || '0', 10),
        nama: penerima.namaSirkuler || '',
        position_id: penerima.position || '',
        abbreviation: await this.getPositionAbbreviation(
          penerima.position || '',
        ),
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

    // Build tembusan info
    const tembusanInfoList = await Promise.all(
      tembusanList.map(async (tembusan) => ({
        id: tembusan.id,
        persnum: parseInt(tembusan.idSirkuler || '0', 10),
        nama: tembusan.namaSirkuler || '',
        position_id: tembusan.position || '',
        abbreviation: await this.getPositionAbbreviation(
          tembusan.position || '',
        ),
        position_status: tembusan.positionStatus || '',
        positionText: tembusan.positionText || '',
        organizationText: tembusan.organizationText || '',
        subAreaText: tembusan.subAreaText || '',
        areaText: tembusan.areaText || '',
      })),
    );

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
          persnum: pengirimSirkulasi
            ? parseInt(pengirimSirkulasi.idSirkuler || '0', 10)
            : 0,
          nama: pengirimSirkulasi?.namaSirkuler || '',
          position_id: pengirimSirkulasi?.position || '',
          abbreviation: pengirimSirkulasi?.position
            ? await this.getPositionAbbreviation(pengirimSirkulasi.position)
            : '',
          position_status: pengirimSirkulasi?.positionStatus || '',
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
        final_pdf_url: finalPdfUrl,

        // Metadata
        created_at: null,
        updated_at: null,
      },
    };
  }

  async getSenderKonsep(
    positionId: number,
    tgl?: string,
  ): Promise<OrgDataPositionDto[]> {
    const tanggal = tgl ?? new Date().toISOString().split('T')[0];

    // Get cached org data from org_data service
    const orgData = await this.orgDataService.findOrg(tanggal);

    if (!orgData || !orgData.position_json) {
      throw new NotFoundException(
        `Data organisasi untuk tanggal ${tanggal} tidak ditemukan. Silakan generate data org terlebih dahulu via GET /org-data?tgl=${tanggal}`,
      );
    }

    const data: OrgDataPositionDto[] = orgData.position_json;

    const result: OrgDataPositionDto[] = [];
    const added = new Set<number>(); // penanda duplicate

    // helper push aman
    const pushUnique = (item?: OrgDataPositionDto) => {
      if (!item) return;
      const key = Number(item.position);
      if (added.has(key)) return;
      added.add(key);
      result.push(item);
    };

    // cari posisi awal
    let current = data.find((x) => Number(x.position) === Number(positionId));
    if (!current) return result;

    // kalau bukan chief → ambil chiefs
    if (current.chief === 0) {
      const chiefs = data.filter(
        (x) =>
          Number(x.divisi_id) === Number(current!.divisi_id) && x.chief === 1,
      );

      chiefs.forEach(pushUnique);

      current = chiefs.find((x) => x.bod_tag === 'BOD-1');
    }

    // loop ke atas sampai parent tertinggi
    while (current) {
      pushUnique(current);

      const parent = data.find(
        (x) =>
          Number(x.organization_id) === Number(current!.organization_parent) &&
          x.chief === 1,
      );

      if (!parent) break;
      current = parent;
    }

    // sort akhir
    result.sort((a, b) => Number(a.level) - Number(b.level));
    return result;
  }
}
